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
			this.vfs = configManager.vfs;
			this.listeners = [];

			// 現在適用中のテーマファイルのパス
			this.currentThemePath = this._getThemePathFromConfig();

			// デフォルトテーマ (フォールバック用)
			this.defaultTheme = {
				colors: {
					bg: {
						app: "#111827",
						panel: "#1f2937",
						card: "#374151",
						hover: "#4b5563",
						overlay: "#000000"
					},
					border: {
						main: "#374151",
						highlight: "#3b82f6"
					},
					text: {
						main: "#f3f4f6",
						muted: "#9ca3af",
						inverted: "#111827",
						system: "#60a5fa",
						tag_attr: "#9ca3af",
						tag_content: "#d1d5db"
					},
					accent: {
						primary: "#2563eb",
						success: "#059669",
						warning: "#d97706",
						error: "#dc2626"
					},
					tags: {
						thinking: "#1e3a8a",
						plan: "#064e3b",
						report: "#312e81",
						error: "#7f1d1d"
					}
				}
			};

			// 初期ロード
			this._loadAndApply();

			// 1. 設定変更の監視 (テーマ切り替え)
			this.configManager.on('update', (newConfig) => {
				if (newConfig.theme && newConfig.theme !== this.currentThemePath) {
					console.log(`[ThemeManager] Switching theme: ${this.currentThemePath} -> ${newConfig.theme}`);
					this.currentThemePath = newConfig.theme;
					this._loadAndApply();
				}
			});

			// 2. ファイル変更の監視 (現在適用中のテーマファイルの編集)
			if (this.vfs) {
				this.vfs.on('change', (payload) => {
					if (payload.path === this.currentThemePath) {
						console.log("[ThemeManager] Current theme file updated, reloading...");
						this._loadAndApply();
					}
				});
			}
		}

		onThemeChange(callback) {
			this.listeners.push(callback);
		}

		_getThemePathFromConfig() {
			const config = this.configManager.get();
			return config.theme || 'system/themes/dark.json';
		}

		_loadAndApply() {
			let themeData = this.defaultTheme;

			try {
				if (this.vfs && this.vfs.exists(this.currentThemePath)) {
					const content = this.vfs.readFile(this.currentThemePath);
					const parsed = JSON.parse(content);
					themeData = this._deepMerge(this.defaultTheme, parsed);
				} else {
					console.warn(`[ThemeManager] Theme file not found: ${this.currentThemePath}`);
				}
			} catch (e) {
				console.warn("[ThemeManager] Failed to parse theme json.", e);
			}

			this._applyToCSS(themeData);
			this._notifyListeners(themeData);
		}

		/**
		 * CSS変数をルートに注入
		 */
		_applyToCSS(theme) {
			const root = document.documentElement;
			const colors = theme.colors;

			const setVar = (name, hex) => {
				const rgb = this._hexToRgb(hex);
				if (rgb) root.style.setProperty(name, rgb);
			};

			// 1. Backgrounds
			setVar('--c-bg-app', colors.bg.app);
			setVar('--c-bg-panel', colors.bg.panel);
			setVar('--c-bg-card', colors.bg.card);
			setVar('--c-bg-hover', colors.bg.hover);
			setVar('--c-bg-overlay', colors.bg.overlay);

			// 2. Borders
			setVar('--c-border-main', colors.border.main);
			setVar('--c-border-highlight', colors.border.highlight);

			// 3. Text
			setVar('--c-text-main', colors.text.main);
			setVar('--c-text-muted', colors.text.muted);
			setVar('--c-text-inverted', colors.text.inverted);
			setVar('--c-text-system', colors.text.system);
			setVar('--c-text-tag-attr', colors.text.tag_attr);
			setVar('--c-text-tag-content', colors.text.tag_content);

			// 4. Accents
			setVar('--c-accent-primary', colors.accent.primary);
			setVar('--c-accent-success', colors.accent.success);
			setVar('--c-accent-warning', colors.accent.warning);
			setVar('--c-accent-error', colors.accent.error);

			// 5. Tags
			setVar('--c-tag-thinking', colors.tags.thinking);
			setVar('--c-tag-plan', colors.tags.plan);
			setVar('--c-tag-report', colors.tags.report);
			setVar('--c-tag-error', colors.tags.error);
		}

		_notifyListeners(theme) {
			this.listeners.forEach(cb => cb(theme));
		}

		// --- Helpers ---

		_hexToRgb(hex) {
			if (!hex) return null;
			const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
			hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
			const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
			return result ?
				`${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}` :
				null;
		}

		_deepMerge(target, source) {
			const output = {
				...target
			};
			if (this._isObject(target) && this._isObject(source)) {
				Object.keys(source).forEach(key => {
					if (this._isObject(source[key])) {
						if (!(key in target)) Object.assign(output, {
							[key]: source[key]
						});
						else output[key] = this._deepMerge(target[key], source[key]);
					} else {
						Object.assign(output, {
							[key]: source[key]
						});
					}
				});
			}
			return output;
		}

		_isObject(item) {
			return (item && typeof item === 'object' && !Array.isArray(item));
		}
	}

	global.Itera.UI.ThemeManager = ThemeManager;

})(window);