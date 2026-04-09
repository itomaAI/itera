// src/api/guest/metaos_core.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Api = global.Itera.Api || {};

    // ==========================================
    // Guest-Side Injection Code (String Literal)
    // ==========================================
    global.Itera.Api.MetaOSCoreCode = `
    // Hostからのツール実行要求を受け取るためのローカル辞書
    const localToolHandlers = new Map();

    // 逆方向RPC（Host -> Guest のツール実行）の待ち受け
    transport.registerHandler('execute_tool', async (payload) => {
        const handler = localToolHandlers.get(payload.name);
        if (!handler) {
            throw new Error("Tool handler not found for: " + payload.name);
        }
        // ローカルに保存しておいた関数を実行し、結果をHostに返す
        return await handler(payload.params);
    });

    global.MetaOS = {
        // 1. ファイルシステム (VFS)
        fs: {
            read: async (path, opts = {}) => transport.requestHost('fs:read', { path, opts }),
            write: async (path, content, opts = {}) => transport.requestHost('fs:write', { path, content, opts }),
            append: async (path, content, opts = {}) => transport.requestHost('fs:append', { path, content, opts }),
            delete: async (path, opts = {}) => transport.requestHost('fs:delete', { path, opts }),
            rename: async (oldPath, newPath, opts = {}) => transport.requestHost('fs:rename', { oldPath, newPath, opts }),
            copy: async (srcPath, destPath, opts = {}) => transport.requestHost('fs:copy', { srcPath, destPath, opts }),
            mkdir: async (path, opts = {}) => transport.requestHost('fs:mkdir', { path, opts }),
            stat: async (path) => transport.requestHost('fs:stat', { path }),
            list: async (path, opts = {}) => transport.requestHost('fs:list', { path, opts }),
            exists: async (path) => transport.requestHost('fs:exists', { path }),
            resolveUrl: async (path) => transport.requestHost('fs:resolve_url', { path })
        },

        // 2. AI・履歴への介入
        ai: {
            ask: async (text, opts = {}) => transport.requestHost('ai:ask', { text, opts }),
            task: async (instruction, context, opts = {}) => transport.requestHost('ai:task', { instruction, context, opts }),
            log: async (message, type) => transport.requestHost('ai:log', { message, type }),
            stop: async () => transport.requestHost('ai:stop', {})
        },

        // 3. プロセス・イベント管理
        system: {
            spawn: async (path, opts = {}) => transport.requestHost('sys:spawn', { path, opts }),
            kill: async (pid) => transport.requestHost('sys:kill', { pid }),
            ps: async () => transport.requestHost('sys:ps', {}),
            info: async () => transport.requestHost('sys:info', {}),
            broadcast: async (eventName, payload) => transport.requestHost('sys:broadcast', { eventName, payload }),
            on: (eventName, handler) => transport.on(eventName, handler),
            off: (eventName, handler) => {
                const listeners = transport.eventListeners.get(eventName);
                if (listeners) {
                    const filtered = listeners.filter(cb => cb !== handler);
                    if (filtered.length === 0) {
                        transport.eventListeners.delete(eventName);
                    } else {
                        transport.eventListeners.set(eventName, filtered);
                    }
                }
            },
            capture: async (pid) => transport.requestHost('sys:capture', { pid })
        },

        // 4. ホストUI・ネイティブ機能
        host: {
            openEditor: async (path) => transport.requestHost('host:open_editor', { path }),
            notify: async (message, title) => transport.requestHost('host:notify', { message, title }),
            copyText: async (text) => transport.requestHost('host:copy', { text }),
            openExternal: async (url) => transport.requestHost('host:open_url', { url }),
            updateAddressBar: async (path) => transport.requestHost('host:address_bar', { path })
        },

        // 5. ネットワークアクセス (CORS回避・ダウンロード・認証代行)
        net: {
            fetch: async (url, options = {}) => transport.requestHost('net:fetch', { url, options }),
            download: async (url, destPath, options = {}) => transport.requestHost('net:download', { url, destPath, options }),
            oauth: async (providerId, authUrl, instructions) => transport.requestHost('net:oauth', { providerId, authUrl, instructions })
        },

        // 6. デバイス・ハードウェア制御
        device: {
            getLocation: async (options = {}) => transport.requestHost('dev:location', { options }),
            takePhoto: async (options = {}) => transport.requestHost('dev:photo', { options }),
            recordAudio: async (options = {}) => transport.requestHost('dev:audio', { options }),
            vibrate: async (pattern) => transport.requestHost('dev:vibrate', { pattern })
        },

        // 7. 動的ツール提供 (双方向RPC用)
        tools: {
            register: async (toolDef) => {
                if (!toolDef || !toolDef.name || typeof toolDef.handler !== 'function') {
                    throw new Error("Invalid tool definition. 'name' and 'handler' are required.");
                }
                
                // 実処理(関数)はGuestのメモリ空間に留めておく
                localToolHandlers.set(toolDef.name, toolDef.handler);
                
                // Hostのルーターには名前と定義だけを伝えて通信経路を開通させる
                await transport.requestHost('tools:register', {
                    name: toolDef.name,
                    description: toolDef.description,
                    definition: toolDef.definition
                });
            },
            unregister: async (name) => {
                localToolHandlers.delete(name);
                await transport.requestHost('tools:unregister', { name });
            }
        }
    };
    `.trim();

})(window);