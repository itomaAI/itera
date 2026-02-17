// src/core/control/tools/fs_tools.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Control = global.Itera.Control || {};
    global.Itera.Control.Tools = global.Itera.Control.Tools || {};

    /**
     * ファイルシステム操作ツールの登録関数
     * @param {ToolRegistry} registry 
     */
    global.Itera.Control.Tools.registerFSTools = function(registry) {
        
        // 1. read_file
        registry.register('read_file', async (params, context) => {
            const vfs = context.vfs;
            if (!vfs.exists(params.path)) throw new Error(`File not found: ${params.path}`);

            const BINARY_EXTS = /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp|pdf|zip|tar|gz|7z|rar|mp3|wav|mp4|webm|ogg)$/i;
            const isBinary = params.path.match(BINARY_EXTS);
            const content = vfs.readFile(params.path);

            if (isBinary) {
                // バイナリの場合、DataURIからBase64部分とMimeTypeを抽出して返す
                let base64 = content;
                let mimeType = 'application/octet-stream';

                // 簡易MimeType判定
                if (params.path.match(/\.pdf$/i)) mimeType = 'application/pdf';
                else if (params.path.match(/\.(png|jpg|jpeg)$/i)) mimeType = 'image/png'; // 概略
                
                if (content.startsWith('data:')) {
                    const parts = content.split(',');
                    base64 = parts[1];
                    const match = parts[0].match(/:(.*?);/);
                    if (match) mimeType = match[1];
                }

                return {
                    log: `[read_file] Read binary file: ${params.path} (${mimeType})`,
                    ui: `📦 Read Binary ${params.path}`,
                    image: base64, // 画像として表示可能な場合、Projectorが拾う
                    mimeType: mimeType
                };
            }

            // テキストの場合
            const lines = content.split(/\r?\n/);
            
            // 部分読み込み (start/end)
            let s = parseInt(params.start);
            if (isNaN(s)) s = 1;
            let e = parseInt(params.end);
            // デフォルトは大きめに取るが、全行読み込みも許容
            if (isNaN(e)) e = lines.length; 

            const sliced = lines.slice(Math.max(0, s - 1), Math.min(lines.length, e));
            const showNum = params.line_numbers !== 'false';
            
            const contentStr = showNum 
                ? sliced.map((l, i) => `${s + i} | ${l}`).join('\n') 
                : sliced.join('\n');

            let logMsg = `[read_file] ${params.path} (Lines ${s}-${Math.min(lines.length, e)} of ${lines.length}):\n${contentStr}`;
            if (e < lines.length) logMsg += `\n... (File truncated. Use start=${e+1} to read more)`;

            return {
                log: logMsg,
                ui: `📖 Read ${params.path}`
            };
        });

        // 2. create_file
        registry.register('create_file', async (params, context) => {
            let content = params.content || "";
            // 先頭・末尾の改行トリムは任意だが、LLMの癖に合わせて実施
            content = content.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
            
            const msg = context.vfs.writeFile(params.path, content);
            return {
                log: `[create_file] ${msg}`,
                ui: `📝 Created ${params.path}`
            };
        });

        // 3. edit_file
        registry.register('edit_file', async (params, context) => {
            const vfs = context.vfs;
            const content = params.content || "";

            // A. 行編集モード (mode属性がある場合)
            if (params.mode) {
                const msg = vfs.editLines(params.path, params.start, params.end, params.mode, content);
                return {
                    log: `[edit_file] ${msg}`,
                    ui: `✏️ Edited ${params.path} (${params.mode})`
                };
            }

            // B. 文字列置換モード (<<<<SEARCH マーカー使用)
            const MARKER_SEARCH = "<<<<SEARCH";
            const MARKER_DIVIDER = "====";
            const MARKER_END = ">>>>";

            if (content.includes(MARKER_SEARCH)) {
                if (content.split(MARKER_SEARCH).length > 2) throw new Error("Multiple replacements in one tag are not supported.");
                
                const searchStart = content.indexOf(MARKER_SEARCH) + MARKER_SEARCH.length;
                const divStart = content.indexOf(MARKER_DIVIDER);
                const divEnd = divStart + MARKER_DIVIDER.length;
                const blockEnd = content.lastIndexOf(MARKER_END);

                if (divStart === -1 || blockEnd === -1) throw new Error("Invalid edit block format.");

                let patternStr = content.substring(searchStart, divStart);
                let replaceStr = content.substring(divEnd, blockEnd);

                // マーカー前後の改行を除去
                if (patternStr.startsWith('\n')) patternStr = patternStr.substring(1);
                if (patternStr.endsWith('\n')) patternStr = patternStr.substring(0, patternStr.length - 1);
                if (replaceStr.startsWith('\n')) replaceStr = replaceStr.substring(1);
                if (replaceStr.endsWith('\n')) replaceStr = replaceStr.substring(0, replaceStr.length - 1);

                // Regexフラグ
                const isRegex = params.regex === 'true';
                if (!isRegex) {
                    // Regexを使わない場合はエスケープして完全一致検索にする
                    patternStr = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                }

                const msg = vfs.replaceContent(params.path, patternStr, replaceStr);
                return {
                    log: `[edit_file] ${msg}`,
                    ui: `✏️ Replaced content in ${params.path}`
                };
            }

            throw new Error("Invalid <edit_file> content. Use strict markers (<<<<SEARCH) or specify 'mode' attribute.");
        });

        // 4. list_files
        registry.register('list_files', async (params, context) => {
            const root = params.path || "";
            const recursive = params.recursive === 'true';
            
            // コンテキスト節約のため、詳細情報は出さないシンプルなリスト
            const files = context.vfs.listFiles({ path: root, recursive: recursive });
            
            // 数が多い場合の省略表示
            const limit = 100;
            let displayFiles = files;
            let suffix = "";
            if (files.length > limit) {
                displayFiles = files.slice(0, limit);
                suffix = `\n... (${files.length - limit} more files)`;
            }

            return {
                log: `[list_files] path="${root}" recursive=${recursive}\n${displayFiles.join('\n')}${suffix}`,
                ui: `📂 Listed ${files.length} files`
            };
        });

        // 5. delete_file
        registry.register('delete_file', async (params, context) => {
            const msg = context.vfs.deleteFile(params.path);
            return {
                log: `[delete_file] ${msg}`,
                ui: `🗑️ Deleted ${params.path}`
            };
        });

        // 6. move_file
        registry.register('move_file', async (params, context) => {
            const msg = context.vfs.rename(params.path, params.new_path);
            return {
                log: `[move_file] ${msg}`,
                ui: `🚚 Moved ${params.path}`
            };
        });

        // 7. copy_file
        registry.register('copy_file', async (params, context) => {
            const msg = context.vfs.copyFile(params.path, params.new_path);
            return {
                log: `[copy_file] ${msg}`,
                ui: `📄 Copied ${params.path}`
            };
        });

    };

})(window);