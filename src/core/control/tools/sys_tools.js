// src/core/control/tools/sys_tools.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Control = global.Itera.Control || {};
    global.Itera.Control.Tools = global.Itera.Control.Tools || {};

    const Signal = global.Itera.Control.Signal;

    global.Itera.Control.Tools.registerSysTools = function(registry) {
        
        // 1. finish (Task Completion)
        // ループを終了し、ユーザーのターンに戻す
        registry.register('finish', async (params, context) => {
            return {
                log: `[finish] Task completed.`,
                ui: `✅ Task Completed`,
                signal: Signal.TERMINATE
            };
        }, Signal.TERMINATE);

        // 2. ask (Question to User)
        // ループを一時停止し、ユーザーの回答を待つ
        registry.register('ask', async (params, context) => {
            return {
                log: `[ask] Waiting for user input.`,
                ui: `❓ ${params.content}`,
                signal: Signal.HALT
            };
        }, Signal.HALT);

        // 3. report (Message to User without stopping?)
        // MetaOS仕様では report もループを継続する（CONTINUE）
        registry.register('report', async (params, context) => {
            return {
                log: `[report] Displayed message to user.`,
                ui: `📢 ${params.content}`,
                signal: Signal.CONTINUE
            };
        });

        // 4. thinking / plan
        // これらはLLMの思考過程用タグであり、ツールとしての実体動作はない
        // ログに残すためだけに定義する
        registry.register('thinking', async () => null);
        registry.register('plan', async () => null);
    };

})(window);