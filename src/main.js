// src/main.js

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Instantiate the Main Controller
    // (Dependencies are expected to be loaded by <script> tags in index.html)
    if (!globalThis.Itera || !globalThis.Itera.UI || !globalThis.Itera.UI.MainController) {
        console.error("Critical Error: Itera system scripts not loaded.");
        alert("System Error: Scripts failed to load. Check console.");
        return;
    }

    const controller = new globalThis.Itera.UI.MainController();

    try {
        // 2. Initialize the System
        // (Loads storage, vfs, history, tools, bridge, and renders UI)
        await controller.init();

        // 3. Remove Boot Loader
        const loader = document.getElementById('boot-loader');
        if (loader) {
            // Add fade-out animation class (defined in index.html tailwind config)
            loader.classList.add('animate-fade-out');
            
            // Remove from DOM after animation
            setTimeout(() => {
                loader.remove();
            }, 500);
        }

    } catch (e) {
        console.error("System Boot Failed:", e);
        const loader = document.getElementById('boot-loader');
        if (loader) {
            loader.innerHTML = `
                <div class="text-red-500 font-bold mb-2">System Boot Error</div>
                <div class="text-xs text-gray-400 font-mono bg-black/50 p-2 rounded">${e.message}</div>
                <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white">Reload</button>
            `;
        }
    }
});