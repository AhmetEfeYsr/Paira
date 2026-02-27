// network.js - WebRTC, PeerJS Bağlantıları ve Veri İletimi

let peer = null;
let myId = null;
let myName = null;
let isHost = false;
let hostId = null;
let connections = {};

// Global Değişkenler
let isCodeVisible = false;

// --- KISA ODA KODU ÜRETİCİ ---
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Karışıklık olmasın diye 0,O,1,I hariç
    let result = '';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

// --- KULLANICI ROLÜ VE BAĞLANTIYI BAŞLATMA ---
function setupUserRole(isHosting) {
    // Ses başlangıcı (varsa)
    if (typeof initAudio === 'function') initAudio();

    const nameInput = document.getElementById('username-input').value.trim();
    if (!nameInput) {
        if (typeof showToast === 'function') showToast("Lütfen bir ad girin", "error");
        return;
    }

    // Easter Egg Kontrolü
    const lowerName = nameInput.toLowerCase();
    if (lowerName === 'paira' || lowerName === 'pai' || lowerName === 'paiko') {
        if (typeof showToast === 'function') showToast("canım ablam 💜", "info");
    }

    myName = nameInput.substring(0, 25);
    isHost = isHosting;

    if (isHost) {
        document.getElementById('host-settings').classList.remove('hidden');
        document.getElementById('client-waiting').classList.add('hidden');
        initPeer(generateRoomCode()); // Kurucu için kısa kod üret
    } else {
        const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
        if (!roomCode) {
            if (typeof showToast === 'function') showToast("Oda kodu gerekli", "error");
            return;
        }
        hostId = roomCode;
        document.getElementById('host-settings').classList.add('hidden');
        document.getElementById('client-waiting').classList.remove('hidden');
        initPeer(); // Katılımcı için rastgele PeerID, sonra Host'a bağlanacak
    }
}

// Buton Dinleyicileri (DOM yüklendikten sonra eklenecek, veya elementler varsa)
document.addEventListener('DOMContentLoaded', () => {
    const btnHost = document.getElementById('btn-host');
    if(btnHost) btnHost.addEventListener('click', () => setupUserRole(true));

    const btnJoin = document.getElementById('btn-join');
    if(btnJoin) btnJoin.addEventListener('click', () => setupUserRole(false));

    // Lobi Kodu Göster/Gizle ve Kopyala
    const btnToggleCode = document.getElementById('btn-toggle-code');
    if (btnToggleCode) {
        btnToggleCode.addEventListener('click', () => {
            isCodeVisible = !isCodeVisible; // global variable in game.js usually
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
                    .then(() => { if(typeof showToast === 'function') showToast("Oda kodu kopyalandı!", "success"); })
                    .catch(() => { if(typeof showToast === 'function') showToast("Kopyalanamadı", "error"); });
            }
        });
    }
});


// --- PEERJS AĞ ALTYAPISI ---
function initPeer(customId = null) {
    peer = new Peer(customId, {
        config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] },
        debug: 1
    });

    peer.on('open', (id) => {
        myId = id;
        if (isHost) {
            hostId = myId;
            // Host olarak kendimizi oyunculara ekle
            if(window.gameApp && window.gameApp.state) {
                window.gameApp.state.players[myId] = { id: myId, name: myName, role: 'masum', isHost: true, score: 0 };
            }
            const codeDisplay = document.getElementById('display-room-code');
            if(codeDisplay) {
                codeDisplay.dataset.code = myId;
                codeDisplay.innerText = typeof isCodeVisible !== 'undefined' && isCodeVisible ? myId : '••••••••';
            }
            if(typeof showScreen === 'function') showScreen('lobby-screen');
            if(typeof updateUI === 'function') updateUI();
        } else {
            connectToPeer(hostId);
        }
    });

    peer.on('connection', setupConnection);

    peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
            if(typeof showToast === 'function') showToast("Oda bulunamadı veya kapandı.", "error");
            if(typeof showScreen === 'function') showScreen('login-screen');
        } else if (err.type === 'unavailable-id' && isHost) {
            // Eğer kısa kod çakışırsa yeniden dene
            initPeer(generateRoomCode());
        }
    });
}

function connectToPeer(targetId) {
    if (!targetId || targetId === myId) return;
    const conn = peer.connect(targetId, { reliable: true });
    setupConnection(conn);
}

function setupConnection(conn) {
    conn.on('open', () => {
        connections[conn.peer] = conn;
        if (isHost) {
            broadcastSync();
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

function broadcastSync() {
    if (!isHost || !window.gameApp) return;

    const stateCopy = { ...window.gameApp.state };
    // Optimizasyon: Büyük verileri ayıkla gerekirse

    broadcast({
        type: 'SYNC',
        state: stateCopy,
        hostId,
        serverTime: Date.now()
    });
}

function handleData(data, peerId) {
    if (!data.type || !window.gameApp) return;
    const appState = window.gameApp.state;

    if (data.type === 'JOIN' && isHost) {
        appState.players[data.id] = {
            id: data.id,
            name: data.name,
            role: 'masum', // Başlangıçta herkes masum, oyun başlayınca ebe seçilir
            isHost: false,
            score: 0
        };
        broadcastSync();
        if(typeof updateUI === 'function') updateUI();
    }
    else if (data.type === 'SYNC') {
        window.gameApp.state = data.state;
        hostId = data.hostId;

        if (window.gameApp.state.status === 'playing') {
            if(typeof showScreen === 'function') showScreen('game-screen');
            // Eğer yeni raunt başladıysa ve localUI güncellenmesi gerekiyorsa:
            if(window.gameApp.syncRoundData) window.gameApp.syncRoundData();
        }
        else if (window.gameApp.state.status === 'finished') {
            if(typeof showScreen === 'function') showScreen('winner-screen');
        }
        else {
            if(typeof showScreen === 'function') showScreen('lobby-screen');
        }

        if(typeof updateUI === 'function') updateUI();
    }
    else if (data.type === 'SUBMIT_WORD' && isHost) {
        window.gameApp.handleRemoteSubmission(peerId, data.word);
    }
    else if (data.type === 'SUBMIT_GUESSES' && isHost) {
        window.gameApp.handleRemoteGuesses(peerId, data.guesses);
    }
    else if (data.type === 'ACTION' && isHost) {
        if(window.gameApp.processAction) window.gameApp.processAction(data.action, peerId);
    }
    else if (data.type === 'PLAY_SOUND') {
        if(typeof playSound === 'function') playSound(data.sound);
    }
}

function handleDisconnect(peerId) {
    if (connections[peerId]) delete connections[peerId];
    if (!window.gameApp || !window.gameApp.state.players[peerId]) return;

    const lostPlayer = window.gameApp.state.players[peerId];
    if(typeof showToast === 'function') showToast(`${lostPlayer.name} ayrıldı.`, "warning");
    delete window.gameApp.state.players[peerId];

    if (isHost) {
        // Eğer ayrılan kişi ebe ise turu iptal et veya sonlandır
        if (window.gameApp.state.currentEbe === peerId && window.gameApp.state.status === 'playing') {
            window.gameApp.endRoundPrematurely("Ebe oyundan ayrıldığı için tur iptal edildi.");
        }
        broadcastSync();
    } else if (lostPlayer.isHost) {
        // HOST MIGRATION (Oda Devri)
        const activeIds = Object.keys(window.gameApp.state.players).sort();
        if (activeIds[0] === myId) {
            isHost = true;
            window.gameApp.state.players[myId].isHost = true;
            document.getElementById('host-settings').classList.remove('hidden');
            document.getElementById('client-waiting').classList.add('hidden');
            if(typeof showToast === 'function') showToast("Oda kurucusu sensin!", "success");
            broadcastSync();
        }
    }
    if(typeof updateUI === 'function') updateUI();
}

// Global network objesi, game.js içinden erişebilmek için
window.NetworkManager = {
    broadcast: broadcast,
    broadcastSync: broadcastSync,
    getMyId: () => myId,
    isHost: () => isHost
};
