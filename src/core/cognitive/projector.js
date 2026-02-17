(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Cognitive = global.Itera.Cognitive || {};

    const Role = global.Itera.Role || { USER: 'user', MODEL: 'model', SYSTEM: 'system' };

    /**
     * Abstract Base Projector
     * 共通ロジック（システムプロンプト生成、履歴の最適化）を担当
     */
    class BaseProjector {
        constructor(systemPrompt) {
            this.systemPrompt = systemPrompt;
        }

        /**
         * @param {Object} state - WorldState
         * @returns {Array} API Payload
         */
        createContext(state) {
            throw new Error("createContext must be implemented by subclass");
        }

        /**
         * 現在の時刻や設定からシステムプロンプトを構築する
         */
        _buildSystemPrompt(state) {
            let configPrompt = "";
            try {
                if (state.vfs && state.vfs.exists('system/config.json')) {
                    const conf = JSON.parse(state.vfs.readFile('system/config.json'));
                    const user = conf.username || "User";
                    const agent = conf.agentName || "Itera";
                    configPrompt = `\n\n<persona_config>\nYour Name: ${agent}\nUser Name: ${user}\n</persona_config>`;
                }
            } catch (e) {
                // Config read error ignored
            }

            const now = new Date();
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const timePrompt = `\n\n<system_info>\nCurrent Time: ${now.toLocaleString()} (${days[now.getDay()]})\nTimestamp: ${now.toISOString()}\n</system_info>`;

            return this.systemPrompt + configPrompt + timePrompt;
        }

        /**
         * 履歴内の古い画像を削除してトークンを節約する（内部状態のクローンを操作）
         * Iteraの内部履歴フォーマットに対する操作なので、Baseクラスで共通化可能
         */
        _optimizeHistory(historyClone) {
            let foundLatestImage = false;
            // 後ろから走査
            for (let i = historyClone.length - 1; i >= 0; i--) {
                const turn = historyClone[i];
                if (!Array.isArray(turn.content)) continue;

                // ツール実行結果に含まれる画像を探す
                if (turn.meta && turn.meta.type === 'tool_execution') {
                    turn.content.forEach(item => {
                        if (item.output && item.output.image) {
                            if (foundLatestImage) {
                                // 2枚目以降（過去のもの）は削除
                                delete item.output.image;
                                item.output.log = (item.output.log || "") + "\n[System: Old screenshot image removed to save context]";
                            } else {
                                foundLatestImage = true;
                            }
                        }
                    });
                }
            }
        }
    }

    /**
     * Google Gemini Implementation
     * 構造: { role: 'user'|'model', parts: [{ text: ... }, { inlineData: ... }] }
     */
    class GeminiProjector extends BaseProjector {
        createContext(state) {
            // 1. 履歴のディープコピーと最適化
            const history = JSON.parse(JSON.stringify(state.getHistory()));
            this._optimizeHistory(history);

            const apiMessages = [];

            // 2. System Prompt (Geminiは通常 system_instruction を使うが、文脈維持のため User Message 0 として扱うパターンも安定している)
            // ここでは user message として先頭に追加する方式を採用
            const dynamicPrompt = this._buildSystemPrompt(state);
            apiMessages.push({
                role: 'user',
                parts: [{ text: dynamicPrompt }]
            });

            // 3. 履歴の変換
            for (const turn of history) {
                const parts = this._convertTurnToParts(turn);
                if (!parts || parts.length === 0) continue;

                // Role Mapping
                let apiRole = 'user';
                if (turn.role === Role.MODEL) apiRole = 'model';
                // System role (e.g. tool output) is treated as 'user' in Gemini chat history
                
                apiMessages.push({
                    role: apiRole,
                    parts: parts
                });
            }

            return apiMessages;
        }

        _convertTurnToParts(turn) {
            // 文字列の場合
            if (typeof turn.content === 'string') {
                let text = turn.content;
                if (turn.role === Role.USER) text = `<user_input>\n${text}\n</user_input>`;
                return [{ text: text }];
            }

            // 配列（マルチモーダル/ツール出力）の場合
            if (Array.isArray(turn.content)) {
                
                // A. ツール実行結果
                if (turn.meta && turn.meta.type === 'tool_execution') {
                    const logText = turn.content.map(c => {
                        if (c.output && c.output.log) return c.output.log;
                        return "";
                    }).join('\n').trim();

                    const parts = [];
                    if (logText) parts.push({ text: `<tool_outputs>\n${logText}\n</tool_outputs>` });
                    
                    // 画像 (Inline Data)
                    turn.content.forEach(c => {
                        if (c.output && c.output.image) {
                            parts.push({
                                inlineData: {
                                    mimeType: c.output.mimeType || 'image/png',
                                    data: c.output.image
                                }
                            });
                        }
                    });
                    return parts;
                }

                // B. ユーザー入力 (添付ファイルなど)
                if (turn.role === Role.USER) {
                    const parts = [];
                    let textBuffer = "";

                    const flushText = () => {
                        if (textBuffer.trim()) {
                            parts.push({ text: `<user_input>\n${textBuffer.trim()}\n</user_input>` });
                        }
                        textBuffer = "";
                    };

                    for (const item of turn.content) {
                        if (item.text) {
                            if (item.text.trim().startsWith('<')) {
                                flushText();
                                parts.push({ text: item.text });
                            } else {
                                textBuffer += item.text + "\n";
                            }
                        } else if (item.inlineData) {
                            flushText();
                            parts.push({ inlineData: item.inlineData });
                        }
                    }
                    flushText();
                    return parts;
                }

                // C. モデルの思考/発言
                return turn.content.map(c => {
                    if (c.text) return { text: c.text };
                    return null;
                }).filter(Boolean);
            }
            return [];
        }
    }

    global.Itera.Cognitive.BaseProjector = BaseProjector;
    global.Itera.Cognitive.GeminiProjector = GeminiProjector;

})(window);