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
            if (!path) return "";
            return path.replace(/^\/+/, '').replace(/\.\./g, '');
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

        exists(path) {
            return Object.prototype.hasOwnProperty.call(this.files, this._norm(path));
        }

        isDirectory(path) {
            let p = this._norm(path);
            if (!p) return true; // root is directory
            if (!p.endsWith('/')) p += '/';
            // Check if any file starts with this prefix
            return Object.keys(this.files).some(key => key.startsWith(p));
        }

        // ★ Fix 1: Modified stat method to handle folders
        stat(path) {
            const p = this._norm(path);

            // 1. File exists
            if (this.exists(p)) {
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
                    created_at: 0, // Directories don't store meta in this VFS model
                    updated_at: 0,
                    type: 'folder'
                };
            }

            throw new Error(`Path not found: ${path}`);
        }

        readFile(path) {
            const p = this._norm(path);
            if (!this.exists(p)) throw new Error(`File not found: ${p}`);
            return this.files[p].content;
        }

        writeFile(path, content) {
            const p = this._norm(path);
            if (!p) throw new Error("Cannot write to root path.");

            const now = Date.now();
            const newSize = content.length;
            const exists = this.exists(p);
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
            if (this.exists(p)) {
                delete this.files[p];
                this._emit('change', { type: 'delete', path: p, usage: this.getUsage() });
                return `Deleted file: ${p}`;
            }
            return this.deleteDirectory(p);
        }

        createDirectory(path) {
            let p = this._norm(path);
            if (p.endsWith('/')) p = p.slice(0, -1);
            if (!p) return;
            
            const keepFile = `${p}/.keep`;
            if (!this.exists(keepFile)) {
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

            targets.forEach(k => delete this.files[k]);
            this._emit('change', { type: 'delete_dir', path: p, usage: this.getUsage() });
            return `Deleted directory ${p} (${targets.length} files).`;
        }

        rename(oldPath, newPath) {
            const oldP = this._norm(oldPath);
            const newP = this._norm(newPath);

            if (this.exists(oldP)) {
                if (this.exists(newP)) throw new Error(`Destination ${newP} already exists.`);
                this.files[newP] = this.files[oldP];
                delete this.files[oldP];
                this._emit('change', { type: 'rename', from: oldP, to: newP, usage: this.getUsage() });
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
                this._emit('change', { type: 'rename_dir', from: oldP, to: newP, usage: this.getUsage() });
                return `Moved directory: ${oldP} -> ${newP}`;
            }

            throw new Error(`Source ${oldP} not found.`);
        }

        copyFile(srcPath, destPath) {
            const src = this._norm(srcPath);
            const dest = this._norm(destPath);
            if (!this.exists(src)) throw new Error(`Source ${src} not found.`);
            if (this.exists(dest)) throw new Error(`Destination ${dest} already exists.`);

            const content = this.files[src].content;
            this.writeFile(dest, content);
            return `Copied: ${src} -> ${dest}`;
        }

        listFiles(options = {}) {
            const root = options.path ? this._norm(options.path) : "";
            const allPaths = Object.keys(this.files).sort();
            
            let result = allPaths;
            if (root) {
                const prefix = root.endsWith('/') ? root : root + '/';
                result = result.filter(p => p.startsWith(prefix));
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
            if (!this.exists(p)) throw new Error(`File not found: ${p}`);

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
            if (!this.exists(p)) throw new Error(`File not found: ${p}`);

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