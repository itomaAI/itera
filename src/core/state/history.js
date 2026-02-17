// src/core/state/history.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.State = global.Itera.State || {};

    const ROLE = {
        USER: 'user',
        MODEL: 'model',
        SYSTEM: 'system'
    };

    class HistoryManager {
        constructor() {
            this.turns = [];
            this.listeners = []; // Event listeners
        }

        // --- Event System ---

        on(event, callback) {
            // 現状は 'change' イベントのみ想定
            if (event === 'change') {
                this.listeners.push(callback);
            }
            // unsubscribe function
            return () => {
                this.listeners = this.listeners.filter(cb => cb !== callback);
            };
        }

        _notify() {
            this.listeners.forEach(cb => cb({ type: 'update', count: this.turns.length }));
        }

        // --- Core Methods ---

        load(historyData) {
            if (Array.isArray(historyData)) {
                this.turns = historyData;
            } else {
                this.turns = [];
            }
            this._notify();
        }

        append(role, content, meta = {}) {
            const turn = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                role: role,
                content: content,
                meta: {
                    type: 'message',
                    visible: true,
                    ...meta
                }
            };
            this.turns.push(turn);
            this._notify();
            return turn;
        }

        delete(id) {
            const initialLen = this.turns.length;
            this.turns = this.turns.filter(t => t.id !== id);
            if (this.turns.length !== initialLen) {
                this._notify();
            }
        }

        clear() {
            this.turns = [];
            this._notify();
        }

        get() {
            return this.turns;
        }

        getLast() {
            return this.turns.length > 0 ? this.turns[this.turns.length - 1] : null;
        }
    }

    global.Itera.State.HistoryManager = HistoryManager;
    global.Itera.Role = ROLE;

})(window);