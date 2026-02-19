// src/ui/components/settings_modal.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.UI = global.Itera.UI || {};
    global.Itera.UI.Components = global.Itera.UI.Components || {};

    const DOM_IDS = {
        MODAL: 'history-modal',
        BTN_CLOSE: 'btn-close-modal',
        BTN_API_SAVE: 'btn-save-key',
        INPUT_API_KEY: 'api-key',
        BTN_RESET: 'btn-reset',
        BTN_HISTORY: 'btn-history',
        LIST_SNAPSHOTS: 'snapshot-list',
        BTN_CREATE_SNAP: 'btn-create-snapshot',
        BTN_DELETE_ALL: 'btn-delete-all-snapshots'
    };

    class SettingsModal {
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
            if (this.els.BTN_API_SAVE && this.els.INPUT_API_KEY) {
                this.els.BTN_API_SAVE.onclick = () => {
                    const key = this.els.INPUT_API_KEY.value.trim();
                    if (key) {
                        localStorage.setItem('itera_api_key', key);
                        alert("API Key Saved.");
                        if (this.events['api_key_updated']) this.events['api_key_updated'](key);
                    }
                };
            }

            if (this.els.BTN_RESET) {
                this.els.BTN_RESET.onclick = async () => {
                    if (confirm("WARNING: This will delete ALL files and settings. The system will be reset to factory defaults.\n\nAre you sure?")) {
                        if (this.events['factory_reset']) this.events['factory_reset']();
                    }
                };
            }

            if (this.els.BTN_HISTORY) {
                this.els.BTN_HISTORY.onclick = () => this.open();
            }

            if (this.els.BTN_CLOSE) {
                this.els.BTN_CLOSE.onclick = () => this.close();
            }

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
            
            // text-gray-500 -> text-text-muted
            this.els.LIST_SNAPSHOTS.innerHTML = '<div class="text-center text-text-muted text-xs py-4">Loading...</div>';
            
            try {
                const list = await this.storage.listSnapshots();
                this.els.LIST_SNAPSHOTS.innerHTML = '';

                if (list.length === 0) {
                    this.els.LIST_SNAPSHOTS.innerHTML = '<div class="text-center text-text-muted text-xs py-4">No snapshots available.</div>';
                    return;
                }

                list.forEach(snap => {
                    const date = new Date(snap.timestamp).toLocaleString();
                    const div = document.createElement('div');
                    // bg-gray-700 -> bg-card, border-gray-600 -> border-border-main
                    div.className = 'flex justify-between items-center bg-card p-2 rounded text-xs border border-border-main mb-1';
                    
                    // text-gray-200 -> text-text-main
                    // text-gray-400 -> text-text-muted
                    // text-blue-400 -> text-primary, hover:text-blue-300 -> hover:text-primary/80
                    // text-gray-500 -> text-text-muted, hover:text-red-400 -> hover:text-error
                    div.innerHTML = `
                        <div class="overflow-hidden mr-2">
                            <div class="font-bold text-text-main truncate" title="${snap.label}">${snap.label}</div>
                            <div class="text-text-muted text-[10px]">${date}</div>
                        </div>
                        <div class="flex gap-2 shrink-0">
                             <button class="btn-restore text-primary hover:text-primary/80 underline font-medium" data-id="${snap.id}">Restore</button>
                             <button class="btn-delete text-text-muted hover:text-error" data-id="${snap.id}">✕</button>
                        </div>
                    `;
                    
                    div.querySelector('.btn-restore').onclick = () => this._handleRestore(snap.id);
                    div.querySelector('.btn-delete').onclick = () => this._handleDelete(snap.id);
                    
                    this.els.LIST_SNAPSHOTS.appendChild(div);
                });

            } catch (e) {
                this.els.LIST_SNAPSHOTS.innerHTML = `<div class="text-error text-xs">Error: ${e.message}</div>`;
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