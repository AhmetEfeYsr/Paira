/**
 * LevelManager.js
 * Manages 1-Player Tutorials, 2-Player, 3-Player, and 4-Player Co-Op Master levels.
 * Zero-Softlock Guaranteed: All pits contain hazard liquids (instant respawn) or escape updrafts.
 */

class LevelManager {
    constructor() {
        this.currentLevelId = 'map_4_1';
        this.tileSize = 32;
        this.grid = [];
        this.entities = [];
        this.spawns = {};
        this.width = 1600;
        this.height = 900;

        this.levels = this.getBuiltInLevels();
    }

    loadLevel(levelId) {
        const levelData = this.levels[levelId] || window.MAPS?.[levelId] || this.levels['map_4_1'];
        this.currentLevelId = levelId;
        this.tileSize = levelData.tileSize || 32;
        this.width = levelData.width || 1600;
        this.height = levelData.height || 900;

        // Clone grid structure if function or array
        if (typeof levelData.grid === 'function') {
            this.grid = levelData.grid();
        } else {
            this.grid = JSON.parse(JSON.stringify(levelData.grid || []));
        }

        // Clone entity structures
        this.entities = JSON.parse(JSON.stringify(levelData.entities || []));
        // Spawns
        this.spawns = JSON.parse(JSON.stringify(levelData.spawns || {}));

        return levelData;
    }

    getBuiltInLevels() {
        return {
            // ==========================================
            // 1. ATEŞ ÖĞRETİCİ (Fire Tutorial)
            // ==========================================
            'map_1_1': {
                name: "1. Bölüm: Ateş'in Yolu (Ateş Öğreticisi)",
                tileSize: 32, width: 1200, height: 800,
                spawns: { ates: { x: 100, y: 500 }, su: { x: 100, y: 500 }, hava: { x: 100, y: 500 }, elektrik: { x: 100, y: 500 } },
                grid: this.createGridWithWood(38, 25),
                entities: [
                    { type: 'box', x: 17*32, y: 17*32, w: 32, h: 32, props: { resistance: 0.8 } },
                    { type: 'button', x: 24*32, y: 18*32 - 8, w: 32, h: 16, props: { color: '#ef4444', targetId: 'gate_1', requiresWeight: true } },
                    { type: 'door', x: 26*32, y: 12*32, w: 32, h: 32*6, props: { id: 'gate_1', color: '#dc2626', open: false } },
                    { type: 'exit', x: 32*32, y: 14*32, w: 64, h: 64, props: { role: 'any' } }
                ]
            },

            // ==========================================
            // 2. SU ÖĞRETİCİ (Water Pipe Tutorial)
            // ==========================================
            'map_1_2': {
                name: "2. Bölüm: Su Süzülüşü (Boru Öğreticisi)",
                tileSize: 32, width: 1200, height: 800,
                spawns: { ates: { x: 100, y: 450 }, su: { x: 100, y: 450 }, hava: { x: 100, y: 450 }, elektrik: { x: 100, y: 450 } },
                grid: this.createGridWithPipes(38, 25),
                entities: [
                    { type: 'exit', x: 1000, y: 224, w: 64, h: 64, props: { role: 'su' } },
                    { type: 'exit', x: 1000, y: 224, w: 64, h: 64, props: { role: 'ates' } },
                    { type: 'exit', x: 1000, y: 224, w: 64, h: 64, props: { role: 'hava' } },
                    { type: 'exit', x: 1000, y: 224, w: 64, h: 64, props: { role: 'elektrik' } }
                ]
            },

            // ==========================================
            // 3. HAVA ÖĞRETİCİ (Air Updraft Tutorial)
            // ==========================================
            'map_1_3': {
                name: "3. Bölüm: Havanın Süzülüşü (Rüzgar Öğreticisi)",
                tileSize: 32, width: 1200, height: 800,
                spawns: { ates: { x: 100, y: 550 }, su: { x: 100, y: 550 }, hava: { x: 100, y: 550 }, elektrik: { x: 100, y: 550 } },
                grid: this.createGridWithWind(38, 25),
                entities: [
                    { type: 'exit', x: 1000, y: 160, w: 64, h: 64, props: { role: 'hava' } },
                    { type: 'exit', x: 1000, y: 160, w: 64, h: 64, props: { role: 'ates' } },
                    { type: 'exit', x: 1000, y: 160, w: 64, h: 64, props: { role: 'su' } },
                    { type: 'exit', x: 1000, y: 160, w: 64, h: 64, props: { role: 'elektrik' } }
                ]
            },

            // ==========================================
            // 4. ELEKTRİK ÖĞRETİCİ (Electricity Tutorial)
            // ==========================================
            'map_1_4': {
                name: "4. Bölüm: Elektrik Akımı (Şalter Öğreticisi)",
                tileSize: 32, width: 1200, height: 800,
                spawns: { ates: { x: 100, y: 450 }, su: { x: 100, y: 450 }, hava: { x: 100, y: 450 }, elektrik: { x: 100, y: 450 } },
                grid: this.createGridWithElectricPanel(38, 25),
                entities: [
                    { type: 'electric_panel', x: 400, y: 448, w: 32, h: 32, props: { targetId: 'door_e1' } },
                    { type: 'electric_door', x: 700, y: 320, w: 32, h: 160, props: { id: 'door_e1', open: false } },
                    { type: 'exit', x: 1000, y: 416, w: 64, h: 64, props: { role: 'elektrik' } },
                    { type: 'exit', x: 1000, y: 416, w: 64, h: 64, props: { role: 'ates' } },
                    { type: 'exit', x: 1000, y: 416, w: 64, h: 64, props: { role: 'su' } },
                    { type: 'exit', x: 1000, y: 416, w: 64, h: 64, props: { role: 'hava' } }
                ]
            },

            // ==========================================
            // 5. 2-PLAYER CO-OP SYNERGY (Ateş + Su)
            // ==========================================
            'map_2_1': {
                name: "Ateş ve Su Yardımlaşması (2-Player)",
                tileSize: 32, width: 1400, height: 850,
                spawns: { ates: { x: 100, y: 550 }, su: { x: 160, y: 550 } },
                grid: this.create2PlayerGrid(44, 26),
                entities: [
                    { type: 'exit', x: 1200, y: 250, w: 64, h: 64, props: { role: 'ates' } },
                    { type: 'exit', x: 1200, y: 450, w: 64, h: 64, props: { role: 'su' } }
                ]
            },

            // ==========================================
            // 6. 3-PLAYER CO-OP SYNERGY (Ateş + Su + Hava)
            // ==========================================
            'map_3_1': {
                name: "Üçlü Element Denzesi (3-Player)",
                tileSize: 32, width: 1500, height: 850,
                spawns: { ates: { x: 100, y: 550 }, su: { x: 160, y: 550 }, hava: { x: 220, y: 550 } },
                grid: this.create3PlayerGrid(47, 26),
                entities: [
                    { type: 'exit', x: 1300, y: 200, w: 64, h: 64, props: { role: 'ates' } },
                    { type: 'exit', x: 1300, y: 350, w: 64, h: 64, props: { role: 'su' } },
                    { type: 'exit', x: 1300, y: 500, w: 64, h: 64, props: { role: 'hava' } }
                ]
            },

            // ==========================================
            // 7. 4-PLAYER MASTER CO-OP SYNERGY (Ateş + Su + Hava + Elektrik)
            // ==========================================
            'map_4_1': {
                name: "4 Element Kadim Tapınağı (4-Player Co-Op)",
                tileSize: 32, width: 1600, height: 900,
                spawns: {
                    ates: { x: 100, y: 650 },
                    su: { x: 160, y: 650 },
                    hava: { x: 220, y: 650 },
                    elektrik: { x: 280, y: 650 }
                },
                grid: this.create4PlayerMasterGrid(50, 28),
                entities: [
                    { type: 'electric_panel', x: 450, y: 648, w: 32, h: 32, props: { targetId: 'door_master' } },
                    { type: 'electric_door', x: 600, y: 512, w: 32, h: 192, props: { id: 'door_master', open: false } },
                    { type: 'moving_platform', x: 700, y: 450, w: 128, h: 20, active: false, rangeX: 300, speed: 120, props: { id: 'door_master' } },

                    { type: 'exit', x: 1400, y: 200, w: 64, h: 64, props: { role: 'ates' } },
                    { type: 'exit', x: 1400, y: 320, w: 64, h: 64, props: { role: 'su' } },
                    { type: 'exit', x: 1400, y: 440, w: 64, h: 64, props: { role: 'hava' } },
                    { type: 'exit', x: 1400, y: 560, w: 64, h: 64, props: { role: 'elektrik' } }
                ]
            }
        };
    }

    createStandardBaseGrid(w, h) {
        let grid = [];
        for (let y = 0; y < h; y++) {
            let row = [];
            for (let x = 0; x < w; x++) {
                if (y === 0 || y === h - 1 || x === 0 || x === w - 1) row.push(1);
                else if (y === 16) row.push(1); // Floor
                else if (y > 16 && y < h - 1) row.push(2); // Lava hazard floor at bottom for instant respawn!
                else row.push(0);
            }
            grid.push(row);
        }
        return grid;
    }

    createGridWithWood(w, h) {
        let grid = this.createStandardBaseGrid(w, h);
        for (let y = 10; y < 16; y++) grid[y][20] = 7; // Wooden wall
        for (let x = 20; x < 35; x++) grid[16][x] = 1;
        return grid;
    }

    createGridWithPipes(w, h) {
        let grid = this.createStandardBaseGrid(w, h);
        for (let y = 8; y <= 16; y++) grid[y][18] = 8; // Pipe conduit
        for (let x = 18; x < 35; x++) grid[8][x] = 1; // Upper platform
        return grid;
    }

    createGridWithWind(w, h) {
        let grid = this.createStandardBaseGrid(w, h);
        for (let y = 6; y < 16; y++) { grid[y][16] = 6; grid[y][17] = 6; } // Wind updraft
        for (let x = 17; x < 35; x++) grid[6][x] = 1; // High platform
        return grid;
    }

    createGridWithElectricPanel(w, h) {
        let grid = this.createStandardBaseGrid(w, h);
        for (let x = 22; x < 35; x++) grid[16][x] = 1;
        return grid;
    }

    create2PlayerGrid(w, h) {
        let grid = [];
        for (let y = 0; y < h; y++) {
            let row = [];
            for (let x = 0; x < w; x++) {
                if (y === 0 || y === h - 1 || x === 0 || x === w - 1) row.push(1);
                else if (y === 20) row.push(1);
                else if (y > 20 && y < h - 1) row.push(2); // Instant respawn pit
                else row.push(0);
            }
            grid.push(row);
        }
        for (let y = 14; y < 20; y++) grid[y][16] = 7; // Wood wall for Fire
        for (let y = 10; y <= 20; y++) grid[y][26] = 8; // Pipe for Water
        for (let x = 26; x < 40; x++) grid[10][x] = 1;
        return grid;
    }

    create3PlayerGrid(w, h) {
        let grid = this.create2PlayerGrid(w, h);
        for (let y = 6; y < 20; y++) { grid[y][34] = 6; grid[y][35] = 6; } // Wind for Air
        for (let x = 35; x < 44; x++) grid[6][x] = 1;
        return grid;
    }

    create4PlayerMasterGrid(w, h) {
        let grid = [];
        for (let y = 0; y < h; y++) {
            let row = [];
            for (let x = 0; x < w; x++) {
                if (y === 0 || y === h - 1 || x === 0 || x === w - 1) row.push(1);
                else if (y === 22) row.push(1);
                else if (y > 22 && y < h - 1) row.push(2); // Instant respawn hazard pit
                else row.push(0);
            }
            grid.push(row);
        }
        // Wood wall
        for (let y = 17; y < 22; y++) grid[y][16] = 7;
        // Pipe
        for (let y = 12; y <= 22; y++) grid[y][25] = 8;
        // Wind corridor
        for (let y = 7; y <= 22; y++) { grid[y][34] = 6; grid[y][35] = 6; }
        // Platforms
        for (let x = 25; x < 48; x++) grid[12][x] = 1;

        return grid;
    }

    checkAllExitsReached(players) {
        const activePlayers = players.filter(p => p && !p.dead);
        if (!activePlayers.length) return false;
        return activePlayers.every(p => p.finished);
    }
}

window.LevelManager = LevelManager;
