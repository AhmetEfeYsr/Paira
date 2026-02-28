// maps.js - Harita Verileri ve Fizik Objeleri Tanımları
// Değerler:
// 0: Boş, 1: Solid (Duvar), 2: Ateş (Lav), 3: Su (Zehir), 4: Doğa (Asit), 5: Sarmaşık, 6: Fırtına, 7: Tahta Duvar, 8: Boru

// Örnek Çok Basit Bir Katman Oluşturucu Fonksiyon
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
    // 1 KİŞİLİK HARİTA (Sadece Su - Mavi)
    // ------------------------------------------------------------------
    "map_1_1": {
        width: 1200, height: 800,
        grid: (function() {
            let g = createGrid(38, 25);
            // Zeminler
            for(let x=2; x<15; x++) g[15][x] = 1; // Başlangıç platformu
            for(let x=18; x<30; x++) g[20][x] = 1; // Alt platform
            for(let x=25; x<35; x++) g[10][x] = 1; // Çıkış platformu

            // Boru Engeli
            for(let y=15; y<20; y++) g[y][18] = 8; // Sadece Su geçebilir

            return g;
        })(),
        spawns: {
            su: { x: 100, y: 400 } // TILE * X, Y vs
        },
        entities: [
            // Çıkış Kapısı
            { type: 'exit', x: 28*TILE, y: 8*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    // ------------------------------------------------------------------
    // 2 KİŞİLİK HARİTA (Su ve Ateş)
    // ------------------------------------------------------------------
    "map_2_1": {
        width: 1500, height: 1000,
        grid: (function() {
            let g = createGrid(46, 31);

            // Başlangıç Platformu (Ortak)
            for(let x=2; x<10; x++) g[25][x] = 1;

            // Su Yolu (Aşağı)
            for(let x=10; x<25; x++) g[28][x] = 1;
            for(let x=15; x<20; x++) g[27][x] = 3; // Mavi Zehir Havuzu

            // Ateş Yolu (Yukarı)
            for(let x=10; x<20; x++) g[20][x] = 1;
            for(let x=22; x<35; x++) g[15][x] = 1;
            for(let x=25; x<30; x++) g[14][x] = 2; // Kırmızı Lav Havuzu

            // Tahta Duvar (Ateş yıkmalı)
            for(let y=10; y<15; y++) g[y][32] = 7;

            // Bitiş Platformu
            for(let x=38; x<44; x++) g[15][x] = 1;
            for(let x=38; x<44; x++) g[28][x] = 1;

            return g;
        })(),
        spawns: {
            su: { x: 100, y: 700 },
            ates: { x: 200, y: 700 }
        },
        entities: [
            // Buton Su'nun yolunda (Kapı Ateş'in yolunda açılacak)
            { type: 'button', x: 22*TILE, y: 28*TILE, w: TILE, h: TILE/2, props: { color: '#3b82f6', targetId: 'door_ates' } },
            // Kapı Ateş'in yolunu kesiyor
            { type: 'door', x: 20*TILE, y: 15*TILE, w: TILE, h: TILE*5, props: { id: 'door_ates', color: '#1e293b' } },

            // Çıkışlar
            { type: 'exit', x: 40*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } },
            { type: 'exit', x: 40*TILE, y: 26*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    // ------------------------------------------------------------------
    // 3 KİŞİLİK HARİTA (Su, Ateş, Doğa)
    // ------------------------------------------------------------------
    "map_3_1": {
        width: 1800, height: 1200,
        grid: (function() {
            let g = createGrid(56, 37);

            // Spawn
            for(let x=2; x<15; x++) g[30][x] = 1;

            // Doğa için Sarmaşık Kulesi
            for(let y=15; y<30; y++) g[y][18] = 5; // Tırmanma
            for(let x=19; x<30; x++) g[15][x] = 1; // Doğa Zemin

            // Ateş/Su Ortak İlerleyiş
            for(let x=22; x<40; x++) g[30][x] = 1;
            for(let x=25; x<28; x++) g[29][x] = 4; // Yeşil Asit (İkisi de ölür, buton Doğa'da)

            // Bitiş Platformları
            for(let x=45; x<52; x++) g[15][x] = 1;
            for(let x=45; x<52; x++) g[30][x] = 1;

            return g;
        })(),
        spawns: {
            su: { x: 100, y: 800 },
            ates: { x: 200, y: 800 },
            doga: { x: 300, y: 800 }
        },
        entities: [
            // Doğa yukarı çıkıp butona basar, alttaki kapıyı açar
            { type: 'button', x: 25*TILE, y: 15*TILE, w: TILE, h: TILE/2, props: { color: '#10b981', targetId: 'door_ortak' } },
            { type: 'door', x: 20*TILE, y: 25*TILE, w: TILE, h: TILE*5, props: { id: 'door_ortak', color: '#1e293b' } },

            // Çıkışlar
            { type: 'exit', x: 48*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'doga' } },
            { type: 'exit', x: 46*TILE, y: 28*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } },
            { type: 'exit', x: 49*TILE, y: 28*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } }
        ]
    },

    // ------------------------------------------------------------------
    // 4 KİŞİLİK HARİTA (Su, Ateş, Doğa, Hava)
    // ------------------------------------------------------------------
    "map_4_1": {
        width: 2400, height: 1600,
        grid: (function() {
            let g = createGrid(75, 50);

            // Merkez Spawn
            for(let x=30; x<45; x++) g[40][x] = 1;

            // Hava Sol Taraf (Fırtınalı Uçuş)
            for(let y=15; y<40; y++) g[y][20] = 6; // Fırtına Sütunu
            for(let x=5; x<15; x++) g[15][x] = 1;  // Hava Platformu

            // Doğa Sağ Taraf (Sarmaşık Dağı)
            for(let y=20; y<40; y++) g[y][50] = 5;
            for(let x=55; x<65; x++) g[20][x] = 1; // Doğa Platformu

            // Ateş ve Su Merkez Alt Zindan
            for(let x=25; x<50; x++) g[45][x] = 1;
            for(let x=30; x<35; x++) g[44][x] = 2; // Lav
            for(let x=40; x<45; x++) g[44][x] = 3; // Su

            return g;
        })(),
        spawns: {
            su: { x: 32*TILE, y: 38*TILE },
            ates: { x: 35*TILE, y: 38*TILE },
            doga: { x: 38*TILE, y: 38*TILE },
            hava: { x: 41*TILE, y: 38*TILE }
        },
        entities: [
            // Hava uçup butona basar, Ateş/Su için kapı 1 açılır
            { type: 'button', x: 10*TILE, y: 15*TILE, w: TILE, h: TILE/2, props: { color: '#facc15', targetId: 'door_down_1' } },
            { type: 'door', x: 28*TILE, y: 40*TILE, w: TILE, h: TILE*5, props: { id: 'door_down_1', color: '#1e293b' } },

            // Doğa tırmanıp butona basar, Ateş/Su için kapı 2 açılır
            { type: 'button', x: 60*TILE, y: 20*TILE, w: TILE, h: TILE/2, props: { color: '#10b981', targetId: 'door_down_2' } },
            { type: 'door', x: 47*TILE, y: 40*TILE, w: TILE, h: TILE*5, props: { id: 'door_down_2', color: '#1e293b' } },

            // Çıkışlar
            { type: 'exit', x: 6*TILE, y: 13*TILE, w: TILE*2, h: TILE*2, props: { role: 'hava' } },
            { type: 'exit', x: 62*TILE, y: 18*TILE, w: TILE*2, h: TILE*2, props: { role: 'doga' } },
            { type: 'exit', x: 25*TILE, y: 43*TILE, w: TILE*2, h: TILE*2, props: { role: 'su' } },
            { type: 'exit', x: 48*TILE, y: 43*TILE, w: TILE*2, h: TILE*2, props: { role: 'ates' } }
        ]
    }
};