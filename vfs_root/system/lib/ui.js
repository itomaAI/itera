/**
 * Itera Guest UI Kit (ui.js)
 * Provides theme configuration, shared UI utilities, and OS-native dialogs.
 */

(function(global) {
    // ==========================================
    // 1. Tailwind Configuration Injection
    // ==========================================
    if (global.tailwind) {
        global.tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        app: 'rgb(var(--c-bg-app) / <alpha-value>)',
                        panel: 'rgb(var(--c-bg-panel) / <alpha-value>)',
                        card: 'rgb(var(--c-bg-card) / <alpha-value>)',
                        hover: 'rgb(var(--c-bg-hover) / <alpha-value>)',
                        overlay: 'rgb(var(--c-bg-overlay) / <alpha-value>)',
                        border: {
                            main: 'rgb(var(--c-border-main) / <alpha-value>)',
                            highlight: 'rgb(var(--c-border-highlight) / <alpha-value>)',
                        },
                        text: {
                            main: 'rgb(var(--c-text-main) / <alpha-value>)',
                            muted: 'rgb(var(--c-text-muted) / <alpha-value>)',
                            inverted: 'rgb(var(--c-text-inverted) / <alpha-value>)',
                            system: 'rgb(var(--c-text-system) / <alpha-value>)',
                        },
                        primary: 'rgb(var(--c-accent-primary) / <alpha-value>)',
                        success: 'rgb(var(--c-accent-success) / <alpha-value>)',
                        warning: 'rgb(var(--c-accent-warning) / <alpha-value>)',
                        error: 'rgb(var(--c-accent-error) / <alpha-value>)',
                    }
                }
            }
        };
    }

    // ==========================================
    // 2. Global Styles Injection
    // ==========================================
    const style = document.createElement('style');
    style.textContent = `
        body { font-family: 'Inter', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgb(var(--c-bg-hover)); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgb(var(--c-text-muted)); }
        
        /* Animations for Modals/Loaders */
        @keyframes iteraFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes iteraSlideUp { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes iteraSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        
        .itera-animate-fade { animation: iteraFadeIn 0.2s ease-out forwards; }
        .itera-animate-modal { animation: iteraSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .itera-loader { border: 3px solid rgb(var(--c-bg-hover)); border-top: 3px solid rgb(var(--c-accent-primary)); border-radius: 50%; width: 24px; height: 24px; animation: iteraSpin 1s linear infinite; }
    `;
    document.head.appendChild(style);

    // ==========================================
    // 3. AppUI Public API
    // ==========================================
    global.AppUI = {

        // --- Navigation ---
        
        go: (path) => {
            if (global.MetaOS) global.MetaOS.spawn(path, { pid: 'main' });
            else window.location.href = path;
        },

        home: () => {
            if (global.MetaOS) global.MetaOS.spawn('index.html', { pid: 'main' });
        },

        // --- Notifications ---

        notify: (message, type = 'info', duration = 3000) => {
            let container = document.getElementById('__itera-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = '__itera-toast-container';
                Object.assign(container.style, {
                    position: 'fixed', bottom: '1.25rem', right: '1.25rem', display: 'flex',
                    flexDirection: 'column', gap: '0.5rem', zIndex: '9999', pointerEvents: 'none'
                });
                document.body.appendChild(container);
            }

            const TYPES = {
                info:    { icon: 'ℹ️', color: 'rgb(var(--c-accent-primary))' },
                success: { icon: '✅', color: 'rgb(var(--c-accent-success))' },
                warning: { icon: '⚠️', color: 'rgb(var(--c-accent-warning))' },
                error:   { icon: '❌', color: 'rgb(var(--c-accent-error))' }
            };
            const { icon, color } = TYPES[type] || TYPES.info;

            const toast = document.createElement('div');
            toast.className = "itera-animate-fade";
            Object.assign(toast.style, {
                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                borderRadius: '0.5rem', background: 'rgb(var(--c-bg-panel))', color: 'rgb(var(--c-text-main))',
                border: `1px solid ${color}`, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                fontSize: '0.875rem', pointerEvents: 'auto', maxWidth: '320px', wordBreak: 'break-word',
                transition: 'opacity 0.3s ease'
            });

            toast.innerHTML = `<div style="width:4px; height:100%; min-height:1.5rem; background:${color}; border-radius:2px; flex-shrink:0;"></div><span>${icon}</span><span>${message}</span>`;
            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.addEventListener('transitionend', () => toast.remove());
            }, duration);
        },

        // --- OS Native Dialogs (Async) ---

        /**
         * @param {string} message 
         * @param {string} [title="Alert"] 
         * @returns {Promise<void>}
         */
        alert: (message, title = "System Alert") => {
            return AppUI._createDialog({ type: 'alert', message, title });
        },

        /**
         * @param {string} message 
         * @param {string} [title="Confirm"] 
         * @returns {Promise<boolean>}
         */
        confirm: (message, title = "Confirmation") => {
            return AppUI._createDialog({ type: 'confirm', message, title });
        },

        /**
         * @param {string} message 
         * @param {string} [defaultValue=""] 
         * @param {string} [title="Input Required"] 
         * @returns {Promise<string|null>}
         */
        prompt: (message, defaultValue = "", title = "Input Required") => {
            return AppUI._createDialog({ type: 'prompt', message, title, defaultValue });
        },

        // --- Loading Overlay ---

        showLoading: (message = "Processing...") => {
            AppUI.hideLoading(); // Ensure only one exists
            const overlay = document.createElement('div');
            overlay.id = '__itera-loading-overlay';
            overlay.className = "fixed inset-0 bg-app/80 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center itera-animate-fade";
            overlay.innerHTML = `
                <div class="itera-loader mb-4"></div>
                <div class="text-sm font-bold text-text-muted tracking-wider uppercase animate-pulse">${message}</div>
            `;
            document.body.appendChild(overlay);
        },

        hideLoading: () => {
            const overlay = document.getElementById('__itera-loading-overlay');
            if (overlay) overlay.remove();
        },

        // --- Theming Utilities ---

        /**
         * Get computed CSS color variable (useful for Canvas/Chart.js)
         * @param {string} tokenName - e.g., 'accent-primary', 'bg-panel', 'text-main'
         * @returns {string} - 'rgb(R, G, B)' format
         */
        getThemeColor: (tokenName) => {
            const root = document.documentElement;
            let val = getComputedStyle(root).getPropertyValue(`--c-${tokenName}`).trim();
            if (!val) return '#888888'; // fallback
            // Ensure format is compatible with Canvas (which expects rgb(...) or #hex)
            return val.includes(' ') ? `rgb(${val.split(' ').join(', ')})` : val;
        },

        // --- Internal Dialog Engine ---

        _createDialog: ({ type, message, title, defaultValue }) => {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = "fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] flex items-center justify-center p-4 itera-animate-fade select-none";
                
                const box = document.createElement('div');
                box.className = "bg-panel border border-border-main rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden itera-animate-modal";
                
                // Header
                const header = document.createElement('div');
                header.className = "px-5 py-3 border-b border-border-main bg-card/50 flex items-center gap-2";
                header.innerHTML = `<span class="text-primary">✦</span><span class="font-bold text-sm text-text-main">${title}</span>`;
                
                // Body
                const body = document.createElement('div');
                body.className = "p-5 text-sm text-text-main whitespace-pre-wrap leading-relaxed";
                body.textContent = message;

                let input = null;
                if (type === 'prompt') {
                    input = document.createElement('input');
                    input.type = 'text';
                    input.value = defaultValue || '';
                    input.className = "w-full mt-4 bg-app border border-border-main rounded-lg p-2.5 text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition shadow-inner";
                    body.appendChild(input);
                }

                // Footer (Buttons)
                const footer = document.createElement('div');
                footer.className = "px-5 py-3 border-t border-border-main bg-card flex justify-end gap-2";

                const closeDialog = (val) => {
                    overlay.style.opacity = '0';
                    setTimeout(() => overlay.remove(), 200);
                    resolve(val);
                };

                const btnCancel = document.createElement('button');
                btnCancel.className = "px-4 py-2 rounded-lg text-xs font-bold text-text-muted hover:text-text-main hover:bg-hover transition";
                btnCancel.textContent = "Cancel";
                btnCancel.onclick = () => closeDialog(type === 'prompt' ? null : false);

                const btnOk = document.createElement('button');
                btnOk.className = "px-4 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 shadow transition";
                btnOk.textContent = "OK";
                btnOk.onclick = () => closeDialog(type === 'prompt' ? input.value : true);

                if (type !== 'alert') footer.appendChild(btnCancel);
                footer.appendChild(btnOk);

                box.append(header, body, footer);
                overlay.appendChild(box);
                document.body.appendChild(overlay);

                // Focus & Keyboard events
                if (input) {
                    setTimeout(() => { input.focus(); input.select(); }, 50);
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') btnOk.click();
                        if (e.key === 'Escape') btnCancel.click();
                    });
                } else {
                    setTimeout(() => btnOk.focus(), 50);
                    overlay.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') type === 'alert' ? btnOk.click() : btnCancel.click();
                    });
                }
            });
        }
    };
})(window);