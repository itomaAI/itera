// src/core/control/tools/sys_tools.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Control = global.Itera.Control || {};
	global.Itera.Control.Tools = global.Itera.Control.Tools || {};

	global.Itera.Control.Tools.registerSysTools = function(registry) {

		// 1. finish (Task Completion)
		registry.register('finish', async (params, context) => {
			return {
				log: `Task completed.`,
				ui: `✅ Task Completed`,
				halt_loop: true // ループを強制停止する
			};
		});

		// 2. ask (Question to User)
		registry.register('ask', async (params, context) => {
			return {
				log: `Waiting for user input.`,
				ui: `❓ ${params.content}`,
				halt_loop: true // ユーザー入力待ちのためループを強制停止する
			};
		});

		// 3. report (Message to User)
		registry.register('report', async (params, context) => {
			return {
				log: `Displayed message to user.`,
				ui: `📢 ${params.content}`,
				trigger_llm: false // これ単体では発火しない（halt_loopではないので他のツールがあれば発火する）
			};
		});

		// 4. set_timer (Asynchronous Trigger)
		registry.register('set_timer', async (params, context) => {
			const delay = parseInt(params.delay, 10);
			if (isNaN(delay) || delay <= 0) {
				throw new Error("Invalid or missing 'delay' parameter (must be positive seconds).");
			}
			const message = params.message || "Timer expired.";

			// 裏で非同期にタイマーを走らせる
			setTimeout(() => {
				if (context.engine) {
					// システムからの非同期割り込みとして注入
					context.engine.injectSystemEvent('timer_alert', message);
				}
			}, delay * 1000);

			return {
				log: `Timer set for ${delay} seconds.`,
				ui: `⏱️ Timer set (${delay}s)`,
				trigger_llm: false // タイマーのセット完了自体は発火要因にしない
			};
		});

		// 5. reset_session (Context Compression & Reset)
		registry.register('reset_session', async (params, context) => {
			const purgeMedia = params.purge_media === 'true';
			const summary = params.content || "";

			let nextSessionMsg = "[System: Session Reset & Context Compressed]\nPlease run the Initialization Protocol first.";
			if (summary) {
				nextSessionMsg += `\n\n[Carried Over Information]\n${summary}`;
			}

			if (context.shell && context.shell.clearSession) {
				await context.shell.clearSession({
					purgeMedia: purgeMedia,
					summary: nextSessionMsg,
					triggerLlm: true,
					restoreTools: true
				});
			}

			return {
				log: `Session has been reset.`,
				ui: `♻️ Session Reset`,
				halt_loop: true
			};
		});

		// 6. yield (Hand over control to system)
		registry.register('yield', async (params, context) => {
			return {
				log: `Handed over control to system. Executing pending tools...`,
				ui: `⏳ Yielding to System`,
				trigger_llm: false // ツール自体の実行に加えて、このツールが発火要因にならないようにする（他のツールがあれば発火する）
			};
		});

		// 7. thinking / plan
		// これらはLLMの思考過程用タグであり、ツールとしての実体動作はない
		// ログに残すためだけに定義する
		registry.register('thinking', async () => null);
		registry.register('plan', async () => null);
	};

})(window);