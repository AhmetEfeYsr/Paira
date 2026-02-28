// maps.js - Harita Verileri ve Fizik Objeleri Tanımları
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
    // ------------------------------------------------------------------
    // 1 KİŞİLİK HARİTALAR (Su Elementi)
    // ------------------------------------------------------------------
    "map_1_1": {
        name: "Su'nun Uyanışı",
        width: 1200, height: 800,
        grid: (function() {
            let g = createGrid(38, 25);
            // Zeminler
            for(let x=2; x<15; x++) g[15][x] = 1; // Başlangıç
            for(let x=18; x<30; x++) g[20][x] = 1; // Alt platform
            for(let x=25; x<35; x++) g[10][x] = 1; // Çıkış platformu
            // Boru
            for(let y=15; y<20; y++) g[y][18] = 8;
            return g;
        })(),
        spawns: { su: { x: 100, y: 400 } },
        entities: [ { type: 'exit', x: 28*TILE, y: 8*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } } ]
    },
    "map_1_2": {
        name: "Kutu ve Denge",
        width: 1200, height: 800,
        grid: (function() {
            let g = createGrid(38, 25);
            for(let x=2; x<8; x++) g[20][x] = 1; // Başlangıç
            for(let x=10; x<16; x++) g[18][x] = 1; // Ara zıplama
            for(let x=26; x<34; x++) g[20][x] = 1; // Çıkış
            return g;
        })(),
        spawns: { su: { x: 100, y: 550 } },
        entities: [
            { type: 'seesaw', x: 16*TILE, y: 18*TILE, w: TILE*8, h: TILE/2, props: {} }, // Denge çubuğu
            { type: 'box', x: 4*TILE, y: 18*TILE, w: TILE, h: TILE, props: { resistance: 0.8 } }, // İtilebilir kutu
            { type: 'button', x: 30*TILE, y: 20*TILE, w: TILE, h: TILE/2, props: { color: '#3b82f6', targetId: 'door_1', requiresWeight: true } },
            { type: 'door', x: 32*TILE, y: 15*TILE, w: TILE, h: TILE*5, props: { id: 'door_1', color: '#1e293b' } },
            { type: 'exit', x: 33*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },
    "map_1_3": {
        name: "Zehirli Havuz",
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
            { type: 'box', x: 6*TILE, y: 18*TILE, w: TILE, h: TILE, props: { resistance: 0.9 } }, // Lavın üstüne itmek için
            { type: 'box', x: 5*TILE, y: 16*TILE, w: TILE, h: TILE, props: { resistance: 0.9 } }, // Lavın üstüne itmek için
            { type: 'seesaw', x: 18*TILE, y: 15*TILE, w: TILE*8, h: TILE/2, props: {} }, // Lava düşmeden geçmek için
            { type: 'exit', x: 35*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    // ------------------------------------------------------------------
    // 2 KİŞİLİK HARİTALAR (Su, Ateş)
    // ------------------------------------------------------------------
    "map_2_1": {
        name: "Ortak Zemin",
        width: 1500, height: 1000,
        grid: (function() {
            let g = createGrid(46, 31);
            for(let x=2; x<10; x++) g[25][x] = 1;
            for(let x=10; x<25; x++) g[28][x] = 1;
            for(let x=15; x<20; x++) g[27][x] = 3; // Su rahat geçer, ateş ölür
            for(let x=10; x<20; x++) g[20][x] = 1;
            for(let x=22; x<35; x++) g[15][x] = 1;
            for(let x=25; x<30; x++) g[14][x] = 2; // Ateş rahat geçer, su ölür
            for(let y=10; y<15; y++) g[y][32] = 7; // Tahta Duvar (Ateş yıkar)
            for(let x=38; x<44; x++) g[15][x] = 1;
            for(let x=38; x<44; x++) g[28][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 100, y: 700 }, ates: { x: 200, y: 700 } },
        entities: [
            { type: 'button', x: 22*TILE, y: 28*TILE, w: TILE, h: TILE/2, props: { color: '#3b82f6', targetId: 'door_ates' } },
            { type: 'door', x: 20*TILE, y: 15*TILE, w: TILE, h: TILE*5, props: { id: 'door_ates', color: '#1e293b' } },
            { type: 'exit', x: 40*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } },
            { type: 'exit', x: 40*TILE, y: 26*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },
    "map_2_2": {
        name: "Kutu ve Fedakarlık",
        width: 1600, height: 1000,
        grid: (function() {
            let g = createGrid(50, 31);
            for(let x=2; x<15; x++) g[25][x] = 1;
            for(let x=15; x<30; x++) g[28][x] = 1;
            for(let x=30; x<48; x++) g[20][x] = 1;
            // Derin çukur
            for(let x=20; x<28; x++) g[27][x] = 4; // Asit
            return g;
        })(),
        spawns: { su: { x: 100, y: 700 }, ates: { x: 200, y: 700 } },
        entities: [
            { type: 'box', x: 10*TILE, y: 23*TILE, w: TILE*2, h: TILE*2, props: { resistance: 0.95 } }, // Asitin içine itilecek büyük kutu
            { type: 'button', x: 35*TILE, y: 20*TILE, w: TILE, h: TILE/2, props: { color: '#ef4444', targetId: 'door_su', requiresWeight: true } },
            { type: 'door', x: 40*TILE, y: 15*TILE, w: TILE, h: TILE*5, props: { id: 'door_su', color: '#1e293b' } },
            { type: 'exit', x: 45*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } },
            { type: 'exit', x: 38*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } }
        ]
    },
    "map_2_3": {
        name: "Büyük Tahterevalli",
        width: 1800, height: 1000,
        grid: (function() {
            let g = createGrid(56, 31);
            for(let x=2; x<10; x++) g[20][x] = 1;
            for(let x=20; x<36; x++) g[28][x] = 1;
            for(let x=46; x<54; x++) g[15][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 100, y: 500 }, ates: { x: 200, y: 500 } },
        entities: [
            { type: 'seesaw', x: 10*TILE, y: 20*TILE, w: TILE*10, h: TILE/2, props: {} }, // 1. denge
            { type: 'seesaw', x: 36*TILE, y: 22*TILE, w: TILE*10, h: TILE/2, props: {} }, // 2. denge
            { type: 'box', x: 5*TILE, y: 18*TILE, w: TILE, h: TILE, props: { resistance: 0.8 } }, // Ağırlık için
            { type: 'exit', x: 48*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } },
            { type: 'exit', x: 50*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    // ------------------------------------------------------------------
    // 3 KİŞİLİK HARİTALAR (Su, Ateş, Doğa)
    // ------------------------------------------------------------------
    "map_3_1": {
        name: "Sarmaşık Kulesi",
        width: 1800, height: 1200,
        grid: (function() {
            let g = createGrid(56, 37);
            for(let x=2; x<15; x++) g[30][x] = 1;
            for(let y=15; y<30; y++) g[y][18] = 5; // Tırmanma
            for(let x=19; x<30; x++) g[15][x] = 1;
            for(let x=22; x<40; x++) g[30][x] = 1;
            for(let x=25; x<28; x++) g[29][x] = 4; // Yeşil Asit
            for(let x=45; x<52; x++) g[15][x] = 1;
            for(let x=45; x<52; x++) g[30][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 100, y: 800 }, ates: { x: 200, y: 800 }, doga: { x: 300, y: 800 } },
        entities: [
            { type: 'button', x: 25*TILE, y: 15*TILE, w: TILE, h: TILE/2, props: { color: '#10b981', targetId: 'door_ortak' } },
            { type: 'door', x: 20*TILE, y: 25*TILE, w: TILE, h: TILE*5, props: { id: 'door_ortak', color: '#1e293b' } },
            { type: 'exit', x: 48*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'doga' } },
            { type: 'exit', x: 46*TILE, y: 28*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } },
            { type: 'exit', x: 49*TILE, y: 28*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },
    "map_3_2": {
        name: "Doğa'nın Yolu",
        width: 2000, height: 1200,
        grid: (function() {
            let g = createGrid(62, 37);
            for(let x=2; x<10; x++) g[30][x] = 1;
            for(let x=10; x<25; x++) g[34][x] = 1; // Alt yol (Su)
            for(let x=10; x<25; x++) g[26][x] = 1; // Üst yol (Ateş ve Doğa)
            for(let y=15; y<26; y++) g[y][25] = 5; // Doğa tırmanır
            for(let x=26; x<35; x++) g[15][x] = 1; // Doğa platform
            for(let x=40; x<55; x++) g[26][x] = 1; // Bitiş platform
            for(let x=40; x<55; x++) g[34][x] = 1; // Alt Bitiş platform
            return g;
        })(),
        spawns: { su: { x: 100, y: 800 }, ates: { x: 150, y: 800 }, doga: { x: 200, y: 800 } },
        entities: [
            { type: 'box', x: 30*TILE, y: 13*TILE, w: TILE, h: TILE, props: { resistance: 0.9 } }, // Doğa kutuyu iter
            { type: 'button', x: 20*TILE, y: 34*TILE, w: TILE, h: TILE/2, props: { color: '#3b82f6', targetId: 'door_ates', requiresWeight: true } },
            { type: 'door', x: 38*TILE, y: 21*TILE, w: TILE, h: TILE*5, props: { id: 'door_ates', color: '#1e293b' } }, // Kutunun düşüp butona basmasını veya suyun basmasını gerektiren kapı
            { type: 'exit', x: 50*TILE, y: 24*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } },
            { type: 'exit', x: 53*TILE, y: 24*TILE, w: TILE*2, h: TILE*2, props: { role: 'doga' } },
            { type: 'exit', x: 50*TILE, y: 32*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },
    "map_3_3": {
        name: "Ağırlık Dağılımı",
        width: 2000, height: 1200,
        grid: (function() {
            let g = createGrid(62, 37);
            for(let x=2; x<15; x++) g[25][x] = 1;
            for(let x=40; x<55; x++) g[25][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 100, y: 700 }, ates: { x: 200, y: 700 }, doga: { x: 300, y: 700 } },
        entities: [
            { type: 'seesaw', x: 16*TILE, y: 26*TILE, w: TILE*22, h: TILE, props: {} }, // Devasa denge
            { type: 'box', x: 10*TILE, y: 23*TILE, w: TILE*2, h: TILE*2, props: { resistance: 0.95 } },
            { type: 'exit', x: 45*TILE, y: 23*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } },
            { type: 'exit', x: 48*TILE, y: 23*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } },
            { type: 'exit', x: 51*TILE, y: 23*TILE, w: TILE*2, h: TILE*2, props: { role: 'doga' } }
        ]
    },

    // ------------------------------------------------------------------
    // 4 KİŞİLİK HARİTALAR (Su, Ateş, Doğa, Hava)
    // ------------------------------------------------------------------
    "map_4_1": {
        name: "Dört Yön",
        width: 2400, height: 1600,
        grid: (function() {
            let g = createGrid(75, 50);
            for(let x=30; x<45; x++) g[40][x] = 1;
            for(let y=15; y<40; y++) g[y][20] = 6; // Fırtına Sütunu
            for(let x=5; x<15; x++) g[15][x] = 1;
            for(let y=20; y<40; y++) g[y][50] = 5; // Sarmaşık
            for(let x=55; x<65; x++) g[20][x] = 1;
            for(let x=25; x<50; x++) g[45][x] = 1;
            for(let x=30; x<35; x++) g[44][x] = 2; // Lav
            for(let x=40; x<45; x++) g[44][x] = 3; // Su
            return g;
        })(),
        spawns: { su: { x: 32*TILE, y: 38*TILE }, ates: { x: 35*TILE, y: 38*TILE }, doga: { x: 38*TILE, y: 38*TILE }, hava: { x: 41*TILE, y: 38*TILE } },
        entities: [
            { type: 'button', x: 10*TILE, y: 15*TILE, w: TILE, h: TILE/2, props: { color: '#facc15', targetId: 'door_down_1', requiresWeight: true } },
            { type: 'door', x: 28*TILE, y: 40*TILE, w: TILE, h: TILE*5, props: { id: 'door_down_1', color: '#1e293b' } },
            { type: 'button', x: 60*TILE, y: 20*TILE, w: TILE, h: TILE/2, props: { color: '#10b981', targetId: 'door_down_2', requiresWeight: true } },
            { type: 'door', x: 47*TILE, y: 40*TILE, w: TILE, h: TILE*5, props: { id: 'door_down_2', color: '#1e293b' } },
            { type: 'exit', x: 6*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'hava' } },
            { type: 'exit', x: 62*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'doga' } },
            { type: 'exit', x: 25*TILE, y: 43*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } },
            { type: 'exit', x: 48*TILE, y: 43*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } }
        ]
    },
    "map_4_2": {
        name: "Hava Desteği",
        width: 2400, height: 1600,
        grid: (function() {
            let g = createGrid(75, 50);
            for(let x=5; x<20; x++) g[30][x] = 1;
            for(let x=25; x<40; x++) g[25][x] = 1;
            for(let y=20; y<50; y++) g[y][45] = 1; // Duvar
            for(let x=50; x<70; x++) g[20][x] = 1;
            return g;
        })(),
        spawns: { su: { x: 300, y: 900 }, ates: { x: 400, y: 900 }, doga: { x: 500, y: 900 }, hava: { x: 600, y: 900 } },
        entities: [
            { type: 'box', x: 30*TILE, y: 23*TILE, w: TILE, h: TILE, props: { resistance: 0.9 } }, // Havaya doğru itilecek
            { type: 'button', x: 35*TILE, y: 25*TILE, w: TILE, h: TILE/2, props: { color: '#facc15', targetId: 'door_hava' } },
            { type: 'door', x: 45*TILE, y: 10*TILE, w: TILE, h: TILE*10, props: { id: 'door_hava', color: '#1e293b' } },
            { type: 'exit', x: 55*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } },
            { type: 'exit', x: 58*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } },
            { type: 'exit', x: 61*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'doga' } },
            { type: 'exit', x: 64*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'hava' } }
        ]
    },
    "map_4_3": {
        name: "Kaos Zindanı",
        width: 2800, height: 1800,
        grid: (function() {
            let g = createGrid(87, 56);
            for(let x=5; x<20; x++) g[40][x] = 1; // Spawn
            for(let x=20; x<30; x++) g[45][x] = 1;
            for(let x=22; x<28; x++) g[44][x] = 2; // Lav
            for(let x=30; x<40; x++) g[50][x] = 1;
            for(let x=32; x<38; x++) g[49][x] = 3; // Su
            for(let y=30; y<50; y++) g[y][42] = 5; // Sarmaşık
            for(let x=40; x<55; x++) g[30][x] = 1;
            for(let y=15; y<30; y++) g[y][58] = 6; // Fırtına
            for(let x=60; x<80; x++) g[15][x] = 1; // Exit
            return g;
        })(),
        spawns: { su: { x: 300, y: 1200 }, ates: { x: 400, y: 1200 }, doga: { x: 500, y: 1200 }, hava: { x: 600, y: 1200 } },
        entities: [
            { type: 'seesaw', x: 42*TILE, y: 28*TILE, w: TILE*10, h: TILE, props: {} },
            { type: 'box', x: 10*TILE, y: 38*TILE, w: TILE, h: TILE, props: { resistance: 0.9 } },
            { type: 'exit', x: 65*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } },
            { type: 'exit', x: 68*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } },
            { type: 'exit', x: 71*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'doga' } },
            { type: 'exit', x: 74*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'hava' } }
        ]
    }
};
