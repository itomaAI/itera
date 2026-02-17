// src/ui/components/preview_pane.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.UI = global.Itera.UI || {};
    global.Itera.UI.Components = global.Itera.UI.Components || {};

    const DOM_IDS = {
        FRAME: 'preview-frame',
        LOADER: 'preview-loader',
        BTN_REFRESH: 'btn-refresh',
        ADDRESS_BAR: 'preview-address-bar' // 仮: HTML側に対応する要素があれば
    };

    // スクリーンショット撮影用の注入スクリプト
    const SCREENSHOT_HELPER_CODE = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js"></script>
<script>
window.addEventListener('message', async (e) => {
    if (e.data.action === 'CAPTURE') {
        try {
            // ライブラリロード待ち
            let attempts = 0;
            while (typeof htmlToImage === 'undefined' && attempts < 20) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }
            if (typeof htmlToImage === 'undefined') throw new Error('html-to-image failed to load');
            
            // 撮影実行 (フォント読み込み待ちなどで少しバッファを持たせる設定)
            const data = await htmlToImage.toPng(document.body, { 
                backgroundColor: null, 
                skipOnError: true, 
                preferredFontFormat: 'woff2',
                filter: (node) => {
                    // 自分自身のiframeを含まないようにする等のフィルタ
                    if (node.tagName === 'IMG' && (!node.src || node.src === '' || node.src === window.location.href)) return false;
                    return true;
                }
            });
            parent.postMessage({ type: 'SCREENSHOT_RESULT', data }, '*');
        } catch (err) {
            parent.postMessage({ type: 'SCREENSHOT_ERROR', message: String(err) }, '*');
        }
    }
});
</script>
`;

    class PreviewPane {
        constructor() {
            this.els = {};
            this.blobUrls = []; // メモリリーク防止用
            this._initElements();
            this._bindEvents();
        }

        _initElements() {
            Object.entries(DOM_IDS).forEach(([key, id]) => {
                this.els[key] = document.getElementById(id);
            });
        }

        _bindEvents() {
            if (this.els.BTN_REFRESH) {
                // MainController から refresh が呼ばれるはずだが、ボタン単体でも動くように
                // ただし VFS インスタンスを持っていないため、イベントを発火する形にするか、
                // あるいは MainController で bind されるのを待つ。
                // ここでは「クリックされたら発火」だけ定義し、Controller側で購読する設計とする。
                this.els.BTN_REFRESH.onclick = () => {
                    // Simple callback hook pattern handled by controller usually,
                    // but for self-containment, we leave it empty or emit custom event.
                    // 今回はMainControllerがこのクラスのrefreshメソッドを直接呼ぶ想定。
                };
            }
        }

        /**
         * プレビューを更新する (Compiler Logic)
         * @param {VirtualFileSystem} vfs 
         * @param {string} entryPath (default: index.html)
         */
        async refresh(vfs, entryPath = 'index.html') {
            if (!this.els.FRAME) return;

            // 1. Show Loader
            if (this.els.LOADER) this.els.LOADER.classList.remove('hidden');

            try {
                // 2. Compile VFS to Blob URL
                const url = await this._compile(vfs, entryPath);
                
                // 3. Update Iframe
                if (url) {
                    await this._loadIframe(url);
                    this._updateAddressBar(entryPath);
                } else {
                    this.els.FRAME.srcdoc = `<div style="color:#888; padding:20px; font-family:sans-serif;">No ${entryPath} found.</div>`;
                }

            } catch (e) {
                console.error("Preview Compile Error:", e);
                this.els.FRAME.srcdoc = `<div style="color:red; padding:20px;">Preview Error: ${e.message}</div>`;
            } finally {
                // 4. Hide Loader
                // 少し遅延させるとチラつきが減る
                setTimeout(() => {
                    if (this.els.LOADER) this.els.LOADER.classList.add('hidden');
                }, 200);
            }
        }

        async _loadIframe(url) {
            return new Promise((resolve) => {
                const handler = () => {
                    this.els.FRAME.removeEventListener('load', handler);
                    resolve();
                };
                this.els.FRAME.addEventListener('load', handler);
                this.els.FRAME.src = url;
            });
        }

        _updateAddressBar(path) {
            // アドレスバーっぽい見た目の更新 (metaos://view/...)
            // DOM要素があれば更新する
            const bar = document.querySelector('.address-bar-text') || document.getElementById('address-bar'); // 仮
            if (bar) {
                bar.textContent = `metaos://view/${path}`;
            }
        }

        // --- Screenshot Logic ---

        captureScreenshot() {
            return new Promise((resolve, reject) => {
                const iframe = this.els.FRAME;
                if (!iframe || !iframe.contentWindow) return reject(new Error("No preview frame"));

                const handler = (e) => {
                    if (e.data.type === 'SCREENSHOT_RESULT') {
                        window.removeEventListener('message', handler);
                        // "data:image/png;base64,..." 形式
                        const parts = e.data.data.split(',');
                        resolve(parts.length > 1 ? parts[1] : parts[0]);
                    } else if (e.data.type === 'SCREENSHOT_ERROR') {
                        window.removeEventListener('message', handler);
                        reject(new Error(e.data.message));
                    }
                };

                window.addEventListener('message', handler);

                // Timeout 15s
                setTimeout(() => {
                    window.removeEventListener('message', handler);
                    reject(new Error("Screenshot timeout"));
                }, 15000);

                iframe.contentWindow.postMessage({ action: 'CAPTURE' }, '*');
            });
        }

        // --- Core Compiler Logic ---

        async _compile(vfs, entryPath) {
            this._revokeAll(); // 古いURLを破棄

            const filePaths = vfs.listFiles({ recursive: true });
            const urlMap = {};

            // A. Create Blobs for Assets (non-HTML)
            for (const path of filePaths) {
                if (path.endsWith('.html')) continue;
                if (path.startsWith('.sample/') || path.startsWith('src/')) continue; // 除外ディレクトリ

                const content = vfs.readFile(path);
                const mimeType = this._getMimeType(path);
                let blob;

                // Base64 Data URI -> Blob
                if (mimeType.startsWith('image/') && content.startsWith('data:')) {
                    const res = await fetch(content);
                    blob = await res.blob();
                } else {
                    blob = new Blob([content], { type: mimeType });
                }

                const url = URL.createObjectURL(blob);
                urlMap[path] = url;
                this.blobUrls.push(url);
            }

            let entryPointUrl = null;

            // B. Process HTML Files (Inject Scripts & Replace Paths)
            for (const path of filePaths) {
                if (!path.endsWith('.html')) continue;
                if (path.startsWith('.sample/') || path.startsWith('src/')) continue;

                let htmlContent = vfs.readFile(path);
                
                // 1. Resolve Relative Paths
                htmlContent = this._processHtmlReferences(htmlContent, urlMap, path);
                
                // 2. Inject MetaOS Bridge (Guest Code)
                // Phase 3-1 で定義した global.Itera.Bridge.GuestCode を使用
                if (global.Itera.Bridge && global.Itera.Bridge.GuestCode) {
                    const bridgeScript = `<script>${global.Itera.Bridge.GuestCode}</script>`;
                    htmlContent = htmlContent.replace('<head>', '<head>' + bridgeScript);
                }

                // 3. Inject Screenshot Helper
                htmlContent = htmlContent.replace('</body>', SCREENSHOT_HELPER_CODE + '</body>');

                const blob = new Blob([htmlContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);

                urlMap[path] = url;
                this.blobUrls.push(url);

                if (path === entryPath) {
                    entryPointUrl = url;
                }
            }

            // Fallback if entry not found
            if (!entryPointUrl) {
                if (urlMap['index.html']) return urlMap['index.html'];
                // Find first html
                const firstHtml = Object.keys(urlMap).find(p => p.endsWith('.html'));
                if (firstHtml) return urlMap[firstHtml];
            }

            return entryPointUrl;
        }

        _processHtmlReferences(html, urlMap, currentFilePath) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const currentDir = currentFilePath.includes('/') ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) : '';

            // Path Resolver Helper
            const resolvePath = (relPath) => {
                if (relPath.startsWith('/')) return relPath.substring(1); // Absolute in VFS
                if (relPath.match(/^https?:\/\//) || relPath.startsWith('data:')) return null; // External/DataURI

                // Resolve relative ".." and "."
                const stack = currentDir ? currentDir.split('/') : [];
                const parts = relPath.split('/');
                for (const part of parts) {
                    if (part === '.') continue;
                    if (part === '..') {
                        if (stack.length > 0) stack.pop();
                    } else {
                        stack.push(part);
                    }
                }
                return stack.join('/');
            };

            // Replace attributes
            const replaceAttr = (selector, attr) => {
                doc.querySelectorAll(selector).forEach(el => {
                    const val = el.getAttribute(attr);
                    if (!val) return;
                    
                    // Direct match?
                    if (urlMap[val]) {
                        el.setAttribute(attr, urlMap[val]);
                        return;
                    }

                    // Resolved match?
                    const resolved = resolvePath(val);
                    if (resolved && urlMap[resolved]) {
                        el.setAttribute(attr, urlMap[resolved]);
                    }
                });
            };

            replaceAttr('script[src]', 'src');
            replaceAttr('link[href]', 'href');
            replaceAttr('img[src]', 'src');
            replaceAttr('a[href]', 'href');
            replaceAttr('iframe[src]', 'src');

            return doc.documentElement.outerHTML;
        }

        _getMimeType(filename) {
            if (filename.endsWith('.js')) return 'application/javascript';
            if (filename.endsWith('.css')) return 'text/css';
            if (filename.endsWith('.json')) return 'application/json';
            if (filename.endsWith('.svg')) return 'image/svg+xml';
            if (filename.endsWith('.png')) return 'image/png';
            if (filename.endsWith('.jpg')) return 'image/jpeg';
            if (filename.endsWith('.html')) return 'text/html';
            return 'text/plain';
        }

        _revokeAll() {
            this.blobUrls.forEach(url => URL.revokeObjectURL(url));
            this.blobUrls = [];
        }
    }

    global.Itera.UI.Components.PreviewPane = PreviewPane;

})(window);