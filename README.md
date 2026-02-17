# Itera OS

**An Autonomous AI Operating System Running Entirely in Your Browser**

Itera is an experimental OS based on the **Host-Driven Intelligence (HDI)** architecture, where an AI agent directly manipulates, constructs, and maintains the user's browser environment (file system and UI).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Experimental](https://img.shields.io/badge/Status-Experimental-orange.svg)]()

---

## 🚀 Try It Now

No installation required. Boot it instantly in your browser.

[**👉 Launch Itera OS**](https://itomaai.github.io/itera/)

> **Note:** A Google Gemini API Key is required. Your API key is stored locally in your browser's `localStorage` and is never sent to any external server other than Google's API.

---

## 💡 Overview

While traditional AI chatbots can only "talk," Itera **"acts."**
Powered by the **REAL (Recursive Environment-Agent Loop)** architecture, the AI autonomously cycles through the following loop:

1.  **Observe**: Reads the Virtual File System (VFS) and context history.
2.  **Think**: Plans the next action (coding, file creation, etc.).
3.  **Act**: Executes tools to rewrite the environment.
4.  **Update**: Instantly reflects the results in the UI.

For example, if you ask, "Create a To-Do app," the AI will code the HTML/JS on the spot and deploy the app to your dashboard instantly.

## ✨ Key Features

### 1. Virtual File System (VFS)
A complete file system built on browser memory and IndexedDB.
*   Supports creating, editing, and deleting files.
*   Maintains directory structures.
*   Data persists even after reloading the page.

### 2. Recursive Self-Improvement
The Itera UI (dashboard) itself consists of files like `index.html` and `js/app.js` residing in the VFS.
This means **the AI can rewrite its own source code to extend or fix its own functionalities.**

### 3. Time Machine
You don't have to worry about the AI breaking the system.
*   **Snapshots**: Save the entire state of the system (files and memory) at any time.
*   **Restore**: If something goes wrong, you can instantly roll back to a past healthy state.

### 4. 100% Client-Side Execution
There is no backend server (like Python or Node.js).
All code execution, file manipulation, and UI rendering happen entirely within your browser.

---

## 🛠️ Architecture

### Host (Core Layer)
*   **Role**: The Brain, "The Hands of God."
*   **Function**: A privileged area that manages communication with the LLM, the VFS, and tool execution.

### Guest (User Land)
*   **Role**: The Body, The Screen.
*   **Function**: Runs inside a sandboxed `iframe`. This is where the dashboard and apps visible to the user operate.
*   **Bridge**: Interactions with the Host (file operations, AI requests) are handled via the `window.MetaOS` client library.

---

## 📦 Usage

1.  **Launch**: Visit the [Demo Page](https://itomaai.github.io/itera/).
2.  **Authenticate**: Enter your Gemini API Key in the top-right input field and click "Save".
3.  **Interact**: Give instructions in the chat box.
    *   Example: "Create a task management app."
    *   Example: "Change the background to dark mode."
    *   Example: "Create a text file in the data folder logging the current time."
4.  **Develop**: You can also directly edit code via the file explorer on the right if needed.

---

## ⚠️ Troubleshooting

*   **Screen turned white**: The AI might have broken the code. Use the "Time Machine (Clock Icon)" in the sidebar to restore a previous snapshot, or use "Factory Reset (Red Trash Icon)" to initialize the system.
*   **Response stopped**: Click the "Stop" button or reload the page. Your state is saved in IndexedDB.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 itomaAI inc.