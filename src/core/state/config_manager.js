// src/core/state/config_manager.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.State = global.Itera.State || {};

	class ConfigManager {
		constructor(vfs) {
			this.vfs = vfs;
			this.configPath = 'system/config/config.json';
			this.listeners = [];
			this.cache = this._getDefaults();

			this._load();

			this.vfs.on('change', (payload) => {
				if (payload.path === this.configPath) {
					console.log("[ConfigManager] Config file changed, reloading...");
					this._load();
					this._notify();
				}
			});
		}

		_getDefaults() {
			return {
				theme: 'system/themes/light.json',
				language: 'English',
				username: 'User',
				agentName: 'Itera',
				llm: {
					model: 'gemini-3.1-pro-preview',
					temperature: 1.0
				}
			};
		}

		_load() {
			try {
				if (this.vfs.exists(this.configPath)) {
					const content = this.vfs.readFile(this.configPath);
					const parsed = JSON.parse(content);
					this.cache = {
						...this._getDefaults(),
						...parsed
					};
				} else {
					this.cache = this._getDefaults();
				}
			} catch (e) {
				console.warn("[ConfigManager] Failed to load config, using defaults:", e);
				if (!this.cache) this.cache = this._getDefaults();
			}
		}

		on(event, callback) {
			this.listeners.push(callback);
		}

		_notify() {
			this.listeners.forEach(cb => cb(this.cache));
		}

		get(key) {
			return key ? this.cache[key] : this.cache;
		}

		update(updates) {
			const newConfig = {
				...this.cache,
				...updates
			};
			try {
				// ディレクトリがない場合は作成を試みる（VFSの実装によるが、念のため）
				const dir = this.configPath.split('/').slice(0, -1).join('/');
				if (this.vfs.createDirectory && !this.vfs.exists(dir)) {
					this.vfs.createDirectory(dir);
				}

				this.vfs.writeFile(this.configPath, JSON.stringify(newConfig, null, 4));
			} catch (e) {
				console.error("[ConfigManager] Failed to save config:", e);
				throw e;
			}
		}
	}

	global.Itera.State.ConfigManager = ConfigManager;

})(window);