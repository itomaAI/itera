// src/ipc/host_transport.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Ipc = global.Itera.Ipc || {};

    const { IpcMessage, RpcManager } = global.Itera.Ipc;

    class HostTransport {
        constructor() {
            this.rpc = new RpcManager();
            this.handlers = new Map();
            this._initListener();
        }

        /**
         * Guestからのリクエストを処理するハンドラを登録する
         * @param {string} action - 例: 'fs:read'
         * @param {Function} handler - (payload, sourcePid) => Promise<any>
         */
        registerHandler(action, handler) {
            this.handlers.set(action, handler);
        }

        /**
         * Guestへリクエストを送信し、結果を待機する（逆方向RPC）
         * @param {string} pid - ターゲットのプロセスID
         * @param {string} action - 例: 'execute_tool'
         * @param {Object} payload - 送信データ
         * @param {Window} targetWindow - 対象iframeのcontentWindow
         * @returns {Promise<any>}
         */
        async invokeGuest(pid, action, payload, targetWindow) {
            if (!targetWindow) {
                throw new Error(`[HostTransport] Target window for PID '${pid}' is missing.`);
            }

            const req = IpcMessage.createRequest('host', pid, action, payload);
            
            // Promiseを取得してから送信
            const promise = this.rpc.waitFor(req.id);
            targetWindow.postMessage(req, '*');
            
            return promise;
        }

        /**
         * Guestへ一方通行のイベントを送信する（ブロードキャスト等）
         */
        sendEvent(pid, action, payload, targetWindow) {
            if (!targetWindow) return;
            const evt = IpcMessage.createEvent('host', pid, action, payload);
            targetWindow.postMessage(evt, '*');
        }

        _initListener() {
            window.addEventListener('message', async (e) => {
                const msg = e.data;
                
                // Itera IPCプロトコルのメッセージか検証
                if (!IpcMessage.isValid(msg)) return;
                
                // Host宛てのメッセージ以外は無視
                if (msg.target !== 'host') return;

                if (msg.type === 'req') {
                    // Guestからのリクエスト処理
                    const handler = this.handlers.get(msg.action);
                    let result = null;
                    let error = null;

                    if (handler) {
                        try {
                            result = await handler(msg.payload, msg.source);
                        } catch (err) {
                            error = err.message || String(err);
                        }
                    } else {
                        error = `[HostTransport] No handler registered for action: ${msg.action}`;
                    }

                    // レスポンスの返送
                    const res = IpcMessage.createResponse(msg, result, error);
                    if (e.source) {
                        e.source.postMessage(res, '*');
                    }
                } else if (msg.type === 'res') {
                    // Guestからのレスポンス受け取り（待機中のPromiseを解決）
                    this.rpc.resolve(msg.id, msg.payload, msg.error);
                }
            });
        }
    }

    global.Itera.Ipc.HostTransport = HostTransport;

})(window);