// src/core/sync/providers/gdrive_provider.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Sync = global.Itera.Sync || {};
	global.Itera.Sync.Providers = global.Itera.Sync.Providers || {};

	const BaseSyncProvider = global.Itera.Sync.Providers.BaseSyncProvider;

	class GDriveProvider extends BaseSyncProvider {
		constructor(configManager) {
			super(configManager);
			this.providerId = 'gdrive';
			this.baseUrl = 'https://www.googleapis.com/drive/v3/files';
			this.uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files';
			this.syncFolderName = 'IteraOS_Sync';
			this.folderId = null; // キャッシュ用
		}

		/**
		 * 現在のアクセストークンを取得する
		 */
		_getToken() {
			let secrets = {};
			try {
				secrets = JSON.parse(localStorage.getItem('itera_sync_secrets') || '{}');
			} catch (e) {}

			const token = secrets.gdrive?.token;
			if (!token) throw new Error("Google Drive access token is not set.");
			return token;
		}

		/**
		 * 認証付きのフェッチヘルパー
		 */
		async _fetch(url, options = {}) {
			const token = this._getToken();
			const headers = {
				'Authorization': `Bearer ${token}`,
				...options.headers
			};
			const response = await fetch(url, {
				...options,
				headers
			});

			if (response.status === 401) {
				throw new Error("Google Drive token expired or invalid. Please re-authenticate.");
			}
			if (!response.ok) {
				const errText = await response.text();
				throw new Error(`Google Drive API Error (${response.status}): ${errText}`);
			}
			return response;
		}

		/**
		 * 認証の確認（トークンが有効かテストする）
		 */
		async auth() {
			try {
				// シンプルに自分の情報を取得してトークンをテスト
				await this._fetch('https://www.googleapis.com/drive/v3/about?fields=user');
				return true;
			} catch (e) {
				console.warn("[GDriveProvider] Auth failed:", e.message);
				return false;
			}
		}

		/**
		 * 認証情報の破棄
		 */
		clearAuth() {
			let secrets = {};
			try {
				secrets = JSON.parse(localStorage.getItem('itera_sync_secrets') || '{}');
			} catch (e) {}
			if (secrets[this.providerId]) {
				delete secrets[this.providerId];
				localStorage.setItem('itera_sync_secrets', JSON.stringify(secrets));
			}
		}

		/**
		 * 同期専用のフォルダ（IteraOS_Sync）のIDを取得する。なければ作成する。
		 */
		async _getFolderId() {
			if (this.folderId) return this.folderId;

			const q = encodeURIComponent(`name='${this.syncFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
			const res = await this._fetch(`${this.baseUrl}?q=${q}&fields=files(id)`);
			const data = await res.json();

			if (data.files && data.files.length > 0) {
				this.folderId = data.files[0].id;
				return this.folderId;
			}

			// フォルダが存在しない場合は作成
			const createRes = await this._fetch(this.baseUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					name: this.syncFolderName,
					mimeType: 'application/vnd.google-apps.folder'
				})
			});
			const createData = await createRes.json();
			this.folderId = createData.id;
			return this.folderId;
		}

		/**
		 * Data URI (Base64) を Blob に変換するヘルパー
		 */
		_dataUriToBlob(dataUri) {
			const parts = dataUri.split(',');
			const mimeMatch = parts[0].match(/:(.*?);/);
			const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
			const bstr = atob(parts[1]);
			let n = bstr.length;
			const u8arr = new Uint8Array(n);
			while (n--) {
				u8arr[n] = bstr.charCodeAt(n);
			}
			return new Blob([u8arr], {
				type: mime
			});
		}

		// =================================================================
		// Provider Interface Implementation
		// =================================================================

		async getIndexMetadata() {
			const folderId = await this._getFolderId();
			const q = encodeURIComponent(`name='.itera_sync_index.json' and '${folderId}' in parents and trashed=false`);
			const res = await this._fetch(`${this.baseUrl}?q=${q}&fields=files(id,modifiedTime)`);
			const data = await res.json();

			if (data.files && data.files.length > 0) {
				const file = data.files[0];
				return {
					remote_id: file.id,
					updated_at: new Date(file.modifiedTime).getTime()
				};
			}
			return null;
		}

		async getIndex() {
			const meta = await this.getIndexMetadata();
			if (!meta) return null;

			const res = await this._fetch(`${this.baseUrl}/${meta.remote_id}?alt=media`);
			return await res.json();
		}

		async uploadIndex(data) {
			const meta = await this.getIndexMetadata();
			const content = JSON.stringify(data, null, 2);

			if (meta) {
				// 上書き更新
				await this._fetch(`${this.uploadUrl}/${meta.remote_id}?uploadType=media`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json'
					},
					body: content
				});
			} else {
				// 新規作成 (2ステップ)
				const folderId = await this._getFolderId();
				const createRes = await this._fetch(this.baseUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						name: '.itera_sync_index.json',
						parents: [folderId]
					})
				});
				const fileMeta = await createRes.json();

				await this._fetch(`${this.uploadUrl}/${fileMeta.id}?uploadType=media`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json'
					},
					body: content
				});
			}
			return true;
		}

		async downloadFile(remoteId) {
			const res = await this._fetch(`${this.baseUrl}/${remoteId}?alt=media`);

			const contentType = res.headers.get('Content-Type') || 'application/octet-stream';

			// テキスト系ファイルの場合はそのまま文字列として返す
			if (contentType.startsWith('text/') || contentType === 'application/json') {
				return await res.text();
			}

			// バイナリ系ファイルの場合は Blob -> Base64 Data URI に変換して返す
			const blob = await res.blob();
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => resolve(reader.result);
				reader.onerror = reject;
				reader.readAsDataURL(blob);
			});
		}

		async uploadFile(path, content, mimeType, remoteId = null) {
			// content が Data URI の場合は Blob に変換、テキストならそのまま
			let bodyData = content;
			if (typeof content === 'string' && content.startsWith('data:')) {
				bodyData = this._dataUriToBlob(content);
			}

			if (remoteId) {
				// 既存ファイルのコンテンツのみ更新
				await this._fetch(`${this.uploadUrl}/${remoteId}?uploadType=media`, {
					method: 'PATCH',
					headers: {
						'Content-Type': mimeType
					},
					body: bodyData
				});
				return remoteId;
			} else {
				// 新規作成 (2ステップ)
				const folderId = await this._getFolderId();

				// 1. メタデータの作成
				const createRes = await this._fetch(this.baseUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						name: path, // IteraOS上のフルパスをそのまま名前として保存する (フラット構造で管理)
						parents: [folderId]
					})
				});
				const fileMeta = await createRes.json();
				const newRemoteId = fileMeta.id;

				// 2. コンテンツのアップロード
				await this._fetch(`${this.uploadUrl}/${newRemoteId}?uploadType=media`, {
					method: 'PATCH',
					headers: {
						'Content-Type': mimeType
					},
					body: bodyData
				});

				return newRemoteId;
			}
		}

		async deleteFile(remoteId) {
			try {
				await this._fetch(`${this.baseUrl}/${remoteId}`, {
					method: 'DELETE'
				});
				return true;
			} catch (e) {
				// すでに削除されているなどのエラーは無視して成功扱いにする
				console.warn(`[GDriveProvider] Failed to delete file ${remoteId}:`, e);
				return true;
			}
		}
	}

	global.Itera.Sync.Providers.GDriveProvider = GDriveProvider;

})(window);