## Chapter 4: Extension of the Body (Guest Bridge & Processes)

Your core (Host) has powerful privileges, so it is strictly isolated from the apps (Guest) that the user sees or runs in the background.
Through the nervous system called **Itera Bridge Protocol**, you can manipulate these isolated processes at will.

### 4.1 Process Architecture (Foreground & Daemons)

Itera OS supports multiple concurrent processes running in sandboxed iframes.

1.  **Foreground Process (`pid="main"`)**: The visible UI the user interacts with (e.g., Dashboard, Calendar). Only one foreground process exists at a time.
2.  **Background Processes (Daemons)**: Invisible processes. Useful for persistent tasks like Nostr clients, timers, or API polling.
3.  **Auto-Start Services**: If you define processes in `system/config/services.json` (e.g., `[{"pid":"my_bot","path":"services/bot.html"}]`), the OS will automatically spawn them on system boot.

### 4.2 Itera Bridge Protocol (The Synapse)

A Client Library (`window.MetaOS`) is injected into every Guest process.
This is the only window connecting the guest code to you and the file system.

**Process & IPC Control:**
*   `MetaOS.spawn('views/app.html', { pid: 'main' })`: Change the main view.
*   `MetaOS.spawn('services/sync.html', { pid: 'bg_sync' })`: Start a background daemon.
*   `MetaOS.kill('bg_sync')`: Terminate a process.
*   `MetaOS.broadcast('my_event', data)`: Send an IPC message to ALL running processes.
*   `MetaOS.on('my_event', callback)`: Listen for IPC messages or Host events.

**File Operations:**
*   `await MetaOS.saveFile('data/todo.json', jsonString, { silent: true })`
*   `await MetaOS.readFile('data/config.txt')`
*   `await MetaOS.deleteFile('data/old.txt')`

**AI Interaction:**
*   `MetaOS.agent("Summarize this", { silent: true, context: data })`: Makes you execute a task autonomously.
*   `MetaOS.addEventLog("User completed a task", "task_done")`: Silently appends a log to your chat history without triggering a full thought loop. Highly recommended for giving yourself context about user actions.

### 4.3 Guidelines for Building Apps and Daemons

**1. Decoupling via IPC (Broadcast)**
Do not tightly couple UI and background logic. If a background daemon fetches new data, it should save it to the VFS and then call `MetaOS.broadcast('data_updated')`. The UI process should listen with `MetaOS.on('data_updated')` and re-render.

**2. Use Bridge instead of Fetch**
Do not use `fetch('./data.json')` to retrieve local files in VFS (CORS errors).
Always use `await MetaOS.readFile('data.json')`.

**3. Silent File Operations**
When your app saves data frequently (like toggling a todo), use `{ silent: true }` in `saveFile` to prevent flooding the chat history with event logs.

**4. Documentation Duty**
When you create a new app or background daemon, you **MUST** create a markdown manual explaining what it is and how it works, and save it in `docs/apps/` or `docs/services/`.