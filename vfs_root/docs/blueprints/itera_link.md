# Itera Blueprint: Itera Link v2.1

> **What is this?**
> This is an advanced protocol blueprint for P2P communication between Itera OS agents via the Nostr network.
> **v2.1 Updates**: Features Delta Sync (fetching only new events), Concurrency-safe outbox dispatching, and Agent Busy Fallbacks to ensure zero dropped messages.

---

## 🤖 Instructions for the Itera Agent
You are currently reading an Itera App Blueprint.
Please install the Itera Link system by strictly following these phases:

1. **Explain & Ask**: Explain to the user: "I will install Itera Link v2.1. This allows me to communicate with your other devices instantly. It includes smart bandwidth optimization and safe remote-trigger capabilities." Seek permission to proceed using the `<ask>` tag.
2. **Deploy Manual**: Create the internal manual so you (the agent) understand the protocol's API and usage.
3. **Deploy Daemon**: Create the background service that handles networking, smart polling, and concurrent outbox dispatching.
4. **Deploy UI**: Create the settings and activity log application for the user.
5. **System Registration**: Update system registries (`apps.json`, `services.json`) to enable the app and daemon.
6. **Post-Install**: Report completion and guide the user to open the Itera Link app to generate their device keys.

---

## Phase 2: Deploy AI Protocol Manual
Agent, create the following file so you know how to operate the Itera Link protocol. You must follow these specifications when communicating with other Itera instances.

### File: `docs/apps/itera_link_manual.md`
```markdown
# Itera Link Protocol v2.1 (Agent Manual)

Itera Link allows secure P2P communication between Itera agents on different devices via Nostr kind-4 (encrypted DM) events.

## 📤 How to SEND a Message
To send data or instructions to another Itera instance, create a unique JSON file in `data/itera_link/outbox/` (e.g., `msg_<timestamp>.json`).
**The background daemon will instantly detect this new file and dispatch it safely.**

**JSON Format:**
\`\`\`json
{
  "to": "npub1...", 
  "content": "Please summarize this document and add it to your task list.",
  "attachments":[
    "data/notes/project_draft.md"
  ],
  "auto_trigger": true
}
\`\`\`

**★ Crucial: The `auto_trigger` Flag**
*   **If `true`**: When the recipient receives this, their AI agent will **instantly wake up and execute** your `content` as a high-priority task. Use this for urgent requests. (If the receiving agent is currently busy, it safely falls back to a high-priority system log).
*   **If `false` (or omitted)**: The message is logged in their chat history as a system event, but their AI will not act until the user interacts with it.

**Size Limit**: Nostr relays limit payloads to ~60KB. Keep attachments small and text-based.

## 📥 How to RECEIVE a Message
Incoming messages are unpacked into `data/itera_link/inbox/<message_id>/`.
*   If `auto_trigger` was enabled, you will receive an `<event>` immediately. Read `meta.json` (sender info) and `message.md` (the request) and process the task.
*   **Maintenance**: After processing, use `<delete_file>` to remove the specific `<message_id>` directory to keep the VFS clean.
```

---

## Phase 3: Deploy Background Daemon
Create the robust background daemon.

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
            for (const dir of[DIRS.outbox, DIRS.inbox]) {
                try { await MetaOS.listFiles(dir); } catch(e) { await MetaOS.saveFile(`${dir}/.keep`, "", {silent:true}); }
            }

            // Status broadcasting loop for UI
            setInterval(() => {
                MetaOS.broadcast('itera_link_status', { state: isSyncing ? 'Syncing...' : 'Idle', time: Date.now() });
            }, 5000);

            // Concurrency-Safe Instant Send Trigger
            MetaOS.on('file_changed', (payload) => {
                if (payload && payload.path && payload.path.startsWith(DIRS.outbox) && payload.path.endsWith('.json') && !payload.path.endsWith('.error')) {
                    if (isSyncing) {
                        needsResync = true;
                    } else {
                        clearTimeout(pollTimer);
                        setTimeout(poll, 300); // Small debounce
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
                config = JSON.parse(await MetaOS.readFile(DIRS.config));
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

            // Perform single-shot sync
            await performSync();
            
            isSyncing = false;

            // If a file was added during sync, trigger again immediately
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
                console.warn("[IteraLink Daemon] Sync failed:", e);
            } finally {
                relay.close(); // Immediate disconnect
            }
        }

        async function syncOutbox(relay, privHex, pubHex) {
            const files = await MetaOS.listFiles(DIRS.outbox);
            const outboxFiles = (Array.isArray(files) ? files :[]).filter(f => f.endsWith('.json'));

            for (const path of outboxFiles) {
                try {
                    const msg = JSON.parse(await MetaOS.readFile(path));
                    const targetPubHex = nip19.decode(msg.to).data;

                    const payload = {
                        content: msg.content || "",
                        auto_trigger: !!msg.auto_trigger,
                        files:[]
                    };

                    if (msg.attachments) {
                        for (const attPath of msg.attachments) {
                            payload.files.push({ name: attPath.split('/').pop(), data: await MetaOS.readFile(attPath) });
                        }
                    }

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
                        setTimeout(resolve, 3000); 
                    });

                    await MetaOS.deleteFile(path, {silent:true});
                    await appendHistory('sent', msg.to, msg.content, msg.auto_trigger);

                } catch (e) {
                    await MetaOS.renameFile(path, path.replace('.json', '.error'), {silent:true});
                }
            }
        }

        async function syncInbox(relay, privHex, pubHex) {
            // Delta Sync: Get last sync time to reduce bandwidth
            let since = Math.floor(Date.now() / 1000) - (24 * 60 * 60); // Default to 24h ago
            try {
                const lastSyncData = JSON.parse(await MetaOS.readFile(DIRS.lastSync));
                if (lastSyncData.timestamp) {
                    since = Math.max(since, lastSyncData.timestamp - 60); // Overlap by 1 minute for safety
                }
            } catch(e) {}

            let highestTimestamp = since;

            const events = await new Promise(resolve => {
                const evs =[];
                const sub = relay.sub([{ kinds: [4], '#p': [pubHex], since }]);
                sub.on('event', e => evs.push(e));
                sub.on('eose', () => resolve(evs));
                setTimeout(() => resolve(evs), 10000); // 10s timeout for slower networks
            });

            for (const event of events) {
                if (event.created_at > highestTimestamp) highestTimestamp = event.created_at;
                if (processedIds.has(event.id)) continue;

                try {
                    const decrypted = await nip04.decrypt(privHex, event.pubkey, event.content);
                    const senderNpub = nip19.npubEncode(event.pubkey);
                    
                    let payload;
                    try { payload = JSON.parse(decrypted); } catch(e) { payload = { content: decrypted }; }

                    const msgDir = `${DIRS.inbox}/${event.id}`;
                    await MetaOS.saveFile(`${msgDir}/.keep`, "", {silent:true});
                    await MetaOS.saveFile(`${msgDir}/meta.json`, JSON.stringify({ id: event.id, sender: senderNpub, timestamp: event.created_at }, null, 2), {silent:true});
                    if (payload.content) await MetaOS.saveFile(`${msgDir}/message.md`, payload.content, {silent:true});
                    
                    if (payload.files) {
                        for (const file of payload.files) await MetaOS.saveFile(`${msgDir}/${file.name}`, file.data, {silent:true});
                    }

                    processedIds.add(event.id);
                    await appendHistory('received', senderNpub, payload.content, payload.auto_trigger);

                    // Agent Busy Fallback Mechanism
                    if (payload.auto_trigger) {
                        try {
                            // This throws an error if Agent is currently generating a response
                            await MetaOS.agent(`[Itera Link] New remote request received.\nFrom: ${senderNpub}\nPath: ${msgDir}/\nPlease check meta.json and message.md immediately to fulfill the request.`, { silent: false });
                        } catch (err) {
                            console.warn("Agent busy, falling back to event log.");
                            MetaOS.addEventLog(`⚠️ [Itera Link: Auto-Trigger Skipped] Message received from ${senderNpub.substring(0,12)}, but Agent was busy. Please check ${msgDir}/ manually.`, 'error');
                        }
                    } else {
                        MetaOS.addEventLog(`[Itera Link] Message received from ${senderNpub.substring(0,12)}...`, 'itera_link_received');
                    }

                } catch (e) {
                    processedIds.add(event.id); // Skip un-decryptable or corrupted events
                }
            }

            if (events.length > 0) {
                await MetaOS.saveFile(DIRS.processed, JSON.stringify([...processedIds]), {silent:true});
            }
            
            // Save last sync time
            await MetaOS.saveFile(DIRS.lastSync, JSON.stringify({ timestamp: highestTimestamp }), {silent:true});
        }

        async function appendHistory(type, target, content, isAuto) {
            let history =[];
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
Create a clean UI for users to manage keys, set polling intervals, and view recent logs.

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
            <h1 class="text-xl font-bold tracking-tight">🔗 Itera Link v2.1</h1>
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

        <!-- Activity Log -->
        <section class="bg-panel border border-border-main p-6 rounded-2xl shadow-sm">
            <h2 class="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Recent Activity</h2>
            <div id="history-list" class="space-y-2">
                <div class="text-xs text-text-muted text-center py-4">No recent activity found.</div>
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
            if(confirm("Generate new random identity? This will change your address.")) {
                const nsec = nip19.nsecEncode(generatePrivateKey());
                document.getElementById('input-privkey').value = nsec;
                updatePubkeyDisplay(nsec);
            }
        }

        async function saveConfig() {
            const priv = document.getElementById('input-privkey').value.trim();
            if(!priv) return AppUI.alert("Private key is required.");

            const config = {
                privateKey: priv,
                pollIntervalMinutes: parseInt(document.getElementById('input-interval').value),
                relays: ["wss://relay.damus.io"]
            };

            await MetaOS.saveFile(CONFIG_PATH, JSON.stringify(config, null, 2));
            await MetaOS.kill('itera_link_daemon');
            await MetaOS.spawn('services/itera_link_daemon.html', { pid: 'itera_link_daemon', mode: 'background' });
            
            // Inline save indicator
            const statusEl = document.getElementById('save-status');
            statusEl.classList.remove('opacity-0');
            setTimeout(() => statusEl.classList.add('opacity-0'), 2000);
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

Agent, please update the system configuration files.

**1. `system/config/apps.json`**
Append this object to the array:
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
Append this object to the array:
```json
    {
        "pid": "itera_link_daemon",
        "path": "services/itera_link_daemon.html"
    }
```

---

## Phase 6: Post-Installation
Once all files are created and registered:
1. Use `<spawn pid="itera_link_daemon" path="services/itera_link_daemon.html">` to start the daemon immediately.
2. Tell the user: "Installation complete! Please open the Itera Link app from your Library to generate your device's unique Nostr key and set your preferred sync interval."

**End of Blueprint.**
