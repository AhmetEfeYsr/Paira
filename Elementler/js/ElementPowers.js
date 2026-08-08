/**
 * ElementPowers.js
 * Encapsulates the elemental abilities & map interactions:
 * - Fire: Burn wood tiles & obstacles
 * - Water: Slide through narrow pipe networks
 * - Air: Float & ascend in wind corridors / updrafts
 * - Electricity: Activate electric panels, doors & moving platforms
 */

class ElementPowers {
    /**
     * Fire Ability: Destroys adjacent wooden walls/blocks ('tahta_duvar' / Tile 7).
     */
    static triggerFireBurn(player, levelManager) {
        if (!levelManager) return;

        const bounds = {
            x: player.x - 24,
            y: player.y - 24,
            w: player.w + 48,
            h: player.h + 48
        };

        // 1. Check grid tiles for wood (Tile 7)
        if (levelManager.grid && Array.isArray(levelManager.grid)) {
            const tileSize = levelManager.tileSize || 32;
            const startCol = Math.max(0, Math.floor(bounds.x / tileSize));
            const endCol = Math.floor((bounds.x + bounds.w) / tileSize);
            const startRow = Math.max(0, Math.floor(bounds.y / tileSize));
            const endRow = Math.floor((bounds.y + bounds.h) / tileSize);

            for (let r = startRow; r <= endRow; r++) {
                if (r < 0 || r >= levelManager.grid.length) continue;
                for (let c = startCol; c <= endCol; c++) {
                    if (c < 0 || c >= levelManager.grid[r].length) continue;

                    if (levelManager.grid[r][c] === 7) {
                        levelManager.grid[r][c] = 0; // Destroy wood block!

                        if (window.renderEngine) {
                            window.renderEngine.spawnParticles(c * tileSize + 16, r * tileSize + 16, '#ef4444', 16);
                        }
                    }
                }
            }
        }

        // 2. Check Entity list for wooden walls/obstacles
        if (Array.isArray(levelManager.entities)) {
            levelManager.entities.forEach(ent => {
                if (ent.type === 'tahta_duvar' || ent.type === 'wood_block') {
                    if (window.PhysicsEngine && window.PhysicsEngine.intersects(bounds, ent)) {
                        ent.destroyed = true;
                        if (window.renderEngine) {
                            window.renderEngine.spawnParticles(ent.x + ent.w / 2, ent.y + ent.h / 2, '#f97316', 15);
                        }
                    }
                }
            });
            levelManager.entities = levelManager.entities.filter(ent => !ent.destroyed);
        }
    }

    /**
     * Water Ability: Squeezes into pipe entries ('boru' / Tile 8) and slides to exit.
     */
    static triggerWaterPipeConduit(player, levelManager) {
        if (!levelManager || player.inPipe) return;

        const pRect = player.getRect();

        if (levelManager.grid && Array.isArray(levelManager.grid)) {
            const tileSize = levelManager.tileSize || 32;
            const col = Math.floor((player.x + player.w / 2) / tileSize);
            const row = Math.floor((player.y + player.h / 2) / tileSize);

            if (levelManager.grid[row] && levelManager.grid[row][col] === 8) {
                let exitRow = row;
                while (exitRow > 0 && levelManager.grid[exitRow - 1] && levelManager.grid[exitRow - 1][col] === 8) {
                    exitRow--;
                }
                if (exitRow !== row) {
                    player.inPipe = true;
                    player.pipeTarget = { x: col * tileSize, y: (exitRow - 1) * tileSize };
                    if (window.renderEngine) {
                        window.renderEngine.spawnParticles(player.x + 16, player.y + 16, '#3b82f6', 12);
                    }
                }
            }
        }
    }

    /**
     * Air Ability: Glides and floats upwards in wind/updraft corridors (Tile 6).
     */
    static triggerAirUpdraft(player, levelManager, dt) {
        if (!levelManager) return;

        let inWindZone = false;
        if (levelManager.grid && Array.isArray(levelManager.grid)) {
            const tileSize = levelManager.tileSize || 32;
            const col = Math.floor((player.x + player.w / 2) / tileSize);
            const row = Math.floor((player.y + player.h / 2) / tileSize);

            if (levelManager.grid[row] && levelManager.grid[row][col] === 6) {
                inWindZone = true;
            }
        }

        if (inWindZone) {
            player.vy -= 1900 * dt;
            if (player.vy < -400) player.vy = -400;

            if (window.renderEngine && Math.random() < 0.3) {
                window.renderEngine.spawnParticles(player.x + Math.random() * 32, player.y + 32, '#fef08a', 2);
            }
        }
    }

    /**
     * Electricity Ability: Activates electric panels/switches ('electric_panel').
     */
    static triggerElectricCircuit(player, levelManager) {
        if (!levelManager || !levelManager.entities) return;

        const pRect = player.getRect();

        levelManager.entities.forEach(ent => {
            if (ent.type === 'electric_panel' || ent.type === 'electric_switch' || ent.type === 'button') {
                if (window.PhysicsEngine && window.PhysicsEngine.intersects(pRect, ent)) {
                    ent.active = true;
                    const channel = ent.props ? ent.props.targetId : ent.channel;
                    if (channel) {
                        levelManager.entities.forEach(target => {
                            if (target.props && target.props.id === channel) {
                                if (target.type === 'door' || target.type === 'electric_door') {
                                    target.props.open = true;
                                } else if (target.type === 'moving_platform') {
                                    target.active = true;
                                }
                            }
                        });
                    }

                    if (window.renderEngine && Math.random() < 0.2) {
                        window.renderEngine.spawnParticles(ent.x + ent.w / 2, ent.y + ent.h / 2, '#a855f7', 4);
                    }
                }
            }
        });
    }
}

window.ElementPowers = ElementPowers;
