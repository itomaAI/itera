// src/ipc/rpc_manager.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Ipc = global.Itera.Ipc || {};

    // ==========================================
    // Host-Side Implementation
    // ==========================================
    class RpcManager {
        constructor(timeoutMs = 15000) {
            this.pendingRequests = new Map();
            this.timeoutMs = timeoutMs;
        }

        waitFor(id) {
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    if (this.pendingRequests.has(id)) {
                        this.pendingRequests.delete(id);
                        reject(new Error(`RPC Timeout: Request ${id} exceeded ${this.timeoutMs}ms`));
                    }
                }, this.timeoutMs);

                this.pendingRequests.set(id, { resolve, reject, timeoutId });
            });
        }

        resolve(id, result, error = null) {
            if (this.pendingRequests.has(id)) {
                const { resolve, reject, timeoutId } = this.pendingRequests.get(id);
                clearTimeout(timeoutId);
                this.pendingRequests.delete(id);

                if (error) reject(new Error(error));
                else resolve(result);
            }
        }

        clearAll() {
            for (const[id, { reject, timeoutId }] of this.pendingRequests.entries()) {
                clearTimeout(timeoutId);
                reject(new Error("RPC Manager cleared all pending requests."));
            }
            this.pendingRequests.clear();
        }
    }

    global.Itera.Ipc.RpcManager = RpcManager;

    // ==========================================
    // Guest-Side Injection Code (String Literal)
    // ==========================================
    global.Itera.Ipc.GuestRpcCode = `
    class RpcManager {
        constructor(timeoutMs = 15000) {
            this.pendingRequests = new Map();
            this.timeoutMs = timeoutMs;
        }

        waitFor(id) {
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    if (this.pendingRequests.has(id)) {
                        this.pendingRequests.delete(id);
                        reject(new Error("RPC Timeout: Request " + id + " exceeded " + this.timeoutMs + "ms"));
                    }
                }, this.timeoutMs);
                this.pendingRequests.set(id, { resolve, reject, timeoutId });
            });
        }

        resolve(id, result, error = null) {
            if (this.pendingRequests.has(id)) {
                const pending = this.pendingRequests.get(id);
                clearTimeout(pending.timeoutId);
                this.pendingRequests.delete(id);
                if (error) pending.reject(new Error(error));
                else pending.resolve(result);
            }
        }
    }
    `.trim();

})(window);