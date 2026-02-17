// src/config/default_files.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Config = global.Itera.Config || {};

    // Minimal Initial Files
    global.Itera.Config.DEFAULT_FILES = {
        // Dashboard Entry Point
        "index.html": `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Itera Dashboard</title>
    <style>
        body { font-family: sans-serif; background: #111; color: #eee; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .container { text-align: center; }
        h1 { font-size: 2rem; color: #3b82f6; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Itera OS</h1>
        <p>System initialized successfully.</p>
        <p style="color: #666; font-size: 0.8rem;">Ready for prompt engineering.</p>
    </div>
    <!-- MetaOS Bridge will be injected here automatically -->
</body>
</html>
`.trim(),

        // System Configuration
        "system/config.json": JSON.stringify({
            "theme": "dark",
            "language": "English",
            "username": "User",
            "agentName": "Itera",
            "llm": {
                "model": "gemini-3-pro-preview",
                "temperature": 1.0
            }
        }, null, 4),

        // Readme
        "README.md": "# Itera OS\n\nSystem is currently in **Phase 5 (Integration)**.\nContent pending update."
    };

})(window);