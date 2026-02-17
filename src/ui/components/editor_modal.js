// src/ui/components/editor_modal.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.UI = global.Itera.UI || {};
    global.Itera.UI.Components = global.Itera.UI.Components || {};

    const DOM_IDS = {
        OVERLAY: 'editor-overlay',
        CONTAINER: 'code-editor',
        FILENAME: 'editor-filename',
        BTN_CLOSE: 'btn-close-editor',
        BTN_SAVE: 'btn-save-editor'
    };

    class EditorModal {
        constructor() {
            this.els = {};
            this.events = {};
            this.currentPath = null;
            this.editorInstance = null;
            this.isMonacoLoaded = false;
            this.currentTheme = 'vs-dark'; // Default

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
            if (this.els.BTN_CLOSE) {
                this.els.BTN_CLOSE.onclick = () => this.close();
            }
            if (this.els.BTN_SAVE) {
                this.els.BTN_SAVE.onclick = () => this._save();
            }
            // Note: Keydown events are handled by Monaco itself once loaded
        }

        /**
         * エディタを開く
         * @param {string} path 
         * @param {string} content 
         */
        open(path, content) {
            // Binary Guard
            if (path.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|zip|mp3|mp4)$/i)) {
                alert("Binary file editing is not supported.");
                return;
            }

            this.currentPath = path;
            if (this.els.FILENAME) this.els.FILENAME.textContent = path;
            if (this.els.OVERLAY) this.els.OVERLAY.classList.remove('hidden');

            if (!this.isMonacoLoaded) {
                this._initMonaco(() => this._setValue(path, content));
            } else {
                this._setValue(path, content);
            }
        }

        close() {
            if (this.els.OVERLAY) this.els.OVERLAY.classList.add('hidden');
            this.currentPath = null;
            // フォーカスを外す（ショートカット暴発防止）
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        }

        /**
         * テーマを変更する (ThemeManagerから呼ばれる)
         * @param {string} theme 'dark' | 'light'
         */
        setTheme(theme) {
            this.currentTheme = (theme === 'dark') ? 'vs-dark' : 'vs';
            if (this.editorInstance && window.monaco) {
                window.monaco.editor.setTheme(this.currentTheme);
            }
        }

        _initMonaco(callback) {
            if (typeof require === 'undefined') {
                console.error("Monaco loader (require.js) not found.");
                return;
            }

            require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});

            require(['vs/editor/editor.main'], () => {
                this.isMonacoLoaded = true;
                if (!this.els.CONTAINER) return;

                this.editorInstance = monaco.editor.create(this.els.CONTAINER, {
                    value: '',
                    language: 'plaintext',
                    theme: this.currentTheme,
                    automaticLayout: true,
                    minimap: { enabled: true },
                    fontSize: 14,
                    scrollBeyondLastLine: false,
                    padding: { top: 10, bottom: 10 }
                });

                // Bind Ctrl+S / Cmd+S
                this.editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                    this._save();
                });

                if (callback) callback();
            });
        }

        _setValue(path, content) {
            if (!this.editorInstance) return;

            // 言語判定
            const ext = path.split('.').pop().toLowerCase();
            const langMap = {
                'js': 'javascript', 'html': 'html', 'css': 'css', 'json': 'json',
                'md': 'markdown', 'py': 'python', 'ts': 'typescript',
                'xml': 'xml', 'yaml': 'yaml', 'yml': 'yaml', 'sql': 'sql', 'sh': 'shell'
            };
            const lang = langMap[ext] || 'plaintext';

            const model = this.editorInstance.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, lang);
                this.editorInstance.setValue(content);
            }
            
            // コンテナが表示された直後にレイアウト崩れを防ぐ
            setTimeout(() => {
                this.editorInstance.layout();
                this.editorInstance.focus();
            }, 50);
        }

        _save() {
            if (!this.currentPath || !this.editorInstance) return;
            
            const content = this.editorInstance.getValue();
            
            if (this.events['save']) {
                this.events['save'](this.currentPath, content);
            }

            // Visual Feedback
            if (this.els.BTN_SAVE) {
                const originalText = this.els.BTN_SAVE.textContent;
                this.els.BTN_SAVE.textContent = "Saved!";
                this.els.BTN_SAVE.classList.remove('bg-blue-700');
                this.els.BTN_SAVE.classList.add('bg-green-600');
                
                setTimeout(() => {
                    this.els.BTN_SAVE.textContent = originalText;
                    this.els.BTN_SAVE.classList.remove('bg-green-600');
                    this.els.BTN_SAVE.classList.add('bg-blue-700');
                }, 1000);
            }
        }
    }

    global.Itera.UI.Components.EditorModal = EditorModal;

})(window);