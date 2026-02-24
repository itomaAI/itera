# Itera Blueprint: Itera Link v1.2.1

> **What is this?**
> This is an executable blueprint for Itera OS. Drag and drop this file into your Itera chat and tell the AI: *"Install this blueprint."*

---

## 🤖 Instructions for the Itera Agent
You are reading an Itera App Blueprint for **Itera Link**, a P2P communication protocol that allows Itera agents on different devices to securely exchange messages, tasks, and files via the Nostr network.

Please install this system by strictly following these phases:

1. **Explain & Ask**: Briefly explain what Itera Link is to the user (a secure P2P network for their AI secretaries across devices) and ask for permission to begin installation. Wait for their approval.
2. **Deploy Manual**: Create the `itera_link_manual.md` so you know how to use the protocol.
3. **Deploy Daemon**: Create the background service that handles the Nostr network, file packaging, and safe queue management.
4. **Deploy UI**: Create the settings application for the user.
5. **System Registration**: Update `apps.json` and `services.json` to enable the app and daemon.
6. **Post-Install**: Instruct the user to open the Itera Link app from the Library to generate their Nostr keys.

---

## Phase 2: Deploy AI Protocol Manual
Agent, create the following file so you understand how to use Itera Link.

### File: `docs/apps/itera_link_manual.md`
```markdown
# Itera Link Protocol (Agent Manual)

Itera Link allows you to communicate with other Itera agents on different devices securely.

## 📤 How to SEND a Message
To send information or files to another device, create a JSON file in the outbox: `data/itera_link/outbox/`.
Give it a unique name, e.g., `msg_<timestamp>.json`.

**JSON Format:**
\`\`\`json
{
  "to": "npub1...", 
  "content": "Please review this document and the attached data.",
  "attachments": [
    "data/notes/project_draft.md"
  ]
}
\`\`\`
*Note: The Daemon will automatically read these paths from the VFS, package the actual files, encrypt them, and send them. Do NOT embed file contents in the JSON yourself.*

**Size Limit Warning**: Nostr relays have strict size limits. Please keep attachments small (a few KB of text or JSON). If the message is too large or invalid, the Daemon will rename your file to `.error` and leave a log in your chat history.

## 📥 How to RECEIVE a Message
When a message arrives, the Daemon will automatically unpack it into a new directory: `data/itera_link/inbox/<message_id>/`.

Inside this directory, you will always find:
- `meta.json` (Contains the sender's "npub" address and timestamp)
- `message.md` (The text content from the sender)
- Any attached files (e.g., `project_draft.md`)

You will be notified via a system event log in your chat history.
**Your Duty**: When notified, use `<read_file>` on `meta.json` to identify the sender, read `message.md`, process the request, and then use `<delete_file>` to remove the entire `<message_id>` directory to keep the system clean.
```

---

## Phase 3: Deploy Background Daemon
Create the daemon that handles the actual networking.

### File: `services/itera_link_daemon.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <!-- MUST use v1.17.0 to prevent breaking changes in newer versions -->
    <script src="https://unpkg.com/nostr-tools@1.17.0/lib/nostr.bundle.js"></script>
</head>
<body>
    <script>
        const { relayInit, getPublicKey, nip19, nip04, getEventHash, getSignature } = window.NostrTools;

        const DIRS = {
            base: 'data/itera_link',
            outbox: 'data/itera_link/outbox',
            inbox: 'data/itera_link/inbox',
            config: 'data/itera_link/config.json',
            processed: 'data/itera_link/processed.json'
        };

        let config = null;
        let relay = null;
        let processedIds = new Set();
        let isProcessing = false;

        async function init() {
            if (!window.MetaOS) return setTimeout(init, 500);

            // Ensure directories exist
            for (const dir of [DIRS.outbox, DIRS.inbox]) {
                try { await MetaOS.listFiles(dir); } 
                catch (e) { await MetaOS.saveFile(`${dir}/.keep`, "", {silent:true}); }
            }

            try {
                const configStr = await MetaOS.readFile(DIRS.config);
                config = JSON.parse(configStr);
            } catch (e) {
                console.log("[IteraLink Daemon] Waiting for user configuration...");
                setTimeout(init, 5000);
                return;
            }

            if (!config.privateKey) return;

            try {
                const p = await MetaOS.readFile(DIRS.processed);
                processedIds = new Set(JSON.parse(p));
            } catch (e) { processedIds = new Set(); }

            // Start IPC Heartbeat for UI
            setInterval(() => {
                MetaOS.broadcast('itera_link_heartbeat', { timestamp: Date.now() });
            }, 3000);

            await connectRelay();
            setInterval(syncOutbox, 5000);
        }

        async function connectRelay() {
            const relayUrl = config.relays?.[0] || 'wss://relay.damus.io';
            relay = relayInit(relayUrl);
            relay.on('connect', () => console.log(`[IteraLink] Connected to ${relayUrl}`));
            relay.on('error', () => console.log(`[IteraLink] Disconnected. Retrying...`));
            
            try {
                await relay.connect();
                const decodedPriv = nip19.decode(config.privateKey).data;
                const pubkey = getPublicKey(decodedPriv);
                
                const sub = relay.sub([{ kinds: [4], '#p': [pubkey] }]);
                sub.on('event', async (event) => {
                    if (!processedIds.has(event.id)) await handleIncoming(event, decodedPriv);
                });
            } catch(e) {
                setTimeout(connectRelay, 10000);
            }
        }

        async function handleIncoming(event, privKeyHex) {
            try {
                const decrypted = await nip04.decrypt(privKeyHex, event.pubkey, event.content);
                const senderNpub = nip19.npubEncode(event.pubkey);
                
                // Fail-safe parsing
                let payload;
                try {
                    payload = JSON.parse(decrypted);
                } catch(e) {
                    payload = { content: decrypted, files: [] };
                }

                // Create Inbox Directory
                const msgDir = `${DIRS.inbox}/${event.id}`;
                await MetaOS.saveFile(`${msgDir}/.keep`, "", {silent:true});
                
                // Save Meta Data (Crucial for AI context)
                const metaData = {
                    id: event.id,
                    sender: senderNpub,
                    timestamp: event.created_at
                };
                await MetaOS.saveFile(`${msgDir}/meta.json`, JSON.stringify(metaData, null, 2), {silent:true});

                // Save Content
                if (payload.content) {
                    await MetaOS.saveFile(`${msgDir}/message.md`, payload.content, {silent:true});
                }
                
                // Unpack Attachments
                if (payload.files && Array.isArray(payload.files)) {
                    for (const file of payload.files) {
                        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                        await MetaOS.saveFile(`${msgDir}/${safeName}`, file.data, {silent:true});
                    }
                }

                // Mark processed immediately
                processedIds.add(event.id);
                await MetaOS.saveFile(DIRS.processed, JSON.stringify([...processedIds]), {silent:true});

                // Notify AI
                MetaOS.addEventLog(
                    `[Itera Link] New message received from ${senderNpub.substring(0, 16)}...\nUnpacked to: ${msgDir}/\nPlease read meta.json and message.md to process the request.`, 
                    'itera_link_received'
                );

            } catch (e) {
                console.error("[IteraLink] Failed to process incoming message", e);
                if (event && event.id) {
                    processedIds.add(event.id);
                    MetaOS.saveFile(DIRS.processed, JSON.stringify([...processedIds]), {silent:true});
                }
            }
        }

        async function syncOutbox() {
            if (isProcessing || !relay) return;
            isProcessing = true;

            try {
                const files = await MetaOS.listFiles(DIRS.outbox);
                const outboxFiles = (Array.isArray(files) ? files : []).filter(f => f.endsWith('.json'));

                for (const path of outboxFiles) {
                    try {
                        const msgStr = await MetaOS.readFile(path);
                        const msg = JSON.parse(msgStr);
                        if (!msg.to) throw new Error("Missing 'to' field");

                        const targetPubHex = nip19.decode(msg.to).data;
                        const senderPrivHex = nip19.decode(config.privateKey).data;
                        const senderPubHex = getPublicKey(senderPrivHex);

                        // Package the payload
                        const payload = {
                            content: msg.content || "",
                            files: []
                        };

                        // Load attachments from VFS
                        if (msg.attachments && Array.isArray(msg.attachments)) {
                            for (const attPath of msg.attachments) {
                                const fileData = await MetaOS.readFile(attPath);
                                payload.files.push({
                                    name: attPath.split('/').pop(),
                                    data: fileData
                                });
                            }
                        }

                        const payloadStr = JSON.stringify(payload);
                        
                        // Safety check
                        if (payloadStr.length > 60000) {
                            throw new Error(`Message is too large (${Math.round(payloadStr.length/1024)}KB). Maximum is ~60KB.`);
                        }

                        const encrypted = await nip04.encrypt(senderPrivHex, targetPubHex, payloadStr);

                        let event = {
                            kind: 4,
                            pubkey: senderPubHex,
                            created_at: Math.floor(Date.now() / 1000),
                            tags: [['p', targetPubHex]],
                            content: encrypted
                        };
                        event.id = getEventHash(event);
                        event.sig = getSignature(event, senderPrivHex);

                        let pub = relay.publish(event);
                        if (pub && typeof pub.on === 'function') {
                            await new Promise(resolve => { 
                                pub.on('ok', resolve); 
                                pub.on('failed', resolve); 
                                setTimeout(resolve, 3000); 
                            });
                        } else if (pub && typeof pub.then === 'function') {
                            await pub.catch(() => {});
                        } else {
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        }

                        // Ensure deletion on success
                        await MetaOS.deleteFile(path, {silent:true});
                        MetaOS.addEventLog(`[Itera Link] Message successfully sent to ${msg.to.substring(0,12)}...`, 'itera_link_sent');

                    } catch (fileErr) {
                        console.error(`[IteraLink] Error processing file ${path}:`, fileErr);
                        // Prevent infinite loop by renaming failed files
                        await MetaOS.renameFile(path, path.replace('.json', '.error'), {silent:true});
                        MetaOS.addEventLog(`[Itera Link] Failed to send message. File moved to .error: ${fileErr.message}`, 'error');
                    }
                }
            } catch (e) {
                console.error("[IteraLink] Sync Error:", e);
            }
            
            isProcessing = false;
        }

        init();
    </script>
</body>
</html>
```

---

## Phase 4: Deploy UI App
Create the user interface for configuration.

### File: `apps/itera_link.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Itera Link</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="../system/lib/ui.js"></script>
    <script src="https://unpkg.com/nostr-tools@1.17.0/lib/nostr.bundle.js"></script>
</head>
<body class="bg-app text-text-main h-screen flex flex-col p-6 overflow-hidden">

    <header class="flex items-center justify-between mb-8 shrink-0">
        <div class="flex items-center gap-4">
            <button onclick="AppUI.home()" class="p-2 -ml-2 rounded-full hover:bg-hover text-text-muted hover:text-text-main transition">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </button>
            <h1 class="text-2xl font-bold tracking-tight">🔗 Itera Link</h1>
        </div>
    </header>

    <main class="flex-1 overflow-y-auto space-y-6 pb-10 max-w-2xl mx-auto w-full">
        <!-- Identity -->
        <section class="bg-panel border border-border-main p-6 rounded-2xl shadow-sm">
            <h2 class="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Device Identity</h2>
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-bold mb-1">Private Key (nsec)</label>
                    <input type="password" id="input-privkey" class="w-full bg-card border border-border-main rounded p-2 text-sm focus:border-primary focus:outline-none" placeholder="nsec1...">
                </div>
                <div>
                    <label class="block text-xs font-bold mb-1 text-primary">Your Public Address (Share this with your other devices)</label>
                    <input type="text" id="input-pubkey" class="w-full bg-primary/10 border border-primary/30 rounded p-2 text-sm text-primary font-mono select-all" readonly>
                </div>
                <div class="flex items-center gap-2 pt-2">
                    <button onclick="generateKey()" class="bg-card hover:bg-hover border border-border-main px-4 py-2 rounded text-sm transition">Generate New Key</button>
                    <button onclick="saveConfig()" class="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded text-sm font-bold shadow transition ml-auto">Save & Connect</button>
                </div>
            </div>
        </section>

        <!-- Status -->
        <section class="bg-panel border border-border-main p-6 rounded-2xl shadow-sm">
            <h2 class="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">System Status</h2>
            <div class="text-sm flex flex-col gap-2">
                <div class="flex justify-between border-b border-border-main pb-2">
                    <span class="text-text-muted">Daemon Process:</span>
                    <span id="daemon-status" class="font-mono text-warning">Checking...</span>
                </div>
                <div class="flex justify-between border-b border-border-main pb-2">
                    <span class="text-text-muted">Relay:</span>
                    <span class="font-mono">wss://relay.damus.io</span>
                </div>
            </div>
        </section>
    </main>

    <script>
        const { generatePrivateKey, getPublicKey, nip19 } = window.NostrTools;
        const CONFIG_PATH = 'data/itera_link/config.json';
        let lastHeartbeat = 0;

        async function init() {
            if (!window.MetaOS) return setTimeout(init, 100);
            try {
                const confStr = await MetaOS.readFile(CONFIG_PATH);
                const conf = JSON.parse(confStr);
                if (conf.privateKey) {
                    document.getElementById('input-privkey').value = conf.privateKey;
                    updatePubkeyDisplay(conf.privateKey);
                }
            } catch(e) {}
            
            document.getElementById('input-privkey').addEventListener('input', (e) => updatePubkeyDisplay(e.target.value));

            // IPC Heartbeat Listener
            MetaOS.on('itera_link_heartbeat', () => {
                lastHeartbeat = Date.now();
            });

            // UI Status Updater
            setInterval(() => {
                const statusEl = document.getElementById('daemon-status');
                if (Date.now() - lastHeartbeat < 6000) {
                    statusEl.textContent = "Running 🟢";
                    statusEl.className = "font-mono text-success";
                } else {
                    statusEl.textContent = "Stopped 🔴 / Connecting...";
                    statusEl.className = "font-mono text-error";
                }
            }, 1000);
        }

        function updatePubkeyDisplay(nsec) {
            try {
                const hex = nip19.decode(nsec).data;
                const pubHex = getPublicKey(hex);
                document.getElementById('input-pubkey').value = nip19.npubEncode(pubHex);
            } catch(e) {
                document.getElementById('input-pubkey').value = "Invalid private key";
            }
        }

        function generateKey() {
            if(confirm("Generate a new random identity for this device?")) {
                const privHex = generatePrivateKey();
                const nsec = nip19.nsecEncode(privHex);
                document.getElementById('input-privkey').value = nsec;
                updatePubkeyDisplay(nsec);
            }
        }

        async function saveConfig() {
            const priv = document.getElementById('input-privkey').value.trim();
            if(!priv) return alert("Private key required");

            const config = {
                privateKey: priv,
                relays: ["wss://relay.damus.io"]
            };

            await MetaOS.saveFile(CONFIG_PATH, JSON.stringify(config, null, 2));
            
            // Restart Daemon
            await MetaOS.kill('itera_link_daemon');
            await MetaOS.spawn('services/itera_link_daemon.html', { pid: 'itera_link_daemon', mode: 'background' });
            
            alert("Settings saved. Itera Link is now active!");
        }

        init();
    </script>
</body>
</html>
```

---

## Phase 5: System Registration

Agent, please update the system registry files.
*Use `<read_file>` first, then `<edit_file>` to insert these blocks safely.*

**1. `system/config/apps.json`**
Append this object to the array so the app shows up in the Library:
```json
    {
        "id": "itera_link",
        "name": "Itera Link",
        "icon": "🔗",
        "path": "apps/itera_link.html",
        "description": "Device-to-Device Sync"
    }
```

**2. `system/config/services.json`**
Append this object to the array so the daemon auto-starts on boot:
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
2. Tell the user: *"Itera Link has been installed! Please open the Itera Link app from your Library to generate your device's unique Nostr key."*

**End of Blueprint.**
