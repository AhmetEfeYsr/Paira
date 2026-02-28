// game.js - Oyun Mantığı, Etkileşimler ve Lobi Yönetimi

class GameManager {
    constructor() {
        this.state = {
            status: 'lobby',
            players: {},
            deaths: 0,
            level: 1, // 1 kişilikse map_1_1, 2 kişilikse map_2_1 vb. mapler kullanılacak
            playerCount: 1
        };

        this.engine = null;
        this.gameLoopRef = null;

        // Input Tracking
        this.keys = { up: false, down: false, left: false, right: false, jump: false };
        this.lastInputSent = JSON.stringify(this.keys);
    }

    initEventListeners() {
        const btnStart = document.getElementById('btn-start-game');
        if(btnStart) {
            btnStart.addEventListener('click', () => {
                if(NetworkManager.isHost()) this.startGame();
            });
        }

        const btnNext = document.getElementById('btn-next-level');
        if(btnNext) {
            btnNext.addEventListener('click', () => {
                if(NetworkManager.isHost()) {
                    document.getElementById('winner-banner').classList.add('hidden');
                    // Bir sonraki bölüme geçme mantığı eklenebilir. Şu anlık aynı bölümü restart atarız.
                    NetworkManager.sendGameAction('RESTART_LEVEL', {});
                    this.executeActionLocally('RESTART_LEVEL', {});
                }
            });
        }

        // Klavye Eventleri
        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
    }

    handleKey(e, isDown) {
        if(this.state.status !== 'playing') return;

        switch(e.code) {
            case 'KeyW': case 'ArrowUp': this.keys.up = isDown; break;
            case 'KeyS': case 'ArrowDown': this.keys.down = isDown; break;
            case 'KeyA': case 'ArrowLeft': this.keys.left = isDown; break;
            case 'KeyD': case 'ArrowRight': this.keys.right = isDown; break;
            case 'Space': this.keys.jump = isDown; break;
            default: return;
        }

        // Engine'e ilet (Local hareket için hemen tepki)
        if(this.engine) {
            this.engine.setLocalInput(this.keys);
        }

        // Ağ üzerinden sadece input değiştiğinde yolla (Optimizasyon)
        const currentInput = JSON.stringify(this.keys);
        if(currentInput !== this.lastInputSent) {
            this.lastInputSent = currentInput;
            if(this.engine && this.engine.players[NetworkManager.getMyId()]) {
                const p = this.engine.players[NetworkManager.getMyId()];
                NetworkManager.sendPhysicsTick({
                    x: p.x, y: p.y, vx: p.vx, vy: p.vy, input: this.keys
                });
            }
        }
    }

    startGame() {
        const ids = Object.keys(this.state.players);
        this.state.playerCount = ids.length;
        this.state.status = 'playing';
        this.state.deaths = 0;

        NetworkManager.broadcastState();
        this.startGameEngine();
    }

    startGameEngine() {
        if(this.engine) this.engine.stop();

        this.engine = new GameEngine('game-canvas');

        // Haritayı Seç (Örn: 2 kişi varsa window.MAPS["map_2_1"])
        const mapKey = `map_${this.state.playerCount}_${this.state.level}`;
        const mapData = window.MAPS ? window.MAPS[mapKey] : null;

        if(!mapData) {
            showToast(`Harita bulunamadı: ${mapKey}. Lütfen harita ekleyin.`, 'error');
            return;
        }

        this.engine.loadMap(mapData);

        // Oyuncuları Ekle
        const myId = NetworkManager.getMyId();
        for(let id in this.state.players) {
            const p = this.state.players[id];
            // mapData.spawns objesinde { su: {x,y}, ates: {x,y} } şeklinde olmalı
            const spawn = mapData.spawns[p.role] || { x: 50, y: 50 };
            this.engine.addPlayer(id, p.role, p.name, spawn.x, spawn.y, id === myId);
        }

        // FPS/Scoreboard Update
        document.getElementById('death-val').innerText = this.state.deaths;
        document.getElementById('winner-banner').classList.add('hidden');

        this.engine.start();

        // Host isek, periyodik olarak mutlak konumu yolla (desync önleyici, saniyede 10 kez)
        if(NetworkManager.isHost() && this.gameLoopRef) {
            clearInterval(this.gameLoopRef);
        }
        if(NetworkManager.isHost()) {
            this.gameLoopRef = setInterval(() => {
                if(this.state.status === 'playing' && this.engine) {
                    const myP = this.engine.players[myId];
                    if(myP) NetworkManager.sendPhysicsTick({ x: myP.x, y: myP.y, vx: myP.vx, vy: myP.vy, input: this.keys });
                }
            }, 100);
        }
    }

    // AĞDAN GELEN VERİLER
    updateRemotePhysics(peerId, data) {
        if(!this.engine || !this.engine.players[peerId]) return;
        const p = this.engine.players[peerId];

        // Interpolation yapılabilir, şu an direkt setliyoruz
        p.x = data.x;
        p.y = data.y;
        p.vx = data.vx;
        p.vy = data.vy;
        p.input = data.input;
    }

    // OYUN MANTIĞI: ETKİLEŞİMLER (Engine Loop içinden her karede çağrılır)
    logicTick(rects, players) {
        if(!NetworkManager.isHost()) return; // Tetiklenmeleri sadece host hesaplar

        let allFinished = true;

        for (let id in players) {
            const p = players[id];

            if(!p.finished) allFinished = false;

            for (let r of rects) {
                if(!p.intersects(r)) continue;

                // 1. ATEŞ YAKMASI (Tahta Duvar)
                if (r.type === 'tahta_duvar' && p.role === 'ates') {
                    // Yok et, herkese bildir
                    this.executeActionLocally('DESTROY_RECT', { rx: r.x, ry: r.y });
                    NetworkManager.sendGameAction('DESTROY_RECT', { rx: r.x, ry: r.y });
                }

                // 2. BUTONLAR
                if (r.type === 'button') {
                    // Bu sadece çok basit bir örnek, buton basıldığında belirli kapıyı (door) açar
                    if(!r.props.pressed) {
                        r.props.pressed = true;
                        this.executeActionLocally('PRESS_BUTTON', { rx: r.x, ry: r.y, targetId: r.props.targetId });
                        NetworkManager.sendGameAction('PRESS_BUTTON', { rx: r.x, ry: r.y, targetId: r.props.targetId });
                    }
                }
            }
        }

        // BÖLÜM BİTİŞ KONTROLÜ
        if(allFinished && Object.keys(players).length > 0) {
            // Sadece 1 kez tetiklenmesini sağla
            if(document.getElementById('winner-banner').classList.contains('hidden')) {
                this.executeActionLocally('LEVEL_COMPLETE', {});
                NetworkManager.sendGameAction('LEVEL_COMPLETE', {});
            }
        }
    }

    // Engine'den fırlatılan ölüm (Client tetikler)
    triggerDeath(role) {
        showToast(`${role.toUpperCase()} öldü! Bölüm baştan başlıyor...`, 'error');
        if(NetworkManager.isHost()) {
            this.handleDeath();
        } else {
            NetworkManager.sendGameAction('PLAYER_DEATH', { role });
        }
    }

    triggerFinish(role) {
        showToast(`${role.toUpperCase()} kapıya ulaştı! Bekliyor...`, 'success');
        if(NetworkManager.isHost()) {
            // Host logicTick'te kontrol ediyor
        } else {
            NetworkManager.sendGameAction('PLAYER_FINISH', { role });
        }
    }

    // Host tarafı ölüm yönetimi
    handleDeath() {
        this.state.deaths++;
        NetworkManager.sendGameAction('RESTART_LEVEL', { addDeath: true });
        this.executeActionLocally('RESTART_LEVEL', { addDeath: true });
    }

    // Aksiyonların tüm clientlarda (sunucu dahil) işlenmesi
    processAction(action, payload, peerId) {
        // İstemci aksiyonları (örneğin öldüğünü bildirdi)
        if (action === 'PLAYER_DEATH') {
            this.handleDeath();
        } else if (action === 'PLAYER_FINISH') {
            const p = this.engine.players[peerId];
            if(p) {
                p.vx = 0; p.vy = 0; p.finished = true;
                this.executeActionLocally('MARK_FINISH_DOOR', { role: p.role });
                NetworkManager.sendGameAction('MARK_FINISH_DOOR', { role: p.role });
            }
        }
    }

    executeActionLocally(action, payload) {
        if(!this.engine) return;

        if (action === 'DESTROY_RECT') {
            // İlgili rect'i diziden çıkar
            const idx = this.engine.rects.findIndex(r => r.x === payload.rx && r.y === payload.ry && r.type === 'tahta_duvar');
            if(idx > -1) this.engine.rects.splice(idx, 1);
        }
        else if (action === 'PRESS_BUTTON') {
            const btn = this.engine.rects.find(r => r.x === payload.rx && r.y === payload.ry && r.type === 'button');
            if(btn) btn.props.pressed = true;

            // Kapıyı kaldır (aç)
            const doorIdx = this.engine.rects.findIndex(r => r.type === 'door' && r.props.id === payload.targetId);
            if(doorIdx > -1) this.engine.rects.splice(doorIdx, 1);
        }
        else if (action === 'MARK_FINISH_DOOR') {
            const door = this.engine.rects.find(r => r.type === 'exit' && r.props.role === payload.role);
            if(door) door.props.finished = true;
        }
        else if (action === 'RESTART_LEVEL') {
            if(payload.addDeath) {
                this.state.deaths++;
                document.getElementById('death-val').innerText = this.state.deaths;
            }
            this.startGameEngine(); // Haritayı tekrar yükle
        }
        else if (action === 'LEVEL_COMPLETE') {
            document.getElementById('winner-banner').classList.remove('hidden');
        }
    }
}

function updateUI() {
    if(!window.gameApp) return;
    const state = window.gameApp.state;

    // Oyuncu Listesi (Lobi)
    const pList = document.getElementById('players-list');
    if (pList) {
        pList.innerHTML = '';
        Object.values(state.players).forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p.isHost ? '👑 ' : ''}${escapeHtml(p.name)} ${p.id === NetworkManager.getMyId() ? '(Sen)' : ''}</span> <strong style="color:var(--neon-blue)">${p.role.toUpperCase()}</strong>`;
            pList.appendChild(li);
        });

        const count = document.getElementById('player-count');
        if(count) count.innerText = Object.keys(state.players).length;
    }

    // Host isek Butonu Kontrol Et
    const btnStart = document.getElementById('btn-start-game');
    if(btnStart && NetworkManager.isHost()) {
        const pCount = Object.keys(state.players).length;
        if(pCount >= 1 && pCount <= 4) {
            btnStart.classList.remove('disabled');
            btnStart.innerText = `${pCount} Kişilik Macerayı Başlat`;
        } else {
            btnStart.classList.add('disabled');
            btnStart.innerText = "Bekleniyor...";
        }
    }
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Başlat
document.addEventListener('DOMContentLoaded', () => {
    window.gameApp = new GameManager();
    window.gameApp.initEventListeners();
});