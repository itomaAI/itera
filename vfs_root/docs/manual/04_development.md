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

## 5. Application Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>App Template</title>
    
    <!-- 1. 必須ライブラリの読み込み -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="../system/lib/ui.js"></script>
    <script src="../system/lib/std.js"></script>
</head>
<!-- 2. OSテーマに準拠したルートクラス設定 -->
<body class="bg-app text-text-main h-screen flex flex-col p-6 overflow-hidden select-none">

    <!-- 3. 標準ヘッダー -->
    <header class="flex items-center justify-between mb-6 shrink-0">
        <div class="flex items-center gap-4">
            <!-- ダッシュボードへ戻るボタン -->
            <button onclick="AppUI.home()" class="p-2 -ml-2 rounded-full hover:bg-hover text-text-muted hover:text-text-main transition">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </button>
            <h1 class="text-2xl font-bold tracking-tight">My App</h1>
        </div>
    </header>

    <!-- 4. メインコンテンツ領域 -->
    <main class="flex-1 overflow-y-auto pb-10">
        <div class="max-w-2xl mx-auto space-y-6">
            
            <!-- パネルコンポーネント -->
            <section class="bg-panel border border-border-main rounded-2xl p-6 shadow-sm">
                <h2 class="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Settings & Data</h2>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold mb-1">Example Input</label>
                        <!-- 入力フィールドの標準スタイリング -->
                        <input type="text" id="app-input" class="w-full bg-card border border-border-main rounded-lg p-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition shadow-inner" placeholder="Type something...">
                    </div>
                    
                    <div class="flex items-center gap-2 pt-2">
                        <!-- プライマリアクションボタン -->
                        <button onclick="saveData()" class="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow transition flex items-center gap-2">
                            Save Data
                        </button>
                        <!-- 破壊的アクションボタン -->
                        <button onclick="clearData()" class="text-error hover:text-white border border-error/50 hover:bg-error px-4 py-2.5 rounded-lg text-sm font-bold transition ml-auto">
                            Clear
                        </button>
                    </div>
                </div>
            </section>

        </div>
    </main>

    <!-- 5. アプリケーションロジック -->
    <script>
        // アプリケーション固有のストレージキー
        const APP_KEY = 'my_custom_app_v1';
        const DOM = { input: document.getElementById('app-input') };

        /**
         * 初期化処理
         */
        async function init() {
            // MetaOSの準備完了を待つ
            if (!window.MetaOS) return setTimeout(init, 50);

            // ローディング表示（非同期データ取得前）
            AppUI.showLoading("Loading data...");
            
            try {
                // App.Storage を使った安全なデータ取得
                const data = await App.Storage.get(APP_KEY, { inputValue: "" });
                DOM.input.value = data.inputValue || "";
            } catch (e) {
                AppUI.notify("Failed to load data.", "error");
            } finally {
                AppUI.hideLoading();
            }
        }

        /**
         * データ保存処理
         */
        async function saveData() {
            const val = DOM.input.value.trim();
            if (!val) {
                // OSネイティブな警告ダイアログ
                await AppUI.alert("Input cannot be empty.", "Validation Error");
                return;
            }

            try {
                // App.Storage を使った安全なデータ保存
                await App.Storage.set(APP_KEY, { inputValue: val });
                
                // AIにコンテキストを伝えるログ
                App.logEvent(`User saved data in My App: ${val}`);
                
                // 成功トースト通知
                AppUI.notify("Data saved successfully!", "success");
            } catch (e) {
                AppUI.notify("Failed to save.", "error");
            }
        }

        /**
         * データクリア処理（確認ダイアログの例）
         */
        async function clearData() {
            // OSネイティブな確認ダイアログ（Promiseベース）
            const confirmed = await AppUI.confirm("Are you sure you want to delete this data?\nThis cannot be undone.");
            
            if (confirmed) {
                await App.Storage.set(APP_KEY, { inputValue: "" });
                DOM.input.value = "";
                App.logEvent("User cleared data in My App.");
                AppUI.notify("Data cleared.", "info");
            }
        }

        // 起動
        document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
    </script>
</body>
</html>
```