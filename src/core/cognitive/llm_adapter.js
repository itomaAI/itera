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
        constructor(apiKey, modelName = "gemini-3-pro-preview", config = {}) {
            super(config);
            this.apiKey = apiKey;
            this.modelName = modelName;
            this.baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal
            });

            if (!response.ok) {
                let errText = await response.text();
                try {
                    const errJson = JSON.parse(errText);
                    errText = errJson.error?.message || errText;
                } catch(e) {}
                throw new Error(`Gemini API Error (${response.status}): ${errText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    
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
                }
            } catch (e) {
                if (e.name === 'AbortError') throw e; // Propagate abort
                console.error("[GeminiAdapter] Stream Reading Error:", e);
                throw e;
            }
        }
    }

    global.Itera.Cognitive.BaseLLMAdapter = BaseLLMAdapter;
    global.Itera.Cognitive.GeminiAdapter = GeminiAdapter;

})(window);