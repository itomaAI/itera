# Itera OS

**An Autonomous AI Operating System Running Entirely in Your Browser**

Itera OS is an experimental implementation of an autonomous AI operating system that runs entirely within the web browser.

Departing from the traditional paradigm of "chatbots that only return text," Itera adopts the **Host-Driven Intelligence (HDI)** approach. In this architecture, an AI agent directly constructs, manipulates, and maintains the user's computing environment—including the file system, UI processes, and background daemons.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Experimental](https://img.shields.io/badge/Status-Experimental-orange.svg)]()

---

## 💡 1. Introduction

Itera OS operates without any backend server (such as Python or Node.js). All code execution, file manipulation, and UI rendering occur locally within the user's browser memory.

When a user requests, "I need a task management app," or "Write a script to aggregate this data," the AI instantly writes the HTML/JS/CSS, saves it to the Virtual File System (VFS), and spawns it as a live process. The system itself functions as a digital workspace that recursively self-improves and adapts through continuous interaction between the AI and the user.

## ⚙️ 2. The REAL Architecture

To translate the reasoning capabilities of Large Language Models (LLMs) into autonomous OS operations, we implemented the **REAL (Recursive Environment-Agent Loop)** architecture.

The system is strictly divided into three distinct layers, allowing the AI to autonomously cycle through "Observe, Think, Act, and Update."

1. **Cognitive Layer (L1: The Mind)**
   The pure thinking and planning layer powered by an LLM (currently Google Gemini). It observes the current environmental state and outputs intentions (via LPML tags) detailing "what to do next."
2. **Control Layer (L2: The Hands)**
   The engine that interprets L1's intentions and performs physical interventions in the environment (e.g., creating/editing files, spawning/killing processes). It is also responsible for preventing infinite loops and handling errors.
3. **State Layer (L3: The World)**
   Comprising the Virtual File System (VFS) and Epistemic History. It serves as the agent's memory and the absolute "Single Source of Truth" for the environment.

## 🏗️ 3. System Design: Host & Guest Isolation

To ensure security and system stability, the OS space is isolated by privilege levels.

* **Host (Brain / Kernel)**
  Running on the browser's main thread, this is the privileged zone responsible for LLM communication, VFS management, tool execution authority, and process lifecycle management.
* **Guest (Body / Userland)**
  The user space operating within sandboxed `iframe`s. Both foreground dashboard UIs and background daemon processes (such as API polling) run entirely in this domain.
* **Itera Bridge (MetaOS API)**
  The IPC (Inter-Process Communication) protocol connecting the Guest to the Host. Guest applications use the `window.MetaOS` client library to perform file operations, broadcast events to other processes, or request autonomous tasks from the AI (`agent` / `ask`).

## 📦 4. Itera Blueprints: AI-Native Software Packaging

Itera OS introduces **Itera Blueprints**—a unique, AI-native package management approach for integrating third-party apps and extensions.

A Blueprint is essentially a Markdown (`.md`) file. It contains not only the application's source code but also "natural language installation instructions for the AI."

When a user drops a Blueprint file into the chat and says, "Install this," the AI reads the context of the user's current environment (such as theme settings and existing file structures), safely interprets and merges the code, and updates system registries (e.g., `apps.json`). This paradigm enables flexible, context-aware feature extensions that static installers cannot achieve.

## 🚀 5. User Guide & Best Practices

1. **Boot**: Visit the [Demo Page](https://itomaai.github.io/itera/), enter your Gemini API Key in the top-right settings area, and save it. (Your key is stored locally in `localStorage` only.)
2. **Interaction**: Issue instructions in natural language via the right-side chat panel. You can request anything from creating apps and changing UI themes to tweaking system configurations.
3. **Resilience (Time Machine)**: AI-driven system manipulation can sometimes lead to unexpected, destructive changes. Itera OS includes a "Time Machine" (snapshot) feature. Always create a snapshot before requesting major architectural changes, and instantly roll back to a healthy state if something fails.
4. **Data Persistence**: VFS data is stored in IndexedDB and persists across reloads. However, clearing your browser cache will erase this data. We strongly recommend regularly exporting your entire system as a `.zip` file from the sidebar as a backup.

## ⚠️ 6. Constraints & Troubleshooting

* **Sandbox Constraints**: Because it runs entirely in the browser, Itera cannot execute shell commands (e.g., `npm`, `python`), make direct HTTP requests that violate CORS policies, or access your local machine's physical file system.
* **Loop Divergence**: Occasionally, the AI's perception of the code may diverge from the actual VFS state, causing the AI to fall into an endless error-correction loop. If this happens, use the "Stop" button in the chat panel to forcefully halt its thought process.
* **Factory Reset**: If the system becomes critically corrupted and cannot be recovered via the Time Machine, you can use the "Red Trash Icon" in the sidebar to perform a Factory Reset, rebuilding the system to its initial state.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 itomaAI inc.
