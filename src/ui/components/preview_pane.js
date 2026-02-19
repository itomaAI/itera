// src/ui/components/preview_pane.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.UI = global.Itera.UI || {};
    global.Itera.UI.Components = global.Itera.UI.Components || {};

    const DOM_IDS = {
        FRAME: 'preview-frame',
        LOADER: 'preview-loader',
        BTN_HOME: 'btn-home',
        BTN_REFRESH: 'btn-refresh',
        ADDRESS_BAR: 'preview-address-bar'
    };

    // スクリーンショット撮影用の注入スクリプト
    const SCREENSHOT_HELPER_CODE = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js"></script>
<script>
window.addEventListener('message', async (e) => {
    if (e.data.action === 'CAPTURE') {
        try {
            let attempts = 0;
            while (typeof htmlToImage === 'undefined' && attempts < 20) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }
            if (typeof htmlToImage === 'undefined') throw new Error('html-to-image failed to load');
            
            const data = await htmlToImage.toPng(document.body, { 
                backgroundColor: null, 
                skipOnError: true, 
                preferredFontFormat: 'woff2',
                filter: (node) => {
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
            this.events = {}; 
            this.blobUrls = []; 
            this.currentPath = 'index.html'; 
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
                    if (this.events['refresh']) this.events['refresh']();
                };
            }
            if (this.els.BTN_HOME) {
                this.els.BTN_HOME.onclick = () => {
                    if (this.events['home']) this.events['home']();
                };
            }
        }
    
        /**
         * プレビューを更新する (Compiler Logic)
         * @param {VirtualFileSystem} vfs 
         * @param {string} entryPath (optional)
         */
        async refresh(vfs, entryPath) {
            if (!this.els.FRAME) return;

            const targetPath = entryPath || this.currentPath;
            this.currentPath = targetPath;

            if (this.els.LOADER) this.els.LOADER.classList.remove('hidden');

            try {
                const url = await this._compile(vfs, targetPath);
                
                if (url) {
                    await this._loadIframe(url);
                    this._updateAddressBar(targetPath);
                } else {
                    this.els.FRAME.srcdoc = `<div style="color:#888; padding:20px; font-family:sans-serif;">No ${targetPath} found.</div>`;
                }

            } catch (e) {
                console.error("Preview Compile Error:", e);
                this.els.FRAME.srcdoc = `<div style="color:red; padding:20px;">Preview Error: ${e.message}</div>`;
            } finally {
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
            if (this.els.ADDRESS_BAR) {
                this.els.ADDRESS_BAR.textContent = `metaos://view/${path}`;
            }
        }

        captureScreenshot() {
            return new Promise((resolve, reject) => {
                const iframe = this.els.FRAME;
                if (!iframe || !iframe.contentWindow) return reject(new Error("No preview frame"));

                const handler = (e) => {
                    if (e.data.type === 'SCREENSHOT_RESULT') {
                        window.removeEventListener('message', handler);
                        const parts = e.data.data.split(',');
                        resolve(parts.length > 1 ? parts[1] : parts[0]);
                    } else if (e.data.type === 'SCREENSHOT_ERROR') {
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

        async _compile(vfs, entryPath) {
            this._revokeAll();

            const filePaths = vfs.listFiles({ recursive: true });
            const urlMap = {};

            // 1. Assets (Blob作成)
            for (const path of filePaths) {
                if (path.endsWith('.html')) continue;
                if (path.startsWith('.sample/') || path.startsWith('src/')) continue; 

                const content = vfs.readFile(path);
                const mimeType = this._getMimeType(path);
                let blob;

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

            // ★ テーマ変数の取得
            const themeStyleTag = this._generateThemeInjection();

            // 2. HTML (スクリプト/スタイル注入)
            for (const path of filePaths) {
                if (!path.endsWith('.html')) continue;
                if (path.startsWith('.sample/') || path.startsWith('src/')) continue;

                let htmlContent = vfs.readFile(path);
                
                htmlContent = this._processHtmlReferences(htmlContent, urlMap, path);
                
                if (global.Itera.Bridge && global.Itera.Bridge.GuestCode) {
                    const bridgeScript = `<script>${global.Itera.Bridge.GuestCode}</script>`;
                    htmlContent = htmlContent.replace('<head>', '<head>' + bridgeScript);
                }

                // ★ テーマスタイルの注入 (headの末尾に追加して優先度を上げる)
                if (htmlContent.includes('</head>')) {
                    htmlContent = htmlContent.replace('</head>', themeStyleTag + '\n</head>');
                } else {
                    htmlContent = themeStyleTag + htmlContent;
                }

                htmlContent = htmlContent.replace('</body>', SCREENSHOT_HELPER_CODE + '</body>');

                const blob = new Blob([htmlContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);

                urlMap[path] = url;
                this.blobUrls.push(url);

                if (path === entryPath) {
                    entryPointUrl = url;
                }
            }

            if (!entryPointUrl) {
                if (urlMap['index.html']) return urlMap['index.html'];
                const firstHtml = Object.keys(urlMap).find(p => p.endsWith('.html'));
                if (firstHtml) return urlMap[firstHtml];
            }

            return entryPointUrl;
        }

        // ホストのCSS変数を読み取り、ゲスト用の<style>タグを生成
        _generateThemeInjection() {
            const root = document.documentElement;
            const styles = getComputedStyle(root);
            const vars = [
                '--c-bg-app', '--c-bg-panel', '--c-bg-card', '--c-bg-hover', '--c-bg-overlay',
                '--c-border-main', '--c-border-highlight',
                '--c-text-main', '--c-text-muted', '--c-text-inverted', 
                '--c-text-system', '--c-text-tag-attr', '--c-text-tag-content',
                '--c-accent-primary', '--c-accent-success', '--c-accent-warning', '--c-accent-error',
                '--c-tag-thinking', '--c-tag-plan', '--c-tag-report', '--c-tag-error'
            ];
            
            let css = ':root {\n';
            vars.forEach(v => {
                const val = styles.getPropertyValue(v).trim();
                // 値が取得できた場合のみ出力
                if (val) css += `  ${v}: ${val};\n`;
            });
            css += '}';
            
            return `<style id="itera-guest-theme">${css}</style>`;
        }

        _processHtmlReferences(html, urlMap, currentFilePath) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const currentDir = currentFilePath.includes('/') ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) : '';

            const resolvePath = (relPath) => {
                if (relPath.startsWith('/')) return relPath.substring(1); 
                if (relPath.match(/^https?:\/\//) || relPath.startsWith('data:')) return null; 

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

            const replaceAttr = (selector, attr) => {
                doc.querySelectorAll(selector).forEach(el => {
                    const val = el.getAttribute(attr);
                    if (!val) return;
                    if (urlMap[val]) {
                        el.setAttribute(attr, urlMap[val]);
                        return;
                    }
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