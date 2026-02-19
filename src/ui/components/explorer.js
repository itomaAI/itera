// src/ui/components/explorer.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.UI = global.Itera.UI || {};
    global.Itera.UI.Components = global.Itera.UI.Components || {};

    const DOM_IDS = {
        CONTAINER: 'file-explorer',
        CONTEXT_MENU: 'context-menu',
        SIDEBAR: 'sidebar',
        RESIZER: 'explorer-resizer',
        RESIZE_OVERLAY: 'resize-overlay',
        PREVIEW_FRAME: 'preview-frame',
        
        // Upload Inputs
        INPUT_FOLDER: 'folder-upload',
        INPUT_FILES: 'files-upload',
        INPUT_CONTEXT: 'context-upload-input',
        
        // Backup / Restore
        BTN_IMPORT: 'btn-import-backup',
        INPUT_IMPORT: 'import-backup-input',
        BTN_DOWNLOAD: 'btn-download'
    };

    class Explorer {
        constructor(vfs) {
            this.vfs = vfs;
            this.events = {};
            this.els = {};
            this.currentContextUploadPath = "";

            this._initElements();
            
            this.treeView = new global.Itera.UI.Components.TreeView(
                this.els.CONTAINER, 
                this.els.CONTEXT_MENU
            );

            this._bindVFS();
            this._bindTreeEvents();
            this._bindUploads();
            this._bindSidebarDnD();
            this._initResizer();
        }

        on(event, callback) {
            this.events[event] = callback;
        }

        _initElements() {
            Object.entries(DOM_IDS).forEach(([key, id]) => {
                this.els[key] = document.getElementById(id);
            });
        }

        _bindVFS() {
            this.vfs.on('change', () => {
                this.treeView.render(this.vfs.getTree());
            });
            this.treeView.render(this.vfs.getTree());
        }

        // --- TreeView Interactions ---

        _bindTreeEvents() {
            this.treeView.on('open', (path) => {
                try {
                    const content = this.vfs.readFile(path);
                    if (this.events['open_file']) this.events['open_file'](path, content);
                } catch (e) {
                    console.error("Read failed:", e);
                }
            });

            this.treeView.on('create_file', (path) => {
                try {
                    this.vfs.writeFile(path, "");
                    this._emitHistory('file_created', `User created empty file: ${path}`);
                    if (this.events['open_file']) this.events['open_file'](path, "");
                } catch (e) { alert(e.message); }
            });

            this.treeView.on('create_folder', (path) => {
                try {
                    this.vfs.createDirectory(path);
                    this._emitHistory('folder_created', `User created folder: ${path}`);
                } catch (e) { alert(e.message); }
            });

            this.treeView.on('duplicate', (path) => {
                try {
                    const dotIndex = path.lastIndexOf('.');
                    let base = dotIndex !== -1 ? path.substring(0, dotIndex) : path;
                    let ext = dotIndex !== -1 ? path.substring(dotIndex) : "";
                    let newPath = `${base}_copy${ext}`;
                    let counter = 1;
                    while (this.vfs.exists(newPath)) {
                        newPath = `${base}_copy${counter}${ext}`;
                        counter++;
                    }
                    this.vfs.copyFile(path, newPath);
                    this._emitHistory('file_created', `User duplicated file: ${path} -> ${newPath}`);
                } catch (e) { alert(e.message); }
            });

            this.treeView.on('rename', (oldPath, newPath) => {
                try {
                    this.vfs.rename(oldPath, newPath);
                    this._emitHistory('file_moved', `User renamed: ${oldPath} -> ${newPath}`);
                } catch (e) { alert(e.message); }
            });

            this.treeView.on('move', (srcPath, destPath) => {
                try {
                    this.vfs.rename(srcPath, destPath);
                    this._emitHistory('file_moved', `User moved file: ${srcPath} -> ${destPath}`);
                } catch (e) { alert(e.message); }
            });

            this.treeView.on('delete', (path) => {
                try {
                    this.vfs.deleteFile(path);
                    this._emitHistory('file_deleted', `User deleted: ${path}`);
                } catch (e) { alert(e.message); }
            });

            this.treeView.on('download', (path) => {
                try {
                    this._downloadFile(path);
                } catch (e) { alert(e.message); }
            });

            this.treeView.on('upload_request', (path) => {
                this.currentContextUploadPath = path;
                if (this.els.INPUT_CONTEXT) {
                    this.els.INPUT_CONTEXT.value = "";
                    this.els.INPUT_CONTEXT.click();
                }
            });
        }

        // --- Upload & Backup Handling ---

        _bindUploads() {
            if (this.els.INPUT_FOLDER) {
                this.els.INPUT_FOLDER.onchange = (e) => this._handleUploadAppend(e, true, "");
            }
            if (this.els.INPUT_FILES) {
                this.els.INPUT_FILES.onchange = (e) => this._handleUploadAppend(e, false, "");
            }
            if (this.els.INPUT_CONTEXT) {
                this.els.INPUT_CONTEXT.onchange = (e) => {
                    this._handleUploadAppend(e, false, this.currentContextUploadPath);
                    this.currentContextUploadPath = "";
                };
            }

            if (this.els.BTN_IMPORT && this.els.INPUT_IMPORT) {
                this.els.BTN_IMPORT.onclick = () => {
                    this.els.INPUT_IMPORT.value = "";
                    this.els.INPUT_IMPORT.click();
                };
                this.els.INPUT_IMPORT.onchange = async (e) => this._handleZipRestore(e);
            }

            if (this.els.BTN_DOWNLOAD) {
                this.els.BTN_DOWNLOAD.onclick = () => this._handleZipDownload();
            }
        }

        async _handleUploadAppend(e, isFolder, targetDir = "") {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            const uploadedPaths = [];
            for (const file of files) {
                let relPath = targetDir 
                    ? `${targetDir}/${file.name}` 
                    : (isFolder && file.webkitRelativePath ? file.webkitRelativePath : file.name);
                
                relPath = relPath.replace(/^\/+/, '');

                try {
                    let content = await this._readFileContent(file);
                    this.vfs.writeFile(relPath, content);
                    uploadedPaths.push(relPath);
                } catch (err) {
                    console.error(err);
                }
            }

            if (uploadedPaths.length > 0) {
                const summary = uploadedPaths.slice(0, 3).join(', ') + (uploadedPaths.length > 3 ? '...' : '');
                this._emitHistory('file_created', `User uploaded ${uploadedPaths.length} files to "${targetDir || 'root'}": ${summary}`);
            }
            e.target.value = "";
        }

        async _handleZipRestore(e) {
            const file = e.target.files[0];
            if (!file) return;

            if (typeof JSZip === 'undefined') {
                alert("System Error: JSZip library not loaded.");
                return;
            }

            if (!confirm(`CAUTION: This will ERASE all current files and restore from "${file.name}".\n\nContinue?`)) {
                e.target.value = "";
                return;
            }

            try {
                const zip = await JSZip.loadAsync(file);
                const restoredFiles = {};
                let count = 0;
                const promises = [];
                zip.forEach((relativePath, zipEntry) => {
                    if (zipEntry.dir) return;
                    if (relativePath.startsWith('__MACOSX') || relativePath.includes('.DS_Store')) return;

                    promises.push((async () => {
                        const isBinary = this._isBinaryFilename(relativePath);
                        let content;
                        if (isBinary) {
                            const base64 = await zipEntry.async("base64");
                            const mime = this._guessMimeType(relativePath);
                            content = `data:${mime};base64,${base64}`;
                        } else {
                            content = await zipEntry.async("string");
                        }
                        const cleanPath = relativePath.replace(/^\/+/, '');
                        restoredFiles[cleanPath] = content;
                        count++;
                    })());
                });

                await Promise.all(promises);
                this.vfs.loadFiles(restoredFiles);
                this._emitHistory('project_imported', `Restored backup: ${file.name} (${count} files).`);
                alert(`Restore Complete: ${count} files loaded.`);

            } catch (err) {
                console.error(err);
                alert(`Restore Failed: ${err.message}`);
            }
            e.target.value = "";
        }

        async _handleZipDownload() {
            if (typeof JSZip === 'undefined') {
                alert("System Error: JSZip library not loaded.");
                return;
            }

            const zip = new JSZip();
            const files = this.vfs.files;

            Object.keys(files).forEach(path => {
                if (path.startsWith('.sample/') || path.includes('/.git/')) return;
                const fileData = files[path];
                const content = fileData.content;

                if (content.startsWith('data:')) {
                    const parts = content.split(',');
                    if (parts.length > 1) {
                        zip.file(path, parts[1], { base64: true });
                    }
                } else {
                    zip.file(path, content);
                }
            });

            try {
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                a.download = `itera_backup_${timestamp}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 100);
                this._emitHistory('project_exported', `User downloaded system backup.`);
            } catch (e) {
                console.error("Export failed:", e);
                alert("Export Failed: " + e.message);
            }
        }

        _bindSidebarDnD() {
            const sidebar = this.els.SIDEBAR;
            if (!sidebar) return;

            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                sidebar.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });

            sidebar.addEventListener('dragover', (e) => {
                if (!e.dataTransfer.types.includes('application/itera-file')) {
                    e.dataTransfer.dropEffect = 'copy';
                    // bg-gray-700 -> bg-hover
                    sidebar.classList.add('bg-hover');
                }
            });

            sidebar.addEventListener('dragleave', () => {
                // bg-gray-700 -> bg-hover
                sidebar.classList.remove('bg-hover');
            });

            sidebar.addEventListener('drop', async (e) => {
                // bg-gray-700 -> bg-hover
                sidebar.classList.remove('bg-hover');
                
                if (e.dataTransfer.types.includes('application/itera-file')) return;

                const items = e.dataTransfer.items;
                if (!items) return;

                const promises = [];
                for (let i = 0; i < items.length; i++) {
                    const item = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
                    if (item) {
                        promises.push(this._traverseFileTree(item, ""));
                    }
                }
                
                const fileEntries = (await Promise.all(promises)).flat();
                if (fileEntries.length > 0) {
                    await this._batchWriteFiles(fileEntries);
                }
            });
        }

        _traverseFileTree(item, path) {
            return new Promise((resolve) => {
                path = path || "";
                if (item.isFile) {
                    item.file((file) => {
                        file.fullPath = path + file.name;
                        resolve([file]);
                    });
                } else if (item.isDirectory) {
                    const dirReader = item.createReader();
                    const entries = [];
                    const readEntries = () => {
                        dirReader.readEntries(async (results) => {
                            if (!results.length) {
                                const childPromises = entries.map(entry => 
                                    this._traverseFileTree(entry, path + item.name + "/")
                                );
                                resolve((await Promise.all(childPromises)).flat());
                            } else {
                                entries.push(...results);
                                readEntries();
                            }
                        });
                    };
                    readEntries();
                }
            });
        }

        async _batchWriteFiles(files) {
            const uploadedPaths = [];
            for (const file of files) {
                let relPath = (file.fullPath || file.name).replace(/^\/+/, '');
                if (relPath.startsWith('.git/') || relPath.includes('/.git/') || relPath.endsWith('.DS_Store')) continue;

                try {
                    let content = await this._readFileContent(file);
                    this.vfs.writeFile(relPath, content);
                    uploadedPaths.push(relPath);
                } catch (err) {
                    console.error(`Import failed: ${relPath}`, err);
                }
            }
            if (uploadedPaths.length > 0) {
                const summary = uploadedPaths.slice(0, 3).join(', ') + (uploadedPaths.length > 3 ? '...' : '');
                this._emitHistory('file_created', `User dropped files: ${summary}`);
            }
        }

        _initResizer() {
            const resizer = this.els.RESIZER;
            const sidebar = this.els.SIDEBAR;
            const overlay = this.els.RESIZE_OVERLAY;
            const iframe = this.els.PREVIEW_FRAME;

            if (!resizer || !sidebar) return;

            let isResizing = false;

            const start = (e) => {
                isResizing = true;
                document.body.style.cursor = 'col-resize';
                resizer.classList.add('resizing');
                if (overlay) overlay.classList.remove('hidden');
                if (iframe) iframe.style.pointerEvents = 'none';
                e.preventDefault();
            };

            const stop = () => {
                if (!isResizing) return;
                isResizing = false;
                document.body.style.cursor = '';
                resizer.classList.remove('resizing');
                if (overlay) overlay.classList.add('hidden');
                if (iframe) iframe.style.pointerEvents = '';
            };

            const move = (e) => {
                if (!isResizing) return;
                const newWidth = e.clientX;
                if (newWidth > 150 && newWidth < 600) {
                    sidebar.style.width = `${newWidth}px`;
                }
                e.preventDefault();
            };

            resizer.addEventListener('mousedown', start);
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', stop);
            window.addEventListener('blur', stop);
        }

        _readFileContent(file) {
            return new Promise((resolve, reject) => {
                const isBinary = this._isBinaryFilename(file.name) || file.type.startsWith('image/') || file.type === 'application/pdf';
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                if (isBinary) reader.readAsDataURL(file);
                else reader.readAsText(file);
            });
        }

        _downloadFile(path) {
            const content = this.vfs.readFile(path);
            let blob;
            if (content.startsWith('data:')) {
                const parts = content.split(',');
                const mime = parts[0].split(':')[1].split(';')[0];
                const byteString = atob(parts[1]);
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                blob = new Blob([ab], { type: mime });
            } else {
                blob = new Blob([content], { type: 'text/plain' });
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = path.split('/').pop();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        _isBinaryFilename(name) {
            return !!name.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|bmp|pdf|woff|woff2|ttf|eot|otf|zip|tar|gz|7z|rar|mp3|wav|mp4|webm|ogg)$/i);
        }

        _guessMimeType(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const map = {
                'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
                'pdf': 'application/pdf', 'zip': 'application/zip',
                'mp3': 'audio/mpeg', 'mp4': 'video/mp4'
            };
            return map[ext] || 'application/octet-stream';
        }

        _emitHistory(type, desc) {
            if (this.events['history_event']) this.events['history_event'](type, desc);
        }
    }

    global.Itera.UI.Components.Explorer = Explorer;

})(window);