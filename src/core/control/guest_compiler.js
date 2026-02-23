// src/core/control/guest_compiler.js

(function(global) {
	global.Itera = global.Itera || {};
	global.Itera.Control = global.Itera.Control || {};

	class GuestCompiler {
		constructor() {}

		_getScreenshotHelperCode(pid) {
			return `
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
            parent.postMessage({ type: 'SCREENSHOT_RESULT', pid: '${pid}', data }, '*');
        } catch (err) {
            parent.postMessage({ type: 'SCREENSHOT_ERROR', pid: '${pid}', message: String(err) }, '*');
        }
    }
});
</script>
`;
		}

		/**
		 * VFS の内容をコンパイルし、実行可能な Blob URL を生成する
		 * @param {VirtualFileSystem} vfs
		 * @param {string} entryPath - 起動する HTML ファイルのパス
		 * @param {string} pid - プロセスID
		 * @returns {Promise<{ entryUrl: string, blobUrls: string[] }>}
		 */
		async compile(vfs, entryPath, pid = 'main') {
			const filePaths = vfs.listFiles({
				recursive: true
			});
			const urlMap = {};
			const blobUrls = [];

			// 1. Assets (HTML以外) の Blob 作成
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
					blob = new Blob([content], {
						type: mimeType
					});
				}

				const url = URL.createObjectURL(blob);
				urlMap[path] = url;
				blobUrls.push(url);
			}

			let entryPointUrl = null;

			// テーマ変数の取得
			const themeStyleTag = this._generateThemeInjection();

			// 2. HTML (スクリプト/スタイル注入) の Blob 作成
			for (const path of filePaths) {
				if (!path.endsWith('.html')) continue;
				if (path.startsWith('.sample/') || path.startsWith('src/')) continue;

				let htmlContent = vfs.readFile(path);

				htmlContent = this._processHtmlReferences(htmlContent, urlMap, path);

				// 1. DOCTYPEの保証
				if (!/<!DOCTYPE\s+html>/i.test(htmlContent)) {
					htmlContent = "<!DOCTYPE html>\n" + htmlContent;
				}

				// 2. Bridgeの注入
				if (global.Itera.Bridge && global.Itera.Bridge.GuestCode) {
					const bridgeScript = `<script>${global.Itera.Bridge.GuestCode}</script>\n`;
					if (htmlContent.includes('<head>')) {
						htmlContent = htmlContent.replace('<head>', '<head>\n' + bridgeScript);
					} else {
						htmlContent = htmlContent.replace(/(<!DOCTYPE\s+html>)/i, `$1\n${bridgeScript}`);
					}
				}

				// 3. テーマスタイルの注入
				if (htmlContent.includes('</head>')) {
					htmlContent = htmlContent.replace('</head>', themeStyleTag + '\n</head>');
				} else {
					htmlContent = htmlContent.replace(/(<!DOCTYPE\s+html>)/i, `$1\n${themeStyleTag}`);
				}

				// 4. スクリーンショットヘルパーの注入 (mainプロセスのみ)
				if (pid === 'main') {
					htmlContent = htmlContent.replace('</body>', this._getScreenshotHelperCode(pid) + '</body>');
				}

				const blob = new Blob([htmlContent], {
					type: 'text/html'
				});
				const url = URL.createObjectURL(blob);

				urlMap[path] = url;
				blobUrls.push(url);

				if (path === entryPath) {
					entryPointUrl = url;
				}
			}

			// 指定されたパスが見つからない場合のフォールバック
			if (!entryPointUrl) {
				if (urlMap['index.html']) {
					entryPointUrl = urlMap['index.html'];
				} else {
					const firstHtml = Object.keys(urlMap).find(p => p.endsWith('.html'));
					if (firstHtml) entryPointUrl = urlMap[firstHtml];
				}
			}

			return {
				entryUrl: entryPointUrl,
				blobUrls
			};
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
			if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
			if (filename.endsWith('.html')) return 'text/html';
			return 'text/plain';
		}
	}

	global.Itera.Control.GuestCompiler = GuestCompiler;

})(window);