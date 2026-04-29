// src/core/cognitive/llm_adapter.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Cognitive = global.Itera.Cognitive || {};

	/**
	 * Abstract Base Class for LLM Providers
	 * 将来的に OpenAI や Anthropic に対応する場合はこれを継承する
	 */
	class BaseLLMAdapter {
		constructor(config = {}) {
			this.config = config;
		}

		/**
		 * @param {Array} messages - [{ role: 'user'|'model', parts: [{text: ...}] }]
		 * @param {Function} onChunk - callback(textChunk)
		 * @param {AbortSignal} signal
		 */
		async generateStream(messages, onChunk, signal) {
			throw new Error("generateStream must be implemented");
		}
	}

	/**
	 * Google Gemini API Implementation
	 */
	class GeminiAdapter extends BaseLLMAdapter {
		constructor(apiKey, modelName = "gemini-3.1-pro-preview", config = {}, logger = null) {
			super(config);
			this.apiKey = apiKey;
			this.modelName = modelName;
			this.baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
			this.logger = logger;
		}

		async generateStream(messages, onChunk, signal) {
			if (!this.apiKey) throw new Error("API Key is missing.");

			const url = `${this.baseUrl}/${this.modelName}:streamGenerateContent?key=${this.apiKey}`;

			// Default generation config
			const generationConfig = {
				temperature: this.config.temperature || 1.0,
				maxOutputTokens: this.config.maxOutputTokens || 65536
			};

			const payload = {
				contents: messages,
				generationConfig: generationConfig
			};

			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify(payload),
				signal
			});

			if (!response.ok) {
				let errText = await response.text();
				try {
					const errJson = JSON.parse(errText);
					errText = errJson.error?.message || errText;
				} catch (e) {}
				throw new Error(`Gemini API Error (${response.status}): ${errText}`);
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			// Abort時にreaderを強制キャンセルするハンドラ
			const onAbort = () => {
				reader.cancel(new DOMException("Aborted", "AbortError")).catch(() => {});
			};
			if (signal) signal.addEventListener('abort', onAbort);

			// ★ アイドルタイムアウト（無通信監視）の導入
			let idleTimeout;
			const resetIdleTimeout = () => {
				clearTimeout(idleTimeout);
				idleTimeout = setTimeout(() => {
					reader.cancel(new Error("Stream Idle Timeout: No response from API for 15 seconds."));
				}, 15000); // 15秒間データが来なければ切断
			};

			resetIdleTimeout();

			let finalUsageMetadata = null;

			try {
				while (true) {
					if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
					const {
						done,
						value
					} = await reader.read();
					resetIdleTimeout(); // データを受信するたびにタイマーをリセット

					if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
					if (done) break;

					buffer += decoder.decode(value, {
						stream: true
					});

					// Parse JSON stream logic (handling multiple chunks)
					while (true) {
						// Gemini returns a list of JSON objects, usually array elements like [{...},]
						// Simple parsing strategy: look for "text" field
						const textKeyIdx = buffer.indexOf('"text"');
						if (textKeyIdx === -1) break;

						// Find the value associated with "text"
						// This is a naive parser but robust enough for streaming chunks
						let startQuote = -1;
						for (let i = textKeyIdx + 6; i < buffer.length; i++) {
							if (buffer[i] === '"') {
								startQuote = i;
								break;
							}
						}
						if (startQuote === -1) break;

						let endQuote = -1;
						let escaped = false;
						for (let i = startQuote + 1; i < buffer.length; i++) {
							const char = buffer[i];
							if (escaped) {
								escaped = false;
								continue;
							}
							if (char === '\\') {
								escaped = true;
								continue;
							}
							if (char === '"') {
								endQuote = i;
								break;
							}
						}

						if (endQuote === -1) break; // Wait for more data

						const rawText = buffer.substring(startQuote + 1, endQuote);
						try {
							// JSON string unescape
							const text = JSON.parse(`"${rawText}"`);
							if (text) onChunk(text);
						} catch (e) {
							console.warn("[GeminiAdapter] Stream Parse Warning:", e);
						}

						// Advance buffer
						buffer = buffer.substring(endQuote + 1);
					}

					// ストリームの最後付近で送られてくる usageMetadata を捕捉する
					// 正規表現で安全にJSONブロックを抽出
					const usageMatch = buffer.match(/"usageMetadata"\s*:\s*(\{(?:[^{}]|(?:\{[^{}]*\}))*\})/);
					if (usageMatch) {
						try {
							finalUsageMetadata = JSON.parse(usageMatch[1]);
						} catch (e) {}
					}
				}

				// ストリーム完了時、ロガーに利用実績を送信
				if (this.logger && finalUsageMetadata) {
					const cached = finalUsageMetadata.cachedContentTokenCount || 0;
					const promptTotal = finalUsageMetadata.promptTokenCount || 0;
					// キャッシュ分はpromptTotalに含まれるため、純粋な新規入力分を算出
					const input = Math.max(0, promptTotal - cached);
					const output = finalUsageMetadata.candidatesTokenCount || 0;

					this.logger.log('usage', {
						provider: 'google',
						model: this.modelName,
						tokens: {
							input: input,
							cached: cached,
							output: output,
							total: finalUsageMetadata.totalTokenCount || (promptTotal + output)
						}
					});
				}

			} catch (e) {
				if (e.name === 'AbortError') throw e; // Propagate abort
				console.error("[GeminiAdapter] Stream Reading Error:", e);
				throw e;
			} finally {
				clearTimeout(idleTimeout); // タイマーのクリーンアップ
				if (signal) signal.removeEventListener('abort', onAbort);
			}
		}
	}

	/**
	 * OpenAI API / Local API (Ollama, LM Studio etc.) Implementation
	 */
	class OpenAIAdapter extends BaseLLMAdapter {
		constructor(apiKey, modelName = "gpt-4o", baseUrl = "https://api.openai.com/v1", config = {}, logger = null) {
			super(config);
			this.apiKey = apiKey;
			this.modelName = modelName;
			this.baseUrl = baseUrl.replace(/\/$/, ""); // 末尾のスラッシュを除去
			this.logger = logger;
		}

		async generateStream(messages, onChunk, signal) {
			const url = `${this.baseUrl}/chat/completions`;

			const headers = {
				"Content-Type": "application/json"
			};

			// ローカルLLM等でAPIキーが不要な場合も考慮し、存在する場合のみAuthorizationヘッダを付与
			if (this.apiKey) {
				headers["Authorization"] = `Bearer ${this.apiKey}`;
			}

			// OpenRouter 用の推奨ヘッダー付与
			if (this.baseUrl.includes("openrouter.ai")) {
				headers["HTTP-Referer"] = window.location.href;
				headers["X-Title"] = "Itera OS";
			}

			const payload = {
				model: this.modelName,
				messages: messages,
				stream: true,
				temperature: this.config.temperature || 1.0,
				// max_tokens はモデルによって解釈が異なる場合があるが一旦未指定かconfig依存とする
			};
			if (this.config.maxOutputTokens) {
				payload.max_tokens = this.config.maxOutputTokens;
			}

			const response = await fetch(url, {
				method: "POST",
				headers: headers,
				body: JSON.stringify(payload),
				signal
			});

			if (!response.ok) {
				let errText = await response.text();
				try {
					const errJson = JSON.parse(errText);
					errText = errJson.error?.message || errText;
				} catch (e) {}
				throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder("utf-8");
			let buffer = "";

			const onAbort = () => {
				reader.cancel(new DOMException("Aborted", "AbortError")).catch(() => {});
			};
			if (signal) signal.addEventListener('abort', onAbort);

			let idleTimeout;
			const resetIdleTimeout = () => {
				clearTimeout(idleTimeout);
				idleTimeout = setTimeout(() => {
					reader.cancel(new Error("Stream Idle Timeout: No response from API for 15 seconds."));
				}, 15000);
			};

			resetIdleTimeout();

			try {
				while (true) {
					if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
					const {
						done,
						value
					} = await reader.read();
					resetIdleTimeout();

					if (done) break;

					buffer += decoder.decode(value, {
						stream: true
					});
					const lines = buffer.split('\n');

					// 最後の行が不完全なJSON文字列の場合に備えてバッファに戻す
					buffer = lines.pop();

					for (const line of lines) {
						const trimmedLine = line.trim();
						if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

						const dataStr = trimmedLine.substring(6); // "data: " を削除

						if (dataStr === '[DONE]') {
							break;
						}

						try {
							const data = JSON.parse(dataStr);
							const delta = data.choices && data.choices[0] && data.choices[0].delta;

							if (delta && delta.content) {
								onChunk(delta.content);
							}
						} catch (e) {
							console.warn("[OpenAIAdapter] Stream Parse Warning:", e, dataStr);
						}
					}
				}

				// usage 情報は OpenAI の場合 stream: true だと通常は降ってこないか特殊なオプションが必要なため一旦スキップ
				if (this.logger) {
					this.logger.log('usage', {
						provider: 'openai_compatible',
						model: this.modelName,
						note: 'Stream completed.'
					});
				}

			} catch (e) {
				if (e.name === 'AbortError') throw e;
				console.error("[OpenAIAdapter] Stream Reading Error:", e);
				throw e;
			} finally {
				clearTimeout(idleTimeout);
				if (signal) signal.removeEventListener('abort', onAbort);
			}
		}
	}

	/**
	 * Anthropic API Implementation
	 */
	class AnthropicAdapter extends BaseLLMAdapter {
		constructor(apiKey, modelName = "claude-3-5-sonnet-20241022", config = {}, logger = null) {
			super(config);
			this.apiKey = apiKey;
			this.modelName = modelName;
			this.logger = logger;
		}

		async generateStream(payloadData, onChunk, signal) {
			// Projector から { system, messages } の形式で受け取る
			const {
				system,
				messages
			} = payloadData;

			// Anthropic はブラウザからの直接通信を CORS でブロックするため、
			// Itera の設定にあるプロキシを利用してリクエストを送る
			const baseUrl = "https://api.anthropic.com/v1/messages";
			let targetUrl = baseUrl;

			const proxyUrl = this.config.network?.proxyUrl;
			if (proxyUrl) {
				targetUrl = `${proxyUrl}${encodeURIComponent(baseUrl)}`;
			} else {
				console.warn("[AnthropicAdapter] No proxy URL configured. Request might fail due to CORS.");
			}

			const payload = {
				model: this.modelName,
				max_tokens: this.config.maxOutputTokens || 8192,
				system: system,
				messages: messages,
				stream: true,
				temperature: this.config.temperature || 1.0
			};

			const response = await fetch(targetUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.apiKey,
					"anthropic-version": "2023-06-01",
					"anthropic-dangerously-allow-browser": "true" // 公式SDK用のヘッダーだが一応付与
				},
				body: JSON.stringify(payload),
				signal
			});

			if (!response.ok) {
				let errText = await response.text();
				try {
					const errJson = JSON.parse(errText);
					errText = errJson.error?.message || errText;
				} catch (e) {}
				throw new Error(`Anthropic API Error (${response.status}): ${errText}`);
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder("utf-8");
			let buffer = "";

			const onAbort = () => {
				reader.cancel(new DOMException("Aborted", "AbortError")).catch(() => {});
			};
			if (signal) signal.addEventListener('abort', onAbort);

			let idleTimeout;
			const resetIdleTimeout = () => {
				clearTimeout(idleTimeout);
				idleTimeout = setTimeout(() => {
					reader.cancel(new Error("Stream Idle Timeout"));
				}, 15000);
			};

			resetIdleTimeout();

			try {
				let eventType = null;

				while (true) {
					if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
					const {
						done,
						value
					} = await reader.read();
					resetIdleTimeout();

					if (done) break;

					buffer += decoder.decode(value, {
						stream: true
					});
					const lines = buffer.split('\n');
					buffer = lines.pop();

					for (const line of lines) {
						const trimmedLine = line.trim();
						if (!trimmedLine) continue;

						if (trimmedLine.startsWith('event: ')) {
							eventType = trimmedLine.substring(7);
							continue;
						}

						if (trimmedLine.startsWith('data: ')) {
							const dataStr = trimmedLine.substring(6);

							if (eventType === 'content_block_delta') {
								try {
									const data = JSON.parse(dataStr);
									if (data.delta && data.delta.type === 'text_delta') {
										onChunk(data.delta.text);
									}
								} catch (e) {
									console.warn("[AnthropicAdapter] Stream Parse Warning:", e);
								}
							} else if (eventType === 'message_stop') {
								// 終了
								break;
							}
						}
					}
				}

				if (this.logger) {
					this.logger.log('usage', {
						provider: 'anthropic',
						model: this.modelName,
						note: 'Stream completed.'
					});
				}

			} catch (e) {
				if (e.name === 'AbortError') throw e;
				console.error("[AnthropicAdapter] Stream Reading Error:", e);
				throw e;
			} finally {
				clearTimeout(idleTimeout);
				if (signal) signal.removeEventListener('abort', onAbort);
			}
		}
	}

	global.Itera.Cognitive.BaseLLMAdapter = BaseLLMAdapter;
	global.Itera.Cognitive.GeminiAdapter = GeminiAdapter;
	global.Itera.Cognitive.OpenAIAdapter = OpenAIAdapter;
	global.Itera.Cognitive.AnthropicAdapter = AnthropicAdapter;

})(window);