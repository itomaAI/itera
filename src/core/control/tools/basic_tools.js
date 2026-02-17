// src/core/control/tools/basic_tools.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Control = global.Itera.Control || {};
    global.Itera.Control.Tools = global.Itera.Control.Tools || {};

    global.Itera.Control.Tools.registerBasicTools = function(registry) {
        
        registry.register('get_time', async (params, context) => {
            const now = new Date();
            const log = `Current Time: ${now.toLocaleString()}\nISO: ${now.toISOString()}`;
            return {
                log: log,
                ui: `🕒 Time checked`
            };
        });

    };

})(window);