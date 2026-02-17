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

	// TurnType定数
	const TurnType = {
		USER_INPUT: 'user_input',
		MODEL_THOUGHT: 'model_thought',
		TOOL_EXECUTION: 'tool_execution',
		ERROR: 'error'
	};
	global.Itera.TurnType = TurnType;

	class Engine {
		/**
		 * @param {Object} state - State Layer (History, VFS, Config)
		 * @param {Object} projector - Cognitive Layer
		 * @param {Object} llm - Cognitive Layer
		 * @param {Object} translator - Cognitive Layer
		 * @param {Object} registry - Control Layer
		 * @param {Object} extraContext - [Fix 3] Additional context for tools (e.g. { ui: ... })
		 */
		constructor(state, projector, llm, translator, registry, extraContext = {}) {
			this.state = state;
			this.projector = projector;
			this.llm = llm;
			this.translator = translator;
			this.registry = registry;
			this.extraContext = extraContext; // [Fix 3] Store extra context

			this.isRunning = false;
			this.abortController = null;
			this.listeners = {
				'turn_start': [],
				'stream_chunk': [],
				'turn_end': [],
				'loop_stop': []
			};
		}

		on(event, callback) {
			if (this.listeners[event]) this.listeners[event].push(callback);
		}

		_emit(event, data) {
			if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
		}

		async injectUserTurn(inputContent, meta = {}) {
			if (this.isRunning) {
				console.warn("Engine is already running.");
				return;
			}

			const turnMeta = {
				type: TurnType.USER_INPUT,
				...meta
			};
			const turn = this.state.history.append(Role.USER, inputContent, turnMeta);

			this._emit('turn_end', {
				role: Role.USER,
				turn
			});
			await this.run();
		}

		async run() {
			this.isRunning = true;
			this.abortController = new AbortController();

			let currentSignal = Signal.CONTINUE;
			let loopCount = 0;
			const MAX_LOOPS = 20;
			let lastTurnHadError = false;

			try {
				while (currentSignal === Signal.CONTINUE) {
					// 1. ループ制限
					if (loopCount >= MAX_LOOPS) {
						this.state.history.append(Role.SYSTEM, `System Alert: Max turn limit (${MAX_LOOPS}) reached.`, {
							type: TurnType.ERROR
						});
						currentSignal = Signal.HALT;
						break;
					}
					loopCount++;

					// 2. 思考 (L1)
					const messages = this.projector.createContext(this.state);
					this._emit('turn_start', {
						role: Role.MODEL
					});

					let rawResponse = "";
					await this.llm.generateStream(messages, (chunk) => {
						rawResponse += chunk;
						this._emit('stream_chunk', chunk);
					}, this.abortController.signal);

					this.state.history.append(Role.MODEL, rawResponse, {
						type: TurnType.MODEL_THOUGHT
					});

					// 3. 解釈 (L1 -> L2)
					const actions = this.translator.parse(rawResponse);

					if (actions.length === 0) {
						if (lastTurnHadError) {
							const retryMsg = "System: Previous tool failed. Retry required.";
							this.state.history.append(Role.SYSTEM, retryMsg, {
								type: TurnType.ERROR
							});
							this._emit('turn_end', {
								role: Role.SYSTEM,
								results: [{
									actionType: 'system_retry',
									output: {
										ui: "⚠️ Retry Requested"
									}
								}]
							});
							lastTurnHadError = false;
							continue;
						} else {
							currentSignal = Signal.HALT;
							break;
						}
					}

					this._emit('turn_start', {
						role: Role.SYSTEM
					});

					// 4. 実行 (L2)
					// [Fix 3] Merge extraContext (ui) into tool context
					const context = {
						vfs: this.state.vfs,
						config: this.state.configManager,
						...this.extraContext
					};

					const results = [];
					let dominantSignal = Signal.CONTINUE;
					let hasError = false;

					for (const action of actions) {
						const {
							result,
							signal
						} = await this.registry.execute(action, context);
						results.push({
							actionType: action.type,
							output: result
						});
						if (result && result.error) hasError = true;

						if (signal === Signal.TERMINATE) dominantSignal = Signal.TERMINATE;
						else if (signal === Signal.HALT && dominantSignal !== Signal.TERMINATE) dominantSignal = Signal.HALT;
					}

					if (hasError && dominantSignal === Signal.TERMINATE) {
						dominantSignal = Signal.CONTINUE;
						results.push({
							actionType: 'system_override',
							output: {
								log: "System Notice: <finish> cancelled due to error.",
								ui: "🚫 Finish Cancelled"
							}
						});
					}

					lastTurnHadError = hasError;

					this.state.history.append(Role.SYSTEM, results, {
						type: TurnType.TOOL_EXECUTION
					});
					this._emit('turn_end', {
						role: Role.SYSTEM,
						results
					});

					currentSignal = dominantSignal;
					await new Promise(r => setTimeout(r, 1000));
				}

			} catch (error) {
				if (error.name === 'AbortError') {
					console.log('[Engine] Aborted.');
				} else {
					console.error('[Engine] Error:', error);
					this.state.history.append(Role.SYSTEM, `System Error: ${error.message}`, {
						type: TurnType.ERROR
					});
					this._emit('loop_stop', {
						reason: 'error',
						error
					});
				}
			} finally {
				this.isRunning = false;
				this.abortController = null;
				if (currentSignal === Signal.HALT) this._emit('loop_stop', {
					reason: 'halt'
				});
				else if (currentSignal === Signal.TERMINATE) this._emit('loop_stop', {
					reason: 'terminate'
				});
			}
		}

		stop() {
			if (this.abortController) this.abortController.abort();
		}
	}

	global.Itera.Control.Engine = Engine;

})(window);