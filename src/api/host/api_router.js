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
            // 5. Network (net)
            // ==========================================
            const prepareFetchOptions = (url, options) => {
                let targetUrl = url;
                const fetchOpts = {
                    method: options?.method || 'GET',
                    headers: options?.headers || {}
                };

                if (options?.body) {
                    fetchOpts.body = typeof options.body === 'object' ? JSON.stringify(options.body) : options.body;
                }

                // クレデンシャル（APIキー等）の安全な注入
                if (options?.credentialId) {
                    if (options.useProxy) {
                        throw new Error("[Net API] Security Error: Cannot use public proxy with credentials.");
                    }
                    if (d.configManager) {
                        const config = d.configManager.get();
                        const creds = config.credentials || {};
                        const cred = creds[options.credentialId];
                        
                        if (!cred) {
                            throw new Error(`[Net API] Credential ID '${options.credentialId}' not found in config.json. Use MetaOS.net.oauth() to configure it.`);
                        }
                        
                        if (cred.type === 'query') {
                            const separator = targetUrl.includes('?') ? '&' : '?';
                            targetUrl += `${separator}${encodeURIComponent(cred.key)}=${encodeURIComponent(cred.value)}`;
                        } else if (cred.type === 'header') {
                            fetchOpts.headers[cred.key] = cred.value;
                        }
                    }
                }

                // CORS回避プロキシの適用
                if (options?.useProxy) {
                    targetUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
                }

                return { targetUrl, fetchOpts };
            };

            // 5-1. net:fetch (CORS回避 & クレデンシャル注入付き通信)
            t.registerHandler('net:fetch', async ({ url, options }) => {
                const { targetUrl, fetchOpts } = prepareFetchOptions(url, options);

                try {
                    const res = await fetch(targetUrl, fetchOpts);
                    const responseObj = {
                        ok: res.ok,
                        status: res.status,
                        statusText: res.statusText,
                        headers: Object.fromEntries(res.headers.entries()),
                        data: null
                    };

                    const responseType = options?.responseType || 'text';
                    if (responseType === 'json') {
                        responseObj.data = await res.json();
                    } else if (responseType === 'dataURL') {
                        const blob = await res.blob();
                        responseObj.data = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    } else {
                        responseObj.data = await res.text();
                    }

                    return responseObj;
                } catch (e) {
                    throw new Error(`[Net API] Fetch failed: ${e.message}`);
                }
            });

            // 5-2. net:download (大容量ファイルのIPC回避＆VFS直書き)
            t.registerHandler('net:download', async ({ url, destPath, options }) => {
                const { targetUrl, fetchOpts } = prepareFetchOptions(url, options);

                try {
                    const res = await fetch(targetUrl, fetchOpts);
                    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
                    
                    const blob = await res.blob();
                    const dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });

                    // Hostの権限でVFSに直接書き込む（Guest側のメモリとIPCのオーバーヘッドを回避）
                    d.vfs.writeFile(destPath, dataUrl);
                    
                    return { path: destPath, size: blob.size };
                } catch (e) {
                    throw new Error(`[Net API] Download failed: ${e.message}`);
                }
            });

            // 5-3. net:oauth (認証フローの代行とクレデンシャル保存)
            t.registerHandler('net:oauth', async ({ providerId, authUrl, instructions }) => {
                // ブラウザ完結OSのための簡易OAuthフロー：
                // 別タブで認証ページを開き、取得したトークンを安全なHostプロンプトで入力させる。
                window.open(authUrl, '_blank', 'noopener,noreferrer');
                
                if (global.AppUI) {
                    const defaultMsg = `Please complete the authentication in the new tab, then paste the access token here for '${providerId}':`;
                    const token = await global.AppUI.prompt(instructions || defaultMsg, "", `${providerId} Authentication`);
                    
                    if (token && token.trim() !== "") {
                        if (d.configManager) {
                            const config = d.configManager.get();
                            if (!config.credentials) config.credentials = {};
                            
                            // デフォルトは Bearer トークンとして Header に注入する形式で保存
                            config.credentials[providerId] = {
                                type: 'header',
                                key: 'Authorization',
                                value: `Bearer ${token.trim()}`
                            };
                            
                            d.configManager.update({ credentials: config.credentials });
                            return true; // 認証成功
                        }
                    }
                }
                return false; // キャンセルまたは失敗
            });


            // ==========================================
            // 6. Device & Hardware (dev)
            // ==========================================
            
            // 6-1. dev:location (位置情報の取得)
            t.registerHandler('dev:location', async ({ options }) => {
                return new Promise((resolve, reject) => {
                    if (!navigator.geolocation) {
                        return reject(new Error("Geolocation is not supported by this browser."));
                    }
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            resolve({
                                latitude: position.coords.latitude,
                                longitude: position.coords.longitude,
                                accuracy: position.coords.accuracy,
                                timestamp: position.timestamp
                            });
                        },
                        (error) => reject(new Error(error.message)),
                        options
                    );
                });
            });

            // 6-2. dev:photo (OSネイティブのカメラ撮影モーダル)
            t.registerHandler('dev:photo', async ({ options }) => {
                return new Promise(async (resolve, reject) => {
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        return reject(new Error("Camera API is not supported."));
                    }
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ 
                            video: { facingMode: options?.facingMode || 'environment' } 
                        });
                        
                        // OSネイティブのフルスクリーンカメラUIを構築
                        const overlay = document.createElement('div');
                        overlay.className = "fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center itera-animate-fade select-none";
                        
                        const video = document.createElement('video');
                        video.className = "w-full h-full object-contain";
                        video.autoplay = true;
                        video.playsInline = true;
                        video.srcObject = stream;
                        
                        const controls = document.createElement('div');
                        controls.className = "absolute bottom-10 left-0 right-0 flex justify-center items-center gap-10";
                        
                        const btnCancel = document.createElement('button');
                        btnCancel.className = "bg-panel hover:bg-hover text-text-main px-6 py-3 rounded-full font-bold shadow-lg border border-border-main transition";
                        btnCancel.innerText = "Cancel";
                        
                        const btnCapture = document.createElement('button');
                        btnCapture.className = "w-16 h-16 bg-white rounded-full border-4 border-gray-300 shadow-[0_0_20px_rgba(255,255,255,0.5)] focus:outline-none active:scale-95 transition-transform";
                        
                        controls.appendChild(btnCancel);
                        controls.appendChild(btnCapture);
                        overlay.appendChild(video);
                        overlay.appendChild(controls);
                        document.body.appendChild(overlay);

                        const cleanup = () => {
                            stream.getTracks().forEach(track => track.stop());
                            overlay.style.opacity = '0';
                            setTimeout(() => overlay.remove(), 200);
                        };

                        btnCancel.onclick = () => {
                            cleanup();
                            resolve(null); // キャンセル時は null を返す
                        };

                        btnCapture.onclick = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = video.videoWidth;
                            canvas.height = video.videoHeight;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            
                            const quality = options?.quality || 0.8;
                            const dataUrl = canvas.toDataURL('image/jpeg', quality);
                            
                            cleanup();
                            resolve(dataUrl); // 撮影した画像のBase64を返す
                        };
                    } catch (e) {
                        reject(new Error("Failed to access camera: " + e.message));
                    }
                });
            });

            // 6-3. dev:audio (OSネイティブの録音モーダル)
            t.registerHandler('dev:audio', async ({ options }) => {
                return new Promise(async (resolve, reject) => {
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        return reject(new Error("Audio API is not supported."));
                    }
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        const mediaRecorder = new MediaRecorder(stream);
                        const audioChunks =[];

                        mediaRecorder.addEventListener("dataavailable", event => {
                            audioChunks.push(event.data);
                        });

                        // OSネイティブの録音中UIを構築
                        const overlay = document.createElement('div');
                        overlay.className = "fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center itera-animate-fade select-none";
                        
                        const box = document.createElement('div');
                        box.className = "bg-panel p-8 rounded-3xl flex flex-col items-center border border-border-main shadow-2xl";
                        
                        const indicator = document.createElement('div');
                        indicator.className = "w-20 h-20 bg-error/20 text-error rounded-full flex items-center justify-center text-4xl mb-4 animate-pulse shadow-[0_0_30px_rgba(220,38,38,0.4)]";
                        indicator.innerText = "🎙️";
                        
                        const timeDisplay = document.createElement('div');
                        timeDisplay.className = "text-3xl font-mono text-text-main mb-8 tabular-nums tracking-widest";
                        timeDisplay.innerText = "00:00";
                        
                        const controls = document.createElement('div');
                        controls.className = "flex gap-4";
                        
                        const btnCancel = document.createElement('button');
                        btnCancel.className = "bg-card hover:bg-hover text-text-muted hover:text-text-main px-6 py-3 rounded-xl font-bold border border-border-main transition";
                        btnCancel.innerText = "Cancel";
                        
                        const btnStop = document.createElement('button');
                        btnStop.className = "bg-error hover:bg-error/80 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition flex items-center gap-2";
                        btnStop.innerHTML = `<div class="w-3 h-3 bg-white rounded-sm"></div> Stop & Save`;
                        
                        controls.appendChild(btnCancel);
                        controls.appendChild(btnStop);
                        box.appendChild(indicator);
                        box.appendChild(timeDisplay);
                        box.appendChild(controls);
                        overlay.appendChild(box);
                        document.body.appendChild(overlay);

                        let startTime = Date.now();
                        let timerId = setInterval(() => {
                            const elapsed = Math.floor((Date.now() - startTime) / 1000);
                            const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
                            const s = String(elapsed % 60).padStart(2, '0');
                            timeDisplay.innerText = `${m}:${s}`;
                        }, 1000);

                        const cleanup = () => {
                            clearInterval(timerId);
                            stream.getTracks().forEach(track => track.stop());
                            overlay.style.opacity = '0';
                            setTimeout(() => overlay.remove(), 200);
                        };

                        btnCancel.onclick = () => {
                            cleanup();
                            resolve(null);
                        };

                        btnStop.onclick = () => {
                            if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
                        };

                        mediaRecorder.addEventListener("stop", () => {
                            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                cleanup();
                                resolve(reader.result); // 録音データを Data URLで返す
                            };
                            reader.onerror = () => {
                                cleanup();
                                reject(new Error("Failed to read audio blob"));
                            };
                            reader.readAsDataURL(audioBlob);
                        });

                        mediaRecorder.start();

                        // 制限時間が指定されている場合の自動停止
                        if (options?.maxDurationMs) {
                            setTimeout(() => {
                                if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
                            }, options.maxDurationMs);
                        }
                    } catch (e) {
                        reject(new Error("Failed to access microphone: " + e.message));
                    }
                });
            });

            // 6-4. dev:vibrate (バイブレーション)
            t.registerHandler('dev:vibrate', async ({ pattern }) => {
                if (navigator.vibrate) {
                    return navigator.vibrate(pattern);
                }
                return false; // 非対応デバイス
            });

            // ==========================================
            // 7. Dynamic Tools (tools)
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