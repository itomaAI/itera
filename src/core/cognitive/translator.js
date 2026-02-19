// src/core/cognitive/translator.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Cognitive = global.Itera.Cognitive || {};

    /**
     * LPML (LLM-Prompting Markup Language) Parser
     * 純粋なロジッククラス。UI依存（HTML生成）は持たない。
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
            this.excludeTags = [
                'create_file', 
                'edit_file', 
                'thinking', 
                'plan', 
                'report', 
                'ask', 
                'user_input',
                'user_attachment'
            ]; 
        }

        /**
         * テキスト全体をパースし、アクションオブジェクトの配列を返す
         */
        parse(text) {
            const tree = this._parseToTree(text, this.excludeTags);
            let rawActions = tree.filter(item => typeof item === 'object');
            
            const actions = [];
            for (const item of rawActions) {
                let contentText = this._extractContent(item.content);
                if (item.tag === 'edit_file' && contentText.includes('<<<<SEARCH')) {
                    contentText = this._escapeRegexReplacement(contentText);
                }
                const action = {
                    type: item.tag,
                    params: { ...item.attributes, content: contentText },
                    raw: item
                };
                actions.push(action);
            }
            return this._sortActions(actions);
        }

        // --- Internal Parsing Logic ---
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
                    const el = { tag: name, attributes: this._parseAttributes(matchTagStart[2]), content: [] };
                    stack[stack.length - 1].content.push(el);
                    stack.push(el);
                } else if (matchTagEmpty) {
                    const name = matchTagEmpty[1];
                    const el = { tag: name, attributes: this._parseAttributes(matchTagEmpty[2]), content: null };
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
                return prefix + replacement.replace(/\$/g, '$$$$') + suffix;
            });
        }
        _sortActions(actions) {
            const edits = actions.filter(a => a.type === 'edit_file');
            const others = actions.filter(a => a.type !== 'edit_file');
            const interrupts = others.filter(a => ['ask', 'finish'].includes(a.type));
            const normalTools = others.filter(a => !['ask', 'finish'].includes(a.type));
            edits.sort((a, b) => {
                const pathA = a.params.path || "";
                const pathB = b.params.path || "";
                if (pathA !== pathB) return pathA.localeCompare(pathB);
                const startA = parseInt(a.params.start || 0);
                const startB = parseInt(b.params.start || 0);
                return startB - startA;
            });
            return [...normalTools, ...edits, ...interrupts];
        }

        // REMOVED: formatStream()
        // REMOVED: _createTagHTML()
    }

    global.Itera.Cognitive.Translator = Translator;

})(window);