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
function setupUserRole() {
    // Ses başlangıcı (varsa)
    if (window.PairaAudio) window.PairaAudio.init();

    const storedName = sessionStorage.getItem('playerName');
    const storedIsHost = sessionStorage.getItem('isHost') === 'true';
    const storedRoomCode = sessionStorage.getItem('roomCode');
    const storedMyId = sessionStorage.getItem('myId');

    if (!storedName) {
        window.location.href = 'index.html'; // Fallback
        return;
    }

    // Easter Egg Kontrolü
    const lowerName = storedName.toLowerCase();
    if (lowerName === 'paira' || lowerName === 'pai' || lowerName === 'paiko') {
        if (window.showToast) window.showToast("canım ablam 💜", "info");
    }

    myName = storedName.substring(0, 25);
    isHost = storedIsHost;

    if (isHost) {
        document.getElementById('host-settings').classList.remove('hidden');
        document.getElementById('client-waiting').classList.add('hidden');
        initPeer(storedMyId || generateRoomCode()); // Kurucu için kısa kod üret veya eskisini kullan
    } else {
        if (!storedRoomCode) {
            window.location.href = 'index.html';
            return;
        }
        hostId = storedRoomCode;
        document.getElementById('host-settings').classList.add('hidden');
        document.getElementById('client-waiting').classList.remove('hidden');
        initPeer(storedMyId || null); // Katılımcı için rastgele PeerID veya eskisini kullan
    }
}

// Buton Dinleyicileri (DOM yüklendikten sonra eklenecek, veya elementler varsa)
document.addEventListener('DOMContentLoaded', () => {
    // Initialize user role from sessionStorage
    setupUserRole();

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
                    .then(() => { if(window.showToast) window.showToast("Oda kodu kopyalandı!", "success"); })
                    .catch(() => { if(window.showToast) window.showToast("Kopyalanamadı", "error"); });
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
        sessionStorage.setItem('myId', myId);
        if (isHost) {
            hostId = myId;
            // Host olarak kendimizi oyunculara ekle veya güncelle
            if(window.gameApp && window.gameApp.state) {
                if (window.gameApp.state.players[myId]) {
                    window.gameApp.state.players[myId].name = myName;
                    window.gameApp.state.players[myId].disconnected = false;
                } else {
                    window.gameApp.state.players[myId] = { id: myId, name: myName, role: 'masum', isHost: true, disconnected: false, score: 0 };
                }
            }
            const codeDisplay = document.getElementById('display-room-code');
            if(codeDisplay) {
                codeDisplay.dataset.code = myId;
                codeDisplay.innerText = typeof isCodeVisible !== 'undefined' && isCodeVisible ? myId : '••••••••';
            }

            if(window.gameApp && window.gameApp.state.status === 'playing') {
                if(typeof showScreen === 'function') showScreen('game-screen');
                if(window.gameApp.syncRoundData) window.gameApp.syncRoundData();
            } else if (window.gameApp && window.gameApp.state.status === 'finished') {
                if(typeof showScreen === 'function') showScreen('winner-screen');
            } else {
                if(typeof showScreen === 'function') showScreen('lobby-screen');
            }

            if(typeof updateUI === 'function') updateUI();
        } else {
            connectToPeer(hostId);
        }
    });

    peer.on('connection', setupConnection);

    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        if (err.type === 'peer-unavailable') {
            if(window.showToast) window.showToast("Oda bulunamadı veya kapandı. Lütfen ana sayfaya dönün.", "error");
            setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        } else if (err.type === 'unavailable-id' && isHost) {
            // Eğer kısa kod çakışırsa yeniden dene
            initPeer(generateRoomCode());
        } else if (err.type === 'network' || err.type === 'server-error') {
            if(window.showToast) window.showToast("Bağlantı hatası. Lütfen sayfayı yenileyin.", "error");
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
    if (!isHost || !window.gameApp) return;

    const stateCopy = { ...window.gameApp.state };
    // Optimizasyon: Büyük verileri ayıkla gerekirse

    broadcast({
        type: 'SYNC',
        state: stateCopy,
        hostId,
        serverTime: window.PairaTime.now()
    });
}

function handleData(data, peerId) {
    if (!data.type || !window.gameApp) return;
    const appState = window.gameApp.state;

    if (data.type === 'JOIN' && isHost) {
        if (appState.players[data.id]) {
            appState.players[data.id].name = data.name; // Reconnect
            appState.players[data.id].disconnected = false;
        } else {
            appState.players[data.id] = {
                id: data.id,
                name: data.name,
                role: 'masum', // Başlangıçta herkes masum, oyun başlayınca ebe seçilir
                isHost: false,
                disconnected: false,
                score: 0
            };
        }
        broadcastSync();
        if(typeof updateUI === 'function') updateUI();
    }
    else if (data.type === 'LEAVE' && isHost) {
        if (appState.players[data.id]) {
            if(window.showToast) window.showToast(`${appState.players[data.id].name} odadan ayrıldı.`, "info");
            delete appState.players[data.id];

            if (appState.currentEbe === data.id && appState.status === 'playing') {
                window.gameApp.endRoundPrematurely("Ebe oyundan ayrıldığı için tur iptal edildi.");
            } else if (appState.status === 'playing') {
                window.gameApp.checkAllSubmissions();
            }

            broadcastSync();
            if(typeof updateUI === 'function') updateUI();
        }
    }
    else if (data.type === 'HOST_LEAVE' && !isHost) {
        if(window.showToast) window.showToast("Kurucu odadan ayrıldı, lobiye dönülüyor...", "warning");
        setTimeout(() => {
            sessionStorage.removeItem('myId');
            sessionStorage.removeItem('roomCode');
            window.location.href = 'index.html';
        }, 2000);
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
        if(window.PairaAudio) window.PairaAudio.play(data.sound);
    }
}

function handleDisconnect(peerId) {
    if (connections[peerId]) delete connections[peerId];
    if (!window.gameApp || !window.gameApp.state.players[peerId]) return;

    const lostPlayer = window.gameApp.state.players[peerId];
    if(window.showToast) window.showToast(`${lostPlayer.name} bağlantısı koptu.`, "warning");

    // We don't immediately delete the player to allow for reconnect.

    if (!isHost && lostPlayer.isHost) {
        if(window.showToast) window.showToast("Kurucu ile bağlantı koptu. Lütfen odayı yeniden kurun veya bağlanın.", "error");
        setTimeout(() => {
            sessionStorage.removeItem('myId');
            sessionStorage.removeItem('roomCode');
            window.location.href = 'index.html';
        }, 3000);
    } else if (isHost) {
        lostPlayer.disconnected = true;
        
        if (window.gameApp.state.status === 'playing') {
            if (window.gameApp.state.currentEbe === peerId) {
                window.gameApp.endRoundPrematurely("Ebe'nin bağlantısı koptuğu için tur iptal edildi.");
            } else {
                window.gameApp.checkAllSubmissions();
            }
        }
        broadcastSync();
    }
    if(typeof updateUI === 'function') updateUI();
}

// Güvenli Çıkış Butonları için Event Listener ekleyelim
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-leave-lobby')?.addEventListener('click', leaveRoom);
});

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
    window.location.href = 'index.html';
}

// Global network objesi, game.js içinden erişebilmek için
window.NetworkManager = {
    broadcast: broadcast,
    broadcastSync: broadcastSync,
    getMyId: () => myId,
    isHost: () => isHost
};
