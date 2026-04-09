// src/shell/core/uri_router.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Shell = global.Itera.Shell || {};
    global.Itera.Shell.Core = global.Itera.Shell.Core || {};

    /**
     * Itera OS URI Router
     * Parses custom URIs (e.g., metaos://action/path?query#hash) and dispatches them to registered handlers.
     */
    class UriRouter {
        constructor(defaultScheme = 'view') {
            this.routes = new Map();
            this.defaultScheme = defaultScheme;
        }

        /**
         * URIスキームのアクションハンドラを登録する
         * @param {string} scheme - 例: 'view', 'edit', 'system'
         * @param {Function} handler - (path: string, searchAndHash: string) => void
         */
        register(scheme, handler) {
            if (typeof handler !== 'function') {
                throw new Error(`Handler for scheme '${scheme}' must be a function.`);
            }
            this.routes.set(scheme, handler);
        }

        /**
         * URI文字列を解析し、対応するハンドラを実行する
         * @param {string} uriString - 例: 'metaos://edit/data/notes.md?line=10'
         * @returns {boolean} - ハンドラが正常に実行された場合は true
         */
        dispatch(uriString) {
            if (!uriString || typeof uriString !== 'string') return false;

            const parsed = this._parse(uriString.trim());
            if (!parsed) {
                throw new Error(`Invalid URI format: ${uriString}`);
            }

            const handler = this.routes.get(parsed.scheme);
            if (!handler) {
                throw new Error(`Unknown action scheme: '${parsed.scheme}'`);
            }

            // ハンドラに解決済みのパスと付加情報（クエリ・ハッシュ）を渡して実行
            handler(parsed.path, parsed.searchAndHash);
            return true;
        }

        /**
         * 内部メソッド: URI文字列を安全に分解する
         * URL APIを使用せず、正規表現でカスタムスキームを正確にパースする
         * @param {string} uri
         * @returns {{ scheme: string, path: string, searchAndHash: string } | null}
         */
        _parse(uri) {
            // 1. スキームの省略を許容し、デフォルトスキームを補完する
            // 例: "data/notes.md" -> "metaos://view/data/notes.md"
            let normalizedUri = uri;
            if (!normalizedUri.startsWith('metaos://')) {
                // すでに 'edit/data/...' のようにアクション名から始まっているケースは想定せず、
                // 省略された場合は常にデフォルト(view)として扱う安全なフォールバック
                normalizedUri = `metaos://${this.defaultScheme}/${normalizedUri}`;
            }

            // 2. 正規表現による分解
            // ^metaos:\/\/        : プレフィックス
            // ([^\/]+)            : scheme (アクション名。例: 'view', 'edit')
            // \/?                 : スキーム直後のスラッシュ (省略可能)
            // ([^?#]*)            : path (ファイルパス。空文字も許容)
            // (.*)$               : searchAndHash (クエリパラメータやフラグメント)
            const match = normalizedUri.match(/^metaos:\/\/([^\/]+)\/?([^?#]*)(.*)$/);
            
            if (!match) return null;

            return {
                scheme: match[1],
                // パスはURLエンコードされている可能性があるのでデコードする
                path: decodeURIComponent(match[2] || ""),
                searchAndHash: match[3] || ""
            };
        }
    }

    global.Itera.Shell.Core.UriRouter = UriRouter;

})(window);