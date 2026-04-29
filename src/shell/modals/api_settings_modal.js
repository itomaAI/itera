// src/shell/modals/api_settings_modal.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Shell = global.Itera.Shell || {};
    global.Itera.Shell.Modals = global.Itera.Shell.Modals || {};

    const DOM_IDS = {
        MODAL: 'api-settings-modal',
        CONTAINER: 'api-settings-container',
        BTN_OPEN: 'btn-open-api-modal',
        BTN_CLOSE: 'btn-close-api-modal',
        BTN_CANCEL: 'btn-cancel-api-modal',
        BTN_SAVE: 'btn-save-api-modal'
    };

    class ApiSettingsModal {
        constructor() {
            this.els = {};
            this.events = {};
            this.providers = (global.Itera.Config && global.Itera.Config.PROVIDERS) ? global.Itera.Config.PROVIDERS : [];

            this._initElements();
            this._migrateLegacyKey();
            this._renderForm();
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

        /**
         * 古い `itera_api_key` が存在し、新しいシークレットがない場合、
         * google のキーとしてマイグレーションする
         */
        _migrateLegacyKey() {
            const legacyKey = localStorage.getItem('itera_api_key');
            let secrets = {};
            try {
                secrets = JSON.parse(localStorage.getItem('itera_llm_secrets') || '{}');
            } catch(e) {}

            if (legacyKey && !secrets['google']) {
                secrets['google'] = legacyKey;
                localStorage.setItem('itera_llm_secrets', JSON.stringify(secrets));
            }
        }

        /**
         * constants.js の定義に従い、フォームを動的に生成する
         */
        _renderForm() {
            if (!this.els.CONTAINER) return;
            this.els.CONTAINER.innerHTML = '';

            this.providers.forEach(provider => {
                const wrapper = document.createElement('div');
                wrapper.className = "flex flex-col gap-1.5 p-3 rounded-lg bg-card/50 border border-border-main/50";

                const label = document.createElement('label');
                label.className = "block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1";
                label.textContent = provider.name;
                wrapper.appendChild(label);

                // URL 入力欄 (requiresUrl が true のプロバイダのみ)
                if (provider.requiresUrl) {
                    const urlInput = document.createElement('input');
                    urlInput.type = "text";
                    urlInput.id = `api-url-${provider.id}`;
                    urlInput.placeholder = provider.urlPlaceholder || "";
                    urlInput.className = "w-full bg-app border border-border-main rounded-md p-2 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-text-main text-xs font-mono transition shadow-inner mb-2";
                    wrapper.appendChild(urlInput);
                }

                // API Key 入力欄
                const keyInput = document.createElement('input');
                keyInput.type = "password";
                keyInput.id = `api-key-${provider.id}`;
                keyInput.placeholder = provider.placeholder || "";
                keyInput.className = "w-full bg-app border border-border-main rounded-md p-2 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none text-text-main text-xs font-mono transition shadow-inner";
                
                wrapper.appendChild(keyInput);
                this.els.CONTAINER.appendChild(wrapper);
            });
        }

        /**
         * localStorage から値を読み込み、フォームにセットする
         */
        _loadValues() {
            let secrets = {};
            try {
                secrets = JSON.parse(localStorage.getItem('itera_llm_secrets') || '{}');
            } catch(e) {}

            this.providers.forEach(provider => {
                const keyInput = document.getElementById(`api-key-${provider.id}`);
                if (keyInput) {
                    keyInput.value = secrets[provider.id] || "";
                }
                
                if (provider.requiresUrl) {
                    const urlInput = document.getElementById(`api-url-${provider.id}`);
                    if (urlInput) {
                        urlInput.value = secrets[`${provider.id}_url`] || "";
                    }
                }
            });
        }

        /**
         * フォームの値を localStorage に保存し、イベントを発火する
         */
        _saveValues() {
            let secrets = {};
            this.providers.forEach(provider => {
                const keyInput = document.getElementById(`api-key-${provider.id}`);
                if (keyInput) {
                    secrets[provider.id] = keyInput.value.trim();
                }
                
                if (provider.requiresUrl) {
                    const urlInput = document.getElementById(`api-url-${provider.id}`);
                    if (urlInput) {
                        secrets[`${provider.id}_url`] = urlInput.value.trim();
                    }
                }
            });

            localStorage.setItem('itera_llm_secrets', JSON.stringify(secrets));

            // ShellController へ更新を通知
            if (this.events['secrets_updated']) {
                this.events['secrets_updated'](secrets);
            }
        }

        open() {
            if (this.els.MODAL) {
                this._loadValues();
                this.els.MODAL.classList.remove('hidden');
            }
        }

        close() {
            if (this.els.MODAL) {
                this.els.MODAL.classList.add('hidden');
            }
        }

        _bindEvents() {
            if (this.els.BTN_OPEN) {
                this.els.BTN_OPEN.onclick = () => this.open();
            }
            if (this.els.BTN_CLOSE) {
                this.els.BTN_CLOSE.onclick = () => this.close();
            }
            if (this.els.BTN_CANCEL) {
                this.els.BTN_CANCEL.onclick = () => this.close();
            }
            if (this.els.BTN_SAVE) {
                this.els.BTN_SAVE.onclick = () => {
                    this._saveValues();
                    this.close();
                };
            }
        }
    }

    global.Itera.Shell.Modals.ApiSettingsModal = ApiSettingsModal;

})(window);