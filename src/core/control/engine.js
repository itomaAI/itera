// src/core/control/engine.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Control = global.Itera.Control || {};

	const Role = global.Itera.Role || {
		USER: 'user',
		MODEL: 'model',
		SYSTEM: 'system'
	};
	const Signal = global.Itera.Control.Signal;

	const TurnType = {
		USER_INPUT: 'user_input',
		MODEL_THOUGHT: 'model_thought',
		TOOL_EXECUTION: 'tool_execution',
		ERROR: 'error'
	};
	global.Itera.TurnType = TurnType;

	class Engine {
		constructor(state, projector, llm, translator, registry, extraContext = {}) {
			this.state = state;
			this.projector = projector;
			this.llm = llm;
			this.translator = translator;
			this.registry = registry;
			this.extraContext = extraContext;

			this.isRunning = false; // 現在思考中(ストリーミング中)かどうか
			this.abortController = null;
			this.listeners = {
				'turn_start': [],
				'stream_chunk': [],
				'turn_end': [],
				'loop_stop': []
			};

			this.debounceTimer = null;
			this.continuousToolCount = 0;
			this.MAX_CONTINUOUS_TOOLS = 50;

			// Historyの変更を監視し、非同期でトリガーする
			this.state.history.on('change', (payload) => this._onHistoryChange(payload));
		}

		on(event, callback) {
			if (this.listeners[event]) this.listeners[event].push(callback);
		}

		_emit(event, data) {
			if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
		}

		_onHistoryChange(payload) {
			if ((payload.type === 'append' || payload.type === 'update') && payload.turn) {
				const turn = payload.turn;

				if (payload.type === 'append' && turn.role === Role.USER) {
					this.continuousToolCount = 0;
				}

				// 自分自身の思考更新はトリガー要因にしない
				if (turn.role === Role.MODEL) return;

				// どんな履歴の変更であれ、一旦保留イベントとしてスケジュールする
				// 実際に発火するかどうかの評価は _ping 実行時に一括して行う
				this.hasPendingEvents = true;
				this._schedulePing();
			}
		}

		_schedulePing() {
			if (this.isRunning) return;

			clearTimeout(this.debounceTimer);
			this.debounceTimer = setTimeout(() => {
				this.hasPendingEvents = false;
				this._ping();
			}, 1500);
		}

		/**
		 * 起床判定ロジック：直近の履歴を評価し、LLMを発火させるべきか判断する
		 */
		_evaluateWakeUp() {
			const historyTurns = this.state.history.get();
			const lastModelIdx = historyTurns.findLastIndex(t => t.role === Role.MODEL && t.meta && t.meta.type === TurnType.MODEL_THOUGHT);

			// 自分が最後に思考を開始して以降のターンを抽出
			const recentTurns = lastModelIdx === -1 ? historyTurns : historyTurns.slice(lastModelIdx + 1);

			// 【最強トリガー】 ユーザーの入力があれば、他の状況 (finish等) に関わらず問答無用で発火する
			if (recentTurns.some(t => t.role === Role.USER)) {
				return true;
			}

			// 【通常トリガー】 ツールの実行結果など、trigger_llm が true のターンが1つでもあれば発火する
			// (※ finish ツール等により箱全体が trigger_llm: false になった場合は発火しない)
			return recentTurns.some(t => t.meta && t.meta.trigger_llm === true);
		}

		async injectUserTurn(inputContent, meta = {}) {
			const turnMeta = {
				type: TurnType.USER_INPUT,
				trigger_llm: true,
				...meta
			};
			const turn = this.state.history.append(Role.USER, inputContent, turnMeta);

			this._emit('turn_end', {
				role: Role.USER,
				turn
			});
		}

		/**
		 * システムからの非同期割り込みイベントを注入する（タイマーやデーモンからの通知など）
		 */
		injectSystemEvent(actionType, message, meta = {}) {
			const turnMeta = {
				type: TurnType.TOOL_EXECUTION,
				trigger_llm: true, // システムからの割り込みなのでデフォルトで発火させる
				...meta
			};

			// UIでツール結果と同じようにリッチに描画させるためのフォーマット
			const turnContent = [{
				actionType: actionType,
				output: {
					// HTMLタグを含めず、プレーンテキストとして渡す
					ui: `⏰ ${message}`,
					log: `[ASYNC EVENT: ${actionType}] ${message}`
				}
			}];

			const turn = this.state.history.append(Role.SYSTEM, turnContent, turnMeta);

			this._emit('turn_end', {
				role: Role.SYSTEM,
				turn
			});
		}

		async _ping() {
			this.isRunning = true;
			this.abortController = new AbortController();

			try {
				// ★ 最終発火チェック
				if (!this._evaluateWakeUp()) {
					return; // 起床条件を満たさない（finish で終わった、またはパッシブなログのみ）ため静かに待機
				}

				// 暴走チェック
				if (this.continuousToolCount >= this.MAX_CONTINUOUS_TOOLS) {
					this.state.history.append(Role.SYSTEM, `<event type="system_alert">\nSystem Alert: Max continuous tool executions (${this.MAX_CONTINUOUS_TOOLS}) reached. Auto-trigger paused.\n</event>`, {
						type: TurnType.ERROR,
						trigger_llm: false
					});
					this._emit('loop_stop', {
						reason: 'max_tools'
					});
					return;
				}

				const messages = await this.projector.createContext(this.state, this.abortController.signal);

				// 空のMODELターンをHistoryに追加（横槍の順序担保のため）。自己トリガーを防ぐため trigger_llm: false。
				const modelTurn = this.state.history.append(Role.MODEL, "", {
					type: TurnType.MODEL_THOUGHT,
					trigger_llm: false
				});

				this._emit('turn_start', {
					role: Role.MODEL,
					turnId: modelTurn.id
				});

				let rawResponse = "";
				let streamError = null;

				try {
					await this.llm.generateStream(messages, (chunk) => {
						rawResponse += chunk;
						this._emit('stream_chunk', chunk); // UI互換性のためchunkのみ渡す
					}, this.abortController.signal);
				} catch (err) {
					streamError = err;
				}

				// 思考完了後、履歴のコンテンツを更新
				const updatedTurn = this.state.history.update(modelTurn.id, rawResponse, {
					status: streamError ? 'error' : 'completed'
				});
				this._emit('turn_end', {
					role: Role.MODEL,
					turn: updatedTurn
				});

				if (streamError) throw streamError;

				// 解釈とアクションのフィルタリング
				// ToolRegistry から動的ツールを含む現在有効なすべてのツール名を取得し、パーサに保護対象として渡す
				const registeredTools = this.registry.getRegisteredToolNames();
				const actions = this.translator.parse(rawResponse, registeredTools);

				// thinking や plan などの実体がないタグを除外
				const validActions = actions.filter(a => a.type !== 'thinking' && a.type !== 'plan');

				if (validActions.length > 0) {
					this.continuousToolCount++;
					this._dispatchActions(validActions);
				} else {
					this.continuousToolCount = 0; // 実行すべきツールがなければ対話終了
					this._emit('loop_stop', {
						reason: 'idle'
					});
				}

			} catch (error) {
				if (error.name === 'AbortError') {
					console.log('[Engine] Aborted.');
					this._emit('loop_stop', {
						reason: 'abort'
					});
				} else {
					console.error('[Engine] Error:', error);
					const errTurn = this.state.history.append(Role.SYSTEM, `<event type="system_error">\nSystem Error: ${error.message}\n</event>`, {
						type: TurnType.ERROR,
						trigger_llm: false
					});
					this._emit('turn_end', {
						role: Role.SYSTEM,
						turn: errTurn
					});
					this._emit('loop_stop', {
						reason: 'error',
						error
					});
				}
			} finally {
				this.isRunning = false;
				this.abortController = null;
				// 思考中に新たなイベントが来ていた場合は再度スケジュール
				if (this.hasPendingEvents) {
					this._schedulePing();
				}
			}
		}

		_dispatchActions(actions) {
			const context = {
				vfs: this.state.vfs,
				config: this.state.configManager,
				history: this.state.history,
				engine: this, // ツール内からUI更新や割り込みができるように自身を渡す
				...this.extraContext
			};

			// 初期状態のプレースホルダーを作成
			const combinedResults = actions.map(action => ({
				actionType: action.type,
				output: {
					log: `[Pending] Executing ${action.type}...`,
					ui: `<span class="animate-spin inline-block">⚙️</span> Executing ${action.type}...`,
					trigger_llm: false // 実行中は発火要因にしない
				}
			}));

			// 1つの共有SystemターンをHistoryに作成
			const sharedTurn = this.state.history.append(Role.SYSTEM, combinedResults, {
				type: TurnType.TOOL_EXECUTION,
				trigger_llm: false
			});

			const sharedTurnId = sharedTurn.id;

			// ターン全体の発火フラグを動的に計算するヘルパー
			const calcTurnTrigger = () => {
				let willTrigger = false;
				let isHalted = false;
				let hasError = false;

				combinedResults.forEach(r => {
					// Pending状態のものは trigger_llm === false なので発火要因にならない
					if (r.output.trigger_llm !== false) willTrigger = true;
					if (r.output.halt_loop === true) isHalted = true;
					if (r.output.error === true) hasError = true;
				});

				// エラーが1つでも発生していれば、finish等の停止指示を無視して強制的にループを継続（リカバリ）させる
				if (hasError) return true;

				return isHalted ? false : willTrigger;
			};

			// 各アクションを非同期に並行実行
			actions.forEach(async (action, index) => {
				try {
					const result = await this.registry.execute(action, context);

					if (!result) {
						// 何も返さないツール（thinking等、事前にフィルタされているはずだが念のため）は空にして隠す
						combinedResults[index].output = {
							log: "",
							trigger_llm: false
						};
					} else {
						combinedResults[index].output = result;
					}

					// Historyの共有ターンを更新
					const updatedTurn = this.state.history.update(sharedTurnId, combinedResults, {
						trigger_llm: calcTurnTrigger()
					});

					// UIに更新を通知
					this._emit('turn_end', {
						role: Role.SYSTEM,
						turn: updatedTurn
					});

				} catch (err) {
					combinedResults[index].output = {
						log: `Error: ${err.message}`,
						error: true,
						trigger_llm: true // エラー時はリカバリーさせるため基本発火させる
					};

					const updatedTurn = this.state.history.update(sharedTurnId, combinedResults, {
						type: TurnType.ERROR,
						trigger_llm: calcTurnTrigger()
					});
					this._emit('turn_end', {
						role: Role.SYSTEM,
						turn: updatedTurn
					});
				}
			});
		}

		stop() {
			if (this.abortController) this.abortController.abort();
		}
	}

	global.Itera.Control.Engine = Engine;

})(window);