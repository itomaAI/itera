// src/core/state/logger.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.State = global.Itera.State || {};

	class SystemLogger {
		constructor(vfs) {
			this.vfs = vfs;
			this.baseDir = 'system/logs';
		}

		_getDateString() {
			return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
		}

		/**
		 * 汎用ロギングメソッド
		 * @param {string} category - ログのカテゴリ (例: 'system', 'usage', 'error')
		 * @param {Object} payload - 記録したい任意のデータオブジェクト
		 */
		log(category, payload) {
			if (!category || !payload) return;

			const dateStr = this._getDateString();
			const path = `${this.baseDir}/${category}/${dateStr}.jsonl`;

			try {
				// JSON.stringify を try-catch 内に配置し、パニックを防止
				const entry = {
					timestamp: new Date().toISOString(),
					...payload
				};
				const line = JSON.stringify(entry);

				if (!this.vfs.exists(path)) {
					// ファイルが存在しない場合は新規作成
					this.vfs.writeFile(path, line);
				} else {
					// 存在する場合は行末に追記
					this.vfs.editLines(path, NaN, NaN, 'append', line);
				}
			} catch (e) {
				console.error(`[SystemLogger] Failed to serialize or write log to ${path}:`, e);
			}
		}

		/**
		 * 指定した日数より古いログファイルをVFSから削除する
		 * @param {number} days - 保持する日数
		 * @returns {number} 削除したファイル数
		 */
		purgeOldLogs(days = 7) {
			let count = 0;
			try {
				const threshold = Date.now() - (days * 24 * 60 * 60 * 1000);
				const files = this.vfs.listFiles({
					path: this.baseDir,
					recursive: true,
					detail: true
				});

				files.forEach(file => {
					if (file.type === 'file' && file.path.endsWith('.jsonl')) {
						// VFSのメタデータ(最終更新日時)が閾値より古いものを削除
						if (file.updated_at < threshold) {
							try {
								this.vfs.deleteFile(file.path);
								count++;
							} catch (e) {
								console.warn(`[SystemLogger] Failed to purge log: ${file.path}`, e);
							}
						}
					}
				});

				if (count > 0) {
					console.log(`[SystemLogger] Purged ${count} old log files.`);
				}
			} catch (e) {
				console.warn("[SystemLogger] Purge failed or base directory does not exist:", e);
			}
			return count;
		}
	}

	global.Itera.State.SystemLogger = SystemLogger;

})(window);