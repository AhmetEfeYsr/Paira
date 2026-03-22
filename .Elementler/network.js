// network.js - WebRTC, PeerJS Bağlantıları ve Fizik Senkronizasyonu (Elementler)

let peer = null;
let myId = null;
let myName = null;
let isHost = false;
let hostId = null;
let connections = {};
let isCodeVisible = false;

// Element rolleri sabit sıra: 1. Su, 2. Ateş, 3. Doğa, 4. Hava
const ELEMENT_ROLES = ['su', 'ates', 'doga', 'hava'];

// --- KISA ODA KODU ÜRETİCİ ---


// --- KULLANICI ROLÜ VE BAĞLANTIYI BAŞLATMA ---
function setupUserRole() {
    const storedName = sessionStorage.getItem('playerName');
    const storedIsHost = sessionStorage.getItem('isHost') === 'true';
    const storedRoomCode = sessionStorage.getItem('roomCode');

    if (!storedName) {
        window.location.href = 'index.html'; // Fallback
        return;
    }

    // Easter Egg
    if (window.checkEasterEgg) window.checkEasterEgg(storedName);

    myName = storedName.substring(0, 25);
    isHost = storedIsHost;

    if (isHost) {
        document.getElementById('host-settings').classList.remove('hidden');
        document.getElementById('client-waiting').classList.add('hidden');
        initPeer(generateRoomCode());
    } else {
        if (!storedRoomCode) {
            window.location.href = 'index.html';
            return;
        }
        hostId = storedRoomCode;
        document.getElementById('host-settings').classList.add('hidden');
        document.getElementById('client-waiting').classList.remove('hidden');
        initPeer();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Session bazlı rolü kur
    setupUserRole();

    // Lobi Kodu Göster/Gizle ve Kopyala
    const btnToggleCode = document.getElementById('btn-toggle-code');
    if (btnToggleCode) {
        btnToggleCode.addEventListener('click', () => {
            isCodeVisible = !isCodeVisible;
            const codeDisplay = document.getElementById('display-room-code');
            btnToggleCode.innerText = isCodeVisible ? '🙈' : '👁️';
            if (codeDisplay) {
                codeDisplay.innerText = isCodeVisible ? (codeDisplay.dataset.code || '') : '••••••••';
            }
        });
    }

    const btnCopyRoom = document.getElementById('btn-copy-room');
    if(btnCopyRoom) {
        btnCopyRoom.addEventListener('click', () => {
            const codeToCopy = document.getElementById('display-room-code')?.dataset?.code;
            if (codeToCopy) {
                navigator.clipboard.writeText(codeToCopy)
                    .then(() => showToast("Oda kodu kopyalandı!", "success"))
                    .catch(() => showToast("Kopyalanamadı", "error"));
            }
        });
    }
});


// --- PEERJS AĞ ALTYAPISI ---
function initPeer(customId = null) {
    peer = new Peer(customId, {
        config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] },
        // debug: 1
    });

    peer.on('open', (id) => {
        myId = id;
        if (isHost) {
            hostId = myId;
            // Host olarak kendimizi oyunculara ekle (Element: Ateş)
            if(window.gameApp && window.gameApp.state) {
                window.gameApp.state.players[myId] = { id: myId, name: myName, role: ELEMENT_ROLES[0], isHost: true };
            }
            const codeDisplay = document.getElementById('display-room-code');
            if(codeDisplay) {
                codeDisplay.dataset.code = myId;
                codeDisplay.innerText = isCodeVisible ? myId : '••••••••';
            }
            if(typeof showScreen === 'function') showScreen('lobby-screen');
            if(typeof updateUI === 'function') updateUI();
        } else {
            connectToPeer(hostId);
        }
    });

    peer.on('connection', setupConnection);

    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        if (err.type === 'peer-unavailable') {
            showToast("Oda bulunamadı veya kapandı. Ana sayfaya dönülüyor.", "error");
            setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        } else if (err.type === 'unavailable-id' && isHost) {
            initPeer(generateRoomCode()); // Çakışma varsa yeni kod al
        } else if (err.type === 'network' || err.type === 'server-error') {
            showToast("Bağlantı hatası. Lütfen sayfayı yenileyin.", "error");
        }
    });
}

function connectToPeer(targetId) {
    if (!targetId || targetId === myId) return;
    const conn = peer.connect(targetId, { reliable: false }); // Fizik senkronizasyonu için UDP tarzı reliable:false daha hızlıdır ama WebRTC data channel'da tarayıcıya bağlıdır.
    setupConnection(conn);
}

function setupConnection(conn) {
    conn.on('open', () => {
        connections[conn.peer] = conn;
        if (isHost) {
            broadcastState(); // Lobi senkronizasyonu
        } else {
            conn.send({ type: 'JOIN', id: myId, name: myName });
        }
    });
    conn.on('data', (data) => handleData(data, conn.peer));
    conn.on('close', () => handleDisconnect(conn.peer));
}

// --- VERİ İLETİM FONKSİYONLARI ---
function broadcast(data) {
    Object.values(connections).forEach(conn => {
        if (conn.open) conn.send(data);
    });
}

// Lobi gibi kritik senkronizasyon (Reliable)
function broadcastState() {
    if (!isHost || !window.gameApp) return;
    broadcast({
        type: 'SYNC_STATE',
        state: window.gameApp.state,
        hostId
    });
}

// Fizik Senkronizasyonu (Hızlı, 60fps)
// İstemci tarafı tahmin (Client-side prediction) kullanıldığı için sadece X, Y, Vx, Vy ve Input gönderilir.
function sendPhysicsTick(physicsData) {
    // Host tüm oyunculara dağıtır, Client sadece host'a atar. Host sonra herkese dağıtır.
    if (isHost) {
        broadcast({ type: 'PHYSICS', peerId: myId, data: physicsData });
    } else {
        if(connections[hostId] && connections[hostId].open) {
            connections[hostId].send({ type: 'PHYSICS_UPDATE', peerId: myId, data: physicsData });
        }
    }
}

// Diğer Olaylar (Butona basma, level geçme)
function sendGameAction(action, payload) {
    if (isHost) {
        broadcast({ type: 'ACTION', action: action, payload: payload });
    } else {
        if(connections[hostId] && connections[hostId].open) {
            connections[hostId].send({ type: 'CLIENT_ACTION', action: action, payload: payload });
        }
    }
}

function handleData(data, peerId) {
    if (!data.type || !window.gameApp) return;

    if (data.type === 'JOIN' && isHost) {
        const playerCount = Object.keys(window.gameApp.state.players).length;
        if (playerCount >= 4) {
            if(connections[peerId]) connections[peerId].send({ type: 'ERROR', msg: 'Oda dolu!' });
            return;
        }
        // Sıradaki boş elementi ata
        let assignedRole = ELEMENT_ROLES[playerCount];

        window.gameApp.state.players[data.id] = {
            id: data.id,
            name: data.name,
            role: assignedRole,
            isHost: false
        };
        broadcastState();
        if(typeof updateUI === 'function') updateUI();
    }
    else if (data.type === 'SYNC_STATE') {
        window.gameApp.state = data.state;
        hostId = data.hostId;

        if (window.gameApp.state.status === 'playing') {
            if(typeof showScreen === 'function') showScreen('game-screen');
            if(!window.gameApp.engine) {
                window.gameApp.startGameEngine(); // Harita yüklenir, motor başlar
            }
        }
        else {
            if(typeof showScreen === 'function') showScreen('lobby-screen');
        }

        if(typeof updateUI === 'function') updateUI();
    }
    else if (data.type === 'PHYSICS_UPDATE' && isHost) {
        // İstemciden gelen fiziği al ve diğer herkese yansıt
        window.gameApp.updateRemotePhysics(data.peerId, data.data);
        broadcast({ type: 'PHYSICS', peerId: data.peerId, data: data.data });
    }
    else if (data.type === 'PHYSICS') {
        // Hosttan gelen fizik güncellemesi (benim dışımdakiler)
        if (data.peerId !== myId) {
            window.gameApp.updateRemotePhysics(data.peerId, data.data);
        }
    }
    else if (data.type === 'CLIENT_ACTION' && isHost) {
        // İstemci butona bastı vs, sunucu bunu onaylayıp herkese yayar
        window.gameApp.processAction(data.action, data.payload, data.peerId);
    }
    else if (data.type === 'ACTION') {
        // Sunucu onaylı aksiyon (Buton basılması, Kapı açılması, Ölüm, Seviye geçişi)
        window.gameApp.executeActionLocally(data.action, data.payload);
    }
    else if (data.type === 'ERROR') {
        showToast(data.msg, "error");
        setTimeout(() => { window.location.href = 'index.html'; }, 2000);
    }
}

function handleDisconnect(peerId) {
    if (connections[peerId]) delete connections[peerId];
    if (!window.gameApp || !window.gameApp.state.players[peerId]) return;

    const lostPlayer = window.gameApp.state.players[peerId];
    if(typeof showToast === 'function') showToast(`${lostPlayer.name} ayrıldı.`, "warning");

    // Co-op bir oyun olduğu için biri çıkarsa oyun lobiye dönmelidir veya patlamalıdır.
    if(window.gameApp.state.status === 'playing') {
        showToast("Bir oyuncu ayrıldığı için macera yarım kaldı!", "error");
        if(isHost) {
            window.gameApp.state.status = 'lobby';
            delete window.gameApp.state.players[peerId];
            broadcastState();
            if(window.gameApp.engine) {
                window.gameApp.engine.stop();
                window.gameApp.engine = null;
            }
            setTimeout(() => { showScreen('lobby-screen'); }, 2000);
        }
    } else {
        delete window.gameApp.state.players[peerId];
        if (isHost) broadcastState();
    }

    if(typeof updateUI === 'function') updateUI();
}

window.NetworkManager = {
    broadcast: broadcast,
    broadcastState: broadcastState,
    sendPhysicsTick: sendPhysicsTick,
    sendGameAction: sendGameAction,
    getMyId: () => myId,
    isHost: () => isHost
};



