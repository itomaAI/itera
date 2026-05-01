// src/core/sync/sync_manager.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Sync = global.Itera.Sync || {};

	const SyncEngine = global.Itera.Sync.SyncEngine;
	const GDriveProvider = global.Itera.Sync.Providers.GDriveProvider;

	class SyncManager {
		constructor(vfs, configManager) {
			this.vfs = vfs;
			this.configManager = configManager;
			this.provider = new GDriveProvider(configManager); // 現状はGoogle Drive固定

			this.isSyncing = false;
			this.daemonTimer = null;
			this.listeners = {
				'status_change': []
			};

			this.lastSyncMeta = null; // 不要なフェッチを避けるためのキャッシュ
		}

		on(event, callback) {
			if (this.listeners[event]) {
				this.listeners[event].push(callback);
			}
		}

		_emitStatus(status, details = null) {
			this.listeners['status_change'].forEach(cb => cb({
				status,
				details
			}));
		}

		/**
		 * バックグラウンドでの定期同期を開始する
		 * @param {number} intervalMinutes - 実行間隔（分）
		 */
		startDaemon(intervalMinutes = 5) {
			this.stopDaemon();

			// 初回実行を少し遅延させてOSの起動を妨げないようにする
			setTimeout(() => this.performSync(), 5000);

			this.daemonTimer = setInterval(() => {
				this.performSync();
			}, intervalMinutes * 60 * 1000);

			console.log(`[SyncManager] Daemon started (Interval: ${intervalMinutes}m).`);
		}

		stopDaemon() {
			if (this.daemonTimer) {
				clearInterval(this.daemonTimer);
				this.daemonTimer = null;
			}
		}

		/**
		 * 同期プロセスを1回手動で実行する
		 */
		async performSync() {
			if (this.isSyncing) {
				console.log("[SyncManager] Sync is already running. Skipped.");
				return;
			}

			// プロバイダ（認証）の準備確認
			const isAuthed = await this.provider.auth();
			if (!isAuthed) {
				// 認証失敗時、プロバイダ自身に不要なトークンの破棄を委譲する
				this.provider.clearAuth();
				this.stopDaemon();

				this._emitStatus('error', 'Session expired. Please Sign In again.');
				window.dispatchEvent(new Event('itera_sync_auth_expired'));
				return;
			}

			this.isSyncing = true;
			this._emitStatus('syncing');
			let successCount = 0;
			let errorCount = 0;

			try {
				// 1. インデックスのメタデータ（更新日時）を取得し、変更があるかチェック
				const remoteMeta = await this.provider.getIndexMetadata();
				let remoteIndex = null;

				if (remoteMeta) {
					// TODO: キャッシュを用いた最適化は将来拡張。今回は安全のため常に取得する
					remoteIndex = await this.provider.getIndex();
				}

				// 2. 差分計算
				const diff = SyncEngine.computeDiff(this.vfs.files, remoteIndex);
				let newIndexData = diff.newIndexData;

				// 3. Download キューの処理
				for (const item of diff.downloadQueue) {
					try {
						const content = await this.provider.downloadFile(item.remote_id);
						// VFSに書き込む (silentはAPI Routerのイベント発火を防ぐが、VFS自体のchangeイベントは発火しUIは更新される)
						this.vfs.writeFile(item.path, content);
						successCount++;
						console.log(`[SyncManager] Downloaded: ${item.path}`);
					} catch (e) {
						console.error(`[SyncManager] Failed to download ${item.path}:`, e);
						errorCount++;
						// エラーが起きたファイルはインデックスから外し、次回再試行させる
						delete newIndexData.files[item.path];
					}
				}

				// 4. Upload キューの処理
				for (const item of diff.uploadQueue) {
					try {
						// VFS上のファイルのMIMEタイプを推定（必要に応じて）
						const ext = item.path.split('.').pop().toLowerCase();
						let mimeType = 'text/plain';
						if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
							// DataURIの場合はUpload時にパースされるため厳密でなくてよい
							mimeType = `image/${ext === 'svg' ? 'svg+xml' : ext}`;
						} else if (ext === 'json') {
							mimeType = 'application/json';
						}

						const newRemoteId = await this.provider.uploadFile(item.path, item.content, mimeType, item.remote_id);

						// アップロード成功後、新しいメタデータをインデックスに追加
						const vfsStat = this.vfs.stat(item.path);
						newIndexData.files[item.path] = {
							remote_id: newRemoteId,
							updated_at: vfsStat.updated_at,
							size: vfsStat.size
						};
						successCount++;
						console.log(`[SyncManager] Uploaded: ${item.path}`);
					} catch (e) {
						console.error(`[SyncManager] Failed to upload ${item.path}:`, e);
						errorCount++;
						// 既存ファイルの上書きに失敗した場合、インデックスの古い情報を維持する
						if (remoteIndex && remoteIndex.files[item.path]) {
							newIndexData.files[item.path] = remoteIndex.files[item.path];
						}
					}
				}

				// 5. 変更があった場合のみインデックスを更新して保存
				if (diff.downloadQueue.length > 0 || diff.uploadQueue.length > 0) {
					newIndexData.last_synced_at = Date.now();
					await this.provider.uploadIndex(newIndexData);
					console.log(`[SyncManager] Index updated.`);
				}

				if (errorCount > 0) {
					this._emitStatus('error', `${successCount} synced, ${errorCount} failed`);
				} else {
					this._emitStatus('synced', `Success. ${successCount} files updated.`);
					// 完了後、少し経ってからIdleに戻す
					setTimeout(() => this._emitStatus('idle'), 3000);
				}

			} catch (err) {
				console.error("[SyncManager] Critical sync failure:", err);
				this._emitStatus('error', err.message);
			} finally {
				this.isSyncing = false;
			}
		}
	}

	global.Itera.Sync.SyncManager = SyncManager;

})(window);