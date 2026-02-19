// src/ui/services/lpml_renderer.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.UI = global.Itera.UI || {};
    global.Itera.UI.Services = global.Itera.UI.Services || {};

    /**
     * LPML (LLM-Prompting Markup Language) Renderer
     * 思考ログやツール実行ログをHTMLとして装飾・表示する責務を持つ
     */
    class LPMLRenderer {
        constructor() {
            // 将来的にテーマ設定などを受け取るならここで
        }

        /**
         * UI表示用にLPMLタグをHTML装飾する (Streaming対応)
         * テキストを受け取り、HTML文字列を返す
         */
        formatStream(text) {
            const escape = (str) => {
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
            };

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
                // タグ間のテキストが空白のみの場合は無視して表示をスッキリさせる
                if (gap && gap.trim().length > 0) {
                    parts.push(`<span class="text-gray-300 whitespace-pre-wrap">${gap}</span>`);
                }
                
                const tagName = match[1] || match[4];
                const attributes = match[2] || match[5] || "";
                const content = match[3] || "";
                
                parts.push(this._createTagHTML(tagName, attributes, content));
                lastIndex = TAG_REGEX.lastIndex;
            }
            
            const remaining = safeText.substring(lastIndex);
            // 末尾テキストも空白のみなら無視
            if (remaining && remaining.trim().length > 0) {
                parts.push(`<span class="text-gray-300 whitespace-pre-wrap">${remaining}</span>`);
            }
            
            return parts.join('');
        }

        /**
         * 個別のタグに対するHTML生成ロジック
         * Tailwind CSSクラスはここで定義される
         */
        _createTagHTML(tagName, attributes, content) {
            let title = tagName;
            let colorClass = "border-gray-600 bg-gray-800";
            let isOpen = false;

            const getAttr = (key) => {
                const m = attributes.match(new RegExp(`${key}=["']?([^"'\\s]+)["']?`));
                return m ? m[1] : null;
            };

            // タグごとのスタイル定義
            switch(tagName) {
                case 'thinking':
                    title = "💭 Thinking";
                    colorClass = "border-blue-900 bg-blue-900/20";
                    break;
                case 'plan':
                    title = "📅 Plan";
                    colorClass = "border-green-900 bg-green-900/20";
                    break;
                case 'report':
                    title = "📢 Report";
                    colorClass = "border-indigo-900 bg-indigo-900/40";
                    isOpen = true; 
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
            
            // 属性がある場合は薄く表示
            if (attributes.trim()) {
                displayContent = `<div class="text-[10px] text-gray-500 mb-1 border-b border-gray-700 pb-1 opacity-70">${attributes.trim()}</div>${displayContent}`;
            }

            // コンテンツがないタグ（自己完結タグ）の表示
            if (!displayContent) {
                return `<div class="text-xs font-mono py-1 px-2 rounded border ${colorClass} mb-2 inline-block opacity-80" title="&lt;${tagName} /&gt;">${title}</div>`;
            }

            // コンテンツがあるタグ（details/summaryで開閉可能に）
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

    global.Itera.UI.Services.LPMLRenderer = LPMLRenderer;

})(window);