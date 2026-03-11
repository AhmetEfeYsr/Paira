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
    const storedMyId = sessionStorage.getItem('myId');

    if (!storedName) {
        window.location.href = 'index.html';
        return;
    }
    myName = storedName.substring(0, 25);
    isHost = storedIsHost;

    if (isHost) {
        document.getElementById('host-settings').classList.remove('hidden');
        document.getElementById('client-waiting').classList.add('hidden');
        // If we already had an ID as host, try to re-use it, else generate new
        initPeer(storedMyId || generateRoomCode());
    } else {
        if (!storedRoomCode) {
            window.location.href = 'index.html';
            return;
        }
        hostId = storedRoomCode;
        document.getElementById('host-settings').classList.add('hidden');
        document.getElementById('client-waiting').classList.remove('hidden');
        initPeer(storedMyId || null);
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

        const iconOpen = document.getElementById('icon-eye-open');
        const iconClosed = document.getElementById('icon-eye-closed');

        if (isCodeVisible) {
            iconOpen?.classList.remove('hidden');
            iconClosed?.classList.add('hidden');
        } else {
            iconOpen?.classList.add('hidden');
            iconClosed?.classList.remove('hidden');
        }

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

// --- ODADAN GÜVENLİ ÇIKIŞ ---
function leaveRoom() {
    if (peer) {
        if (!isHost && hostId && connections[hostId]) {
            connections[hostId].send({ type: 'LEAVE', id: myId });
        } else if (isHost) {
            broadcast({ type: 'HOST_LEAVE' });
        }

        peer.destroy();
        peer = null;
    }

    sessionStorage.removeItem('myId');
    sessionStorage.removeItem('roomCode');
    // We can keep playerName so they don't have to re-type it

    window.location.href = 'index.html';
}

document.getElementById('btn-leave-lobby')?.addEventListener('click', leaveRoom);
document.getElementById('btn-leave-game')?.addEventListener('click', leaveRoom);

// --- OYUNCU ATMA (KICK) ---
function kickPlayer(id) {
    if (!isHost || id === myId) return;
    if (connections[id]) {
        connections[id].send({ type: 'KICKED' });
        setTimeout(() => {
            if (connections[id]) connections[id].close();
        }, 500);
    }
    if (state.players[id]) {
        showToast(`${state.players[id].name} odadan atıldı.`, "info");
        delete state.players[id];
        broadcastSync();
        updateUI();
    }
}


// --- PEERJS AĞ ALTYAPISI ---
function initPeer(customId = null) {
    peer = new Peer(customId, {
        config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] },
        debug: 1
    });

    peer.on('open', (id) => {
        myId = id;
        sessionStorage.setItem('myId', myId);
        if (isHost) {
            hostId = myId;
            if (!state.players[myId]) {
                state.players[myId] = { id: myId, name: myName, team: 'A', isHost: true };
            } else {
                state.players[myId].name = myName; // update name just in case
            }
            const codeDisplay = document.getElementById('display-room-code');
            codeDisplay.dataset.code = myId;
            codeDisplay.innerText = isCodeVisible ? myId : '••••••••';

            // Senkronizasyon durumu var mı kontrol edelim
            if (state.status === 'playing') showScreen('game-screen');
            else if (state.status === 'finished') showScreen('winner-screen');
            else showScreen('lobby-screen');

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
    const handleOpen = () => {
        connections[conn.peer] = conn;
        if (isHost) {
            broadcastSync();
        } else {
            conn.send({ type: 'JOIN', id: myId, name: myName });
        }
    };

    if (conn.open) {
        handleOpen();
    } else {
        conn.on('open', handleOpen);
    }

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
        if (state.players[data.id]) {
            // Reconnect situation
            state.players[data.id].name = data.name;
        } else {
            const countA = Object.values(state.players).filter(p => p.team === 'A').length;
            const countB = Object.values(state.players).filter(p => p.team === 'B').length;
            state.players[data.id] = {
                id: data.id,
                name: data.name,
                team: countA <= countB ? 'A' : 'B',
                isHost: false
            };
        }
        broadcastSync();
        updateUI();
    }
    else if (data.type === 'SWITCH_TEAM' && isHost) {
        if (state.players[peerId]) {
            state.players[peerId].team = state.players[peerId].team === 'A' ? 'B' : 'A';
            broadcastSync();
            updateUI();
        }
    }
    else if (data.type === 'LEAVE' && isHost) {
        const leavingPlayer = state.players[data.id];
        if (leavingPlayer) {
            showToast(`${leavingPlayer.name} odadan ayrıldı.`, "info");
            delete state.players[data.id];

            // Sıradaki kişi çıkarsa
            if (state.turnId === data.id && state.status === 'playing') {
                endTurn();
            }
            broadcastSync();
            updateUI();
        }
    }
    else if (data.type === 'HOST_LEAVE' && !isHost) {
        showToast("Kurucu odadan ayrıldı, lobiye dönülüyor...", "warning");
        setTimeout(() => leaveRoom(), 2000);
    }
    else if (data.type === 'KICKED' && !isHost) {
        showToast("Odadan atıldınız.", "error");
        setTimeout(() => leaveRoom(), 2000);
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
        if (state.turnId === peerId || data.action === 'TOGGLE_PAUSE' || data.action === 'NARRATOR_READY') processAction(data.action);
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

    // Geçici kopmaları yönetmek için hemen silmiyoruz, ama uyaralım
    showToast(`${lostPlayer.name} bağlantısı koptu.`, "warning");
    // İleride silmek için bir timeout eklenebilir ama şu anki istek reconnect desteği

    if (isHost) {
        // Eğer anlatan kişi koptuysa bekleyebilir veya oyunu duraklatabiliriz, şimdilik basit tutalım.
        // Eğer oyuncu gerçekten atılmışsa veya çıkmışsa state.players'dan silinir (ileride eklenecek KICK ve LEAVE ile)
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
    if (state.turnId !== myId && action !== 'TOGGLE_PAUSE' && action !== 'NARRATOR_READY') return;
    if (isHost) processAction(action);
    else connections[hostId]?.send({ type: 'ACTION', action });
}

document.getElementById('btn-correct').addEventListener('click', () => sendAction('CORRECT'));
document.getElementById('btn-taboo').addEventListener('click', () => sendAction('TABOO'));
document.getElementById('btn-pass').addEventListener('click', () => sendAction('PASS'));

document.getElementById('btn-switch-team').addEventListener('click', () => {
    if (isHost) {
        if (state.players[myId]) {
            state.players[myId].team = state.players[myId].team === 'A' ? 'B' : 'A';
            broadcastSync();
            updateUI();
        }
    } else {
        connections[hostId]?.send({ type: 'SWITCH_TEAM' });
    }
});

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
