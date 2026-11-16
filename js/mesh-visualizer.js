/**
 * UPI Offline Mesh — Interactive HTML5 Canvas Mesh Visualizer
 * Renders nodes (phones), Bluetooth links, radio-wave pulses, packet particles,
 * and 4G cloud uplinks with physics and drag-and-drop.
 */

class MeshVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        
        this.nodes = [];
        this.particles = [];
        this.pulses = [];
        this.uplinks = [];
        
        this.selectedNode = null;
        this.hoveredNode = null;
        this.draggedNode = null;
        this.isDragging = false;
        
        this.width = 0;
        this.height = 0;
        this.dpr = window.devicePixelRatio || 1;
        
        this.initCanvasSize();
        window.addEventListener('resize', () => this.initCanvasSize());
        this.initInteractions();
        
        this.animFrame = null;
        this.startAnimationLoop();
    }
    
    initCanvasSize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height || 440;
        
        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        
        this.ctx.scale(this.dpr, this.dpr);
        this.repositionNodesIfNeeded();
    }
    
    setDevices(devices) {
        const existingMap = new Map(this.nodes.map(n => [n.id, n]));
        const count = devices.length;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = Math.min(this.width, this.height) * 0.35;
        
        this.nodes = devices.map((d, i) => {
            const existing = existingMap.get(d.deviceId);
            if (existing) {
                existing.hasInternet = d.hasInternet;
                existing.packetCount = d.packetCount;
                existing.packetIds = d.packetIds || [];
                return existing;
            }
            
            // Circle layout initially
            const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            let type = 'relay';
            if (d.deviceId.includes('alice')) type = 'sender';
            else if (d.hasInternet) type = 'bridge';
            
            return {
                id: d.deviceId,
                name: d.deviceId.replace('phone-', ''),
                type: type,
                x: x,
                y: y,
                vx: 0,
                vy: 0,
                radius: 26,
                hasInternet: d.hasInternet,
                packetCount: d.packetCount,
                packetIds: d.packetIds || [],
                pulsePhase: Math.random() * Math.PI * 2
            };
        });
    }
    
    repositionNodesIfNeeded() {
        if (!this.nodes.length) return;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = Math.min(this.width, this.height) * 0.35;
        
        this.nodes.forEach((n, i) => {
            if (n.x > this.width || n.y > this.height || n.x < 0 || n.y < 0) {
                const angle = (i / this.nodes.length) * Math.PI * 2 - Math.PI / 2;
                n.x = centerX + radius * Math.cos(angle);
                n.y = centerY + radius * Math.sin(angle);
            }
        });
    }
    
    triggerGossipAnimation(transfers) {
        // Emit radio pulses from every node holding packets
        this.nodes.forEach(n => {
            if (n.packetCount > 0) {
                this.pulses.push({
                    x: n.x,
                    y: n.y,
                    radius: 10,
                    maxRadius: 160,
                    opacity: 0.8,
                    color: n.type === 'bridge' ? '#10b981' : (n.type === 'sender' ? '#818cf8' : '#06b6d4')
                });
            }
        });
        
        // Spawn moving packet particles across links
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = 0; j < this.nodes.length; j++) {
                if (i !== j && this.nodes[i].packetCount > 0) {
                    const src = this.nodes[i];
                    const dst = this.nodes[j];
                    this.particles.push({
                        startX: src.x,
                        startY: src.y,
                        targetX: dst.x,
                        targetY: dst.y,
                        x: src.x,
                        y: src.y,
                        progress: 0,
                        speed: 0.025 + Math.random() * 0.02,
                        color: '#38bdf8',
                        size: 5
                    });
                }
            }
        }
    }
    
    triggerFlushAnimation(bridgeNodeId) {
        const bridge = this.nodes.find(n => n.id === bridgeNodeId || n.hasInternet);
        if (!bridge) return;
        
        this.uplinks.push({
            x: bridge.x,
            y: bridge.y,
            beamY: bridge.y,
            opacity: 1,
            particles: Array.from({ length: 12 }, () => ({
                x: bridge.x + (Math.random() - 0.5) * 20,
                y: bridge.y,
                vy: -3 - Math.random() * 4,
                size: 3 + Math.random() * 3,
                alpha: 1
            }))
        });
    }
    
    initInteractions() {
        this.canvas.addEventListener('mousedown', (e) => {
            const pos = this.getMousePos(e);
            const clicked = this.findNodeAt(pos.x, pos.y);
            if (clicked) {
                this.draggedNode = clicked;
                this.isDragging = true;
            }
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            const pos = this.getMousePos(e);
            if (this.isDragging && this.draggedNode) {
                this.draggedNode.x = pos.x;
                this.draggedNode.y = pos.y;
            } else {
                this.hoveredNode = this.findNodeAt(pos.x, pos.y);
                this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'default';
            }
        });
        
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.draggedNode = null;
        });
        
        this.canvas.addEventListener('click', (e) => {
            const pos = this.getMousePos(e);
            const clicked = this.findNodeAt(pos.x, pos.y);
            if (clicked) {
                if (window.onNodeClicked) {
                    window.onNodeClicked(clicked);
                }
            }
        });
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    findNodeAt(x, y) {
        return this.nodes.find(n => {
            const dx = n.x - x;
            const dy = n.y - y;
            return Math.sqrt(dx * dx + dy * dy) <= n.radius + 6;
        });
    }
    
    startAnimationLoop() {
        const render = () => {
            this.updatePhysics();
            this.draw();
            this.animFrame = requestAnimationFrame(render);
        };
        render();
    }
    
    updatePhysics() {
        // Soft spring towards center & repulsion between nodes
        const cx = this.width / 2;
        const cy = this.height / 2;
        
        for (let i = 0; i < this.nodes.length; i++) {
            const a = this.nodes[i];
            if (a === this.draggedNode) continue;
            
            // Center gravity
            a.vx += (cx - a.x) * 0.001;
            a.vy += (cy - a.y) * 0.001;
            
            // Repulsion
            for (let j = i + 1; j < this.nodes.length; j++) {
                const b = this.nodes[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const minDist = 110;
                
                if (dist < minDist) {
                    const force = (minDist - dist) / minDist;
                    const fx = (dx / dist) * force * 0.6;
                    const fy = (dy / dist) * force * 0.6;
                    a.vx -= fx;
                    a.vy -= fy;
                    if (b !== this.draggedNode) {
                        b.vx += fx;
                        b.vy += fy;
                    }
                }
            }
            
            // Damping & application
            a.vx *= 0.88;
            a.vy *= 0.88;
            a.x += a.vx;
            a.y += a.vy;
            
            // Wall bounce
            const pad = a.radius + 10;
            if (a.x < pad) { a.x = pad; a.vx *= -0.5; }
            if (a.x > this.width - pad) { a.x = this.width - pad; a.vx *= -0.5; }
            if (a.y < pad) { a.y = pad; a.vy *= -0.5; }
            if (a.y > this.height - pad) { a.y = this.height - pad; a.vy *= -0.5; }
        }
    }
    
    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        
        // 1. Draw Mesh Connection Links
        this.drawLinks(ctx);
        
        // 2. Draw Radio Wave Pulses
        this.drawPulses(ctx);
        
        // 3. Draw Uplink Beams (4G Upload)
        this.drawUplinks(ctx);
        
        // 4. Draw Traveling Packet Particles
        this.drawParticles(ctx);
        
        // 5. Draw Devices (Nodes)
        this.drawNodes(ctx);
        
        // 6. Draw Hover Tooltip
        if (this.hoveredNode && !this.isDragging) {
            this.drawTooltip(ctx, this.hoveredNode);
        }
    }
    
    drawLinks(ctx) {
        ctx.save();
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const a = this.nodes[i];
                const b = this.nodes[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Opacity inversely proportional to distance
                const maxRange = Math.max(this.width, this.height) * 0.65;
                if (dist < maxRange) {
                    const alpha = Math.max(0.08, (1 - dist / maxRange) * 0.35);
                    ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
                    ctx.lineWidth = 1.2;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }
    
    drawPulses(ctx) {
        ctx.save();
        for (let i = this.pulses.length - 1; i >= 0; i--) {
            const p = this.pulses[i];
            p.radius += 3;
            p.opacity *= 0.94;
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.opacity);
            ctx.lineWidth = 2;
            ctx.stroke();
            
            if (p.radius >= p.maxRadius || p.opacity <= 0.02) {
                this.pulses.splice(i, 1);
            }
        }
        ctx.restore();
    }
    
    drawUplinks(ctx) {
        ctx.save();
        for (let i = this.uplinks.length - 1; i >= 0; i--) {
            const u = this.uplinks[i];
            u.beamY -= 8;
            u.opacity *= 0.95;
            
            // Glowing vertical beam
            const grad = ctx.createLinearGradient(u.x, u.y, u.x, 0);
            grad.addColorStop(0, 'rgba(16, 185, 129, 0.8)');
            grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
            
            ctx.strokeStyle = grad;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(u.x, u.y);
            ctx.lineTo(u.x, Math.max(0, u.beamY));
            ctx.stroke();
            
            // Particles ascending
            u.particles.forEach(p => {
                p.y += p.vy;
                p.alpha *= 0.93;
                ctx.fillStyle = `rgba(52, 211, 153, ${p.alpha})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            });
            
            if (u.opacity <= 0.05) {
                this.uplinks.splice(i, 1);
            }
        }
        ctx.restore();
    }
    
    drawParticles(ctx) {
        ctx.save();
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.progress += p.speed;
            p.x = p.startX + (p.targetX - p.startX) * p.progress;
            p.y = p.startY + (p.targetY - p.startY) * p.progress;
            
            // Glowing packet dot
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            
            if (p.progress >= 1) {
                this.particles.splice(i, 1);
            }
        }
        ctx.restore();
    }
    
    drawNodes(ctx) {
        const time = Date.now() * 0.003;
        
        this.nodes.forEach(n => {
            const isHovered = (n === this.hoveredNode);
            const isBridge = n.hasInternet;
            
            // Base colors
            let mainColor = '#06b6d4'; // relay
            let glowColor = 'rgba(6, 182, 212, 0.4)';
            if (n.type === 'sender') {
                mainColor = '#818cf8';
                glowColor = 'rgba(129, 140, 248, 0.5)';
            } else if (isBridge) {
                mainColor = '#10b981';
                glowColor = 'rgba(16, 185, 129, 0.6)';
            }
            
            // Outer glow ring
            ctx.save();
            ctx.beginPath();
            const pulseSize = Math.sin(time + n.pulsePhase) * 3;
            ctx.arc(n.x, n.y, n.radius + 6 + (isHovered ? 4 : 0) + pulseSize, 0, Math.PI * 2);
            ctx.fillStyle = glowColor;
            ctx.globalAlpha = isHovered ? 0.35 : 0.18;
            ctx.fill();
            ctx.restore();
            
            // Node body circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius + (isHovered ? 2 : 0), 0, Math.PI * 2);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.lineWidth = isHovered ? 3 : 2;
            ctx.strokeStyle = mainColor;
            ctx.shadowColor = mainColor;
            ctx.shadowBlur = isHovered ? 14 : 8;
            ctx.stroke();
            ctx.restore();
            
            // Node icon / emoji
            ctx.save();
            ctx.font = '15px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let icon = '📱';
            if (n.type === 'sender') icon = '👤';
            else if (isBridge) icon = '📡';
            ctx.fillText(icon, n.x, n.y - 3);
            ctx.restore();
            
            // Node label below
            ctx.save();
            ctx.font = '11px JetBrains Mono, Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#f8fafc';
            ctx.fillText(n.name, n.x, n.y + n.radius + 15);
            
            // Status tag
            ctx.font = '9px JetBrains Mono, Consolas, monospace';
            if (isBridge) {
                ctx.fillStyle = '#34d399';
                ctx.fillText('🌐 4G BRIDGE', n.x, n.y + n.radius + 27);
            } else {
                ctx.fillStyle = '#64748b';
                ctx.fillText('🚫 OFFLINE', n.x, n.y + n.radius + 27);
            }
            ctx.restore();
            
            // Packet badge count (top-right of node)
            if (n.packetCount > 0) {
                ctx.save();
                const badgeX = n.x + n.radius * 0.7;
                const badgeY = n.y - n.radius * 0.7;
                ctx.beginPath();
                ctx.arc(badgeX, badgeY, 9, 0, Math.PI * 2);
                ctx.fillStyle = '#ef4444';
                ctx.shadowColor = '#ef4444';
                ctx.shadowBlur = 6;
                ctx.fill();
                
                ctx.font = 'bold 9px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(n.packetCount, badgeX, badgeY);
                ctx.restore();
            }
        });
    }
    
    drawTooltip(ctx, node) {
        ctx.save();
        const text1 = `${node.id}`;
        const text2 = node.hasInternet ? 'Status: 🌐 4G Uplink Active' : 'Status: 🚫 Offline BLE Mesh Relay';
        const text3 = `Held Packets: ${node.packetCount} (Click to toggle 4G)`;
        
        ctx.font = '12px Inter, sans-serif';
        const w1 = ctx.measureText(text1).width;
        const w2 = ctx.measureText(text2).width;
        const w3 = ctx.measureText(text3).width;
        const boxW = Math.max(w1, w2, w3) + 24;
        const boxH = 68;
        
        let tx = node.x - boxW / 2;
        let ty = node.y - node.radius - boxH - 12;
        if (ty < 10) ty = node.y + node.radius + 36;
        if (tx < 10) tx = 10;
        if (tx + boxW > this.width - 10) tx = this.width - boxW - 10;
        
        // Tooltip container
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty, boxW, boxH, 8);
        ctx.fill();
        ctx.stroke();
        
        // Text
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText(text1, tx + 12, ty + 20);
        
        ctx.fillStyle = node.hasInternet ? '#34d399' : '#94a3b8';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(text2, tx + 12, ty + 38);
        
        ctx.fillStyle = '#38bdf8';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(text3, tx + 12, ty + 54);
        ctx.restore();
    }
}

window.MeshVisualizer = MeshVisualizer;
