// src/core/sync/providers/base_provider.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Sync = global.Itera.Sync || {};
	global.Itera.Sync.Providers = global.Itera.Sync.Providers || {};

	/**
	 * Abstract Base Class for Cloud Sync Providers
	 * すべての同期プロバイダ（Google Drive, Dropbox等）が実装すべきインターフェース
	 */
	class BaseSyncProvider {
		constructor(configManager) {
			this.configManager = configManager;
			this.providerId = 'base';
		}

		/**
		 * OAuth等の認証処理を行う
		 * 成功した場合、アクセストークンなどは configManager 等を通じて永続化する
		 * @returns {Promise<boolean>} 認証に成功したかどうか
		 */
		async auth() {
			throw new Error(`[${this.providerId}] auth() must be implemented.`);
		}

		/**
		 * インデックスファイル（.itera_sync_index.json）のメタデータのみを軽量に取得する
		 * @returns {Promise<{ updated_at: number, remote_id: string } | null>}
		 */
		async getIndexMetadata() {
			throw new Error(`[${this.providerId}] getIndexMetadata() must be implemented.`);
		}

		/**
		 * インデックスファイルの実体をダウンロードしてJSONオブジェクトとして返す
		 * @returns {Promise<Object | null>}
		 */
		async getIndex() {
			throw new Error(`[${this.providerId}] getIndex() must be implemented.`);
		}

		/**
		 * インデックスファイルをクラウドへアップロード（または上書き）する
		 * @param {Object} data - インデックスとなるJSONデータ
		 * @returns {Promise<boolean>} 
		 */
		async uploadIndex(data) {
			throw new Error(`[${this.providerId}] uploadIndex() must be implemented.`);
		}

		/**
		 * ファイルの実体をダウンロードする
		 * @param {string} remoteId - クラウド側のファイルID
		 * @returns {Promise<string>} ファイルのコンテンツ（文字列 または Base64 Data URI）
		 */
		async downloadFile(remoteId) {
			throw new Error(`[${this.providerId}] downloadFile() must be implemented.`);
		}

		/**
		 * ファイルをクラウドへアップロードする
		 * @param {string} path - ローカルのファイルパス (クラウド上での配置や名前に利用)
		 * @param {string} content - ファイルのコンテンツ（文字列 または Base64 Data URI）
		 * @param {string} mimeType - ファイルのMIMEタイプ
		 * @param {string} [remoteId=null] - 既存ファイルを上書きする場合は指定
		 * @returns {Promise<string>} アップロード完了後のクラウド側のファイルID
		 */
		async uploadFile(path, content, mimeType, remoteId = null) {
			throw new Error(`[${this.providerId}] uploadFile() must be implemented.`);
		}

		/**
		 * ファイルをクラウドから削除する
		 * @param {string} remoteId - クラウド側のファイルID
		 * @returns {Promise<boolean>}
		 */
		async deleteFile(remoteId) {
			throw new Error(`[${this.providerId}] deleteFile() must be implemented.`);
		}
	}

	global.Itera.Sync.Providers.BaseSyncProvider = BaseSyncProvider;

})(window);