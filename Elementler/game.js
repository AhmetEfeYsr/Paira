// game.js - Oyun Mantığı, Etkileşimler ve Lobi Yönetimi

class GameManager {
    constructor() {
        this.state = {
            status: 'lobby',
            players: {},
            deaths: 0,
            level: 1, // 1, 2, 3 ...
            mode: 'progression', // 'progression' veya 'free'
            playerCount: 1
        };

        this.engine = null;
        this.gameLoopRef = null;

        // Save Sistemi (localStorage)
        this.unlockedLevels = this.loadProgress();

        // Input Tracking
        this.keys = { up: false, down: false, left: false, right: false, jump: false };
        this.lastInputSent = JSON.stringify(this.keys);
    }

    loadProgress() {
        try {
            const saved = localStorage.getItem('elementler_progress');
            if (saved) return JSON.parse(saved);
        } catch(e) { console.error("Save okunamadı", e); }
        // Default (her kişi sayısı için 1. level açık)
        return { 1: 1, 2: 1, 3: 1, 4: 1 };
    }

    saveProgress(playerCount, newLevel) {
        if (newLevel > this.unlockedLevels[playerCount]) {
            this.unlockedLevels[playerCount] = newLevel;
            localStorage.setItem('elementler_progress', JSON.stringify(this.unlockedLevels));
        }
    }

    initEventListeners() {
        const btnStart = document.getElementById('btn-start-game');
        if(btnStart) {
            btnStart.addEventListener('click', () => {
                if(NetworkManager.isHost()) {
                    const select = document.getElementById('level-select');
                    this.state.level = parseInt(select.value) || 1;
                    const modeSelect = document.getElementById('mode-select');
                    this.state.mode = modeSelect.value || 'progression';
                    this.startGame();
                }
            });
        }

        const modeSelect = document.getElementById('mode-select');
        if(modeSelect) {
            modeSelect.addEventListener('change', () => {
                if(NetworkManager.isHost()) {
                    this.state.mode = modeSelect.value;
                    this.updateLevelSelectUI();
                }
            });
        }

        const btnNext = document.getElementById('btn-next-level');
        if(btnNext) {
            btnNext.addEventListener('click', () => {
                if(NetworkManager.isHost()) {
                    document.getElementById('winner-banner').classList.add('hidden');

                    // Sonraki bölüme geç (Eğer varsa)
                    const nextLevelKey = `map_${this.state.playerCount}_${this.state.level + 1}`;
                    if(window.MAPS && window.MAPS[nextLevelKey]) {
                        this.state.level++;
                        NetworkManager.sendGameAction('LOAD_LEVEL', { level: this.state.level, mode: this.state.mode });
                        this.executeActionLocally('LOAD_LEVEL', { level: this.state.level, mode: this.state.mode });
                    } else {
                        showToast("Tebrikler! Bu moddaki tüm bölümleri bitirdiniz.", "success");
                        // Lobiye dön
                        NetworkManager.sendGameAction('RETURN_LOBBY', {});
                        this.executeActionLocally('RETURN_LOBBY', {});
                    }
                }
            });
        }

        const btnBack = document.getElementById('btn-back-lobby');
        if(btnBack) {
            btnBack.addEventListener('click', () => {
                if(NetworkManager.isHost()) {
                    NetworkManager.sendGameAction('RETURN_LOBBY', {});
                    this.executeActionLocally('RETURN_LOBBY', {});
                }
            });
        }

        // Klavye Eventleri
        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
    }

    updateLevelSelectUI() {
        const select = document.getElementById('level-select');
        if(!select) return;

        select.innerHTML = '';
        const count = Object.keys(this.state.players).length || 1;
        const maxLevelUnlocked = this.unlockedLevels[count] || 1;

        // Haritaları bul
        let maxAvailable = 1;
        while(window.MAPS && window.MAPS[`map_${count}_${maxAvailable}`]) {
            maxAvailable++;
        }
        maxAvailable--; // son başarısız artışı geri al

        for(let i = 1; i <= maxAvailable; i++) {
            const option = document.createElement('option');
            option.value = i;
            const mapName = window.MAPS[`map_${count}_${i}`].name || `Bölüm ${i}`;

            if (this.state.mode === 'progression') {
                if (i <= maxLevelUnlocked) {
                    option.text = `${i}. ${mapName}`;
                } else {
                    option.text = `${i}. (Kilitli)`;
                    option.disabled = true;
                }
            } else {
                option.text = `${i}. ${mapName} (Özgür)`;
            }
            select.appendChild(option);
        }

        // Eğer seçili olan kilitliyse 1'e çek
        if(this.state.mode === 'progression' && select.value > maxLevelUnlocked) {
            select.value = 1;
        }
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

        // Clientlere de level'i zorla
        NetworkManager.sendGameAction('LOAD_LEVEL', { level: this.state.level, mode: this.state.mode });
        this.startGameEngine();
    }

    startGameEngine() {
        if(this.engine) this.engine.stop();

        this.engine = new GameEngine('game-canvas');

        // UI Geçişi
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('game-screen').classList.add('active');
        this.engine.resize();

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
    logicTick(rects, players, dynamicEntities) {
        if(!NetworkManager.isHost()) return; // Tetiklenmeleri sadece host hesaplar

        let allFinished = true;
        let activePlayersCount = 0;

        for (let id in players) {
            const p = players[id];
            if(p.dead) continue;

            activePlayersCount++;
            if(!p.finished) allFinished = false;

            for (let r of rects) {
                if(!p.intersects(r)) continue;

                // 1. ATEŞ YAKMASI (Tahta Duvar)
                if (r.type === 'tahta_duvar' && p.role === 'ates') {
                    this.executeActionLocally('DESTROY_RECT', { rx: r.x, ry: r.y });
                    NetworkManager.sendGameAction('DESTROY_RECT', { rx: r.x, ry: r.y });
                }
            }
        }

        if(activePlayersCount === 0) allFinished = false;

        // 2. BUTONLAR - Ağırlık ve normal basım kontrolü
        // Host tüm butonların state'ini kontrol edip gerekiyorsa basılı/basılmamış yapar
        const allEntities = [...Object.values(players), ...dynamicEntities.filter(e => e.type === 'box')];

        for (let r of rects) {
            if (r.type === 'button') {
                let isPressedNow = false;

                // Butonun üstünde ağırlık var mı?
                for (let e of allEntities) {
                    if (e.intersects(r)) {
                        isPressedNow = true;
                        break;
                    }
                }

                if (r.props.requiresWeight) {
                    // Ağırlık gerektiren buton: Üstünden inilirse geri kalkar
                    if (isPressedNow && !r.props.pressed) {
                        this.executeActionLocally('TOGGLE_BUTTON', { rx: r.x, ry: r.y, targetId: r.props.targetId, state: true });
                        NetworkManager.sendGameAction('TOGGLE_BUTTON', { rx: r.x, ry: r.y, targetId: r.props.targetId, state: true });
                    } else if (!isPressedNow && r.props.pressed) {
                        this.executeActionLocally('TOGGLE_BUTTON', { rx: r.x, ry: r.y, targetId: r.props.targetId, state: false });
                        NetworkManager.sendGameAction('TOGGLE_BUTTON', { rx: r.x, ry: r.y, targetId: r.props.targetId, state: false });
                    }
                } else {
                    // Kalıcı buton: Bir kere basıldıysa hep basılı kalır
                    if (isPressedNow && !r.props.pressed) {
                        this.executeActionLocally('TOGGLE_BUTTON', { rx: r.x, ry: r.y, targetId: r.props.targetId, state: true, permanent: true });
                        NetworkManager.sendGameAction('TOGGLE_BUTTON', { rx: r.x, ry: r.y, targetId: r.props.targetId, state: true, permanent: true });
                    }
                }
            }
        }

        // BÖLÜM BİTİŞ KONTROLÜ
        if(allFinished && activePlayersCount > 0) {
            // Sadece 1 kez tetiklenmesini sağla
            if(document.getElementById('winner-banner').classList.contains('hidden')) {
                // Host olarak ilerlemeyi kaydet (Özgür modda da kaydetsin zararı yok)
                if(this.state.mode === 'progression') {
                    this.saveProgress(this.state.playerCount, this.state.level + 1);
                }

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
        if(!this.engine && action !== 'RETURN_LOBBY') return;

        if (action === 'DESTROY_RECT') {
            // İlgili rect'i diziden çıkar
            const idx = this.engine.rects.findIndex(r => r.x === payload.rx && r.y === payload.ry && r.type === 'tahta_duvar');
            if(idx > -1) this.engine.rects.splice(idx, 1);
        }
        else if (action === 'TOGGLE_BUTTON') {
            const btn = this.engine.rects.find(r => r.x === payload.rx && r.y === payload.ry && r.type === 'button');
            if(btn) {
                btn.props.pressed = payload.state;
                if(payload.permanent) btn.props.pressed = true;
            }

            // Kapıyı bul
            const door = this.engine.rects.find(r => r.type === 'door' && r.props.id === payload.targetId);
            if(door) {
                // state = true ise kapı açılır (open=true)
                door.props.open = payload.state;
                if(payload.permanent) door.props.open = true;
            }
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
        else if (action === 'LOAD_LEVEL') {
            this.state.level = payload.level;
            this.state.mode = payload.mode;
            this.state.status = 'playing';
            document.getElementById('winner-banner').classList.add('hidden');
            this.startGameEngine();
        }
        else if (action === 'LEVEL_COMPLETE') {
            document.getElementById('winner-banner').classList.remove('hidden');

            // Sıradaki bölüm butonunu yönet
            const btnNext = document.getElementById('btn-next-level');
            const nextLevelKey = `map_${this.state.playerCount}_${this.state.level + 1}`;
            if(window.MAPS && !window.MAPS[nextLevelKey]) {
                btnNext.style.display = 'none'; // Sonraki bölüm yok
            } else {
                btnNext.style.display = 'inline-block';
            }

            // Sadece host basabilsin diye görsel
            if(!NetworkManager.isHost()) {
                btnNext.innerText = "Host Bekleniyor...";
                btnNext.classList.add('disabled');
            } else {
                btnNext.innerText = "Sıradaki Bölüme Geç";
                btnNext.classList.remove('disabled');
            }
        }
        else if (action === 'RETURN_LOBBY') {
            this.state.status = 'lobby';
            if(this.engine) this.engine.stop();
            document.getElementById('winner-banner').classList.add('hidden');
            document.getElementById('game-screen').classList.add('hidden');
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('lobby-screen').classList.remove('hidden');
            document.getElementById('lobby-screen').classList.add('active');
            if(NetworkManager.isHost()) this.updateLevelSelectUI();
        }
    }
}

function updateUI() {
    if(!window.gameApp) return;
    const state = window.gameApp.state;

    // Oyuncu Listesi (Lobi)
    const pList = document.getElementById('players-list');
    if (pList) {
        const oldHtml = pList.innerHTML;
        let newHtml = '';
        Object.values(state.players).forEach(p => {
            newHtml += `<li><span>${p.isHost ? '👑 ' : ''}${escapeHtml(p.name)} ${p.id === NetworkManager.getMyId() ? '(Sen)' : ''}</span> <strong style="color:var(--neon-blue)">${p.role.toUpperCase()}</strong></li>`;
        });
        if(oldHtml !== newHtml) pList.innerHTML = newHtml;

        const count = document.getElementById('player-count');
        if(count) count.innerText = Object.keys(state.players).length;
    }

    // Host isek Level Listesini Güncelle
    if(NetworkManager.isHost() && window.gameApp) {
        // Dropdown sadece hostta var, logic gereği güncellenmesi lazım
        // Ancak focus kaybolmaması için sadece length değiştiğinde güncelle
        const select = document.getElementById('level-select');
        const pCount = Object.keys(state.players).length || 1;
        if(select && !select.dataset.lastCount || select.dataset.lastCount != pCount) {
            select.dataset.lastCount = pCount;
            window.gameApp.updateLevelSelectUI();
        }
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