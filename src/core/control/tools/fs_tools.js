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
                // バイナリ処理
                let mimeType = 'application/octet-stream';
                if (params.path.match(/\.pdf$/i)) mimeType = 'application/pdf';
                else if (params.path.match(/\.(png|jpg|jpeg)$/i)) mimeType = 'image/png';
                
                // DataURLからMimeTypeを抽出できる場合は上書き
                if (content.startsWith('data:')) {
                    const match = content.match(/:(.*?);/);
                    if (match) mimeType = match[1];
                }

                // ★ 新しい media オブジェクトを返す (Base64の実体は返さない)
                return {
                    log: `[read_file] Read binary file: ${params.path} (${mimeType})`,
                    ui: `📦 Read Binary ${params.path}`,
                    media: {
                        path: params.path,
                        mimeType: mimeType,
                        metadata: {}
                    }
                };
            }

            // テキスト処理 (変更なし)
            const lines = content.split(/\r?\n/);
            
            let s = parseInt(params.start);
            let e = parseInt(params.end);
            
            const hasStart = !isNaN(s);
            const hasEnd = !isNaN(e);

            if (!hasStart) s = 1;

            if (!hasEnd) {
                if (hasStart) {
                    e = lines.length;
                } else {
                    // start/end 両方指定なし: デフォルト制限 (800行)
                    e = Math.min(lines.length, 800);
                }
            }

            const startIdx = Math.max(0, s - 1);
            const endIdx = Math.min(lines.length, e);

            const sliced = lines.slice(startIdx, endIdx);
            
            // デフォルトOFF ("true" の時だけ行番号表示)
            const showNum = params.line_numbers === 'true';
            
            const contentStr = showNum 
                ? sliced.map((l, i) => `${s + i} | ${l}`).join('\n') 
                : sliced.join('\n');

            let logMsg = `[read_file] ${params.path} (Lines ${s}-${endIdx} of ${lines.length}):\n${contentStr}`;
            
            if (endIdx < lines.length) {
                logMsg += `\n\n... (File truncated. ${lines.length - endIdx} more lines. Use start=${endIdx + 1} to read more)`;
            }

            return {
                log: logMsg,
                ui: `📖 Read ${params.path}`
            };
        });

        // 2. create_file
        registry.register('create_file', async (params, context) => {
            let content = params.content || "";
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

            if (params.mode) {
                const msg = vfs.editLines(params.path, params.start, params.end, params.mode, content);
                return {
                    log: `[edit_file] ${msg}`,
                    ui: `✏️ Edited ${params.path} (${params.mode})`
                };
            }

            if (/<{3,}SEARCH/.test(content)) {
                const blockRegex = /<{3,}SEARCH[^\r\n]*\r?\n([\s\S]*?)\r?\n[^\r\n]*={3,}[^\r\n]*\r?\n([\s\S]*?)\r?\n[^\r\n]*>{3,}/g;
                const blocks = [...content.matchAll(blockRegex)];

                if (blocks.length === 0) {
                    throw new Error("Invalid edit block format. Ensure you use SEARCH, ====, and >>>> markers correctly.");
                }

                const isRegex = params.regex === 'true';
                let currentFileContent = vfs.readFile(params.path);
                let replaceCount = 0;

                for (let i = 0; i < blocks.length; i++) {
                    let patternStr = blocks[i][1];
                    let replaceStr = blocks[i][2];

                    if (!isRegex) {
                        patternStr = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    }

                    let regex;
                    try {
                        regex = new RegExp(patternStr, 'm');
                    } catch (e) {
                        throw new Error(`Invalid RegExp in block ${i + 1}: ${e.message}`);
                    }

                    if (!regex.test(currentFileContent)) {
                        throw new Error(`Search pattern not found in ${params.path} for block ${i + 1}. No changes were made to the file.`);
                    }

                    const newContent = currentFileContent.replace(regex, replaceStr);
                    if (newContent === currentFileContent) {
                        throw new Error(`Replacement resulted in no change for block ${i + 1}. No changes were made to the file.`);
                    }
                    
                    currentFileContent = newContent;
                    replaceCount++;
                }

                vfs.writeFile(params.path, currentFileContent);
                const blockMsg = replaceCount > 1 ? ` (${replaceCount} blocks updated)` : '';
                return {
                    log: `[edit_file] Replaced content in ${params.path}${blockMsg}`,
                    ui: `✏️ Replaced content in ${params.path}`
                };
            }
            throw new Error("Invalid <edit_file> content. Use SEARCH markers or specify 'mode' attribute.");
        });

        // 4. list_files
        registry.register('list_files', async (params, context) => {
            const root = params.path || "";
            const recursive = params.recursive === 'true';
            const detail = params.detail === 'true'; // パラメータ受け取り
            
            const files = context.vfs.listFiles({ 
                path: root, 
                recursive: recursive, 
                detail: detail // VFSに渡す
            });
            
            const limit = 100;
            let displayFiles = files;
            let suffix = "";
            
            if (files.length > limit) {
                displayFiles = files.slice(0, limit);
                suffix = `\n... (${files.length - limit} more files)`;
            }

            // 出力フォーマット処理
            const formatOutput = (fileList) => {
                if (!detail) return fileList.join('\n'); // 文字列配列の場合
                
                // オブジェクト配列の場合の整形
                return fileList.map(f => {
                    const typeMark = f.type === 'folder' ? '[DIR] ' : '      ';
                    const sizeStr = (f.size < 1024) ? `${f.size} B` : `${(f.size/1024).toFixed(1)} KB`;
                    const dateStr = new Date(f.updated_at).toISOString().slice(0, 19).replace('T', ' ');
                    // 例: [DIR]  src/             | 0 B       | 2026-02-18 10:00:00
                    return `${typeMark} ${f.path.padEnd(40)} | ${sizeStr.padStart(10)} | ${dateStr}`;
                }).join('\n');
            };

            const resultStr = formatOutput(displayFiles) + suffix;

            return {
                log: `[list_files] path="${root}" recursive=${recursive} detail=${detail}\n${resultStr}`,
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