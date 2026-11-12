/**
 * RenderEngine.js
 * High-End 60 FPS HTML5 Canvas Renderer with Camera LERP, Elemental Particles,
 * Dynamic Floating Interaction Hints, Particle FX, and 4-Player Control Overlay.
 */

class RenderCamera {
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

        this.camera = new RenderCamera(this.canvas.width, this.canvas.height, 2000, 1500);
        this.particles = [];
        this.animTimer = 0;

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
                vx: (Math.random() - 0.5) * 140,
                vy: (Math.random() - 0.5) * 140 - 50,
                size: Math.random() * 5 + 2,
                color,
                life: 1.0
            });
        }
    }

    render(players, levelManager, dt) {
        if (!this.ctx || !levelManager) return;
        this.animTimer += dt * 4;

        // Update Camera
        this.camera.update(players);

        // Gradient Dark Atmosphere Background
        const bgGrad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        bgGrad.addColorStop(0, '#090d16');
        bgGrad.addColorStop(1, '#05070c');
        this.ctx.fillStyle = bgGrad;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        // Apply Camera Transform
        this.ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));

        // 1. Draw Map Grid & Textures
        this.drawMapGrid(levelManager);

        // 2. Draw Entities (Doors, Switches, Pushable boxes, Pipes, Exits)
        this.drawEntities(levelManager);

        // 3. Draw Particles
        this.drawParticles(dt);

        // 4. Draw Floating Ability Hints over interactive obstacles
        this.drawFloatingHints(levelManager, players);

        // 5. Draw Players
        this.drawPlayers(players);

        this.ctx.restore();

        // 6. Draw 4-Player HUD & Controls Legend Bar
        this.drawHUD(players);
        this.drawControlsLegend();
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
                    // Solid Stone Tile
                    this.ctx.fillStyle = '#1e293b';
                    this.ctx.fillRect(x, y, tileSize, tileSize);
                    this.ctx.strokeStyle = '#334155';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(x, y, tileSize, tileSize);

                    // Inner bevel highlight
                    this.ctx.strokeStyle = '#475569';
                    this.ctx.beginPath();
                    this.ctx.moveTo(x + 1, y + tileSize - 1);
                    this.ctx.lineTo(x + 1, y + 1);
                    this.ctx.lineTo(x + tileSize - 1, y + 1);
                    this.ctx.stroke();
                } else if (tile === 2) {
                    // Fire/Lava Tile (Danger for Non-Fire)
                    const wave = Math.sin(this.animTimer + c) * 3;
                    this.ctx.fillStyle = '#dc2626';
                    this.ctx.fillRect(x, y, tileSize, tileSize);
                    this.ctx.fillStyle = '#f97316';
                    this.ctx.fillRect(x, y + wave, tileSize, 5);

                    // Ember glow
                    this.ctx.shadowColor = '#ef4444';
                    this.ctx.shadowBlur = 8;
                    this.ctx.fillStyle = '#fde047';
                    this.ctx.fillRect(x + Math.sin(r + this.animTimer) * 10 + 10, y + 8, 3, 3);
                    this.ctx.shadowBlur = 0;
                } else if (tile === 3) {
                    // Water/Poison Pool Tile (Danger for Non-Water)
                    const wave = Math.cos(this.animTimer + c) * 3;
                    this.ctx.fillStyle = '#1d4ed8';
                    this.ctx.fillRect(x, y, tileSize, tileSize);
                    this.ctx.fillStyle = '#60a5fa';
                    this.ctx.fillRect(x, y + wave, tileSize, 4);
                } else if (tile === 4) {
                    // Green Acid Pool Tile (Danger for ALL players)
                    const wave = Math.sin(this.animTimer * 1.3 + c) * 3;
                    this.ctx.fillStyle = '#059669';
                    this.ctx.fillRect(x, y, tileSize, tileSize);
                    this.ctx.fillStyle = '#34d399';
                    this.ctx.fillRect(x, y + wave, tileSize, 5);
                    this.ctx.fillStyle = '#a7f3d0';
                    this.ctx.fillRect(x + ((c * 7 + Math.floor(this.animTimer * 4)) % 22) + 4, y + 8, 3, 3);
                } else if (tile === 5) {
                    // Climbable Vine (Sarmaşık - Doğa elementi tırmanabilir)
                    this.ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
                    this.ctx.fillRect(x + 8, y, tileSize - 16, tileSize);
                    this.ctx.strokeStyle = '#10b981';
                    this.ctx.lineWidth = 3;
                    this.ctx.beginPath();
                    this.ctx.moveTo(x + tileSize / 2 - 3, y);
                    this.ctx.lineTo(x + tileSize / 2 + 3, y + tileSize / 2);
                    this.ctx.lineTo(x + tileSize / 2 - 3, y + tileSize);
                    this.ctx.stroke();
                    // Yapraklar
                    this.ctx.fillStyle = '#34d399';
                    this.ctx.fillRect(x + 6, y + 6, 6, 4);
                    this.ctx.fillRect(x + tileSize - 12, y + 18, 6, 4);
                } else if (tile === 6) {
                    // Updraft/Wind Corridor
                    this.ctx.fillStyle = 'rgba(250, 204, 21, 0.12)';
                    this.ctx.fillRect(x, y, tileSize, tileSize);

                    // Animated breeze arrows
                    const offset = (this.animTimer * 15) % tileSize;
                    this.ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(x + 8, y + tileSize - offset);
                    this.ctx.lineTo(x + 16, y + tileSize - offset - 8);
                    this.ctx.lineTo(x + 24, y + tileSize - offset);
                    this.ctx.stroke();
                } else if (tile === 7) {
                    // Wooden Block (Burnable by Fire)
                    this.ctx.fillStyle = '#78350f';
                    this.ctx.fillRect(x, y, tileSize, tileSize);
                    this.ctx.strokeStyle = '#451a03';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(x, y, tileSize, tileSize);

                    // Wooden Plank Seams
                    this.ctx.strokeStyle = '#92400e';
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(x + 2, y + 10); this.ctx.lineTo(x + tileSize - 2, y + 10);
                    this.ctx.moveTo(x + 2, y + 22); this.ctx.lineTo(x + tileSize - 2, y + 22);
                    this.ctx.stroke();

                    // Wood Grain Knots
                    this.ctx.strokeStyle = '#b45309';
                    this.ctx.beginPath();
                    this.ctx.arc(x + 12, y + 16, 2, 0, Math.PI * 2);
                    this.ctx.stroke();

                    // Corner Iron Rivets
                    this.ctx.fillStyle = '#27272a';
                    this.ctx.fillRect(x + 3, y + 3, 3, 3);
                    this.ctx.fillRect(x + tileSize - 6, y + 3, 3, 3);
                    this.ctx.fillRect(x + 3, y + tileSize - 6, 3, 3);
                    this.ctx.fillRect(x + tileSize - 6, y + tileSize - 6, 3, 3);

                    // Wood texture lines
                    this.ctx.strokeStyle = '#b45309';
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, y + 8); this.ctx.lineTo(x + tileSize, y + 8);
                    this.ctx.moveTo(x, y + 20); this.ctx.lineTo(x + tileSize, y + 20);
                    this.ctx.stroke();
                } else if (tile === 8) {
                    // Water Pipe Conduit
                    this.ctx.fillStyle = '#0c4a6e';
                    this.ctx.fillRect(x + 6, y, tileSize - 12, tileSize);
                    this.ctx.strokeStyle = '#38bdf8';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(x + 6, y, tileSize - 12, tileSize);

                    // Glowing flow energy
                    this.ctx.fillStyle = '#0ea5e9';
                    const pipeOffset = (this.animTimer * 20) % tileSize;
                    this.ctx.fillRect(x + 10, y + pipeOffset, tileSize - 20, 6);
                }
            }
        }
        this.ctx.lineWidth = 1;
    }

    drawEntities(levelManager) {
        const entities = levelManager.entities || [];
        entities.forEach(ent => {
            if (ent.type === 'box') {
                this.ctx.fillStyle = '#d97706';
                this.ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
                this.ctx.strokeStyle = '#fbbf24';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(ent.x, ent.y, ent.w, ent.h);

                // Cross pattern
                this.ctx.beginPath();
                this.ctx.moveTo(ent.x, ent.y); this.ctx.lineTo(ent.x + ent.w, ent.y + ent.h);
                this.ctx.moveTo(ent.x + ent.w, ent.y); this.ctx.lineTo(ent.x, ent.y + ent.h);
                this.ctx.stroke();
            } else if (ent.type === 'tahta_duvar') {
                this.ctx.fillStyle = '#78350f';
                this.ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
                this.ctx.strokeStyle = '#451a03';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(ent.x, ent.y, ent.w, ent.h);
            } else if (ent.type === 'seesaw') {
                const pivotX = ent.pivotX || (ent.x + ent.w / 2);
                const pivotY = ent.pivotY || (ent.y + ent.h / 2);
                const angle = ent.angle || 0;

                this.ctx.save();
                this.ctx.translate(pivotX, pivotY);
                this.ctx.rotate(angle);
                this.ctx.fillStyle = '#cbd5e1';
                this.ctx.fillRect(-ent.w / 2, -ent.h / 2, ent.w, ent.h);
                this.ctx.strokeStyle = '#64748b';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(-ent.w / 2, -ent.h / 2, ent.w, ent.h);
                this.ctx.restore();

                // Pivot üçgeni
                this.ctx.fillStyle = '#64748b';
                this.ctx.beginPath();
                this.ctx.moveTo(pivotX, pivotY);
                this.ctx.lineTo(pivotX - 10, pivotY + 15);
                this.ctx.lineTo(pivotX + 10, pivotY + 15);
                this.ctx.closePath();
                this.ctx.fill();
            } else if (ent.type === 'electric_panel' || ent.type === 'button') {
                const isActive = !!(ent.active || ent.props?.pressed);
                this.ctx.fillStyle = isActive ? '#a855f7' : (ent.props?.requiresWeight ? '#f59e0b' : '#ec4899');
                const drawY = isActive ? ent.y + ent.h / 2 : ent.y;
                const drawH = isActive ? ent.h / 2 : ent.h;
                this.ctx.fillRect(ent.x, drawY, ent.w, drawH);
                this.ctx.strokeStyle = isActive ? '#c084fc' : '#ffffff';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(ent.x, drawY, ent.w, drawH);

                if (isActive) {
                    this.ctx.shadowColor = '#a855f7';
                    this.ctx.shadowBlur = 10;
                    this.ctx.fillStyle = '#f0abfc';
                    this.ctx.fillRect(ent.x + ent.w / 2 - 4, drawY + drawH / 2 - 2, 8, 4);
                    this.ctx.shadowBlur = 0;
                }
            } else if (ent.type === 'electric_door' || ent.type === 'door') {
                if (!ent.props?.open) {
                    this.ctx.fillStyle = '#475569';
                    this.ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
                    this.ctx.strokeStyle = '#94a3b8';
                    this.ctx.strokeRect(ent.x, ent.y, ent.w, ent.h);
                } else {
                    this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
                    this.ctx.setLineDash([4, 4]);
                    this.ctx.strokeRect(ent.x, ent.y, ent.w, ent.h);
                    this.ctx.setLineDash([]);
                }
            } else if (ent.type === 'exit') {
                // Spinning Portal Exit Gate
                const roleColors = { ates: '#ef4444', su: '#3b82f6', doga: '#10b981', hava: '#facc15', elektrik: '#a855f7' };
                const mainColor = roleColors[ent.props?.role] || '#10b981';

                this.ctx.shadowColor = mainColor;
                this.ctx.shadowBlur = 15;
                this.ctx.strokeStyle = mainColor;
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(ent.x, ent.y, ent.w, ent.h);
                this.ctx.shadowBlur = 0;

                // Portal center glow
                this.ctx.fillStyle = mainColor;
                this.ctx.globalAlpha = 0.3 + Math.sin(this.animTimer) * 0.15;
                this.ctx.fillRect(ent.x + 4, ent.y + 4, ent.w - 8, ent.h - 8);
                this.ctx.globalAlpha = 1.0;
            }
        });
        this.ctx.lineWidth = 1;
    }

    drawFloatingHints(levelManager, players) {
        if (!levelManager || !levelManager.grid) return;
        const tileSize = levelManager.tileSize || 32;

        // Scan nearby tiles for interactive objects and display hints
        players.forEach(p => {
            if (!p || p.dead) return;

            const col = Math.floor((p.x + p.w / 2) / tileSize);
            const row = Math.floor((p.y + p.h / 2) / tileSize);

            let hintText = '';
            let hintColor = '#ffffff';

            if (p.role === 'ates') {
                // Check if wood block tile 7 nearby
                for (let r = row - 1; r <= row + 1; r++) {
                    for (let c = col - 1; c <= col + 1; c++) {
                        if (levelManager.grid[r] && levelManager.grid[r][c] === 7) {
                            hintText = '🔥 Ateş: [F] Basarak Odunu Yak!';
                            hintColor = '#ef4444';
                        }
                    }
                }
            } else if (p.role === 'su') {
                if (levelManager.grid[row] && levelManager.grid[row][col] === 8) {
                    hintText = '💧 Su: [Shift] veya [Aşağı] ile Boruya Gir!';
                    hintColor = '#3b82f6';
                }
            } else if (p.role === 'doga') {
                if (levelManager.grid[row] && levelManager.grid[row][col] === 5) {
                    hintText = '🌿 Doğa: [W / Yukarı] ile Sarmaşığa Tırman!';
                    hintColor = '#10b981';
                }
            } else if (p.role === 'hava') {
                if (levelManager.grid[row] && levelManager.grid[row][col] === 6) {
                    hintText = '💨 Hava: [O] veya [Zıpla] ile Rüzgarda Süzül!';
                    hintColor = '#facc15';
                }
            } else if (p.role === 'elektrik') {
                if (levelManager.entities) {
                    levelManager.entities.forEach(ent => {
                        const hit = typeof p.intersects === 'function' ? p.intersects(ent) : (window.PhysicsEngine && window.PhysicsEngine.intersects(p.getRect(), ent));
                        if ((ent.type === 'electric_panel' || ent.type === 'button') && hit) {
                            hintText = '⚡ Elektrik: [Numpad 0] Şalteri Aktif Et!';
                            hintColor = '#a855f7';
                        }
                    });
                }
            }

            if (hintText) {
                this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
                this.ctx.fillRect(p.x - 40, p.y - 32, 160, 20);
                this.ctx.strokeStyle = hintColor;
                this.ctx.strokeRect(p.x - 40, p.y - 32, 160, 20);

                this.ctx.fillStyle = hintColor;
                this.ctx.font = 'bold 10px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(hintText, p.x + 40, p.y - 18);
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

    drawElementalCharacter(p) {
        this.ctx.save();

        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        const radius = p.w / 2;

        if (p.role === 'ates') {
            // 🔥 Ateş Karakteri: Alev Şeklinde Parlak Gradient Gövde
            this.ctx.shadowColor = '#ef4444';
            this.ctx.shadowBlur = 18;

            const grad = this.ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
            grad.addColorStop(0, '#fde047');
            grad.addColorStop(0.4, '#f97316');
            grad.addColorStop(1, '#ef4444');
            this.ctx.fillStyle = grad;

            this.ctx.beginPath();
            this.ctx.arc(cx, cy + 2, radius - 2, 0, Math.PI);
            this.ctx.quadraticCurveTo(cx - radius, cy - 8, cx, p.y - 8);
            this.ctx.quadraticCurveTo(cx + radius, cy - 8, cx + radius, cy + 2);
            this.ctx.fill();

            // Alev Taç Kıvılcımı
            this.ctx.fillStyle = '#facc15';
            this.ctx.beginPath();
            this.ctx.arc(cx + Math.sin(this.animTimer * 3) * 5, p.y - 6, 4, 0, Math.PI * 2);
            this.ctx.fill();

            // Gözler
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#ffffff';
            const eyeX = p.dir === 1 ? cx + 2 : cx - 10;
            this.ctx.beginPath();
            this.ctx.arc(eyeX, cy - 2, 4, 0, Math.PI * 2);
            this.ctx.arc(eyeX + 8, cy - 2, 4, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = '#0f172a';
            this.ctx.beginPath();
            this.ctx.arc(eyeX + (p.dir === 1 ? 1 : -1), cy - 2, 2, 0, Math.PI * 2);
            this.ctx.arc(eyeX + 8 + (p.dir === 1 ? 1 : -1), cy - 2, 2, 0, Math.PI * 2);
            this.ctx.fill();
        } else if (p.role === 'su') {
            // 💧 Su Karakteri: Parlak Sıvı Damlası
            this.ctx.shadowColor = '#3b82f6';
            this.ctx.shadowBlur = 18;

            const grad = this.ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, radius + 4);
            grad.addColorStop(0, '#7dd3fc');
            grad.addColorStop(0.5, '#3b82f6');
            grad.addColorStop(1, '#1d4ed8');
            this.ctx.fillStyle = grad;

            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Yansıma Halkası
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            this.ctx.beginPath();
            this.ctx.arc(cx - 5, cy - 5, 4, 0, Math.PI * 2);
            this.ctx.fill();

            // Gözler
            this.ctx.fillStyle = '#ffffff';
            const eyeX = p.dir === 1 ? cx + 2 : cx - 10;
            this.ctx.beginPath();
            this.ctx.arc(eyeX, cy, 4, 0, Math.PI * 2);
            this.ctx.arc(eyeX + 8, cy, 4, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = '#0f172a';
            this.ctx.beginPath();
            this.ctx.arc(eyeX + (p.dir === 1 ? 1 : -1), cy, 2, 0, Math.PI * 2);
            this.ctx.arc(eyeX + 8 + (p.dir === 1 ? 1 : -1), cy, 2, 0, Math.PI * 2);
            this.ctx.fill();
        } else if (p.role === 'doga') {
            // 🌿 Doğa Karakteri: Zümrüt Yeşili Doğa Ruhu
            this.ctx.shadowColor = '#10b981';
            this.ctx.shadowBlur = 18;

            const grad = this.ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, radius + 4);
            grad.addColorStop(0, '#6ee7b7');
            grad.addColorStop(0.5, '#10b981');
            grad.addColorStop(1, '#047857');
            this.ctx.fillStyle = grad;

            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Baş üstü yaprak filizi
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#34d399';
            this.ctx.beginPath();
            this.ctx.ellipse(cx + 4, p.y - 4, 6, 3, -Math.PI / 6, 0, Math.PI * 2);
            this.ctx.fill();

            // Gözler
            this.ctx.fillStyle = '#ffffff';
            const eyeX = p.dir === 1 ? cx + 2 : cx - 10;
            this.ctx.beginPath();
            this.ctx.arc(eyeX, cy - 2, 4, 0, Math.PI * 2);
            this.ctx.arc(eyeX + 8, cy - 2, 4, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = '#0f172a';
            this.ctx.beginPath();
            this.ctx.arc(eyeX + (p.dir === 1 ? 1 : -1), cy - 2, 2, 0, Math.PI * 2);
            this.ctx.arc(eyeX + 8 + (p.dir === 1 ? 1 : -1), cy - 2, 2, 0, Math.PI * 2);
            this.ctx.fill();
        } else if (p.role === 'hava') {
            // 💨 Hava Karakteri: Rüzgar Spirit
            this.ctx.shadowColor = '#facc15';
            this.ctx.shadowBlur = 18;

            const grad = this.ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
            grad.addColorStop(0, '#fef08a');
            grad.addColorStop(1, '#eab308');
            this.ctx.fillStyle = grad;

            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Rüzgar Halkası
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
            this.ctx.stroke();

            // Gözler
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#0f172a';
            const eyeX = p.dir === 1 ? cx + 2 : cx - 10;
            this.ctx.beginPath();
            this.ctx.arc(eyeX, cy - 2, 3, 0, Math.PI * 2);
            this.ctx.arc(eyeX + 8, cy - 2, 3, 0, Math.PI * 2);
            this.ctx.fill();
        } else if (p.role === 'elektrik') {
            // ⚡ Elektrik Karakteri: Plazma Şimşek Küresi
            this.ctx.shadowColor = '#a855f7';
            this.ctx.shadowBlur = 20;

            const grad = this.ctx.createRadialGradient(cx, cy, 2, cx, cy, radius + 4);
            grad.addColorStop(0, '#f0abfc');
            grad.addColorStop(0.6, '#a855f7');
            grad.addColorStop(1, '#6b21a8');
            this.ctx.fillStyle = grad;

            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Gözler
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#ffffff';
            const eyeX = p.dir === 1 ? cx + 2 : cx - 10;
            this.ctx.beginPath();
            this.ctx.arc(eyeX, cy - 2, 4, 0, Math.PI * 2);
            this.ctx.arc(eyeX + 8, cy - 2, 4, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            this.ctx.fillStyle = p.color || '#ffffff';
            this.ctx.fillRect(p.x, p.y, p.w, p.h);
        }

        // İsim Etiketi
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 11px Poppins, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(p.name || p.role.toUpperCase(), cx, p.y - 12);

        this.ctx.restore();
    }

    drawPlayers(players) {
        players.forEach(p => {
            if (!p || p.dead) return;
            this.drawElementalCharacter(p);
        });
    }

    drawHUD(players) {
        const roleMeta = {
            su: { name: '💧 Su', color: '#3b82f6' },
            ates: { name: '🔥 Ateş', color: '#ef4444' },
            doga: { name: '🌿 Doğa', color: '#10b981' },
            hava: { name: '💨 Hava', color: '#facc15' },
            elektrik: { name: '⚡ Elektrik', color: '#a855f7' }
        };

        const activeList = players.filter(Boolean);
        if (activeList.length === 0) return;

        const boxW = 130;
        const gap = 10;
        const totalW = activeList.length * boxW + (activeList.length - 1) * gap;
        let startX = Math.max(260, this.canvas.width - totalW - 20);

        activeList.forEach((player, idx) => {
            const meta = roleMeta[player.role] || { name: player.role.toUpperCase(), color: '#a855f7' };
            this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            this.ctx.fillRect(startX, 15, boxW, 36);
            this.ctx.strokeStyle = meta.color;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(startX, 15, boxW, 36);

            this.ctx.fillStyle = meta.color;
            this.ctx.font = 'bold 11px sans-serif';
            this.ctx.textAlign = 'left';
            const statusText = player.dead ? '💀 ÖLDÜ' : player.finished ? '✅ KAPIDA' : '⚡ AKTİF';
            this.ctx.fillText(`P${idx + 1}: ${meta.name}`, startX + 8, 30);
            this.ctx.fillStyle = '#94a3b8';
            this.ctx.font = '10px sans-serif';
            this.ctx.fillText(statusText, startX + 8, 44);

            startX += boxW + gap;
        });
        this.ctx.lineWidth = 1;
    }

    drawControlsLegend() {
        const legendY = this.canvas.height - 45;
        const legendWidth = Math.min(this.canvas.width - 40, 1000);
        const legendX = (this.canvas.width - legendWidth) / 2;

        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        this.ctx.fillRect(legendX, legendY, legendWidth, 38);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.strokeRect(legendX, legendY, legendWidth, 38);

        const keys = [
            { text: '🔥 Ateş: [F / Space] Tahta Duvarı Yak', color: '#ef4444' },
            { text: '💧 Su: [Shift / Aşağı] Borudan Geç', color: '#3b82f6' },
            { text: '🌿 Doğa: [W / Yukarı] Sarmaşığa Tırman', color: '#10b981' },
            { text: '💨 Hava: [Space / F] Rüzgarda Süzül', color: '#facc15' }
        ];

        const itemWidth = legendWidth / keys.length;
        keys.forEach((k, idx) => {
            this.ctx.fillStyle = k.color;
            this.ctx.font = 'bold 11px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(k.text, legendX + itemWidth * idx + itemWidth / 2, legendY + 23);
        });
    }
}

window.RenderEngine = RenderEngine;
