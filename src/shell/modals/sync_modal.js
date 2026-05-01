// src/shell/modals/sync_modal.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Shell = global.Itera.Shell || {};
	global.Itera.Shell.Modals = global.Itera.Shell.Modals || {};

	const DOM_IDS = {
		MODAL: 'sync-modal',
		BTN_CLOSE: 'btn-close-sync',
		BTN_AUTH: 'btn-auth-gdrive',
		BTN_SYNC_NOW: 'btn-sync-now',
		STATUS_TEXT: 'sync-status-text',
		LAST_SYNC_TIME: 'sync-last-time',
		PROVIDER_SELECT: 'sync-provider-select'
	};

	class SyncModal {
		constructor(syncManager, configManager) {
			this.syncManager = syncManager;
			this.configManager = configManager;
			this.els = {};
			this.events = {};

			this.CLIENT_ID = '683000743319-ucl8e9it3l2e5grdgsq38ohdrd9fccej.apps.googleusercontent.com'; // ★ 本番デプロイ時に書き換える必要があります

			this._initElements();
			this._bindEvents();
			this._updateUI();

			// SyncManagerのステータス変化を購読してUIを更新
			this.syncManager.on('status_change', (payload) => {
				this._updateStatusUI(payload.status, payload.details);
			});
		}

		on(event, callback) {
			this.events[event] = callback;
		}

		_initElements() {
			Object.entries(DOM_IDS).forEach(([key, id]) => {
				this.els[key] = document.getElementById(id);
			});
		}

		_bindEvents() {
			if (this.els.BTN_CLOSE) {
				this.els.BTN_CLOSE.onclick = () => this.close();
			}

			if (this.els.BTN_AUTH) {
				this.els.BTN_AUTH.onclick = () => this._handleAuthToggle();
			}

			if (this.els.BTN_SYNC_NOW) {
				this.els.BTN_SYNC_NOW.onclick = () => {
					this.syncManager.performSync();
				};
			}
		}

		_isAuthenticated() {
			let secrets = {};
			try {
				secrets = JSON.parse(localStorage.getItem('itera_sync_secrets') || '{}');
			} catch (e) {}
			// シンプルな有無のチェック。有効期限は通信時に判明する
			return !!secrets.gdrive?.token;
		}

		_updateUI() {
			if (!this.els.MODAL) return;

			const isAuth = this._isAuthenticated();

			if (this.els.BTN_AUTH) {
				if (isAuth) {
					this.els.BTN_AUTH.textContent = "Sign Out";
					this.els.BTN_AUTH.className = "px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:text-error hover:bg-error/10 transition border border-border-main";
				} else {
					this.els.BTN_AUTH.innerHTML = `<span class="mr-2">G</span> Sign in with Google`;
					this.els.BTN_AUTH.className = "px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90 shadow transition border border-primary/50";
				}
			}

			if (this.els.BTN_SYNC_NOW) {
				this.els.BTN_SYNC_NOW.disabled = !isAuth;
				this.els.BTN_SYNC_NOW.className = `px-4 py-2 rounded-lg text-sm font-bold shadow transition ${isAuth ? 'bg-card hover:bg-hover text-text-main border border-border-main' : 'bg-card/50 text-text-muted border border-border-main/30 cursor-not-allowed'}`;
			}

			this._updateStatusUI(this.syncManager.isSyncing ? 'syncing' : 'idle');
		}

		_updateStatusUI(status, details = null) {
			if (!this.els.STATUS_TEXT) return;

			const map = {
				'idle': {
					text: '● Standby',
					color: 'text-text-muted'
				},
				'syncing': {
					text: '↻ Syncing...',
					color: 'text-warning animate-pulse'
				},
				'synced': {
					text: '✓ Synced Successfully',
					color: 'text-success'
				},
				'error': {
					text: '⚠️ Sync Error',
					color: 'text-error'
				}
			};

			const info = map[status] || map['idle'];
			this.els.STATUS_TEXT.innerHTML = `<span class="${info.color} font-bold mr-2">${info.text}</span> <span class="text-xs text-text-muted opacity-80">${details || ''}</span>`;
		}

		async _handleAuthToggle() {
			if (this._isAuthenticated()) {
				// サインアウト処理
				if (confirm("Disconnect Google Drive? This will stop cloud synchronization.")) {
					let secrets = {};
					try {
						secrets = JSON.parse(localStorage.getItem('itera_sync_secrets') || '{}');
					} catch (e) {}

					delete secrets.gdrive;
					localStorage.setItem('itera_sync_secrets', JSON.stringify(secrets));

					this.syncManager.stopDaemon();
					this._updateUI();
				}
			} else {
				// サインイン（OAuth 2.0 Implicit Flow）
				if (this.CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
					alert("Developer Mode: You must set your Google Client ID in src/shell/modals/sync_modal.js to use Google Drive Sync.");
					return;
				}

				// ポップアップがリダイレクトされるべきURI（現在のURLからクエリ等を除いたベース部分）
				const redirectUri = window.location.origin + window.location.pathname;
				const scope = 'https://www.googleapis.com/auth/drive.file';
				const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}`;

				// ポップアップを開いてGoogleログイン画面へ
				const popup = window.open(authUrl, 'gdrive_auth', 'width=500,height=600');

				// UIを一時的に「待機中」に変更
				if (this.els.BTN_AUTH) {
					this.els.BTN_AUTH.innerHTML = `<span class="animate-pulse">Waiting for Google...</span>`;
					this.els.BTN_AUTH.classList.add('opacity-75', 'cursor-wait');
				}

				// ポップアップ（index.html）からのコールバック送信を待ち受けるリスナー
				const messageHandler = (e) => {
					// セキュリティ: 同じオリジン（自身のindex.html）からのメッセージのみ受け付ける
					if (e.origin !== window.location.origin) return;

					if (e.data && e.data.type === 'ITERA_OAUTH_CALLBACK') {
						window.removeEventListener('message', messageHandler); // リスナーを解除

						// GoogleのImplicit Flowはフラグメント（#）にトークンを返すため、それを解析する
						const hashString = e.data.hash ? e.data.hash.substring(1) : '';
						const params = new URLSearchParams(hashString);
						const token = params.get('access_token');

						if (token) {
							// トークンの保存
							let secrets = {};
							try {
								secrets = JSON.parse(localStorage.getItem('itera_sync_secrets') || '{}');
							} catch (err) {}

							secrets.gdrive = {
								token: token.trim(),
								timestamp: Date.now()
							};
							localStorage.setItem('itera_sync_secrets', JSON.stringify(secrets));

							this._updateUI();

							// 認証後、すぐに初回同期を走らせる
							this.syncManager.startDaemon(5);
							this.syncManager.performSync();
						} else {
							const errorMsg = params.get('error') || "Authentication failed or token not found.";
							console.error("[SyncModal] OAuth Error:", errorMsg);
							alert("Authentication failed: " + errorMsg);
							this._updateUI();
						}
					}
				};

				window.addEventListener('message', messageHandler);

				// ポップアップがユーザーによって手動で閉じられた場合のフォールバック（タイムアウト監視）
				const checkClosed = setInterval(() => {
					if (popup && popup.closed) {
						clearInterval(checkClosed);
						window.removeEventListener('message', messageHandler);
						this._updateUI(); // ボタンの表示を元に戻す
					}
				}, 500);
			}
		}

		open() {
			if (this.els.MODAL) {
				this.els.MODAL.classList.remove('hidden');
				this._updateUI();
			}
		}

		close() {
			if (this.els.MODAL) {
				this.els.MODAL.classList.add('hidden');
			}
		}
	}

	global.Itera.Shell.Modals.SyncModal = SyncModal;

})(window);