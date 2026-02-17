// src/core/control/tool_registry.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Control = global.Itera.Control || {};

    const Signal = {
        CONTINUE: 'SIGNAL_CONTINUE',   // 自律ループ継続
        HALT: 'SIGNAL_HALT',           // ユーザー入力待ち (Human-in-the-loop)
        TERMINATE: 'SIGNAL_TERMINATE'  // タスク完了・停止
    };

    class ToolRegistry {
        constructor() {
            this.tools = new Map();
        }

        /**
         * ツールを登録する
         * @param {string} name - ツール名 (例: 'read_file')
         * @param {Function} impl - 実装関数 (params, context) => Promise<Result>
         * @param {string} defaultSignal - 実行後のデフォルトシグナル
         */
        register(name, impl, defaultSignal = Signal.CONTINUE) {
            this.tools.set(name, { impl, defaultSignal });
        }

        /**
         * アクションを実行する
         * @param {Object} action - { type, params }
         * @param {Object} context - { vfs, ui, config ... }
         */
        async execute(action, context) {
            const toolDef = this.tools.get(action.type);
            
            if (!toolDef) {
                return {
                    result: {
                        log: `Error: Unknown tool <${action.type}>`,
                        error: true
                    },
                    signal: Signal.CONTINUE
                };
            }

            try {
                // 実行
                const output = await toolDef.impl(action.params, context);
                
                // シグナルの決定 (戻り値にsignalが含まれていればそれを優先)
                const signal = (output && output.signal) ? output.signal : toolDef.defaultSignal;

                return {
                    result: output,
                    signal: signal
                };

            } catch (err) {
                console.error(`[ToolRegistry] Error executing <${action.type}>:`, err);
                return {
                    result: {
                        log: `Error executing <${action.type}>: ${err.message}`,
                        ui: `❌ Error: ${err.message}`,
                        error: true
                    },
                    signal: Signal.CONTINUE // エラー時は基本継続してリトライさせる
                };
            }
        }
    }

    global.Itera.Control.ToolRegistry = ToolRegistry;
    global.Itera.Control.Signal = Signal;

})(window);