// src/ui/main_controller.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.UI = global.Itera.UI || {};

	const {
		State,
		Control,
		Cognitive,
		Bridge,
		UI
	} = global.Itera;
	const {
		Components,
        Services
	} = UI;

	const DOM_IDS = {
		BTN_MOBILE_FILES: 'mobile-nav-files',
		BTN_MOBILE_CHAT: 'mobile-nav-chat',
		BTN_MOBILE_VIEW: 'mobile-nav-view',
		MOBILE_OVERLAY: 'mobile-overlay',
		SIDEBAR: 'sidebar',
		CHAT_PANEL: 'chat-panel',
		STORAGE_BAR: 'storage-usage-bar',
		STORAGE_TEXT: 'storage-usage-text',
		SAVE_STATUS: 'save-status',
		MODEL_STATUS: 'model-status'
	};

	class MainController {
		constructor() {
			this.config = global.Itera.Config || {};
			this.components = {};
			this.state = {};
			this.engine = null;
			this.bridge = null;
			this.saveTimer = null;
			this.els = {};
		}

		async init() {
			console.log("[Itera] Booting system...");
			this._initGenericElements();

			const storage = new State.StorageManager();
			await storage.ready();

			const savedSystem = await storage.loadSystemState();
			const initialFiles = savedSystem ? savedSystem.files : (this.config.DEFAULT_FILES || {});
			const initialHistory = savedSystem ? savedSystem.history : [];

            const vfs = new State.VirtualFileSystem(initialFiles);
			const history = new State.HistoryManager();
			history.load(initialHistory);
			const configManager = new State.ConfigManager(vfs);

			this.state = {
				storage,
				vfs,
				history,
				configManager
			};

			const themeManager = new UI.ThemeManager(configManager);
			const translator = new Cognitive.Translator();
            
            const renderer = (Services && Services.LPMLRenderer) 
                ? new Services.LPMLRenderer() 
                : null;

            if (!renderer) console.warn("[Itera] LPMLRenderer not found. Chat formatting will be disabled.");

			this.components.chat = new Components.ChatPanel(renderer);
			this.components.explorer = new Components.Explorer(vfs);
			this.components.editor = new Components.EditorModal();
			this.components.preview = new Components.PreviewPane();
			this.components.settings = new Components.SettingsModal(storage, configManager);
			this.components.media = new Components.MediaViewer();

			this.components.chat.setVfs(vfs);

			const registry = new Control.ToolRegistry();
			if (Control.Tools) {
				Control.Tools.registerFSTools(registry);
				Control.Tools.registerUITools(registry);
				Control.Tools.registerSysTools(registry);
				Control.Tools.registerSearchTools(registry);
				Control.Tools.registerBasicTools(registry);
			}

			this._createLLM = () => {
				const apiKey = localStorage.getItem('itera_api_key') || "";
				const conf = configManager.get('llm');
				const model = conf?.model || "gemini-3.1-pro-preview";
				this._updateModelStatus(model);
				return new Cognitive.GeminiAdapter(apiKey, model);
			};

			const projector = new Cognitive.GeminiProjector(this.config.SYSTEM_PROMPT || "");

			this.engine = new Control.Engine({
					history,
					vfs,
					configManager
				},
				projector,
				this._createLLM(),
				translator,
				registry, {
					ui: this
				}
			);

			this.bridge = new Bridge.HostBridge();
			this._setupBridgeHandlers();

			this._bindEvents();
			this._bindMobileUI();

			this.components.chat.renderHistory(history.get());
			this._updateStorageUI(vfs.getUsage());
			await this.refreshPreview();

			console.log("[Itera] System Ready.");
		}

		_initGenericElements() {
			Object.entries(DOM_IDS).forEach(([key, id]) => {
				this.els[key] = document.getElementById(id);
			});
		}

		_bindEvents() {
			const {
				chat,
				explorer,
				editor,
				media,
				settings,
				preview
			} = this.components;
			const {
				vfs,
				history,
				storage
			} = this.state;

			// Chat Events
			chat.on('send', async (text, attachments) => {
				// 1. キャッシュディレクトリの準備
				const CACHE_DIR = 'system/cache/media';
				if (!vfs.exists(CACHE_DIR) && vfs.createDirectory) {
					vfs.createDirectory(CACHE_DIR);
				}

				const content = [];

				for (const file of attachments) {
					const isText = file.type.startsWith('text/') || file.name.match(/\.(js|json|md|txt|html|css|xml|yml)$/);
					
					// ファイル読み込み
					const reader = new FileReader();
					const data = await new Promise(r => {
						reader.onload = () => r(reader.result);
						if (isText) reader.readAsText(file);
						else reader.readAsDataURL(file);
					});

					if (isText) {
						// テキストファイル
						content.push({
							text: `<user_attachment name="${file.name}">\n${data}\n</user_attachment>`
						});
					} else {
						// バイナリファイル
						const timestamp = Date.now();
						const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
						const path = `${CACHE_DIR}/${timestamp}_${safeName}`;

						try {
							vfs.writeFile(path, data);
							
                            // メディアオブジェクト（画像表示用・FileAPI用）
							content.push({
								media: {
									path: path,
									mimeType: file.type || 'application/octet-stream',
									metadata: {}
								}
							});
	
                            // user_inputの外に配置されるよう、独立したtextパーツとして追加
                            content.push({
                                text: `<user_attachment path="${path}">[Binary File: ${file.name}]</user_attachment>`
                            });

						} catch (e) {
							console.error(`[MainController] Failed to save upload: ${path}`, e);
							alert(`Failed to save attachment: ${e.message}`);
							return;
						}
					}
				}

				// ユーザーの入力テキストがあれば追加
				if (text) {
					content.push({ text: text });
				}

				if (content.length === 0) return;

				this._refreshEngineConfig();
				chat.setProcessing(true);
				await this.engine.injectUserTurn(content);
			});

			chat.on('stop', () => this.engine.stop());
			
			chat.on('clear', () => {
				if (confirm("Clear chat history and media cache?")) {
					history.clear();
					
					// キャッシュのパージ処理
					try {
						const CACHE_DIR = 'system/cache/media';
						// ディレクトリ内のファイルを削除（deleteDirectoryの実装によるが、配下を消す）
						if (vfs.deleteDirectory) {
							vfs.deleteDirectory(CACHE_DIR);
							console.log("[System] Media cache cleared.");
						}
					} catch (e) {
						console.warn("[System] Failed to clear media cache:", e);
					}

					chat.renderHistory([]);
				}
			});

			chat.on('delete_turn', (id) => {
				history.delete(id);
				chat.renderHistory(history.get());
			});
			chat.on('preview_request', (name, src, mime) => {
				media.open(name, src, mime);
				this._closeMobileDrawers(); // モバイル時は自動でパネルを閉じる
			});

			// Explorer Events
			explorer.on('open_file', (path, content) => {
				const BINARY_EXTS = /\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|zip|mp3|mp4|wav|ogg)$/i;
				if (path.match(BINARY_EXTS)) media.open(path, content);
				else editor.open(path, content);
	
				this._closeMobileDrawers(); // モバイル時は自動でパネルを閉じる
			});
			explorer.on('history_event', (type, desc) => {
				const lpml = `<event type="${type}">\n${desc}\n</event>`;
				const turn = history.append(global.Itera.Role.SYSTEM, lpml, {
					type: 'event_log'
				});
				chat.appendTurn(turn);
			});

			// Editor Events
			editor.on('save', (path, content) => {
				try {
					vfs.writeFile(path, content);
					this.refreshPreview();

                    const lpml = `<event type="file_edited">\nUser edited file manually: ${path}\n</event>`;
                    const turn = history.append(global.Itera.Role.SYSTEM, lpml, { type: 'event_log' });
                    chat.appendTurn(turn);

				} catch (e) {
					alert(e.message);
				}
			});

			// Settings Events
			settings.on('factory_reset', async () => {
                try {
                    const timestamp = new Date().toLocaleString();
                    const label = `Auto Backup (Pre-Reset) - ${timestamp}`;
                    await storage.createSnapshot(label, vfs.files, history.get());
                    console.log(`[System] Created safety snapshot: ${label}`);
                } catch (e) {
                    console.error("Auto backup failed:", e);
                    if (!confirm("Automatic backup failed. Continue reset anyway?")) return;
                }

				history.clear();
				vfs.loadFiles(this.config.DEFAULT_FILES);
				chat.renderHistory([]);
				await this.refreshPreview();
				alert("System Reset Complete. (Safety backup created)");
			});
			settings.on('create_snapshot', async (label) => await storage.createSnapshot(label, vfs.files, history.get()));
			settings.on('restore_snapshot', async (id) => {
				const snap = await storage.getSnapshot(id);
				if (snap) {
					vfs.loadFiles(snap.files);
					history.load(snap.history);
					chat.renderHistory(history.get());
					await this.refreshPreview();
				}
			});
			settings.on('api_key_updated', () => this._refreshEngineConfig());

			// Preview Events
			preview.on('refresh', () => this.refreshPreview());
			preview.on('home', () => this.refreshPreview('index.html'));

			// Engine Events
			this.engine.on('turn_start', (data) => {
				if (data.role === global.Itera.Role.MODEL) {
					chat.setProcessing(true);
					chat.startStreaming();
				}
			});
			this.engine.on('stream_chunk', (chunk) => chat.updateStreaming(chunk));

			this.engine.on('turn_end', (data) => {
				if (data.role === global.Itera.Role.MODEL) {
					chat.finalizeStreaming();
				} else {
					const turn = data.turn || history.getLast();
					chat.appendTurn(turn);
				}

				if (!this.engine.isRunning) chat.setProcessing(false);
				this._triggerAutoSave();
			});

            this.engine.on('loop_stop', (data) => {
                if (chat.currentStreamEl) chat.finalizeStreaming();
                chat.setProcessing(false);

                // エラーで停止した場合、履歴に追加されたエラーメッセージを表示する
                if (data && data.reason === 'error') {
                    const lastTurn = history.getLast();
                    if (lastTurn) {
                        chat.appendTurn(lastTurn);
                        console.error("[MainController] Loop stopped due to error:", data.error);
                    }
                }

                this._triggerAutoSave();
            });

			// State Listeners
			vfs.on('change', (payload) => {
				this._updateStorageUI(payload.usage);
				this._triggerAutoSave();
			});
			history.on('change', () => this._triggerAutoSave());
		}

		_setupBridgeHandlers() {
			const {
				vfs
			} = this.state;
			const bridge = this.bridge;

			bridge.registerHandler('read_file', ({
				path
			}) => vfs.readFile(path));
			bridge.registerHandler('save_file', ({
				path,
				content
			}) => vfs.writeFile(path, content));
			bridge.registerHandler('delete_file', ({
				path
			}) => vfs.deleteFile(path));
			bridge.registerHandler('stat_file', ({
				path
			}) => vfs.stat(path));
			bridge.registerHandler('list_files', ({
				path,
				options
			}) => vfs.listFiles({
				path,
				...options
			}));
			bridge.registerHandler('rename_file', ({
				oldPath,
				newPath
			}) => vfs.rename(oldPath, newPath));

			bridge.registerHandler('switch_view', async ({
				path
			}) => {
				await this.refreshPreview(path);
				this._closeMobileDrawers();
			});
			bridge.registerHandler('show_notification', ({
				message,
				title
			}) => console.log(`[Notification] ${title}: ${message}`));
			bridge.registerHandler('open_file', ({
				path
			}) => {
				const content = vfs.readFile(path);
				this.components.editor.open(path, content);
				this._closeMobileDrawers();
			});

			bridge.registerHandler('agent_trigger', async ({
				instruction,
				options
			}) => {
				if (this.engine.isRunning) throw new Error("Agent is busy.");
				let text = `[INTERNAL AGENT TRIGGER]\n${instruction}`;
				if (options?.context) text += `\n\nContext: ${JSON.stringify(options.context)}`;
				this._refreshEngineConfig();
				this.components.chat.setProcessing(true);
				await this.engine.injectUserTurn([{
					text
				}], {
					visible: !options?.silent
				});
			});
			bridge.registerHandler('view_ready', () => {});
		}

		_bindMobileUI() {
			const {
				BTN_MOBILE_FILES,
				BTN_MOBILE_CHAT,
				BTN_MOBILE_VIEW,
				MOBILE_OVERLAY,
				SIDEBAR,
				CHAT_PANEL
			} = this.els;
			if (!BTN_MOBILE_FILES) return;
			const reset = () => {
				if (SIDEBAR) {
					SIDEBAR.classList.remove('translate-x-0');
					SIDEBAR.classList.add('-translate-x-full');
				}
				if (CHAT_PANEL) {
					CHAT_PANEL.classList.remove('translate-x-0');
					CHAT_PANEL.classList.add('translate-x-full');
				}
				if (MOBILE_OVERLAY) MOBILE_OVERLAY.classList.add('hidden');
				[BTN_MOBILE_FILES, BTN_MOBILE_CHAT, BTN_MOBILE_VIEW].forEach(b => {
					b.classList.remove('text-primary', 'font-bold', 'bg-hover');
					b.classList.add('text-text-muted');
				});
			};
			const activate = (btn) => {
				btn.classList.remove('text-text-muted');
				btn.classList.add('text-primary', 'font-bold', 'bg-hover');
			};
			BTN_MOBILE_FILES.onclick = () => {
				reset();
				activate(BTN_MOBILE_FILES);
				if (SIDEBAR) {
					SIDEBAR.classList.remove('-translate-x-full');
					SIDEBAR.classList.add('translate-x-0');
				}
				if (MOBILE_OVERLAY) MOBILE_OVERLAY.classList.remove('hidden');
			};
			BTN_MOBILE_CHAT.onclick = () => {
				reset();
				activate(BTN_MOBILE_CHAT);
				if (CHAT_PANEL) {
					CHAT_PANEL.classList.remove('translate-x-full');
					CHAT_PANEL.classList.add('translate-x-0');
				}
				if (MOBILE_OVERLAY) MOBILE_OVERLAY.classList.remove('hidden');
			};
			BTN_MOBILE_VIEW.onclick = () => {
				reset();
				activate(BTN_MOBILE_VIEW);
			};
			if (MOBILE_OVERLAY) MOBILE_OVERLAY.onclick = () => {
				reset();
				activate(BTN_MOBILE_VIEW);
			};
		}

		_closeMobileDrawers() {
			const {
				BTN_MOBILE_VIEW
			} = this.els;
			if (BTN_MOBILE_VIEW && BTN_MOBILE_VIEW.onclick) BTN_MOBILE_VIEW.onclick();
		}

		_updateStorageUI(usage) {
			if (!this.els.STORAGE_BAR || !this.els.STORAGE_TEXT) return;
			const usedMB = (usage.used / 1024 / 1024).toFixed(1);
			const maxMB = (usage.max / 1024 / 1024).toFixed(1);
			this.els.STORAGE_TEXT.textContent = `${usedMB} / ${maxMB} MB`;
			
			const percent = Math.min(100, usage.percent);
			this.els.STORAGE_BAR.style.width = `${percent}%`;
			this.els.STORAGE_BAR.className = 'absolute top-0 left-0 h-full transition-all duration-500 ease-out';
            // font-mono text-gray-500 -> text-text-muted
			this.els.STORAGE_TEXT.className = 'font-mono text-text-muted';
			
			if (percent > 95) {
                // bg-red-500 -> bg-error
                // text-red-400 -> text-error
				this.els.STORAGE_BAR.classList.add('bg-error', 'animate-pulse');
				this.els.STORAGE_TEXT.classList.add('text-error', 'font-bold');
			} else if (percent > 80) {
                // bg-yellow-500 -> bg-warning
				this.els.STORAGE_BAR.classList.add('bg-warning');
			} else {
                // bg-blue-500 -> bg-primary
				this.els.STORAGE_BAR.classList.add('bg-primary');
			}
		}

		_updateModelStatus(modelName) {
			if (this.els.MODEL_STATUS) this.els.MODEL_STATUS.textContent = modelName;
		}

		_refreshEngineConfig() {
			if (this.engine) this.engine.llm = this._createLLM();
		}

		_triggerAutoSave() {
			if (this.saveTimer) clearTimeout(this.saveTimer);
			if (this.els.SAVE_STATUS) {
				this.els.SAVE_STATUS.classList.remove('opacity-0');
				this.els.SAVE_STATUS.textContent = "Saving...";
				this.els.SAVE_STATUS.className = 'text-[9px] text-warning italic transition opacity-100 scale-90 origin-left';
			}
			this.saveTimer = setTimeout(async () => {
				const {
					vfs,
					history,
					storage
				} = this.state;
				await storage.saveSystemState(vfs.files, history.get());
				if (this.els.SAVE_STATUS) {
					this.els.SAVE_STATUS.textContent = "Saved";
					this.els.SAVE_STATUS.className = 'text-[9px] text-success italic transition opacity-100 scale-90 origin-left';
					setTimeout(() => this.els.SAVE_STATUS.classList.add('opacity-0'), 2000);
				}
			}, 1000);
		}

		async refreshPreview(path) {
			await this.components.preview.refresh(this.state.vfs, path);
		}

		async captureScreenshot() {
			return await this.components.preview.captureScreenshot();
		}
	}

	global.Itera.UI.MainController = MainController;

})(window);