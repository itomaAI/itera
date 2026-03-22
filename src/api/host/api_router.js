// src/api/host/api_router.js

(function(global) {
    global.Itera = global.Itera || {};
    global.Itera.Api = global.Itera.Api || {};

    class ApiRouter {
        constructor(transport, deps) {
            this.transport = transport;
            // deps: { vfs, history, engine, processManager, shell, toolRegistry }
            this.deps = deps; 
            this._registerHandlers();
        }

        /**
         * オプションを評価し、必要であればHistoryにイベントログを落とすヘルパー
         */
        _checkAndEmitEvent(options, type, desc) {
            if (options && options.silent === false) {
                const lpml = `<event type="${type}">\n${desc}\n</event>`;
                const turn = this.deps.history.append(global.Itera.Role.SYSTEM, lpml, {
                    type: 'event_log',
                    trigger_llm: false
                });
                this.deps.shell.panels.chat.appendTurn(turn);
            }
        }

        _registerHandlers() {
            const t = this.transport;
            const d = this.deps;

            // ==========================================
            // 1. File System (fs)
            // ==========================================
            t.registerHandler('fs:read', async ({ path }) => d.vfs.readFile(path));
            
            t.registerHandler('fs:write', async ({ path, content, opts }) => {
                const res = d.vfs.writeFile(path, content);
                this._checkAndEmitEvent(opts, 'file_edited', `User App edited file: ${path}`);
                return res;
            });
            
            t.registerHandler('fs:append', async ({ path, content, opts }) => {
                const res = d.vfs.editLines(path, NaN, NaN, 'append', content);
                this._checkAndEmitEvent(opts, 'file_edited', `User App appended to file: ${path}`);
                return res;
            });
            
            t.registerHandler('fs:delete', async ({ path, opts }) => {
                const res = d.vfs.deleteFile(path);
                this._checkAndEmitEvent(opts, 'file_deleted', `User App deleted file: ${path}`);
                return res;
            });
            
            t.registerHandler('fs:rename', async ({ oldPath, newPath, opts }) => {
                const res = d.vfs.rename(oldPath, newPath);
                this._checkAndEmitEvent(opts, 'file_moved', `User App renamed file: ${oldPath} -> ${newPath}`);
                return res;
            });
            
            t.registerHandler('fs:copy', async ({ srcPath, destPath, opts }) => {
                const res = d.vfs.copyFile(srcPath, destPath);
                this._checkAndEmitEvent(opts, 'file_copied', `User App copied file: ${srcPath} -> ${destPath}`);
                return res;
            });
            
            t.registerHandler('fs:mkdir', async ({ path, opts }) => {
                const res = d.vfs.createDirectory(path);
                this._checkAndEmitEvent(opts, 'folder_created', `User App created folder: ${path}`);
                return res;
            });
            
            t.registerHandler('fs:stat', async ({ path }) => d.vfs.stat(path));
            t.registerHandler('fs:list', async ({ path, opts }) => d.vfs.listFiles({ path, ...opts }));
            t.registerHandler('fs:exists', async ({ path }) => d.vfs.exists(path));

            // ==========================================
            // 2. AI & History (ai)
            // ==========================================
            t.registerHandler('ai:ask', async ({ text, opts }) => {
                // 添付ファイルパスの配列を、エンジンに投下可能なmediaオブジェクトへ変換
                const attachments = (opts && opts.attachments) ? opts.attachments.map(p => {
                    const mime = p.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? 'image/png' : 'application/octet-stream';
                    return { media: { path: p, mimeType: mime, metadata: {} } };
                }) : [];
                
                let content =[];
                if (attachments.length > 0) {
                    content.push(...attachments);
                    attachments.forEach(a => {
                        content.push({ text: `<user_attachment path="${a.media.path}">[Attachment]</user_attachment>` });
                    });
                }
                if (text) content.push({ text });

                d.shell._refreshEngineConfig();
                d.shell.panels.chat.setProcessing(true);
                await d.engine.injectUserTurn(content);
                return true;
            });
            
            t.registerHandler('ai:task', async ({ instruction, context, opts }) => {
                let text = `[INTERNAL AGENT TRIGGER]\n${instruction}`;
                if (context) text += `\n\nContext: ${JSON.stringify(context)}`;
                
                d.shell._refreshEngineConfig();
                if (!opts?.silent) d.shell.panels.chat.setProcessing(true);
                await d.engine.injectUserTurn([{ text }], { visible: !opts?.silent });
                return true;
            });
            
            t.registerHandler('ai:log', async ({ message, type }) => {
                const lpml = `<event type="${type || 'app_event'}">\n${message}\n</event>`;
                const turn = d.history.append(global.Itera.Role.SYSTEM, lpml, {
                    type: 'event_log',
                    trigger_llm: false
                });
                d.shell.panels.chat.appendTurn(turn);
                return true;
            });
            
            t.registerHandler('ai:stop', async () => {
                d.engine.stop();
                return true;
            });

            // ==========================================
            // 3. System & Process (sys)
            // ==========================================
            t.registerHandler('sys:spawn', async ({ path, opts }) => {
                const pid = opts?.pid || 'main';
                const mode = opts?.mode || (pid === 'main' ? 'foreground' : 'background');
                const force = opts?.forceReload || false;
                await d.processManager.spawn(pid, path, mode, force);
                if (mode === 'foreground') d.shell._closeMobileDrawers();
                return true;
            });
            
            t.registerHandler('sys:kill', async ({ pid }) => {
                return d.processManager.kill(pid);
            });
            
            t.registerHandler('sys:ps', async () => {
                return d.processManager.list();
            });
            
            t.registerHandler('sys:info', async (_, sourcePid) => {
                const p = d.processManager.processes.get(sourcePid);
                return p ? { pid: p.pid, path: p.path, mode: p.mode } : null;
            });
            
            t.registerHandler('sys:broadcast', async ({ eventName, payload }) => {
                d.processManager.broadcast(eventName, payload);
                return true;
            });
            
            t.registerHandler('sys:capture', async ({ pid }) => {
                return await d.processManager.captureScreenshot(pid);
            });

            // ==========================================
            // 4. Host UI & Native (host)
            // ==========================================
            t.registerHandler('host:open_editor', async ({ path }) => {
                const content = d.vfs.readFile(path);
                d.shell.modals.editor.open(path, content);
                d.shell._closeMobileDrawers();
                return true;
            });
            
            t.registerHandler('host:notify', async ({ message, title }) => {
                console.log(`[Notification] ${title}: ${message}`);
                return true;
            });
            
            t.registerHandler('host:copy', async ({ text }) => {
                try {
                    await navigator.clipboard.writeText(text);
                    return true;
                } catch (e) {
                    throw new Error("Clipboard write failed: " + e.message);
                }
            });
            
            t.registerHandler('host:open_url', async ({ url }) => {
                window.open(url, '_blank', 'noopener,noreferrer');
                return true;
            });
            
            t.registerHandler('host:address_bar', async ({ path }) => {
                const proc = d.processManager.processes.get('main');
                if (proc) {
                    const currentBase = proc.path.split(/[?#]/)[0];
                    const newPath = currentBase + path;
                    proc.path = newPath;
                    if (d.processManager._updateAddressBar) {
                        d.processManager._updateAddressBar(newPath);
                    }
                }
                return true;
            });

            // ==========================================
            // 5. Dynamic Tools (tools)
            // ==========================================
            t.registerHandler('tools:register', async (payload, sourcePid) => {
                if (d.toolRegistry.registerDynamicTool) {
                    d.toolRegistry.registerDynamicTool(payload.name, sourcePid, payload);
                } else {
                    console.log(`[ApiRouter] tools:register called for ${payload.name} from ${sourcePid}, but toolRegistry is not upgraded yet.`);
                }
                return true;
            });

            t.registerHandler('tools:unregister', async ({ name }, sourcePid) => {
                if (d.toolRegistry.unregisterDynamicTool) {
                    d.toolRegistry.unregisterDynamicTool(name, sourcePid);
                }
                return true;
            });
        }
    }

    global.Itera.Api.ApiRouter = ApiRouter;

})(window);