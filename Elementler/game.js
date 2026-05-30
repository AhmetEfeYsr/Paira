// game.js - Oyun Mantığı, Etkileşimler ve Lobi Yönetimi

class GameManager {
    constructor() {
        this.state = {
            status: 'lobby',
            players: {},
            deaths: 0,
            level: 'map_1_1', // Artık direkt map id tutuyoruz, varsayılan map_1_1 (1 kişilik)
            playerCount: 1
        };

        this.engine = null;
        this.gameLoopRef = null;

        // Save Sistemi (localStorage) - Artık bir obje: { "map_1_1": "completed", "map_1_2": "unlocked" }
        this.levelProgress = this.loadProgress();

        // Input Tracking
        this.keys = { up: false, down: false, left: false, right: false, jump: false };
        this.lastInputSent = JSON.stringify(this.keys);
    }

    loadProgress() {
        try {
            const saved = localStorage.getItem('elementler_progress_tree');
            if (saved) return JSON.parse(saved);
        } catch(e) { console.error("Save okunamadı", e); }

        // Varsayılan ilk bölümleri açık başlat
        return {
            "map_1_1": "unlocked",
            "map_2_1": "unlocked",
            "map_3_1": "unlocked",
            "map_4_1": "unlocked"
        };
    }

    saveProgress() {
        localStorage.setItem('elementler_progress_tree', JSON.stringify(this.levelProgress));
    }

    resetProgress() {
        localStorage.removeItem('elementler_progress_tree');
        this.levelProgress = this.loadProgress();
        this.updateLevelSelectUI();

        // Host ise herkese güncel progressi yolla
        if (NetworkManager.isHost()) {
            window.NetworkManager.broadcast({
                type: 'PROGRESS_SYNC',
                progress: this.levelProgress
            });
        }
    }

    markLevelComplete(mapId) {
        if(!window.MAPS || !window.MAPS[mapId]) return;

        this.levelProgress[mapId] = "completed";

        // Unlock next maps in the tree
        const mapData = window.MAPS[mapId];
        if (mapData.unlocks && Array.isArray(mapData.unlocks)) {
            for (let nextMap of mapData.unlocks) {
                if (this.levelProgress[nextMap] !== "completed") {
                    this.levelProgress[nextMap] = "unlocked";
                }
            }
        }
        this.saveProgress();
    }

    initEventListeners() {
        const btnNext = document.getElementById('btn-next-level');
        if(btnNext) {
            btnNext.addEventListener('click', () => {
                if(NetworkManager.isHost()) {
                    document.getElementById('winner-banner').classList.add('hidden');
                    // Branching sistemde "Sıradaki Bölüm" kavramı ağaca döndürmek olmalı
                    NetworkManager.sendGameAction('RETURN_LOBBY', {});
                    this.executeActionLocally('RETURN_LOBBY', {});
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

        const btnReset = document.getElementById('btn-reset-progress');
        if(btnReset) {
            btnReset.addEventListener('click', () => {
                if(NetworkManager.isHost()) {
                    if(confirm("İlerlemeyi sıfırlamak istediğinize emin misiniz?")) {
                        this.resetProgress();
                    }
                }
            });
        }

        // Klavye Eventleri
        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
    }

    // Ağaç Çizimini Başlat (updateUI'dan çağrılır)
    updateLevelSelectUI() {
        if (!NetworkManager.isHost()) return;

        // Kişi sayısına göre ağacı render et
        let pCount = Object.keys(this.state.players).length || 1;
        // Maximum oyuncu sayısı 4
        if (pCount > 4) pCount = 4;

        const container = document.getElementById('level-tree-nodes');
        const svgPath = document.getElementById('level-tree-lines');
        if (!container || !svgPath) return;

        // Scroll içeriğinin boyutunu ayarla
        const scrollContainer = document.getElementById('level-tree-container');
        if (scrollContainer) {
            let maxX = 0;
            let maxY = 0;
            let minY = 0;

            // İlgili kişi sayısına ait mapleri bul
            const mapsForCount = Object.keys(window.MAPS).filter(k => k.startsWith(`map_${pCount}_`));

            for (let mapId of mapsForCount) {
                const mapData = window.MAPS[mapId];
                if (mapData.treeX > maxX) maxX = mapData.treeX;
                if (mapData.treeY > maxY) maxY = mapData.treeY;
                if (mapData.treeY < minY) minY = mapData.treeY;
            }

            // Minimum Y değerini ofsetle, böylece negatif koordinatlar sıfırın üzerine taşınır
            const yOffset = minY < 0 ? Math.abs(minY) + 10 : 10;

            // En büyük Y ve X koordinatlarına göre sınırları (range) belirle
            // Haritalarımızda genellikle 0-100 arası değerler veriliyor ancak offset vs. eklendiğinde artabiliyor.
            const totalXRange = Math.max(100, maxX + 20);
            const totalYRange = Math.max(100, maxY + yOffset + 20);

            // CSS'te konteyner boyutunu büyütmek yerine %100'e sığdırıyoruz
            // Tüm nodların (X, Y) koordinatlarını (0-100%) skalasına indirgeyen fonksiyon
            const scaleX = (x) => (x / totalXRange) * 100;
            const scaleY = (y) => ((y + yOffset) / totalYRange) * 100;

            // Scroll container genişliğini/yüksekliğini abartı artırmak yerine, scrollable div'e minimum yükseklik veriyoruz
            // Böylece hem scroll olur hem de SVG ve Div'ler uyumlu ölçeklenir.
            scrollContainer.style.width = '100%';
            // Ekranda rahat kaydırma yapılabilmesi için toplam aralık kadar % boy veriyoruz:
            scrollContainer.style.height = `${totalYRange}%`;

            // SVG taşmalarını önlemek için overflow görünür yapıyoruz
            svgPath.style.overflow = 'visible';
            svgPath.removeAttribute('viewBox');

            container.innerHTML = '';
            let svgHtml = '';

            // Önce Çizgileri çiz (Bağlantılar)
            for (let mapId of mapsForCount) {
                const mapData = window.MAPS[mapId];
                if (!mapData.unlocks) continue;

                for (let targetId of mapData.unlocks) {
                    const targetData = window.MAPS[targetId];
                    if (targetData) {
                        const x1 = scaleX(mapData.treeX);
                        const y1 = scaleY(mapData.treeY);
                        const x2 = scaleX(targetData.treeX);
                        const y2 = scaleY(targetData.treeY);

                        // Source node bitmişse altınımsı (facc15), değilse karanlık
                        const isUnlocked = this.levelProgress[mapId] === 'completed';
                        const color = isUnlocked ? '#facc15' : 'rgba(255,255,255,0.05)';
                        const width = isUnlocked ? 4 : 2;

                        // % olarak tam pozisyon
                        svgHtml += `<line x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%" stroke="${color}" stroke-width="${width}" />`;
                    }
                }
            }
            svgPath.innerHTML = svgHtml;

            // Sonra Nodları Çiz
            for (let mapId of mapsForCount) {
                const mapData = window.MAPS[mapId];
                let nodeState = 'locked';

                // Map tamamlandıysa "completed", değilse kilit kontrolü
                if (this.levelProgress[mapId] === 'completed') {
                    nodeState = 'completed';
                } else if (mapId === `map_${pCount}_1`) {
                    nodeState = 'unlocked'; // İlk harita hep açıktır
                } else {
                    if (this.levelProgress[mapId] === 'unlocked') {
                        nodeState = 'unlocked';
                    } else {
                        for (let parentId of mapsForCount) {
                            const pData = window.MAPS[parentId];
                            if (pData.unlocks && pData.unlocks.includes(mapId)) {
                                if (this.levelProgress[parentId] === 'completed') {
                                    nodeState = 'unlocked';
                                    break;
                                }
                            }
                        }
                    }
                }

                const node = document.createElement('div');
                node.className = `level-node type-${mapData.type || 'hexagon'} state-${nodeState}`;
                node.style.left = `${scaleX(mapData.treeX)}%`;
                node.style.top = `${scaleY(mapData.treeY)}%`;
                node.title = mapData.name || mapId;

                if (nodeState !== 'locked') {
                    node.addEventListener('click', () => {
                        this.state.level = mapId;
                        this.startGame();
                    });
                }

                container.appendChild(node);
            }
        } // End if(scrollContainer)
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

        // Clientlere de level'i zorla (Level ID olarak geçiyor artık)
        NetworkManager.sendGameAction('LOAD_LEVEL', { level: this.state.level });
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

        // Haritayı Seç (Artık state.level direkt mapId stringidir. Örn "map_1_5")
        const mapId = this.state.level;
        const mapData = window.MAPS ? window.MAPS[mapId] : null;

        if(!mapData) {
            showToast(`Harita bulunamadı: ${mapId}.`, 'error');
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
                // Host olarak ilerlemeyi kaydet
                this.markLevelComplete(this.state.level);

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
            const myId = NetworkManager.getMyId();
            const p = this.engine.players[myId];
            if (p) {
                p.vx = 0; p.vy = 0; p.finished = true;
                this.executeActionLocally('MARK_FINISH_DOOR', { role: p.role });
                NetworkManager.sendGameAction('MARK_FINISH_DOOR', { role: p.role });
            }
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
            this.state.level = payload.level; // payload.level is a string ID e.g., 'map_1_5'
            this.state.status = 'playing';
            document.getElementById('winner-banner').classList.add('hidden');
            this.startGameEngine();
        }
        else if (action === 'LEVEL_COMPLETE') {
            document.getElementById('winner-banner').classList.remove('hidden');

            const btnNext = document.getElementById('btn-next-level');
            // Ağaç yapısında her zaman lobiye/ağaca döner
            if(!NetworkManager.isHost()) {
                btnNext.innerText = "Host Bekleniyor...";
                btnNext.classList.add('disabled');
            } else {
                btnNext.innerText = "Ağaca Dön";
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
            newHtml += `<li><span>${p.isHost ? '👑 ' : ''}${window.escapeHtml(p.name)} ${p.id === NetworkManager.getMyId() ? '(Sen)' : ''}</span> <strong style="color:var(--neon-purple)">${p.role.toUpperCase()}</strong></li>`;
        });
        if(oldHtml !== newHtml) pList.innerHTML = newHtml;

        const count = document.getElementById('player-count');
        if(count) count.innerText = Object.keys(state.players).length;
    }

    // Client UI Durumu (Client'e sadece bekleme ekranı gösteriyoruz)
    const hostSettings = document.getElementById('host-settings');
    const clientWaiting = document.getElementById('client-waiting');

    if (NetworkManager.isHost()) {
        if (hostSettings) hostSettings.classList.remove('hidden');
        if (clientWaiting) clientWaiting.classList.add('hidden');

        // Host için reset butonunu göster
        const btnReset = document.getElementById('btn-reset-progress');
        if(btnReset) btnReset.style.display = 'block';
    } else {
        if (hostSettings) hostSettings.classList.add('hidden');
        if (clientWaiting) clientWaiting.classList.remove('hidden');
    }

    // Host isek Ağaç Listesini Güncelle
    if(NetworkManager.isHost() && window.gameApp && window.gameApp.state.status === 'lobby') {
        window.gameApp.updateLevelSelectUI();
    }
}

// Başlat
document.addEventListener('DOMContentLoaded', () => {
    window.gameApp = new GameManager();
    window.gameApp.initEventListeners();
});