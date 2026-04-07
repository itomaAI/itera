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
                    const { done, value } = await reader.read();
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

	global.Itera.Cognitive.BaseLLMAdapter = BaseLLMAdapter;
	global.Itera.Cognitive.GeminiAdapter = GeminiAdapter;

})(window);