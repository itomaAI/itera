//src/ config/constants.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Config = global.Itera.Config || {};

    // System Constants
    global.Itera.Config.VERSION = "3.0.0";
    global.Itera.Config.VFS_CAPACITY_MB = 256;
    
    // LLM Defaults
    global.Itera.Config.DEFAULT_MODEL = "gemini-3-flash-preview";
    
})(window);