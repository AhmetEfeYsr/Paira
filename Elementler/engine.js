// engine.js - Fizik motoru (AABB çarpışma), Entiteler ve Kamera Yönetimi

class Rect {
    constructor(x, y, w, h, type = 'solid', props = {}) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.type = type; // solid, danger_ates, danger_su, climbable, updraft vb.
        this.props = props;
    }

    intersects(other) {
        return (this.x < other.x + other.w &&
                this.x + this.w > other.x &&
                this.y < other.y + other.h &&
                this.y + this.h > other.y);
    }
}

class PushableBox extends Rect {
    constructor(x, y, w, h, props) {
        super(x, y, w, h, 'box', props);
        this.vx = 0;
        this.vy = 0;
        this.gravity = 1200;
        this.friction = 0.8;
        this.grounded = false;
        // İtme gücü katsayısı
        this.pushResistance = props.resistance || 0.9;
    }

    update(dt, levelRects) {
        this.vy += this.gravity * dt;
        this.vx *= this.friction;

        // X ekseni
        this.x += this.vx * dt;
        this.handleCollisions(levelRects, 'x');

        // Y ekseni
        this.y += this.vy * dt;
        this.grounded = false;
        this.handleCollisions(levelRects, 'y');
    }

    handleCollisions(rects, axis) {
        for (let r of rects) {
            if (r === this) continue; // Kendisiyle çarpışmaz
            if (r.type === 'solid' || r.type === 'tahta_duvar' || r.type === 'box' || r.type === 'door' && !r.props.open) {
                if (this.intersects(r)) {
                    if (axis === 'x') {
                        if (this.vx > 0) { this.x = r.x - this.w; this.vx = 0; }
                        else if (this.vx < 0) { this.x = r.x + r.w; this.vx = 0; }
                    } else if (axis === 'y') {
                        if (this.vy > 0) { this.y = r.y - this.h; this.vy = 0; this.grounded = true; }
                        else if (this.vy < 0) { this.y = r.y + r.h; this.vy = 0; }
                    }
                }
            }
        }
    }
}

class Seesaw extends Rect {
    constructor(x, y, w, h, props) {
        super(x, y, w, h, 'seesaw', props);
        // Tahterevalli merkezi pivot noktası
        this.pivotX = x + w / 2;
        this.pivotY = y + h / 2;
        // Dönüş açısı (radyan)
        this.angle = 0;
        this.angularVelocity = 0;
        // Maksimum dönüş açısı (örn. 30 derece)
        this.maxAngle = Math.PI / 6;
        this.damping = 0.95; // Sürtünme
        this.returnForce = 0.05; // Merkeze dönme eğilimi
    }

    update(dt, entities) {
        // Tork hesaplama: Tahterevallinin üstünde kim varsa, ağırlık merkezine uzaklığına göre tork uygular.
        let torque = 0;
        const seesawLeft = this.x;
        const seesawRight = this.x + this.w;
        // Basit AABB kesişimi kullanıyoruz, dönüş açısı büyük olmadığından kabul edilebilir bir hile.
        // Yüksekliği (AABB olarak) açıya göre genişletiyoruz.
        const currentH = this.h + Math.abs(Math.sin(this.angle) * this.w);

        // Kesişim için geçici bir dikdörtgen
        const bounds = {
            x: this.x,
            y: this.y - currentH/2,
            w: this.w,
            h: currentH
        };

        for (let e of entities) {
            if (e.type === 'player' || e.type === 'box') {
                // Sadece üstündeysen etki et (basit kontrol)
                if (e.x + e.w > bounds.x && e.x < bounds.x + bounds.w &&
                    e.y + e.h >= bounds.y && e.y + e.h <= bounds.y + bounds.h + 10) {

                    // Nesnenin X merkezinin pivot'a uzaklığı
                    const distFromCenter = (e.x + e.w/2) - this.pivotX;
                    // Tork ekle (ağırlık katsayısı)
                    const weight = e.type === 'box' ? 1.5 : 1.0;
                    torque += distFromCenter * weight * 0.05 * dt;

                    // Nesnenin Y pozisyonunu tahterevalli yüzeyine it (basit fizik)
                    // Yüzeyin o noktadaki Y si:
                    const surfaceY = this.pivotY + Math.tan(this.angle) * distFromCenter;
                    if (e.y + e.h > surfaceY - this.h/2) {
                        e.y = surfaceY - this.h/2 - e.h;
                        if(e.type === 'player') e.grounded = true;
                        if(e.type === 'box') e.grounded = true;
                        e.vy = 0;
                    }
                }
            }
        }

        // Fizik güncellemesi
        this.angularVelocity += torque;
        // Merkeze dönme eğilimi (yay gibi)
        this.angularVelocity -= this.angle * this.returnForce * dt;
        this.angularVelocity *= this.damping;
        this.angle += this.angularVelocity;

        // Açı sınırları
        if (this.angle > this.maxAngle) { this.angle = this.maxAngle; this.angularVelocity *= -0.5; }
        if (this.angle < -this.maxAngle) { this.angle = -this.maxAngle; this.angularVelocity *= -0.5; }
    }
}


class Bouncer extends Rect {
    constructor(id, x, y, w, h, props) {
        super(x, y, w, h);
        this.id = id;
        this.power = props.power || -15;
        this.color = props.color || '#f59e0b';
        this.isSolid = true;
    }
    interact(entity) {
        if (entity.vy >= 0 && entity.y + entity.h <= this.y + entity.vy + 4) {
            entity.vy = this.power;
            entity.y = this.y - entity.h;
            entity.jumping = true;
        }
    }
}

class FragileBlock extends Rect {
    constructor(id, x, y, w, h, props) {
        super(x, y, w, h);
        this.id = id;
        this.breakTime = props.breakTime || 60;
        this.timer = 0;
        this.isBroken = false;
        this.isSteppedOn = false;
        this.color = props.color || '#d1d5db';
        this.isSolid = true;
    }
    update() {
        if (this.isBroken) return;
        if (this.isSteppedOn) {
            this.timer++;
            if (this.timer >= this.breakTime) {
                this.isBroken = true;
                this.isSolid = false;
            }
        }
    }
    interact(entity) {
        if (this.isBroken) return;
        if (entity.vy >= 0 && entity.y + entity.h <= this.y + entity.vy + 4) {
            this.isSteppedOn = true;
        }
    }
}

class Teleporter extends Rect {
    constructor(id, x, y, w, h, props) {
        super(x, y, w, h);
        this.id = id;
        this.targetId = props.targetId;
        this.color = props.color || '#8b5cf6';
        this.cooldowns = new Map();
    }
    interact(entity, entities) {
        if (!this.targetId) return;
        let cooldown = this.cooldowns.get(entity) || 0;
        if (cooldown > 0) return;

        let targetPortal = entities.find(e => e.id === this.targetId && e instanceof Teleporter);
        if (targetPortal) {
            entity.x = targetPortal.x + (targetPortal.w - entity.w) / 2;
            entity.y = targetPortal.y + (targetPortal.h - entity.h) / 2;
            targetPortal.cooldowns.set(entity, 30);
            this.cooldowns.set(entity, 30);
        }
    }
    update() {
        for (let [entity, time] of this.cooldowns.entries()) {
            if (time > 0) {
                this.cooldowns.set(entity, time - 1);
            } else {
                this.cooldowns.delete(entity);
            }
        }
    }
}

class GravityZone extends Rect {
    constructor(id, x, y, w, h, props) {
        super(x, y, w, h);
        this.id = id;
        this.gravityMultiplier = props.gravityMultiplier !== undefined ? props.gravityMultiplier : -1;
        this.color = props.color || 'rgba(168, 85, 247, 0.2)';
    }
    contains(entity) {
        return (entity.x < this.x + this.w &&
                entity.x + entity.w > this.x &&
                entity.y < this.y + this.h &&
                entity.y + entity.h > this.y);
    }
}

class SpikeTrap extends Rect {
    constructor(id, x, y, w, h, props) {
        super(x, y, w, h);
        this.id = id;
        this.period = props.period || 120;
        this.activeTime = props.activeTime || 60;
        this.timer = 0;
        this.isActive = false;
        this.color = props.color || '#991b1b';
    }
    update() {
        this.timer = (this.timer + 1) % this.period;
        this.isActive = (this.timer < this.activeTime);
    }
}

class PlayerEntity extends Rect {
    constructor(id, role, name, startX, startY) {
        super(startX, startY, 32, 32, 'player');
        this.id = id;
        this.role = role;
        this.name = name;

        this.vx = 0;
        this.vy = 0;

        this.speed = 250;
        this.jumpForce = -450;
        this.gravity = 1200;
        this.friction = 0.8;

        this.grounded = false;
        this.climbing = false;
        this.flying = false;
        this.dead = false;
        this.finished = false;

        // Animasyon ve Görsellik için
        this.color = this.getColorByRole(role);
        this.dir = 1; // 1 sağ, -1 sol
        this.isLocal = false; // Benim kontrolümde mi?

        this.input = { up: false, down: false, left: false, right: false, jump: false };
    }

    getColorByRole(role) {
        switch(role) {
            case 'ates': return '#ef4444'; // Red
            case 'su': return '#3b82f6'; // Blue
            case 'doga': return '#10b981'; // Green
            case 'hava': return '#facc15'; // Yellow
            default: return '#ffffff';
        }
    }

    update(dt, levelRects) {
        if (this.dead || this.finished) return;

        // --- GİRDİ UYGULAMASI ---
        if (this.climbing) {
            this.vy = 0;
            this.vx = 0;
            if (this.input.up) this.vy = -150;
            if (this.input.down) this.vy = 150;
            if (this.input.left) this.vx = -150;
            if (this.input.right) this.vx = 150;
            if (this.input.jump) { this.climbing = false; this.vy = this.jumpForce * 0.8; }
        } else if (this.flying) {
            // Hava eventi (Updraft / Fırtına)
            this.vy -= 1800 * dt; // Yukarı ivme
            if (this.vy < -300) this.vy = -300; // Limit
            if (this.input.left) this.vx = -this.speed;
            else if (this.input.right) this.vx = this.speed;
            else this.vx *= this.friction;
        } else {
            // Normal Hareket
            if (this.input.left) { this.vx = -this.speed; this.dir = -1; }
            else if (this.input.right) { this.vx = this.speed; this.dir = 1; }
            else { this.vx *= this.friction; }

            // Yerçekimi
            this.vy += this.gravity * dt;

            // Zıplama
            if (this.input.jump && this.grounded) {
                this.vy = this.jumpForce;
                this.grounded = false;
            }
        }

        // Hız Sınırları
        if (Math.abs(this.vx) < 5) this.vx = 0;
        if (this.vy > 800) this.vy = 800; // Terminal velocity

        // --- X EKSENİ HAREKETİ VE ÇARPIŞMA ---
        this.x += this.vx * dt;
        this.handleCollisions(levelRects, 'x', dt);

        // --- Y EKSENİ HAREKETİ VE ÇARPIŞMA ---
        this.y += this.vy * dt;
        this.grounded = false;
        this.climbing = false;
        this.flying = false;
        this.handleCollisions(levelRects, 'y', dt);

        // Sensörler / Özel Zemin Kontrolleri
        this.checkSensors(levelRects);
    }

    handleCollisions(rects, axis, dt) {
        // Çok basit AABB (Axis-Aligned Bounding Box) Resolving
        for (let r of rects) {
            if (r.type === 'solid' || r.type === 'tahta_duvar' || r.type === 'door' && !r.props.open) {
                if (this.intersects(r)) {
                    // Ateş, tahta duvara değerse yakar (Oyun içi aksiyondur, burada sadece solid gibi davranır ilk freym, sonra game.js siler)
                    if (axis === 'x') {
                        if (this.vx > 0) { this.x = r.x - this.w; this.vx = 0; }
                        else if (this.vx < 0) { this.x = r.x + r.w; this.vx = 0; }
                    } else if (axis === 'y') {
                        if (this.vy > 0) { this.y = r.y - this.h; this.vy = 0; this.grounded = true; }
                        else if (this.vy < 0) { this.y = r.y + r.h; this.vy = 0; }
                    }
                }
            }
            // İtilebilir Kutular (Aynı zamanda platform gibi üstüne çıkılabilir)
            else if (r.type === 'box') {
                if (this.intersects(r)) {
                    if (axis === 'x') {
                        // Kutuyu İtme Mekaniği
                        if (this.vx > 0) {
                            this.x = r.x - this.w;
                            // Kutuyu it
                            r.vx = this.vx * r.pushResistance;
                            this.vx = 0;
                        }
                        else if (this.vx < 0) {
                            this.x = r.x + r.w;
                            r.vx = this.vx * r.pushResistance;
                            this.vx = 0;
                        }
                    } else if (axis === 'y') {
                        if (this.vy > 0) { this.y = r.y - this.h; this.vy = 0; this.grounded = true; }
                        else if (this.vy < 0) { this.y = r.y + r.h; this.vy = 0; }
                    }
                }
            }
            // Borular (Sadece SU geçebilir, diğerlerine duvar)
            else if (r.type === 'boru') {
                if (this.role !== 'su') {
                    if (this.intersects(r)) {
                        if (axis === 'x') {
                            if (this.vx > 0) { this.x = r.x - this.w; this.vx = 0; }
                            else if (this.vx < 0) { this.x = r.x + r.w; this.vx = 0; }
                        } else if (axis === 'y') {
                            if (this.vy > 0) { this.y = r.y - this.h; this.vy = 0; this.grounded = true; }
                            else if (this.vy < 0) { this.y = r.y + r.h; this.vy = 0; }
                        }
                    }
                } else {
                    // SU elementi borudayken hitbox'ı incelir.
                    if (this.intersects(r)) {
                        // Görsel veya fiziksel farklılık eklenebilir. Şu anlık direkt içinden geçer (No collision).
                    }
                }
            }
        }
    }

    checkSensors(rects) {
        let overClimbable = false;
        let overUpdraft = false;

        for (let r of rects) {
            if (!this.intersects(r)) continue;

            // ÖLÜMCÜL SIVILAR
            if (r.type.startsWith('danger_')) {
                const dangerType = r.type.split('_')[1]; // danger_ates -> ates
                if (dangerType !== this.role) {
                    this.die(); // Kendi rengi olmayan sıvıya düştü
                }
            }

            // SARMAŞIK (Doğa elementi tırmanabilir)
            if (r.type === 'sarmasik') {
                if (this.role === 'doga') {
                    overClimbable = true;
                }
            }

            // FIRTINA (Hava elementi uçabilir)
            if (r.type === 'firtina') {
                if (this.role === 'hava' && this.input.jump) {
                    overUpdraft = true;
                }
            }

            // ÇIKIŞ KAPILARI
            if (r.type === 'exit' && r.props.role === this.role) {
                // Sadece merkez noktası kapı içindeyse kabul et
                if(this.x + this.w/2 > r.x && this.x + this.w/2 < r.x + r.w && this.y + this.h/2 > r.y && this.y + this.h/2 < r.y + r.h) {
                    this.finish();
                }
            }

            // BUTONLAR
            if (r.type === 'button') {
                // game.js tarafına "Butona bastım" eventi fırlatmak gerekir.
                // Basitlik açısından engine içinde state tutmuyoruz, game.js rects'leri dönerken bakacak.
            }
        }

        if (overClimbable && (this.input.up || this.input.down || this.climbing)) {
            this.climbing = true;
        }
        if (overUpdraft) {
            this.flying = true;
        }
    }

    die() {
        if (!this.dead) {
            this.dead = true;
            // game.js'i uyar.
            if(this.isLocal && window.gameApp) {
                window.gameApp.triggerDeath(this.role);
            }
        }
    }

    finish() {
        if (!this.finished) {
            this.finished = true;
            // Kapıya ulaştı, artık hareket edemez, görünmez veya sabit olur.
            this.vx = 0; this.vy = 0;
            if(this.isLocal && window.gameApp) {
                window.gameApp.triggerFinish(this.role);
            }
        }
    }
}

// Kırmızı kutu vs değil, elementin ruhunu yansıtacak basit render fonsiyonu
class Camera {
    constructor(canvasWidth, canvasHeight, mapWidth, mapHeight) {
        this.x = 0;
        this.y = 0;
        this.w = canvasWidth;
        this.h = canvasHeight;
        this.mw = mapWidth;
        this.mh = mapHeight;
    }

    follow(target) {
        if (!target) return;
        // Kamerayı merkeze al (Yumuşak takip - LERP eklenebilir)
        this.x = target.x - this.w / 2 + target.w / 2;
        this.y = target.y - this.h / 2 + target.h / 2;

        // Sınırları aşmasını engelle
        if (this.x < 0) this.x = 0;
        if (this.y < 0) this.y = 0;
        if (this.x + this.w > this.mw) this.x = this.mw - this.w;
        if (this.y + this.h > this.mh) this.y = this.mh - this.h;
    }
}

class GameEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.rects = [];
        this.players = {}; // peerId -> PlayerEntity
        this.localPlayerId = null;

        this.mapW = 2000;
        this.mapH = 1500;
        this.camera = new Camera(this.canvas.width, this.canvas.height, this.mapW, this.mapH);

        this.lastTime = 0;
        this.running = false;

        this.dynamicEntities = []; // Kutular vb. için

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        // Containerın boyutunu al
        const container = document.getElementById('game-screen');
        if(container && container.clientWidth > 0) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
            this.camera.w = this.canvas.width;
            this.camera.h = this.canvas.height;
        }
    }

    loadMap(mapData) {
        this.rects = [];
        this.dynamicEntities = [];
        this.mapW = mapData.width;
        this.mapH = mapData.height;
        this.camera.mw = this.mapW;
        this.camera.mh = this.mapH;

        // Grid to Rects (32x32 tiles diyelim)
        const TILE = 32;
        for (let y = 0; y < mapData.grid.length; y++) {
            for (let x = 0; x < mapData.grid[y].length; x++) {
                const val = mapData.grid[y][x];
                if (val === 1) this.rects.push(new Rect(x*TILE, y*TILE, TILE, TILE, 'solid'));
                else if (val === 2) this.rects.push(new Rect(x*TILE, y*TILE, TILE, TILE, 'danger_ates')); // Lav (Suyu öldürür)
                else if (val === 3) this.rects.push(new Rect(x*TILE, y*TILE, TILE, TILE, 'danger_su')); // Su (Ateşi öldürür)
                else if (val === 4) this.rects.push(new Rect(x*TILE, y*TILE, TILE, TILE, 'danger_doga')); // Asit (İkisini de öldürür)
                else if (val === 5) this.rects.push(new Rect(x*TILE, y*TILE, TILE, TILE, 'sarmasik'));
                else if (val === 6) this.rects.push(new Rect(x*TILE, y*TILE, TILE, TILE, 'firtina'));
                else if (val === 7) this.rects.push(new Rect(x*TILE, y*TILE, TILE, TILE, 'tahta_duvar'));
                else if (val === 8) this.rects.push(new Rect(x*TILE, y*TILE, TILE, TILE, 'boru'));
            }
        }

        // Entity ler (Kapılar, objeler vb.)
        if(mapData.entities) {
            mapData.entities.forEach(e => {
                if (e.type === 'box') {
                    const box = new PushableBox(e.x, e.y, e.w, e.h, e.props || {});
                    this.rects.push(box);
                    this.dynamicEntities.push(box);
                } else if (e.type === 'seesaw') {
                    const seesaw = new Seesaw(e.x, e.y, e.w, e.h, e.props || {});
                    this.rects.push(seesaw);
                    this.dynamicEntities.push(seesaw);
                } else if (e.type === 'bouncer') {
                    const b = new Bouncer(e.id, e.x, e.y, e.w, e.h, e.props || {});
                    this.rects.push(b);
                    this.dynamicEntities.push(b);
                } else if (e.type === 'fragile') {
                    const f = new FragileBlock(e.id, e.x, e.y, e.w, e.h, e.props || {});
                    this.rects.push(f);
                    this.dynamicEntities.push(f);
                } else if (e.type === 'teleporter') {
                    const tp = new Teleporter(e.id, e.x, e.y, e.w, e.h, e.props || {});
                    this.rects.push(tp);
                    this.dynamicEntities.push(tp);
                } else if (e.type === 'gravity') {
                    const gz = new GravityZone(e.id, e.x, e.y, e.w, e.h, e.props || {});
                    this.rects.push(gz);
                    this.dynamicEntities.push(gz);
                } else if (e.type === 'spiketrap') {
                    const st = new SpikeTrap(e.id, e.x, e.y, e.w, e.h, e.props || {});
                    this.rects.push(st);
                    this.dynamicEntities.push(st);
                } else {
                    this.rects.push(new Rect(e.x, e.y, e.w, e.h, e.type, e.props));
                }
            });
        }
    }

    addPlayer(id, role, name, sx, sy, isLocal) {
        const p = new PlayerEntity(id, role, name, sx, sy);
        p.isLocal = isLocal;
        if(isLocal) this.localPlayerId = id;
        this.players[id] = p;
    }

    setLocalInput(keys) {
        if(!this.localPlayerId || !this.players[this.localPlayerId]) return;
        this.players[this.localPlayerId].input = { ...keys };
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    stop() {
        this.running = false;
    }

    loop(timestamp) {
        if (!this.running) return;

        let dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (dt > 0.1) dt = 0.1; // Uzun lagları engelle

        // Game Logic (Buton tetikleri vs)
        if(window.gameApp) window.gameApp.logicTick(this.rects, this.players, this.dynamicEntities);

        // Update Dynamic Entities (Boxes, Seesaws)
        for (let entity of this.dynamicEntities) {
            if (entity.type === 'box') {
                entity.update(dt, this.rects);
            } else if (entity.type === 'seesaw') {
                // Tahterevalli için oyuncular ve kutuları argüman geç
                const allDynamic = [...Object.values(this.players), ...this.dynamicEntities.filter(e => e.type === 'box')];
                entity.update(dt, allDynamic);
            }
        }

        // Update Physics
        for (let id in this.players) {
            let p = this.players[id];

            // New Mechanics Interactions for Player before actual update
            if (!p.dead) {
                // GravityZone and SpikeTrap interactions
                let inGravityZone = false;
                for (let r of this.rects) {
                    if (r instanceof GravityZone && r.contains(p)) {
                        // Negate normal gravity and apply new
                        p.vy += (0.4 * r.gravityMultiplier) - 0.4;
                        inGravityZone = true;
                    }
                    if (r instanceof SpikeTrap && r.isActive && checkAABB(p, r)) {
                        p.dead = true;
                    }
                    if (r instanceof Bouncer && checkAABB(p, r)) r.interact(p);
                    if (r instanceof FragileBlock && checkAABB(p, r)) r.interact(p);
                    if (r instanceof Teleporter && checkAABB(p, r)) r.interact(p, this.rects);
                }
            }

            p.update(dt, this.rects);
        }

        // Camera follow
        if (this.localPlayerId && this.players[this.localPlayerId]) {
            this.camera.follow(this.players[this.localPlayerId]);
        }

        this.render();
        requestAnimationFrame((t) => this.loop(t));
    }

    render() {
        // Arkaplan
        this.ctx.fillStyle = '#0a1128';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y); // Kamera ofseti

        // Grid (Hafif bir zindan deseni)
        this.ctx.strokeStyle = 'rgba(255,255,255,0.02)';
        this.ctx.lineWidth = 1;
        for(let i=0; i<this.mapW; i+=64) { this.ctx.beginPath(); this.ctx.moveTo(i, 0); this.ctx.lineTo(i, this.mapH); this.ctx.stroke(); }
        for(let j=0; j<this.mapH; j+=64) { this.ctx.beginPath(); this.ctx.moveTo(0, j); this.ctx.lineTo(this.mapW, j); this.ctx.stroke(); }

        // Level Rects (Dünya)
        for (let r of this.rects) {
            // Culling (Sadece kamera içindekileri çiz)
            if (r.x + r.w < this.camera.x || r.x > this.camera.x + this.camera.w ||
                r.y + r.h < this.camera.y || r.y > this.camera.y + this.camera.h) continue;

            if (r.type === 'solid') {
                this.ctx.fillStyle = '#1e293b'; // Koyu gri-mavi duvar
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
                this.ctx.strokeStyle = '#334155';
                this.ctx.strokeRect(r.x, r.y, r.w, r.h);
            } else if (r.type === 'danger_ates') { // Lav (Suyu öldürür)
                this.ctx.fillStyle = 'rgba(239, 68, 68, 0.8)'; // Parlak Kırmızı Lav
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
                this.ctx.fillStyle = 'rgba(255, 150, 50, 0.5)'; // Lav Yüzey Dalgaları
                this.ctx.fillRect(r.x, r.y, r.w, 4);
            } else if (r.type === 'danger_su') { // Su Havuzu (Ateşi öldürür)
                this.ctx.fillStyle = 'rgba(59, 130, 246, 0.8)'; // Parlak Mavi Su
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
                this.ctx.fillStyle = 'rgba(150, 200, 255, 0.5)'; // Su Yüzey Dalgaları
                this.ctx.fillRect(r.x, r.y, r.w, 4);
            } else if (r.type === 'danger_doga') { // Zehir/Asit Havuzu (İkisini de öldürür)
                this.ctx.fillStyle = 'rgba(16, 185, 129, 0.8)'; // Parlak Yeşil Asit
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
                this.ctx.fillStyle = 'rgba(150, 255, 150, 0.5)'; // Asit Yüzey Baloncukları
                this.ctx.fillRect(r.x, r.y, r.w, 4);
            } else if (r.type === 'sarmasik') {
                this.ctx.fillStyle = 'rgba(34, 197, 94, 0.3)'; // Yeşil şeffaf merdiven
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
            } else if (r.type === 'firtina') {
                this.ctx.fillStyle = 'rgba(250, 204, 21, 0.2)'; // Sarı rüzgar alanı
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
            } else if (r.type === 'tahta_duvar') {
                this.ctx.fillStyle = '#78350f'; // Odun rengi
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
                // Çizgiler (odun dokusu)
                this.ctx.strokeStyle = '#451a03';
                this.ctx.beginPath(); this.ctx.moveTo(r.x, r.y+8); this.ctx.lineTo(r.x+r.w, r.y+8); this.ctx.stroke();
            } else if (r.type === 'boru') {
                this.ctx.fillStyle = '#0f172a';
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
                this.ctx.strokeStyle = '#38bdf8'; // Parlak mavi boru hatları
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(r.x+2, r.y+2, r.w-4, r.h-4);
            } else if (r.type === 'button') {
                this.ctx.fillStyle = r.props.color || '#94a3b8';
                let bh = r.props.pressed ? 8 : 16; // Basılınca çöker
                this.ctx.fillRect(r.x, r.y + (r.h - bh), r.w, bh);

                // Ağırlıklı buton göstergesi
                if(r.props.requiresWeight) {
                    this.ctx.fillStyle = '#1e293b';
                    this.ctx.fillRect(r.x + r.w/2 - 4, r.y + (r.h - bh) + 2, 8, 4);
                }
            } else if (r.type === 'door') {
                if(!r.props.open) {
                    this.ctx.fillStyle = r.props.color || '#475569';
                    this.ctx.fillRect(r.x, r.y, r.w, r.h);
                    // Kapı detayı
                    this.ctx.strokeStyle = '#1e293b';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(r.x+2, r.y+2, r.w-4, r.h-4);
                }
            } else if (r.type === 'box') {
                this.ctx.fillStyle = '#8B4513'; // Ahşap kutu
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
                this.ctx.strokeStyle = '#5C3A21';
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(r.x, r.y, r.w, r.h);
                // Çarpı deseni
                this.ctx.beginPath();
                this.ctx.moveTo(r.x, r.y); this.ctx.lineTo(r.x+r.w, r.y+r.h);
                this.ctx.moveTo(r.x+r.w, r.y); this.ctx.lineTo(r.x, r.y+r.h);
                this.ctx.stroke();
            } else if (r.type === 'seesaw') {
                this.ctx.save();
                this.ctx.translate(r.pivotX, r.pivotY);
                this.ctx.rotate(r.angle);

                // Tahterevalli tahtası
                this.ctx.fillStyle = '#d97706';
                this.ctx.fillRect(-r.w/2, -r.h/2, r.w, r.h);
                this.ctx.strokeStyle = '#b45309';
                this.ctx.strokeRect(-r.w/2, -r.h/2, r.w, r.h);

                this.ctx.restore();

                // Pivot üçgeni (Sabit)
                this.ctx.fillStyle = '#475569';
                this.ctx.beginPath();
                this.ctx.moveTo(r.pivotX, r.pivotY);
                this.ctx.lineTo(r.pivotX - 10, r.pivotY + 20);
                this.ctx.lineTo(r.pivotX + 10, r.pivotY + 20);
                this.ctx.fill();
            } else if (r.type === 'exit') {
                // Çıkış kapısı
                this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
                // İç rengi (role göre)
                this.ctx.strokeStyle = this.getColorByRole(r.props.role);
                this.ctx.lineWidth = 4;
                this.ctx.strokeRect(r.x+4, r.y+4, r.w-8, r.h-8);
                // Finish olduysa parlar
                if(r.props.finished) {
                    this.ctx.fillStyle = this.getColorByRole(r.props.role);
                    this.ctx.globalAlpha = 0.5;
                    this.ctx.fillRect(r.x, r.y, r.w, r.h);
                    this.ctx.globalAlpha = 1.0;
                }
            }
        }

        // Oyuncular
        for (let id in this.players) {
            const p = this.players[id];
            if (p.dead) continue; // Ölüler çizilmez (veya hayalet çizilir)

            this.ctx.fillStyle = p.color;

            // Eğer su borudaysa ince çizilir, uçuyorsa farklı vs. (Görsel cilalar)
            if (p.role === 'su' && this.rects.some(r => r.type==='boru' && p.intersects(r))) {
                this.ctx.fillRect(p.x, p.y + p.h - 10, p.w, 10); // İncecik su oldu
            } else {
                this.ctx.fillRect(p.x, p.y, p.w, p.h);

                // Gözler (yönüne göre)
                this.ctx.fillStyle = 'black';
                if(p.dir === 1) { // Sağa bakıyor
                    this.ctx.fillRect(p.x + 20, p.y + 8, 4, 4);
                    this.ctx.fillRect(p.x + 28, p.y + 8, 4, 4);
                } else { // Sola bakıyor
                    this.ctx.fillRect(p.x + 4, p.y + 8, 4, 4);
                    this.ctx.fillRect(p.x + 12, p.y + 8, 4, 4);
                }
            }

            // İsim etiketi
            this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
            this.ctx.font = '10px Poppins';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(p.name, p.x + p.w/2, p.y - 8);
        }

        this.ctx.restore();
    }

    getColorByRole(role) {
        switch(role) {
            case 'ates': return '#ef4444';
            case 'su': return '#3b82f6';
            case 'doga': return '#10b981';
            case 'hava': return '#facc15';
            default: return '#ffffff';
        }
    }
}