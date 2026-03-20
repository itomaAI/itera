// src/ui/components/chat_panel.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Shell = global.Itera.Shell || {};
	global.Itera.Shell.Windowing = global.Itera.Shell.Windowing || {};

	const DOM_IDS = {
		HISTORY: 'chat-history',
		INPUT: 'chat-input',
		BTN_SEND: 'btn-send',
		BTN_STOP: 'btn-stop',
		BTN_CLEAR: 'btn-clear-chat',
		PREVIEW_AREA: 'file-preview-area',
		FILE_UPLOAD: 'chat-file-upload',
		AI_TYPING: 'ai-typing',
		RESIZER: 'chat-resizer',
		PANEL: 'chat-panel',
		RESIZE_OVERLAY: 'resize-overlay',
		PREVIEW_FRAME: 'preview-frame'
	};

	class ChatPanel {
		constructor(renderer) {
			this.renderer = renderer;
			this.vfs = null; // ★ Added: VFS reference
			this.els = {};
			this.events = {};
			this.pendingUploads = [];
			this.currentStreamEl = null;
			this.currentStreamContent = "";
			this.isProcessing = false;

			this._initElements();
			this._bindEvents();
			this._initResizer();
		}

		// ★ Added: Method to inject VFS
		setVfs(vfs) {
			this.vfs = vfs;
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
			const handleSend = () => {
				// 思考中・ツール実行中であっても横槍（割り込み）を許可するためガードを削除
				const text = this.els.INPUT ? this.els.INPUT.value.trim() : "";
				if (!text && this.pendingUploads.length === 0) return;
				if (this.events['send']) this.events['send'](text, [...this.pendingUploads]);
				if (this.els.INPUT) this.els.INPUT.value = '';
				this._clearUploads();
			};
			if (this.els.BTN_SEND) this.els.BTN_SEND.onclick = handleSend;
			if (this.els.INPUT) {
				this.els.INPUT.onkeydown = (e) => {
					if (e.ctrlKey && e.key === 'Enter') handleSend();
				};
				this.els.INPUT.addEventListener('paste', (e) => this._handlePaste(e));
				const dropZone = this.els.INPUT.parentElement;
				if (dropZone) {
					dropZone.addEventListener('dragover', (e) => {
						e.preventDefault();
						dropZone.classList.add('ring-2', 'ring-primary');
					});
					dropZone.addEventListener('dragleave', (e) => {
						e.preventDefault();
						dropZone.classList.remove('ring-2', 'ring-primary');
					});
					dropZone.addEventListener('drop', (e) => {
						e.preventDefault();
						dropZone.classList.remove('ring-2', 'ring-primary');
						if (e.dataTransfer.files.length > 0) this._addUploads(e.dataTransfer.files);
					});
				}
			}
			if (this.els.BTN_STOP) this.els.BTN_STOP.onclick = () => {
				if (this.events['stop']) this.events['stop']();
			};
			if (this.els.BTN_CLEAR) this.els.BTN_CLEAR.onclick = () => {
				if (this.events['clear']) this.events['clear']();
			};
			if (this.els.FILE_UPLOAD) {
				this.els.FILE_UPLOAD.onchange = (e) => {
					this._addUploads(e.target.files);
					e.target.value = "";
				};
			}
		}

		_initResizer() {
			const resizer = this.els.RESIZER;
			const panel = this.els.PANEL;
			const overlay = this.els.RESIZE_OVERLAY;
			const iframe = this.els.PREVIEW_FRAME;
			if (!resizer || !panel) return;
			let isResizing = false;
			const start = (e) => {
				isResizing = true;
				document.body.style.cursor = 'col-resize';
				resizer.classList.add('resizing');
				if (overlay) overlay.classList.remove('hidden');
				if (iframe) iframe.style.pointerEvents = 'none';
				e.preventDefault();
			};
			const stop = () => {
				if (!isResizing) return;
				isResizing = false;
				document.body.style.cursor = '';
				resizer.classList.remove('resizing');
				if (overlay) overlay.classList.add('hidden');
				if (iframe) iframe.style.pointerEvents = '';
			};
			const move = (e) => {
				if (!isResizing) return;
				const w = document.body.clientWidth - e.clientX;
				if (w > 300 && w < 800) {
					panel.style.width = `${w}px`;
				}
				e.preventDefault();
			};
			resizer.addEventListener('mousedown', start);
			document.addEventListener('mousemove', move);
			document.addEventListener('mouseup', stop);
			window.addEventListener('blur', stop);
		}

		_handlePaste(e) {
			const items = (e.clipboardData || window.clipboardData).items;
			const files = [];
			for (let i = 0; i < items.length; i++) {
				if (items[i].kind === 'file') files.push(items[i].getAsFile());
			}
			if (files.length > 0) this._addUploads(files);
		}

		_addUploads(files) {
			Array.from(files).forEach(f => this.pendingUploads.push(f));
			this._renderUploadPreviews();
		}

		_clearUploads() {
			this.pendingUploads = [];
			this._renderUploadPreviews();
		}

		_renderUploadPreviews() {
			const area = this.els.PREVIEW_AREA;
			if (!area) return;
			area.innerHTML = "";
			if (this.pendingUploads.length === 0) {
				area.classList.add('hidden');
				return;
			}
			area.classList.remove('hidden');
			this.pendingUploads.forEach((file, index) => {
				const div = document.createElement('div');
				div.className = "bg-card border border-border-main rounded pl-2 pr-1 py-1 text-xs flex items-center gap-2 text-text-muted select-none";
				div.innerHTML = `<span class="truncate max-w-[150px]" title="${file.name}">📎 ${file.name}</span><button class="text-text-muted hover:text-error w-5 h-5 flex items-center justify-center">×</button>`;
				div.querySelector('button').onclick = () => {
					this.pendingUploads.splice(index, 1);
					this._renderUploadPreviews();
				};
				area.appendChild(div);
			});
		}

		setProcessing(processing) {
			this.isProcessing = processing;
			// 送信ボタンは常に表示し、横槍を許可する
			// if (this.els.BTN_SEND) this.els.BTN_SEND.classList.toggle('hidden', processing);

			if (this.els.BTN_STOP) this.els.BTN_STOP.classList.toggle('hidden', !processing);
			if (this.els.AI_TYPING) {
				this.els.AI_TYPING.classList.toggle('hidden', !processing);
				// ツール実行中か思考中かを区別できればベストだが、一旦は共有
				if (processing) {
					this.els.AI_TYPING.innerHTML = `<span class="animate-pulse">●</span> Processing...`;
				}
			}
			// 入力欄のロックを解除
			if (this.els.INPUT && !processing) {
				this.els.INPUT.focus();
			}
		}

		startStreaming() {
			if (this.currentStreamEl && this.currentStreamEl.parentElement) {
				this.currentStreamEl.parentElement.remove();
			}
			this.currentStreamContent = "";
			this.currentStreamEl = null;

			this._createStreamElement();
			this._scrollToBottom(true);
		}

		_createStreamElement() {
			if (!this.els.HISTORY) return;
			const div = document.createElement('div');
			div.className = "relative group p-3 rounded-lg text-sm mb-2 border border-border-main bg-card text-text-main mr-4 transition";
			div.innerHTML = `
                <div class="flex justify-between items-center mb-1 opacity-50 text-[10px] font-bold uppercase">MODEL (Generating...)</div>
                <div class="msg-content whitespace-pre-wrap break-all font-mono">${this.currentStreamContent}</div>
            `;
			this.els.HISTORY.appendChild(div);
			this.currentStreamEl = div.querySelector('.msg-content');

			if (this.currentStreamContent && this.renderer) {
				this.currentStreamEl.innerHTML = this.renderer.formatStream(this.currentStreamContent);
				this.currentStreamEl.classList.remove('whitespace-pre-wrap');
			}
		}

		updateStreaming(chunk) {
			if (!this.currentStreamEl) return;
			this.currentStreamContent += chunk;

			if (this.renderer && this.renderer.formatStream) {
				this.currentStreamEl.innerHTML = this.renderer.formatStream(this.currentStreamContent);
				this.currentStreamEl.classList.remove('whitespace-pre-wrap');
			} else {
				this.currentStreamEl.textContent = this.currentStreamContent;
			}
			this._scrollToBottom();
		}

		finalizeStreaming() {
			if (this.currentStreamEl) {
				const header = this.currentStreamEl.parentElement.querySelector('div:first-child');
				if (header) header.textContent = 'MODEL';
			}
			this.currentStreamEl = null;
			this.currentStreamContent = "";
			this._scrollToBottom(true);
		}

		appendTurn(turn) {
			if (!turn) return;
			this._appendTurn(turn);
			this._scrollToBottom(true);
		}

		renderHistory(history) {
			if (!this.els.HISTORY) return;
			this.els.HISTORY.innerHTML = '';

			history.forEach(turn => this._appendTurn(turn));

			// 全再描画時にストリーミング状態を無理に末尾に復元すると横槍の順序が壊れるため、
			// 復元処理は一旦削除し、ストリーミング中の全再描画（履歴クリア時など）はリセット扱いとする
			if (this.isProcessing && this.currentStreamContent !== "") {
				// 意図的な履歴操作が起きた場合はストリーム表示を追従しない
			}

			this._scrollToBottom(true);
		}

		_scrollToBottom(force = false) {
			const el = this.els.HISTORY;
			if (!el) return;
			const threshold = 100;
			const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + threshold;
			if (force || isAtBottom) {
				el.scrollTop = el.scrollHeight;
			}
		}

		_appendTurn(turn) {
			if (turn.meta && turn.meta.visible === false) return;

			let div = document.getElementById(`turn-${turn.id}`);
			let isUpdate = !!div;

			if (!div) {
				div = document.createElement('div');
				div.id = `turn-${turn.id}`;
			} else {
				div.innerHTML = ''; // Updateの場合は中身を一度クリアして再構築する
			}

			const role = turn.role;
			let baseClass = "relative group p-3 rounded-lg text-sm mb-2 border transition";

			if (role === 'user') {
				div.className = `${baseClass} bg-primary/10 text-text-main border-primary/20 ml-4`;
			} else if (role === 'model') {
				div.className = `${baseClass} bg-card text-text-main border-border-main mr-4`;
			} else {
				div.className = `${baseClass} bg-panel text-text-muted text-xs mx-8 font-mono border-border-main`;
			}

			const header = document.createElement('div');
			header.className = "flex justify-between items-center mb-1 opacity-50 text-[10px] font-bold uppercase";
			header.textContent = role;
			div.appendChild(header);

			const btnDelete = document.createElement('button');
			btnDelete.className = "absolute top-2 right-2 text-text-muted hover:text-error opacity-100 md:opacity-0 group-hover:opacity-100 p-1 transition";
			btnDelete.innerHTML = "×";
			btnDelete.onclick = (e) => {
				e.stopPropagation();
				if (confirm("Delete this message?")) {
					if (this.events['delete_turn']) this.events['delete_turn'](turn.id);
				}
			};
			div.appendChild(btnDelete);

			const body = document.createElement('div');
			body.className = "break-all";

			if (typeof turn.content === 'string') {
				if (role === 'model' || (role === 'system' && turn.content.includes('<'))) {
					if (this.renderer) body.innerHTML = this.renderer.formatStream(turn.content);
					else body.textContent = turn.content;
				} else {
					body.className += " whitespace-pre-wrap";
					body.textContent = turn.content;
				}
			} else if (Array.isArray(turn.content)) {
				this._renderArrayContent(body, turn.content, role);
			}

			div.appendChild(body);

			if (!isUpdate) {
				this.els.HISTORY.appendChild(div);
			}
		}

		_renderArrayContent(container, contentArray, role) {
			contentArray.forEach(item => {
				if (item.text) {
					const div = document.createElement('div');
					if ((role === 'model' || item.text.trim().startsWith('<')) && this.renderer) {
						div.innerHTML = this.renderer.formatStream(item.text);
					} else {
						div.className = "whitespace-pre-wrap";
						div.textContent = item.text;
					}
					container.appendChild(div);
				}
				// ★ Tool Execution Log/UI
				else if (item.output) {
					const div = document.createElement('div');
					div.className = "mb-1 whitespace-pre-wrap";
					const uiText = item.output.ui || item.output.log || "";
					if (item.output.ui) {
						const span = document.createElement('span');
						// ブロック要素(<pre>)を内包可能にするため block クラスを追加
						span.className = "text-system font-bold block";
						span.innerHTML = this._formatSystemMessage(uiText);
						div.appendChild(span);
					} else {
						div.innerHTML = this._formatSystemMessage(uiText);
					}
					container.appendChild(div);

					// DOM追加後にMathJaxで数式をレンダリング
					if (window.MathJax) {
						MathJax.typesetPromise([div]).catch(e => console.warn("MathJax Error:", e));
					}

					// DOM追加後にHighlight.jsでコードをハイライト
					if (window.hljs) {
						div.querySelectorAll('pre code').forEach((block) => {
							hljs.highlightElement(block);
						});
					}

					// Handle Tool Output Images
					if (item.output.media) {
						this._renderMediaFromVfs(container, item.output.media);
					} else if (item.output.image) {
						// Legacy support
						this._appendMedia(container, item.output.image, item.output.mimeType);
					}
				}
				// ★ User Input Media (New)
				else if (item.media) {
					this._renderMediaFromVfs(container, item.media);
				}
				// ★ User Input Inline (Legacy)
				else if (item.inlineData) {
					this._appendMedia(container, item.inlineData.data, item.inlineData.mimeType);
				}
			});
		}

		/**
		 * VFSからメディアを読み込んで表示する
		 * @param {HTMLElement} container 
		 * @param {Object} mediaObj - { path, mimeType, ... }
		 */
		_renderMediaFromVfs(container, mediaObj) {
			if (!this.vfs) {
				// VFSがまだセットされていない場合はプレースホルダー
				const div = document.createElement('div');
				div.className = "text-xs text-text-muted italic border border-border-main p-2 rounded mt-2";
				div.textContent = `[Loading media: ${mediaObj.path}]`;
				container.appendChild(div);
				return;
			}

			try {
				if (this.vfs.exists(mediaObj.path)) {
					// readFileは DataURL (data:...) を返すと仮定
					const content = this.vfs.readFile(mediaObj.path);
					this._appendMedia(container, content, mediaObj.mimeType);
				} else {
					// ファイルが存在しない場合 (削除された等)
					const div = document.createElement('div');
					div.className = "flex items-center gap-2 text-xs text-text-muted bg-error/10 border border-error/20 p-2 rounded mt-2";
					div.innerHTML = `<span class="text-error">⚠️</span> <span class="line-through opacity-70">${mediaObj.path}</span> <span class="text-[10px] ml-auto">(File not found)</span>`;
					div.title = "This file was deleted or the cache was cleared.";
					container.appendChild(div);
				}
			} catch (e) {
				console.error("Failed to render media from VFS:", e);
				const div = document.createElement('div');
				div.className = "text-xs text-error p-2";
				div.textContent = `Error loading image: ${e.message}`;
				container.appendChild(div);
			}
		}

		_formatSystemMessage(text) {
			if (!text) return "";
			// 1. HTMLエスケープ (XSS対策)
			let safeText = text.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');

			// 2. コードブロック (```) の置換
			safeText = safeText.replace(/```(?:([a-zA-Z0-9_]+)\n)?([\s\S]*?)```/g, (match, lang, code) => {
				const langClass = lang ? `language-${lang}` : 'language-plaintext';
				return `<pre class="bg-card border border-border-main p-2 rounded mt-1 mb-1 overflow-x-auto text-text-main font-mono text-[10px] leading-relaxed font-normal"><code class="${langClass}">${code}</code></pre>`;
			});

			// 3. インラインコード (`) の置換
			safeText = safeText.replace(/`([^`]+)`/g, (match, code) => {
				return `<code class="bg-app text-primary px-1 rounded font-mono text-[11px] font-normal">${code}</code>`;
			});

			return safeText;
		}

		_appendMedia(container, base64, mimeType) {
			let mime = mimeType || 'image/png';
			if (!mimeType && base64.startsWith('data:')) mime = base64.split(';')[0].split(':')[1];

			if (mime.startsWith('image/')) {
				const img = document.createElement('img');
				const src = base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`;
				img.src = src;
				img.className = "h-24 rounded border border-border-main cursor-pointer hover:opacity-80 bg-app mt-2 object-contain";
				img.onclick = () => {
					if (this.events['preview_request']) this.events['preview_request']('Image Preview', src, mime);
				};
				container.appendChild(img);
			} else {
				const div = document.createElement('div');
				div.className = "flex items-center gap-3 p-3 mt-2 rounded border border-border-main bg-card max-w-xs hover:bg-hover transition select-none cursor-pointer";
				div.innerHTML = `<div class="text-2xl">📄</div><div class="flex flex-col overflow-hidden"><span class="text-xs text-text-main font-bold font-mono uppercase truncate">${mime}</span><span class="text-[10px] text-text-muted truncate">BINARY DATA</span></div>`;
				div.onclick = () => {
					if (this.events['preview_request']) {
						const src = base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`;
						this.events['preview_request']('Attachment', src, mime);
					}
				};
				container.appendChild(div);
			}
		}
	}

	global.Itera.Shell.Panels.ChatPanel = ChatPanel;

})(window);