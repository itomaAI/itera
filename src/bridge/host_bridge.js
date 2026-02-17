// src/bridge/host_bridge.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Bridge = global.Itera.Bridge || {};

    class HostBridge {
        constructor() {
            this.handlers = new Map();
            this._initListener();
        }

        /**
         * Register a handler for a specific action
         * @param {string} action - e.g. 'read_file'
         * @param {Function} handler - (payload) => Promise<Result>
         */
        registerHandler(action, handler) {
            this.handlers.set(action, handler);
        }

        /**
         * Send an event to the guest (iframe)
         * @param {HTMLIFrameElement} iframe 
         * @param {string} eventName 
         * @param {Object} payload 
         */
        emitEvent(iframe, eventName, payload) {
            if (!iframe || !iframe.contentWindow) return;
            iframe.contentWindow.postMessage({
                type: 'ITERA_EVENT',
                event: eventName,
                payload
            }, '*');
        }

        _initListener() {
            window.addEventListener('message', async (event) => {
                const data = event.data;
                // Security check: Ensure message is for Itera
                if (!data || data.type !== 'ITERA_ACTION') return;

                const { requestId, action, payload } = data;
                const sourceWindow = event.source;

                let result = null;
                let error = null;

                try {
                    const handler = this.handlers.get(action);
                    if (handler) {
                        // Execute handler (support both sync and async)
                        result = await handler(payload);
                    } else {
                        throw new Error(`Unknown action: ${action}`);
                    }
                } catch (e) {
                    console.error(`[HostBridge] Error processing ${action}:`, e);
                    error = e.message || "Internal Server Error";
                }

                // Send Response
                if (sourceWindow) {
                    sourceWindow.postMessage({
                        type: 'ITERA_RESPONSE',
                        requestId,
                        result,
                        error
                    }, '*');
                }
            });
        }
    }

    global.Itera.Bridge.HostBridge = HostBridge;

})(window);