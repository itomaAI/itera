# 01. User Guide

This guide explains how to navigate the Itera OS interface and use the built-in applications.

## The Interface

The Itera interface consists of three main areas:

1.  **Sidebar (Left)**: File Explorer & System Controls.
2.  **Workspace (Center)**: The main screen where apps and the dashboard run.
3.  **Chat Panel (Right)**: The interface for communicating with the AI Agent.

---

## 1. Dashboard & Launcher

When you boot Itera, you see the **Dashboard**. This is your home base.

*   **Header**: Displays a greeting based on the time of day and the current system clock.
*   **Apps Widget**: Provides quick access to standard applications (Tasks, Notes, Calendar, Settings). Click "Library" to see all installed apps.
*   **Active Tasks / Recent Notes**: Shows a summary of your current work. Clicking an item takes you directly to that app.

**Tip:** You can always return to the dashboard from any app by clicking the **Home Button (House Icon)** in the top toolbar or the "Back" button within an app.

---

## 2. Standard Applications

Itera comes with a suite of productivity tools designed to work together.

### ✅ Tasks
A simple yet powerful task manager.
*   **Add Task**: Type a task name and press Enter. Select priority (Low/Medium/High) before adding.
*   **Manage**: Click the circle to mark as complete. Click the trash icon (appears on hover) to delete.
*   **Sort**: Tasks are automatically sorted by status, priority, and date.

### 📅 Calendar
A monthly view calendar integrated with your tasks.
*   **Navigation**: Use `<` and `>` to switch months. "Today" brings you back.
*   **Add Event**: Click on any date cell to add a new event.
*   **Integration**: Tasks with due dates also appear here automatically.

### 📝 Notes
A Markdown-based note-taking app.
*   **Create**: Click "+ New" in the sidebar to create a note.
*   **Edit**: Click "Edit Source" to open the raw file in the Host's code editor.
*   **Format**: Supports standard Markdown (headers, lists, code blocks) and MathJax equations.

### ⚙️ Settings
Customize your OS experience.
*   **Theme**: Choose from installed themes (Dark, Light, Midnight, etc.) to instantly change the look of the entire OS.
*   **Profile**: Update your username.

---

## 3. File Management (Sidebar)

The left sidebar gives you direct access to the Virtual File System (VFS).

*   **Navigation**: Click folders to expand/collapse. Click files to open them.
    *   Text files open in the Code Editor.
    *   Images/PDFs open in the Media Viewer.
*   **Context Menu**: Right-click on any file or folder to access options like **Rename**, **Duplicate**, **Download**, or **Delete**.
*   **Upload**:
    *   **Drag & Drop**: Drag files or folders from your computer directly onto the sidebar to import them.
    *   **Buttons**: Use the "Folder" or "Files" buttons at the bottom of the sidebar.

### Backup & Restore
Your data lives in the browser's memory. To keep it safe:
*   **Export (Download)**: Click the **Download Icon** (arrow down) in the Storage section to download a complete `.zip` backup of your system.
*   **Import (Restore)**: Click the **Restore Icon** (arrow up) to load a `.zip` backup. **Warning**: This overwrites current files.

---

## 4. Time Machine (Snapshots)

Itera includes a powerful version control system called **Time Machine**.

*   **Create Snapshot**:
    1.  Click the **Clock Icon** in the top-left sidebar header.
    2.  Click "Create Snapshot Now".
    3.  Give it a name (e.g., "Before installing new app").
*   **Restore**:
    *   If something breaks or the AI makes a mistake, open the Time Machine and click "Restore" on a previous snapshot. The system will revert exactly to that state.

---

## 5. Working with the AI Agent

The Chat Panel (Right) is where you give instructions to Itera.

*   **Natural Language**: Just ask for what you want.
    *   "Create a new note called 'Ideas' and list 5 app ideas."
    *   "Change the theme to Light mode."
    *   "Fix the bug in `script.js`."
*   **Attachments**: You can upload text files or images for the AI to analyze using the paperclip icon.
*   **Stop**: If the AI gets stuck in a loop, press the "Stop" button.

---
**Next Step:** Proceed to [02_architecture.md](02_architecture.md) to understand the internal structure of Itera.