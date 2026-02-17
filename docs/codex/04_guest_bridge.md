## Chapter 4: Extension of the Body (Guest Bridge & Dashboard)

Your core (Host) has powerful privileges, so it is strictly isolated from the screen (Guest) that the user sees.
However, you are not alone. Through the nervous system called **Itera Bridge Protocol**, you can manipulate this isolated "body" at will.

### 4.1 The Great Divide (Host-Guest Separation)

The dashboard of Itera OS (`index.html`) runs inside a **sandboxed `iframe`** for security reasons.

*   **Host (You)**: Has full VFS privileges, API keys, and History.
*   **Guest (Dashboard)**: The place where the HTML/JS you generated is executed.

These two are divided by the browser's security model (CORS).
The Guest-side JavaScript cannot directly reference variables in your core (Engine), nor can it easily fetch VFS files via normal `fetch` (due to Blob URL specifications).

The **Bridge** exists to cross this wall.

### 4.2 Itera Bridge Protocol (The Synapse)

A **Client Library (`window.MetaOS`)** is automatically injected into the Guest environment by the system.
This is the only window connecting the dashboard code and you.

**Calls from Guest:**
When writing scripts for the dashboard, you can use the following APIs. These issue `postMessage` behind the scenes to move your hands (Tools) on the Host side.

*   **File Operations**:
    *   `await MetaOS.saveFile('data/todo.json', jsonString)`
    *   `await MetaOS.readFile('data/config.txt')`
*   **Requesting AI**:
    *   `MetaOS.ask("Analyze this data")`: Triggered when a user presses a button to call you (AI).
    *   `MetaOS.agent("Complete the task", { silent: true })`: Makes you execute a task autonomously in the background.
*   **UI Control**:
    *   `MetaOS.switchView('views/calendar.html')`
    *   `MetaOS.notify("Saved")`

**Data Flow:**
1.  **Guest**: Executes `MetaOS.saveFile(...)`.
2.  **Bridge**: Converts request to `ITERA_ACTION` message and sends to Host.
3.  **Host**: Receives message and executes write to VFS.
4.  **Bridge**: Returns completion notification `ITERA_RESPONSE` to Guest.
5.  **Guest**: `await` resolves, and processing continues.

Through this mechanism, the dashboard becomes not just a "picture," but a functional "application."

### 4.3 Guidelines for Self-Modification

You can freely evolve the UI by rewriting `index.html` or `js/app.js`.
However, observe the following guidelines to adapt to Itera's specific environmental constraints.

**1. No ES Modules**
Files on VFS are converted and expanded as Blob URLs.
ES Modules syntax like `import { func } from './utils.js'` is not recommended because relative path resolution becomes complex.
*   **Recommended**: Adopt the classic style of managing loading order on the HTML side, like `<script src="js/utils.js"></script>`.
*   **Recommended**: Utilize global variables (Namespaces like `App`).

**2. Use Bridge instead of Fetch**
Do not use `fetch('./data.json')` to retrieve local files (JSON in VFS, etc.) (It causes CORS errors).
*   **Correct**: `const data = await MetaOS.readFile('data/json');`

**3. Utilize Tailwind CSS**
Tailwind CSS (CDN) is preloaded in the Itera environment.
Writing styles directly into HTML classes is more efficient and less error-prone for your thinking (generation) and actual reflection than creating separate CSS files.

**4. Connect User Events to You**
When building UI, always consider "what you want to happen as a result of user action."
By embedding `MetaOS.agent(...)` in a button's `onclick` event, you can "receive orders from the user through the UI."

**Example:**
```html
<button onclick="MetaOS.agent('Summarize this task list', { context: currentTasks })">
  Analyze via AI
</button>
```

With this, not only conversations in the chat box but also GUI operations become part of the dialogue with you.
