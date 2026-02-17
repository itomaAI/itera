// src/bridge/guest_bridge.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Bridge = global.Itera.Bridge || {};

    /**
     * Guest-side library source code.
     * This string will be injected into the iframe's <head>.
     */
    const GUEST_CLIENT_CODE = `
(function(global) {
    const REQUESTS = new Map();

    // --- Message Listener ---
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data) return;

        // Response Handling
        if (data.type === 'ITERA_RESPONSE') {
            const { requestId, result, error } = data;
            if (REQUESTS.has(requestId)) {
                const { resolve, reject } = REQUESTS.get(requestId);
                REQUESTS.delete(requestId);
                if (error) reject(new Error(error));
                else resolve(result);
            }
        }

        // Event Handling (Server-Sent Events)
        if (data.type === 'ITERA_EVENT') {
            const evt = new CustomEvent('metaos:' + data.event, { detail: data.payload });
            window.dispatchEvent(evt);
        }
    });

    // --- RPC Sender ---
    function post(action, payload = {}) {
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(7);
            
            // Timeout safety
            const timeoutId = setTimeout(() => {
                if (REQUESTS.has(requestId)) {
                    REQUESTS.delete(requestId);
                    reject(new Error("Itera Bridge Timeout: " + action));
                }
            }, 10000);

            REQUESTS.set(requestId, { 
                resolve: (res) => { clearTimeout(timeoutId); resolve(res); }, 
                reject: (err) => { clearTimeout(timeoutId); reject(err); } 
            });

            // Send to Host
            window.parent.postMessage({ 
                type: 'ITERA_ACTION', 
                requestId, 
                action, 
                payload 
            }, '*');
        });
    }

    // --- Public API (MetaOS Compatible) ---
    global.MetaOS = {
        // View Control
        switchView: (path) => post('switch_view', { path }),
        
        // File System
        saveFile: (path, content) => post('save_file', { path, content }),
        readFile: (path) => post('read_file', { path }),
        deleteFile: (path) => post('delete_file', { path }),
        renameFile: (oldPath, newPath) => post('rename_file', { oldPath, newPath }),
        stat: (path) => post('stat_file', { path }),
        listFiles: (path, options) => post('list_files', { path, options }),
        
        // Host Interaction
        openFile: (path) => post('open_file', { path }),
        notify: (message, title) => post('show_notification', { message, title }),
        copyToClipboard: (text) => post('copy_to_clipboard', { text }),
        openExternal: (url) => post('open_external', { url }),
        
        // AI Interaction
        ask: (text, attachments) => post('agent_trigger', { instruction: text, options: { attachments } }),
        agent: (instruction, options) => post('agent_trigger', { instruction, options }),
        
        // Events
        on: (event, callback) => window.addEventListener('metaos:' + event, (e) => callback(e.detail)),
        
        // Lifecycle
        ready: () => post('view_ready', {})
    };

    console.log("[Itera] Guest Bridge Initialized as window.MetaOS");
})(window);
`;

    global.Itera.Bridge.GuestCode = GUEST_CLIENT_CODE;

})(window);