// CizBil/network.js
import { initGameUI, drawLocal, clearCanvas, showToast, updateGameStateUI, startTimer, stopTimer, addChatMessage, isMatch } from './game.js';

let peer = null;
let connections = {}; // For Host
let hostConnection = null; // For Client

export let isHost = false;
export let myId = null;
export let networkState = {
    state: 'LOBBY', // LOBBY, PLAYING, ROUND_END, END
    players: {}, // { id: { name, score, id } }
    hostId: null,
    currentDrawer: null,
    currentWord: '',
    targetScore: 50,
    turnDuration: 60,
    wordsLeft: []
};

document.addEventListener('DOMContentLoaded', () => {
    initLobby();
});

function initLobby() {
    isHost = sessionStorage.getItem('isHost') === 'true';
    const playerName = sessionStorage.getItem('playerName');
    const targetRoomCode = sessionStorage.getItem('roomCode');

    if (!playerName) {
        window.location.href = 'index.html';
        return;
    }

    if (isHost) {
        setupHost(playerName);
    } else {
        setupClient(playerName, targetRoomCode);
    }

    document.getElementById('btn-leave').addEventListener('click', () => {
        if(peer) peer.destroy();
        window.location.href = 'index.html';
    });

    document.getElementById('btn-start-game').addEventListener('click', startGame);

    document.getElementById('btn-toggle-code').addEventListener('click', (e) => {
        const span = document.getElementById('display-room-code');
        if (span.textContent === '••••••••') {
            span.textContent = span.dataset.code;
            e.target.textContent = '🙈';
        } else {
            span.textContent = '••••••••';
            e.target.textContent = '👁️';
        }
    });

    document.getElementById('btn-copy-room').addEventListener('click', () => {
        const code = document.getElementById('display-room-code').dataset.code;
        navigator.clipboard.writeText(code).then(() => showToast("Kopyalandı!", "success"));
    });
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const randomVals = new Uint8Array(6);
    window.crypto.getRandomValues(randomVals);
    for (let i = 0; i < 6; i++) {
        code += chars[randomVals[i] % chars.length];
    }
    return code;
}

function setupHost(playerName) {
    const roomCode = generateRoomCode();
    myId = roomCode;

    peer = new Peer(roomCode, {
        debug: 2,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
        document.getElementById('display-room-code').dataset.code = id;
        document.getElementById('host-settings').style.display = 'flex';

        networkState.hostId = id;
        networkState.players[id] = { id: id, name: playerName + " 👑", score: 0 };
        updateLobbyUI();
    });

    peer.on('connection', (conn) => {
        connections[conn.peer] = conn;

        conn.on('data', (data) => {
            if (data.type === 'JOIN') {
                networkState.players[conn.peer] = { id: conn.peer, name: data.name, score: 0 };
                broadcastState();
                updateLobbyUI();
            } else {
                handleAction(data, conn.peer);
            }
        });

        conn.on('close', () => {
            delete connections[conn.peer];
            if(networkState.players[conn.peer]) {
                delete networkState.players[conn.peer];
                broadcastState();
                updateLobbyUI();
            }
        });
    });
}

function setupClient(playerName, roomCode) {
    peer = new Peer({
        debug: 2,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
        myId = id;
        document.getElementById('display-room-code').dataset.code = roomCode;
        document.getElementById('display-room-code').textContent = roomCode;
        document.getElementById('btn-toggle-code').style.display = 'none';

        hostConnection = peer.connect(roomCode, { reliable: true });

        hostConnection.on('open', () => {
            document.getElementById('client-waiting').style.display = 'flex';
            document.getElementById('client-waiting').classList.remove('hidden');
            hostConnection.send({ type: 'JOIN', name: playerName });
        });

        hostConnection.on('data', (data) => {
            if (data.type === 'SYNC_STATE') {
                networkState = data.state;
                if (networkState.state === 'LOBBY') updateLobbyUI();
                else if (networkState.state === 'PLAYING') handlePlayingState(data.lastAction);
            } else if (data.type === 'DRAW_START' || data.type === 'DRAW_MOVE' || data.type === 'DRAW_END' || data.type === 'DRAW_CLEAR' || data.type === 'GUESS') {
                 handleAction(data, null);
            }
        });

        hostConnection.on('close', () => {
            showToast("Kurucu odadan ayrıldı.", "error");
            setTimeout(() => window.location.href = 'index.html', 2000);
        });
    });
}

export function broadcastState(lastAction = null) {
    if (!isHost) return;
    const payload = { type: 'SYNC_STATE', state: networkState, lastAction };
    Object.values(connections).forEach(c => c.send(payload));

    // Local host UI update
    if (networkState.state === 'LOBBY') updateLobbyUI();
    else if (networkState.state === 'PLAYING') handlePlayingState(lastAction);
}

export function broadcastAction(action) {
    if (isHost) {
        handleAction(action, myId); // Host directly processes its own action
    } else {
        hostConnection.send(action);
    }
}

function handleAction(data, senderId) {
    if (isHost) {
        // If it's a draw command from the current drawer, broadcast to everyone else
        if (data.type.startsWith('DRAW') && senderId === networkState.currentDrawer) {
            Object.values(connections).forEach(c => {
                 if(c.peer !== senderId) c.send(data);
            });
            handleDrawEvent(data); // Draw locally
        }
        else if (data.type === 'GUESS') {
            const senderName = networkState.players[senderId].name;
            const text = data.text;

            if (isMatch(text, networkState.currentWord)) {
                // Correct guess
                const points = 10; // Simple scoring
                networkState.players[senderId].score += points;

                // Optional: give drawer points too
                networkState.players[networkState.currentDrawer].score += Math.floor(points / 2);

                const winMsg = { type: 'GUESS', name: senderName, text: text, isCorrect: true };
                Object.values(connections).forEach(c => c.send(winMsg));
                handleChatEvent(winMsg);

                // Broadcast score update and maybe end round
                checkWinOrNextRound();
            } else {
                // Normal chat message
                const msg = { type: 'GUESS', name: senderName, text: text, isCorrect: false };
                Object.values(connections).forEach(c => c.send(msg));
                handleChatEvent(msg);
            }
        }
    } else {
        // Client receiving action
        if (data.type.startsWith('DRAW')) handleDrawEvent(data);
        else if (data.type === 'GUESS') handleChatEvent(data);
    }
}

function handleDrawEvent(data) {
    if (data.type === 'DRAW_START' || data.type === 'DRAW_MOVE') {
        const lx = data.lastPos ? data.lastPos.x : data.pos.x;
        const ly = data.lastPos ? data.lastPos.y : data.pos.y;
        drawLocal(lx, ly, data.pos.x, data.pos.y, data.color, data.size);
    } else if (data.type === 'DRAW_CLEAR') {
        clearCanvas();
    }
}

function handleChatEvent(data) {
    addChatMessage(data.name, data.text, data.isCorrect);
}

function updateLobbyUI() {
    const list = document.getElementById('players-list');
    if(!list) return;
    list.innerHTML = '';

    let count = 0;
    for (const id in networkState.players) {
        const p = networkState.players[id];
        const li = document.createElement('li');
        li.textContent = p.name;
        list.appendChild(li);
        count++;
    }
    document.getElementById('player-count').textContent = count;

    if (isHost) {
        const btnStart = document.getElementById('btn-start-game');
        if (count >= 2) {
            btnStart.removeAttribute('disabled');
        } else {
            btnStart.setAttribute('disabled', 'true');
        }
    }
}

function startGame() {
    if (!isHost || Object.keys(networkState.players).length < 2) return;

    networkState.targetScore = parseInt(document.getElementById('target-score').value) || 50;
    networkState.turnDuration = parseInt(document.getElementById('turn-duration').value) || 60;

    // Load words from shared global
    if (window.cizbilWords) {
        networkState.wordsLeft = [...window.cizbilWords];
        networkState.wordsLeft.sort(() => (window.crypto.getRandomValues(new Uint32Array(1))[0] % 100) - 50); // Seeded shuffle approach
    } else {
        networkState.wordsLeft = ["TEST1", "TEST2", "TEST3"]; // Fallback if script didn't load somehow
    }

    networkState.state = 'PLAYING';

    // Setup UI switch
    broadcastState({ action: 'SWITCH_TO_GAME' });

    // Start first round
    setTimeout(() => startRound(), 500); // Give clients half a second to switch UI before starting the timer and loop
}

let turnTimeout;

function startRound() {
    if (!isHost) return;

    // Pick next drawer (round robin)
    const pKeys = Object.keys(networkState.players);
    let dIndex = pKeys.indexOf(networkState.currentDrawer);
    dIndex = (dIndex + 1) % pKeys.length;
    networkState.currentDrawer = pKeys[dIndex];

    // Pick word
    if (networkState.wordsLeft.length === 0) {
        networkState.wordsLeft = window.cizbilWords ? [...window.cizbilWords] : ["YEDEK_KELİME"]; // Reset
    }
    networkState.currentWord = networkState.wordsLeft.pop();

    broadcastState({ action: 'START_ROUND' });

    clearTimeout(turnTimeout);
    turnTimeout = setTimeout(() => {
        // Time is up, nobody guessed or next round anyway
        showToast("Süre bitti!", "warning");
        checkWinOrNextRound();
    }, networkState.turnDuration * 1000);
}

function checkWinOrNextRound() {
    if (!isHost) return;
    clearTimeout(turnTimeout);

    // Check if anyone reached target score
    let winner = null;
    Object.values(networkState.players).forEach(p => {
        if(p.score >= networkState.targetScore) {
            winner = p;
        }
    });

    if (winner) {
        networkState.state = 'END';
        broadcastState({ action: 'END_GAME', winner: winner });
    } else {
        // Short delay then start next round
        broadcastState({ action: 'ROUND_END' });
        setTimeout(() => startRound(), 3000);
    }
}

function handlePlayingState(lastAction) {
    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('game-screen').classList.remove('hidden');

    initGameUI();

    if (lastAction?.action === 'SWITCH_TO_GAME' || lastAction?.action === 'START_ROUND') {
        clearCanvas();
        updateGameStateUI();
        startTimer(networkState.turnDuration);
        document.getElementById('game-status-message').textContent = 'Tahmin et / Çiz!';
    } else if (lastAction?.action === 'ROUND_END') {
        stopTimer();
        document.getElementById('game-status-message').textContent = 'Tur bitti! Kelime: ' + networkState.currentWord;
    } else if (lastAction?.action === 'END_GAME') {
        stopTimer();
        alert('Oyun bitti! Kazanan: ' + lastAction.winner.name);
        window.location.href = 'index.html';
    }
}