// src/ipc/guest_transport.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Ipc = global.Itera.Ipc || {};

    // ==========================================
    // Guest-Side Injection Code (String Literal)
    // ==========================================
    global.Itera.Ipc.GuestTransportCode = `
    class GuestTransport {
        constructor(pid) {
            this.pid = pid;
            this.rpc = new RpcManager();
            this.handlers = new Map();
            this.eventListeners = new Map();
            this._initListener();
        }

        /**
         * Hostから呼び出されるローカル関数を登録する（動的ツール用）
         */
        registerHandler(action, handler) {
            this.handlers.set(action, handler);
        }

        /**
         * Hostからのイベント（ブロードキャスト等）を購読する
         */
        on(action, callback) {
            if (!this.eventListeners.has(action)) {
                this.eventListeners.set(action,[]);
            }
            this.eventListeners.get(action).push(callback);
        }

        /**
         * Hostへリクエストを送信し、結果を待機する
         */
        async requestHost(action, payload) {
            const req = IpcMessage.createRequest(this.pid, 'host', action, payload);
            const promise = this.rpc.waitFor(req.id);
            window.parent.postMessage(req, '*');
            return promise;
        }

        _initListener() {
            window.addEventListener('message', async (e) => {
                const msg = e.data;
                
                // Itera IPCプロトコルのメッセージか検証
                if (!IpcMessage.isValid(msg)) return;

                // 自身宛て、またはブロードキャスト宛て以外は無視
                if (msg.target !== this.pid && msg.target !== 'broadcast') return;

                if (msg.type === 'req') {
                    // Hostからのリクエスト処理（逆方向RPCの着弾点）
                    const handler = this.handlers.get(msg.action);
                    let result = null;
                    let error = null;

                    if (handler) {
                        try {
                            result = await handler(msg.payload);
                        } catch (err) {
                            error = err.message || String(err);
                        }
                    } else {
                        error = "[GuestTransport] No handler registered for action: " + msg.action + " in PID: " + this.pid;
                    }

                    // レスポンスの返送
                    const res = IpcMessage.createResponse(msg, result, error);
                    if (e.source) {
                        e.source.postMessage(res, '*');
                    }
                } else if (msg.type === 'res') {
                    // Hostからのレスポンス受け取り（待機中のPromiseを解決）
                    this.rpc.resolve(msg.id, msg.payload, msg.error);
                } else if (msg.type === 'event') {
                    // イベントリスナーの発火
                    const listeners = this.eventListeners.get(msg.action);
                    if (listeners) {
                        listeners.forEach(cb => cb(msg.payload));
                    }
                }
            });
        }
    }
    `.trim();

})(window);