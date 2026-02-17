// src/core/state/store.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.State = global.Itera.State || {};

    class StorageManager {
        constructor(dbName = 'itera_core_db') {
            this.dbName = dbName;
            this.db = null;
            this.STORE_SNAPSHOTS = 'snapshots';
            this.STORE_SYSTEM = 'system_state';
            this.SYSTEM_KEY = 'current';
            
            this._readyPromise = this._initDB();
        }

        _initDB() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this.dbName, 1);
                
                req.onerror = (e) => {
                    console.error("IndexedDB Error:", e);
                    reject(e.target.error);
                };

                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    // Snapshots store (Time Machine)
                    if (!db.objectStoreNames.contains(this.STORE_SNAPSHOTS)) {
                        const store = db.createObjectStore(this.STORE_SNAPSHOTS, { keyPath: 'id' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                    // Current System State (Persist across reloads)
                    if (!db.objectStoreNames.contains(this.STORE_SYSTEM)) {
                        db.createObjectStore(this.STORE_SYSTEM);
                    }
                };

                req.onsuccess = (e) => {
                    this.db = e.target.result;
                    resolve(this.db);
                };
            });
        }

        async ready() {
            await this._readyPromise;
            if (!this.db) throw new Error("Database not initialized");
        }

        async _tx(storeName, mode, callback) {
            await this.ready();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], mode);
                const store = tx.objectStore(storeName);
                const req = callback(store);
                
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            });
        }

        // --- System State Persistence ---

        async saveSystemState(files, history, memory = {}) {
            const payload = {
                files,
                history,
                memory,
                timestamp: Date.now()
            };
            return this._tx(this.STORE_SYSTEM, 'readwrite', (store) => {
                return store.put(payload, this.SYSTEM_KEY);
            });
        }

        async loadSystemState() {
            return this._tx(this.STORE_SYSTEM, 'readonly', (store) => {
                return store.get(this.SYSTEM_KEY);
            });
        }

        // --- Time Machine (Snapshots) ---

        async createSnapshot(label, files, history, memory = {}) {
            const id = `snap_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const snapshot = {
                id,
                label,
                timestamp: Date.now(),
                files: JSON.parse(JSON.stringify(files)), // Deep copy to be safe
                history: JSON.parse(JSON.stringify(history)),
                memory: JSON.parse(JSON.stringify(memory))
            };
            
            await this._tx(this.STORE_SNAPSHOTS, 'readwrite', (store) => {
                return store.put(snapshot);
            });
            return id;
        }

        async listSnapshots() {
            await this.ready();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([this.STORE_SNAPSHOTS], 'readonly');
                const store = tx.objectStore(this.STORE_SNAPSHOTS);
                const index = store.index('timestamp');
                const req = index.openCursor(null, 'prev'); // Newest first
                const list = [];
                
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        const { id, label, timestamp } = cursor.value;
                        list.push({ id, label, timestamp });
                        cursor.continue();
                    } else {
                        resolve(list);
                    }
                };
                req.onerror = (e) => reject(e.target.error);
            });
        }

        async getSnapshot(id) {
            return this._tx(this.STORE_SNAPSHOTS, 'readonly', (store) => {
                return store.get(id);
            });
        }

        async deleteSnapshot(id) {
            return this._tx(this.STORE_SNAPSHOTS, 'readwrite', (store) => {
                return store.delete(id);
            });
        }

        async deleteAllSnapshots() {
             return this._tx(this.STORE_SNAPSHOTS, 'readwrite', (store) => {
                return store.clear();
            });
        }

        async pruneSnapshots(maxAgeDays = 14) {
            // Simple logic: delete snapshots older than maxAgeDays
            // except if they are marked "important" (future feature)
            const list = await this.listSnapshots();
            const now = Date.now();
            const limit = maxAgeDays * 24 * 60 * 60 * 1000;
            
            const toDelete = list.filter(s => (now - s.timestamp) > limit);
            
            if (toDelete.length > 0) {
                const tx = this.db.transaction([this.STORE_SNAPSHOTS], 'readwrite');
                const store = tx.objectStore(this.STORE_SNAPSHOTS);
                toDelete.forEach(s => store.delete(s.id));
                return new Promise((resolve) => {
                    tx.oncomplete = () => resolve(toDelete.length);
                });
            }
            return 0;
        }
    }

    global.Itera.State.StorageManager = StorageManager;

})(window);