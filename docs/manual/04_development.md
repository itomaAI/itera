# 04. App Development Guide

This guide explains how to build custom applications for Itera OS.
An "App" in Itera is simply an HTML file located in the `apps/` directory that utilizes the system libraries.

## 1. The "Hello World" Template

To create a new app, create a file (e.g., `apps/hello.html`) with the following structure.
This includes the necessary libraries for styling (`ui.js`) and data access (`std.js`).

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>My App</title>
    <!-- 1. Load Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- 2. Load System Libraries -->
    <script src="../system/lib/ui.js"></script>
    <script src="../system/lib/std.js"></script>
</head>
<body class="bg-app text-text-main h-screen p-6 flex flex-col">

    <!-- Header -->
    <header class="mb-6 flex items-center gap-4">
        <button onclick="AppUI.home()" class="text-text-muted hover:text-text-main">
            <!-- Back Icon -->
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <h1 class="text-2xl font-bold">My New App</h1>
    </header>

    <!-- Content -->
    <div class="bg-panel p-6 rounded-xl border border-border-main shadow-lg">
        <p class="text-text-muted mb-4">Hello, Itera!</p>
        <button onclick="doSomething()" class="bg-primary text-text-inverted px-4 py-2 rounded font-bold hover:bg-primary/90 transition">
            Click Me
        </button>
    </div>

    <script>
        async function doSomething() {
            // Your logic here
            alert("Action executed!");
        }
    </script>
</body>
</html>
```

## 2. Using System Libraries

Itera provides high-level APIs to interact with the OS.

### `AppUI` (UI Helpers)
Provided by `system/lib/ui.js`.

*   `AppUI.go(path)`: Navigate to another app (e.g., `'apps/tasks.html'`).
*   `AppUI.home()`: Return to the Dashboard (`index.html`).

### `App` (Standard Data Library)
Provided by `system/lib/std.js`. Use this to access shared user data.

*   **Tasks**:
    *   `await App.getTasks()`
    *   `await App.addTask(title, date, priority)`
*   **Calendar**:
    *   `await App.getEvents(monthKey)`
    *   `await App.addEvent(title, date, time, note)`
*   **Notes**:
    *   `await App.getRecentNotes(limit)`

### `MetaOS` (Low-Level Bridge)
Direct access to the File System and Host.

*   `await MetaOS.saveFile(path, content)`
*   `await MetaOS.readFile(path)`
*   `await MetaOS.listFiles(path)`

## 3. Registering Your App

To make your app appear in the **Library (Launcher)**, you must add it to the registry file.

1.  Open `system/config/apps.json`.
2.  Add a new entry to the array:

```json
{
    "id": "my-app",
    "name": "My App",
    "icon": "🚀",
    "path": "apps/hello.html",
    "description": "A simple demo application"
}
```

## 4. Development Best Practices

1.  **Use Semantic Colors**: Always use `bg-app`, `text-main`, `border-border-main` etc. Never use `bg-gray-900`. (See [03_design_system.md](03_design_system.md))
2.  **Statelessness**: The VFS persists data, but the DOM resets on navigation. Always reload data (e.g., `await App.getTasks()`) when the page loads (`DOMContentLoaded`).
3.  **Reactive**: If your app relies on data that might change externally (e.g., Task list), listen for changes:
    ```javascript
    if (window.MetaOS) {
        MetaOS.on('file_changed', (payload) => {
            if (payload.path.startsWith('data/tasks')) render();
        });
    }
    ```

---
**Next Step:** Proceed to [05_customization.md](05_customization.md) to learn how to create custom themes and configurations.