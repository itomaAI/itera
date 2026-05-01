// src/core/sync/sync_engine.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Sync = global.Itera.Sync || {};

    class SyncEngine {
        /**
         * ローカルの状態とリモートのインデックスを比較し、同期計画（Diff）を生成する。
         * プレースホルダ（オンデマンド同期）は使用せず、全ファイルをダウンロード（またはアップロード）する方針。
         * 
         * @param {Object} localFiles - VFSの内部状態 (vfs.files 相当)。構造: { "path": { content: "...", meta: { updated_at: number } } }
         * @param {Object} remoteIndex - クラウド上のインデックス。構造: { version: 1, files: { "path": { remote_id, updated_at, size, hash } } }
         * @returns {Object} { downloadQueue, uploadQueue, deleteRemoteQueue, deleteLocalQueue, newIndexData }
         */
        static computeDiff(localFiles, remoteIndex) {
            const downloadQueue = [];      // { path, remote_id }
            const uploadQueue = [];        // { path, content, remote_id }
            const deleteRemoteQueue = [];  // { remote_id }
            const deleteLocalQueue = [];   // { path }

            // 次回保存用の新しいインデックスのベース（ここに変更をマージしていく）
            const newIndexData = {
                version: 1,
                last_synced_at: Date.now(),
                files: {}
            };

            const remoteFiles = remoteIndex ? (remoteIndex.files || {}) : {};
            const localPaths = Object.keys(localFiles).filter(p => !p.startsWith('.trash/') && !p.startsWith('system/cache/')); // 同期対象外を除外

            // 1. リモートインデックスベースの走査 (Download または Local Delete の判定)
            for (const [path, remoteMeta] of Object.entries(remoteFiles)) {
                const localFile = localFiles[path];

                if (!localFile) {
                    // ケース 1-A: リモートにあって、ローカルにない
                    // 以前は存在したがローカルで削除された（＝リモートも消すべき）か、
                    // 他端末で作成された（＝ダウンロードすべき）かを判別する必要がある。
                    // 
                    // [判定方法]
                    // ローカルVFSが持つ「ゴミ箱(.trash)」の履歴等を見るのが厳密だが、
                    // 今回はシンプル化のため、「リモートにあってローカルにないものは、他端末で作られたものとみなしダウンロードする」という基本方針をとる。
                    // （※ローカルでの削除は、即座にリモートも消す仕様に寄せた方が競合が少ない）
                    downloadQueue.push({
                        path: path,
                        remote_id: remoteMeta.remote_id,
                        updated_at: remoteMeta.updated_at
                    });
                    
                    // ダウンロード後にインデックスにそのまま載せるため、データを引き継ぐ
                    newIndexData.files[path] = remoteMeta;
                } else {
                    // ケース 1-B: 両方に存在する
                    const localTime = localFile.meta.updated_at || 0;
                    const remoteTime = remoteMeta.updated_at || 0;
                    const timeDiff = localTime - remoteTime;

                    // 1秒(1000ms)程度の誤差は同一とみなす（ファイルシステムと通信の誤差吸収）
                    if (Math.abs(timeDiff) <= 2000) {
                        // 一致。何もしない。インデックスをそのまま引き継ぐ。
                        newIndexData.files[path] = remoteMeta;
                    } else if (timeDiff > 2000) {
                        // ローカルの方が新しい。Uploadキューへ。
                        uploadQueue.push({
                            path: path,
                            content: localFile.content,
                            remote_id: remoteMeta.remote_id
                        });
                        // ※ newIndexData は Upload完了後に SyncManager 側で上書き更新する
                    } else {
                        // リモートの方が新しい。Downloadキューへ。
                        downloadQueue.push({
                            path: path,
                            remote_id: remoteMeta.remote_id,
                            updated_at: remoteMeta.updated_at
                        });
                        newIndexData.files[path] = remoteMeta;
                    }
                }
            }

            // 2. ローカルベースの走査 (Upload の判定)
            for (const path of localPaths) {
                if (!remoteFiles[path]) {
                    // ケース 2-A: ローカルにしか存在しない（新規作成されたファイル）
                    const localFile = localFiles[path];
                    
                    // これからアップロードするので、インデックス上のリモートIDはまだnull
                    uploadQueue.push({
                        path: path,
                        content: localFile.content,
                        remote_id: null 
                    });
                }
            }

            // --- 削除ロジックの補足 ---
            // 現在のItera VFS仕様では、ファイルを削除すると `.trash/` 以下に移動します。
            // `.trash/` を同期対象外とすることで、ローカルでファイルが削除された場合、
            // そのファイルは `localPaths` に出現しなくなります。
            // 
            // 厳密に他端末へ「削除」を伝播させるには、
            // 「ローカルで .trash/ に移動したファイルのオリジナルパス」とインデックスを比較して
            // deleteRemoteQueue に積む処理が必要ですが、
            // 今回はシンプル化のため、「同期フォルダ（リモートのインデックス）」を絶対的正とみなし、
            // 「ローカルで消したファイルでも、リモートに残っていれば復活（再ダウンロード）する」
            // という保守的（絶対にデータを失わない）なアプローチを採用しています。

            return {
                downloadQueue,
                uploadQueue,
                deleteRemoteQueue,
                deleteLocalQueue,
                newIndexData
            };
        }
    }

    global.Itera.Sync.SyncEngine = SyncEngine;

})(window);