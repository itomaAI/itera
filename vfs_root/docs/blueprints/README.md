# Itera Blueprints

**Itera Blueprints** are an "AI-native software packaging format" designed to add new applications and extensions to Itera OS.

## 💡 What are Blueprints?

Traditional OS installers (like `.exe`, `.dmg`, or extracting a `.zip`) force files into predetermined locations. However, Itera OS is an operating system that constantly evolves as the user and the AI collaboratively rewrite its source code.

Because every user's environment might have a different dashboard layout or system configuration (`apps.json`), applying a rigid patch could easily break the system.

Enter the **Blueprint**. 
A Blueprint is simply a **Markdown file (`.md`)** that contains the app's source code along with natural language installation instructions for the AI.

The AI Agent reads this Blueprint, **understands the context of the user's current system environment, and safely merges (edits or appends) the code.**

## 🚀 How to Use (For Users)

Installing an app using a Blueprint is incredibly simple:

1. **Drag & Drop**: Drag the Blueprint file you want to install (e.g., `pomodoro.md`) and drop it into the chat panel on the right side of Itera OS.
2. **Instruct the AI**: Type something like **"Install this blueprint"** in the chat and send it.
3. **Interactive Setup**: 
   The AI will read the contents and ask for your permission to begin the installation. It may also ask customization questions, such as "Would you like to add a shortcut to your dashboard?" Interact with the AI to build your ideal environment.

## 🛠️ How to Write a Blueprint (For Developers)

If you want to build and distribute your own app, take a look at `pomodoro.md` as a reference to create your Blueprint.
A well-crafted Blueprint is divided into clear phases so the AI can execute the tasks without confusion.

### Recommended Structure

1. **System Instruction**
   * Clearly state what this document is and outline the steps (phases) the AI should follow to install it.
2. **Phase 1: Explain & Ask**
   * Instruct the AI not to overwrite files immediately. It should first explain the app's features to the user and ask for permission (equivalent to an `<ask>` tag) to proceed.
3. **Phase 2: Source Code (Deploy)**
   * Provide the HTML / JS / CSS code to be deployed within Markdown code blocks. It is highly recommended to use Itera's Semantic Design Tokens (via `ui.js`) to ensure the app adapts to the user's current theme.
4. **Phase 3: Registry**
   * Provide the JSON snippet or object structure showing how the app should be appended to system files like `system/config/apps.json`.
5. **Phase 4: Post-Install (Interactive Setup)**
   * Instruct the AI to perform interactive setup steps to improve the user experience, such as asking, "Would you like me to add a button to your dashboard?"

## ⚠️ Security Notice

Blueprints grant the AI significant authority to modify your environment. 
While the Itera AI is designed to review instructions beforehand to avoid destructive actions (like deleting the entire system), we strongly recommend that you manually inspect the contents of a Blueprint—especially if it comes from an untrusted source—to ensure there are no malicious instructions (e.g., deleting user files) before installing.

---
*Empower your OS with Itera Blueprints.*