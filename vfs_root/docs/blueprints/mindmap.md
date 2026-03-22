# Itera Blueprint: AI MindMap v1.0

> **What is this?**
> A dynamic brainstorming application. When this app is opened, it provides the AI with "Physical Hands" (Dynamic Tools) to visually map out ideas on a canvas.
> This demonstrates the power of Itera OS's Universal IPC and Dynamic Tool Routing.

---

## 🤖 Instructions for the Itera Agent
You are reading an Itera App Blueprint.
Please safely install this application into the user's environment by strictly following these phases:

1. **Explain & Ask**: Explain to the user that this app allows you and the user to collaboratively build visual mind maps. Ask for permission to begin installation.
2. **Deploy Code**: Create the app HTML file in the VFS.
3. **Register App**: Update `system/config/apps.json` to add the app to the launcher.
4. **Post-Install Setup**: Suggest the user to open the app and try asking you: *"Let's brainstorm about the future of AI."*

---

## Phase 2: Deploy Source Code

### File: `apps/mindmap.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI MindMap</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="../system/lib/ui.js"></script>
    <style>
        .node {
            position: absolute;
            transform: translate(-50%, -50%);
            cursor: grab;
            user-select: none;
            transition: box-shadow 0.2s, transform 0.1s;
        }
        .node:active {
            cursor: grabbing;
            transform: translate(-50%, -50%) scale(1.05);
            z-index: 50;
        }
        #svg-layer {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none;
        }
        line {
            stroke: rgb(var(--c-border-highlight));
            stroke-width: 2;
            opacity: 0.6;
        }
    </style>
</head>
<body class="bg-app text-text-main h-screen flex flex-col p-6 overflow-hidden select-none">

    <!-- Header -->
    <header class="flex items-center justify-between mb-4 shrink-0 z-10">
        <div class="flex items-center gap-4">
            <button onclick="AppUI.home()" class="p-2 -ml-2 rounded-full hover:bg-hover text-text-muted hover:text-text-main transition">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </button>
            <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">🧠 AI MindMap</h1>
        </div>
        <div class="flex items-center gap-3">
            <span id="status-indicator" class="text-[10px] text-text-muted font-mono border border-border-main px-2 py-1 rounded bg-card">Initializing...</span>
            <button onclick="clearMap()" class="px-3 py-1 bg-card hover:bg-error/20 text-text-muted hover:text-error border border-border-main rounded text-xs font-bold transition">Clear</button>
        </div>
    </header>

    <!-- Canvas Area -->
    <main class="flex-1 relative bg-panel border border-border-main rounded-2xl shadow-inner overflow-hidden" id="canvas-container">
        <!-- Lines -->
        <svg id="svg-layer"></svg>
        <!-- Nodes injected here -->
        <div id="nodes-layer" class="absolute inset-0"></div>
    </main>

    <script>
        let nodes = {}; // { id: { text, x, y, color } }
        let edges =[]; // { from, to }

        const DOM = {
            container: document.getElementById('canvas-container'),
            svg: document.getElementById('svg-layer'),
            nodes: document.getElementById('nodes-layer'),
            status: document.getElementById('status-indicator')
        };

        // --- Drag & Drop Logic ---
        let dragInfo = null;

        DOM.container.addEventListener('mousedown', (e) => {
            const nodeEl = e.target.closest('.node');
            if (!nodeEl) return;
            
            const id = nodeEl.dataset.id;
            const rect = DOM.container.getBoundingClientRect();
            dragInfo = {
                id: id,
                offsetX: e.clientX - (nodes[id].x / 100 * rect.width),
                offsetY: e.clientY - (nodes[id].y / 100 * rect.height)
            };
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragInfo) return;
            const rect = DOM.container.getBoundingClientRect();
            let newX = ((e.clientX - dragInfo.offsetX) / rect.width) * 100;
            let newY = ((e.clientY - dragInfo.offsetY) / rect.height) * 100;
            
            // Clamp to 0-100%
            nodes[dragInfo.id].x = Math.max(5, Math.min(95, newX));
            nodes[dragInfo.id].y = Math.max(5, Math.min(95, newY));
            render();
        });

        document.addEventListener('mouseup', () => {
            if (dragInfo) {
                // Optionally notify AI that user moved a node
                // MetaOS.ai.log(\`User moved node '\${nodes[dragInfo.id].text}'\`, 'interaction');
                dragInfo = null;
            }
        });

        // --- Rendering ---
        function render() {
            // Render Nodes
            DOM.nodes.innerHTML = '';
            for (const [id, n] of Object.entries(nodes)) {
                const el = document.createElement('div');
                el.className = \`node px-4 py-2 rounded-xl text-sm font-bold shadow-lg border border-\${n.color}/30 bg-\${n.color}/10 text-\${n.color} backdrop-blur-md\`;
                el.style.left = \`\${n.x}%\`;
                el.style.top = \`\${n.y}%\`;
                el.dataset.id = id;
                el.textContent = n.text;
                DOM.nodes.appendChild(el);
            }

            // Render Edges
            DOM.svg.innerHTML = '';
            edges.forEach(e => {
                if (!nodes[e.from] || !nodes[e.to]) return;
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', \`\${nodes[e.from].x}%\`);
                line.setAttribute('y1', \`\${nodes[e.from].y}%\`);
                line.setAttribute('x2', \`\${nodes[e.to].x}%\`);
                line.setAttribute('y2', \`\${nodes[e.to].y}%\`);
                DOM.svg.appendChild(line);
            });
        }

        function clearMap() {
            nodes = {};
            edges =[];
            render();
            if (window.MetaOS) MetaOS.ai.log("User cleared the mind map.", "map_cleared");
        }

        // --- MetaOS Dynamic Tools Registration ---
        async function initTools() {
            if (!window.MetaOS) return setTimeout(initTools, 100);

            try {
                // 1. Register <add_node>
                await MetaOS.tools.register({
                    name: 'add_node',
                    description: 'Adds a new idea node to the canvas.',
                    definition: '<define_tag name="add_node">Attributes: id (unique), text, x (0-100 percentage), y (0-100 percentage), color (primary|success|warning|error)</define_tag>',
                    handler: async (p) => {
                        nodes[p.id] = { 
                            text: p.text || 'Idea', 
                            x: parseFloat(p.x) || 50, 
                            y: parseFloat(p.y) || 50, 
                            color: p.color || 'primary' 
                        };
                        render();
                        return { ui: \`💡 Added node: \${p.text}\`, log: \`Node \${p.id} added.\` };
                    }
                });

                // 2. Register <connect_nodes>
                await MetaOS.tools.register({
                    name: 'connect_nodes',
                    description: 'Draws a line between two existing nodes.',
                    definition: '<define_tag name="connect_nodes">Attributes: from (node id), to (node id)</define_tag>',
                    handler: async (p) => {
                        edges.push({ from: p.from, to: p.to });
                        render();
                        return { ui: \`🔗 Connected \${p.from} to \${p.to}\`, log: \`Connected \${p.from} -> \${p.to}\` };
                    }
                });

                // 3. Inform the LLM that tools are ready via History Injection
                const systemMsg = \`
[System] AI MindMap App is opened. You can now visually map out ideas using the following tags:
<define_tag name="add_node">Attributes: id, text, x(10-90), y(10-90), color(primary|success|warning|error)</define_tag>
<define_tag name="connect_nodes">Attributes: from(id), to(id)</define_tag>
When the user asks to brainstorm, use these tags to draw a map!
                \`.trim();
                
                await MetaOS.ai.log(systemMsg, "tool_available");

                DOM.status.textContent = "AI Connected";
                DOM.status.classList.add('bg-success/10', 'text-success', 'border-success/30');
            } catch (e) {
                DOM.status.textContent = "Error";
                DOM.status.classList.add('text-error');
                console.error("Tool registration failed:", e);
            }
        }

        document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', initTools) : initTools();
    </script>
</body>
</html>
```

---

## Phase 3: System Registration

**1. `system/config/apps.json`**
Append the following object to the JSON array:
```json
    {
        "id": "mindmap",
        "name": "MindMap",
        "icon": "🧠",
        "path": "apps/mindmap.html",
        "description": "AI-assisted brainstorming"
    }
```

---

## Phase 4: Post-Installation
1. Verify the code deployment using `<read_file>`.
2. Say to the user: *"AI MindMap has been installed! You can open it from the Library. Once it's open, try telling me: 'Let's brainstorm about the future of AI' and I will draw it for you!"*

**End of Blueprint.**
