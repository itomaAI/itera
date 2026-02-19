// src/ui/components/media_viewer.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.UI = global.Itera.UI || {};
    global.Itera.UI.Components = global.Itera.UI.Components || {};

    const DOM_IDS = {
        OVERLAY: 'media-overlay',
        IMAGE: 'media-image',
        FILENAME: 'media-filename',
        BTN_CLOSE: 'btn-close-media'
    };

    class MediaViewer {
        constructor() {
            this.els = {};
            this.currentObjectUrl = null;
            this._initElements();
            this._bindEvents();
        }

        _initElements() {
            Object.entries(DOM_IDS).forEach(([key, id]) => {
                this.els[key] = document.getElementById(id);
            });
        }

        _bindEvents() {
            if (this.els.BTN_CLOSE) {
                this.els.BTN_CLOSE.onclick = () => this.close();
            }
            if (this.els.OVERLAY) {
                this.els.OVERLAY.onclick = (e) => {
                    if (e.target === this.els.OVERLAY) this.close();
                };
            }
        }

        /**
         * Open media viewer
         * @param {string} path - File path or title
         * @param {string} base64 - Content (raw string or data URI)
         * @param {string} mimeType - Optional mime type
         */
        open(path, base64, mimeType = null) {
            if (this.els.FILENAME) this.els.FILENAME.textContent = path;
            if (!this.els.OVERLAY) return;

            this._closeResource();

            let mime = mimeType;
            if (!mime) {
                const match = base64.match(/^data:(.*?);base64,/);
                if (match) {
                    mime = match[1];
                } else {
                    if (path.toLowerCase().endsWith('.pdf')) mime = 'application/pdf';
                    else mime = this._guessMime(path);
                }
            }

            if (this.els.IMAGE) {
                this.els.IMAGE.classList.add('hidden');
                this.els.IMAGE.src = '';
            }
            this.els.OVERLAY.querySelectorAll('.dynamic-content').forEach(el => el.remove());

            if (mime === 'application/pdf') {
                this._renderPdf(base64, mime);
            } else if (mime.startsWith('image/')) {
                this._renderImage(base64, mime);
            } else {
                this._renderFallback(path, base64, mime);
            }

            this.els.OVERLAY.classList.remove('hidden');
        }

        close() {
            if (this.els.OVERLAY) {
                this.els.OVERLAY.classList.add('hidden');
                this.els.OVERLAY.querySelectorAll('.dynamic-content').forEach(el => el.remove());
            }
            if (this.els.IMAGE) {
                this.els.IMAGE.src = '';
                this.els.IMAGE.classList.add('hidden');
            }
            this._closeResource();
        }

        _closeResource() {
            if (this.currentObjectUrl) {
                URL.revokeObjectURL(this.currentObjectUrl);
                this.currentObjectUrl = null;
            }
        }

        _renderPdf(base64, mime) {
            const blob = this._base64ToBlob(base64, mime);
            this.currentObjectUrl = URL.createObjectURL(blob);
            
            const iframe = document.createElement('iframe');
            iframe.src = this.currentObjectUrl;
            // border-gray-700 -> border-border-main
            // bg-white -> bg-card (テーマ追従させるが、PDFの中身はブラウザ依存)
            iframe.className = "dynamic-content w-[90%] h-[80%] rounded shadow-lg border border-border-main bg-card";
            this.els.OVERLAY.appendChild(iframe);
        }

        _renderImage(base64, mime) {
            let src = base64;
            if (!base64.startsWith('data:')) {
                src = `data:${mime};base64,${base64}`;
            }
            if (this.els.IMAGE) {
                this.els.IMAGE.src = src;
                this.els.IMAGE.classList.remove('hidden');
            }
        }

        _renderFallback(path, base64, mime) {
            const div = document.createElement('div');
            // bg-gray-800 -> bg-card
            // border-gray-600 -> border-border-main
            div.className = "dynamic-content bg-card p-8 rounded-lg border border-border-main flex flex-col items-center text-center shadow-xl";
            
            // text-gray-200 -> text-text-main
            // text-gray-400 -> text-text-muted
            div.innerHTML = `
                <div class="text-4xl mb-4">📦</div>
                <div class="text-lg font-bold text-text-main mb-2">Preview Not Available</div>
                <div class="text-sm text-text-muted mb-6 font-mono">${mime || 'Unknown Type'}</div>
            `;
            
            const btn = document.createElement('button');
            // bg-blue-600 -> bg-primary
            // hover:bg-blue-500 -> hover:bg-primary/80
            btn.className = "bg-primary hover:bg-primary/80 text-white px-4 py-2 rounded text-sm transition flex items-center gap-2";
            btn.innerHTML = "Download File";
            btn.onclick = () => {
                const link = document.createElement('a');
                const rawBase64 = base64.replace(/^data:.*?;base64,/, '');
                link.href = `data:${mime || 'application/octet-stream'};base64,${rawBase64}`;
                link.download = path.split('/').pop();
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
            
            div.appendChild(btn);
            this.els.OVERLAY.appendChild(div);
        }

        _guessMime(path) {
            if (path.endsWith('.svg')) return 'image/svg+xml';
            if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
            if (path.endsWith('.gif')) return 'image/gif';
            if (path.endsWith('.webp')) return 'image/webp';
            if (path.endsWith('.png')) return 'image/png';
            return '';
        }

        _base64ToBlob(base64, mimeType) {
            const raw = base64.replace(/^data:.*?;base64,/, '');
            const byteCharacters = atob(raw);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
        }
    }

    global.Itera.UI.Components.MediaViewer = MediaViewer;

})(window);