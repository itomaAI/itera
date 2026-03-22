// src/api/guest/legacy_wrapper.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Api = global.Itera.Api || {};

    // ==========================================
    // Guest-Side Injection Code (String Literal)
    // ==========================================
    global.Itera.Api.LegacyWrapperCode = `
    // 既存アプリが依存している旧フラットAPIを、新しい名前空間APIへ中継する
    const LegacyAPI = {
        // --- Process Management ---
        spawn: (path, options = {}) => global.MetaOS.system.spawn(path, options),
        kill: (pid) => global.MetaOS.system.kill(pid),
        broadcast: (eventName, payload) => global.MetaOS.system.broadcast(eventName, payload),
        switchView: (path) => global.MetaOS.system.spawn(path, { pid: 'main', mode: 'foreground', forceReload: false }),

        // --- File System ---
        saveFile: (path, content, options = { silent: true }) => global.MetaOS.fs.write(path, content, options),
        readFile: (path) => global.MetaOS.fs.read(path),
        deleteFile: (path, options = { silent: true }) => global.MetaOS.fs.delete(path, options),
        renameFile: (oldPath, newPath, options = { silent: true }) => global.MetaOS.fs.rename(oldPath, newPath, options),
        stat: (path) => global.MetaOS.fs.stat(path),
        listFiles: (path, options) => global.MetaOS.fs.list(path, options),

        // --- Host Interaction ---
        openFile: (path) => global.MetaOS.host.openEditor(path),
        notify: (message, title) => global.MetaOS.host.notify(message, title),
        copyToClipboard: (text) => global.MetaOS.host.copyText(text),
        openExternal: (url) => global.MetaOS.host.openExternal(url),
        
        // State Synchronization
        pushState: (newQueryOrHash) => {
            // Blob URLでの pushState エラーを回避しつつアドレスバーだけ更新するハック
            try {
                window.history.pushState(null, '', newQueryOrHash);
            } catch(e) {}
            global.MetaOS.host.updateAddressBar(newQueryOrHash);
        },

        // --- AI Interaction ---
        ask: (text, attachments) => global.MetaOS.ai.ask(text, { attachments }),
        agent: (instruction, options) => global.MetaOS.ai.task(instruction, undefined, options),
        addEventLog: (message, type = 'app_event') => global.MetaOS.ai.log(message, type),

        // --- Events ---
        // 既存の MetaOS.on はそのまま system.on に中継
        on: (eventName, callback) => global.MetaOS.system.on(eventName, callback),

        // --- Lifecycle ---
        ready: async () => { return true; }
    };

    // MetaOS オブジェクトのルートにレガシーメソッドを展開する
    Object.assign(global.MetaOS, LegacyAPI);
    `.trim();

})(window);