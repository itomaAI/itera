# 04. App & Daemon Development Guide

This guide explains how to build custom applications and background services for Itera OS.

## 1. Foreground Apps

An App is an HTML file (usually in `apps/`) that provides a UI.
Use the system libraries (`ui.js` and `std.js`) to inherit the OS theme and standard data access.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="../system/lib/ui.js"></script>
</head>
<body class="bg-app text-text-main h-screen p-6">
    <button onclick="AppUI.home()" class="text-primary">Go Home</button>
    
    <script>
        // Use MetaOS API to read/write files
        async function saveData() {
            await MetaOS.saveFile('data/my_app.txt', 'Hello', { silent: true });
        }
    </script>
</body>
</html>
```
To show your app in the Launcher, add it to `system/config/apps.json`.

## 2. Background Daemons

Daemons are invisible HTML/JS files that run continuously in the background. They are perfect for timers, WebSocket connections (like Nostr), or cron jobs.

### Creating a Daemon (`services/logger.html`)
```html
<script>
    // Runs every 10 minutes
    setInterval(() => {
        MetaOS.addEventLog("System is running fine.", "health_check");
        // Notify the UI if it's open
        MetaOS.broadcast('system_health', { status: 'OK' });
    }, 10 * 60 * 1000);
</script>
```

### Auto-Starting Daemons
To make your daemon start automatically when Itera OS boots, add it to `system/config/services.json`:
```json
[
    {
        "pid": "sys_logger",
        "path": "services/logger.html"
    }
]
```

## 3. Inter-Process Communication (IPC)

Itera allows completely decoupled communication between your daemons and your UI apps using `broadcast`.

**In Daemon (Sender):**
```javascript
MetaOS.broadcast('data_fetched', { newItems: 5 });
```

**In UI App (Receiver):**
```javascript
if (window.MetaOS) {
    MetaOS.on('data_fetched', (payload) => {
        alert(`Received ${payload.newItems} items from background!`);
        refreshUI();
    });
}
```

## 4. Best Practices
1. **Semantic Colors**: Always use `bg-app`, `text-text-main`, `bg-panel` etc. (See 03_design_system.md).
2. **Context Awareness**: Use `MetaOS.addEventLog()` when the user performs an important action so the AI knows what's happening.
3. **Write Manuals**: When you build a complex app, write a `.md` manual in `docs/apps/` so both you and the AI understand how to use it.