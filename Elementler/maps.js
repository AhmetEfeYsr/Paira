// maps.js - Harita Verileri, Dallanma (Branching) ve Fizik Objeleri Tanımları
// Değerler:
// 0: Boş, 1: Solid (Duvar), 2: Ateş (Lav), 3: Su (Zehir), 4: Doğa (Asit), 5: Sarmaşık, 6: Fırtına, 7: Tahta Duvar, 8: Boru

function createGrid(w, h, outline = true) {
    let grid = [];
    for(let y=0; y<h; y++) {
        let row = [];
        for(let x=0; x<w; x++) {
            if(outline && (y===0 || y===h-1 || x===0 || x===w-1)) row.push(1);
            else row.push(0);
        }
        grid.push(row);
    }
    return grid;
}

const TILE = 32;

window.MAPS = {
    // ==================================================================
    // 1 KİŞİLİK HARİTALAR (Su Elementi, Ağaç Yapısı) Toplam: 16
    // Ağaç Koordinatları (treeX, treeY): 0-100% arası görsel pozisyon
    // unlocks: [] dizisi başarıldığında hangi ID'lerin açılacağını belirtir.
    // ==================================================================

    "map_1_1": {
        name: "Su'nun Uyanışı", treeX: 50, treeY: 90, type: 'hexagon',
        unlocks: ["map_1_2", "map_1_3"],
        width: 1200, height: 800,
        grid: (function() {
            let g = createGrid(38, 25);
            for(let x=2; x<15; x++) g[15][x] = 1; // Başlangıç
            for(let x=18; x<30; x++) g[20][x] = 1; // Alt platform
            for(let x=25; x<35; x++) g[10][x] = 1; // Çıkış platformu
            for(let y=15; y<20; y++) g[y][18] = 8; // Boru
            return g;
        })(),
        spawns: { su: { x: 100, y: 400 } },
        entities: [ { type: 'exit', x: 28*TILE, y: 8*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } } ]
    },

    "map_1_2": {
        name: "Kutu ve Denge", treeX: 35, treeY: 75, type: 'hexagon',
        unlocks: ["map_1_4", "map_1_5"],
        width: 1200, height: 800,
        grid: (function() {
            let g = createGrid(38, 25);
            for(let x=2; x<8; x++) g[20][x] = 1;
            for(let x=10; x<16; x++) g[18][x] = 1;
            for(let x=26; x<34; x++) g[20][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 100, y: 550 } },
        entities: [
            { type: 'seesaw', x: 16*TILE, y: 18*TILE, w: TILE*8, h: TILE/2, props: {} },
            { type: 'box', x: 4*TILE, y: 18*TILE, w: TILE, h: TILE, props: { resistance: 0.8 } },
            { type: 'button', x: 30*TILE, y: 20*TILE, w: TILE, h: TILE/2, props: { color: '#3b82f6', targetId: 'door_1', requiresWeight: true } },
            { type: 'door', x: 32*TILE, y: 15*TILE, w: TILE, h: TILE*5, props: { id: 'door_1', color: '#1e293b' } },
            { type: 'exit', x: 33*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_3": {
        name: "Ateş Çukuru", treeX: 65, treeY: 75, type: 'hexagon',
        unlocks: ["map_1_6", "map_1_7"],
        width: 1500, height: 800,
        grid: (function() {
            let g = createGrid(46, 25);
            for(let x=2; x<8; x++) g[20][x] = 1;
            for(let x=8; x<25; x++) g[23][x] = 1;
            for(let x=8; x<25; x++) g[22][x] = 2; // Lav havuzu (su ölür)
            for(let x=28; x<40; x++) g[15][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 100, y: 550 } },
        entities: [
            { type: 'box', x: 6*TILE, y: 18*TILE, w: TILE, h: TILE, props: { resistance: 0.9 } },
            { type: 'box', x: 5*TILE, y: 16*TILE, w: TILE, h: TILE, props: { resistance: 0.9 } },
            { type: 'seesaw', x: 18*TILE, y: 15*TILE, w: TILE*8, h: TILE/2, props: {} },
            { type: 'exit', x: 35*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_4": {
        name: "Tahterevalli Dansı", treeX: 20, treeY: 60, type: 'diamond',
        unlocks: ["map_1_8"],
        width: 1600, height: 900,
        grid: (function() {
            let g = createGrid(50, 28);
            for(let x=2; x<8; x++) g[20][x] = 1;
            for(let x=16; x<20; x++) g[15][x] = 1;
            for(let x=28; x<32; x++) g[22][x] = 1;
            for(let x=40; x<48; x++) g[18][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 18*TILE } },
        entities: [
            { type: 'seesaw', x: 8*TILE, y: 20*TILE, w: TILE*8, h: TILE/2, props: {} },
            { type: 'seesaw', x: 20*TILE, y: 15*TILE, w: TILE*8, h: TILE/2, props: {} },
            { type: 'seesaw', x: 32*TILE, y: 22*TILE, w: TILE*8, h: TILE/2, props: {} },
            { type: 'box', x: 5*TILE, y: 18*TILE, w: TILE, h: TILE, props: {} },
            { type: 'exit', x: 45*TILE, y: 16*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_5": {
        name: "Çift Kutu Zekası", treeX: 40, treeY: 55, type: 'diamond',
        unlocks: ["map_1_9"],
        width: 1400, height: 900,
        grid: (function() {
            let g = createGrid(43, 28);
            for(let x=2; x<12; x++) g[20][x] = 1;
            for(let x=15; x<25; x++) g[24][x] = 1;
            for(let x=28; x<40; x++) g[14][x] = 1;
            for(let y=18; y<24; y++) g[y][25] = 1; // Duvar
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE } },
        entities: [
            { type: 'box', x: 8*TILE, y: 18*TILE, w: TILE, h: TILE, props: {} },
            { type: 'box', x: 10*TILE, y: 18*TILE, w: TILE, h: TILE, props: {} },
            { type: 'button', x: 20*TILE, y: 24*TILE, w: TILE, h: TILE/2, props: { color: '#3b82f6', targetId: 'door_x', requiresWeight: true } },
            { type: 'door', x: 30*TILE, y: 9*TILE, w: TILE, h: TILE*5, props: { id: 'door_x', color: '#1e293b' } },
            { type: 'exit', x: 36*TILE, y: 12*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_6": {
        name: "Boru Tesisatı", treeX: 60, treeY: 55, type: 'diamond',
        unlocks: ["map_1_10"],
        width: 1400, height: 900,
        grid: (function() {
            let g = createGrid(43, 28);
            for(let x=2; x<10; x++) g[20][x] = 1;
            for(let y=15; y<22; y++) g[y][15] = 1; // Engel 1
            for(let y=20; y<25; y++) g[y][15] = 8; // Boru geçidi
            for(let x=18; x<25; x++) g[25][x] = 1;
            for(let y=10; y<22; y++) g[y][28] = 8; // Dik boru
            for(let x=30; x<40; x++) g[10][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 18*TILE } },
        entities: [
            { type: 'box', x: 6*TILE, y: 18*TILE, w: TILE, h: TILE, props: {} }, // Kutuyu iterek boruya zıplama
            { type: 'exit', x: 35*TILE, y: 8*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_7": {
        name: "Asit Sarkaçları", treeX: 80, treeY: 60, type: 'diamond',
        unlocks: ["map_1_11"],
        width: 1800, height: 900,
        grid: (function() {
            let g = createGrid(56, 28);
            for(let x=2; x<8; x++) g[20][x] = 1;
            for(let x=10; x<40; x++) g[26][x] = 4; // Yeşil Asit Okyanusu
            for(let x=45; x<52; x++) g[15][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 18*TILE } },
        entities: [
            { type: 'seesaw', x: 10*TILE, y: 20*TILE, w: TILE*10, h: TILE/2, props: {} },
            { type: 'seesaw', x: 22*TILE, y: 18*TILE, w: TILE*10, h: TILE/2, props: {} },
            { type: 'seesaw', x: 34*TILE, y: 16*TILE, w: TILE*10, h: TILE/2, props: {} },
            { type: 'exit', x: 48*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_8": {
        name: "Tetik Mekaniği", treeX: 10, treeY: 40, type: 'hexagon',
        unlocks: ["map_1_12"],
        width: 1400, height: 1000,
        grid: (function() {
            let g = createGrid(43, 31);
            for(let x=2; x<10; x++) g[15][x] = 1;
            for(let x=15; x<25; x++) g[28][x] = 1;
            for(let x=30; x<40; x++) g[15][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 13*TILE } },
        entities: [
            { type: 'box', x: 8*TILE, y: 13*TILE, w: TILE, h: TILE, props: {} },
            { type: 'button', x: 20*TILE, y: 28*TILE, w: TILE, h: TILE/2, props: { color: '#ef4444', targetId: 'door_a', requiresWeight: true } },
            { type: 'door', x: 35*TILE, y: 10*TILE, w: TILE, h: TILE*5, props: { id: 'door_a', color: '#1e293b' } },
            { type: 'exit', x: 37*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_9": {
        name: "Yükselen Su", treeX: 30, treeY: 35, type: 'hexagon',
        unlocks: ["map_1_12", "map_1_13"],
        width: 1400, height: 1200,
        grid: (function() {
            let g = createGrid(43, 37);
            for(let x=2; x<8; x++) g[32][x] = 1;
            for(let x=12; x<18; x++) g[26][x] = 1;
            for(let x=22; x<28; x++) g[20][x] = 1;
            for(let x=32; x<38; x++) g[14][x] = 1;
            for(let y=14; y<35; y++) g[y][10] = 8; // Dikey Boru
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 30*TILE } },
        entities: [
            { type: 'box', x: 6*TILE, y: 30*TILE, w: TILE, h: TILE, props: {} },
            { type: 'seesaw', x: 23*TILE, y: 20*TILE, w: TILE*8, h: TILE/2, props: {} },
            { type: 'exit', x: 35*TILE, y: 12*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_10": {
        name: "Dar Koridor", treeX: 70, treeY: 35, type: 'hexagon',
        unlocks: ["map_1_14", "map_1_15"],
        width: 2000, height: 800,
        grid: (function() {
            let g = createGrid(62, 25);
            for(let x=2; x<8; x++) g[20][x] = 1;
            for(let x=10; x<55; x++) g[15][x] = 1; // Uzun köprü
            for(let x=10; x<55; x++) g[16][x] = 2; // Altında lav var
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 18*TILE } },
        entities: [
            { type: 'box', x: 12*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { resistance: 0.95 } },
            { type: 'box', x: 20*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { resistance: 0.95 } },
            { type: 'box', x: 30*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { resistance: 0.95 } },
            { type: 'button', x: 45*TILE, y: 15*TILE, w: TILE, h: TILE/2, props: { color: '#3b82f6', targetId: 'door_k', requiresWeight: true } },
            { type: 'door', x: 50*TILE, y: 10*TILE, w: TILE, h: TILE*5, props: { id: 'door_k', color: '#1e293b' } },
            { type: 'exit', x: 53*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_11": {
        name: "Kutu Yağmuru", treeX: 90, treeY: 40, type: 'hexagon',
        unlocks: ["map_1_15"],
        width: 1400, height: 1200,
        grid: (function() {
            let g = createGrid(43, 37);
            for(let x=2; x<8; x++) g[10][x] = 1; // Spawn üstte
            for(let x=15; x<25; x++) g[20][x] = 1;
            for(let x=30; x<40; x++) g[32][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 8*TILE } },
        entities: [
            { type: 'box', x: 6*TILE, y: 8*TILE, w: TILE, h: TILE, props: {} },
            { type: 'seesaw', x: 15*TILE, y: 20*TILE, w: TILE*10, h: TILE/2, props: {} },
            { type: 'button', x: 20*TILE, y: 20*TILE, w: TILE, h: TILE/2, props: { color: '#ef4444', targetId: 'door_r', requiresWeight: true } },
            { type: 'door', x: 35*TILE, y: 27*TILE, w: TILE, h: TILE*5, props: { id: 'door_r', color: '#1e293b' } },
            { type: 'exit', x: 37*TILE, y: 30*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_12": {
        name: "Zamanla Yarış", treeX: 20, treeY: 20, type: 'diamond',
        unlocks: ["map_1_16"],
        width: 1800, height: 800,
        grid: (function() {
            let g = createGrid(56, 25);
            for(let x=2; x<8; x++) g[20][x] = 1;
            for(let x=15; x<40; x++) g[23][x] = 1; // Hızlı koşulacak zemin
            for(let x=45; x<52; x++) g[15][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 18*TILE } },
        entities: [
            { type: 'button', x: 6*TILE, y: 20*TILE, w: TILE, h: TILE/2, props: { color: '#3b82f6', targetId: 'door_t', requiresWeight: false } }, // Kalıcı
            { type: 'door', x: 40*TILE, y: 18*TILE, w: TILE, h: TILE*5, props: { id: 'door_t', color: '#1e293b' } },
            { type: 'seesaw', x: 42*TILE, y: 20*TILE, w: TILE*6, h: TILE/2, props: {} },
            { type: 'exit', x: 48*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_13": {
        name: "Üç Dengeleyici", treeX: 40, treeY: 15, type: 'diamond',
        unlocks: ["map_1_16"],
        width: 1800, height: 1000,
        grid: (function() {
            let g = createGrid(56, 31);
            for(let x=2; x<8; x++) g[25][x] = 1;
            for(let x=48; x<54; x++) g[15][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 23*TILE } },
        entities: [
            { type: 'box', x: 6*TILE, y: 23*TILE, w: TILE, h: TILE, props: {} },
            { type: 'seesaw', x: 10*TILE, y: 25*TILE, w: TILE*8, h: TILE/2, props: {} },
            { type: 'seesaw', x: 22*TILE, y: 22*TILE, w: TILE*8, h: TILE/2, props: {} },
            { type: 'seesaw', x: 34*TILE, y: 19*TILE, w: TILE*8, h: TILE/2, props: {} },
            { type: 'exit', x: 50*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_14": {
        name: "Kör Düğüm", treeX: 60, treeY: 15, type: 'diamond',
        unlocks: ["map_1_16"],
        width: 1600, height: 1200,
        grid: (function() {
            let g = createGrid(50, 37);
            for(let x=2; x<10; x++) g[30][x] = 1;
            for(let x=20; x<30; x++) g[20][x] = 1;
            for(let x=40; x<48; x++) g[10][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 28*TILE } },
        entities: [
            { type: 'button', x: 25*TILE, y: 20*TILE, w: TILE, h: TILE/2, props: { color: '#3b82f6', targetId: 'door_n', requiresWeight: true } },
            { type: 'box', x: 8*TILE, y: 28*TILE, w: TILE, h: TILE, props: {} }, // Kutuyu 20.kata çıkarmak gerekecek
            { type: 'door', x: 38*TILE, y: 5*TILE, w: TILE, h: TILE*5, props: { id: 'door_n', color: '#1e293b' } },
            { type: 'exit', x: 44*TILE, y: 8*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_15": {
        name: "Lava Köprüsü", treeX: 80, treeY: 20, type: 'diamond',
        unlocks: ["map_1_16"],
        width: 2000, height: 800,
        grid: (function() {
            let g = createGrid(62, 25);
            for(let x=2; x<8; x++) g[20][x] = 1;
            for(let x=10; x<55; x++) g[24][x] = 2; // Zemin full lav
            for(let x=55; x<60; x++) g[20][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 18*TILE } },
        entities: [
            { type: 'box', x: 6*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { resistance: 0.95 } },
            { type: 'seesaw', x: 15*TILE, y: 20*TILE, w: TILE*10, h: TILE/2, props: {} },
            { type: 'seesaw', x: 30*TILE, y: 20*TILE, w: TILE*10, h: TILE/2, props: {} },
            { type: 'seesaw', x: 45*TILE, y: 20*TILE, w: TILE*10, h: TILE/2, props: {} },
            { type: 'exit', x: 56*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    "map_1_16": {
        name: "Su Tapınağı", treeX: 50, treeY: 5, type: 'hexagon',
        unlocks: [], // Bitiş
        width: 2400, height: 1600,
        grid: (function() {
            let g = createGrid(75, 50);
            // Dev Labirent & Final
            for(let x=2; x<10; x++) g[40][x] = 1;
            for(let x=15; x<25; x++) g[35][x] = 1;
            for(let x=30; x<40; x++) g[30][x] = 1;
            for(let x=45; x<55; x++) g[25][x] = 1;
            for(let x=60; x<70; x++) g[20][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 4*TILE, y: 38*TILE } },
        entities: [
            { type: 'box', x: 8*TILE, y: 38*TILE, w: TILE*2, h: TILE*2, props: {} },
            { type: 'seesaw', x: 27*TILE, y: 32*TILE, w: TILE*6, h: TILE/2, props: {} },
            { type: 'seesaw', x: 42*TILE, y: 27*TILE, w: TILE*6, h: TILE/2, props: {} },
            { type: 'seesaw', x: 57*TILE, y: 22*TILE, w: TILE*6, h: TILE/2, props: {} },
            { type: 'button', x: 65*TILE, y: 20*TILE, w: TILE, h: TILE/2, props: { color: '#facc15', targetId: 'door_z', requiresWeight: true } },
            { type: 'door', x: 68*TILE, y: 15*TILE, w: TILE, h: TILE*5, props: { id: 'door_z', color: '#1e293b' } },
            { type: 'exit', x: 69*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    // ==================================================================
    // 2 KİŞİLİK HARİTALAR (Ateş ve Su, Ağaç Yapısı) Toplam: 16
    // Asimetrik/İşbirlikçi: 10 bölüm, Simetrik/Birlikte: 6 bölüm
    // ==================================================================
    "map_2_1": {
        name: "İlk Temas (Simetrik)", treeX: 50, treeY: 90, type: 'hexagon',
        unlocks: ["map_2_2", "map_2_3"], width: 1200, height: 800,
        grid: (function(){ let g = createGrid(38,25); for(let x=2;x<35;x++)g[20][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE } },
        entities: [ {type:'exit',x:30*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:33*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}} ]
    },
    "map_2_2": {
        name: "Ateşin Yolu (Asimetrik)", treeX: 35, treeY: 75, type: 'hexagon',
        unlocks: ["map_2_4"], width: 1400, height: 800,
        grid: (function(){
            let g = createGrid(43,25);
            for(let x=2;x<10;x++)g[20][x]=1; for(let x=10;x<25;x++){g[20][x]=1; g[19][x]=2;} // Lav havuzu
            for(let x=25;x<40;x++)g[20][x]=1; return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE } },
        entities: [
            {type:'button',x:26*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_a',requiresWeight:false}}, // Ateş lavdan geçip basar
            {type:'door',x:12*TILE,y:10*TILE,w:TILE,h:TILE*5,props:{id:'door_a',color:'#1e293b'}}, // Su'nun kapısı açılır (örnek)
            {type:'exit',x:8*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:36*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_3": {
        name: "Suyun Yolu (Asimetrik)", treeX: 65, treeY: 75, type: 'hexagon',
        unlocks: ["map_2_5"], width: 1400, height: 800,
        grid: (function(){
            let g = createGrid(43,25);
            for(let x=2;x<10;x++)g[20][x]=1; for(let x=10;x<25;x++){g[20][x]=1; g[19][x]=3;} // Su havuzu
            for(let x=25;x<40;x++)g[20][x]=1; return g;
        })(),
        spawns: { su: { x: 5*TILE, y: 18*TILE }, ates: { x: 3*TILE, y: 18*TILE } },
        entities: [
            {type:'button',x:26*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_b',requiresWeight:false}}, // Su sudan geçip basar
            {type:'door',x:12*TILE,y:10*TILE,w:TILE,h:TILE*5,props:{id:'door_b',color:'#1e293b'}},
            {type:'exit',x:36*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:8*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_4": {
        name: "Çifte Tahterevalli (Simetrik)", treeX: 20, treeY: 60, type: 'diamond',
        unlocks: ["map_2_6", "map_2_7"], width: 1600, height: 900,
        grid: (function(){
            let g=createGrid(50,28); for(let x=2;x<8;x++)g[20][x]=1; for(let x=15;x<25;x++)g[24][x]=1; for(let x=35;x<45;x++)g[18][x]=1; return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE } },
        entities: [
            {type:'seesaw',x:8*TILE,y:20*TILE,w:TILE*8,h:TILE/2,props:{}}, {type:'seesaw',x:25*TILE,y:22*TILE,w:TILE*8,h:TILE/2,props:{}},
            {type:'exit',x:40*TILE,y:16*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:43*TILE,y:16*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_5": {
        name: "Asit Yağmuru (Simetrik)", treeX: 80, treeY: 60, type: 'diamond',
        unlocks: ["map_2_7", "map_2_8"], width: 1600, height: 900,
        grid: (function(){
            let g=createGrid(50,28); for(let x=2;x<10;x++)g[20][x]=1; for(let x=12;x<38;x++)g[26][x]=4; for(let x=40;x<48;x++)g[20][x]=1; return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE } },
        entities: [
            {type:'seesaw',x:15*TILE,y:20*TILE,w:TILE*20,h:TILE/2,props:{}}, // Dev tahterevalli asit üstünde
            {type:'exit',x:42*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:45*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_6": {
        name: "Kutu ve Köprü (Asimetrik)", treeX: 10, treeY: 45, type: 'hexagon',
        unlocks: ["map_2_9"], width: 1600, height: 1000,
        grid: (function(){ let g=createGrid(50,31); for(let x=2;x<20;x++)g[20][x]=1; for(let x=20;x<30;x++){g[20][x]=1;g[19][x]=2;} for(let x=30;x<48;x++)g[20][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE } },
        entities: [
            {type:'box',x:8*TILE,y:18*TILE,w:TILE,h:TILE,props:{}}, // Su bu kutuyu iterek lavı kapatmak/köprü yapmak isteyecek ama kutu lavda yok olmuyor, üstüne basılır.
            {type:'exit',x:40*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:43*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_7": {
        name: "Kilitli Kapılar (Asimetrik)", treeX: 50, treeY: 45, type: 'hexagon',
        unlocks: ["map_2_10", "map_2_11"], width: 1600, height: 1000,
        grid: (function(){ let g=createGrid(50,31); for(let x=2;x<48;x++)g[20][x]=1; for(let y=10;y<20;y++){g[y][25]=1;} return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 45*TILE, y: 18*TILE } }, // Ayrı başlıyorlar
        entities: [
            {type:'button',x:10*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_ates',requiresWeight:true}},
            {type:'button',x:38*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_su',requiresWeight:true}},
            {type:'door',x:20*TILE,y:15*TILE,w:TILE,h:TILE*5,props:{id:'door_su',color:'#1e293b'}},
            {type:'door',x:30*TILE,y:15*TILE,w:TILE,h:TILE*5,props:{id:'door_ates',color:'#1e293b'}},
            {type:'exit',x:22*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:27*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_8": {
        name: "Karanlık Boru (Asimetrik)", treeX: 90, treeY: 45, type: 'hexagon',
        unlocks: ["map_2_12"], width: 1600, height: 1000,
        grid: (function(){ let g=createGrid(50,31); for(let x=2;x<10;x++)g[20][x]=1; for(let y=15;y<25;y++)g[y][15]=8; /*Boru*/ for(let x=20;x<48;x++)g[25][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE } },
        entities: [
            {type:'button',x:25*TILE,y:25*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_ates2',requiresWeight:false}}, // Su borudan geçer basar
            {type:'door',x:12*TILE,y:15*TILE,w:TILE,h:TILE*5,props:{id:'door_ates2',color:'#1e293b'}}, // Ateşin yolu açılır
            {type:'exit',x:40*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:43*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_9": {
        name: "Çifte Tehlike (Simetrik)", treeX: 25, treeY: 30, type: 'diamond',
        unlocks: ["map_2_13"], width: 1800, height: 1000,
        grid: (function(){ let g=createGrid(56,31); for(let x=2;x<10;x++)g[20][x]=1; for(let x=10;x<20;x++){g[20][x]=1;g[19][x]=2;} for(let x=25;x<35;x++){g[20][x]=1;g[19][x]=3;} for(let x=40;x<50;x++)g[20][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE } },
        entities: [
            {type:'box',x:8*TILE,y:18*TILE,w:TILE,h:TILE,props:{}}, // Su kutuyu itip ateş lavı geçer
            {type:'box',x:38*TILE,y:18*TILE,w:TILE,h:TILE,props:{}}, // Ateş kutuyu itip su suyu geçer (tersten iter) - zeka gerektirir
            {type:'exit',x:45*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:48*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_10": {
        name: "Yüksek Platformlar (Asimetrik)", treeX: 40, treeY: 30, type: 'diamond',
        unlocks: ["map_2_14"], width: 1800, height: 1000,
        grid: (function(){ let g=createGrid(56,31); for(let x=2;x<10;x++)g[25][x]=1; for(let x=15;x<25;x++)g[18][x]=1; for(let x=30;x<40;x++)g[12][x]=1; for(let x=45;x<54;x++)g[25][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 23*TILE }, ates: { x: 5*TILE, y: 23*TILE } },
        entities: [
            {type:'seesaw',x:10*TILE,y:25*TILE,w:TILE*6,h:TILE/2,props:{}},
            {type:'seesaw',x:25*TILE,y:18*TILE,w:TILE*6,h:TILE/2,props:{}},
            {type:'button',x:35*TILE,y:12*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_su3',requiresWeight:true}}, // Sadece biri çıkıp diğerine kapı açar
            {type:'door',x:42*TILE,y:20*TILE,w:TILE,h:TILE*5,props:{id:'door_su3',color:'#1e293b'}},
            {type:'exit',x:46*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:49*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_11": {
        name: "Dar Alan İşbirliği (Asimetrik)", treeX: 60, treeY: 30, type: 'diamond',
        unlocks: ["map_2_14"], width: 1800, height: 1000,
        grid: (function(){ let g=createGrid(56,31); for(let x=2;x<25;x++)g[20][x]=1; for(let x=30;x<54;x++)g[20][x]=1; for(let y=10;y<20;y++)g[y][25]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE } },
        entities: [
            {type:'box',x:15*TILE,y:18*TILE,w:TILE,h:TILE,props:{}},
            {type:'button',x:20*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_ates4',requiresWeight:true}},
            {type:'door',x:28*TILE,y:15*TILE,w:TILE,h:TILE*5,props:{id:'door_ates4',color:'#1e293b'}},
            {type:'exit',x:40*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:43*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_12": {
        name: "Zehir Gölü (Simetrik)", treeX: 75, treeY: 30, type: 'diamond',
        unlocks: ["map_2_15"], width: 1800, height: 1000,
        grid: (function(){ let g=createGrid(56,31); for(let x=2;x<10;x++)g[20][x]=1; for(let x=10;x<45;x++){g[25][x]=1;g[24][x]=4;} /* Dev asit */ for(let x=45;x<54;x++)g[20][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE } },
        entities: [
            {type:'seesaw',x:15*TILE,y:20*TILE,w:TILE*10,h:TILE/2,props:{}},
            {type:'seesaw',x:30*TILE,y:20*TILE,w:TILE*10,h:TILE/2,props:{}},
            {type:'exit',x:48*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:51*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_13": {
        name: "Hızlı Düşün (Asimetrik)", treeX: 20, treeY: 15, type: 'hexagon',
        unlocks: ["map_2_16"], width: 2000, height: 1200,
        grid: (function(){ let g=createGrid(62,37); for(let x=2;x<20;x++)g[30][x]=1; for(let x=30;x<55;x++)g[20][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 28*TILE }, ates: { x: 5*TILE, y: 28*TILE } },
        entities: [
            {type:'button',x:15*TILE,y:30*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_su5',requiresWeight:false}},
            {type:'door',x:25*TILE,y:25*TILE,w:TILE,h:TILE*5,props:{id:'door_su5',color:'#1e293b'}},
            {type:'exit',x:45*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:48*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_14": {
        name: "Karşılıklı Ağırlık (Asimetrik)", treeX: 50, treeY: 15, type: 'hexagon',
        unlocks: ["map_2_16"], width: 2000, height: 1200,
        grid: (function(){ let g=createGrid(62,37); for(let x=2;x<30;x++)g[20][x]=1; for(let x=32;x<60;x++)g[30][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 35*TILE, y: 28*TILE } },
        entities: [
            {type:'button',x:15*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_ates5',requiresWeight:true}},
            {type:'button',x:45*TILE,y:30*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_su6',requiresWeight:true}},
            {type:'door',x:25*TILE,y:15*TILE,w:TILE,h:TILE*5,props:{id:'door_su6',color:'#1e293b'}},
            {type:'door',x:55*TILE,y:25*TILE,w:TILE,h:TILE*5,props:{id:'door_ates5',color:'#1e293b'}},
            {type:'exit',x:28*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:58*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_15": {
        name: "Boru Ağı (Asimetrik)", treeX: 80, treeY: 15, type: 'hexagon',
        unlocks: ["map_2_16"], width: 2000, height: 1200,
        grid: (function(){ let g=createGrid(62,37); for(let x=2;x<20;x++)g[20][x]=1; for(let y=10;y<30;y++)g[y][25]=8; for(let x=30;x<55;x++)g[30][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE } },
        entities: [
            {type:'button',x:40*TILE,y:30*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_ates6',requiresWeight:false}},
            {type:'door',x:22*TILE,y:15*TILE,w:TILE,h:TILE*5,props:{id:'door_ates6',color:'#1e293b'}},
            {type:'exit',x:45*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:50*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },
    "map_2_16": {
        name: "Elementlerin Birliği (Simetrik Final)", treeX: 50, treeY: 5, type: 'hexagon',
        unlocks: [], width: 2400, height: 1600,
        grid: (function(){
            let g=createGrid(75,50);
            for(let x=2;x<15;x++)g[40][x]=1;
            for(let x=15;x<30;x++){g[40][x]=1;g[39][x]=2;} // Lav
            for(let x=30;x<45;x++){g[40][x]=1;g[39][x]=3;} // Su
            for(let x=45;x<60;x++){g[40][x]=1;g[39][x]=4;} // Asit
            for(let x=60;x<70;x++)g[40][x]=1;
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 38*TILE }, ates: { x: 5*TILE, y: 38*TILE } },
        entities: [
            {type:'seesaw',x:18*TILE,y:36*TILE,w:TILE*8,h:TILE/2,props:{}}, // Lav üstü tahterevalli
            {type:'seesaw',x:33*TILE,y:36*TILE,w:TILE*8,h:TILE/2,props:{}}, // Su üstü tahterevalli
            {type:'seesaw',x:48*TILE,y:36*TILE,w:TILE*8,h:TILE/2,props:{}}, // Asit üstü tahterevalli
            {type:'button',x:62*TILE,y:40*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_final',requiresWeight:true}},
            {type:'button',x:64*TILE,y:40*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_final',requiresWeight:true}},
            {type:'door',x:66*TILE,y:35*TILE,w:TILE,h:TILE*5,props:{id:'door_final',color:'#1e293b'}},
            {type:'exit',x:67*TILE,y:38*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:69*TILE,y:38*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}
        ]
    },

    // ==================================================================
    // 3 KİŞİLİK HARİTALAR (Ateş, Su, Doğa, Ağaç Yapısı) Toplam: 16
    // Asimetrik/İşbirlikçi: Ağırlıklı (10), Simetrik/Birlikte (6)
    // ==================================================================
    "map_3_1": {
        name: "Üçlü Uyum (Simetrik)", treeX: 50, treeY: 90, type: 'hexagon',
        unlocks: ["map_3_2", "map_3_3"], width: 1400, height: 800,
        grid: (function(){ let g = createGrid(43,25); for(let x=2;x<40;x++)g[20][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE }, doga: { x: 7*TILE, y: 18*TILE } },
        entities: [
            {type:'exit',x:33*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:36*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:39*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_2": {
        name: "Doğa'nın Köprüsü (Asimetrik)", treeX: 35, treeY: 75, type: 'hexagon',
        unlocks: ["map_3_4"], width: 1600, height: 1000,
        grid: (function(){
            let g = createGrid(50,31);
            for(let x=2;x<15;x++)g[25][x]=1; // Alt kat (Su, Ateş)
            for(let x=15;x<35;x++){g[25][x]=1; g[24][x]=4;} // Asit Havuzu (Sadece Su ve Ateş ölür, Doğa da ölür o yüzden üstten gitmeli)
            for(let x=35;x<48;x++)g[25][x]=1; // Çıkış katı
            for(let x=10;x<40;x++)g[15][x]=1; // Üst kat (Doğa için)
            for(let y=15;y<25;y++)g[y][10]=5; // Sarmaşık (Doğa tırmanır)
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 23*TILE }, ates: { x: 5*TILE, y: 23*TILE }, doga: { x: 7*TILE, y: 23*TILE } },
        entities: [
            {type:'button',x:30*TILE,y:15*TILE,w:TILE,h:TILE/2,props:{color:'#10b981',targetId:'door_asit',requiresWeight:false}}, // Doğa basar
            {type:'door',x:13*TILE,y:20*TILE,w:TILE,h:TILE*5,props:{id:'door_asit',color:'#1e293b'}}, // Alt kattaki asidi kapatan kapı açılır (veya köprü niyetine yatay kapı olabilirdi, şimdilik düz kapı engeli)
            // Asiti geçmeleri için kutu koyalım
            {type:'box',x:20*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{}}, // Doğa kutuyu aşağı asite iter
            {type:'exit',x:40*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:43*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:46*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_3": {
        name: "Ateş Çemberi (Asimetrik)", treeX: 65, treeY: 75, type: 'hexagon',
        unlocks: ["map_3_5"], width: 1600, height: 1000,
        grid: (function(){
            let g = createGrid(50,31);
            for(let x=2;x<20;x++)g[20][x]=1;
            for(let x=20;x<30;x++){g[20][x]=1; g[19][x]=2;} // Lav (Ateş geçer)
            for(let x=30;x<48;x++)g[20][x]=1;
            for(let y=10;y<20;y++)g[y][20]=7; // Tahta Duvar (Ateş yakar)
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE }, doga: { x: 7*TILE, y: 18*TILE } },
        entities: [
            {type:'button',x:35*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_ates3',requiresWeight:false}},
            {type:'door',x:15*TILE,y:10*TILE,w:TILE,h:TILE*5,props:{id:'door_ates3',color:'#1e293b'}}, // Su ve Doğa'nın yolu
            {type:'exit',x:40*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:43*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:46*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_4": {
        name: "Yüksek Sarmaşık (Asimetrik)", treeX: 20, treeY: 60, type: 'diamond',
        unlocks: ["map_3_6", "map_3_7"], width: 1800, height: 1200,
        grid: (function(){
            let g = createGrid(56,37);
            for(let x=2;x<25;x++)g[30][x]=1;
            for(let x=30;x<54;x++)g[15][x]=1; // Üst Çıkış
            for(let y=15;y<30;y++)g[y][25]=5; // Dev sarmaşık
            for(let y=15;y<30;y++)g[y][30]=1; // Duvar engel
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 28*TILE }, ates: { x: 5*TILE, y: 28*TILE }, doga: { x: 7*TILE, y: 28*TILE } },
        entities: [
            {type:'button',x:35*TILE,y:15*TILE,w:TILE,h:TILE/2,props:{color:'#10b981',targetId:'door_sarmasik',requiresWeight:true}}, // Doğa tırmanır basar
            {type:'door',x:20*TILE,y:20*TILE,w:TILE,h:TILE*10,props:{id:'door_sarmasik',color:'#1e293b'}}, // Su ve Ateş'e yolu açar (alt kattan asansör vs de olabilirdi, şimdilik yan kapı)
            {type:'exit',x:45*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:48*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:51*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_5": {
        name: "Zehirli Havza (Simetrik)", treeX: 80, treeY: 60, type: 'diamond',
        unlocks: ["map_3_7", "map_3_8"], width: 1800, height: 1000,
        grid: (function(){
            let g = createGrid(56,31);
            for(let x=2;x<10;x++)g[20][x]=1;
            for(let x=10;x<46;x++){g[25][x]=1; g[24][x]=4;} // Asit (Sadece kutu ile geçilir)
            for(let x=46;x<54;x++)g[20][x]=1;
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE }, doga: { x: 7*TILE, y: 18*TILE } },
        entities: [
            {type:'box',x:8*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{}},
            {type:'box',x:15*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{}},
            {type:'box',x:22*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{}},
            // Üç oyuncu da kutuları iterek köprü yapmalı
            {type:'exit',x:48*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:50*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:52*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_6": {
        name: "Su Yolu (Asimetrik)", treeX: 10, treeY: 45, type: 'hexagon',
        unlocks: ["map_3_9"], width: 1600, height: 1000,
        grid: (function(){
            let g=createGrid(50,31);
            for(let x=2;x<20;x++)g[20][x]=1;
            for(let y=10;y<25;y++)g[y][20]=8; // Boru (Su geçer)
            for(let x=20;x<48;x++)g[25][x]=1;
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE }, doga: { x: 7*TILE, y: 18*TILE } },
        entities: [
            {type:'button',x:25*TILE,y:25*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_su1',requiresWeight:false}},
            {type:'door',x:15*TILE,y:10*TILE,w:TILE,h:TILE*5,props:{id:'door_su1',color:'#1e293b'}},
            {type:'exit',x:40*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:43*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:46*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_7": {
        name: "Üçlü Tahterevalli (Simetrik)", treeX: 50, treeY: 45, type: 'hexagon',
        unlocks: ["map_3_10", "map_3_11"], width: 2000, height: 1000,
        grid: (function(){ let g=createGrid(62,31); for(let x=2;x<10;x++)g[20][x]=1; for(let x=52;x<60;x++)g[20][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE }, doga: { x: 7*TILE, y: 18*TILE } },
        entities: [
            {type:'seesaw',x:12*TILE,y:22*TILE,w:TILE*10,h:TILE/2,props:{}},
            {type:'seesaw',x:25*TILE,y:22*TILE,w:TILE*10,h:TILE/2,props:{}},
            {type:'seesaw',x:38*TILE,y:22*TILE,w:TILE*10,h:TILE/2,props:{}},
            {type:'exit',x:53*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:56*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:59*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_8": {
        name: "Karanlık Zindan (Asimetrik)", treeX: 90, treeY: 45, type: 'hexagon',
        unlocks: ["map_3_12"], width: 2000, height: 1200,
        grid: (function(){
            let g=createGrid(62,37);
            for(let x=2;x<60;x++)g[30][x]=1;
            for(let y=15;y<30;y++){ g[y][20]=1; g[y][40]=1; } // 3 Oda
            for(let y=15;y<30;y++) g[y][21]=5; // Sarmaşık (Doğa)
            for(let y=20;y<30;y++) g[y][41]=8; // Boru (Su)
            return g;
        })(),
        spawns: { su: { x: 5*TILE, y: 28*TILE }, ates: { x: 10*TILE, y: 28*TILE }, doga: { x: 15*TILE, y: 28*TILE } },
        entities: [
            {type:'tahta_duvar',x:19*TILE,y:25*TILE,w:TILE,h:TILE*5,props:{}}, // Ateş yakar 1.kapı
            {type:'button',x:25*TILE,y:15*TILE,w:TILE,h:TILE/2,props:{color:'#10b981',targetId:'door_x1',requiresWeight:false}}, // Doğa basar
            {type:'door',x:39*TILE,y:20*TILE,w:TILE,h:TILE*10,props:{id:'door_x1',color:'#1e293b'}}, // 2.kapı
            {type:'button',x:45*TILE,y:30*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_x2',requiresWeight:false}}, // Su basar
            {type:'door',x:50*TILE,y:20*TILE,w:TILE,h:TILE*10,props:{id:'door_x2',color:'#1e293b'}}, // 3.kapı
            {type:'exit',x:53*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:56*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:59*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_9": {
        name: "Yüksek Fedakarlık (Asimetrik)", treeX: 25, treeY: 30, type: 'diamond',
        unlocks: ["map_3_13"], width: 1800, height: 1200,
        grid: (function(){ let g=createGrid(56,37); for(let x=2;x<20;x++)g[30][x]=1; for(let x=25;x<54;x++)g[15][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 28*TILE }, ates: { x: 5*TILE, y: 28*TILE }, doga: { x: 7*TILE, y: 28*TILE } },
        entities: [
            {type:'seesaw',x:10*TILE,y:30*TILE,w:TILE*15,h:TILE/2,props:{}}, // Uzun tahterevalli, 2 kişi binip 1 kişiyi zıplatmalı
            {type:'button',x:30*TILE,y:15*TILE,w:TILE,h:TILE/2,props:{color:'#facc15',targetId:'door_asansor',requiresWeight:false}},
            {type:'door',x:22*TILE,y:15*TILE,w:TILE,h:TILE*15,props:{id:'door_asansor',color:'#1e293b'}}, // Kapı kalkar
            {type:'exit',x:45*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:48*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:51*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_10": {
        name: "Ateşin Fedakarlığı (Asimetrik)", treeX: 40, treeY: 30, type: 'diamond',
        unlocks: ["map_3_14"], width: 2000, height: 1200,
        grid: (function(){
            let g=createGrid(62,37);
            for(let x=2;x<20;x++)g[20][x]=1;
            for(let x=20;x<40;x++){g[25][x]=1; g[24][x]=2;} // Lav
            for(let x=40;x<60;x++)g[20][x]=1;
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE }, doga: { x: 7*TILE, y: 18*TILE } },
        entities: [
            {type:'button',x:30*TILE,y:25*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_lav1',requiresWeight:true}}, // Ateş lavda beklemeli
            {type:'door',x:25*TILE,y:10*TILE,w:TILE,h:TILE*10,props:{id:'door_lav1',color:'#1e293b'}}, // Doğa ve Su için köprü
            {type:'button',x:50*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#10b981',targetId:'door_lav2',requiresWeight:false}}, // Sonra Doğa kapıyı temelli açar
            {type:'door',x:35*TILE,y:10*TILE,w:TILE,h:TILE*10,props:{id:'door_lav2',color:'#1e293b'}},
            {type:'exit',x:52*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:55*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:58*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_11": {
        name: "İkili Buton (Asimetrik)", treeX: 60, treeY: 30, type: 'diamond',
        unlocks: ["map_3_14"], width: 2000, height: 1000,
        grid: (function(){ let g=createGrid(62,31); for(let x=2;x<60;x++)g[25][x]=1; for(let y=10;y<25;y++){g[y][30]=1;} return g; })(),
        spawns: { su: { x: 3*TILE, y: 23*TILE }, ates: { x: 5*TILE, y: 23*TILE }, doga: { x: 7*TILE, y: 23*TILE } },
        entities: [
            {type:'button',x:15*TILE,y:25*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_ikili1',requiresWeight:true}}, // Su
            {type:'button',x:20*TILE,y:25*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_ikili2',requiresWeight:true}}, // Ateş
            {type:'door',x:28*TILE,y:15*TILE,w:TILE,h:TILE*10,props:{id:'door_ikili1',color:'#1e293b'}}, // Aynı kapıya 2 şart lazım (oyun motoru tek target id destkeliyor ama 2 kapıyı üst üste koyabiliriz)
            {type:'door',x:29*TILE,y:15*TILE,w:TILE,h:TILE*10,props:{id:'door_ikili2',color:'#1e293b'}},
            {type:'exit',x:52*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:55*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:58*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_12": {
        name: "Yıkım ve Yapım (Asimetrik)", treeX: 75, treeY: 30, type: 'diamond',
        unlocks: ["map_3_15"], width: 2000, height: 1200,
        grid: (function(){ let g=createGrid(62,37); for(let x=2;x<20;x++)g[30][x]=1; for(let x=20;x<40;x++){g[30][x]=1; g[29][x]=4;} /*Asit*/ for(let x=40;x<60;x++)g[30][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 28*TILE }, ates: { x: 5*TILE, y: 28*TILE }, doga: { x: 7*TILE, y: 28*TILE } },
        entities: [
            {type:'tahta_duvar',x:15*TILE,y:20*TILE,w:TILE,h:TILE*10,props:{}}, // Ateş yıkar, içinden kutu çıkar
            {type:'box',x:17*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{}},
            {type:'box',x:17*TILE,y:25*TILE,w:TILE*2,h:TILE*2,props:{}}, // 2 Kutu asiti geçmek için
            {type:'exit',x:45*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:48*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:51*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_13": {
        name: "Dar Geçitler (Simetrik)", treeX: 20, treeY: 15, type: 'hexagon',
        unlocks: ["map_3_16"], width: 2200, height: 1200,
        grid: (function(){ let g=createGrid(68,37); for(let x=2;x<66;x++)g[30][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 28*TILE }, ates: { x: 5*TILE, y: 28*TILE }, doga: { x: 7*TILE, y: 28*TILE } },
        entities: [
            {type:'box',x:15*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{}},
            {type:'box',x:30*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{}},
            {type:'box',x:45*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{}},
            {type:'seesaw',x:20*TILE,y:30*TILE,w:TILE*8,h:TILE/2,props:{}},
            {type:'seesaw',x:35*TILE,y:30*TILE,w:TILE*8,h:TILE/2,props:{}},
            {type:'exit',x:55*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:58*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:61*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_14": {
        name: "Asit Labirenti (Asimetrik)", treeX: 50, treeY: 15, type: 'hexagon',
        unlocks: ["map_3_16"], width: 2400, height: 1400,
        grid: (function(){
            let g=createGrid(75,43);
            for(let x=2;x<20;x++)g[35][x]=1;
            for(let x=20;x<50;x++){g[35][x]=1; g[34][x]=4;} // Asit Gölü
            for(let x=50;x<73;x++)g[35][x]=1;
            for(let x=20;x<50;x++)g[20][x]=1; // Doğa üstten gider
            for(let y=20;y<35;y++)g[y][18]=5; // Doğa tırmanır
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 33*TILE }, ates: { x: 5*TILE, y: 33*TILE }, doga: { x: 7*TILE, y: 33*TILE } },
        entities: [
            {type:'button',x:45*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#10b981',targetId:'door_asit4',requiresWeight:false}}, // Doğa üstten geçer, asit kapısını açar
            {type:'door',x:25*TILE,y:25*TILE,w:TILE*20,h:TILE*10,props:{id:'door_asit4',color:'#1e293b'}}, // Asit gölünü kapatan devasa köprü kapı (yatay kapı mantığı)
            {type:'exit',x:60*TILE,y:33*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:63*TILE,y:33*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:66*TILE,y:33*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_15": {
        name: "Element Odaları (Asimetrik)", treeX: 80, treeY: 15, type: 'hexagon',
        unlocks: ["map_3_16"], width: 2400, height: 1400,
        grid: (function(){
            let g=createGrid(75,43);
            for(let x=2;x<20;x++)g[20][x]=1;
            for(let y=10;y<40;y++)g[y][20]=1; // Duvar
            for(let x=20;x<40;x++)g[40][x]=1;
            for(let y=10;y<40;y++)g[y][40]=1; // Duvar
            for(let x=40;x<73;x++)g[20][x]=1;
            // Tehlikeler
            for(let y=20;y<35;y++)g[y][21]=8; // Boru (Su)
            for(let x=25;x<35;x++){g[40][x]=1; g[39][x]=2;} // Lav (Ateş)
            for(let y=15;y<35;y++)g[y][41]=5; // Sarmaşık (Doğa)
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE }, doga: { x: 7*TILE, y: 18*TILE } },
        entities: [
            {type:'button',x:30*TILE,y:40*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_son_ates',requiresWeight:true}},
            {type:'button',x:45*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#10b981',targetId:'door_son_doga',requiresWeight:true}},
            {type:'door',x:18*TILE,y:10*TILE,w:TILE,h:TILE*10,props:{id:'door_son_ates',color:'#1e293b'}},
            {type:'door',x:38*TILE,y:10*TILE,w:TILE,h:TILE*10,props:{id:'door_son_doga',color:'#1e293b'}},
            {type:'exit',x:60*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:63*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:66*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_3_16": {
        name: "Doğa'nın Kalbi (Simetrik Final)", treeX: 50, treeY: 5, type: 'hexagon',
        unlocks: [], width: 2800, height: 1800,
        grid: (function(){
            let g=createGrid(87,56);
            for(let x=2;x<15;x++)g[50][x]=1;
            for(let x=15;x<30;x++){g[50][x]=1;g[49][x]=2;} // Lav
            for(let x=30;x<45;x++){g[50][x]=1;g[49][x]=3;} // Su
            for(let x=45;x<60;x++){g[50][x]=1;g[49][x]=4;} // Asit
            for(let x=60;x<85;x++)g[50][x]=1;
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 48*TILE }, ates: { x: 5*TILE, y: 48*TILE }, doga: { x: 7*TILE, y: 48*TILE } },
        entities: [
            {type:'seesaw',x:18*TILE,y:46*TILE,w:TILE*8,h:TILE/2,props:{}}, // Lav üstü
            {type:'seesaw',x:33*TILE,y:46*TILE,w:TILE*8,h:TILE/2,props:{}}, // Su üstü
            {type:'seesaw',x:48*TILE,y:46*TILE,w:TILE*8,h:TILE/2,props:{}}, // Asit üstü
            {type:'button',x:65*TILE,y:50*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_final',requiresWeight:true}},
            {type:'button',x:68*TILE,y:50*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_final',requiresWeight:true}},
            {type:'button',x:71*TILE,y:50*TILE,w:TILE,h:TILE/2,props:{color:'#10b981',targetId:'door_final',requiresWeight:true}},
            {type:'door',x:75*TILE,y:40*TILE,w:TILE,h:TILE*10,props:{id:'door_final',color:'#1e293b'}},
            {type:'exit',x:77*TILE,y:48*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:80*TILE,y:48*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:83*TILE,y:48*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },

    // ==================================================================
    // 4 KİŞİLİK HARİTALAR - PART 1 (Ateş, Su, Doğa, Hava)
    // ==================================================================
    "map_4_1": {
        name: "Dört Elementin Uyanışı", treeX: 50, treeY: 90, type: 'hexagon',
        unlocks: ["map_4_2", "map_4_3"], width: 1600, height: 1000,
        grid: (function(){ let g = createGrid(50,31); for(let x=2;x<48;x++)g[25][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 23*TILE }, ates: { x: 5*TILE, y: 23*TILE }, doga: { x: 7*TILE, y: 23*TILE }, hava: { x: 9*TILE, y: 23*TILE } },
        entities: [
            {type:'exit',x:38*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:41*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:44*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:47*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}
        ]
    },
    "map_4_2": {
        name: "Rüzgarın Yolu", treeX: 35, treeY: 75, type: 'hexagon',
        unlocks: ["map_4_4"], width: 1800, height: 1200,
        grid: (function(){
            let g = createGrid(56,37);
            for(let x=2;x<20;x++)g[30][x]=1; // Alt kat (Ates, Su, Doga)
            for(let x=25;x<54;x++)g[15][x]=1; // Üst kat (Hava için)
            for(let x=20;x<25;x++)g[30][x]=1;
            for(let y=15;y<30;y++)g[y][22]=6; // Fırtına (Sadece Hava uçar)
            for(let x=30;x<54;x++)g[30][x]=1; // Alt kat devam
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 28*TILE }, ates: { x: 5*TILE, y: 28*TILE }, doga: { x: 7*TILE, y: 28*TILE }, hava: { x: 9*TILE, y: 28*TILE } },
        entities: [
            {type:'button',x:40*TILE,y:15*TILE,w:TILE,h:TILE/2,props:{color:'#facc15',targetId:'door_hava',requiresWeight:false}}, // Hava uçar basar
            {type:'door',x:28*TILE,y:20*TILE,w:TILE,h:TILE*10,props:{id:'door_hava',color:'#1e293b'}}, // Alt kattaki diğerlerinin yolu açılır
            {type:'exit',x:45*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:48*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:51*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:48*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}} // Havanın kapısı üstte
        ]
    },
    "map_4_3": {
        name: "Yüksek Sarmaşıklar", treeX: 65, treeY: 75, type: 'hexagon',
        unlocks: ["map_4_5"], width: 1800, height: 1200,
        grid: (function(){
            let g = createGrid(56,37);
            for(let x=2;x<20;x++)g[30][x]=1;
            for(let x=20;x<54;x++)g[15][x]=1; // Üst kat
            for(let y=15;y<30;y++)g[y][18]=5; // Sarmaşık (Doğa tırmanır)
            for(let x=30;x<54;x++)g[30][x]=1; // Alt kat devam
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 28*TILE }, ates: { x: 5*TILE, y: 28*TILE }, doga: { x: 7*TILE, y: 28*TILE }, hava: { x: 9*TILE, y: 28*TILE } },
        entities: [
            {type:'button',x:40*TILE,y:15*TILE,w:TILE,h:TILE/2,props:{color:'#10b981',targetId:'door_doga_hava',requiresWeight:false}}, // Doğa basar
            {type:'door',x:25*TILE,y:20*TILE,w:TILE,h:TILE*10,props:{id:'door_doga_hava',color:'#1e293b'}}, // Alt yol açılır
            {type:'exit',x:45*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:48*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:51*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}},
            {type:'exit',x:48*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}} // Doğa üstte
        ]
    },
    "map_4_4": {
        name: "Çifte Yetenek", treeX: 20, treeY: 60, type: 'diamond',
        unlocks: ["map_4_6", "map_4_7"], width: 2000, height: 1400,
        grid: (function(){
            let g = createGrid(62,43);
            for(let x=2;x<20;x++)g[35][x]=1;
            for(let x=20;x<60;x++)g[15][x]=1; // En üst (Hava)
            for(let x=20;x<60;x++)g[25][x]=1; // Orta (Doğa)
            for(let x=30;x<60;x++)g[35][x]=1; // Alt
            for(let y=15;y<35;y++)g[y][18]=6; // Fırtına (Hava uçar)
            for(let y=25;y<35;y++)g[y][22]=5; // Sarmaşık (Doğa)
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 33*TILE }, ates: { x: 5*TILE, y: 33*TILE }, doga: { x: 7*TILE, y: 33*TILE }, hava: { x: 9*TILE, y: 33*TILE } },
        entities: [
            {type:'button',x:40*TILE,y:15*TILE,w:TILE,h:TILE/2,props:{color:'#facc15',targetId:'door_h1',requiresWeight:false}},
            {type:'button',x:40*TILE,y:25*TILE,w:TILE,h:TILE/2,props:{color:'#10b981',targetId:'door_d1',requiresWeight:false}},
            {type:'door',x:28*TILE,y:25*TILE,w:TILE,h:TILE*10,props:{id:'door_h1',color:'#1e293b'}},
            {type:'door',x:29*TILE,y:25*TILE,w:TILE,h:TILE*10,props:{id:'door_d1',color:'#1e293b'}}, // Çift kilitli alt kapı
            {type:'exit',x:50*TILE,y:33*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:53*TILE,y:33*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:50*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:50*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}
        ]
    },
    "map_4_5": {
        name: "Yeraltı Suları", treeX: 80, treeY: 60, type: 'diamond',
        unlocks: ["map_4_7", "map_4_8"], width: 2000, height: 1400,
        grid: (function(){
            let g = createGrid(62,43);
            for(let x=2;x<20;x++)g[20][x]=1;
            for(let y=20;y<40;y++)g[y][15]=8; // Boru (Aşağı inen)
            for(let x=10;x<60;x++)g[40][x]=1; // En alt kat
            for(let x=30;x<60;x++)g[20][x]=1; // Sağ üst
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 5*TILE, y: 18*TILE }, doga: { x: 7*TILE, y: 18*TILE }, hava: { x: 9*TILE, y: 18*TILE } },
        entities: [
            {type:'button',x:40*TILE,y:40*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_su_alt',requiresWeight:false}}, // Su alt katta basar
            {type:'door',x:25*TILE,y:10*TILE,w:TILE,h:TILE*10,props:{id:'door_su_alt',color:'#1e293b'}},
            {type:'exit',x:50*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:53*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:56*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}},
            {type:'exit',x:50*TILE,y:38*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}
        ]
    },
    "map_4_6": {
        name: "Dörtlü Tahterevalli", treeX: 10, treeY: 45, type: 'hexagon',
        unlocks: ["map_4_9"], width: 2200, height: 1000,
        grid: (function(){ let g=createGrid(68,31); for(let x=2;x<10;x++)g[20][x]=1; for(let x=60;x<66;x++)g[20][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 18*TILE }, ates: { x: 4*TILE, y: 18*TILE }, doga: { x: 5*TILE, y: 18*TILE }, hava: { x: 6*TILE, y: 18*TILE } },
        entities: [
            {type:'seesaw',x:12*TILE,y:22*TILE,w:TILE*10,h:TILE/2,props:{}},
            {type:'seesaw',x:24*TILE,y:22*TILE,w:TILE*10,h:TILE/2,props:{}},
            {type:'seesaw',x:36*TILE,y:22*TILE,w:TILE*10,h:TILE/2,props:{}},
            {type:'seesaw',x:48*TILE,y:22*TILE,w:TILE*10,h:TILE/2,props:{}},
            {type:'exit',x:61*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:62*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:63*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:64*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}
        ]
    },
    "map_4_7": {
        name: "Ateş ve Rüzgar", treeX: 50, treeY: 45, type: 'hexagon',
        unlocks: ["map_4_10", "map_4_11"], width: 2200, height: 1200,
        grid: (function(){
            let g=createGrid(68,37);
            for(let x=2;x<20;x++)g[25][x]=1;
            for(let x=20;x<40;x++){g[25][x]=1; g[24][x]=2;} // Lav gölü
            for(let y=15;y<25;y++)g[y][25]=6; // Fırtına
            for(let x=40;x<66;x++)g[25][x]=1;
            for(let x=30;x<66;x++)g[15][x]=1; // Üst kat
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 23*TILE }, ates: { x: 5*TILE, y: 23*TILE }, doga: { x: 7*TILE, y: 23*TILE }, hava: { x: 9*TILE, y: 23*TILE } },
        entities: [
            {type:'button',x:50*TILE,y:25*TILE,w:TILE,h:TILE/2,props:{color:'#ef4444',targetId:'door_ates_47',requiresWeight:false}}, // Ateş lavı geçip basar
            {type:'button',x:50*TILE,y:15*TILE,w:TILE,h:TILE/2,props:{color:'#facc15',targetId:'door_hava_47',requiresWeight:false}}, // Hava uçup basar
            {type:'door',x:15*TILE,y:15*TILE,w:TILE,h:TILE*10,props:{id:'door_ates_47',color:'#1e293b'}},
            {type:'door',x:16*TILE,y:15*TILE,w:TILE,h:TILE*10,props:{id:'door_hava_47',color:'#1e293b'}}, // Çifte kapı kalkar, Su ve Doğa geçer
            {type:'exit',x:60*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:63*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:55*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:55*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}
        ]
    },
    "map_4_8": {
        name: "Asit Kulesi", treeX: 90, treeY: 45, type: 'hexagon',
        unlocks: ["map_4_12"], width: 2000, height: 1600,
        grid: (function(){
            let g=createGrid(62,50);
            for(let x=2;x<20;x++)g[45][x]=1;
            for(let x=20;x<50;x++){g[45][x]=1; g[44][x]=4;} // Asit
            for(let x=50;x<60;x++)g[45][x]=1;
            for(let x=20;x<50;x++)g[25][x]=1; // Doğa ve Hava için üst yol
            for(let y=25;y<45;y++)g[y][18]=5; // Doğa tırmanır
            for(let y=25;y<45;y++)g[y][22]=6; // Hava uçar
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 43*TILE }, ates: { x: 5*TILE, y: 43*TILE }, doga: { x: 7*TILE, y: 43*TILE }, hava: { x: 9*TILE, y: 43*TILE } },
        entities: [
            {type:'box',x:30*TILE,y:25*TILE,w:TILE*2,h:TILE*2,props:{}}, // Hava ve Doğa yukarı çıkıp asite kutu atar
            {type:'box',x:35*TILE,y:25*TILE,w:TILE*2,h:TILE*2,props:{}},
            {type:'exit',x:52*TILE,y:43*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:55*TILE,y:43*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:45*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:48*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}
        ]
    },
    "map_4_9": {
        name: "Ağır Kutu", treeX: 25, treeY: 30, type: 'diamond',
        unlocks: ["map_4_13"], width: 2400, height: 1200,
        grid: (function(){ let g=createGrid(75,37); for(let x=2;x<73;x++)g[30][x]=1; return g; })(),
        spawns: { su: { x: 3*TILE, y: 28*TILE }, ates: { x: 5*TILE, y: 28*TILE }, doga: { x: 7*TILE, y: 28*TILE }, hava: { x: 9*TILE, y: 28*TILE } },
        entities: [
            {type:'box',x:15*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{resistance:0.1}}, // Çok ağır kutu, itmek için 4 kişi aynı anda ittirmeli
            {type:'button',x:40*TILE,y:30*TILE,w:TILE,h:TILE/2,props:{color:'#ffffff',targetId:'door_agir',requiresWeight:true}}, // Kutu buraya gelmeli
            {type:'door',x:50*TILE,y:20*TILE,w:TILE,h:TILE*10,props:{id:'door_agir',color:'#1e293b'}},
            {type:'exit',x:60*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:63*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:66*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:69*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}
        ]
    },
    "map_4_10": {
        name: "Hava Asansörü", treeX: 40, treeY: 30, type: 'diamond',
        unlocks: ["map_4_13"], width: 2000, height: 1600,
        grid: (function(){
            let g=createGrid(62,50);
            for(let x=2;x<20;x++)g[45][x]=1;
            for(let x=40;x<60;x++)g[45][x]=1;
            for(let x=40;x<60;x++)g[15][x]=1;
            for(let y=15;y<45;y++)g[y][30]=6; // Ortada devasa fırtına
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 43*TILE }, ates: { x: 5*TILE, y: 43*TILE }, doga: { x: 7*TILE, y: 43*TILE }, hava: { x: 9*TILE, y: 43*TILE } },
        entities: [
            {type:'button',x:50*TILE,y:15*TILE,w:TILE,h:TILE/2,props:{color:'#facc15',targetId:'door_asansor_hava',requiresWeight:true}},
            {type:'door',x:20*TILE,y:35*TILE,w:TILE*20,h:TILE*10,props:{id:'door_asansor_hava',color:'#1e293b'}}, // Hava yukarı çıkıp basınca devasa köprü açılır (yatay door)
            {type:'exit',x:45*TILE,y:43*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:48*TILE,y:43*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:51*TILE,y:43*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:55*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}
        ]
    },
    "map_4_11": {
        name: "Yanan Orman", treeX: 60, treeY: 30, type: 'diamond',
        unlocks: ["map_4_13"], width: 2200, height: 1400,
        grid: (function(){
            let g=createGrid(68,43);
            for(let x=2;x<20;x++)g[35][x]=1;
            for(let x=20;x<50;x++)g[25][x]=1; // Orta platform
            for(let x=50;x<66;x++)g[35][x]=1;
            // Tahta duvarlar (Ateşin yolu açması lazım)
            for(let y=25;y<35;y++)g[y][20]=7;
            for(let y=25;y<35;y++)g[y][49]=7;
            for(let y=25;y<35;y++)g[y][15]=5; // Doğa tırmanır
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 33*TILE }, ates: { x: 5*TILE, y: 33*TILE }, doga: { x: 7*TILE, y: 33*TILE }, hava: { x: 9*TILE, y: 33*TILE } },
        entities: [
            {type:'button',x:30*TILE,y:25*TILE,w:TILE,h:TILE/2,props:{color:'#10b981',targetId:'door_orman_1',requiresWeight:false}}, // Doğa basar
            {type:'door',x:19*TILE,y:25*TILE,w:TILE,h:TILE*10,props:{id:'door_orman_1',color:'#1e293b'}}, // Ateşin geçmesi için ilk kapı
            // Ateş geçince tahtayı yakar
            {type:'exit',x:55*TILE,y:33*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:58*TILE,y:33*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:61*TILE,y:33*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}},
            {type:'exit',x:45*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}
        ]
    },
    "map_4_12": {
        name: "Su Borusu Ağları", treeX: 75, treeY: 30, type: 'diamond',
        unlocks: ["map_4_13"], width: 2400, height: 1600,
        grid: (function(){
            let g=createGrid(75,50);
            for(let x=2;x<20;x++)g[40][x]=1;
            for(let x=50;x<73;x++)g[40][x]=1;
            for(let x=30;x<45;x++)g[20][x]=1; // En üst platform
            // Kompleks boru sistemi
            for(let x=20;x<50;x++)g[40][x]=8;
            for(let y=20;y<40;y++)g[y][30]=8;
            for(let y=20;y<40;y++)g[y][45]=8;
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 38*TILE }, ates: { x: 5*TILE, y: 38*TILE }, doga: { x: 7*TILE, y: 38*TILE }, hava: { x: 9*TILE, y: 38*TILE } },
        entities: [
            {type:'button',x:35*TILE,y:20*TILE,w:TILE,h:TILE/2,props:{color:'#3b82f6',targetId:'door_boru_dev',requiresWeight:false}}, // Su labirenti geçip basar
            {type:'door',x:20*TILE,y:30*TILE,w:TILE*30,h:TILE*10,props:{id:'door_boru_dev',color:'#1e293b'}}, // Dev kapı/köprü
            {type:'exit',x:55*TILE,y:38*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:58*TILE,y:38*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:61*TILE,y:38*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}},
            {type:'exit',x:40*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}
        ]
    },
    "map_4_13": {
        name: "Büyük Geçit (Ara Final)", treeX: 50, treeY: 15, type: 'hexagon',
        unlocks: [], width: 2800, height: 1800,
        grid: (function(){
            let g=createGrid(87,56);
            for(let x=2;x<85;x++)g[50][x]=1; // Dümdüz arena
            for(let x=25;x<35;x++){g[50][x]=1; g[49][x]=2;} // Lav
            for(let x=45;x<55;x++){g[50][x]=1; g[49][x]=4;} // Asit
            for(let x=65;x<75;x++){g[50][x]=1; g[49][x]=3;} // Su
            for(let y=30;y<50;y++)g[y][20]=6; // Fırtına
            for(let y=30;y<50;y++)g[y][40]=5; // Sarmaşık
            return g;
        })(),
        spawns: { su: { x: 3*TILE, y: 48*TILE }, ates: { x: 5*TILE, y: 48*TILE }, doga: { x: 7*TILE, y: 48*TILE }, hava: { x: 9*TILE, y: 48*TILE } },
        entities: [
            {type:'box',x:15*TILE,y:48*TILE,w:TILE*2,h:TILE*2,props:{}}, // Asiti geçmek için
            {type:'seesaw',x:28*TILE,y:46*TILE,w:TILE*8,h:TILE/2,props:{}},
            {type:'seesaw',x:68*TILE,y:46*TILE,w:TILE*8,h:TILE/2,props:{}},
            {type:'exit',x:78*TILE,y:48*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}},
            {type:'exit',x:81*TILE,y:48*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}},
            {type:'exit',x:84*TILE,y:48*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}},
            {type:'exit',x:75*TILE,y:48*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}
        ]
    }
};
