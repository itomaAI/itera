# Itera Blueprint: Pomodoro Timer v1.1

> **What is this?**
> This is a high-performance Pomodoro application for Itera OS featuring state persistence and background awareness.
> To install: Drag and drop this file into your Itera chat and say: *"Install this blueprint."*

---

## 🤖 Instructions for the Itera Agent
You are reading an Itera App Blueprint. Your objective is to safely install this application into the user's environment. 
Please execute the installation by strictly following these phases:

1. **Explain**: Briefly explain that this version includes **State Persistence** (it remembers time even if the app is closed) and **Background Calculation**. Ask for permission to begin installation.
2. **Deploy Code**: Create the necessary files in the Virtual File System (VFS).
3. **Register App**: Update `system/config/apps.json` to register the application.
4. **Post-Install Setup**: Ask the user if they want a shortcut added to their Dashboard (`index.html`).

---

## 📦 App Metadata
* **App ID**: `pomodoro`
* **Name**: Pomodoro Timer
* **Icon**: 🍅
* **Path**: `apps/pomodoro.html`
* **Description**: High-performance focus timer with state persistence.

---

## 💻 Source Code

### File: `apps/pomodoro.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pomodoro Timer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="../system/lib/ui.js"></script>
</head>
<body class="bg-app text-text-main h-screen flex flex-col p-6">

    <!-- Header -->
    <header class="flex items-center gap-4 mb-10 shrink-0">
        <button onclick="AppUI.home()" class="p-2 -ml-2 rounded-full hover:bg-hover text-text-muted hover:text-text-main transition">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">🍅 Pomodoro</h1>
    </header>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col items-center justify-center pb-20">
        <div class="bg-panel rounded-3xl p-10 shadow-2xl border border-border-main flex flex-col items-center w-full max-w-sm relative overflow-hidden group">
            
            <div id="mode-display" class="text-sm font-bold uppercase tracking-widest text-primary mb-6 transition-colors">
                Focus Time
            </div>

            <div id="timer-display" class="text-8xl font-light font-mono tracking-tighter text-text-main mb-10 tabular-nums">
                25:00
            </div>

            <div class="flex items-center gap-4">
                <button id="btn-toggle" onclick="toggleTimer()" class="w-16 h-16 rounded-full bg-primary hover:bg-primary/80 text-text-inverted flex items-center justify-center transition shadow-lg hover:scale-105">
                    <svg id="icon-play" class="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <svg id="icon-pause" class="w-8 h-8 hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                </button>
                <button onclick="resetTimer()" class="w-12 h-12 rounded-full bg-card hover:bg-hover border border-border-main text-text-muted hover:text-text-main flex items-center justify-center transition hover:scale-105" title="Reset">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                </button>
            </div>

            <div class="mt-10 flex gap-2">
                <button onclick="setMode('focus')" class="px-4 py-1.5 rounded-full text-xs font-bold bg-primary/20 text-primary border border-primary/30 transition hover:bg-primary/30">Focus (25m)</button>
                <button onclick="setMode('break')" class="px-4 py-1.5 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30 transition hover:bg-success/30">Break (5m)</button>
            </div>
        </div>
    </main>

    <script>
        const STATE_FILE = 'system/cache/pomodoro.json';
        const MODES = { focus: 25 * 60, break: 5 * 60 };
        
        let currentMode = 'focus';
        let timeLeft = MODES[currentMode];
        let isRunning = false;
        let targetTime = null;
        let timerId = null;

        const DOM = {
            display: document.getElementById('timer-display'),
            mode: document.getElementById('mode-display'),
            btnToggle: document.getElementById('btn-toggle'),
            iconPlay: document.getElementById('icon-play'),
            iconPause: document.getElementById('icon-pause')
        };

        async function loadState() {
            if (window.MetaOS) {
                try {
                    const data = await MetaOS.readFile(STATE_FILE);
                    const state = JSON.parse(data);
                    
                    currentMode = state.mode || 'focus';
                    isRunning = state.isRunning || false;
                    targetTime = state.targetTime || null;

                    if (isRunning && targetTime) {
                        const now = Date.now();
                        timeLeft = Math.max(0, Math.ceil((targetTime - now) / 1000));
                        
                        if (timeLeft <= 0) {
                            isRunning = false;
                            timeLeft = 0;
                            notifyCompletion(currentMode, true);
                            return; 
                        } else {
                            startTick();
                        }
                    } else {
                        timeLeft = state.timeLeft !== undefined ? state.timeLeft : MODES[currentMode];
                    }
                } catch (e) {}
            }
            updateUI();
        }

        async function saveState() {
            if (window.MetaOS) {
                const state = {
                    mode: currentMode,
                    isRunning: isRunning,
                    targetTime: targetTime,
                    timeLeft: timeLeft
                };
                await MetaOS.saveFile(STATE_FILE, JSON.stringify(state), { silent: true });
            }
        }

        function updateDisplay() {
            const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const s = (timeLeft % 60).toString().padStart(2, '0');
            DOM.display.textContent = `${m}:${s}`;
            document.title = `${m}:${s} - Pomodoro`;
        }

        function updateUI() {
            updateDisplay();
            DOM.mode.textContent = currentMode === 'focus' ? 'Focus Time' : 'Short Break';
            DOM.mode.className = `text-sm font-bold uppercase tracking-widest mb-6 transition-colors ${currentMode === 'focus' ? 'text-primary' : 'text-success'}`;
            
            DOM.iconPlay.classList.toggle('hidden', isRunning);
            DOM.iconPause.classList.toggle('hidden', !isRunning);
            DOM.btnToggle.classList.toggle('animate-pulse', isRunning);
        }

        function setMode(mode) {
            currentMode = mode;
            timeLeft = MODES[mode];
            isRunning = false;
            targetTime = null;
            clearInterval(timerId);
            updateUI();
            saveState();
        }

        function toggleTimer() {
            isRunning = !isRunning;
            if (isRunning) {
                targetTime = Date.now() + timeLeft * 1000;
                startTick();
            } else {
                clearInterval(timerId);
                targetTime = null;
            }
            updateUI();
            saveState();
        }

        function resetTimer() {
            setMode(currentMode);
        }

        function startTick() {
            clearInterval(timerId);
            timerId = setInterval(() => {
                const now = Date.now();
                timeLeft = Math.max(0, Math.ceil((targetTime - now) / 1000));
                updateDisplay();
                
                if (timeLeft <= 0) {
                    clearInterval(timerId);
                    isRunning = false;
                    const finishedMode = currentMode;
                    notifyCompletion(finishedMode, false);
                }
            }, 1000);
        }

        function notifyCompletion(finishedMode, whileAway) {
            if (!whileAway) {
                alert(finishedMode === 'focus' ? "Focus session complete! Take a break." : "Break is over! Back to work.");
            }
            if (window.MetaOS && MetaOS.addEventLog) {
                const logMsg = finishedMode === 'focus' ? "User completed a focus session." : "User completed a break.";
                MetaOS.addEventLog(logMsg, 'pomodoro_event');
            }
            setMode(finishedMode === 'focus' ? 'break' : 'focus');
        }

        document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', loadState) : loadState();
    </script>
</body>
</html>
```

---

## ⚙️ Registration Steps
1. **Read** `system/config/apps.json`.
2. **Append** the Metadata for `pomodoro`.
3. **Save** the updated file.

---

## 🎨 Post-Installation (Interactive)
Ask the user via `<ask>` tag if they'd like to add a shortcut to `index.html`.

Example Shortcut HTML:
```html
<button onclick="AppUI.go('apps/pomodoro.html')" class="flex flex-col items-center justify-center p-4 bg-card hover:bg-hover rounded-xl transition border border-transparent hover:border-primary/50 group">
    <span class="text-2xl mb-1 group-hover:scale-110 transition-transform">🍅</span>
    <span class="text-xs font-bold text-text-main">Pomodoro</span>
</button>
```

**End of Blueprint.**