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

		_notify(action = 'update', turn = null) {
			this.listeners.forEach(cb => cb({
				type: action,
				count: this.turns.length,
				turn
			}));
		}

		// --- Core Methods ---

		load(historyData) {
			if (Array.isArray(historyData)) {
				this.turns = historyData;
			} else {
				this.turns = [];
			}
			this._notify('load');
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
					trigger_llm: true, // デフォルトで発火。...meta で上書き可能
					...meta
				}
			};
			this.turns.push(turn);
			this._notify('append', turn);
			return turn;
		}

		update(id, content, meta = {}) {
			const index = this.turns.findIndex(t => t.id === id);
			if (index !== -1) {
				if (content !== undefined) {
					this.turns[index].content = content;
				}
				this.turns[index].meta = {
					...this.turns[index].meta,
					...meta
				};
				this._notify('update', this.turns[index]);
				return this.turns[index];
			}
			return null;
		}

		delete(id) {
			const initialLen = this.turns.length;
			this.turns = this.turns.filter(t => t.id !== id);
			if (this.turns.length !== initialLen) {
				this._notify('delete');
			}
		}

		clear() {
			this.turns = [];
			this._notify('clear');
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