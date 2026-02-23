// src/ui/components/process_manager.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.UI = global.Itera.UI || {};
	global.Itera.UI.Components = global.Itera.UI.Components || {};

	const DOM_IDS = {
		FRAME_MAIN: 'preview-frame',
		BG_CONTAINER: 'background-processes',
		LOADER: 'preview-loader',
		BTN_HOME: 'btn-home',
		BTN_REFRESH: 'btn-refresh',
		ADDRESS_BAR: 'preview-address-bar'
	};

	class ProcessManager {
		constructor(vfs) {
			this.vfs = vfs;
			this.compiler = new global.Itera.Control.GuestCompiler();
			this.processes = new Map(); // pid -> { pid, path, mode, iframe, blobUrls }
			this.events = {};
			this.els = {};

			this._initElements();
			this._bindEvents();
		}

		on(event, callback) {
			this.events[event] = callback;
		}

		_initElements() {
			Object.entries(DOM_IDS).forEach(([key, id]) => {
				this.els[key] = document.getElementById(id);
			});
		}

		_bindEvents() {
			if (this.els.BTN_REFRESH) {
				this.els.BTN_REFRESH.onclick = () => {
					const mainProc = this.processes.get('main');
					if (mainProc && mainProc.path) {
						this.spawn('main', mainProc.path, 'foreground');
					} else {
						this.spawn('main', 'index.html', 'foreground');
					}
				};
			}
			if (this.els.BTN_HOME) {
				this.els.BTN_HOME.onclick = () => {
					this.spawn('main', 'index.html', 'foreground');
				};
			}
		}

		/**
		 * プロセスを起動する
		 * @param {string} pid - プロセスID ('main' は Foreground 専用)
		 * @param {string} path - 実行する VFS 上のパス
		 * @param {string} mode - 'foreground' | 'background'
		 */
		async spawn(pid, path, mode = 'background') {
			// pid が 'main' の場合は強制的に foreground
			if (pid === 'main') mode = 'foreground';

			// 既存の同名プロセスがあれば安全に破棄
			this.kill(pid);

			if (mode === 'foreground' && this.els.LOADER) {
				this.els.LOADER.classList.remove('hidden');
			}

			try {
				const {
					entryUrl,
					blobUrls
				} = await this.compiler.compile(this.vfs, path, pid);

				let iframe;
				if (mode === 'foreground') {
					iframe = this.els.FRAME_MAIN;
					if (entryUrl) {
						await this._loadIframe(iframe, entryUrl);
						this._updateAddressBar(path);
					} else {
						iframe.srcdoc = `<div style="color:#888; padding:20px; font-family:sans-serif;">No ${path} found.</div>`;
					}
				} else {
					iframe = document.createElement('iframe');
					iframe.id = `proc-${pid}`;
					// バックグラウンドプロセス用のサンドボックス
					iframe.sandbox = "allow-scripts allow-forms allow-same-origin";
					if (entryUrl) {
						await this._loadIframe(iframe, entryUrl);
					}
					if (this.els.BG_CONTAINER) {
						this.els.BG_CONTAINER.appendChild(iframe);
					}
				}

				this.processes.set(pid, {
					pid,
					path,
					mode,
					iframe,
					blobUrls
				});

				console.log(`[ProcessManager] Spawned [${pid}] (${mode}) -> ${path}`);

			} catch (e) {
				console.error(`[ProcessManager] Spawn error (${pid}):`, e);
				if (mode === 'foreground' && this.els.FRAME_MAIN) {
					this.els.FRAME_MAIN.srcdoc = `<div style="color:red; padding:20px;">Process Error: ${e.message}</div>`;
				}
			} finally {
				if (mode === 'foreground' && this.els.LOADER) {
					setTimeout(() => {
						this.els.LOADER.classList.add('hidden');
					}, 200);
				}
			}
		}

		/**
		 * プロセスを終了する
		 */
		kill(pid) {
			if (!this.processes.has(pid)) return false;

			const proc = this.processes.get(pid);

			// 割り当てられた Blob URL をメモリ解放
			if (proc.blobUrls) {
				proc.blobUrls.forEach(url => URL.revokeObjectURL(url));
			}

			if (proc.mode === 'background' && proc.iframe) {
				proc.iframe.remove();
			} else if (proc.mode === 'foreground' && proc.iframe) {
				// mainプロセスのiframe自体はDOMに残すため、srcをリセットするだけ
				proc.iframe.src = 'about:blank';
				this._updateAddressBar('');
			}

			this.processes.delete(pid);
			console.log(`[ProcessManager] Killed [${pid}]`);
			return true;
		}

		killAll() {
			for (const pid of this.processes.keys()) {
				this.kill(pid);
			}
		}

		/**
		 * 全プロセスにイベントを一斉送信する (IPC)
		 */
		broadcast(eventName, payload) {
			for (const proc of this.processes.values()) {
				if (proc.iframe && proc.iframe.contentWindow) {
					proc.iframe.contentWindow.postMessage({
						type: 'ITERA_EVENT',
						event: eventName,
						payload: payload
					}, '*');
				}
			}
		}

		/**
		 * 稼働中のプロセス一覧を取得
		 */
		list() {
			const list = [];
			for (const [pid, proc] of this.processes.entries()) {
				list.push({
					pid: proc.pid,
					path: proc.path,
					mode: proc.mode
				});
			}
			return list;
		}

		/**
		 * スクリーンショットのキャプチャ（主に main プロセス用）
		 */
		async captureScreenshot(pid = 'main') {
			const proc = this.processes.get(pid);
			if (!proc || !proc.iframe || !proc.iframe.contentWindow) {
				throw new Error(`Process ${pid} not found or has no iframe.`);
			}

			return new Promise((resolve, reject) => {
				const iframe = proc.iframe;
				const handler = (e) => {
					// pidの一致を確認して他のプロセスのレスポンスと混同しないようにする
					if (e.data.type === 'SCREENSHOT_RESULT' && e.data.pid === pid) {
						window.removeEventListener('message', handler);
						const parts = e.data.data.split(',');
						resolve(parts.length > 1 ? parts[1] : parts[0]);
					} else if (e.data.type === 'SCREENSHOT_ERROR' && e.data.pid === pid) {
						window.removeEventListener('message', handler);
						reject(new Error(e.data.message));
					}
				};

				window.addEventListener('message', handler);

				setTimeout(() => {
					window.removeEventListener('message', handler);
					reject(new Error("Screenshot timeout"));
				}, 15000);

				iframe.contentWindow.postMessage({
					action: 'CAPTURE'
				}, '*');
			});
		}

		async _loadIframe(iframe, url) {
			return new Promise((resolve) => {
				const handler = () => {
					iframe.removeEventListener('load', handler);
					resolve();
				};
				iframe.addEventListener('load', handler);
				iframe.src = url;
			});
		}

		_updateAddressBar(path) {
			if (this.els.ADDRESS_BAR) {
				this.els.ADDRESS_BAR.textContent = `metaos://view/${path}`;
			}
		}
	}

	global.Itera.UI.Components.ProcessManager = ProcessManager;

})(window);