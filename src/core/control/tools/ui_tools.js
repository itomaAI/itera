// src/core/control/tools/ui_tools.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Control = global.Itera.Control || {};
    global.Itera.Control.Tools = global.Itera.Control.Tools || {};

    global.Itera.Control.Tools.registerUITools = function(registry) {
        
        // 1. preview (Refresh iframe)
        registry.register('preview', async (params, context) => {
            if (context.ui && context.ui.refreshPreview) {
                await context.ui.refreshPreview(params.path); // Pass path if provided
                return {
                    log: `[preview] Refreshed preview pane.`,
                    ui: `🔄 Preview Refreshed`
                };
            }
            return { log: "UI context not available.", error: true };
        });

        // 2. switch_view (Navigate iframe)
        registry.register('switch_view', async (params, context) => {
            const path = params.path || 'index.html';
            if (context.ui && context.ui.refreshPreview) {
                await context.ui.refreshPreview(path);
                return {
                    log: `[switch_view] Switched view to ${path}`,
                    ui: `Navigate: ${path}`
                };
            }
            return { log: "UI context not available.", error: true };
        });

        // 3. take_screenshot
        registry.register('take_screenshot', async (params, context) => {
            if (context.ui && context.ui.captureScreenshot) {
                // UIがレンダリングされるのを少し待つ
                await new Promise(r => setTimeout(r, 1000));
                
                try {
                    const base64 = await context.ui.captureScreenshot();
                    return {
                        log: `[take_screenshot] Captured.`,
                        ui: `📸 Screenshot Captured`,
                        image: base64 // Projectorがこれを拾ってLLMに見せる
                    };
                } catch (e) {
                    return {
                        log: `[take_screenshot] Failed: ${e.message}`,
                        ui: `⚠️ Screenshot Failed`,
                        error: true
                    };
                }
            }
            return { log: "UI context not available.", error: true };
        });
    };

})(window);