// src/core/cognitive/translator.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Cognitive = global.Itera.Cognitive || {};

    /**
     * LPML (LLM-Prompting Markup Language) Parser
     * 正規表現を用いて、LLMの非構造化テキストから実行可能なアクションを抽出する。
     */
    class Translator {
        static PATTERN_ATTRIBUTE = / ([^"'/<> -]+)=(?:"([^"]*)"|'([^']*)')/g;
        static ATTR_PART_NO_CAPTURE = " [^\"'/<> -]+=(?:\"[^\"]*\"|'[^']*')";
        static PATTERN_TAG_START = '<([^/>\\s\\n]+)((?:' + " [^\"'/<> -]+=(?:\"[^\"]*\"|'[^']*')" + ')*)\\s*>';
        static PATTERN_TAG_END = '</([^/>\\s\\n]+)\\s*>';
        static PATTERN_TAG_EMPTY = '<([^/>\\s\\n]+)((?:' + " [^\"'/<> -]+=(?:\"[^\"]*\"|'[^']*')" + ')*)\\s*/>';
        static PATTERN_TAG = new RegExp(`(${Translator.PATTERN_TAG_START})|(${Translator.PATTERN_TAG_END})|(${Translator.PATTERN_TAG_EMPTY})`, 'g');
        static PATTERN_PROTECT = /(`[\s\S]*?`|<!--[\s\S]*?-->|<![\s\S]*?>)/g;

        constructor() {
            // パース対象外のタグ（単なるテキストとして扱うものがあればここに追加）
            this.excludeTags = []; 
        }

        /**
         * テキスト全体をパースし、アクションオブジェクトの配列を返す
         * @param {string} text 
         * @returns {Array} [{ type: 'tag_name', params: {...}, raw: ... }]
         */
        parse(text) {
            const tree = this._parseToTree(text, this.excludeTags);
            let rawActions = tree.filter(item => typeof item === 'object');
            
            const actions = [];
            
            for (const item of rawActions) {
                let contentText = this._extractContent(item.content);
                
                // edit_file の特殊処理: <<<<SEARCH パターンのエスケープ復元などが必要ならここで行う
                // MetaOSではこの中でRegexエスケープ処理をしていた
                if (item.tag === 'edit_file' && contentText.includes('<<<<SEARCH')) {
                    contentText = this._escapeRegexReplacement(contentText);
                }

                const action = {
                    type: item.tag,
                    params: {
                        ...item.attributes,
                        content: contentText
                    },
                    raw: item
                };
                actions.push(action);
            }

            // 実行順序の整理が必要ならここで行う（例: edit_fileの行番号順ソートなど）
            // MetaOSの実装に合わせて、ファイル編集を優先度順に並べる等のロジックはTool側かEngine側で吸収しても良いが、
            // ここでは純粋な抽出に留めるか、MetaOS同様にソートするか。
            // -> MetaOS同様にソートしておく方が安全。
            return this._sortActions(actions);
        }

        // --- Internal Parsing Logic (Legacy MetaOS Core) ---

        _parseAttributes(text) {
            const attributes = {};
            const regex = new RegExp(Translator.PATTERN_ATTRIBUTE);
            let match;
            while ((match = regex.exec(text)) !== null) {
                const key = match[1];
                const value = match[2] !== undefined ? match[2] : match[3];
                attributes[key] = value || "";
            }
            return attributes;
        }

        _restoreString(text, protectedMap) {
            if (!text.includes("__PROTECTED_")) return text;
            let result = text;
            for (const [placeholder, original] of Object.entries(protectedMap)) {
                result = result.replace(placeholder, () => original);
            }
            return result;
        }

        _restoreTree(tree, protectedMap) {
            return tree.map(item => {
                if (typeof item === 'string') return this._restoreString(item, protectedMap);
                if (item.attributes) {
                    for (const k in item.attributes) item.attributes[k] = this._restoreString(item.attributes[k], protectedMap);
                }
                if (Array.isArray(item.content)) {
                    item.content = this._restoreTree(item.content, protectedMap);
                }
                return item;
            });
        }

        _parseToTree(text, exclude = []) {
            const protectedContent = {};
            const protectedText = text.replace(Translator.PATTERN_PROTECT, (match) => {
                const placeholder = `__PROTECTED_${Math.random().toString(36).substring(2, 15)}__`;
                protectedContent[placeholder] = match;
                return placeholder;
            });

            const tree = [];
            let cursor = 0;
            let tagExclude = null;
            let stack = [{ tag: 'root', content: tree }];
            
            const regexTag = new RegExp(Translator.PATTERN_TAG);
            let match;
            
            const regexStart = new RegExp('^' + Translator.PATTERN_TAG_START + '$');
            const regexEnd = new RegExp('^' + Translator.PATTERN_TAG_END + '$');
            const regexEmpty = new RegExp('^' + Translator.PATTERN_TAG_EMPTY + '$');

            while ((match = regexTag.exec(protectedText)) !== null) {
                const tagStr = match[0];
                const indTagStart = match.index;
                const indTagEnd = indTagStart + tagStr.length;
                const matchTagStart = tagStr.match(regexStart);
                const matchTagEnd = tagStr.match(regexEnd);
                const matchTagEmpty = tagStr.match(regexEmpty);

                if (tagExclude !== null) {
                    if (matchTagEnd && matchTagEnd[1] === tagExclude) {
                        tagExclude = null;
                    } else {
                        continue;
                    }
                }

                const contentStr = protectedText.substring(cursor, indTagStart);
                if (contentStr.length > 0) stack[stack.length - 1].content.push(contentStr);
                cursor = indTagEnd;

                if (matchTagStart) {
                    const name = matchTagStart[1];
                    if (exclude.includes(name)) tagExclude = name;
                    const el = {
                        tag: name,
                        attributes: this._parseAttributes(matchTagStart[2]),
                        content: []
                    };
                    stack[stack.length - 1].content.push(el);
                    stack.push(el);
                } else if (matchTagEmpty) {
                    const name = matchTagEmpty[1];
                    const el = {
                        tag: name,
                        attributes: this._parseAttributes(matchTagEmpty[2]),
                        content: null
                    };
                    stack[stack.length - 1].content.push(el);
                } else if (matchTagEnd) {
                    const name = matchTagEnd[1];
                    let idx = stack.length - 1;
                    while (idx > 0 && stack[idx].tag !== name) idx--;
                    if (idx > 0) stack = stack.slice(0, idx);
                    else stack[stack.length - 1].content.push(tagStr);
                }
            }
            const remaining = protectedText.substring(cursor);
            if (remaining.length > 0) stack[stack.length - 1].content.push(remaining);
            
            return this._restoreTree(tree, protectedContent);
        }

        _extractContent(content) {
            if (!content) return "";
            if (Array.isArray(content)) return content.map(c => typeof c === 'string' ? c : "").join("");
            return String(content);
        }

        _escapeRegexReplacement(content) {
            return content.replace(/(<<<<SEARCH\s*[\s\S]*?\s*====\s*)([\s\S]*?)(\s*>>>>)/g, (match, prefix, replacement, suffix) => {
                // JSのreplace関数では $ が特殊意味を持つため、ファイルコンテンツ内の $ をエスケープする
                return prefix + replacement.replace(/\$/g, '$$$$') + suffix;
            });
        }

        _sortActions(actions) {
            // edit_file を優先度順に並び替え（特に同じファイルへの複数編集時）
            const edits = actions.filter(a => a.type === 'edit_file');
            const others = actions.filter(a => a.type !== 'edit_file');
            
            // 割り込み系（ask, finish）を分離
            const interrupts = others.filter(a => ['ask', 'finish'].includes(a.type));
            const normalTools = others.filter(a => !['ask', 'finish'].includes(a.type));

            edits.sort((a, b) => {
                const pathA = a.params.path || "";
                const pathB = b.params.path || "";
                if (pathA !== pathB) return pathA.localeCompare(pathB);
                
                // 行指定がある場合、後ろから適用したほうが安全（行番号がズレない）
                const startA = parseInt(a.params.start || 0);
                const startB = parseInt(b.params.start || 0);
                return startB - startA;
            });

            return [...normalTools, ...edits, ...interrupts];
        }

        /**
         * UI表示用にLPMLタグをHTML装飾する (Streaming対応)
         * @param {string} text Raw text from LLM
         * @returns {string} HTML string
         */
        formatStream(text) {
            const escape = (str) => {
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
            };

            // 簡易的なストリーム表示用の置換ロジック
            // 完全なパースではなく、<tag>~</tag> を見つけて装飾する
            // 注意: ストリーム途中だと閉じタグがない場合があるが、Regexはある程度許容する
            
            const TAG_NAME_PATTERN = '[a-zA-Z0-9_\\-]+';
            const TAG_REGEX = new RegExp(
                `&lt;(${TAG_NAME_PATTERN})([^&]*)&gt;([\\s\\S]*?)&lt;\\/\\1&gt;|` +
                `&lt;(${TAG_NAME_PATTERN})([^&]*)\\/&gt;`,
                'g'
            );

            let safeText = escape(text);
            const parts = [];
            let lastIndex = 0;
            let match;

            while ((match = TAG_REGEX.exec(safeText)) !== null) {
                const gap = safeText.substring(lastIndex, match.index);
                if (gap) parts.push(`<span class="text-gray-300 whitespace-pre-wrap">${gap}</span>`);
                
                // タグ部分のHTML生成 (UIコンポーネントで定義されていたロジックをここに移植できるが、
                // DOM要素を返すよりHTML文字列を返すほうが扱いやすい)
                const tagName = match[1] || match[4];
                const attrs = match[2] || match[5] || "";
                const content = match[3] || "";
                
                parts.push(this._createTagHTML(tagName, attrs, content));
                lastIndex = TAG_REGEX.lastIndex;
            }
            
            const remaining = safeText.substring(lastIndex);
            if (remaining) parts.push(`<span class="text-gray-300 whitespace-pre-wrap">${remaining}</span>`);
            
            return parts.join('');
        }

        _createTagHTML(tagName, attributes, content) {
            // 色分けやアイコン定義
            let title = tagName;
            let colorClass = "border-gray-600 bg-gray-800";
            let isOpen = false;

            const getAttr = (key) => {
                const m = attributes.match(new RegExp(`${key}=["']?([^"'\\s]+)["']?`));
                return m ? m[1] : null;
            };

            switch(tagName) {
                case 'thinking':
                    title = "💭 Thinking";
                    colorClass = "border-blue-900 bg-blue-900/20";
                    break;
                case 'plan':
                    title = "📅 Plan";
                    colorClass = "border-green-900 bg-green-900/20";
                    break;
                case 'ask':
                    title = "❓ Question";
                    colorClass = "border-indigo-900 bg-indigo-900/40";
                    isOpen = true;
                    break;
                case 'finish':
                    title = "✅ Completed";
                    colorClass = "border-green-600 bg-green-900/60";
                    isOpen = true;
                    break;
                case 'create_file':
                case 'edit_file':
                    const path = getAttr('path') || 'file';
                    title = `📝 ${tagName}: ${path}`;
                    colorClass = "border-yellow-900 bg-yellow-900/20";
                    break;
                default:
                    title = `⚙️ ${tagName}`;
                    colorClass = "border-gray-600 bg-gray-700/50";
            }

            const openAttr = isOpen ? 'open' : '';
            let displayContent = content.trim();
            
            // 属性表示
            if (attributes.trim()) {
                displayContent = `<div class="text-[10px] text-gray-500 mb-1 border-b border-gray-700 pb-1 opacity-70">${attributes.trim()}</div>${displayContent}`;
            }

            if (!displayContent) {
                return `<div class="text-xs font-mono py-1 px-2 rounded border ${colorClass} mb-2 inline-block opacity-80">&lt;${tagName} /&gt;</div>`;
            }

            return `
                <details ${openAttr} class="mb-2 rounded border ${colorClass} overflow-hidden group">
                    <summary class="cursor-pointer p-2 text-xs font-bold text-gray-300 bg-black/20 hover:bg-black/40 select-none flex items-center gap-2">
                        <span class="group-open:rotate-90 transition-transform text-[10px]">▶</span> ${title}
                    </summary>
                    <div class="p-2 text-xs font-mono overflow-x-auto bg-black/10 whitespace-pre-wrap">${displayContent}</div>
                </details>
            `.trim();
        }
    }

    global.Itera.Cognitive.Translator = Translator;

})(window);