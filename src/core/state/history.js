// src/core/state/history.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.State = global.Itera.State || {};

    // 定数定義 (Types.js がまだなのでここで仮定義、後で定数ファイルに移行してもよい)
    const ROLE = {
        USER: 'user',
        MODEL: 'model',
        SYSTEM: 'system'
    };

    class HistoryManager {
        constructor() {
            this.turns = [];
        }

        /**
         * 履歴全体を置き換える（ロード時など）
         * @param {Array} historyData 
         */
        load(historyData) {
            if (Array.isArray(historyData)) {
                this.turns = historyData;
            } else {
                this.turns = [];
            }
        }

        /**
         * 新しいターンを追加する
         * @param {string} role - 'user' | 'model' | 'system'
         * @param {string|Array|Object} content - メッセージ内容
         * @param {Object} meta - 追加情報 (type, visible, timestamp...)
         * @returns {Object} 作成されたターンオブジェクト
         */
        append(role, content, meta = {}) {
            const turn = {
                id: crypto.randomUUID(), // ブラウザ標準API
                timestamp: Date.now(),
                role: role,
                content: content,
                meta: {
                    type: 'message', // default
                    visible: true,   // default
                    ...meta
                }
            };
            this.turns.push(turn);
            return turn;
        }

        /**
         * 特定のターンを削除する（ID指定）
         */
        delete(id) {
            this.turns = this.turns.filter(t => t.id !== id);
        }

        /**
         * 履歴をクリアする
         */
        clear() {
            this.turns = [];
        }

        /**
         * 全履歴を取得する
         * @returns {Array}
         */
        get() {
            return this.turns;
        }

        /**
         * LLMコンテキスト用に最適化された履歴を取得する
         * (例: 画像データの除外や、古いログの圧縮などを行う場合のフック)
         */
        getContext() {
            // 現状はそのまま返す。必要に応じてフィルタリングロジックを追加。
            return this.turns;
        }

        /**
         * 直近のターンを取得
         */
        getLast() {
            return this.turns.length > 0 ? this.turns[this.turns.length - 1] : null;
        }
    }

    global.Itera.State.HistoryManager = HistoryManager;
    
    // 定数をグローバルに公開（便利なので）
    global.Itera.Role = ROLE;

})(window);