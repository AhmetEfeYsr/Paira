/**
 * PhysicsEngine.js
 * Optimized 60FPS AABB Physics Engine for tile maps, dynamic pushable boxes,
 * seesaws, moving platforms, doors, and elemental hazards.
 */

class PhysicsEngine {
    static intersects(r1, r2) {
        return (
            r1.x < r2.x + r2.w &&
            r1.x + r1.w > r2.x &&
            r1.y < r2.y + r2.h &&
            r1.y + r1.h > r2.y
        );
    }

    constructor() {
        this.gravity = 1200;
    }

    update(players, levelManager, dt) {
        if (!levelManager) return;

        const tileSize = levelManager.tileSize || 32;
        const grid = levelManager.grid || [];
        const entities = levelManager.entities || [];

        // 1. Update dynamic entities (Moving platforms, Pushable boxes, Seesaws)
        this.updateEntities(entities, players, levelManager, dt);

        // 2. Update and resolve physics for each player
        players.forEach(player => {
            if (!player || player.dead || player.finished || player.inPipe) return;

            // X Axis movement & collision
            player.x += player.vx * dt;
            this.handleGridCollision(player, grid, tileSize, 'x');
            this.handleEntityCollision(player, entities, 'x', dt);

            // Y Axis movement & collision
            player.y += player.vy * dt;
            player.grounded = false;
            this.handleGridCollision(player, grid, tileSize, 'y');
            this.handleEntityCollision(player, entities, 'y', dt);

            // Hazard and trigger sensors
            this.checkSensors(player, grid, tileSize, entities, levelManager);
        });
    }

    handleGridCollision(player, grid, tileSize, axis) {
        if (!grid.length) return;

        const minCol = Math.floor(player.x / tileSize);
        const maxCol = Math.floor((player.x + player.w - 1) / tileSize);
        const minRow = Math.floor(player.y / tileSize);
        const maxRow = Math.floor((player.y + player.h - 1) / tileSize);

        for (let r = minRow; r <= maxRow; r++) {
            if (r < 0 || r >= grid.length) continue;
            for (let c = minCol; c <= maxCol; c++) {
                if (c < 0 || c >= grid[r].length) continue;

                const tile = grid[r][c];

                // Tile 1 = Solid Wall
                if (tile === 1) {
                    const tileRect = { x: c * tileSize, y: r * tileSize, w: tileSize, h: tileSize };

                    if (PhysicsEngine.intersects(player, tileRect)) {
                        if (axis === 'x') {
                            if (player.vx > 0) { player.x = tileRect.x - player.w; player.vx = 0; }
                            else if (player.vx < 0) { player.x = tileRect.x + tileRect.w; player.vx = 0; }
                        } else if (axis === 'y') {
                            if (player.vy > 0) { player.y = tileRect.y - player.h; player.vy = 0; player.grounded = true; }
                            else if (player.vy < 0) { player.y = tileRect.y + tileRect.h; player.vy = 0; }
                        }
                    }
                }
            }
        }
    }

    handleEntityCollision(player, entities, axis, dt) {
        entities.forEach(ent => {
            // Solid barriers or closed doors
            if (ent.type === 'solid' || ent.type === 'tahta_duvar' || (ent.type === 'door' && !ent.props?.open) || (ent.type === 'electric_door' && !ent.props?.open)) {
                if (PhysicsEngine.intersects(player, ent)) {
                    if (axis === 'x') {
                        if (player.vx > 0) { player.x = ent.x - player.w; player.vx = 0; }
                        else if (player.vx < 0) { player.x = ent.x + ent.w; player.vx = 0; }
                    } else if (axis === 'y') {
                        if (player.vy > 0) { player.y = ent.y - player.h; player.vy = 0; player.grounded = true; }
                        else if (player.vy < 0) { player.y = ent.y + ent.h; player.vy = 0; }
                    }
                }
            }
            // Pushable Box
            else if (ent.type === 'box') {
                if (PhysicsEngine.intersects(player, ent)) {
                    if (axis === 'x') {
                        const resistance = ent.props?.resistance || 0.85;
                        if (player.vx > 0) {
                            player.x = ent.x - player.w;
                            ent.vx = player.vx * resistance;
                            player.vx = 0;
                        } else if (player.vx < 0) {
                            player.x = ent.x + ent.w;
                            ent.vx = player.vx * resistance;
                            player.vx = 0;
                        }
                    } else if (axis === 'y') {
                        if (player.vy > 0) { player.y = ent.y - player.h; player.vy = 0; player.grounded = true; }
                        else if (player.vy < 0) { player.y = ent.y + ent.h; player.vy = 0; }
                    }
                }
            }
            // Moving Platform
            else if (ent.type === 'moving_platform') {
                if (PhysicsEngine.intersects(player, ent)) {
                    if (axis === 'y' && player.vy > 0 && player.y + player.h - player.vy * dt <= ent.y + 10) {
                        player.y = ent.y - player.h;
                        player.vy = 0;
                        player.grounded = true;
                        player.x += (ent.vx || 0) * dt; // Ride platform velocity
                    }
                }
            }
        });
    }

    checkSensors(player, grid, tileSize, entities, levelManager) {
        const pRect = player.getRect();
        const center = { x: player.x + player.w / 2, y: player.y + player.h / 2 };

        // 1. Grid Hazards (Tile 2 = Fire/Lava, Tile 3 = Water/Poison, Tile 4 = Acid)
        const col = Math.floor(center.x / tileSize);
        const row = Math.floor(center.y / tileSize);

        if (grid[row] && grid[row][col]) {
            const tile = grid[row][col];
            if (tile === 2 && player.role !== 'ates') { player.die(); }
            else if (tile === 3 && player.role !== 'su') { player.die(); }
            else if (tile === 4) { player.die(); }
        }

        // 2. Entity Sensors & Exit Doors
        entities.forEach(ent => {
            if (!PhysicsEngine.intersects(pRect, ent)) return;

            // Danger zones
            if (ent.type.startsWith('danger_')) {
                const dangerRole = ent.type.split('_')[1];
                if (dangerRole !== player.role) {
                    player.die();
                }
            }

            // Target Exit Doors
            if (ent.type === 'exit' && ent.props?.role === player.role) {
                if (center.x > ent.x && center.x < ent.x + ent.w && center.y > ent.y && center.y < ent.y + ent.h) {
                    player.finish();
                }
            }
        });
    }

    updateEntities(entities, players, levelManager, dt) {
        const grid = levelManager ? levelManager.grid : [];
        const tileSize = levelManager ? (levelManager.tileSize || 32) : 32;

        entities.forEach(ent => {
            // Pushable Box Physics
            if (ent.type === 'box') {
                ent.vx = (ent.vx || 0) * 0.85; // Friction
                ent.vy = (ent.vy || 0) + this.gravity * dt;

                ent.x += ent.vx * dt;
                ent.y += ent.vy * dt;

                // Simple floor collision for box
                const col = Math.floor((ent.x + ent.w / 2) / tileSize);
                const row = Math.floor((ent.y + ent.h) / tileSize);
                if (grid[row] && grid[row][col] === 1) {
                    ent.y = row * tileSize - ent.h;
                    ent.vy = 0;
                }
            }
            // Moving Platform Logic
            else if (ent.type === 'moving_platform' && ent.active) {
                ent.startX = ent.startX || ent.x;
                ent.endX = ent.endX || ent.x + (ent.rangeX || 200);
                ent.speed = ent.speed || 100;
                ent.dir = ent.dir || 1;

                ent.vx = ent.speed * ent.dir;
                ent.x += ent.vx * dt;

                if (ent.x >= ent.endX) { ent.x = ent.endX; ent.dir = -1; }
                else if (ent.x <= ent.startX) { ent.x = ent.startX; ent.dir = 1; }
            }
        });
    }
}

window.PhysicsEngine = PhysicsEngine;
