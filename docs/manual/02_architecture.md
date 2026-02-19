# 02. System Architecture

Understanding the internal structure of Itera OS is essential for customizing the system and developing new applications.

## Directory Structure (The VFS)

The Virtual File System (VFS) is organized into four main domains to separate user data from system logic.

```text
/
├── index.html              # The Dashboard entry point (Guest Kernel)
├── README.md               # System documentation
│
├── apps/                   # [Application Layer]
│   ├── tasks.html          # Standard apps live here
│   ├── calendar.html
│   └── ...
│
├── data/                   # [User Data Layer]
│   ├── notes/              # Markdown files
│   ├── tasks/              # Task JSON databases
│   └── events/             # Calendar event data
│   # Note: This directory is strictly for user content.
│
├── docs/                   # [Documentation Layer]
│   └── manual/             # This manual
│
└── system/                 # [System Core Layer]
    ├── config/             # Configuration files
    │   ├── apps.json       # Installed app registry
    │   ├── config.json     # User & System settings
    │   └── themes/         # Theme definition files (.json)
    │
    ├── kernel/             # Core logic for the Dashboard
    │   └── dashboard.js
    │
    └── lib/                # Shared Libraries
        ├── std.js          # Standard Data Access Library
        └── ui.js           # UI Kit & Theme Engine
```

---

## The MetaOS Bridge Protocol

The **Guest** environment (where apps run) is isolated from the **Host** (where the AI and File System live).
To interact with the system, apps use the global `window.MetaOS` client library.

### Core API Methods

All file operations are asynchronous and return a `Promise`.

*   **File System**:
    *   `await MetaOS.saveFile(path, content)`: Writes a file.
    *   `await MetaOS.readFile(path)`: Reads a file as a string.
    *   `await MetaOS.listFiles(path, options)`: Returns a list of files.
    *   `await MetaOS.deleteFile(path)`: Deletes a file.

*   **Navigation & UI**:
    *   `MetaOS.switchView(path)`: Navigates the main window to another HTML file (e.g., `apps/notes.html`).
    *   `MetaOS.openFile(path)`: Opens the Host's code editor for the specified file.
    *   `MetaOS.notify(message, title)`: Sends a system notification.

*   **AI Interaction**:
    *   `MetaOS.agent(instruction, options)`: Triggers the AI to perform a background task.
    *   `MetaOS.ask(text)`: Posts a message to the chat panel as the user.

---

## Event System

Itera uses a reactive event system to keep the UI in sync.
Apps can listen for system-wide events using `MetaOS.on()`.

```javascript
if (window.MetaOS) {
    MetaOS.on('file_changed', (payload) => {
        console.log('File changed:', payload.path);
        // Refresh data if necessary
    });
}
```

*   **`file_changed`**: Fired whenever a file is created, modified, or deleted by either the User or the AI.
    *   Payload: `{ type: 'create|modify|delete', path: '...' }`

This mechanism allows apps (like the Task Manager or Dashboard) to update in real-time without reloading the page.

---
**Next Step:** Proceed to [03_design_system.md](03_design_system.md) to learn how to create UI that matches the OS theme.
