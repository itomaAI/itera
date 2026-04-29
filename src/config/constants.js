// src/config/constants.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Config = global.Itera.Config || {};

    // System Constants
    global.Itera.Config.VERSION = "3.0.0";
    global.Itera.Config.VFS_CAPACITY_MB = 256;
    
    // LLM Defaults
    global.Itera.Config.DEFAULT_MODEL = "gemini-3-flash-preview";

    // LLM Providers (Secret Management Definitions)
    global.Itera.Config.PROVIDERS = [
        { id: 'google', name: 'Google (Gemini)', placeholder: 'AIzaSy...' },
        { id: 'openai', name: 'OpenAI', placeholder: 'sk-proj-...' },
        { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
        { id: 'custom', name: 'Local / Custom (OpenAI Compatible)', requiresUrl: true, urlPlaceholder: 'http://localhost:11434/v1', placeholder: 'API Key (Optional)' }
    ];
    
})(window);