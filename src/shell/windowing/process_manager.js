// src/ui/components/process_manager.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Shell = global.Itera.Shell || {};
	global.Itera.Shell.Windowing = global.Itera.Shell.Windowing || {};

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
						this.spawn('main', mainProc.path, 'foreground', true);
					} else {
						this.spawn('main', 'index.html', 'foreground', true);
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
		 * @param {boolean} forceReload - キャッシュを無視して強制的に再コンパイル・リロードするかどうか
		 */
		async spawn(pid, path, mode = 'background', forceReload = false) {
			// pid が 'main' の場合は強制的に foreground
			if (pid === 'main') mode = 'foreground';

			// Check for Soft Navigation (Query/Hash change only)
			const existingProc = this.processes.get(pid);
			if (existingProc && existingProc.iframe) {
				const currentBase = existingProc.path.split(/[?#]/)[0];
				const newBase = path.split(/[?#]/)[0];

				if (!forceReload && currentBase === newBase && existingProc.mode === mode) {
					console.log(`[ProcessManager] Soft Navigation [${pid}] -> ${path}`);
					
					// Update State
					existingProc.path = path;
					
					// Update UI
					if (mode === 'foreground') {
						this._updateAddressBar(path);
					}

					// Notify Guest
					if (existingProc.iframe.contentWindow) {
						const IpcMessage = global.Itera.Ipc?.IpcMessage;
						if (IpcMessage) {
							// 新しいIPC規格でのルート変更通知
							const msg = IpcMessage.createEvent('host', pid, 'route_changed', { path });
							existingProc.iframe.contentWindow.postMessage(msg, '*');
						} else {
							// 後方互換フォールバック
							existingProc.iframe.contentWindow.postMessage({
								type: 'ITERA_ROUTE_CHANGED',
								path: path
							}, '*');
						}
					}
					return;
				}
			}

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
				} else {
					iframe = document.createElement('iframe');
					iframe.id = `proc-${pid}`;
					// バックグラウンドプロセス用のサンドボックス
					iframe.sandbox = "allow-scripts allow-forms allow-same-origin";
					if (this.els.BG_CONTAINER) {
						this.els.BG_CONTAINER.appendChild(iframe);
					}
				}

				iframe.name = pid; // ★ プロセスIDを伝達

				// ★ 修正: iframeのロードを開始する前にプロセスを登録し、
				// ゲストの初期化スクリプトが即座にHostのAPIを呼べる状態にしておく
				this.processes.set(pid, {
					pid,
					path,
					mode,
					iframe,
					blobUrls
				});

				// iframeの読み込み開始と待機
				if (mode === 'foreground') {
					if (entryUrl) {
						await this._loadIframe(iframe, entryUrl);
						this._updateAddressBar(path);
					} else {
						iframe.srcdoc = `<div style="color:#888; padding:20px; font-family:sans-serif;">No ${path} found.</div>`;
					}
				} else {
					if (entryUrl) {
						await this._loadIframe(iframe, entryUrl);
					}
				}

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
			
			// プロセス終了イベントを発火 (ToolRegistry等のクリーンアップ用)
			if (this.events['process_killed']) {
				this.events['process_killed'](pid);
			}

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
			const IpcMessage = global.Itera.Ipc?.IpcMessage;
			for (const proc of this.processes.values()) {
				if (proc.iframe && proc.iframe.contentWindow) {
					if (IpcMessage) {
						// 新しいIPC規格でのイベント送信
						const msg = IpcMessage.createEvent('host', proc.pid, eventName, payload);
						proc.iframe.contentWindow.postMessage(msg, '*');
					} else {
						// 後方互換フォールバック
						proc.iframe.contentWindow.postMessage({
							type: 'ITERA_EVENT',
							event: eventName,
							payload: payload
						}, '*');
					}
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
				let timeoutId;
				const handler = () => {
					clearTimeout(timeoutId);
					iframe.removeEventListener('load', handler);
					resolve();
				};
				iframe.addEventListener('load', handler);
				iframe.src = url;

				// 10秒経過してもloadイベントが発火しない場合は強制的に解決してフリーズを防ぐ
				timeoutId = setTimeout(() => {
					console.warn(`[ProcessManager] Iframe load timeout for URL: ${url}`);
					iframe.removeEventListener('load', handler);
					resolve();
				}, 10000);
			});
		}

		_updateAddressBar(path) {
			if (this.els.ADDRESS_BAR) {
				try {
					// クエリパラメータを含むパスをデコードして表示する
					this.els.ADDRESS_BAR.value = `metaos://view/${decodeURI(path)}`;
				} catch (e) {
					this.els.ADDRESS_BAR.value = `metaos://view/${path}`;
				}
			}
		}

		/**
		 * Guestからの動的なアセット解決リクエストを処理する
		 * @param {string} requestPath - Guestが要求したパス (相対パスも可)
		 * @param {string} pid - 呼び出し元のプロセスID
		 * @returns {string} - Data URI または Blob URL
		 */
		resolveUrl(requestPath, pid) {
			const proc = this.processes.get(pid);
			if (!proc) throw new Error(`Process [${pid}] not found.`);

			// 1. プロセスの現在のパスからベースディレクトリを特定
			const basePath = proc.path.split(/[?#]/)[0];
			const currentDir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/')) : '';

			// 2. 相対パスをVFSの絶対パスに解決
			let absPath = requestPath;
			if (requestPath.startsWith('./') || requestPath.startsWith('../')) {
				absPath = this._resolveRelativePath(currentDir, requestPath);
			} else if (requestPath.startsWith('/')) {
				absPath = requestPath.substring(1); // ルートからの絶対パス
			}

			if (!this.vfs.exists(absPath)) {
				throw new Error(`File not found: ${absPath}`);
			}

			const content = this.vfs.readFile(absPath);

			// 3. すでにData URI (画像やPDF等のバイナリ) ならそのまま返す
			if (content.startsWith('data:')) {
				return content;
			}

			// 4. テキスト系 (CSSやJSONなど) の場合は Blob URL を生成して返す
			const mimeType = this.compiler._getMimeType(absPath) || 'text/plain';
			const blob = new Blob([content], { type: mimeType });
			const url = URL.createObjectURL(blob);

			// プロセス終了時に自動でメモリ解放されるようにリストに登録
			if (!proc.blobUrls) proc.blobUrls = [];
			proc.blobUrls.push(url);

			return url;
		}

		/**
		 * ヘルパー: カレントディレクトリと相対パスから絶対パスを計算する
		 */
		_resolveRelativePath(baseDir, relPath) {
			const stack = baseDir ? baseDir.split('/') : [];
			const parts = relPath.split('/');
			
			for (const part of parts) {
				if (part === '.' || part === '') continue;
				if (part === '..') {
					if (stack.length > 0) stack.pop();
				} else {
					stack.push(part);
				}
			}
			return stack.join('/');
		}
	}

	global.Itera.Shell.Windowing.ProcessManager = ProcessManager;

})(window);