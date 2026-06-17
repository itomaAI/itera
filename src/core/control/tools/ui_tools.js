// src/core/control/tools/ui_tools.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Control = global.Itera.Control || {};
	global.Itera.Control.Tools = global.Itera.Control.Tools || {};

	global.Itera.Control.Tools.registerUITools = function(registry) {

		// 1. spawn (Start or restart a process)
		registry.register('spawn', async (params, context) => {
			let pid = params.pid || 'main';
			const path = params.path || 'index.html';
			let mode = params.mode || 'background';
			const forceReload = params.force === 'true';

			// フォールバック: pid="main" や pid省略時はパスベースの自動PIDに変換する
			if (pid === 'main') {
				mode = 'foreground';
				const basePath = path.split(/[?#]/)[0];
				const safeName = basePath.replace(/[^a-zA-Z0-9_-]/g, '_');
				pid = `app_${safeName}`;
			}

			if (context.shell && context.shell.windowing && context.shell.windowing.processManager) {
				await context.shell.windowing.processManager.spawn(pid, path, mode, forceReload);
				return {
					log: `Process started.`,
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

			if (context.shell && context.shell.windowing && context.shell.windowing.processManager) {
				const success = context.shell.windowing.processManager.kill(pid);
				if (success) {
					return {
						log: `Process terminated.`,
						ui: `🛑 Killed [${pid}]`
					};
				} else {
					return {
						log: `Process not found or already stopped.`,
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
			if (context.shell && context.shell.windowing && context.shell.windowing.processManager) {
				const list = context.shell.windowing.processManager.list();
				if (list.length === 0) {
					return {
						log: "No processes running.",
						ui: `📊 Process List (0)`
					};
				}
				// 新しいプロセスモデルに合わせて Type と State を出力する
				const logStr = list.map(p => 
					`PID: ${p.pid.padEnd(15)} | Type: ${p.type.padEnd(6)} | State: ${p.state.padEnd(10)} | Path: ${p.path}`
				).join('\n');
				
				return {
					log: logStr,
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
			if (context.shell && context.shell.captureScreenshot) {
				// UIがレンダリングされるのを少し待つ
				await new Promise(r => setTimeout(r, 1000));

				try {
					// captureScreenshotは生のBase64文字列を返す仕様
					const base64 = await context.shell.captureScreenshot();

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
						log: `Captured main process and saved to ${path}`,
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
						log: e.message,
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

		// 5. inject_js (Inject and execute JavaScript in a process)
		registry.register('inject_js', async (params, context) => {
			let pid = params.pid;
			const code = params.content || '';

			// 互換性フォールバック: pid指定がない、または 'main' の場合は現在の Foreground を探す
			if (!pid || pid === 'main') {
				if (context.shell && context.shell.windowing && context.shell.windowing.processManager) {
					const fg = Array.from(context.shell.windowing.processManager.processes.values()).find(p => p.state === 'foreground');
					if (fg) pid = fg.pid;
					else pid = 'app_index_html'; // 何もなければindexとしてみる
				}
			}
			
			if (!code.trim()) {
				throw new Error("No JavaScript code provided to inject.");
			}

			if (context.shell && context.shell.windowing && context.shell.windowing.processManager) {
				const pm = context.shell.windowing.processManager;
				const proc = pm.processes.get(pid);

				if (!proc || !proc.iframe || !proc.iframe.contentWindow) {
					throw new Error(`Target process '${pid}' is not running or not accessible.`);
				}

				try {
					// Guestへコードを送信し、評価結果を待機する
					let result = await context.shell.transport.invokeGuest(
						pid,
						'eval_js', 
						{ code },
						proc.iframe.contentWindow
					);

					// DOMノードなど循環参照を持つオブジェクトが返された場合の対策として、
					// 見やすく安全な文字列表現に変換する
					let logResult = result;
					if (typeof result === 'object' && result !== null) {
						try {
							logResult = JSON.stringify(result, null, 2);
						} catch (e) {
							logResult = String(result);
						}
					} else if (result === undefined) {
						logResult = "undefined";
					}

					return {
						log: `Execution result:\n${logResult}`,
						ui: `💉 Injected JS into [${pid}]`
					};
				} catch (err) {
					return {
						log: `Execution error in [${pid}]: ${err.message}`,
						ui: `⚠️ JS Injection Failed`,
						error: true
					};
				}
			}
			return {
				log: "ProcessManager not available.",
				error: true
			};
		});
	};

})(window);