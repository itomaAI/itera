/**
 * Itera Dashboard Kernel
 * Refactored for elegance and pure functionality.
 */
(() => {
    const State = { userName: 'User', tasks: [] };
    const DOM = id => document.getElementById(id);

    // --- Time & Greeting ---
    const updateClock = () => {
        const now = new Date();
        const h = now.getHours();
        const greet = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
        
        DOM('clock-display').textContent = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        DOM('date-display').textContent  = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        DOM('greeting').textContent      = `${greet}${State.userName !== 'User' ? ', ' + State.userName : '.'}`;
    };

    // --- Weather ---
    const fetchWeather = async () => {
        const el = DOM('weather-display');
        if (!el) return;
        try {
            const { current_weather: cw } = await fetch('https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&current_weather=true&timezone=Asia%2FTokyo').then(r => r.json());
            const wMap = [[0,'☀️','Clear'],[3,'⛅','Partly Cloudy'],[48,'🌫️','Fog'],[67,'🌧️','Rain'],[77,'❄️','Snow'],[82,'🌦️','Showers'],[99,'⛈️','Thunderstorm']];
            const [, icon, text] = wMap.find(([maxCode]) => cw.weathercode <= maxCode) || wMap[0];
            
            el.innerHTML = `<div class="flex flex-col items-end"><div class="flex items-center gap-2"><span class="text-xl">${icon}</span><span class="text-xl font-bold tracking-tight">${Math.round(cw.temperature)}°C</span></div><span class="text-[10px] text-text-muted uppercase tracking-wider font-bold">Tokyo • ${text}</span></div>`;
        } catch { el.innerHTML = '<span class="text-xs text-text-muted">Weather unavailable</span>'; }
    };

    // --- Widgets ---
    const refreshWidgets = async () => {
        if (!window.App) return;

        // Tasks Widget
        State.tasks = await App.getTasks().catch(() => []);
        const pOrder = { high: 0, medium: 1, low: 2 };
        const pending = State.tasks.filter(t => t.status !== 'completed')
                                   .sort((a, b) => (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1))
                                   .slice(0, 5);
        
        DOM('widget-tasks').innerHTML = pending.length ? pending.map(t => `
            <div class="flex items-center gap-3 p-2 rounded hover:bg-hover transition group">
                <button onclick="DashTask.toggle('${t.id}')" class="shrink-0 w-3.5 h-3.5 rounded-full border-2 border-text-muted hover:border-primary flex items-center justify-center transition hover:scale-110 group-hover:border-primary/50"></button>
                <div class="flex-1 min-w-0 cursor-pointer" onclick="DashTask.edit('${t.id}')">
                    <span class="text-sm truncate block ${t.priority === 'high' ? 'text-error font-medium' : 'text-text-main'}">${t.title}</span>
                    ${t.dueDate ? `<span class="text-[10px] text-text-muted font-mono opacity-70 mt-0.5 block">${t.dueDate.slice(5)}</span>` : ''}
                </div>
            </div>`).join('') : '<div class="text-text-muted text-xs italic py-2">No active tasks.</div>';

        // Notes Widget
        const notes = await App.getRecentNotes(5).catch(() => []);
        DOM('widget-notes').innerHTML = notes.length ? notes.map(path => `
            <div class="flex items-center gap-2 p-2 rounded hover:bg-hover transition cursor-pointer group" onclick="localStorage.setItem('metaos_open_note', '${path}'); AppUI.go('apps/notes.html')">
                <svg class="w-4 h-4 text-text-muted group-hover:text-primary transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <span class="text-sm text-text-main truncate font-mono opacity-90">${path.split('/').pop().replace('.md', '')}</span>
            </div>`).join('') : '<div class="text-text-muted text-xs italic py-2">No notes found.</div>';
    };

    // --- Task Actions API ---
    window.DashTask = {
        edit: id => {
            const t = State.tasks.find(x => x.id === id);
            if (!t) return;
            ['id','title','priority','date','desc'].forEach(k => DOM(`edit-${k}`).value = t[k === 'date' ? 'dueDate' : k === 'desc' ? 'description' : k] || '');
            DOM('edit-priority').value = t.priority || 'medium';
            DOM('edit-modal').classList.remove('hidden');
        },
        close: ()  => DOM('edit-modal').classList.add('hidden'),
        save:  async () => {
            const [id, title, priority, dueDate, description] = ['id','title','priority','date','desc'].map(k => DOM(`edit-${k}`).value);
            if (title.trim()) { await App.updateTask(id, { title, priority, dueDate, description }); DashTask.close(); refreshWidgets(); }
        },
        del:   async () => { if (confirm('Delete permanently?')) { await App.deleteTask(DOM('edit-id').value); DashTask.close(); refreshWidgets(); } },
        toggle: async id => { await App.toggleTask(id); refreshWidgets(); }
    };

    // Backwards compatibility for index.html inline handlers
    Object.assign(window, { openDashboardTaskModal: DashTask.edit, closeDashboardTaskModal: DashTask.close, saveDashboardTaskChanges: DashTask.save, deleteDashboardTask: DashTask.del, toggleDashboardTask: DashTask.toggle });

    // --- Boot Sequence ---
    const boot = async () => {
        try {
            const conf = JSON.parse(await MetaOS.readFile('system/config/config.json'));
            State.userName = conf.username?.split(" ")[0] === "Ryutaro" ? "Ryutaro" : (conf.username || "User");
        } catch {}

        fetchWeather();
        updateClock();
        refreshWidgets();

        setInterval(updateClock, 1000);
        setInterval(fetchWeather, 18e5); // 30 mins
        window.MetaOS?.on('file_changed', p => p.path.startsWith('data/') && refreshWidgets());
    };

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();