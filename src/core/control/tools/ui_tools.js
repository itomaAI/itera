// src/core/control/tools/ui_tools.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Control = global.Itera.Control || {};
	global.Itera.Control.Tools = global.Itera.Control.Tools || {};

	global.Itera.Control.Tools.registerUITools = function(registry) {

		// --- Legacy Compatibility ---
		registry.register('preview', async (params, context) => {
			if (context.ui && context.ui.components && context.ui.components.processManager) {
				await context.ui.components.processManager.spawn('main', params.path || 'index.html', 'foreground');
				return {
					log: `[preview] Refreshed main process.`,
					ui: `🔄 Preview Refreshed`
				};
			}
			return {
				log: "ProcessManager not available.",
				error: true
			};
		});

		registry.register('switch_view', async (params, context) => {
			const path = params.path || 'index.html';
			if (context.ui && context.ui.components && context.ui.components.processManager) {
				await context.ui.components.processManager.spawn('main', path, 'foreground');
				return {
					log: `[switch_view] Switched main view to ${path}`,
					ui: `Navigate: ${path}`
				};
			}
			return {
				log: "ProcessManager not available.",
				error: true
			};
		});
		// ----------------------------

		// 1. spawn (Start or restart a process)
		registry.register('spawn', async (params, context) => {
			const pid = params.pid || 'main';
			const path = params.path || 'index.html';
			const mode = params.mode || (pid === 'main' ? 'foreground' : 'background');

			if (context.ui && context.ui.components && context.ui.components.processManager) {
				await context.ui.components.processManager.spawn(pid, path, mode);
				return {
					log: `[spawn] Process '${pid}' started at ${path} (${mode} mode).`,
					ui: `🚀 Spawned [${pid}]`
				};
			}
			return {
				log: "ProcessManager not available.",
				error: true
			};
		});

		// 2. kill (Terminate a process)
		registry.register('kill', async (params, context) => {
			const pid = params.pid;
			if (!pid) throw new Error("Attribute 'pid' is required for <kill>.");

			if (context.ui && context.ui.components && context.ui.components.processManager) {
				const success = context.ui.components.processManager.kill(pid);
				if (success) {
					return {
						log: `[kill] Process '${pid}' terminated.`,
						ui: `🛑 Killed [${pid}]`
					};
				} else {
					return {
						log: `[kill] Process '${pid}' not found or already stopped.`,
						error: true
					};
				}
			}
			return {
				log: "ProcessManager not available.",
				error: true
			};
		});

		// 3. ps (List processes)
		registry.register('ps', async (params, context) => {
			if (context.ui && context.ui.components && context.ui.components.processManager) {
				const list = context.ui.components.processManager.list();
				if (list.length === 0) {
					return {
						log: "No processes running.",
						ui: `📊 Process List (0)`
					};
				}
				const logStr = list.map(p => `PID: ${p.pid.padEnd(15)} | Mode: ${p.mode.padEnd(10)} | Path: ${p.path}`).join('\n');
				return {
					log: `[ps] Running Processes:\n${logStr}`,
					ui: `📊 Process List (${list.length})`
				};
			}
			return {
				log: "ProcessManager not available.",
				error: true
			};
		});

		// 4. take_screenshot
		registry.register('take_screenshot', async (params, context) => {
			if (context.ui && context.ui.captureScreenshot) {
				// UIがレンダリングされるのを少し待つ
				await new Promise(r => setTimeout(r, 1000));

				try {
					// captureScreenshotは生のBase64文字列を返す仕様
					const base64 = await context.ui.captureScreenshot();

					// ★ VFSへ保存処理
					const vfs = context.vfs;
					const timestamp = Date.now();
					const filename = `screenshot_${timestamp}.png`;
					const dir = 'system/cache/media';
					const path = `${dir}/${filename}`;

					// ディレクトリ作成（存在確認はcreateDirectory内で行われるが念のため）
					if (vfs.createDirectory) vfs.createDirectory(dir);

					// VFSはDataURL形式を期待しているためヘッダーを付与
					const dataUrl = `data:image/png;base64,${base64}`;
					vfs.writeFile(path, dataUrl);

					return {
						log: `[take_screenshot] Captured main process and saved to ${path}`,
						ui: `📸 Screenshot Saved`,
						// 旧来の image: base64 は廃止し、新しい media オブジェクトを返す
						media: {
							path: path,
							mimeType: 'image/png',
							metadata: {}
						}
					};
				} catch (e) {
					return {
						log: `[take_screenshot] Failed: ${e.message}`,
						ui: `⚠️ Screenshot Failed`,
						error: true
					};
				}
			}
			return {
				log: "UI context not available.",
				error: true
			};
		});
	};

})(window);