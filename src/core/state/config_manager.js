// src/core/state/config_manager.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.State = global.Itera.State || {};

    class ConfigManager {
        constructor(vfs) {
            this.vfs = vfs;
            this.configPath = 'system/config.json';
            this.listeners = [];
            this.cache = this._getDefaults();

            // 初期ロード
            this._load();

            // VFS監視: configファイルが変更されたら再ロード
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
                theme: 'dark', // 'dark' | 'light'
                language: 'English',
                username: 'User',
                agentName: 'Itera',
                llm: {
                    model: 'gemini-3-pro-preview',   // latest Gemini model.
                    temperature: 1.0
                }
            };
        }

        _load() {
            try {
                if (this.vfs.exists(this.configPath)) {
                    const content = this.vfs.readFile(this.configPath);
                    const parsed = JSON.parse(content);
                    // デフォルト値にマージ（新しい設定項目の欠落防止）
                    this.cache = { ...this._getDefaults(), ...parsed };
                } else {
                    // ファイルがない場合はデフォルトを使用（保存はしない、必要なら初期化時に作成されるはず）
                    this.cache = this._getDefaults();
                }
            } catch (e) {
                console.warn("[ConfigManager] Failed to load config.json:", e);
                // エラー時は安全のためデフォルトに戻すか、前回のキャッシュを維持するか。
                // ここではデフォルトに戻さず、エラー前の状態を維持する方が安全だが、初期化時はデフォルト。
                if (!this.cache) this.cache = this._getDefaults();
            }
        }

        on(event, callback) {
            // event引数は将来の拡張用（現状は 'update' のみ）
            this.listeners.push(callback);
        }

        _notify() {
            this.listeners.forEach(cb => cb(this.cache));
        }

        get(key) {
            return key ? this.cache[key] : this.cache;
        }

        // 値を更新してファイルに書き込むヘルパー
        update(updates) {
            const newConfig = { ...this.cache, ...updates };
            try {
                this.vfs.writeFile(this.configPath, JSON.stringify(newConfig, null, 4));
                // _load() と _notify() は VFS の 'change' イベント経由で発火する
            } catch (e) {
                console.error("[ConfigManager] Failed to save config:", e);
                throw e;
            }
        }
    }

    global.Itera.State.ConfigManager = ConfigManager;

})(window);