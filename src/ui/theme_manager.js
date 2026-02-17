// src/ui/theme_manager.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.UI = global.Itera.UI || {};

    class ThemeManager {
        /**
         * @param {ConfigManager} configManager 
         */
        constructor(configManager) {
            this.configManager = configManager;
            this.listeners = []; // Theme change listeners (e.g. for Monaco)

            // 初期ロード
            const current = this.configManager.get('theme') || 'dark';
            this._apply(current);

            // 設定変更の監視
            this.configManager.on('update', (newConfig) => {
                if (newConfig.theme) {
                    this._apply(newConfig.theme);
                }
            });
        }

        /**
         * テーマ変更の通知を受け取るリスナーを登録
         * @param {Function} callback (theme: 'dark'|'light') => void
         */
        onThemeChange(callback) {
            this.listeners.push(callback);
        }

        /**
         * テーマを手動設定（Configも更新される）
         * @param {string} theme - 'dark' or 'light'
         */
        setTheme(theme) {
            this.configManager.update({ theme });
            // _apply は ConfigManager のイベント経由で呼ばれる
        }

        _apply(theme) {
            const root = document.documentElement;
            
            if (theme === 'dark') {
                root.classList.add('dark');
                root.style.colorScheme = 'dark';
            } else {
                root.classList.remove('dark');
                root.style.colorScheme = 'light';
            }

            // 登録されたリスナー（エディタなど）に通知
            this.listeners.forEach(cb => cb(theme));
        }

        /**
         * 現在のテーマを取得
         */
        get current() {
            return this.configManager.get('theme') || 'dark';
        }
    }

    global.Itera.UI.ThemeManager = ThemeManager;

})(window);