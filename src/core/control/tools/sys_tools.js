// src/core/control/tools/sys_tools.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Control = global.Itera.Control || {};
	global.Itera.Control.Tools = global.Itera.Control.Tools || {};

	global.Itera.Control.Tools.registerSysTools = function(registry) {

		// 1. finish (Task Completion)
		registry.register('finish', async (params, context) => {
			return {
				log: `[finish] Task completed.`,
				ui: `✅ Task Completed`,
				halt_loop: true // ループを強制停止する
			};
		});

		// 2. ask (Question to User)
		registry.register('ask', async (params, context) => {
			return {
				log: `[ask] Waiting for user input.`,
				ui: `❓ ${params.content}`,
				halt_loop: true // ユーザー入力待ちのためループを強制停止する
			};
		});

		// 3. report (Message to User)
		registry.register('report', async (params, context) => {
			return {
				log: `[report] Displayed message to user.`,
				ui: `📢 ${params.content}`,
				trigger_llm: false // これ単体では発火しない（halt_loopではないので他のツールがあれば発火する）
			};
		});

		// 4. thinking / plan
		// これらはLLMの思考過程用タグであり、ツールとしての実体動作はない
		// ログに残すためだけに定義する
		registry.register('thinking', async () => null);
		registry.register('plan', async () => null);
	};

})(window);