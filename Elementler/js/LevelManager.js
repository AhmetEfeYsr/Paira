/**
 * LevelManager.js
 * Handles tutorial & 4-Player co-op puzzle levels, tile grids, entity maps,
 * exit criteria, and level progression.
 */

class LevelManager {
    constructor() {
        this.currentLevelId = 'tutorial_1';
        this.tileSize = 32;
        this.grid = [];
        this.entities = [];
        this.spawns = {};
        this.width = 1200;
        this.height = 800;

        this.levels = this.getBuiltInLevels();
    }

    loadLevel(levelId) {
        const levelData = this.levels[levelId] || this.levels['tutorial_1'];
        this.currentLevelId = levelId;
        this.tileSize = levelData.tileSize || 32;
        this.width = levelData.width || 1200;
        this.height = levelData.height || 800;

        // Clone grid structure
        this.grid = JSON.parse(JSON.stringify(levelData.grid));
        // Clone entity structures
        this.entities = JSON.parse(JSON.stringify(levelData.entities || []));
        // Spawns
        this.spawns = JSON.parse(JSON.stringify(levelData.spawns || {}));

        return levelData;
    }

    getBuiltInLevels() {
        return {
            // Level 1: Ateş Öğretici (Fire Tutorial)
            'tutorial_ates': {
                name: "Ateşin Gücü (Yakma Öğreticisi)",
                tileSize: 32, width: 1200, height: 800,
                spawns: { ates: { x: 100, y: 450 } },
                grid: this.createGridWithWoodBarrier(38, 25),
                entities: [
                    { type: 'exit', x: 1000, y: 416, w: 64, h: 64, props: { role: 'ates' } }
                ]
            },
            // Level 2: Su Öğretici (Water Pipe Tutorial)
            'tutorial_su': {
                name: "Su Süzülüşü (Boru Öğreticisi)",
                tileSize: 32, width: 1200, height: 800,
                spawns: { su: { x: 100, y: 450 } },
                grid: this.createGridWithPipes(38, 25),
                entities: [
                    { type: 'exit', x: 1000, y: 256, w: 64, h: 64, props: { role: 'su' } }
                ]
            },
            // Level 3: Hava Öğretici (Air Updraft Tutorial)
            'tutorial_hava': {
                name: "Havanın Süzülüşü (Rüzgar Öğreticisi)",
                tileSize: 32, width: 1200, height: 800,
                spawns: { hava: { x: 100, y: 550 } },
                grid: this.createGridWithWind(38, 25),
                entities: [
                    { type: 'exit', x: 1000, y: 192, w: 64, h: 64, props: { role: 'hava' } }
                ]
            },
            // Level 4: Elektrik Öğretici (Electricity Tutorial)
            'tutorial_elektrik': {
                name: "Elektrik Devresi (Şalter Öğreticisi)",
                tileSize: 32, width: 1200, height: 800,
                spawns: { elektrik: { x: 100, y: 450 } },
                grid: this.createStandardGrid(38, 25),
                entities: [
                    { type: 'electric_panel', x: 400, y: 448, w: 32, h: 32, props: { targetId: 'elec_door_1' } },
                    { type: 'electric_door', x: 700, y: 320, w: 32, h: 160, props: { id: 'elec_door_1', open: false } },
                    { type: 'exit', x: 1000, y: 416, w: 64, h: 64, props: { role: 'elektrik' } }
                ]
            },
            // Level 5: 4-Player Master Co-Op Synergy
            'coop_4p_master': {
                name: "4 Element Kadim Tapınağı (4-Player Co-Op)",
                tileSize: 32, width: 1600, height: 900,
                spawns: {
                    ates: { x: 100, y: 650 },
                    su: { x: 160, y: 650 },
                    hava: { x: 220, y: 650 },
                    elektrik: { x: 280, y: 650 }
                },
                grid: this.createCoopMasterGrid(50, 28),
                entities: [
                    // Electrical Panel triggers door
                    { type: 'electric_panel', x: 450, y: 648, w: 32, h: 32, props: { targetId: 'door_a' } },
                    { type: 'electric_door', x: 600, y: 512, w: 32, h: 192, props: { id: 'door_a', open: false } },

                    // Moving Platform
                    { type: 'moving_platform', x: 700, y: 450, w: 128, h: 20, active: false, rangeX: 300, speed: 120, props: { id: 'door_a' } },

                    // Exits for all 4 players
                    { type: 'exit', x: 1400, y: 200, w: 64, h: 64, props: { role: 'ates' } },
                    { type: 'exit', x: 1400, y: 320, w: 64, h: 64, props: { role: 'su' } },
                    { type: 'exit', x: 1400, y: 440, w: 64, h: 64, props: { role: 'hava' } },
                    { type: 'exit', x: 1400, y: 560, w: 64, h: 64, props: { role: 'elektrik' } }
                ]
            }
        };
    }

    createStandardGrid(w, h) {
        let grid = [];
        for (let y = 0; y < h; y++) {
            let row = [];
            for (let x = 0; x < w; x++) {
                if (y === 0 || y === h - 1 || x === 0 || x === w - 1) row.push(1); // Boundary solid wall
                else if (y === 16) row.push(1); // Floor platform
                else row.push(0);
            }
            grid.push(row);
        }
        return grid;
    }

    createGridWithWoodBarrier(w, h) {
        let grid = this.createStandardGrid(w, h);
        // Place wooden wall at column 20
        for (let y = 10; y < 16; y++) {
            grid[y][20] = 7; // Wood tile 7
        }
        return grid;
    }

    createGridWithPipes(w, h) {
        let grid = this.createStandardGrid(w, h);
        // Vertical pipe conduit from floor 16 to floor 9
        for (let y = 9; y <= 16; y++) {
            grid[y][18] = 8; // Pipe tile 8
        }
        for (let x = 18; x < 34; x++) grid[9][x] = 1; // Upper floor
        return grid;
    }

    createGridWithWind(w, h) {
        let grid = this.createStandardGrid(w, h);
        // Vertical wind corridor (Tile 6)
        for (let y = 7; y < 16; y++) {
            grid[y][15] = 6;
            grid[y][16] = 6;
        }
        for (let x = 16; x < 34; x++) grid[7][x] = 1; // Elevated floor
        return grid;
    }

    createCoopMasterGrid(w, h) {
        let grid = [];
        for (let y = 0; y < h; y++) {
            let row = [];
            for (let x = 0; x < w; x++) {
                if (y === 0 || y === h - 1 || x === 0 || x === w - 1) row.push(1);
                else if (y === 22) row.push(1); // Ground floor
                else row.push(0);
            }
            grid.push(row);
        }
        // Wood barrier on ground floor
        for (let y = 17; y < 22; y++) grid[y][18] = 7;
        // Pipe conduit
        for (let y = 12; y <= 22; y++) grid[y][25] = 8;
        // Wind updraft
        for (let y = 8; y <= 22; y++) { grid[y][32] = 6; grid[y][33] = 6; }
        // Upper floor platforms
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
