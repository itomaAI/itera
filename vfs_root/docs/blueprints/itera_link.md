# Itera Blueprint: Itera Link v3.0

> **What is this?**
> This is the definitive protocol blueprint for P2P communication between Itera OS agents via the Nostr network.
> **v3.0 Major Update**: Unifies Inbox and Outbox into a **Symmetric Directory Structure**.
> This reduces AI cognitive load by treating sent and received messages as identical data structures.

---

## 🤖 Instructions for the Itera Agent
You are reading the Itera Link v3.0 Blueprint.
Please execute the installation by strictly following these phases:

1. **Explain & Ask**: Explain to the user: "I will install Itera Link v3.0. This version unifies the data structure for sending and receiving messages, making my operations more stable and accurate." Seek permission via `<ask>`.
2. **Deploy Manual**: Create the internal manual describing the new Directory-Based Messaging protocol.
3. **Deploy Daemon**: Create the background service that handles the new directory scanning logic and smart polling.
4. **Deploy UI**: Create the settings application (updated to support the new structure).
5. **System Registration**: Update system registries (`apps.json`, `services.json`).
6. **Post-Install**: Report completion and guide the user to the Itera Link app.

---

## Phase 2: Deploy AI Protocol Manual
Agent, create this manual. This is the **most important file** for you to understand how to use the new symmetric protocol.

### File: `docs/apps/itera_link_manual.md`
```markdown
# Itera Link Protocol v3.0 (Agent Manual)

Itera Link v3.0 uses a **Symmetric Directory Structure**. Both outgoing and incoming messages share the exact same format.

## 📤 How to SEND a Message
Do not create a single JSON file. Instead, **create a directory**.

1.  **Create a Directory**: Make a unique folder in `data/itera_link/outbox/` (e.g., `data/itera_link/outbox/req_8823/`).
2.  **Write Metadata**: Create `meta.json` inside that folder.
    ```json
    {
      "to": "npub1...",
      "auto_trigger": true
    }
    ```
    *   `auto_trigger: true` will wake up the recipient AI immediately.
3.  **Write Content**: Create `message.md` inside that folder with your instructions.
4.  **Add Attachments (Optional)**: simply `<copy_file>` any files you want to send directly into this folder.

**Example Action:**
```xml
<create_file path="data/itera_link/outbox/task_A/meta.json">{"to":"npub...","auto_trigger":true}</create_file>
<create_file path="data/itera_link/outbox/task_A/message.md">Check this image.</create_file>
<copy_file path="data/images/chart.png" new_path="data/itera_link/outbox/task_A/chart.png"/>
```
*The Daemon will detect the directory, pack all files inside, and send them.*

## 📥 How to RECEIVE a Message
Incoming messages appear in `data/itera_link/inbox/<message_id>/` with the **exact same structure**.
*   **Action**: When notified of a new message, read `meta.json` (sender info) and `message.md` (content).
*   **Cleanup**: After processing, use `<delete_file>` on the **directory** (e.g., `data/itera_link/inbox/event_123/`) to remove the message and all its files.
```

---

## Phase 3: Deploy Background Daemon
Create the daemon. It now scans for *directories* in the outbox instead of just JSON files.

### File: `services/itera_link_daemon.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <script src="https://unpkg.com/nostr-tools@1.17.0/lib/nostr.bundle.js"></script>
</head>
<body>
    <script>
        const { relayInit, getPublicKey, nip19, nip04, getEventHash, getSignature } = window.NostrTools;

        const DIRS = {
            outbox: 'data/itera_link/outbox',
            inbox: 'data/itera_link/inbox',
            config: 'data/itera_link/config.json',
            history: 'data/itera_link/history.json',
            processed: 'data/itera_link/processed.json',
            lastSync: 'data/itera_link/last_sync.json'
        };

        let config = null;
        let processedIds = new Set();
        let isSyncing = false;
        let needsResync = false;
        let pollTimer = null;

        async function init() {
            if (!window.MetaOS) return setTimeout(init, 500);

            // Ensure directories
            for (const dir of [DIRS.outbox, DIRS.inbox]) {
                try { await MetaOS.listFiles(dir); } catch(e) { await MetaOS.saveFile(`${dir}/.keep`, "", {silent:true}); }
            }

            // Status Broadcast
            setInterval(() => {
                MetaOS.broadcast('itera_link_status', { state: isSyncing ? 'Syncing...' : 'Idle', time: Date.now() });
            }, 5000);

            // Instant Trigger: Watch for changes in outbox
            MetaOS.on('file_changed', (payload) => {
                // If something changes inside the outbox directory...
                if (payload && payload.path && payload.path.startsWith(DIRS.outbox)) {
                    if (isSyncing) {
                        needsResync = true;
                    } else {
                        clearTimeout(pollTimer);
                        setTimeout(poll, 500); // Debounce and fire
                    }
                }
            });

            poll();
        }

        async function poll() {
            if (isSyncing) return;
            isSyncing = true;
            needsResync = false;

            try {
                const confStr = await MetaOS.readFile(DIRS.config);
                config = JSON.parse(confStr);
            } catch (e) {
                isSyncing = false;
                pollTimer = setTimeout(poll, 15000);
                return;
            }

            if (!config || !config.privateKey) {
                isSyncing = false;
                pollTimer = setTimeout(poll, 15000);
                return;
            }

            try {
                processedIds = new Set(JSON.parse(await MetaOS.readFile(DIRS.processed)));
            } catch (e) { processedIds = new Set(); }

            await performSync();
            
            isSyncing = false;

            // Handle race conditions (files added during sync)
            if (needsResync) {
                pollTimer = setTimeout(poll, 500);
            } else {
                const interval = (config.pollIntervalMinutes || 10) * 60 * 1000;
                pollTimer = setTimeout(poll, Math.max(interval, 30000)); 
            }
        }

        async function performSync() {
            const relayUrl = config.relays?.[0] || 'wss://relay.damus.io';
            const relay = relayInit(relayUrl);
            
            try {
                await relay.connect();
                const privHex = nip19.decode(config.privateKey).data;
                const pubHex = getPublicKey(privHex);

                await syncOutbox(relay, privHex, pubHex);
                await syncInbox(relay, privHex, pubHex);

            } catch (e) {
                console.warn("[IteraLink] Sync failed:", e);
            } finally {
                relay.close();
            }
        }

        // --- New Logic: Directory-Based Outbox ---
        async function syncOutbox(relay, privHex, pubHex) {
            // Get all items in outbox
            const items = await MetaOS.listFiles(DIRS.outbox);
            
            // In Itera VFS, we need to identify subdirectories.
            // Simple heuristic: Get unique top-level folders inside outbox/
            const messageDirs = new Set();
            (Array.isArray(items) ? items : []).forEach(path => {
                if (path === `${DIRS.outbox}/.keep`) return;
                const relative = path.replace(DIRS.outbox + '/', '');
                const parts = relative.split('/');
                if (parts.length > 0) {
                    messageDirs.add(`${DIRS.outbox}/${parts[0]}`);
                }
            });

            for (const dirPath of messageDirs) {
                try {
                    // 1. Check for meta.json (The lock file effectively)
                    const metaPath = `${dirPath}/meta.json`;
                    let metaStr;
                    try {
                        metaStr = await MetaOS.readFile(metaPath);
                    } catch(e) { continue; } // Not ready or not a message dir

                    const meta = JSON.parse(metaStr);
                    const targetPubHex = nip19.decode(meta.to).data;

                    // 2. Build Payload
                    const payload = {
                        content: "",
                        auto_trigger: !!meta.auto_trigger,
                        files: []
                    };

                    // 3. Scan directory for content
                    const dirFiles = await MetaOS.listFiles(dirPath);
                    for (const filePath of dirFiles) {
                        const fileName = filePath.split('/').pop();
                        if (fileName === 'meta.json') continue;
                        
                        const fileData = await MetaOS.readFile(filePath);
                        
                        if (fileName === 'message.md') {
                            payload.content = fileData;
                        } else {
                            // Any other file is an attachment
                            payload.files.push({ name: fileName, data: fileData });
                        }
                    }

                    // 4. Encrypt & Send
                    const payloadStr = JSON.stringify(payload);
                    const encrypted = await nip04.encrypt(privHex, targetPubHex, payloadStr);
                    
                    let event = {
                        kind: 4, pubkey: pubHex, created_at: Math.floor(Date.now() / 1000),
                        tags: [['p', targetPubHex]], content: encrypted
                    };
                    event.id = getEventHash(event);
                    event.sig = getSignature(event, privHex);

                    await new Promise(resolve => { 
                        let pub = relay.publish(event);
                        if(pub.on) pub.on('ok', resolve); else if(pub.then) pub.then(resolve).catch(resolve);
                        else setTimeout(resolve, 2000);
                    });

                    // 5. Cleanup: Delete the entire directory
                    await MetaOS.deleteFile(dirPath, {silent:true}); // deleteFile handles directories too
                    await appendHistory('sent', meta.to, payload.content, meta.auto_trigger);

                } catch (e) {
                    console.error(`Failed to send ${dirPath}:`, e);
                    // Rename folder to .error to prevent loop
                    await MetaOS.renameFile(dirPath, `${dirPath}_error`, {silent:true});
                }
            }
        }

        async function syncInbox(relay, privHex, pubHex) {
            // Delta Sync Logic
            let since = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
            try {
                const lastSyncData = JSON.parse(await MetaOS.readFile(DIRS.lastSync));
                if (lastSyncData.timestamp) since = Math.max(since, lastSyncData.timestamp - 60);
            } catch(e) {}

            let highestTimestamp = since;

            const events = await new Promise(resolve => {
                const evs = [];
                const sub = relay.sub([{ kinds: [4], '#p': [pubHex], since }]);
                sub.on('event', e => evs.push(e));
                sub.on('eose', () => resolve(evs));
                setTimeout(() => resolve(evs), 10000);
            });

            for (const event of events) {
                if (event.created_at > highestTimestamp) highestTimestamp = event.created_at;
                if (processedIds.has(event.id)) continue;

                try {
                    const decrypted = await nip04.decrypt(privHex, event.pubkey, event.content);
                    const senderNpub = nip19.npubEncode(event.pubkey);
                    
                    let payload;
                    try { payload = JSON.parse(decrypted); } catch(e) { payload = { content: decrypted }; }

                    // Create Directory for Inbox Message
                    const msgDir = `${DIRS.inbox}/${event.id}`;
                    await MetaOS.saveFile(`${msgDir}/.keep`, "", {silent:true});
                    
                    // Unpack Metadata
                    await MetaOS.saveFile(`${msgDir}/meta.json`, JSON.stringify({ 
                        id: event.id, sender: senderNpub, timestamp: event.created_at 
                    }, null, 2), {silent:true});
                    
                    // Unpack Content
                    if (payload.content) await MetaOS.saveFile(`${msgDir}/message.md`, payload.content, {silent:true});
                    
                    // Unpack Attachments
                    if (payload.files) {
                        for (const file of payload.files) {
                            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                            await MetaOS.saveFile(`${msgDir}/${safeName}`, file.data, {silent:true});
                        }
                    }

                    processedIds.add(event.id);
                    await appendHistory('received', senderNpub, payload.content, payload.auto_trigger);

                    // Trigger Agent
                    if (payload.auto_trigger) {
                        try {
                            await MetaOS.agent(`[Itera Link] Remote Request Received.\nFrom: ${senderNpub}\nPath: ${msgDir}/\nCheck meta.json and message.md inside the directory.`, { silent: false });
                        } catch (err) {
                            MetaOS.addEventLog(`⚠️ [Itera Link] Auto-trigger failed (Agent Busy). Check ${msgDir}/ manually.`, 'error');
                        }
                    } else {
                        MetaOS.addEventLog(`[Itera Link] Message received from ${senderNpub.substring(0,12)}...`, 'itera_link_received');
                    }

                } catch (e) {
                    processedIds.add(event.id);
                }
            }

            if (events.length > 0) {
                await MetaOS.saveFile(DIRS.processed, JSON.stringify([...processedIds]), {silent:true});
            }
            await MetaOS.saveFile(DIRS.lastSync, JSON.stringify({ timestamp: highestTimestamp }), {silent:true});
        }

        async function appendHistory(type, target, content, isAuto) {
            let history = [];
            try { history = JSON.parse(await MetaOS.readFile(DIRS.history)); } catch(e) {}
            history.unshift({
                type, target, timestamp: Date.now(),
                snippet: (content || "").substring(0, 60).replace(/\n/g, ' '),
                auto_trigger: !!isAuto
            });
            if (history.length > 20) history = history.slice(0, 20);
            await MetaOS.saveFile(DIRS.history, JSON.stringify(history, null, 2), {silent:true});
            MetaOS.broadcast('itera_link_history_updated', {});
        }

        init();
    </script>
</body>
</html>
```

---

## Phase 4: Deploy UI App
The UI remains mostly similar but sends messages by creating directories now.

### File: `apps/itera_link.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Itera Link</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="../system/lib/ui.js"></script>
    <script src="https://unpkg.com/nostr-tools@1.17.0/lib/nostr.bundle.js"></script>
</head>
<body class="bg-app text-text-main h-screen flex flex-col p-6 overflow-hidden">

    <header class="flex items-center justify-between mb-6 shrink-0">
        <div class="flex items-center gap-4">
            <button onclick="AppUI.home()" class="p-2 -ml-2 rounded-full hover:bg-hover text-text-muted hover:text-text-main transition">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </button>
            <h1 class="text-xl font-bold tracking-tight">🔗 Itera Link v3.0</h1>
        </div>
        <div class="flex items-center gap-3">
            <span id="save-status" class="text-[10px] text-success font-bold uppercase tracking-widest opacity-0 transition-opacity duration-300">Saved</span>
            <span id="daemon-status" class="px-2 py-1 rounded text-[10px] font-mono border bg-card text-text-muted border-border-main shadow-sm">Idle</span>
        </div>
    </header>

    <main class="flex-1 overflow-y-auto space-y-6 pb-10 max-w-3xl mx-auto w-full">
        <!-- Settings -->
        <section class="bg-panel border border-border-main p-6 rounded-2xl shadow-sm">
            <h2 class="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Settings</h2>
            <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="md:col-span-2">
                        <label class="block text-xs font-bold mb-1">Private Key (nsec)</label>
                        <input type="password" id="input-privkey" class="w-full bg-card border border-border-main rounded p-2 text-sm focus:border-primary focus:outline-none transition shadow-inner">
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1">Polling Interval</label>
                        <select id="input-interval" class="w-full bg-card border border-border-main rounded p-2 text-sm focus:border-primary focus:outline-none transition cursor-pointer">
                            <option value="5">Every 5 min</option>
                            <option value="10">Every 10 min</option>
                            <option value="30">Every 30 min</option>
                            <option value="60">Every 1 hour</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold mb-1 text-primary">Your npub Address</label>
                    <input type="text" id="input-pubkey" class="w-full bg-primary/5 border border-primary/30 rounded p-2 text-sm text-primary font-mono select-all focus:outline-none" readonly>
                </div>
                <div class="flex items-center gap-2 pt-2">
                    <button onclick="generateKey()" class="bg-card hover:bg-hover border border-border-main px-4 py-2 rounded text-sm transition font-medium">Generate New Key</button>
                    <button onclick="saveConfig()" class="bg-primary hover:bg-primary/90 text-white px-5 py-2 rounded text-sm font-bold shadow transition ml-auto flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        Save & Sync
                    </button>
                </div>
            </div>
        </section>

        <!-- Debug Send (Useful for users to test) -->
        <section class="bg-panel border border-border-main p-6 rounded-2xl shadow-sm">
            <h2 class="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Send Message (Debug)</h2>
            <div class="flex gap-2">
                <input type="text" id="debug-to" placeholder="To npub..." class="flex-1 bg-card border border-border-main rounded p-2 text-sm">
                <input type="text" id="debug-msg" placeholder="Message..." class="flex-[2] bg-card border border-border-main rounded p-2 text-sm">
                <button onclick="sendDebug()" class="bg-card hover:bg-hover border border-border-main px-4 py-2 rounded text-sm transition">Send</button>
            </div>
        </section>

        <!-- Activity Log -->
        <section class="bg-panel border border-border-main p-6 rounded-2xl shadow-sm">
            <h2 class="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Recent Activity</h2>
            <div id="history-list" class="space-y-2">
                <div class="text-xs text-text-muted text-center py-4">No recent activity.</div>
            </div>
        </section>
    </main>

    <script>
        const { generatePrivateKey, getPublicKey, nip19 } = window.NostrTools;
        const CONFIG_PATH = 'data/itera_link/config.json';
        const HISTORY_PATH = 'data/itera_link/history.json';

        async function init() {
            if (!window.MetaOS) return setTimeout(init, 100);
            try {
                const conf = JSON.parse(await MetaOS.readFile(CONFIG_PATH));
                if (conf.privateKey) {
                    document.getElementById('input-privkey').value = conf.privateKey;
                    updatePubkeyDisplay(conf.privateKey);
                }
                if (conf.pollIntervalMinutes) document.getElementById('input-interval').value = conf.pollIntervalMinutes;
            } catch(e) {}
            
            document.getElementById('input-privkey').addEventListener('input', (e) => updatePubkeyDisplay(e.target.value));
            MetaOS.on('itera_link_status', (data) => {
                const el = document.getElementById('daemon-status');
                el.textContent = data.state;
                el.className = `px-2 py-1 rounded text-[10px] font-mono border shadow-sm transition-colors ${data.state === 'Syncing...' ? 'bg-warning/20 text-warning border-warning/30 animate-pulse' : 'bg-success/10 text-success border-success/30'}`;
            });
            MetaOS.on('itera_link_history_updated', loadHistory);
            loadHistory();
        }

        function updatePubkeyDisplay(nsec) {
            try {
                const hex = nip19.decode(nsec).data;
                document.getElementById('input-pubkey').value = nip19.npubEncode(getPublicKey(hex));
            } catch(e) { document.getElementById('input-pubkey').value = "Invalid key"; }
        }

        function generateKey() {
            if(confirm("Generate new random identity?")) {
                const nsec = nip19.nsecEncode(generatePrivateKey());
                document.getElementById('input-privkey').value = nsec;
                updatePubkeyDisplay(nsec);
            }
        }

        async function saveConfig() {
            const priv = document.getElementById('input-privkey').value.trim();
            if(!priv) return AppUI.alert("Private key required.");
            const config = {
                privateKey: priv,
                pollIntervalMinutes: parseInt(document.getElementById('input-interval').value),
                relays: ["wss://relay.damus.io"]
            };
            await MetaOS.saveFile(CONFIG_PATH, JSON.stringify(config, null, 2));
            await MetaOS.kill('itera_link_daemon');
            await MetaOS.spawn('services/itera_link_daemon.html', { pid: 'itera_link_daemon', mode: 'background' });
            
            const statusEl = document.getElementById('save-status');
            statusEl.classList.remove('opacity-0');
            setTimeout(() => statusEl.classList.add('opacity-0'), 2000);
        }

        async function sendDebug() {
            const to = document.getElementById('debug-to').value.trim();
            const msg = document.getElementById('debug-msg').value.trim();
            if(!to || !msg) return;

            // v3.0 Logic: Create Folder
            const id = 'msg_' + Date.now();
            const dir = `data/itera_link/outbox/${id}`;
            
            await MetaOS.saveFile(`${dir}/meta.json`, JSON.stringify({ to: to, auto_trigger: false }));
            await MetaOS.saveFile(`${dir}/message.md`, msg);
            
            AppUI.notify("Message queued via directory.", "success");
            document.getElementById('debug-msg').value = "";
        }

        async function loadHistory() {
            const list = document.getElementById('history-list');
            try {
                const data = JSON.parse(await MetaOS.readFile(HISTORY_PATH));
                if (!data || data.length === 0) throw new Error();
                
                list.innerHTML = data.map(log => {
                    const isRecv = log.type === 'received';
                    const icon = isRecv ? '📥' : '📤';
                    const color = isRecv ? 'text-success' : 'text-primary';
                    const time = new Date(log.timestamp).toLocaleTimeString();
                    const trigger = log.auto_trigger ? '<span class="ml-2 bg-error text-white px-1.5 py-0.5 rounded text-[8px] font-bold">AUTO</span>' : '';
                    
                    return `
                    <div class="flex items-start gap-3 p-3 bg-card rounded-lg border border-border-main transition hover:border-primary/50">
                        <div class="text-lg pt-0.5 ${color}">${icon}</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between mb-1">
                                <span class="text-[9px] font-mono text-text-muted truncate max-w-[150px]">${log.target}</span>
                                <span class="text-[9px] text-text-muted">${time}</span>
                            </div>
                            <div class="text-xs text-text-main truncate opacity-90">${log.snippet || '(No content)'} ${trigger}</div>
                        </div>
                    </div>`;
                }).join('');
            } catch(e) {
                list.innerHTML = '<div class="text-[10px] text-text-muted text-center py-4">No recent activity.</div>';
            }
        }

        init();
    </script>
</body>
</html>
```

---

## Phase 5: System Registration

**1. `system/config/apps.json`**
```json
    {
        "id": "itera_link",
        "name": "Itera Link",
        "icon": "🔗",
        "path": "apps/itera_link.html",
        "description": "Agent-to-Agent Sync"
    }
```

**2. `system/config/services.json`**
```json
    {
        "pid": "itera_link_daemon",
        "path": "services/itera_link_daemon.html"
    }
```

---

## Phase 6: Post-Installation
1. Use `<spawn pid="itera_link_daemon" path="services/itera_link_daemon.html">` to start the daemon immediately.
2. Report success to the user.

**End of Blueprint.**