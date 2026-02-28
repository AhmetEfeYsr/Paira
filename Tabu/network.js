// network.js - WebRTC, PeerJS Bağlantıları ve Veri İletimi

let peer = null;
let myId = null;
let myName = null;
let isHost = false;
let hostId = null;
let connections = {};

// --- KISA ODA KODU ÜRETİCİ ---
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Karışıklık olmasın diye 0,O,1,I hariç
    let result = '';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}
// --- KULLANICI ROLÜ VE BAĞLANTIYI BAŞLATMA ---
// --- KULLANICI ROLÜ VE BAĞLANTIYI BAŞLATMA ---
function setupUserRole() {
    initAudio();
    const storedName = sessionStorage.getItem('playerName');
    const storedIsHost = sessionStorage.getItem('isHost') === 'true';
    const storedRoomCode = sessionStorage.getItem('roomCode');

    if (!storedName) {
        window.location.href = 'index.html';
        return;
    }
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
    setupUserRole();
});


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

document.getElementById('btn-copy-room').addEventListener('click', () => {
    const codeToCopy = document.getElementById('display-room-code')?.dataset?.code;
    if (codeToCopy) {
        navigator.clipboard.writeText(codeToCopy)
            .then(() => showToast("Oda kodu kopyalandı!", "success"))
            .catch(() => showToast("Kopyalanamadı", "error"));
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
            state.players[myId] = { id: myId, name: myName, team: 'A', isHost: true };
            const codeDisplay = document.getElementById('display-room-code');
            codeDisplay.dataset.code = myId;
            codeDisplay.innerText = isCodeVisible ? myId : '••••••••';
            showScreen('lobby-screen');
            updateUI();
        } else {
            connectToPeer(hostId);
        }
    });

    peer.on('connection', setupConnection);
    
    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        if (err.type === 'peer-unavailable') { 
            showToast("Oda bulunamadı veya kapandı. Lütfen ana sayfaya dönün.", "error");
            setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        } else if (err.type === 'unavailable-id' && isHost) {
            // Eğer kısa kod çakışırsa yeniden dene
            initPeer(generateRoomCode());
        } else if (err.type === 'network' || err.type === 'server-error') {
            showToast("Bağlantı hatası. Lütfen sayfayı yenileyin.", "error");
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
    if (!isHost) return;
    const stateCopy = { ...state };
    // Optimizasyon: Büyük kelime listesini yollama, sadece o anki kelimeyi yolla
    const currentWord = state.activeWords && state.activeWords[state.wordIndex];
    delete stateCopy.activeWords;
    stateCopy.currentWord = currentWord || null;

    const durationLeft = state.isPaused ? pauseOffset : Math.max(0, localTurnEndTime - Date.now());
    
    broadcast({ 
        type: 'SYNC', 
        state: stateCopy, 
        hostId, 
        durationLeft,
        serverTime: Date.now() 
    });
}

function handleData(data, peerId) {
    if (!data.type) return;

    if (data.type === 'JOIN' && isHost) {
        const countA = Object.values(state.players).filter(p => p.team === 'A').length;
        const countB = Object.values(state.players).filter(p => p.team === 'B').length;
        state.players[data.id] = { 
            id: data.id, 
            name: data.name, 
            team: countA <= countB ? 'A' : 'B', 
            isHost: false 
        };
        broadcastSync(); 
        updateUI();
    }
    else if (data.type === 'SYNC') {
        state = data.state;
        hostId = data.hostId;
        
        // Zaman senkronizasyonu
        if (data.durationLeft > 0) {
            localTurnEndTime = Date.now() + data.durationLeft;
            if (!renderFrame) startRenderTimer();
        }

        if (state.status === 'playing') showScreen('game-screen');
        else if (state.status === 'finished') showScreen('winner-screen');
        else showScreen('lobby-screen');
        
        updateUI();
    }
    else if (data.type === 'ACTION' && isHost) {
        if (state.turnId === peerId) processAction(data.action);
    }
    else if (data.type === 'CHAT') {
        displayChat(data.sender, data.msg);
        if (isHost) { // Kurucu mesajları diğerlerine dağıtır (Relay)
            Object.values(connections).forEach(conn => {
                if (conn.peer !== peerId) conn.send(data);
            });
        }
    }
    else if (data.type === 'PLAY_SOUND') {
        playSound(data.sound);
    }
}

function handleDisconnect(peerId) {
    if (connections[peerId]) delete connections[peerId];
    if (!state.players[peerId]) return;

    const lostPlayer = state.players[peerId];
    showToast(`${lostPlayer.name} ayrıldı.`, "warning");
    delete state.players[peerId];

    if (isHost) {
        // Eğer anlatan kişi çıktıysa turu sonlandır
        if (state.turnId === peerId) endTurn();
        broadcastSync();
    } else if (lostPlayer.isHost) {
        // HOST MIGRATION (Oda Devri)
        const activeIds = Object.keys(state.players).sort();
        if (activeIds[0] === myId) {
            isHost = true;
            state.players[myId].isHost = true;
            document.getElementById('host-settings').classList.remove('hidden');
            document.getElementById('client-waiting').classList.add('hidden');
            showToast("Oda kurucusu sensin!", "success");
            broadcastSync();
        }
    }
    updateUI();
}

// Oyun İçi Aksiyonlar
function sendAction(action) {
    if (state.turnId !== myId) return;
    if (isHost) processAction(action);
    else connections[hostId]?.send({ type: 'ACTION', action });
}

document.getElementById('btn-correct').addEventListener('click', () => sendAction('CORRECT'));
document.getElementById('btn-taboo').addEventListener('click', () => sendAction('TABOO'));
document.getElementById('btn-pass').addEventListener('click', () => sendAction('PASS'));

function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    displayChat("Sen", msg, true);
    broadcast({ type: 'CHAT', sender: myName, msg: msg });
    input.value = '';
}

document.getElementById('btn-send-chat').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChat(); });
