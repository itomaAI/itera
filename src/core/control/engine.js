// src/core/control/engine.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Control = global.Itera.Control || {};

    const Role = global.Itera.Role || { USER: 'user', MODEL: 'model', SYSTEM: 'system' };
    const Signal = global.Itera.Control.Signal;

    // TurnType定数 (本来は constants.js に置くが、Engineで必須のためここで定義・参照)
    const TurnType = {
        USER_INPUT: 'user_input',
        MODEL_THOUGHT: 'model_thought',
        TOOL_EXECUTION: 'tool_execution',
        ERROR: 'error'
    };
    
    // グローバルにも公開しておく
    global.Itera.TurnType = TurnType;

    class Engine {
        /**
         * @param {Object} state - State Layer (History, VFS, Config)
         * @param {Object} projector - Cognitive Layer (Prompt Builder)
         * @param {Object} llm - Cognitive Layer (API Client)
         * @param {Object} translator - Cognitive Layer (Parser)
         * @param {Object} registry - Control Layer (Tools)
         */
        constructor(state, projector, llm, translator, registry) {
            this.state = state;
            this.projector = projector;
            this.llm = llm;
            this.translator = translator;
            this.registry = registry;

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

        /**
         * ユーザー入力を注入してループを開始するエントリーポイント
         * @param {string|Array} inputContent 
         * @param {Object} meta 
         */
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

        /**
         * REALループ (Recursive Environment-Agent Loop)
         */
        async run() {
            this.isRunning = true;
            this.abortController = new AbortController();

            let currentSignal = Signal.CONTINUE;
            let loopCount = 0;
            const MAX_LOOPS = 20; // 安全のため制限
            let lastTurnHadError = false;

            try {
                while (currentSignal === Signal.CONTINUE) {
                    // 1. ループ制限チェック
                    if (loopCount >= MAX_LOOPS) {
                        this.state.history.append(Role.SYSTEM, `System Alert: Maximum autonomous turn limit (${MAX_LOOPS}) reached. Stopping.`, {
                            type: TurnType.ERROR
                        });
                        currentSignal = Signal.HALT;
                        break;
                    }
                    loopCount++;

                    // 2. 思考 (L1: Cognitive)
                    // プロンプト作成 -> LLM生成 -> ストリーム受信
                    const messages = this.projector.createContext(this.state);
                    
                    this._emit('turn_start', { role: Role.MODEL });
                    
                    let rawResponse = "";
                    await this.llm.generateStream(messages, (chunk) => {
                        rawResponse += chunk;
                        this._emit('stream_chunk', chunk);
                    }, this.abortController.signal);

                    // 思考履歴の保存
                    this.state.history.append(Role.MODEL, rawResponse, {
                        type: TurnType.MODEL_THOUGHT
                    });

                    // 3. 解釈 (L1 -> L2)
                    const actions = this.translator.parse(rawResponse);

                    // アクションが無い場合の処理
                    if (actions.length === 0) {
                        if (lastTurnHadError) {
                            // エラー直後なのに何もしない場合 -> 強制リトライ
                            const retryMsg = "System: The previous tool execution failed. You MUST retry with a corrected action or fix the error.";
                            this.state.history.append(Role.SYSTEM, retryMsg, { type: TurnType.ERROR });
                            this._emit('turn_end', {
                                role: Role.SYSTEM,
                                results: [{
                                    actionType: 'system_retry',
                                    output: { ui: "⚠️ Retry Requested: Action required." }
                                }]
                            });
                            lastTurnHadError = false;
                            continue;
                        } else {
                            // 通常の会話終了とみなす
                            currentSignal = Signal.HALT;
                            break;
                        }
                    }

                    this._emit('turn_start', { role: Role.SYSTEM });

                    // 4. 実行 (L2: Control)
                    // 実行コンテキストの作成 (ツールがVFSやConfigにアクセスできるようにする)
                    const context = {
                        vfs: this.state.vfs,
                        config: this.state.configManager,
                        // UIコントローラーへの参照が必要なツール(ui_tools)のために
                        // MainController側でツール登録時にbindされていることを期待するか、
                        // ここで state.uiController などを渡す設計にするか。
                        // 今回は ToolRegistry 登録時にクロージャでUIを持たせる方式を採用しているため、
                        // ここでは最低限のデータモデルを渡す。
                    };

                    const results = [];
                    let dominantSignal = Signal.CONTINUE;
                    let hasError = false;

                    for (const action of actions) {
                        // ツールの実行
                        const { result, signal } = await this.registry.execute(action, context);

                        results.push({
                            actionType: action.type,
                            output: result
                        });

                        if (result && result.error) {
                            hasError = true;
                        }

                        // シグナルの優先順位: TERMINATE > HALT > CONTINUE
                        if (signal === Signal.TERMINATE) dominantSignal = Signal.TERMINATE;
                        else if (signal === Signal.HALT && dominantSignal !== Signal.TERMINATE) dominantSignal = Signal.HALT;
                    }

                    // 5. 状態更新 (L3: State)
                    // エラー時のFinishキャンセルロジック
                    if (hasError && dominantSignal === Signal.TERMINATE) {
                        dominantSignal = Signal.CONTINUE;
                        results.push({
                            actionType: 'system_override',
                            output: {
                                log: "System Notice: <finish> signal was IGNORED because a tool execution failed. Verify the error and retry.",
                                ui: "🚫 Finish Cancelled: Error detected."
                            }
                        });
                    }

                    lastTurnHadError = hasError;

                    // システムターンとして結果を履歴に保存
                    this.state.history.append(Role.SYSTEM, results, {
                        type: TurnType.TOOL_EXECUTION
                    });

                    this._emit('turn_end', {
                        role: Role.SYSTEM,
                        results
                    });

                    currentSignal = dominantSignal;

                    // レートリミット対策ウェイト
                    await new Promise(r => setTimeout(r, 1000));
                }

            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('[Engine] Loop aborted by user.');
                } else {
                    console.error('[Engine] Critical Error:', error);
                    this.state.history.append(Role.SYSTEM, `System Critical Error: ${error.message}`, {
                        type: TurnType.ERROR
                    });
                    this._emit('loop_stop', { reason: 'error', error });
                }
            } finally {
                this.isRunning = false;
                this.abortController = null;
                
                if (currentSignal === Signal.HALT) this._emit('loop_stop', { reason: 'halt' });
                else if (currentSignal === Signal.TERMINATE) this._emit('loop_stop', { reason: 'terminate' });
            }
        }

        stop() {
            if (this.abortController) {
                this.abortController.abort();
            }
        }
    }

    global.Itera.Control.Engine = Engine;

})(window);