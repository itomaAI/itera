// src/ui/components/process_manager.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Shell = global.Itera.Shell || {};
	global.Itera.Shell.Windowing = global.Itera.Shell.Windowing || {};

	const DOM_IDS = {
		APPS_CONTAINER: 'apps-container',
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
			this.processes = new Map(); // pid -> { pid, path, mode, type, state, iframe, blobUrls, lastActiveTime, thumbnailData }
			this.MAX_APPS = 5; // LRUメモリ管理用の上限
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

			// 古いハードコードされたiframe(preview-frame)が残っていれば削除して動的生成に委ねる
			const legacyFrame = document.getElementById('preview-frame');
			if (legacyFrame) legacyFrame.remove();
		}

		_bindEvents() {
			if (this.els.BTN_REFRESH) {
				this.els.BTN_REFRESH.onclick = () => {
					// 現在最前面にいるAppを探してリフレッシュ
					let targetProc = Array.from(this.processes.values()).find(p => p.state === 'foreground');
					if (targetProc) {
						this.spawn(targetProc.pid, targetProc.path, 'foreground', true);
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
		 * プロセスを起動、または裏にいるアプリを最前面に引き出す
		 * @param {string} pid - プロセスID
		 * @param {string} path - 実行する VFS 上のパス
		 * @param {string} mode - 'foreground' | 'background'
		 * @param {boolean} forceReload - 強制的に再コンパイル・リロードするかどうか
		 */
		async spawn(pid, path, mode = 'background', forceReload = false) {
			// 後方互換対応: 'main' が指定された場合はパスベースのPIDに変換し、強制的にforegroundにする
			if (pid === 'main') {
				mode = 'foreground';
				// プロセスの一意性を保つため、クエリを除外したベースパスでPIDを生成する
				const basePath = path.split(/[?#]/)[0];
				const safeName = basePath.replace(/[^a-zA-Z0-9_-]/g, '_');
				pid = `app_${safeName}`;
			}

			const type = (mode === 'foreground' || pid.startsWith('app_')) ? 'app' : 'daemon';

			const existingProc = this.processes.get(pid);
			if (existingProc && existingProc.iframe) {
				// 案1対応: クエリやハッシュを含む「完全なパス」が一致する場合のみ再利用（Resume）する。
				// 異なるクエリが指定された場合は false となり、既存プロセスはkillされクエリ付きで強制再起動される。
				const isExactPathMatch = existingProc.path === path;

				if (!forceReload && isExactPathMatch && existingProc.type === type) {
					console.log(`[ProcessManager] Resume [${pid}] -> ${path}`);
					
					existingProc.path = path;
					
					// フォアグラウンド要求なら最前面に引き出す
					if (mode === 'foreground') {
						this._focusApp(pid);
						this._updateAddressBar(path);
					}

					if (existingProc.iframe.contentWindow) {
						const IpcMessage = global.Itera.Ipc?.IpcMessage;
						if (IpcMessage) {
							const msg = IpcMessage.createEvent('host', pid, 'route_changed', { path });
							existingProc.iframe.contentWindow.postMessage(msg, '*');
						} else {
							existingProc.iframe.contentWindow.postMessage({ type: 'ITERA_ROUTE_CHANGED', path: path }, '*');
						}
					}
					return;
				}
			}

			// 新規起動または強制リロード（既存があれば破棄）
			this.kill(pid);

			if (mode === 'foreground' && this.els.LOADER) {
				this.els.LOADER.classList.remove('hidden');
			}

			try {
				const { entryUrl, blobUrls } = await this.compiler.compile(this.vfs, path, pid);

				let iframe = document.createElement('iframe');
				iframe.id = `proc-${pid}`;
				iframe.name = pid;
				iframe.sandbox = "allow-scripts allow-forms allow-modals allow-popups allow-same-origin";

				if (type === 'app') {
					iframe.className = "absolute inset-0 w-full h-full border-none bg-app transition-opacity duration-300";
					iframe.style.opacity = '0';
					iframe.style.pointerEvents = 'none';
					iframe.style.zIndex = '1';
					if (this.els.APPS_CONTAINER) {
						this.els.APPS_CONTAINER.appendChild(iframe);
					}
				} else {
					if (this.els.BG_CONTAINER) {
						this.els.BG_CONTAINER.appendChild(iframe);
					}
				}

				this.processes.set(pid, {
					pid,
					path,
					mode,
					type,
					state: type === 'app' ? 'background' : 'running', 
					iframe,
					blobUrls,
					lastActiveTime: Date.now(),
					thumbnailData: null
				});

				// AppのLRUメモリ管理
				if (type === 'app') this._enforceLRU();

				if (entryUrl) {
					await this._loadIframe(iframe, entryUrl);
				} else if (type === 'app') {
					iframe.srcdoc = `<div style="color:#888; padding:20px; font-family:sans-serif;">No ${path} found.</div>`;
				}

				// 表示切り替え
				if (mode === 'foreground') {
					this._focusApp(pid);
					this._updateAddressBar(path);
				}

				console.log(`[ProcessManager] Spawned [${pid}] (Type:${type}, Mode:${mode}) -> ${path}`);

			} catch (e) {
				console.error(`[ProcessManager] Spawn error (${pid}):`, e);
				if (type === 'app' && this.els.APPS_CONTAINER) {
					global.AppUI?.notify(`Failed to launch ${path}`, 'error');
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
		 * 特定のAppプロセスを最前面に引き出し、他のAppを裏に隠す
		 */
		_focusApp(targetPid) {
			const targetProc = this.processes.get(targetPid);
			if (!targetProc || targetProc.type !== 'app') return;

			// 前面にいる別のアプリを探してバックグラウンドに回す
			for (const [pid, proc] of this.processes.entries()) {
				if (proc.type === 'app' && proc.state === 'foreground' && pid !== targetPid) {
					proc.state = 'background';
					proc.iframe.style.opacity = '0';
					proc.iframe.style.pointerEvents = 'none';
					proc.iframe.style.zIndex = '1';
					
					// サムネイル撮影: 新しいアプリのコンパイル＆起動のCPU負荷を避けるため、1秒遅延して実行
					setTimeout(() => {
						// 1秒後にまだバックグラウンドにいる場合のみ撮影
						if (proc.state === 'background') {
							this.captureScreenshot(pid).then(data => {
								proc.thumbnailData = data;
							}).catch(e => {
								console.warn(`[ProcessManager] Failed to capture thumbnail for ${pid}`);
							});
						}
					}, 1000);
				}
			}

			// 対象アプリを前面に
			targetProc.state = 'foreground';
			targetProc.lastActiveTime = Date.now();
			targetProc.iframe.style.opacity = '1';
			targetProc.iframe.style.pointerEvents = 'auto';
			targetProc.iframe.style.zIndex = '10';
		}

		/**
		 * Appプロセスの数が上限を超えた場合、一番古いものを終了させる
		 */
		_enforceLRU() {
			const apps = Array.from(this.processes.values()).filter(p => p.type === 'app');
			if (apps.length > this.MAX_APPS) {
				const bgApps = apps.filter(p => p.state === 'background');
				if (bgApps.length > 0) {
					bgApps.sort((a, b) => a.lastActiveTime - b.lastActiveTime); // 古い順
					const oldest = bgApps[0];
					console.log(`[ProcessManager] LRU limit reached. Killing oldest app: ${oldest.pid}`);
					this.kill(oldest.pid);
				}
			}
		}

		/**
		 * プロセスを終了する
		 */
		kill(pid) {
			if (!this.processes.has(pid)) return false;

			const proc = this.processes.get(pid);

			// メモリ解放
			if (proc.blobUrls) {
				proc.blobUrls.forEach(url => URL.revokeObjectURL(url));
			}

			if (proc.iframe) {
				proc.iframe.remove();
			}

			this.processes.delete(pid);
			
			// イベント発火 (ToolRegistry等のクリーンアップ用)
			if (this.events['process_killed']) {
				this.events['process_killed'](pid);
			}

			// もしForegroundのアプリをKillした場合は、次に新しいアプリを画面に出す
			if (proc.state === 'foreground') {
				const apps = Array.from(this.processes.values()).filter(p => p.type === 'app');
				if (apps.length > 0) {
					apps.sort((a, b) => b.lastActiveTime - a.lastActiveTime);
					this._focusApp(apps[0].pid);
					this._updateAddressBar(apps[0].path);
				} else {
					this._updateAddressBar('');
				}
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
						const msg = IpcMessage.createEvent('host', proc.pid, eventName, payload);
						proc.iframe.contentWindow.postMessage(msg, '*');
					} else {
						proc.iframe.contentWindow.postMessage({ type: 'ITERA_EVENT', event: eventName, payload: payload }, '*');
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
					type: proc.type,
					state: proc.state
				});
			}
			return list;
		}

		/**
		 * スクリーンショットのキャプチャ（App プロセス用）
		 */
		async captureScreenshot(pid) {
			// デフォルト引数は持たせず、省略時は現在のForegroundを探す
			let targetPid = pid;
			if (!targetPid) {
				const fg = Array.from(this.processes.values()).find(p => p.state === 'foreground');
				if (fg) targetPid = fg.pid;
			}

			const proc = this.processes.get(targetPid);
			if (!proc || !proc.iframe || !proc.iframe.contentWindow) {
				throw new Error(`Process ${targetPid} not found or has no iframe.`);
			}

			return new Promise((resolve, reject) => {
				const iframe = proc.iframe;
				const handler = (e) => {
					if (e.data.type === 'SCREENSHOT_RESULT' && e.data.pid === targetPid) {
						window.removeEventListener('message', handler);
						const parts = e.data.data.split(',');
						resolve(parts.length > 1 ? parts[1] : parts[0]);
					} else if (e.data.type === 'SCREENSHOT_ERROR' && e.data.pid === targetPid) {
						window.removeEventListener('message', handler);
						reject(new Error(e.data.message));
					}
				};

				window.addEventListener('message', handler);

				setTimeout(() => {
					window.removeEventListener('message', handler);
					reject(new Error("Screenshot timeout"));
				}, 15000);

				iframe.contentWindow.postMessage({ action: 'CAPTURE' }, '*');
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

				// フリーズ防止
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
					this.els.ADDRESS_BAR.value = `metaos://view/${decodeURI(path)}`;
				} catch (e) {
					this.els.ADDRESS_BAR.value = `metaos://view/${path}`;
				}
			}
		}

		resolveUrl(requestPath, pid) {
			const proc = this.processes.get(pid);
			if (!proc) throw new Error(`Process [${pid}] not found.`);

			const basePath = proc.path.split(/[?#]/)[0];
			const currentDir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/')) : '';

			let absPath = requestPath;
			if (requestPath.startsWith('./') || requestPath.startsWith('../')) {
				absPath = this._resolveRelativePath(currentDir, requestPath);
			} else if (requestPath.startsWith('/')) {
				absPath = requestPath.substring(1); 
			}

			if (!this.vfs.exists(absPath)) {
				throw new Error(`File not found: ${absPath}`);
			}

			const content = this.vfs.readFile(absPath);

			if (content.startsWith('data:')) {
				return content;
			}

			const mimeType = this.compiler._getMimeType(absPath) || 'text/plain';
			const blob = new Blob([content], { type: mimeType });
			const url = URL.createObjectURL(blob);

			if (!proc.blobUrls) proc.blobUrls = [];
			proc.blobUrls.push(url);

			return url;
		}

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