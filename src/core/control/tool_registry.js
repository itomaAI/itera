// src/core/control/tool_registry.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Control = global.Itera.Control || {};

    class ToolRegistry {
        constructor() {
            this.systemTools = new Map();
            this.guestTools = new Map();
        }

        /**
         * システムツール（固定）を登録する
         * @param {string} name - ツール名 (例: 'read_file')
         * @param {Function} impl - 実装関数 (params, context) => Promise<Result>
         */
        register(name, impl) {
            this.systemTools.set(name, { impl });
        }

        /**
         * ゲストアプリからの動的ツールを登録する
         */
        registerDynamicTool(name, sourcePid, toolDef) {
            this.guestTools.set(name, { pid: sourcePid, def: toolDef });
            console.log(`[ToolRegistry] Registered dynamic tool: <${name}> from PID: ${sourcePid}`);
        }

        /**
         * 動的ツールを明示的に解除する
         */
        unregisterDynamicTool(name, sourcePid) {
            const tool = this.guestTools.get(name);
            if (tool && tool.pid === sourcePid) {
                this.guestTools.delete(name);
                console.log(`[ToolRegistry] Unregistered dynamic tool: <${name}> from PID: ${sourcePid}`);
            }
        }

        /**
         * 特定のPIDに紐づくすべての動的ツールを一括で削除する（クリーンアップ用）
         */
        removeToolsByPid(pid) {
            let count = 0;
            for (const[name, tool] of this.guestTools.entries()) {
                if (tool.pid === pid) {
                    this.guestTools.delete(name);
                    count++;
                }
            }
            if (count > 0) {
                console.log(`[ToolRegistry] Removed ${count} dynamic tool(s) due to PID '${pid}' termination.`);
            }
        }

        /**
         * アクションをルーティングして実行する
         * @param {Object} action - { type, params }
         * @param {Object} context - { vfs, history, engine, shell ... }
         */
        async execute(action, context) {
            // 1. システムツールの実行
            const sysTool = this.systemTools.get(action.type);
            if (sysTool) {
                try {
                    return await sysTool.impl(action.params, context);
                } catch (err) {
                    console.error(`[ToolRegistry] Error executing system tool <${action.type}>:`, err);
                    return {
                        log: `Error executing <${action.type}>: ${err.message}`,
                        ui: `❌ Error: ${err.message}`,
                        error: true
                    };
                }
            }

            // 2. ゲストツールの実行 (逆方向RPC)
            const guestTool = this.guestTools.get(action.type);
            if (guestTool) {
                try {
                    const pid = guestTool.pid;
                    const pm = context.shell.windowing.processManager;
                    const proc = pm.processes.get(pid);
                    
                    if (!proc || !proc.iframe || !proc.iframe.contentWindow) {
                        throw new Error(`Target process '${pid}' is no longer available.`);
                    }

                    // HostTransport を介して Guest へ実行を委譲し、結果を待つ
                    const result = await context.shell.transport.invokeGuest(
                        pid,
                        'execute_tool',
                        { name: action.type, params: action.params },
                        proc.iframe.contentWindow
                    );
                    
                    return result;

                } catch (err) {
                    console.error(`[ToolRegistry] Error executing dynamic tool <${action.type}>:`, err);
                    return {
                        log: `Error executing dynamic tool <${action.type}>: ${err.message}`,
                        ui: `❌ Error: ${err.message}`,
                        error: true
                    };
                }
            }

            // 3. 見つからない場合
            return {
                log: `Error: Unknown tool <${action.type}>`,
                ui: `❌ Unknown Tool`,
                error: true
            };
        }
    }

    global.Itera.Control.ToolRegistry = ToolRegistry;

})(window);