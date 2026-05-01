// src/shell/modals/sync_modal.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Shell = global.Itera.Shell || {};
	global.Itera.Shell.Modals = global.Itera.Shell.Modals || {};

	const DOM_IDS = {
		MODAL: 'sync-modal',
		BTN_CLOSE: 'btn-close-sync',
		BTN_AUTH: 'btn-auth-gdrive', // UI上のボタン
		BTN_SYNC_NOW: 'btn-sync-now',
		STATUS_TEXT: 'sync-status-text',
		PROVIDER_SELECT: 'sync-provider-select'
	};

	class SyncModal {
		constructor(syncManager, configManager) {
			this.syncManager = syncManager;
			this.configManager = configManager;
			this.els = {};
			this.events = {};

			this._initElements();
			this._bindEvents();
			this._updateUI();

			// SyncManagerのステータス変化を購読してUIを更新
			this.syncManager.on('status_change', (payload) => {
				this._updateStatusUI(payload.status, payload.details);
			});

			// トークン期限切れなどの外部要因による認証リセットイベントの購読
			window.addEventListener('itera_sync_auth_expired', () => {
				this._updateUI();
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
			// プロバイダの認証状態をHostのlocalStorageから判定する
			let secrets = {};
			try {
				secrets = JSON.parse(localStorage.getItem('itera_sync_secrets') || '{}');
			} catch (e) {}

			const currentProviderId = this.syncManager.provider.providerId;
			return !!secrets[currentProviderId]?.token;
		}

		_updateUI() {
			if (!this.els.MODAL) return;

			const isAuth = this._isAuthenticated();

			if (this.els.BTN_AUTH) {
				this.els.BTN_AUTH.classList.remove('opacity-75', 'cursor-wait'); // ロード状態のリセット

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
			const provider = this.syncManager.provider;

			if (this._isAuthenticated()) {
				// サインアウト処理
				if (confirm(`Disconnect Cloud Sync? This will stop synchronization.`)) {
					provider.clearAuth();
					this.syncManager.stopDaemon();
					this._updateUI();
				}
			} else {
				// サインイン処理 (OAuth フローの開始)
				const redirectUri = window.location.origin + window.location.pathname;
				let authUrl;

				try {
					// 認証URLの生成をプロバイダに委譲
					authUrl = provider.getAuthUrl(redirectUri);
				} catch (err) {
					alert(err.message);
					return;
				}

				// ポップアップを開いてログイン画面へ
				const popup = window.open(authUrl, 'itera_sync_auth', 'width=500,height=600');

				// UIを一時的に「待機中」に変更
				if (this.els.BTN_AUTH) {
					this.els.BTN_AUTH.innerHTML = `<span class="animate-pulse">Waiting for Auth...</span>`;
					this.els.BTN_AUTH.classList.add('opacity-75', 'cursor-wait');
				}

				// ポップアップ（index.html）からのコールバック送信を待ち受けるリスナー
				const messageHandler = (e) => {
					// セキュリティ: 同じオリジン（自身のindex.html）からのメッセージのみ受け付ける
					if (e.origin !== window.location.origin) return;

					if (e.data && e.data.type === 'ITERA_OAUTH_CALLBACK') {
						window.removeEventListener('message', messageHandler); // リスナーを解除

						// Googleはフラグメント（#）にトークンを返す。プロバイダによっては ?code= のため両方チェックする。
						const hashString = e.data.hash ? e.data.hash.substring(1) : '';
						const searchString = e.data.search ? e.data.search.substring(1) : '';
						const params = new URLSearchParams(hashString || searchString);

						// OAuthの標準的なアクセストークン名で取得（プロバイダが異なってもほぼ共通）
						const token = params.get('access_token');

						if (token) {
							// トークンの保存をプロバイダに委譲
							provider.saveAuthCallback({
								token: token
							});
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