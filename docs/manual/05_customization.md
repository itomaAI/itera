# 05. Customization

Itera OS is designed to be deeply customizable.
Because the entire system runs on a Virtual File System (VFS), you can modify configuration files directly to change how the OS looks and behaves.

## 1. Creating Custom Themes

Themes are JSON files located in `system/themes/`.
To create a new theme, simply create a new JSON file (e.g., `system/themes/hacker_green.json`) and define the color palette.

### Theme File Structure

A theme file consists of metadata and a color map. Colors must be hex codes (e.g., `#FFFFFF`).

```json
{
    "meta": {
        "name": "Hacker Green",
        "author": "User"
    },
    "colors": {
        "bg": {
            "app": "#000000",       // Main background (Body)
            "panel": "#0a0a0a",     // Sidebars, Headers
            "card": "#111111",      // Elements inside panels
            "hover": "#1a1a1a",     // Hover state background
            "overlay": "#000000"    // Backdrop tint color
        },
        "border": {
            "main": "#333333",      // Standard borders
            "highlight": "#00ff00"  // Active borders
        },
        "text": {
            "main": "#00ff00",      // Primary text color
            "muted": "#008800",     // Secondary text color
            "inverted": "#000000",  // Text on accent backgrounds
            "system": "#00aa00",    // System messages
            "tag_attr": "#006600",  // XML tag attributes (Chat)
            "tag_content": "#ccffcc"// XML tag content (Chat)
        },
        "accent": {
            "primary": "#00ff00",   // Main action color
            "success": "#00ff00",   // Success state
            "warning": "#ffff00",   // Warning state
            "error": "#ff0000"      // Error state
        },
        "tags": {
            // Colors for AI thought process tags
            "thinking": "#004400",
            "plan": "#004400",
            "report": "#004400",
            "error": "#440000"
        }
    }
}
```

### Applying Your Theme
1.  Save your new JSON file.
2.  Open the **Settings** app (`apps/settings.html`).
3.  Your new theme should appear in the list automatically. Click it to apply.

---

## 2. Configuring the System (`config.json`)

The main system configuration is stored in `system/config/config.json`.
You can edit this file directly or use the Settings app.

```json
{
    "theme": "system/themes/dark.json",  // Path to active theme
    "language": "English",               // AI Agent language
    "username": "User",                  // Your display name
    "agentName": "Itera",                // AI Agent name
    "llm": {
        "model": "gemini-3-pro-preview", // AI Model ID
        "temperature": 1.0               // Creativity (0.0 - 2.0)
    }
}
```

*   **Tip**: Changing `language` to "Japanese" will instruct the AI to speak Japanese in the system prompt.

---

## 3. Customizing the Launcher (`apps.json`)

The list of apps shown in the **Library** is defined in `system/config/apps.json`.
If you create a new app or download one from the community (future feature), add it here to make it accessible.

```json
[
    {
        "id": "tasks",
        "name": "Tasks",
        "icon": "✅",
        "path": "apps/tasks.html",
        "description": "Manage daily to-dos"
    },
    // ... add new apps here
]
```

*   **Icon**: You can use any Emoji.
*   **Path**: The relative path to the HTML file in the VFS.

---

## Summary

Itera OS is built on transparency.
Everything from the color of a button to the list of installed apps is just a file that you can read and write.
Explore, experiment, and build your perfect environment.

**End of Manual.**