// src/core/cognitive/projector.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Cognitive = global.Itera.Cognitive || {};

	const Role = global.Itera.Role || {
		USER: 'user',
		MODEL: 'model',
		SYSTEM: 'system'
	};

	/**
	 * Abstract Base Projector
	 * 共通ロジック（システムプロンプト生成）を担当
	 */
	class BaseProjector {
		constructor(systemPrompt) {
			this.systemPrompt = systemPrompt;
		}

		// 非同期に変更
		async createContext(state, signal) {
			throw new Error("createContext must be implemented by subclass");
		}

		_buildSystemPrompt(state) {
			let config = {};

			// 1. Configの取得
			if (state.configManager) {
				config = state.configManager.get() || {};
			} else {
				try {
					if (state.vfs && state.vfs.exists('system/config/config.json')) {
						config = JSON.parse(state.vfs.readFile('system/config/config.json'));
					}
				} catch (e) {
					// Config read error ignored
				}
			}

			const user = config.username || "User";
			const agent = config.agentName || "Itera";
			const language = config.language || "English";

			// 2. プロンプト内のプレースホルダー置換
			let effectivePrompt = this.systemPrompt.replace(/{{language}}/g, language);
			effectivePrompt = effectivePrompt.replace(/{{agentName}}/g, agent);
			effectivePrompt = effectivePrompt.replace(/{{username}}/g, user);

			// 3. セッション開始時刻の追記（履歴の最初のターンのタイムスタンプを使用）
			const history = state.history ? state.history.get() : [];
			const firstTurn = history.length > 0 ? history[0] : null;
			const sessionStart = firstTurn ? new Date(firstTurn.timestamp) : new Date();

			const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
			const timePrompt = `\n\n<system type="time">\nSession Started: ${sessionStart.toLocaleString()} (${days[sessionStart.getDay()]})\nTimestamp: ${sessionStart.toISOString()}\n</system>`;

			return effectivePrompt + timePrompt;
		}
	}

	/**
	 * Google Gemini Implementation
	 * File API (Lazy Upload) 対応版
	 */
	class GeminiProjector extends BaseProjector {
		async createContext(state, signal) {
			// state = { history, vfs, configManager }
			const historyData = state.history ? state.history.get() : [];
			// 履歴の浅いコピーを作成（メタデータ更新は参照を通じて元の履歴にも反映される想定）
			const history = [...historyData];

			// APIキーの取得 (localStorageフォールバック)
			const apiKey = localStorage.getItem('itera_api_key');

			const apiMessages = [];

			// 1. System Prompt
			const dynamicPrompt = this._buildSystemPrompt(state);
			apiMessages.push({
				role: 'user',
				parts: [{
					text: dynamicPrompt
				}]
			});

			// 2. 履歴の変換 (非同期処理を含む)
			for (const turn of history) {
				if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

				// ここで await することでアップロード完了を待つ
				const parts = await this._convertTurnToParts(turn, state.vfs, apiKey, signal);
				if (!parts || parts.length === 0) continue;

				let apiRole = 'user';
				if (turn.role === Role.MODEL) apiRole = 'model';

				apiMessages.push({
					role: apiRole,
					parts: parts
				});
			}

			return apiMessages;
		}

		async _convertTurnToParts(turn, vfs, apiKey, signal) {
			if (typeof turn.content === 'string') {
				let text = turn.content;
				if (turn.role === Role.USER) text = `<user_input>\n${text}\n</user_input>`;
				return [{
					text: text
				}];
			}

			if (Array.isArray(turn.content)) {
				// A. Tool Outputs
				if (turn.meta && turn.meta.type === 'tool_execution') {
					const parts = [];

					for (const c of turn.content) {
						if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

						// 出力がない場合はスキップ（無効なツール実行など）
						if (!c.output || (!c.output.log && !c.output.media && !c.output.image)) continue;

						const actionName = c.actionType || "unknown";
						const status = c.output.error ? "error" : "success";
						
						// 属性文字列の組み立て
						let attrStr = `action="${actionName}" status="${status}"`;
						if (c.params) {
							for (const [key, val] of Object.entries(c.params)) {
								// 値に含まれるダブルクォートをエスケープして属性値を安全にする
								const safeVal = String(val).replace(/"/g, '&quot;');
								attrStr += ` ${key}="${safeVal}"`;
							}
						}

						const logContent = c.output.log ? c.output.log.trim() : "";
						
						// タグを組み立てて text パートとして追加
						if (logContent) {
							parts.push({
								text: `<tool_output ${attrStr}>\n${logContent}\n</tool_output>`
							});
						} else {
							// ログ本文がない場合は空要素タグとして出力
							parts.push({
								text: `<tool_output ${attrStr} />`
							});
						}

						// ツール出力に含まれるメディアの処理（take_screenshot等）
						if (c.output.media) {
							const fileData = await this._resolveMediaFile(c.output.media, vfs, apiKey, signal);
							if (fileData) parts.push({ fileData });
						} else if (c.output.image) {
							// 古い image 形式 (後方互換)
							parts.push({
								inlineData: {
									mimeType: c.output.mimeType || 'image/png',
									data: c.output.image
								}
							});
						}
					}
					return parts;
				}

				// B. User Input
				if (turn.role === Role.USER) {
					const parts = [];
					let textBuffer = "";

					const flushText = () => {
						if (textBuffer.trim()) {
							parts.push({
								text: `<user_input>\n${textBuffer.trim()}\n</user_input>`
							});
						}
						textBuffer = "";
					};

					for (const item of turn.content) {
						if (item.text) {
							if (item.text.trim().startsWith('<')) {
								flushText();
								parts.push({
									text: item.text
								});
							} else {
								textBuffer += item.text + "\n";
							}
						} else if (item.media) {
							// ★ VFSメディアの解決とアップロード
							flushText();
							const fileData = await this._resolveMediaFile(item.media, vfs, apiKey, signal);
							if (fileData) {
								parts.push({
									fileData: fileData
								});
							} else {
								// VFSから消えている場合の代替テキスト
								parts.push({
									text: `\n[System: The image file '${item.media.path}' could not be loaded from VFS.]\n`
								});
							}
						} else if (item.inlineData) {
							// 古い形式のサポート
							flushText();
							parts.push({
								inlineData: item.inlineData
							});
						}
					}
					flushText();
					return parts;
				}

				// C. Model Thought
				return turn.content.map(c => {
					if (c.text) return {
						text: c.text
					};
					return null;
				}).filter(Boolean);
			}
			return [];
		}

		/**
		 * メディアオブジェクトを Gemini API 用の fileData に変換する
		 * 必要に応じてアップロードを行い、メタデータをキャッシュする
		 */
		async _resolveMediaFile(mediaObj, vfs, apiKey, signal) {
			// 1. キャッシュと有効期限のチェック
			const geminiMeta = mediaObj.metadata?.gemini;
			if (geminiMeta && geminiMeta.fileUri && geminiMeta.expirationTime) {
				const expires = new Date(geminiMeta.expirationTime);
				const now = new Date();
				// 有効期限まで余裕があればキャッシュを使用 (1時間余裕を見る)
				if (expires > new Date(now.getTime() + 60 * 60 * 1000)) {
					return {
						fileUri: geminiMeta.fileUri,
						mimeType: mediaObj.mimeType
					};
				}
			}

			// 2. VFSから実体読み込み
			if (!vfs.exists(mediaObj.path)) return null;

			// readFileはDataURL文字列を返す仕様 (main_controller.jsでの保存形式による)
			const content = vfs.readFile(mediaObj.path);

			// APIキーがない場合はアップロード不可
			if (!apiKey) return null;

			try {
				// 3. Gemini File API へアップロード
				const uploadResult = await this._uploadToGemini(content, mediaObj.mimeType, apiKey, signal);

				// 4. メタデータを更新 (参照元のオブジェクトを書き換える)
				if (!mediaObj.metadata) mediaObj.metadata = {};
				mediaObj.metadata.gemini = {
					fileUri: uploadResult.fileUri,
					expirationTime: uploadResult.expirationTime,
					name: uploadResult.name
				};

				return {
					fileUri: uploadResult.fileUri,
					mimeType: mediaObj.mimeType
				};
			} catch (e) {
				console.error("[Projector] File upload failed:", e);
				return null;
			}
		}

		/**
		 * Gemini File API (Resumable Upload) の実行
		 */
		async _uploadToGemini(dataUrl, mimeType, apiKey, signal) {
			// Data URL から Blob を生成
			const res = await fetch(dataUrl);
			const blob = await res.blob();
			const size = blob.size;

			// Step 1: 初期化リクエスト (Resumable Upload URLの取得)
			const initUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
			const initHeaders = {
				'X-Goog-Upload-Protocol': 'resumable',
				'X-Goog-Upload-Command': 'start',
				'X-Goog-Upload-Header-Content-Length': size.toString(),
				'X-Goog-Upload-Header-Content-Type': mimeType,
				'Content-Type': 'application/json'
			};

			// メタデータ (表示名など)
			const metadata = {
				file: {
					display_name: 'itera_media'
				}
			};

			const initRes = await fetch(initUrl, {
				method: 'POST',
				headers: initHeaders,
				body: JSON.stringify(metadata),
				signal
			});

			if (!initRes.ok) {
				const errText = await initRes.text();
				throw new Error(`Upload init failed (${initRes.status}): ${errText}`);
			}

			const uploadUrl = initRes.headers.get('x-goog-upload-url');
			if (!uploadUrl) throw new Error("No upload URL returned from Gemini API");

			// Step 2: バイナリデータの送信
			const uploadHeaders = {
				'Content-Length': size.toString(),
				'X-Goog-Upload-Offset': '0',
				'X-Goog-Upload-Command': 'upload, finalize'
			};

			const uploadRes = await fetch(uploadUrl, {
				method: 'POST',
				headers: uploadHeaders,
				body: blob,
				signal
			});

			if (!uploadRes.ok) {
				const errText = await uploadRes.text();
				throw new Error(`Binary upload failed (${uploadRes.status}): ${errText}`);
			}

			const result = await uploadRes.json();
			return {
				fileUri: result.file.uri,
				name: result.file.name,
				expirationTime: result.file.expirationTime
			};
		}
	}

	global.Itera.Cognitive.BaseProjector = BaseProjector;
	global.Itera.Cognitive.GeminiProjector = GeminiProjector;

})(window);