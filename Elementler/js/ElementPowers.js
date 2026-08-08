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
     * Fire Ability: Destroys adjacent wooden walls/blocks ('tahta_duvar' / 'wood').
     */
    static triggerFireBurn(player, levelManager) {
        if (!levelManager || !levelManager.entities) return;

        const bounds = {
            x: player.x - 12,
            y: player.y - 12,
            w: player.w + 24,
            h: player.h + 24
        };

        // Check grid tiles for wood (tile index 7)
        if (levelManager.grid) {
            const tileSize = levelManager.tileSize || 32;
            const startCol = Math.floor(bounds.x / tileSize);
            const endCol = Math.floor((bounds.x + bounds.w) / tileSize);
            const startRow = Math.floor(bounds.y / tileSize);
            const endRow = Math.floor((bounds.y + bounds.h) / tileSize);

            for (let r = startRow; r <= endRow; r++) {
                if (r < 0 || r >= levelManager.grid.length) continue;
                for (let c = startCol; c <= endCol; c++) {
                    if (c < 0 || c >= levelManager.grid[r].length) continue;

                    // Tile 7 = Wooden block
                    if (levelManager.grid[r][c] === 7) {
                        levelManager.grid[r][c] = 0; // Destroy block!

                        // Spawn Ember Particles
                        if (window.renderEngine) {
                            window.renderEngine.spawnParticles(c * tileSize + 16, r * tileSize + 16, '#ef4444', 12);
                        }
                    }
                }
            }
        }

        // Check Entity list for wooden walls/obstacles
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

        // Filter destroyed entities
        levelManager.entities = levelManager.entities.filter(ent => !ent.destroyed);
    }

    /**
     * Water Ability: Squeezes into pipe entries ('boru' / 'pipe_entry') and slides to exit.
     */
    static triggerWaterPipeConduit(player, levelManager) {
        if (!levelManager || player.inPipe) return;

        const pRect = player.getRect();

        // 1. Check tile grid for pipe tiles (Tile 8)
        if (levelManager.grid) {
            const tileSize = levelManager.tileSize || 32;
            const col = Math.floor((player.x + player.w / 2) / tileSize);
            const row = Math.floor((player.y + player.h / 2) / tileSize);

            if (levelManager.grid[row] && levelManager.grid[row][col] === 8) {
                // Find highest connected pipe exit
                let exitRow = row;
                while (exitRow > 0 && levelManager.grid[exitRow - 1] && levelManager.grid[exitRow - 1][col] === 8) {
                    exitRow--;
                }
                if (exitRow !== row) {
                    player.inPipe = true;
                    player.pipeTarget = { x: col * tileSize, y: (exitRow - 1) * tileSize };
                    if (window.renderEngine) {
                        window.renderEngine.spawnParticles(player.x + 16, player.y + 16, '#3b82f6', 10);
                    }
                    return;
                }
            }
        }

        // 2. Check Pipe Entities
        if (levelManager.entities) {
            levelManager.entities.forEach(ent => {
                if (ent.type === 'pipe' || ent.type === 'boru') {
                    if (window.PhysicsEngine && window.PhysicsEngine.intersects(pRect, ent)) {
                        player.inPipe = true;
                        player.pipeTarget = ent.targetExit || { x: ent.x, y: ent.y - 64 };
                        if (window.renderEngine) {
                            window.renderEngine.spawnParticles(player.x + 16, player.y + 16, '#60a5fa', 10);
                        }
                    }
                }
            });
        }
    }

    /**
     * Air Ability: Glides and floats upwards when inside wind/updraft corridors ('firtina' / 'updraft').
     */
    static triggerAirUpdraft(player, levelManager, dt) {
        if (!levelManager) return;

        const pRect = player.getRect();
        let inWindZone = false;

        // Check grid for wind/updraft tiles (Tile 6)
        if (levelManager.grid) {
            const tileSize = levelManager.tileSize || 32;
            const col = Math.floor((player.x + player.w / 2) / tileSize);
            const row = Math.floor((player.y + player.h / 2) / tileSize);

            if (levelManager.grid[row] && levelManager.grid[row][col] === 6) {
                inWindZone = true;
            }
        }

        // Check Entities for updraft corridors
        if (levelManager.entities) {
            levelManager.entities.forEach(ent => {
                if (ent.type === 'updraft' || ent.type === 'firtina') {
                    if (window.PhysicsEngine && window.PhysicsEngine.intersects(pRect, ent)) {
                        inWindZone = true;
                    }
                }
            });
        }

        if (inWindZone) {
            // Apply strong upward acceleration & drift
            player.vy -= 1800 * dt;
            if (player.vy < -380) player.vy = -380; // Limit max upward speed

            if (window.renderEngine && Math.random() < 0.3) {
                window.renderEngine.spawnParticles(player.x + Math.random() * 32, player.y + 32, '#fef08a', 2);
            }
        }
    }

    /**
     * Electricity Ability: Activates electric panels/switches ('electric_panel'), powering circuits,
     * opening electric doors ('electric_door') and toggling moving platforms ('moving_platform').
     */
    static triggerElectricCircuit(player, levelManager) {
        if (!levelManager || !levelManager.entities) return;

        const pRect = player.getRect();

        levelManager.entities.forEach(ent => {
            // Electric Panel or Switch
            if (ent.type === 'electric_panel' || ent.type === 'electric_switch' || ent.type === 'button') {
                if (window.PhysicsEngine && window.PhysicsEngine.intersects(pRect, ent)) {
                    ent.active = true;
                    ent.timer = 0.5; // Stays active for at least 0.5s or continuously while touched

                    // Find connected doors / platforms with matching channel/targetId
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
