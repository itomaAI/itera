# Itera OS

**An Autonomous AI Operating System Running Entirely in Your Browser**

Itera OS is an experimental implementation of an autonomous AI operating system that operates entirely within the constraints of a web browser. 

Departing from the traditional paradigm of conversational chatbots, Itera adopts a **Host-Driven Intelligence (HDI)** approach. In this architecture, the AI agent is granted privileged access to directly construct, manipulate, and maintain the user's computing environment—including the Virtual File System (VFS), UI processes, and background daemons—without relying on any backend server infrastructure.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Experimental](https://img.shields.io/badge/Status-Experimental-orange.svg)]()

---

## 1. Abstract

Itera OS executes all system logic, file manipulation, and UI rendering locally within the browser's memory and IndexedDB. 
When a user issues a natural language request (e.g., "Deploy a task management application"), the AI agent autonomously generates the required HTML/JS/CSS, persists it to the VFS, and spawns it as a live process. Through continuous interaction, the system functions as an adaptive digital workspace that recursively self-improves.

## 2. Key Architectural Features

### 2.1. The REAL Architecture
To translate the inferential capabilities of Large Language Models (LLMs) into autonomous OS operations, the system implements the **REAL (Recursive Environment-Agent Loop)** architecture.
1. **Cognitive Layer (L1)**: Evaluates the current state ($\Omega_t$) and outputs operational intentions via LLM-Prompting Markup Language (LPML) tags.
2. **Control Layer (L2)**: Parses L1 intentions, executes physical interventions (e.g., file I/O, process management), and injects the results back into the context.
3. **State Layer (L3)**: Functions as the Single Source of Truth, consisting of the VFS and Epistemic History.

### 2.2. Host-Guest Isolation & IPC
The OS space is strictly isolated by privilege levels:
* **Host (Kernel)**: Runs on the main thread, handling LLM routing, VFS operations, and process lifecycle management.
* **Guest (Userland)**: Runs user applications and background daemons inside sandboxed `iframe`s.
Guest processes communicate with the Host via the `window.MetaOS` asynchronous Bridge API to perform secure system operations.

### 2.3. Agnostic LLM Routing
The Cognitive Layer is decoupled from specific LLM providers. By configuring the API keys and defining the model with a provider prefix (e.g., `openai/gpt-5.5`), the internal router dynamically switches the target endpoint and context projection logic.

## 3. Quick Start Protocol

To boot and operate the environment, follow these initialization steps:

### Step 1: Inject API Secrets
1. Click the **"Keys"** button located in the top-right header of the OS.
2. Enter your API Keys for the desired providers (e.g., Google, OpenAI, Anthropic). 
*(Note: Secrets are stored locally in the browser's `localStorage` and are never transmitted to unauthorized external servers.)*

### Step 2: Configure the Cognitive Engine
1. Launch the **Settings** application (⚙️) from the Dashboard.
2. Under the **AI Engine (LLM)** section, specify the target model using the `<provider>/<model>` syntax.
   * *Examples:* `openai/gpt-5.5`, `anthropic/claude-opus-4-7`, `google/gemini-3-flash-preview`.
   *(If no provider prefix is specified, the system defaults to Google's API.)*
3. Verify that the model badge in the chat panel header reflects your updated configuration.

### Step 3: Interaction & Blueprint Deployment
* **Natural Language Control**: Use the right-side chat panel to issue commands (e.g., "Change the system theme to Midnight", "Fix the syntax error in `apps/tasks.html`").
* **Itera Blueprints**: To install new software, drag and drop a `.md` blueprint file (e.g., `docs/blueprints/pomodoro.md`) into the chat panel and instruct the AI to install it. The agent will read the blueprint, adapt the code to your current system theme, and safely merge it into the VFS.

## 4. System Resilience & Management

### 4.1. Time Machine (State Snapshots)
Given the potential for AI-driven destructive modifications, the system features a snapshot mechanism. 
Click the **Clock Icon** in the top-left sidebar to create a snapshot of the entire VFS and History ($\Omega_t$). If an operation causes catastrophic failure, you can instantly revert the system to a stable state.

### 4.2. Factory Reset & Data Persistence
* **Factory Reset**: If the system is critically corrupted, click the **Red Trash Icon** in the sidebar to purge the VFS and rebuild the initial system files.
* **Exporting Data**: Since VFS data is volatile upon browser cache clearance, it is highly recommended to periodically click the **Download Icon** (arrow down) in the sidebar to export a complete `.zip` backup of your workspace.

## 5. Constraints & Security Considerations

* **Sandbox Limitations**: Due to browser security constraints, Itera cannot execute native shell binaries (e.g., `npm`, `python`), nor can it directly access the host machine's physical file system.
* **CORS Restrictions**: Direct HTTP requests to external APIs are often blocked by CORS. To mitigate this, users can define a proxy URL in the Settings app, which the `MetaOS.net.fetch` API will route traffic through.
* **Loop Divergence**: If the AI's internal state representation diverges from the actual VFS state, it may fall into an infinite error-correction loop. In such cases, trigger a manual interrupt by pressing the **"Stop"** button in the chat panel.

---
**License**: MIT License  
**Copyright**: (c) 2026 itomaAI inc.