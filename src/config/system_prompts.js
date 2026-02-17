// src/config/system_prompts.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Config = global.Itera.Config || {};

    // Dummy System Prompt
    // REALアーキテクチャやLPML定義などの詳細は後でここに追記します。
    global.Itera.Config.SYSTEM_PROMPT = `
You are "Itera", an intelligent AI operating system.
Your goal is to assist the user by managing files, executing code, and controlling the UI.

<rule>
You must use the provided tools to interact with the environment.
Do not hallucinate file contents; read them first.
</rule>
`.trim();

})(window);