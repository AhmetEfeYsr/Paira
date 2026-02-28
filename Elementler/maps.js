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
    // ÇOK OYUNCULU HARİTALAR (Kısa Liste Olarak Kalabilir, UI Lineer Çizebilir Veya Ağaç İstiyorsa Uyarlanabilir)
    // Şimdilik 2, 3 ve 4 kişilikleri düz sıralı zincir bırakıyoruz.
    // ==================================================================
    "map_2_1": { name: "Ortak Zemin", treeX: 50, treeY: 80, type: 'hexagon', unlocks: ["map_2_2"], width: 1500, height: 1000, grid: createGrid(46,31), spawns: {su:{x:100,y:700},ates:{x:200,y:700}}, entities: [{type:'exit',x:40*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}, {type:'exit',x:40*TILE,y:26*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}] },
    "map_2_2": { name: "Kutu ve Fedakarlık", treeX: 50, treeY: 50, type: 'hexagon', unlocks: ["map_2_3"], width: 1600, height: 1000, grid: createGrid(50,31), spawns: {su:{x:100,y:700},ates:{x:200,y:700}}, entities: [{type:'exit',x:45*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:38*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}] },
    "map_2_3": { name: "Büyük Tahterevalli", treeX: 50, treeY: 20, type: 'hexagon', unlocks: [], width: 1800, height: 1000, grid: createGrid(56,31), spawns: {su:{x:100,y:500},ates:{x:200,y:500}}, entities: [{type:'exit',x:48*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}, {type:'exit',x:50*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}] },

    "map_3_1": { name: "Sarmaşık Kulesi", treeX: 50, treeY: 80, type: 'hexagon', unlocks: ["map_3_2"], width: 1800, height: 1200, grid: createGrid(56,37), spawns: {su:{x:100,y:800},ates:{x:200,y:800},doga:{x:300,y:800}}, entities: [{type:'exit',x:48*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}, {type:'exit',x:46*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}, {type:'exit',x:49*TILE,y:28*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}] },
    "map_3_2": { name: "Doğa'nın Yolu", treeX: 50, treeY: 50, type: 'hexagon', unlocks: ["map_3_3"], width: 2000, height: 1200, grid: createGrid(62,37), spawns: {su:{x:100,y:800},ates:{x:150,y:800},doga:{x:200,y:800}}, entities: [{type:'exit',x:50*TILE,y:24*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}, {type:'exit',x:53*TILE,y:24*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}, {type:'exit',x:50*TILE,y:32*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}] },
    "map_3_3": { name: "Ağırlık Dağılımı", treeX: 50, treeY: 20, type: 'hexagon', unlocks: [], width: 2000, height: 1200, grid: createGrid(62,37), spawns: {su:{x:100,y:700},ates:{x:200,y:700},doga:{x:300,y:700}}, entities: [{type:'exit',x:45*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:48*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}, {type:'exit',x:51*TILE,y:23*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}] },

    "map_4_1": { name: "Dört Yön", treeX: 50, treeY: 80, type: 'hexagon', unlocks: ["map_4_2"], width: 2400, height: 1600, grid: createGrid(75,50), spawns: {su:{x:32*TILE,y:38*TILE},ates:{x:35*TILE,y:38*TILE},doga:{x:38*TILE,y:38*TILE},hava:{x:41*TILE,y:38*TILE}}, entities: [{type:'exit',x:6*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}, {type:'exit',x:62*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}, {type:'exit',x:25*TILE,y:43*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:48*TILE,y:43*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}] },
    "map_4_2": { name: "Hava Desteği", treeX: 50, treeY: 50, type: 'hexagon', unlocks: ["map_4_3"], width: 2400, height: 1600, grid: createGrid(75,50), spawns: {su:{x:300,y:900},ates:{x:400,y:900},doga:{x:500,y:900},hava:{x:600,y:900}}, entities: [{type:'exit',x:55*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:58*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}, {type:'exit',x:61*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}, {type:'exit',x:64*TILE,y:18*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}] },
    "map_4_3": { name: "Kaos Zindanı", treeX: 50, treeY: 20, type: 'hexagon', unlocks: [], width: 2800, height: 1800, grid: createGrid(87,56), spawns: {su:{x:300,y:1200},ates:{x:400,y:1200},doga:{x:500,y:1200},hava:{x:600,y:1200}}, entities: [{type:'exit',x:65*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'su'}}, {type:'exit',x:68*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'ates'}}, {type:'exit',x:71*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'doga'}}, {type:'exit',x:74*TILE,y:13*TILE,w:TILE*2,h:TILE*2,props:{role:'hava'}}] }
};
