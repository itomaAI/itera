// src/ui/components/settings_modal.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.UI = global.Itera.UI || {};
    global.Itera.UI.Components = global.Itera.UI.Components || {};

    const DOM_IDS = {
        // Modal
        MODAL: 'history-modal', // MetaOSのIDを流用（実質設定モーダルとして使う）
        BTN_CLOSE: 'btn-close-modal',
        
        // Triggers (in Sidebar/Header)
        BTN_API_SAVE: 'btn-save-key',
        INPUT_API_KEY: 'api-key',
        BTN_RESET: 'btn-reset',
        BTN_HISTORY: 'btn-history', // Opens this modal
        
        // Snapshot UI inside Modal
        LIST_SNAPSHOTS: 'snapshot-list',
        BTN_CREATE_SNAP: 'btn-create-snapshot',
        BTN_DELETE_ALL: 'btn-delete-all-snapshots'
    };

    class SettingsModal {
        /**
         * @param {StorageManager} storage 
         * @param {ConfigManager} configManager
         */
        constructor(storage, configManager) {
            this.storage = storage;
            this.configManager = configManager;
            this.els = {};
            this.events = {};

            this._initElements();
            this._bindEvents();
            this._loadApiKey();
        }

        on(event, callback) {
            this.events[event] = callback;
        }

        _initElements() {
            Object.entries(DOM_IDS).forEach(([key, id]) => {
                this.els[key] = document.getElementById(id);
            });
        }

        _bindEvents() {
            // API Key Save (Header)
            if (this.els.BTN_API_SAVE && this.els.INPUT_API_KEY) {
                this.els.BTN_API_SAVE.onclick = () => {
                    const key = this.els.INPUT_API_KEY.value.trim();
                    if (key) {
                        localStorage.setItem('itera_api_key', key);
                        alert("API Key Saved.");
                        // 通知が必要ならEvent発火
                        if (this.events['api_key_updated']) this.events['api_key_updated'](key);
                    }
                };
            }

            // Factory Reset (Sidebar)
            if (this.els.BTN_RESET) {
                this.els.BTN_RESET.onclick = async () => {
                    if (confirm("WARNING: This will delete ALL files and settings. The system will be reset to factory defaults.\n\nAre you sure?")) {
                        if (this.events['factory_reset']) this.events['factory_reset']();
                    }
                };
            }

            // Open Modal (Time Machine / Settings)
            if (this.els.BTN_HISTORY) {
                this.els.BTN_HISTORY.onclick = () => this.open();
            }

            // Close Modal
            if (this.els.BTN_CLOSE) {
                this.els.BTN_CLOSE.onclick = () => this.close();
            }

            // Create Snapshot
            if (this.els.BTN_CREATE_SNAP) {
                this.els.BTN_CREATE_SNAP.onclick = async () => {
                    const label = prompt("Snapshot Name:", "Manual Backup");
                    if (label) {
                        if (this.events['create_snapshot']) {
                            await this.events['create_snapshot'](label);
                            this._refreshSnapshotList();
                        }
                    }
                };
            }

            // Delete All Snapshots
            if (this.els.BTN_DELETE_ALL) {
                this.els.BTN_DELETE_ALL.onclick = async () => {
                    if (confirm("Delete ALL snapshots? This cannot be undone.")) {
                        await this.storage.deleteAllSnapshots();
                        this._refreshSnapshotList();
                    }
                };
            }
        }

        _loadApiKey() {
            const key = localStorage.getItem('itera_api_key');
            if (key && this.els.INPUT_API_KEY) {
                this.els.INPUT_API_KEY.value = key;
            }
        }

        open() {
            if (this.els.MODAL) {
                this.els.MODAL.classList.remove('hidden');
                this._refreshSnapshotList();
            }
        }

        close() {
            if (this.els.MODAL) {
                this.els.MODAL.classList.add('hidden');
            }
        }

        async _refreshSnapshotList() {
            if (!this.els.LIST_SNAPSHOTS) return;
            
            this.els.LIST_SNAPSHOTS.innerHTML = '<div class="text-center text-gray-500 text-xs py-4">Loading...</div>';
            
            try {
                const list = await this.storage.listSnapshots();
                this.els.LIST_SNAPSHOTS.innerHTML = '';

                if (list.length === 0) {
                    this.els.LIST_SNAPSHOTS.innerHTML = '<div class="text-center text-gray-500 text-xs py-4">No snapshots available.</div>';
                    return;
                }

                list.forEach(snap => {
                    const date = new Date(snap.timestamp).toLocaleString();
                    const div = document.createElement('div');
                    div.className = 'flex justify-between items-center bg-gray-700 p-2 rounded text-xs border border-gray-600 mb-1';
                    
                    div.innerHTML = `
                        <div class="overflow-hidden mr-2">
                            <div class="font-bold text-gray-200 truncate" title="${snap.label}">${snap.label}</div>
                            <div class="text-gray-400 text-[10px]">${date}</div>
                        </div>
                        <div class="flex gap-2 shrink-0">
                             <button class="btn-restore text-blue-400 hover:text-blue-300 underline font-medium" data-id="${snap.id}">Restore</button>
                             <button class="btn-delete text-gray-500 hover:text-red-400" data-id="${snap.id}">✕</button>
                        </div>
                    `;
                    
                    // Bind buttons
                    div.querySelector('.btn-restore').onclick = () => this._handleRestore(snap.id);
                    div.querySelector('.btn-delete').onclick = () => this._handleDelete(snap.id);
                    
                    this.els.LIST_SNAPSHOTS.appendChild(div);
                });

            } catch (e) {
                this.els.LIST_SNAPSHOTS.innerHTML = `<div class="text-red-500 text-xs">Error: ${e.message}</div>`;
            }
        }

        async _handleRestore(id) {
            if (confirm("Restore this snapshot? Current state will be lost.")) {
                if (this.events['restore_snapshot']) {
                    await this.events['restore_snapshot'](id);
                    this.close();
                }
            }
        }

        async _handleDelete(id) {
            if (confirm("Delete this snapshot?")) {
                await this.storage.deleteSnapshot(id);
                this._refreshSnapshotList();
            }
        }
    }

    global.Itera.UI.Components.SettingsModal = SettingsModal;

})(window);