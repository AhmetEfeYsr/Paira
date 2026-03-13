// network.js - WebRTC, PeerJS Bağlantıları ve Veri İletimi (Trivia)

let peer = null;
let myId = null;
let myName = null;
let isHost = false;
let hostId = null;
let connections = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

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

document.getElementById('btn-copy-room')?.addEventListener('click', () => {
    const codeToCopy = document.getElementById('display-room-code')?.dataset?.code;
    if (codeToCopy) {
        navigator.clipboard.writeText(codeToCopy)
            .then(() => showToast("Oda kodu kopyalandı!", "success"))
            .catch(() => showToast("Kopyalanamadı", "error"));
    }
});

function initPeer(customId = null) {
    peer = new Peer(customId, {
        config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] },
        debug: 1
    });

    peer.on('open', (id) => {
        myId = id;
        if (isHost) {
            hostId = myId;
            state.players[myId] = { id: myId, name: myName, score: 0, isHost: true };
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

function broadcast(data) {
    Object.values(connections).forEach(conn => {
        if (conn.open) conn.send(data);
    });
}

function broadcastSync() {
    if (!isHost) return;
    const stateCopy = { ...state };

    // Güvenlik: Aktif soru havuzunu komple gönderme
    delete stateCopy.activeQuestions;

    // O anki soruyu yolla (Host tarafında şifrelenip sadece cevaplar yollanabilir ama şimdilik clienta doğru cevap bilgisi gitmesin)
    if (state.status === 'playing' && state.currentQuestion) {
        stateCopy.currentQuestion = {
            category: state.currentQuestion.category,
            question_text: state.currentQuestion.question_text,
            shuffled_choices: state.currentQuestion.shuffled_choices
            // correct_answer_index'i client'a göndermiyoruz, host kontrol ediyor
        };
    } else {
        stateCopy.currentQuestion = null;
    }

    const durationLeft = Math.max(0, localTurnEndTime - window.PairaTime.now());

    broadcast({
        type: 'SYNC',
        state: stateCopy,
        hostId,
        durationLeft,
        serverTime: window.PairaTime.now()
    });
}

function handleData(data, peerId) {
    if (!data.type) return;

    if (data.type === 'JOIN' && isHost) {
        state.players[data.id] = { id: data.id, name: data.name, score: 0, isHost: false };
        broadcastSync();
        updateUI();
    }
    else if (data.type === 'SYNC') {
        state = data.state;
        hostId = data.hostId;

        if (data.durationLeft > 0) {
            localTurnEndTime = window.PairaTime.now() + data.durationLeft;
            if (!renderFrame) startRenderTimer();
        }

        if (state.status === 'playing') showScreen('game-screen');
        else if (state.status === 'finished') showScreen('winner-screen');
        else showScreen('lobby-screen');

        updateUI();
    }
    else if (data.type === 'ANSWER' && isHost) {
        handleClientAnswer(peerId, data.choiceIndex);
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
        broadcastSync();
        // Eğer oyundaysak ve koptuğu için herkes cevap vermiş duruma düştüyse turu bitir
        if (state.status === 'playing' && checkAllPlayersAnswered()) {
             endRoundEarly();
        }
    } else if (lostPlayer.isHost) {
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

// Client cevap gönderimi
function sendAnswer(choiceIndex) {
    if (isHost) {
        handleClientAnswer(myId, choiceIndex);
    } else {
        connections[hostId]?.send({ type: 'ANSWER', choiceIndex });
    }
}
