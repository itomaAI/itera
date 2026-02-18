// src/ui/components/chat_panel.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.UI = global.Itera.UI || {};
	global.Itera.UI.Components = global.Itera.UI.Components || {};

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
		constructor(translator) {
			this.translator = translator;
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
				if (this.isProcessing) return;
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
						dropZone.classList.add('ring-2', 'ring-blue-500');
					});
					dropZone.addEventListener('dragleave', (e) => {
						e.preventDefault();
						dropZone.classList.remove('ring-2', 'ring-blue-500');
					});
					dropZone.addEventListener('drop', (e) => {
						e.preventDefault();
						dropZone.classList.remove('ring-2', 'ring-blue-500');
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
				div.className = "bg-gray-800 border border-gray-600 rounded pl-2 pr-1 py-1 text-xs flex items-center gap-2 text-gray-300 select-none";
				div.innerHTML = `<span class="truncate max-w-[150px]" title="${file.name}">📎 ${file.name}</span><button class="text-gray-500 hover:text-red-400 w-5 h-5 flex items-center justify-center">×</button>`;
				div.querySelector('button').onclick = () => {
					this.pendingUploads.splice(index, 1);
					this._renderUploadPreviews();
				};
				area.appendChild(div);
			});
		}

		setProcessing(processing) {
			this.isProcessing = processing;
			if (this.els.BTN_SEND) this.els.BTN_SEND.classList.toggle('hidden', processing);
			if (this.els.BTN_STOP) this.els.BTN_STOP.classList.toggle('hidden', !processing);
			if (this.els.AI_TYPING) this.els.AI_TYPING.classList.toggle('hidden', !processing);
			if (this.els.INPUT) {
				this.els.INPUT.disabled = processing;
				if (!processing) this.els.INPUT.focus();
			}
		}

		startStreaming() {
			// ★ Bugfix: クリーンアップ処理を追加
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
			div.className = "relative group p-3 rounded-lg text-sm mb-2 border border-transparent bg-gray-700 text-gray-200 mr-4 transition";
			div.innerHTML = `
                <div class="flex justify-between items-center mb-1 opacity-50 text-[10px] font-bold uppercase">MODEL (Generating...)</div>
                <div class="msg-content whitespace-pre-wrap break-all font-mono">${this.currentStreamContent}</div>
            `;
			this.els.HISTORY.appendChild(div);
			this.currentStreamEl = div.querySelector('.msg-content');

			if (this.currentStreamContent && this.translator) {
				this.currentStreamEl.innerHTML = this.translator.formatStream(this.currentStreamContent);
				this.currentStreamEl.classList.remove('whitespace-pre-wrap');
			}
		}

		updateStreaming(chunk) {
			if (!this.currentStreamEl) return;
			this.currentStreamContent += chunk;

			if (this.translator && this.translator.formatStream) {
				this.currentStreamEl.innerHTML = this.translator.formatStream(this.currentStreamContent);
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

		// ★ New Method: 単一ターンを追加 (renderHistoryによる全書き換え回避用)
		appendTurn(turn) {
			if (!turn) return;
			this._appendTurn(turn);
			this._scrollToBottom(true);
		}

		renderHistory(history) {
			if (!this.els.HISTORY) return;
			this.els.HISTORY.innerHTML = '';

			history.forEach(turn => this._appendTurn(turn));

			// ストリーミング中なら復元
			if (this.isProcessing && this.currentStreamContent !== "") {
				this._createStreamElement();
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

			const div = document.createElement('div');
			const role = turn.role;
			let baseClass = "relative group p-3 rounded-lg text-sm mb-2 border border-transparent transition";

			if (role === 'user') {
				div.className = `${baseClass} bg-blue-900 text-blue-100 ml-4`;
			} else if (role === 'model') {
				div.className = `${baseClass} bg-gray-700 text-gray-200 mr-4`;
			} else {
				div.className = `${baseClass} bg-gray-800 text-gray-400 text-xs mx-8 font-mono border-gray-600`;
			}

			const header = document.createElement('div');
			header.className = "flex justify-between items-center mb-1 opacity-50 text-[10px] font-bold uppercase";
			header.textContent = role;
			div.appendChild(header);

			const btnDelete = document.createElement('button');
			btnDelete.className = "absolute top-2 right-2 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 p-1 transition";
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
					if (this.translator) body.innerHTML = this.translator.formatStream(turn.content);
					else body.textContent = turn.content;
				} else {
					body.className += " whitespace-pre-wrap";
					body.textContent = turn.content;
				}
			} else if (Array.isArray(turn.content)) {
				this._renderArrayContent(body, turn.content, role);
			}

			div.appendChild(body);
			this.els.HISTORY.appendChild(div);
		}

		_renderArrayContent(container, contentArray, role) {
			contentArray.forEach(item => {
				if (item.text) {
					const div = document.createElement('div');
					if ((role === 'model' || item.text.trim().startsWith('<')) && this.translator) {
						div.innerHTML = this.translator.formatStream(item.text);
					} else {
						div.className = "whitespace-pre-wrap";
						div.textContent = item.text;
					}
					container.appendChild(div);
				} else if (item.output) {
					const div = document.createElement('div');
                    // --- ★ Modified: Add whitespace-pre-wrap ---
					div.className = "mb-1 whitespace-pre-wrap";
                    // ------------------------------------------
					const uiText = item.output.ui || item.output.log || "";
					if (item.output.ui) {
						const span = document.createElement('span');
						span.className = "text-blue-300 font-bold";
						span.textContent = uiText; // Use textContent for safety
						div.appendChild(span);
					} else {
						div.textContent = uiText;
					}
					container.appendChild(div);
					if (item.output.image) this._appendMedia(container, item.output.image, item.output.mimeType);
				} else if (item.inlineData) {
					this._appendMedia(container, item.inlineData.data, item.inlineData.mimeType);
				}
			});
		}

		_appendMedia(container, base64, mimeType) {
			let mime = mimeType || 'image/png';
			if (!mimeType && base64.startsWith('data:')) mime = base64.split(';')[0].split(':')[1];

			if (mime.startsWith('image/')) {
				const img = document.createElement('img');
				const src = base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`;
				img.src = src;
				img.className = "h-24 rounded border border-gray-600 cursor-pointer hover:opacity-80 bg-gray-900 mt-2 object-contain";
				img.onclick = () => {
					if (this.events['preview_request']) this.events['preview_request']('Image Preview', src, mime);
				};
				container.appendChild(img);
			} else {
				const div = document.createElement('div');
				div.className = "flex items-center gap-3 p-3 mt-2 rounded border border-gray-600 bg-gray-800 max-w-xs hover:bg-gray-700 transition select-none cursor-pointer";
				div.innerHTML = `<div class="text-2xl">📄</div><div class="flex flex-col overflow-hidden"><span class="text-xs text-gray-300 font-bold font-mono uppercase truncate">${mime}</span><span class="text-[10px] text-gray-500 truncate">BINARY DATA</span></div>`;
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

	global.Itera.UI.Components.ChatPanel = ChatPanel;

})(window);