/**
 * Player.js
 * Modular base Player class and 4 Element Subclasses:
 * FirePlayer, WaterPlayer, AirPlayer, ElectricityPlayer.
 */

class Player {
    constructor(id, role, name, startX, startY, pIndex = 0) {
        this.id = id;
        this.role = role; // 'ates', 'su', 'hava', 'elektrik'
        this.name = name;
        this.playerIndex = pIndex; // 0..3

        // Spatial bounding box
        this.x = startX;
        this.y = startY;
        this.w = 32;
        this.h = 32;

        // Velocity & Physics
        this.vx = 0;
        this.vy = 0;
        this.speed = 260;
        this.jumpForce = -460;
        this.gravity = 1200;
        this.friction = 0.82;

        // State Flags
        this.grounded = false;
        this.dead = false;
        this.finished = false;
        this.dir = 1; // 1 = Right, -1 = Left

        // Input state
        this.input = { up: false, down: false, left: false, right: false, jump: false, action: false };

        // Visual / FX properties
        this.color = '#ffffff';
        this.trail = [];
    }

    updateInput(inputObj) {
        if (inputObj) {
            this.input = inputObj;
        }
    }

    update(dt, levelManager) {
        if (this.dead || this.finished) return;

        // Base Movement
        if (this.input.left) {
            this.vx = -this.speed;
            this.dir = -1;
        } else if (this.input.right) {
            this.vx = this.speed;
            this.dir = 1;
        } else {
            this.vx *= this.friction;
        }

        // Apply Gravity
        this.vy += this.gravity * dt;

        // Jump mechanics
        if (this.input.jump && this.grounded) {
            this.vy = this.jumpForce;
            this.grounded = false;
        }

        // Clamp Terminal Velocities
        if (Math.abs(this.vx) < 5) this.vx = 0;
        if (this.vy > 900) this.vy = 900;

        // Trail FX positions
        this.trail.push({ x: this.x + this.w / 2, y: this.y + this.h / 2, alpha: 1 });
        if (this.trail.length > 8) this.trail.shift();
        this.trail.forEach(t => t.alpha -= dt * 3);
    }

    die() {
        if (!this.dead) {
            this.dead = true;
            this.vx = 0;
            this.vy = 0;
        }
    }

    finish() {
        if (!this.finished) {
            this.finished = true;
            this.vx = 0;
            this.vy = 0;
        }
    }

    getRect() {
        return { x: this.x, y: this.y, w: this.w, h: this.h };
    }
}

/**
 * 1. Ateş (Fire) Character
 * Ability: Burns wood/timber blocks (`tahta_duvar`).
 */
class FirePlayer extends Player {
    constructor(id, name, startX, startY, pIndex = 0) {
        super(id, 'ates', name, startX, startY, pIndex);
        this.color = '#ef4444'; // Flame Red
        this.glowColor = 'rgba(239, 68, 68, 0.6)';
        this.burnCooldown = 0;
    }

    update(dt, levelManager) {
        super.update(dt, levelManager);
        if (this.burnCooldown > 0) this.burnCooldown -= dt;

        // Fire ability logic: Check adjacent wood blocks when action pressed or on contact
        if ((this.input.action || this.burnCooldown <= 0) && levelManager) {
            window.ElementPowers.triggerFireBurn(this, levelManager);
        }
    }
}

/**
 * 2. Su (Water) Character
 * Ability: Passes through narrow pipes/channels (`boru`).
 */
class WaterPlayer extends Player {
    constructor(id, name, startX, startY, pIndex = 0) {
        super(id, 'su', name, startX, startY, pIndex);
        this.color = '#3b82f6'; // Ocean Blue
        this.glowColor = 'rgba(59, 130, 246, 0.6)';
        this.inPipe = false;
        this.pipeTarget = null;
        this.pipeSpeed = 400;
    }

    update(dt, levelManager) {
        if (this.inPipe && this.pipeTarget) {
            // Pipe conduit sliding physics
            const dx = this.pipeTarget.x - this.x;
            const dy = this.pipeTarget.y - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 10) {
                this.x = this.pipeTarget.x;
                this.y = this.pipeTarget.y;
                this.inPipe = false;
                this.pipeTarget = null;
                this.vy = -150; // Exit pop-up impulse
            } else {
                this.x += (dx / dist) * this.pipeSpeed * dt;
                this.y += (dy / dist) * this.pipeSpeed * dt;
            }
            return;
        }

        super.update(dt, levelManager);

        // Check Pipe interaction
        if (this.input.action || this.input.down) {
            window.ElementPowers.triggerWaterPipeConduit(this, levelManager);
        }
    }
}

/**
 * 3. Hava (Air) Character
 * Ability: Lower gravity, glides and floats upward in draft corridors (`updraft`).
 */
class AirPlayer extends Player {
    constructor(id, name, startX, startY, pIndex = 0) {
        super(id, 'hava', name, startX, startY, pIndex);
        this.color = '#facc15'; // Gust Yellow / Cyan Tint
        this.glowColor = 'rgba(250, 204, 21, 0.6)';
        this.gravity = 650; // Reduced gravity for floating feel
        this.jumpForce = -420;
        this.isGliding = false;
    }

    update(dt, levelManager) {
        // Glide feature: Holding jump while falling slows descent
        if (!this.grounded && this.vy > 0 && (this.input.jump || this.input.action)) {
            this.isGliding = true;
            this.vy = Math.min(this.vy, 120); // Soft descent limit
        } else {
            this.isGliding = false;
        }

        super.update(dt, levelManager);

        // Wind Updraft interaction
        window.ElementPowers.triggerAirUpdraft(this, levelManager, dt);
    }
}

/**
 * 4. Elektrik (Electricity) Character
 * Ability: Triggers circuits & electric panels to unlock electric doors and activate platforms.
 */
class ElectricityPlayer extends Player {
    constructor(id, name, startX, startY, pIndex = 0) {
        super(id, 'elektrik', name, startX, startY, pIndex);
        this.color = '#a855f7'; // Neon Purple / Electric Spark
        this.glowColor = 'rgba(168, 85, 247, 0.6)';
        this.isCharging = false;
    }

    update(dt, levelManager) {
        super.update(dt, levelManager);

        // Electric Circuit interaction
        if (this.input.action || levelManager) {
            window.ElementPowers.triggerElectricCircuit(this, levelManager);
        }
    }
}

// Export to Global window object
window.Player = Player;
window.FirePlayer = FirePlayer;
window.WaterPlayer = WaterPlayer;
window.AirPlayer = AirPlayer;
window.ElectricityPlayer = ElectricityPlayer;
