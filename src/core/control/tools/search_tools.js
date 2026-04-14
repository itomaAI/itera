// src/core/control/tools/search_tools.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Control = global.Itera.Control || {};
    global.Itera.Control.Tools = global.Itera.Control.Tools || {};

    // UIブロッキング回避のための待機関数
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    // バイナリ除外用
    const isBinary = (path) => path.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|bmp|pdf|zip|tar|gz|7z|rar|mp3|wav|mp4|webm|ogg|eot|ttf|woff|woff2)$/i);

    global.Itera.Control.Tools.registerSearchTools = function(registry) {
        
        registry.register('search', async (params, context) => {
            const query = params.query;
            if (!query) throw new Error("Attribute 'query' is required.");

            const rootPath = params.path || '';
            const extensions = params.include ? params.include.split(',').map(e => e.trim().toLowerCase().replace(/^\*/, '')) : [];
            const contextLines = parseInt(params.context || '2', 10);
            
            // --- ★ Modified: Enhanced Regex & Flags Logic ---
            // 1. Regex判定を緩く (True/TRUE も許容)
            const useRegex = params.regex && params.regex.toLowerCase() === 'true';
            
            // 2. Case Sensitive判定 (デフォルトは insensitive)
            const isCaseSensitive = params.case_sensitive && params.case_sensitive.toLowerCase() === 'true';
            const flags = isCaseSensitive ? 'm' : 'mi'; // m: multiline (though we search line-by-line, good habit)

            // 正規表現の準備
            let regex;
            try {
                const pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regex = new RegExp(pattern, flags);
            } catch (e) {
                return { log: `Invalid Regex Pattern: "/${query}/" -> ${e.message}`, error: true };
            }
            // -----------------------------------------------

            const allFiles = context.vfs.listFiles({ recursive: true });
            const results = [];

            // パフォーマンス計測用
            let lastYieldTime = performance.now();
            const YIELD_INTERVAL_MS = 15; // 15msごとに中断（60fps維持）

            for (const filePath of allFiles) {
                // 1. パスフィルタ
                if (rootPath && !filePath.startsWith(rootPath)) continue;

                // 2. 拡張子フィルタ
                if (extensions.length > 0) {
                    const ext = '.' + filePath.split('.').pop().toLowerCase();
                    if (!extensions.some(e => ext.endsWith(e))) continue;
                }

                // 3. ブロッキング回避
                if (performance.now() - lastYieldTime > YIELD_INTERVAL_MS) {
                    await yieldToMain();
                    lastYieldTime = performance.now();
                }

                // 4. パス名・ファイル名の検索
                if (regex.test(filePath)) {
                    results.push(`[Path Match] ${filePath}\n---`);
                }

                // パスマッチだけで上限に達した場合はここで停止
                if (results.length >= 20) {
                    results.push("... (Search truncated: Too many matches)");
                    break;
                }

                // 5. コンテンツ検索 (バイナリ除外)
                if (isBinary(filePath)) continue;

                const content = context.vfs.readFile(filePath);
                const lines = content.split(/\r?\n/);
                let fileHits = 0;

                for (let j = 0; j < lines.length; j++) {
                    if (regex.test(lines[j])) {
                        fileHits++;

                        if (fileHits > 5) {
                            results.push(`  ... and more matches in ${filePath}`);
                            break;
                        }

                        // コンテキスト抽出
                        const startLine = Math.max(0, j - contextLines);
                        const endLine = Math.min(lines.length, j + contextLines + 1);
                        
                        const snippet = lines.slice(startLine, endLine).map((l, idx) => {
                            const currentLineNum = startLine + idx + 1;
                            const marker = (currentLineNum === j + 1) ? '>' : ' ';
                            return `${marker} ${currentLineNum.toString().padStart(4, ' ')} | ${l}`;
                        }).join('\n');

                        results.push(`File: ${filePath}\n${snippet}\n---`);
                    }
                }

                // トークン節約のためヒット数上限
                if (results.length >= 20) {
                    results.push("... (Search truncated: Too many matches)");
                    break;
                }
            }

            if (results.length === 0) {
                return {
                    log: `No matches found.`,
                    ui: `🔍 No matches found`
                };
            }

            return {
                log: results.join('\n'),
                ui: `🔍 Search: "${query}" (${results.length} hits)`
            };
        });
    };

})(window);