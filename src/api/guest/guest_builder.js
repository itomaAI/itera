// src/api/guest/guest_builder.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Api = global.Itera.Api || {};

    class GuestBuilder {
        static getBlobUrl() {
            // 生成済みのBlob URLがあればキャッシュを返す（メモリ効率化）
            if (this._cachedUrl) return this._cachedUrl;

            const Ipc = global.Itera.Ipc || {};
            const Api = global.Itera.Api || {};

            const bundleCode = `
(function(global) {
    // ==========================================
    // 1. IPC Infrastructure
    // ==========================================
    ${Ipc.GuestMessageCode || ''}
    ${Ipc.GuestRpcCode || ''}
    ${Ipc.GuestTransportCode || ''}

    // ==========================================
    // 2. Transport Initialization
    // ==========================================
    // ProcessManager が iframe.name に設定したプロセスIDを取得
    const MY_PID = window.name || 'unknown';
    const transport = new GuestTransport(MY_PID);

    // ==========================================
    // 3. MetaOS API Definition
    // ==========================================
    ${Api.MetaOSCoreCode || ''}

    // ==========================================
    // 4. Legacy Wrapper (Backward Compatibility)
    // ==========================================
    ${Api.LegacyWrapperCode || ''}

    console.log("[Itera] MetaOS Guest API Initialized (PID: " + MY_PID + ")");
})(window);
            `.trim();

            const blob = new Blob([bundleCode], { type: 'application/javascript' });
            this._cachedUrl = URL.createObjectURL(blob);
            
            return this._cachedUrl;
        }
    }

    global.Itera.Api.GuestBuilder = GuestBuilder;

})(window);