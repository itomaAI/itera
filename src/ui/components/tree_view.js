// src/ui/components/tree_view.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.UI = global.Itera.UI || {};
    global.Itera.UI.Components = global.Itera.UI.Components || {};

    class TreeView {
        constructor(containerEl, contextMenuEl) {
            this.container = containerEl;
            this.contextMenu = contextMenuEl;
            this.events = {};
            this.expandedPaths = new Set();
            this.selectedPath = null;
            this._initGlobalEvents();
            this._initRootDropZone();
        }

        on(event, callback) {
            this.events[event] = callback;
        }

        /**
         * ツリーデータを描画する
         * @param {Array} treeData - VFS.getTree() の戻り値 (children配列)
         */
        render(treeData) {
            if (!this.container) return;

            // スタイルリセット (bg-gray-700等 -> bg-hover, border-blue-500 -> border-primary, bg-gray-800 -> bg-card)
            this.container.classList.remove('bg-hover', 'border-2', 'border-dashed', 'border-primary', 'bg-card', 'ring-2', 'ring-primary', 'ring-inset');
            this.container.innerHTML = '';

            // rootUl: text-gray-300 -> text-text-main
            const rootUl = document.createElement('ul');
            rootUl.className = 'tree-root text-sm font-mono text-text-main min-h-full pb-4';
            
            this._buildTree(rootUl, treeData, 0);
            this.container.appendChild(rootUl);
        }

        _buildTree(parentElement, nodes, indentLevel) {
            nodes.forEach(node => {
                const li = document.createElement('li');
                li.className = 'tree-node select-none';

                const div = document.createElement('div');
                // hover:bg-gray-700 -> hover:bg-hover
                // bg-gray-700 border-blue-500 -> bg-hover border-primary
                div.className = `tree-content group hover:bg-hover cursor-pointer flex items-center py-0.5 px-2 border-l-2 border-transparent transition ${this.selectedPath === node.path ? 'bg-hover border-primary' : ''}`;
                div.style.paddingLeft = `${indentLevel * 12 + 8}px`;
                div.dataset.path = node.path;
                div.dataset.type = node.type;

                if (node.meta) {
                    const sizeKB = (node.meta.size / 1024).toFixed(1) + ' KB';
                    const updated = new Date(node.meta.updated_at).toLocaleString();
                    div.title = `Size: ${sizeKB}\nUpdated: ${updated}`;
                } else {
                    div.title = node.path;
                }

                div.draggable = true;
                div.addEventListener('dragstart', (e) => this._handleDragStart(e, node));

                if (node.type === 'folder') {
                    div.addEventListener('dragover', (e) => this._handleDragOver(e, div));
                    div.addEventListener('dragleave', (e) => this._handleDragLeave(e, div));
                    div.addEventListener('drop', (e) => this._handleDrop(e, node, div));
                }

                const icon = node.type === 'folder' ?
                    (this.expandedPaths.has(node.path) ? '📂' : '📁') :
                    this._getFileIcon(node.name);

                // text-gray-500 -> text-text-muted
                // hover:text-white -> hover:text-text-main
                // hover:bg-gray-600 -> hover:bg-hover
                div.innerHTML = `
                    <span class="mr-2 opacity-80 text-xs pointer-events-none flex-shrink-0">${icon}</span>
                    <span class="truncate pointer-events-none flex-1">${node.name}</span>
                    <button class="menu-btn w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-main hover:bg-hover rounded ml-1 transition flex-shrink-0 md:hidden opacity-0 group-hover:opacity-100">
                        ⋮
                    </button>
                `;

                div.onclick = (e) => this._handleClick(e, node);
                div.oncontextmenu = (e) => this._handleContextMenu(e, node);

                const menuBtn = div.querySelector('.menu-btn');
                if (menuBtn) {
                    menuBtn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const rect = menuBtn.getBoundingClientRect();
                        this.selectedPath = node.path;
                        this._showContextMenu(rect.left, rect.bottom, node);
                    };
                }

                li.appendChild(div);

                if (node.type === 'folder' && node.children) {
                    const childUl = document.createElement('ul');
                    childUl.className = `tree-children ${this.expandedPaths.has(node.path) ? 'block' : 'hidden'}`;
                    this._buildTree(childUl, node.children, indentLevel + 1);
                    li.appendChild(childUl);
                }
                parentElement.appendChild(li);
            });
        }

        _getFileIcon(filename) {
            if (filename.endsWith('.js')) return '📜';
            if (filename.endsWith('.html')) return '🌐';
            if (filename.endsWith('.css')) return '🎨';
            if (filename.endsWith('.json')) return '🔧';
            if (filename.match(/\.(png|jpg|jpeg|svg|gif|webp|ico)$/i)) return '🖼️';
            if (filename.endsWith('.pdf')) return '📕';
            if (filename.endsWith('.zip')) return '📦';
            if (filename.endsWith('.md')) return '📝';
            return '📄';
        }

        _handleClick(e, node) {
            e.stopPropagation();
            this.selectedPath = node.path;
            
            const allNodes = this.container.querySelectorAll('.tree-content');
            allNodes.forEach(el => {
                // bg-gray-700 border-blue-500 -> bg-hover border-primary
                el.classList.remove('bg-hover', 'border-primary');
                if (el.dataset.path === node.path) el.classList.add('bg-hover', 'border-primary');
            });

            if (node.type === 'folder') {
                if (this.expandedPaths.has(node.path)) this.expandedPaths.delete(node.path);
                else this.expandedPaths.add(node.path);

                const li = e.currentTarget.parentElement;
                const ul = li.querySelector('ul');
                if (ul) {
                    ul.classList.toggle('hidden');
                    const iconSpan = e.currentTarget.querySelector('span:first-child');
                    iconSpan.textContent = this.expandedPaths.has(node.path) ? '📂' : '📁';
                }
            } else {
                if (this.events['open']) this.events['open'](node.path);
            }
        }

        _handleDragStart(e, node) {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/itera-file', JSON.stringify({
                path: node.path,
                type: node.type
            }));
            e.target.style.opacity = '0.5';
        }

        _handleDragOver(e, element) {
            if (e.dataTransfer.types.includes('application/itera-file')) {
                e.preventDefault(); 
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                // bg-blue-900 text-white -> bg-primary text-text-inverted
                element.classList.add('bg-primary', 'text-text-inverted');
            }
        }

        _handleDragLeave(e, element) {
            if (e.dataTransfer.types.includes('application/itera-file')) {
                e.preventDefault();
                e.stopPropagation();
                // bg-blue-900 text-white -> bg-primary text-text-inverted
                element.classList.remove('bg-primary', 'text-text-inverted');
            }
        }

        _handleDrop(e, targetNode, element) {
            // bg-blue-900 text-white -> bg-primary text-text-inverted
            element.classList.remove('bg-primary', 'text-text-inverted');

            if (e.dataTransfer.types.includes('application/itera-file')) {
                e.preventDefault();
                e.stopPropagation();

                const rawData = e.dataTransfer.getData('application/itera-file');
                if (!rawData) return;

                const data = JSON.parse(rawData);
                this._emitMove(data.path, targetNode.path);
            }
        }

        _initRootDropZone() {
            if (!this.container) return;

            this.container.addEventListener('dragover', (e) => {
                if (e.dataTransfer.types.includes('application/itera-file')) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    // bg-gray-800 ring-2 ring-blue-500 -> bg-card ring-2 ring-primary
                    this.container.classList.add('bg-card', 'ring-2', 'ring-primary', 'ring-inset');
                }
            });

            this.container.addEventListener('dragleave', (e) => {
                if (e.dataTransfer.types.includes('application/itera-file')) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!this.container.contains(e.relatedTarget)) {
                        this.container.classList.remove('bg-card', 'ring-2', 'ring-primary', 'ring-inset');
                    }
                }
            });

            this.container.addEventListener('drop', (e) => {
                if (e.dataTransfer.types.includes('application/itera-file')) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.container.classList.remove('bg-card', 'ring-2', 'ring-primary', 'ring-inset');

                    const rawData = e.dataTransfer.getData('application/itera-file');
                    if (rawData) {
                        const data = JSON.parse(rawData);
                        this._emitMove(data.path, "");
                    }
                }
            });

            document.addEventListener('dragend', (e) => {
                if (e.target && e.target.classList && e.target.classList.contains('tree-content')) {
                    e.target.style.opacity = '1';
                }
                this.container.classList.remove('bg-card', 'ring-2', 'ring-primary', 'ring-inset');
            });
        }

        _emitMove(srcPath, destFolder) {
            const fileName = srcPath.split('/').pop();
            const newPath = destFolder ? `${destFolder}/${fileName}` : fileName;

            if (srcPath === newPath) return;
            
            if (destFolder.startsWith(srcPath + '/')) {
                alert("Cannot move a folder into its own subfolder.");
                return;
            }

            if (this.events['move']) {
                this.events['move'](srcPath, newPath);
            }
        }

        _handleContextMenu(e, node) {
            e.preventDefault();
            e.stopPropagation();
            this.selectedPath = node.path;
            this._showContextMenu(e.pageX, e.pageY, node);
        }

        _showContextMenu(x, y, node) {
            if (!this.contextMenu) return;

            this.contextMenu.innerHTML = '';
            const actions = [];

            if (node.type === 'folder') {
                actions.push({ label: 'New File', action: () => this._promptCreate(node.path, 'file') });
                actions.push({ label: 'New Folder', action: () => this._promptCreate(node.path, 'folder') });
                actions.push({ label: 'Upload Here', action: () => {
                    if (this.events['upload_request']) this.events['upload_request'](node.path);
                }});
                actions.push({ separator: true });
            }

            actions.push({ label: 'Duplicate', action: () => {
                if (this.events['duplicate']) this.events['duplicate'](node.path);
            }});
            actions.push({ label: 'Rename (Move)', action: () => this._promptRename(node) });
            actions.push({ label: 'Download', action: () => {
                if (this.events['download']) this.events['download'](node.path);
            }});
            actions.push({ label: 'Delete', action: () => this._confirmDelete(node), danger: true });

            actions.forEach(item => {
                if (item.separator) {
                    const hr = document.createElement('hr');
                    // border-gray-600 -> border-border-main
                    hr.className = "border-border-main my-1";
                    this.contextMenu.appendChild(hr);
                    return;
                }
                const btn = document.createElement('div');
                // hover:bg-blue-600 -> hover:bg-primary
                // text-red-400 hover:text-white -> text-error hover:text-text-main
                // text-gray-200 -> text-text-main
                btn.className = `px-3 py-1 hover:bg-primary hover:text-white cursor-pointer text-xs ${item.danger ? 'text-error hover:text-text-main' : 'text-text-main'}`;
                btn.textContent = item.label;
                btn.onclick = () => {
                    this.contextMenu.classList.add('hidden');
                    item.action();
                };
                this.contextMenu.appendChild(btn);
            });

            this.contextMenu.classList.remove('hidden');
            const rect = this.contextMenu.getBoundingClientRect();
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            let posX = x;
            let posY = y;

            if (posX + rect.width > winWidth) posX = winWidth - rect.width - 5;
            if (posY + rect.height > winHeight) posY = winHeight - rect.height - 5;
            if (posX < 0) posX = 5;

            this.contextMenu.style.left = `${posX}px`;
            this.contextMenu.style.top = `${posY}px`;
        }

        _initGlobalEvents() {
            document.addEventListener('click', (e) => {
                if (this.contextMenu && !this.contextMenu.contains(e.target)) {
                    this.contextMenu.classList.add('hidden');
                }
            });
            
            if (this.container) {
                this.container.addEventListener('contextmenu', (e) => {
                    if (e.target === this.container || e.target.classList.contains('tree-root')) {
                        e.preventDefault();
                        this._showContextMenu(e.pageX, e.pageY, { type: 'folder', path: '', name: 'root' });
                    }
                });
            }
        }

        _promptCreate(parentPath, type) {
            const name = prompt(`Enter new ${type} name:`);
            if (!name) return;
            
            let fullPath = parentPath ? `${parentPath}/${name}` : name;
            fullPath = fullPath.replace(/^\/+/, '');

            if (type === 'folder' && this.events['create_folder']) {
                this.events['create_folder'](fullPath);
                if (parentPath) this.expandedPaths.add(parentPath);
            }
            if (type === 'file' && this.events['create_file']) {
                this.events['create_file'](fullPath);
                if (parentPath) this.expandedPaths.add(parentPath);
            }
        }

        _promptRename(node) {
            const newPath = prompt(`Edit path to rename/move:`, node.path);
            if (!newPath || newPath === node.path) return;
            if (this.events['rename']) this.events['rename'](node.path, newPath);
        }

        _confirmDelete(node) {
            if (confirm(`Are you sure you want to delete "${node.name}"?`)) {
                if (this.events['delete']) this.events['delete'](node.path);
            }
        }
    }

    global.Itera.UI.Components.TreeView = TreeView;

})(window);