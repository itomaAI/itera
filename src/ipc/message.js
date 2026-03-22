// src/ipc/message.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Ipc = global.Itera.Ipc || {};

    const PROTOCOL_VERSION = 'itera:ipc:v1';

    const generateId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    };

    // ==========================================
    // Host-Side Implementation
    // ==========================================
    class IpcMessage {
        static createRequest(source, target, action, payload = {}) {
            return {
                protocol: PROTOCOL_VERSION,
                type: 'req',
                id: generateId(),
                source,
                target,
                action,
                payload,
                error: null
            };
        }

        static createResponse(reqMessage, result, error = null) {
            return {
                protocol: PROTOCOL_VERSION,
                type: 'res',
                id: reqMessage.id,
                source: reqMessage.target, // 返信元
                target: reqMessage.source, // 返信先
                action: reqMessage.action,
                payload: result,
                error: error ? String(error) : null
            };
        }

        static createEvent(source, target, action, payload = {}) {
            return {
                protocol: PROTOCOL_VERSION,
                type: 'event',
                id: generateId(),
                source,
                target,
                action,
                payload,
                error: null
            };
        }

        static isValid(msg) {
            return msg && 
                   msg.protocol === PROTOCOL_VERSION && 
                   msg.type && 
                   msg.source && 
                   msg.target;
        }
    }

    global.Itera.Ipc.IpcMessage = IpcMessage;

    // ==========================================
    // Guest-Side Injection Code (String Literal)
    // ==========================================
    // 内容はHost版と同一だが、Guest環境のクロージャ内に展開されるため文字列で定義
    global.Itera.Ipc.GuestMessageCode = `
    const PROTOCOL_VERSION = 'itera:ipc:v1';

    const generateId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    };

    class IpcMessage {
        static createRequest(source, target, action, payload = {}) {
            return { protocol: PROTOCOL_VERSION, type: 'req', id: generateId(), source, target, action, payload, error: null };
        }
        static createResponse(reqMessage, result, error = null) {
            return { protocol: PROTOCOL_VERSION, type: 'res', id: reqMessage.id, source: reqMessage.target, target: reqMessage.source, action: reqMessage.action, payload: result, error: error ? String(error) : null };
        }
        static createEvent(source, target, action, payload = {}) {
            return { protocol: PROTOCOL_VERSION, type: 'event', id: generateId(), source, target, action, payload, error: null };
        }
        static isValid(msg) {
            return msg && msg.protocol === PROTOCOL_VERSION && msg.type && msg.source && msg.target;
        }
    }
    `.trim();

})(window);