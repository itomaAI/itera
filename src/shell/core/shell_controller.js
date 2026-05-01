// src/ui/main_controller.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Shell = global.Itera.Shell || {};

	const {
		State,
		Control,
		Cognitive,
		Bridge,
		Shell
	} = global.Itera;
	const {
		Core,
		Windowing,
		Panels,
		Modals,
		Services
	} = Shell;

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
		MODEL_STATUS: 'model-status',
		ADDRESS_BAR: 'preview-address-bar',
		BTN_SYNC: 'btn-sync',
		SYNC_INDICATOR: 'sync-status-indicator' // ★ 追加
	};

	class ShellController {
		constructor() {
			this.config = global.Itera.Config || {};
			this.panels = {};
			this.modals = {};
			this.windowing = {};
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
			let initialFiles = savedSystem ? savedSystem.files : (this.config.DEFAULT_FILES || {});
			const initialHistory = savedSystem ? savedSystem.history : [];

			// 🌟 OS Update Migration: Sync core system files unless disabled
			let autoUpdate = true;
			if (savedSystem && initialFiles['system/config/config.json']) {
				try {
					const cfg = JSON.parse(initialFiles['system/config/config.json'].content);
					if (cfg.autoUpdateSystemFiles === false) autoUpdate = false;
				} catch (e) {} // Parse error -> safe default
			}

			if (autoUpdate && this.config.DEFAULT_FILES) {
				Object.keys(this.config.DEFAULT_FILES).forEach(path => {
					if (path.startsWith('docs/') || path.startsWith('system/lib/') || path.startsWith('system/kernel/')) {
						initialFiles[path] = {
							content: this.config.DEFAULT_FILES[path],
							meta: {
								created_at: Date.now(),
								updated_at: Date.now()
							}
						};
					}
				});
				console.log("[System] Core libraries and manuals auto-updated.");
			}

			const vfs = new State.VirtualFileSystem(initialFiles);
			const history = new State.HistoryManager();
			history.load(initialHistory);
			const configManager = new State.ConfigManager(vfs);
			const logger = new State.SystemLogger(vfs);

			this.state = {
				storage,
				vfs,
				history,
				configManager,
				logger
			};

			const themeManager = new Core.ThemeManager(configManager);
			const translator = new Cognitive.Translator();

			const renderer = (Services && Services.LPMLRenderer) ?
				new Services.LPMLRenderer() :
				null;

			if (!renderer) console.warn("[Itera] LPMLRenderer not found. Chat formatting will be disabled.");

			this.panels.chat = new Panels.ChatPanel(renderer);
			this.panels.explorer = new Panels.Explorer(vfs);
			this.modals.editor = new Modals.EditorModal();
			this.windowing.processManager = new Windowing.ProcessManager(vfs);
			this.modals.timeMachine = new Modals.TimeMachineModal(storage, configManager);
			this.modals.media = new Modals.MediaViewer();
			this.modals.apiSettings = new Modals.ApiSettingsModal(); // ★ 新規追加

			// Cloud Sync Initialization
			if (global.Itera.Sync && global.Itera.Sync.SyncManager) {
				const syncManager = new global.Itera.Sync.SyncManager(vfs, configManager);
				this.state.syncManager = syncManager;
				this.modals.sync = new Modals.SyncModal(syncManager, configManager);
				
				// 認証済みならブート時にデーモンを開始 (5分間隔)
				let secrets = {};
				try { secrets = JSON.parse(localStorage.getItem('itera_sync_secrets') || '{}'); } catch(e) {}
				if (secrets.gdrive?.token) {
					syncManager.startDaemon(5);
				}
			}

			this.panels.chat.setVfs(vfs);

			const registry = new Control.ToolRegistry();
			this.registry = registry;

			// URI Router の初期化とハンドラ登録
			this.uriRouter = new Core.UriRouter('view');
			this._registerUriHandlers();

			// プロセス終了時に動的ツールを一掃する連携
			this.windowing.processManager.on('process_killed', (pid) => {
				if (registry.removeToolsByPid) registry.removeToolsByPid(pid);
			});

			if (Control.Tools) {
				Control.Tools.registerFSTools(registry);
				Control.Tools.registerUITools(registry);
				Control.Tools.registerSysTools(registry);
				Control.Tools.registerSearchTools(registry);
				Control.Tools.registerBasicTools(registry);
			}

			// Engineの初期化 (AdapterとProjectorは後で注入)
			this.engine = new Control.Engine({
					history,
					vfs,
					configManager
				},
				null,
				null,
				translator,
				registry, {
					shell: this
				}
			);

			// LLMとProjectorの初回セットアップ
			this._refreshEngineConfig();

			// シークレット変更時の再セットアップ
			this.modals.apiSettings.on('secrets_updated', () => this._refreshEngineConfig());

			// Initialize new IPC transport and API router
			this.transport = new global.Itera.Ipc.HostTransport();
			this.apiRouter = new global.Itera.Api.ApiRouter(this.transport, {
				vfs: vfs,
				history: history,
				engine: this.engine,
				processManager: this.windowing.processManager,
				shell: this,
				toolRegistry: registry,
				configManager: configManager
			});

			this._bindEvents();
			this._bindMobileUI();

			this.panels.chat.renderHistory(history.get());
			this._updateStorageUI(vfs.getUsage());

			// OS Boot Sequence: Start background services
			try {
				if (vfs.exists('system/config/services.json')) {
					const services = JSON.parse(vfs.readFile('system/config/services.json'));
					if (Array.isArray(services)) {
						for (const svc of services) {
							if (svc.pid && svc.path) {
								await this.windowing.processManager.spawn(svc.pid, svc.path, 'background');
							}
						}
					}
				}
			} catch (e) {
				console.warn("[System] Failed to load services.json", e);
			}

			// OS-level daily maintenance (Cron)
			const performDailyMaintenance = () => {
				let purged = 0;
				if (typeof vfs.purgeTrash === 'function') purged += vfs.purgeTrash(7);
				if (this.state.logger) purged += this.state.logger.purgeOldLogs(7);

				if (purged > 0) {
					console.log(`[System Cron] Daily maintenance completed. Purged ${purged} old files.`);
					this._triggerAutoSave();
				}
			};

			// Run once on boot, then every 24 hours
			performDailyMaintenance();
			setInterval(performDailyMaintenance, 24 * 60 * 60 * 1000);

			// Start foreground main process
			await this.refreshPreview();

			if (this.state.logger) {
				this.state.logger.log('system', {
					action: 'boot',
					message: 'System booted successfully'
				});
			}
			console.log("[Itera] System Ready.");
		}

		_registerUriHandlers() {
			// 'view': プレビュー画面の更新
			this.uriRouter.register('view', (path, searchAndHash) => {
				const fullPath = path + searchAndHash;
				this.refreshPreview(fullPath);
			});

			// 'edit': ホストエディタの起動
			this.uriRouter.register('edit', (path) => {
				if (this.state.vfs.exists(path)) {
					const content = this.state.vfs.readFile(path);
					this.modals.editor.open(path, content);
					this._closeMobileDrawers();
				} else {
					global.AppUI.notify(`File not found: ${path}`, 'error');
				}
				// エディタを開いた後は、アドレスバーの表示を元のメインプロセスのパスに戻す
				this._restoreAddressBar();
			});
		}

		_initGenericElements() {
			Object.entries(DOM_IDS).forEach(([key, id]) => {
				this.els[key] = document.getElementById(id);
			});
		}

		_bindEvents() {
			const {
				chat,
				explorer
			} = this.panels;

			const handleAddressNavigate = () => {
				const input = this.els.ADDRESS_BAR.value.trim();
				if (!input) return;

				try {
					// 入力された文字列の解釈と実行はすべてルーターに委譲
					this.uriRouter.dispatch(input);
				} catch (e) {
					console.error("[Router] Navigation failed:", e);
					global.AppUI.notify(e.message, 'warning');
					this._restoreAddressBar();
				} finally {
					this.els.ADDRESS_BAR.blur();
				}
			};

			if (this.els.ADDRESS_BAR) {
				this.els.ADDRESS_BAR.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') handleAddressNavigate();
				});
			}

			const btnAddressGo = document.getElementById('btn-address-go');
			if (btnAddressGo) {
				// モバイル等でボタンタップ時にinputのフォーカスが外れてボタンが消えるのを防ぐ
				btnAddressGo.addEventListener('mousedown', (e) => e.preventDefault());
				btnAddressGo.addEventListener('touchstart', (e) => e.preventDefault(), {
					passive: false
				});
				btnAddressGo.addEventListener('click', handleAddressNavigate);
			}
			const {
				editor,
				media
			} = this.modals;
			const {
				vfs,
				history,
				storage
			} = this.state;

			// Chat Events
			chat.on('send', async (text, attachments) => {
				const CACHE_DIR = 'system/cache/media';
				const content = [];

				for (const file of attachments) {
					// テキストのホワイトリスト方式。未知のファイルはすべてバイナリ(Base64)として安全に扱う
					const isText = file.type.startsWith('text/') ||
						file.type === 'application/json' || file.type === 'application/xml' ||
						!!file.name.match(/\.(txt|md|js|json|html|css|xml|yml|yaml|csv|log|sh|py)$/i);

					// ファイル読み込み
					const reader = new FileReader();
					const data = await new Promise(r => {
						reader.onload = () => r(reader.result);
						if (isText) reader.readAsText(file);
						else reader.readAsDataURL(file);
					});

					// キャッシュディレクトリの作成 (テキスト/バイナリ共通)
					if (!vfs.exists(CACHE_DIR) && vfs.createDirectory) {
						vfs.createDirectory(CACHE_DIR);
					}

					const timestamp = Date.now();
					// / \ : * ? " < > | および制御文字を除去
					const safeName = file.name.replace(/[\/\\:*?"<>|\x00-\x1F]/g, '_');
					const path = `${CACHE_DIR}/${timestamp}_${safeName}`;

					try {
						// VFSへの保存 (テキスト/バイナリ共通)
						vfs.writeFile(path, data);

						if (isText) {
							// テキストファイル: 内容を展開しつつ、path属性を付与
							content.push({
								text: `<user_attachment name="${file.name}" path="${path}">\n${data}\n</user_attachment>`
							});
						} else {
							// バイナリファイル: メディアオブジェクトとして追加
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
						}
					} catch (e) {
						console.error(`[MainController] Failed to save upload: ${path}`, e);
						alert(`Failed to save attachment: ${e.message}`);
						return;
					}
				}

				// ユーザーの入力テキストがあれば追加
				if (text) {
					content.push({
						text: text
					});
				}

				if (content.length === 0) return;

				this._refreshEngineConfig();
				chat.setProcessing(true);
				await this.engine.injectUserTurn(content);
			});

			chat.on('stop', () => this.engine.stop());

			chat.on('clear', () => {
				if (confirm("Clear chat history and media cache?")) {
					this.clearSession({
						purgeMedia: true,
						triggerLlm: false
					});
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
			explorer.on('run_file', (path) => {
				this.refreshPreview(path);
				this._closeMobileDrawers();
			});
			explorer.on('history_event', (type, desc) => {
				const lpml = `<event type="${type}">\n${desc}\n</event>`;
				const turn = history.append(global.Itera.Role.SYSTEM, lpml, {
					type: 'event_log',
					trigger_llm: false // ログとして残すが即座に発火させない
				});
				chat.appendTurn(turn);
			});

			// Cloud Sync Events
			if (this.els.BTN_SYNC && this.modals.sync) {
				this.els.BTN_SYNC.onclick = () => this.modals.sync.open();
			}
			if (this.state.syncManager && this.els.SYNC_INDICATOR) {
				const ind = this.els.SYNC_INDICATOR;
				this.state.syncManager.on('status_change', (payload) => {
					ind.classList.remove('hidden', 'text-text-muted', 'text-warning', 'text-success', 'text-error', 'animate-pulse');
					
					switch (payload.status) {
						case 'idle':
							ind.classList.add('text-text-muted');
							break;
						case 'syncing':
							ind.classList.add('text-warning', 'animate-pulse');
							break;
						case 'synced':
							ind.classList.add('text-success');
							break;
						case 'error':
							ind.classList.add('text-error');
							break;
					}
					if (payload.details) ind.title = payload.details;
				});
				
				// 起動時に認証済みなら表示
				let secrets = {};
				try { secrets = JSON.parse(localStorage.getItem('itera_sync_secrets') || '{}'); } catch(e) {}
				if (secrets.gdrive?.token) {
					ind.classList.remove('hidden');
					ind.classList.add('text-text-muted');
				}
			}

			// Editor Events
			editor.on('save', (path, content) => {
				try {
					vfs.writeFile(path, content);
					this.refreshPreview();

					const lpml = `<event type="file_edited">\nUser edited file manually: ${path}\n</event>`;
					const turn = history.append(global.Itera.Role.SYSTEM, lpml, {
						type: 'event_log',
						trigger_llm: false
					});
					chat.appendTurn(turn);

				} catch (e) {
					alert(e.message);
				}
			});

			// Time Machine & System Reset Events
			this.modals.timeMachine.on('factory_reset', async () => {
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
			this.modals.timeMachine.on('create_snapshot', async (label) => await storage.createSnapshot(label, vfs.files, history.get()));
			this.modals.timeMachine.on('restore_snapshot', async (id) => {
				const snap = await storage.getSnapshot(id);
				if (snap) {
					vfs.loadFiles(snap.files);
					history.load(snap.history);
					chat.renderHistory(history.get());
					await this.refreshPreview();
				}
			});
			this.modals.timeMachine.on('api_key_updated', () => this._refreshEngineConfig());

			// Process Manager Events handled internally by components, no direct hooks needed here.

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

				if (data && data.reason === 'error') {
					console.error("[MainController] Loop stopped due to error:", data.error);
				}

				this._triggerAutoSave();
			});

			// State Listeners
			vfs.on('change', (payload) => {
				this._updateStorageUI(payload.usage);
				this._triggerAutoSave();

				// システムログへのサイレントな書き込みはゲストアプリにブロードキャストしない（パフォーマンス保護）
				if (!payload.path || !payload.path.startsWith('system/logs/')) {
					this.windowing.processManager.broadcast('file_changed', payload);
				}
			});
			history.on('change', () => this._triggerAutoSave());
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
			this.els.STORAGE_TEXT.className = 'font-mono text-text-muted';

			if (percent > 95) {
				this.els.STORAGE_BAR.classList.add('bg-error', 'animate-pulse');
				this.els.STORAGE_TEXT.classList.add('text-error', 'font-bold');
			} else if (percent > 80) {
				this.els.STORAGE_BAR.classList.add('bg-warning');
			} else {
				this.els.STORAGE_BAR.classList.add('bg-primary');
			}
		}

		_updateModelStatus(modelName) {
			if (this.els.MODEL_STATUS) this.els.MODEL_STATUS.textContent = modelName;
		}

		_refreshEngineConfig() {
			if (!this.engine) return;

			// 1. config.json (VFS) からモデル定義を取得し、プロバイダを判定
			const configManager = this.state.configManager;
			const rawModel = configManager.get('llm')?.model || this.config.DEFAULT_MODEL;

			let provider = "google";
			let modelName = rawModel;

			const slashIdx = rawModel.indexOf('/');
			if (slashIdx !== -1) {
				provider = rawModel.substring(0, slashIdx).toLowerCase();
				modelName = rawModel.substring(slashIdx + 1);
			}

			// 2. localStorage からシークレット(APIキー等)を取得
			let secrets = {};
			try {
				secrets = JSON.parse(localStorage.getItem('itera_llm_secrets') || '{}');
			} catch (e) {}

			if (!secrets.google && localStorage.getItem('itera_api_key')) {
				secrets.google = localStorage.getItem('itera_api_key');
			}

			// 3. UIの更新 (チャットパネル上のバッジにプロバイダ名を付けて表示)
			this._updateModelStatus(`${provider}/${modelName}`);

			// 4. Provider に応じた Projector と Adapter のファクトリ
			const sysPrompt = this.config.SYSTEM_PROMPT || "";
			const apiKey = secrets[provider] || "";

			let newLlm, newProjector;

			switch (provider) {
				case 'openai':
					if (Cognitive.OpenAIProjector && Cognitive.OpenAIAdapter) {
						newProjector = new Cognitive.OpenAIProjector(sysPrompt);
						newLlm = new Cognitive.OpenAIAdapter(apiKey, modelName, "https://api.openai.com/v1", {}, this.state.logger);
					} else {
						console.warn(`[Shell] OpenAI adapters not yet loaded. Fallback to Gemini.`);
						newProjector = new Cognitive.GeminiProjector(sysPrompt);
						newLlm = new Cognitive.GeminiAdapter(secrets.google, modelName, {}, this.state.logger);
					}
					break;

				case 'openrouter':
					if (Cognitive.OpenAIProjector && Cognitive.OpenAIAdapter) {
						newProjector = new Cognitive.OpenAIProjector(sysPrompt);
						newLlm = new Cognitive.OpenAIAdapter(apiKey, modelName, "https://openrouter.ai/api/v1", {}, this.state.logger);
					} else {
						console.warn(`[Shell] OpenAI adapters not yet loaded. Fallback to Gemini.`);
						newProjector = new Cognitive.GeminiProjector(sysPrompt);
						newLlm = new Cognitive.GeminiAdapter(secrets.google, modelName, {}, this.state.logger);
					}
					break;

				case 'anthropic':
					if (Cognitive.AnthropicProjector && Cognitive.AnthropicAdapter) {
						newProjector = new Cognitive.AnthropicProjector(sysPrompt);
						newLlm = new Cognitive.AnthropicAdapter(apiKey, modelName, {}, this.state.logger);
					} else {
						console.warn(`[Shell] Anthropic adapters not yet loaded. Fallback to Gemini.`);
						newProjector = new Cognitive.GeminiProjector(sysPrompt);
						newLlm = new Cognitive.GeminiAdapter(secrets.google, modelName, {}, this.state.logger);
					}
					break;

				case 'custom':
					if (Cognitive.OpenAIProjector && Cognitive.OpenAIAdapter) {
						const baseUrl = secrets.custom_url || "http://localhost:11434/v1";
						newProjector = new Cognitive.OpenAIProjector(sysPrompt);
						newLlm = new Cognitive.OpenAIAdapter(apiKey, modelName, baseUrl, {}, this.state.logger);
					} else {
						console.warn(`[Shell] Custom adapters not yet loaded. Fallback to Gemini.`);
						newProjector = new Cognitive.GeminiProjector(sysPrompt);
						newLlm = new Cognitive.GeminiAdapter(secrets.google, modelName, {}, this.state.logger);
					}
					break;

				case 'google':
				default:
					newProjector = new Cognitive.GeminiProjector(sysPrompt);
					newLlm = new Cognitive.GeminiAdapter(apiKey, modelName, {}, this.state.logger);
					break;
			}

			// Engine への注入
			this.engine.projector = newProjector;
			this.engine.llm = newLlm;
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
			// mainプロセスとして起動するショートカット
			const currentPath = this.windowing.processManager.processes.get('main')?.path || 'index.html';
			await this.windowing.processManager.spawn('main', path || currentPath, 'foreground', true);
		}

		async captureScreenshot() {
			return await this.windowing.processManager.captureScreenshot('main');
		}

		/**
		 * セッション（履歴）をクリアし、必要に応じて情報を引き継ぐ
		 * @param {Object} options - { purgeMedia: boolean, summary: string, triggerLlm: boolean, restoreTools: boolean }
		 */
		async clearSession(options = {}) {
			const {
				history,
				vfs
			} = this.state;
			const purgeMedia = options.purgeMedia || false;
			const summary = options.summary || null;
			const triggerLlm = options.triggerLlm || false;
			const restoreTools = options.restoreTools || false;

			// 1. セッションリセットのロギング
			if (this.state.logger) {
				this.state.logger.log('system', {
					action: 'session_reset',
					purgeMedia,
					restoreTools,
					hasSummary: !!summary
				});
			}

			// 2. 履歴のクリア
			history.clear();

			// 3. メディアキャッシュのパージ
			if (purgeMedia) {
				try {
					const CACHE_DIR = 'system/cache/media';
					if (vfs.deleteDirectory && vfs.exists(CACHE_DIR)) {
						vfs.deleteDirectory(CACHE_DIR);
						console.log("[System] Media cache cleared.");
					}
				} catch (e) {
					console.warn("[System] Failed to clear media cache:", e);
				}
			}

			// 4. 現在有効な動的ツールの再注入
			if (restoreTools && this.registry && this.registry.getActiveDynamicToolDefinitions) {
				const activeToolDefs = this.registry.getActiveDynamicToolDefinitions();
				if (activeToolDefs.length > 0) {
					const defsText = activeToolDefs.join('\n');
					history.append(global.Itera.Role.SYSTEM, `<event type="tool_available">\n[System: Restored Dynamic Tools]\nThe following tools are currently active from background processes:\n${defsText}\n</event>`, {
						type: 'tool_available',
						trigger_llm: false
					});
				}
			}

			// 5. 引き継ぎ情報の注入
			if (summary) {
				history.append(global.Itera.Role.SYSTEM, `<event type="session_reset">\n[Session Restored & Context Compressed]\n\n${summary}\n</event>`, {
					type: 'event_log',
					trigger_llm: triggerLlm
				});
			}

			// 6. UIの再描画
			this.panels.chat.renderHistory(history.get());
		}

		/**
		 * エディタなどを開いた後、アドレスバーの表示を現在の「メインプロセス」のパスに戻す
		 */
		_restoreAddressBar() {
			if (!this.windowing || !this.windowing.processManager) return;
			const mainProc = this.windowing.processManager.processes.get('main');
			const path = mainProc ? mainProc.path : 'index.html';
			this.windowing.processManager._updateAddressBar(path);
		}
	}

	global.Itera.Shell.ShellController = ShellController;

})(window);