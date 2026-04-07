// src/core/state/vfs.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.State = global.Itera.State || {};

    class VirtualFileSystem {
        constructor(initialFiles = {}, config = {}) {
            this.files = {};
            this.listeners = {}; 
            this.MAX_SIZE = (config.capacityMB || 256) * 1024 * 1024;
            this.loadFiles(initialFiles);
        }

        on(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(callback);
            return () => {
                this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
            };
        }

        _emit(event, payload) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(cb => cb(payload));
            }
        }

        _norm(path) {
            if (!path || typeof path !== 'string') return "";
            // 1. スラッシュの統一
            let p = path.replace(/\\/g, '/');
            // 2. セグメント分解と不要な要素(".", "")の除去
            const parts = p.split('/').filter(part => part !== '.' && part !== '');
            // 3. 親ディレクトリ参照(..)の解決
            const stack = [];
            for (const part of parts) {
                if (part === '..') {
                    if (stack.length > 0) stack.pop();
                } else {
                    stack.push(part);
                }
            }
            // 4. 常に先頭にスラッシュのない「ルートからの相対フルパス」を返す
            return stack.join('/');
        }

        _migrateFile(data) {
            const now = Date.now();
            if (typeof data === 'string') {
                return {
                    content: data,
                    meta: { created_at: now, updated_at: now }
                };
            }
            return {
                content: data.content || "",
                meta: {
                    created_at: data.meta?.created_at || now,
                    updated_at: data.meta?.updated_at || now
                }
            };
        }

        _calcTotalSize() {
            let size = 0;
            Object.values(this.files).forEach(f => size += f.content.length);
            return size;
        }

        getUsage() {
            const used = this._calcTotalSize();
            return {
                used: used,
                max: this.MAX_SIZE,
                percent: Math.min(100, (used / this.MAX_SIZE) * 100),
                isFull: used >= this.MAX_SIZE
            };
        }

        loadFiles(newFiles) {
            this.files = {};
            Object.entries(newFiles).forEach(([path, data]) => {
                this.files[this._norm(path)] = this._migrateFile(data);
            });
            this._emit('loaded', { count: Object.keys(this.files).length });
            this._emit('change', { type: 'reload', path: null, usage: this.getUsage() });
        }

        isFile(path) {
            return Object.prototype.hasOwnProperty.call(this.files, this._norm(path));
        }

        exists(path) {
            const p = this._norm(path);
            return this.isFile(p) || this.isDirectory(p);
        }

        isDirectory(path) {
            let p = this._norm(path);
            if (!p) return true; // root is directory
            if (!p.endsWith('/')) p += '/';
            // Check if any file starts with this prefix
            return Object.keys(this.files).some(key => key.startsWith(p));
        }

        stat(path) {
            const p = this._norm(path);

            // 1. File exists
            if (this.isFile(p)) {
                const f = this.files[p];
                return {
                    path: p,
                    size: f.content.length,
                    created_at: f.meta.created_at,
                    updated_at: f.meta.updated_at,
                    type: 'file'
                };
            }

            // 2. Directory exists (Virtual check)
            if (this.isDirectory(p)) {
                return {
                    path: p,
                    size: 0,
                    created_at: 0,
                    updated_at: 0,
                    type: 'folder'
                };
            }

            throw new Error(`Path not found: ${path}`);
        }

        readFile(path, opts = {}) {
            const p = this._norm(path);
            if (!this.isFile(p)) throw new Error(`File not found: ${p}`);
            
            return this.files[p].content;
        }

        writeFile(path, content, opts = {}) {
            const p = this._norm(path);
            if (!p) throw new Error("Cannot write to root path.");

            if (!this.isFile(p) && this.isDirectory(p)) {
                throw new Error(`Cannot write file: A directory already exists at ${p}`);
            }

            if (typeof content !== 'string') {
                throw new Error(`[VFS] content must be a string. For binary data, convert it to a Base64 Data URI string before writing.`);
            }

            const now = Date.now();
            const newSize = content.length;
            const exists = this.isFile(p);
            const oldSize = exists ? this.files[p].content.length : 0;
            const currentTotal = this._calcTotalSize();

            if (currentTotal - oldSize + newSize > this.MAX_SIZE) {
                throw new Error(`Storage Quota Exceeded. Cannot write ${p}.`);
            }

            if (exists) {
                this.files[p].content = content;
                this.files[p].meta.updated_at = now;
            } else {
                this.files[p] = {
                    content: content,
                    meta: { created_at: now, updated_at: now }
                };
            }

            const eventType = exists ? 'modify' : 'create';
            this._emit('change', { type: eventType, path: p, usage: this.getUsage() });
            return exists ? `Overwrote ${p}` : `Created ${p}`;
        }

        deleteFile(path) {
            const p = this._norm(path);
            if (this.isFile(p)) {
                if (p.startsWith('.trash/') || p.startsWith('system/cache/') || p.startsWith('system/logs/')) {
                    // ゴミ箱、キャッシュ、またはシステムログ領域の場合は完全削除
                    delete this.files[p];
                    this._emit('change', { type: 'delete', path: p, usage: this.getUsage() });
                    return `Permanently deleted file: ${p}`;
                } else {
                    // ゴミ箱へ移動
                    const filename = p.split('/').pop();
                    const trashPath = `.trash/${Date.now()}_${filename}`;
                    this.files[trashPath] = this.files[p];
                    this.files[trashPath].meta.deleted_at = Date.now();
                    this.files[trashPath].meta.original_path = p;
                    delete this.files[p];
                    this._emit('change', { type: 'delete', path: p, usage: this.getUsage() });
                    return `Moved to trash: ${p}`;
                }
            }
            
            // ファイルとして存在しない場合、ディレクトリとして存在するか確認してからフォールバック
            if (this.isDirectory(p)) {
                return this.deleteDirectory(p);
            }

            throw new Error(`File or Directory not found: ${path}`);
        }

        createDirectory(path) {
            let p = this._norm(path);
            if (p.endsWith('/')) p = p.slice(0, -1);
            if (!p) return;
            
            // 同名のファイルが既に存在する場合はエラー
            if (this.isFile(p)) {
                throw new Error(`Cannot create directory: A file already exists at ${p}`);
            }
            
            const keepFile = `${p}/.keep`;
            if (!this.isFile(keepFile)) {
                this.writeFile(keepFile, "");
                return `Created directory: ${p}`;
            }
            return `Directory already exists: ${p}`;
        }

        deleteDirectory(path) {
            let p = this._norm(path);
            if (!p.endsWith('/')) p += '/';
            
            const targets = Object.keys(this.files).filter(k => k.startsWith(p));
            if (targets.length === 0) return `Path ${p} not found.`;

            if (p.startsWith('.trash/') || p.startsWith('system/cache/')) {
                // ゴミ箱内またはキャッシュ領域の場合は完全削除
                targets.forEach(k => delete this.files[k]);
                this._emit('change', { type: 'delete_dir', path: p, usage: this.getUsage() });
                return `Permanently deleted directory ${p} (${targets.length} files).`;
            } else {
                // ゴミ箱へ移動
                const timestamp = Date.now();
                const dirName = p.split('/').filter(Boolean).pop();
                const trashBase = `.trash/${timestamp}_${dirName}/`;
                
                targets.forEach(k => {
                    const dest = k.replace(p, trashBase);
                    this.files[dest] = this.files[k];
                    this.files[dest].meta.deleted_at = timestamp;
                    this.files[dest].meta.original_path = k;
                    delete this.files[k];
                });
                
                this._emit('change', { type: 'delete_dir', path: p, usage: this.getUsage() });
                return `Moved directory to trash: ${p} (${targets.length} files).`;
            }
        }

        rename(oldPath, newPath) {
            const oldP = this._norm(oldPath);
            const newP = this._norm(newPath);

            // ファイルのリネーム
            if (this.isFile(oldP)) {
                if (this.exists(newP)) throw new Error(`Destination ${newP} already exists.`);
                this.files[newP] = this.files[oldP];
                delete this.files[oldP];
                this._emit('change', { type: 'rename', path: newP, from: oldP, to: newP, usage: this.getUsage() });
                return `Renamed: ${oldP} -> ${newP}`;
            }

            const oldDir = oldP.endsWith('/') ? oldP : oldP + '/';
            const newDir = newP.endsWith('/') ? newP : newP + '/';
            const targets = Object.keys(this.files).filter(k => k.startsWith(oldDir));

            if (targets.length > 0) {
                const conflict = targets.some(k => this.exists(k.replace(oldDir, newDir)));
                if (conflict) throw new Error(`Destination conflict in directory move.`);

                targets.forEach(k => {
                    const dest = k.replace(oldDir, newDir);
                    this.files[dest] = this.files[k];
                    delete this.files[k];
                });
                this._emit('change', { type: 'rename_dir', path: newP, from: oldP, to: newP, usage: this.getUsage() });
                return `Moved directory: ${oldP} -> ${newP}`;
            }

            throw new Error(`Source ${oldP} not found.`);
        }

        copyFile(srcPath, destPath) {
            const src = this._norm(srcPath);
            const dest = this._norm(destPath);
            if (!this.isFile(src)) throw new Error(`Source file ${src} not found.`);
            if (this.exists(dest)) throw new Error(`Destination ${dest} already exists.`);

            const content = this.files[src].content;
            this.writeFile(dest, content);
            return `Copied: ${src} -> ${dest}`;
        }

        purgeTrash(days = 7) {
            const threshold = Date.now() - (days * 24 * 60 * 60 * 1000);
            const targets = Object.keys(this.files).filter(k => k.startsWith('.trash/'));
            let count = 0;
            
            targets.forEach(k => {
                const file = this.files[k];
                const deletedAt = file.meta?.deleted_at || file.meta?.updated_at || 0;
                if (deletedAt < threshold) {
                    delete this.files[k];
                    count++;
                }
            });
            
            if (count > 0) {
                this._emit('change', { type: 'purge_trash', usage: this.getUsage() });
                console.log(`[VFS] Purged ${count} old files from .trash/`);
            }
            return count;
        }

        listFiles(options = {}) {
            const root = options.path ? this._norm(options.path) : "";
            const recursive = options.recursive === true;
            
            // 1. 指定パスがファイルとして存在する場合、そのパスをフルパスで返す
            if (this.isFile(root)) {
                return options.detail ? [this.stat(root)] : [root];
            }

            const allPaths = Object.keys(this.files).sort();
            let result = [];
            
            // 2. ディレクトリとしての検索用プレフィックスを作成
            const prefix = root === "" ? "" : root + "/";

            if (recursive) {
                // 再帰的: 指定階層以下のすべてのファイルをフルパスで返す
                result = allPaths.filter(p => p.startsWith(prefix));
            } else {
                // 非再帰的: 指定ディレクトリ直下の要素（ファイル名/フォルダパス）をフルパスで返す
                const items = new Set();
                for (const path of allPaths) {
                    if (!path.startsWith(prefix)) continue;
                    
                    const relative = path.substring(prefix.length);
                    if (!relative) continue; 

                    const parts = relative.split('/');
                    if (parts.length === 1) {
                        // 直下のファイル
                        items.add(path);
                    } else {
                        // 直下のフォルダ（プレフィックス + 第一階層名）
                        items.add(prefix + parts[0]);
                    }
                }
                result = Array.from(items).sort();
            }

            if (options.detail) {
                return result.map(p => this.stat(p));
            }
            return result;
        }
        
        getTree() {
            const root = { name: "root", path: "", type: "folder", children: {} };
            
            Object.keys(this.files).sort().forEach(filePath => {
                const parts = filePath.split('/');
                let current = root;
                parts.forEach((part, index) => {
                    const isLast = index === parts.length - 1;
                    const fullPath = parts.slice(0, index + 1).join('/');
                    
                    if (!current.children[part]) {
                        let meta = null;
                        if (isLast && this.files[fullPath]) {
                             meta = {
                                 size: this.files[fullPath].content.length,
                                 updated_at: this.files[fullPath].meta.updated_at
                             };
                        }
                        current.children[part] = {
                            name: part,
                            path: fullPath,
                            type: isLast ? "file" : "folder",
                            children: {},
                            meta: meta
                        };
                    }
                    current = current.children[part];
                    if (!isLast && current.type === "file") current.type = "folder";
                });
            });

            const toArray = (node) => {
                const children = Object.values(node.children).map(c => toArray(c));
                children.sort((a, b) => {
                    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
                return { ...node, children };
            };
            
            return toArray(root).children;
        }

        replaceContent(path, patternStr, replacement) {
            const p = this._norm(path);
            if (!this.isFile(p)) throw new Error(`File not found: ${p}`);

            const content = this.files[p].content;
            let regex;
            try {
                regex = new RegExp(patternStr, 'm');
            } catch (e) {
                throw new Error(`Invalid RegExp: ${e.message}`);
            }

            if (!regex.test(content)) {
                throw new Error(`Pattern not found in ${p}.`);
            }

            const newContent = content.replace(regex, replacement);
            if (newContent === content) throw new Error("Replacement resulted in no change.");

            this.writeFile(p, newContent);
            return `Replaced content in ${p}`;
        }

        editLines(path, start, end, mode, newContent = "") {
            const p = this._norm(path);
            if (!this.isFile(p)) throw new Error(`File not found: ${p}`);

            const content = this.files[p].content;
            let lines = content.split(/\r?\n/);
            
            let insertLines = [];
            if (newContent) {
                let clean = newContent;
                if (clean.startsWith('\n')) clean = clean.substring(1);
                if (clean.endsWith('\n')) clean = clean.substring(0, clean.length - 1);
                insertLines = clean.split(/\r?\n/);
            }

            const sLine = parseInt(start);
            const sIdx = Math.max(0, sLine - 1);
            const eLine = parseInt(end);
            
            let log = "";

            if (mode === 'replace') {
                if (isNaN(eLine)) throw new Error("End line required for replace.");
                const count = Math.max(0, eLine - sLine + 1);
                while(lines.length < sIdx) lines.push("");
                lines.splice(sIdx, count, ...insertLines);
                log = `Replaced lines ${sLine}-${eLine}`;
            } else if (mode === 'insert') {
                while(lines.length < sIdx) lines.push("");
                lines.splice(sIdx, 0, ...insertLines);
                log = `Inserted at line ${sLine}`;
            } else if (mode === 'delete') {
                if (isNaN(eLine)) throw new Error("End line required for delete.");
                const count = Math.max(0, eLine - sLine + 1);
                lines.splice(sIdx, count);
                log = `Deleted lines ${sLine}-${eLine}`;
            } else if (mode === 'append') {
                lines.push(...insertLines);
                log = `Appended to end of file`;
            } else {
                throw new Error(`Unknown mode: ${mode}`);
            }

            this.writeFile(p, lines.join('\n'));
            return log;
        }
    }

    global.Itera.State.VirtualFileSystem = VirtualFileSystem;

})(window);