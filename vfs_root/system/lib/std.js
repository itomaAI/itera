/**
 * Itera Guest Standard Library (std.js)
 * Core Data Access Layer & OS Utilities.
 */

(function(global) {
    
    // --- Internal Utilities ---
    const Utils = {
        getMonthKey: () => new Date().toISOString().slice(0, 7), // YYYY-MM
        getDateStr: () => new Date().toISOString().slice(0, 10), // YYYY-MM-DD
        
        async safeReadJson(path, defaultValue = []) {
            try {
                if (!global.MetaOS) return defaultValue;
                const content = await global.MetaOS.readFile(path);
                return JSON.parse(content);
            } catch (e) {
                // File not found or parse error -> return default
                return defaultValue;
            }
        },

        async safeWriteJson(path, data) {
            if (!global.MetaOS) {
                console.warn("[Std] MetaOS not found, cannot save:", path);
                return;
            }
            // Use silent: true to prevent flooding the AI's chat log with raw file saves
            await global.MetaOS.saveFile(path, JSON.stringify(data, null, 2), { silent: true });
        }
    };

    // --- App API ---
    global.App = {
        
        // ==========================================
        // 1. Core System & OS Utilities (NEW)
        // ==========================================

        /**
         * Log an event to the AI's epistemic history.
         * @param {string} message - The message to log.
         * @param {string} type - Event type (e.g., 'task_completed').
         */
        logEvent(message, type = 'app_event') {
            if (global.MetaOS && global.MetaOS.addEventLog) {
                global.MetaOS.addEventLog(message, type);
            }
        },

        /**
         * System Configuration Access
         */
        Config: {
            async get() {
                return await Utils.safeReadJson('system/config/config.json', {});
            },
            async update(updates) {
                const config = await this.get();
                const newConfig = { ...config, ...updates };
                await Utils.safeWriteJson('system/config/config.json', newConfig);
                return newConfig;
            }
        },

        /**
         * Universal Key-Value Storage for 3rd Party Apps
         * Saves data in 'data/apps/{key}.json'
         */
        Storage: {
            _getPath(key) {
                const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
                return `data/apps/${safeKey}.json`;
            },
            async get(key, defaultValue = {}) {
                return await Utils.safeReadJson(this._getPath(key), defaultValue);
            },
            async set(key, value) {
                await Utils.safeWriteJson(this._getPath(key), value);
            }
        },


        // ==========================================
        // 2. Tasks API (Refactored for Multi-file)
        // ==========================================

        async getTasks() {
            if (!global.MetaOS) return [];
            try {
                // Read all JSON files in data/tasks/
                const files = await global.MetaOS.listFiles('data/tasks');
                const taskFiles = files.filter(f => (typeof f === 'string' ? f : f.path).endsWith('.json'))
                                       .map(f => typeof f === 'string' ? f : f.path);
                
                const allTasks = [];
                for (const path of taskFiles) {
                    const tasks = await Utils.safeReadJson(path, []);
                    if (Array.isArray(tasks)) allTasks.push(...tasks);
                }
                return allTasks;
            } catch (e) {
                console.warn("[Std] Failed to list tasks:", e);
                return [];
            }
        },

        async addTask(title, dueDate = '', priority = 'medium') {
            if (!title.trim()) return;
            const monthKey = Utils.getMonthKey();
            const path = `data/tasks/${monthKey}.json`; // Always append to current month
            
            const tasks = await Utils.safeReadJson(path, []);
            const newTask = {
                id: Date.now().toString(),
                title: title.trim(),
                status: 'pending',
                dueDate: dueDate,
                priority: priority,
                created_at: new Date().toISOString()
            };
            
            tasks.push(newTask);
            await Utils.safeWriteJson(path, tasks);
            
            this.logEvent(`User added a new task: "${newTask.title}" (Due: ${dueDate || 'None'})`, 'task_added');
            return newTask;
        },

        // Helper: Find which file contains the task and update it
        async _updateTaskInFile(id, updaterFn) {
            if (!global.MetaOS) return false;
            const files = await global.MetaOS.listFiles('data/tasks');
            const taskFiles = files.filter(f => (typeof f === 'string' ? f : f.path).endsWith('.json'))
                                       .map(f => typeof f === 'string' ? f : f.path);
            
            for (const path of taskFiles) {
                let tasks = await Utils.safeReadJson(path, []);
                const index = tasks.findIndex(t => t.id === id);
                if (index !== -1) {
                    tasks = updaterFn(tasks, index);
                    await Utils.safeWriteJson(path, tasks);
                    return true; // Stop searching once found and updated
                }
            }
            return false;
        },

        async updateTask(id, updates) {
            let updatedTitle = "";
            const success = await this._updateTaskInFile(id, (tasks, index) => {
                tasks[index] = { ...tasks[index], ...updates };
                updatedTitle = tasks[index].title;
                return tasks;
            });
            if (success && updates.title) {
                this.logEvent(`User updated task: "${updatedTitle}"`, 'task_updated');
            }
            return success;
        },

        async toggleTask(id) {
            return await this._updateTaskInFile(id, (tasks, index) => {
                tasks[index].status = tasks[index].status === 'completed' ? 'pending' : 'completed';
                return tasks;
            });
        },

        async deleteTask(id) {
            let deletedTitle = "";
            const success = await this._updateTaskInFile(id, (tasks, index) => {
                deletedTitle = tasks[index].title;
                tasks.splice(index, 1);
                return tasks;
            });
            if (success) {
                this.logEvent(`User deleted task: "${deletedTitle}"`, 'task_deleted');
            }
            return success;
        },


        // ==========================================
        // 3. Events API (Calendar)
        // ==========================================

        async getEvents(monthKey) {
            const path = `data/events/${monthKey}.json`;
            let events = await Utils.safeReadJson(path, []);
            events.sort((a, b) => {
                if (a.date < b.date) return -1;
                if (a.date > b.date) return 1;
                return 0;
            });
            return events;
        },

        async addEvent(title, date, time = '', note = '') {
            if (!title.trim() || !date) return;
            const monthKey = date.slice(0, 7);
            const path = `data/events/${monthKey}.json`;
            
            let events = await Utils.safeReadJson(path, []);
            const newEvent = {
                id: Date.now().toString(),
                title: title.trim(),
                date: date,
                time: time,
                note: note
            };
            events.push(newEvent);
            await Utils.safeWriteJson(path, events);
            
            this.logEvent(`User added a calendar event: "${title}" on ${date} ${time}`, 'event_added');
            return newEvent;
        },

        async updateEvent(id, updates) {
            const { originalDate, date, title, time, note } = updates;
            await this.deleteEvent(id, originalDate || date);
            return await this.addEvent(title, date, time, note);
        },

        async deleteEvent(id, dateStr) {
            if (!dateStr) return false;
            const monthKey = dateStr.slice(0, 7);
            const path = `data/events/${monthKey}.json`;
            
            let events = await Utils.safeReadJson(path, []);
            const initialLen = events.length;
            const eventToDelete = events.find(e => e.id === id);
            events = events.filter(e => e.id !== id);
            
            if (events.length !== initialLen) {
                await Utils.safeWriteJson(path, events);
                if (eventToDelete) {
                    this.logEvent(`User deleted calendar event: "${eventToDelete.title}" on ${eventToDelete.date}`, 'event_deleted');
                }
                return true;
            }
            return false;
        },

        async getCalendarItems(monthKey) {
            const events = await this.getEvents(monthKey);
            const formattedEvents = events.map(e => ({ ...e, type: 'event' }));

            // Fetch ALL tasks (due to refactoring) and filter by this month
            const allTasks = await this.getTasks();
            const formattedTasks = allTasks
                .filter(t => t.dueDate && t.dueDate.startsWith(monthKey) && t.status !== 'completed')
                .map(t => ({
                    id: t.id,
                    title: t.title,
                    date: t.dueDate,
                    time: '',
                    type: 'task',
                    priority: t.priority
                }));

            return [...formattedEvents, ...formattedTasks];
        },


        // ==========================================
        // 4. Notes & System API
        // ==========================================

        async getRecentNotes(limit = 5) {
            if (!global.MetaOS) return [];
            try {
                const files = await global.MetaOS.listFiles('data/notes', { recursive: true, detail: true });
                if (Array.isArray(files) && files.length > 0 && typeof files[0] === 'object') {
                    return files.filter(f => f.path.endsWith('.md'))
                                .sort((a, b) => b.updated_at - a.updated_at)
                                .slice(0, limit)
                                .map(f => f.path);
                } else {
                    const strFiles = Array.isArray(files) ? files : [];
                    return strFiles.filter(f => f.endsWith('.md')).slice(0, limit);
                }
            } catch (e) {
                console.warn("[Std] Failed to list notes:", e);
                return [];
            }
        },

        async getApps() {
            return await Utils.safeReadJson('system/config/apps.json', []);
        }
    };

})(window);