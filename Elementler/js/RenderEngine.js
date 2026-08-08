/**
 * RenderEngine.js
 * 60 FPS Canvas Renderer with camera LERP, elemental particle effects,
 * modern glowing graphics, and dynamic 4-player HUD overlays.
 */

class Camera {
    constructor(canvasWidth, canvasHeight, mapWidth, mapHeight) {
        this.x = 0;
        this.y = 0;
        this.w = canvasWidth;
        this.h = canvasHeight;
        this.mw = mapWidth || 2000;
        this.mh = mapHeight || 1500;
    }

    update(players) {
        const activePlayers = players.filter(p => p && !p.dead);
        if (!activePlayers.length) return;

        let avgX = 0, avgY = 0;
        activePlayers.forEach(p => {
            avgX += p.x + p.w / 2;
            avgY += p.y + p.h / 2;
        });

        avgX /= activePlayers.length;
        avgY /= activePlayers.length;

        // Smooth LERP camera movement
        const targetX = avgX - this.w / 2;
        const targetY = avgY - this.h / 2;

        this.x += (targetX - this.x) * 0.08;
        this.y += (targetY - this.y) * 0.08;

        // Clamp map bounds
        this.x = Math.max(0, Math.min(this.x, this.mw - this.w));
        this.y = Math.max(0, Math.min(this.y, this.mh - this.h));
    }
}

class RenderEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.camera = new Camera(this.canvas.width, this.canvas.height, 2000, 1500);
        this.particles = [];

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width || window.innerWidth;
        this.canvas.height = rect.height || window.innerHeight;
        this.camera.w = this.canvas.width;
        this.camera.h = this.canvas.height;
    }

    spawnParticles(x, y, color, count = 8) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 120,
                vy: (Math.random() - 0.5) * 120 - 40,
                size: Math.random() * 4 + 2,
                color,
                life: 1.0
            });
        }
    }

    render(players, levelManager, dt) {
        if (!this.ctx || !levelManager) return;

        // Update Camera
        this.camera.update(players);

        // Clear Canvas with sleek dark background
        this.ctx.fillStyle = '#0b0f19';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        // Apply Camera Transform
        this.ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));

        // 1. Draw Map Grid
        this.drawMapGrid(levelManager);

        // 2. Draw Entities (Doors, Switches, Pushable boxes, Pipes, Exits)
        this.drawEntities(levelManager);

        // 3. Draw Particles
        this.drawParticles(dt);

        // 4. Draw Players
        this.drawPlayers(players);

        this.ctx.restore();

        // 5. Draw 4-Player HUD Overlay
        this.drawHUD(players);
    }

    drawMapGrid(levelManager) {
        const grid = levelManager.grid || [];
        const tileSize = levelManager.tileSize || 32;

        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                const tile = grid[r][c];
                if (tile === 0) continue;

                const x = c * tileSize;
                const y = r * tileSize;

                if (tile === 1) {
                    // Solid Tile
                    this.ctx.fillStyle = '#1e293b';
                    this.ctx.fillRect(x, y, tileSize, tileSize);
                    this.ctx.strokeStyle = '#334155';
                    this.ctx.strokeRect(x, y, tileSize, tileSize);
                } else if (tile === 2) {
                    // Fire/Lava Tile
                    this.ctx.fillStyle = '#ef4444';
                    this.ctx.fillRect(x, y, tileSize, tileSize);
                } else if (tile === 3) {
                    // Water/Poison Tile
                    this.ctx.fillStyle = '#3b82f6';
                    this.ctx.fillRect(x, y, tileSize, tileSize);
                } else if (tile === 6) {
                    // Updraft/Wind Corridor
                    this.ctx.fillStyle = 'rgba(250, 204, 21, 0.15)';
                    this.ctx.fillRect(x, y, tileSize, tileSize);
                    this.ctx.strokeStyle = 'rgba(250, 204, 21, 0.3)';
                    this.ctx.strokeRect(x, y, tileSize, tileSize);
                } else if (tile === 7) {
                    // Wooden Block
                    this.ctx.fillStyle = '#b45309';
                    this.ctx.fillRect(x, y, tileSize, tileSize);
                    this.ctx.strokeStyle = '#78350f';
                    this.ctx.strokeRect(x, y, tileSize, tileSize);
                } else if (tile === 8) {
                    // Water Pipe Conduit
                    this.ctx.fillStyle = '#0284c7';
                    this.ctx.fillRect(x + 8, y, tileSize - 16, tileSize);
                }
            }
        }
    }

    drawEntities(levelManager) {
        const entities = levelManager.entities || [];
        entities.forEach(ent => {
            if (ent.type === 'box') {
                this.ctx.fillStyle = '#d97706';
                this.ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
                this.ctx.strokeStyle = '#f59e0b';
                this.ctx.strokeRect(ent.x, ent.y, ent.w, ent.h);
            } else if (ent.type === 'electric_panel' || ent.type === 'button') {
                this.ctx.fillStyle = ent.active ? '#a855f7' : '#475569';
                this.ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
            } else if (ent.type === 'door' || ent.type === 'electric_door') {
                if (!ent.props?.open) {
                    this.ctx.fillStyle = '#64748b';
                    this.ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
                }
            } else if (ent.type === 'exit') {
                // Exit Gate
                const roleColors = { ates: '#ef4444', su: '#3b82f6', hava: '#facc15', elektrik: '#a855f7' };
                this.ctx.fillStyle = roleColors[ent.props?.role] || '#10b981';
                this.ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
            }
        });
    }

    drawParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt * 1.5;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = Math.max(0, p.life);
            this.ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        this.ctx.globalAlpha = 1.0;
    }

    drawPlayers(players) {
        players.forEach(p => {
            if (!p || p.dead) return;

            // Player Glow
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 12;

            // Player body
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(p.x, p.y, p.w, p.h);

            this.ctx.shadowBlur = 0; // Reset shadow

            // Player Label
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '600 11px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(p.name || p.role.toUpperCase(), p.x + p.w / 2, p.y - 8);
        });
    }

    drawHUD(players) {
        // Render 4-Player status indicators at top
        const roles = [
            { id: 'ates', name: 'P1: Ateş', color: '#ef4444' },
            { id: 'su', name: 'P2: Su', color: '#3b82f6' },
            { id: 'hava', name: 'P3: Hava', color: '#facc15' },
            { id: 'elektrik', name: 'P4: Elektrik', color: '#a855f7' }
        ];

        let startX = 20;
        roles.forEach((r, idx) => {
            const player = players.find(p => p && p.role === r.id);
            this.ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            this.ctx.fillRect(startX, 15, 115, 32);
            this.ctx.strokeStyle = r.color;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(startX, 15, 115, 32);

            this.ctx.fillStyle = r.color;
            this.ctx.font = 'bold 12px sans-serif';
            this.ctx.textAlign = 'left';
            const statusText = player ? (player.dead ? '💀 ÖLDÜ' : player.finished ? '✅ TAMAM' : '⚡ AKTİF') : 'OFFLINE';
            this.ctx.fillText(r.name, startX + 8, 30);
            this.ctx.fillStyle = '#94a3b8';
            this.ctx.font = '10px sans-serif';
            this.ctx.fillText(statusText, startX + 8, 42);

            startX += 125;
        });
        this.ctx.lineWidth = 1;
    }
}

window.RenderEngine = RenderEngine;
