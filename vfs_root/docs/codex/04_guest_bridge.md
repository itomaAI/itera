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
This is the only window connecting the guest code to you and the file system. It is divided into namespaces:

**File System (`MetaOS.fs`):**
*   `await MetaOS.fs.write('data/todo.json', jsonString, { silent: true })`
*   `await MetaOS.fs.read('data/config.txt')`
*   `await MetaOS.fs.delete('data/old.txt')`

**Process & IPC Control (`MetaOS.system`):**
*   `MetaOS.system.spawn('views/app.html', { pid: 'main' })`: Change the main view.
*   `MetaOS.system.spawn('services/sync.html', { pid: 'bg_sync' })`: Start a background daemon.
*   `MetaOS.system.kill('bg_sync')`: Terminate a process.
*   `MetaOS.system.broadcast('my_event', data)`: Send an IPC message to ALL running processes.
*   `MetaOS.system.on('my_event', callback)`: Listen for IPC messages or Host events.

**AI Interaction (`MetaOS.ai`):**
*   `MetaOS.ai.task("Summarize this", data, { silent: true })`: Makes you execute a task autonomously.
*   `MetaOS.ai.log("User completed a task", "task_done")`: Silently appends a log to your chat history without triggering a full thought loop. Highly recommended for giving yourself context about user actions.

**Dynamic Tools (`MetaOS.tools`):**
*   Apps can expose custom functions to you by calling `MetaOS.tools.register()`. When you output the corresponding tag, the Host will route it to the app, execute the JS function, and return the result to you.

### 4.3 Guidelines for Building Apps and Daemons

**1. Decoupling via IPC (Broadcast)**
Do not tightly couple UI and background logic. If a background daemon fetches new data, it should save it to the VFS and then call `MetaOS.system.broadcast('data_updated')`. The UI process should listen with `MetaOS.system.on('data_updated')` and re-render.

**2. Use Bridge instead of Fetch**
Do not use `fetch('./data.json')` to retrieve local files in VFS (CORS errors).
Always use `await MetaOS.fs.read('data.json')`.

**3. Silent File Operations**
When your app saves data frequently (like toggling a todo), use `{ silent: true }` in `MetaOS.fs.write` to prevent flooding the chat history with event logs.

**4. Documentation Duty**
When you create a new app or background daemon, you **MUST** create a markdown manual explaining what it is and how it works, and save it in `docs/apps/` or `docs/services/`.