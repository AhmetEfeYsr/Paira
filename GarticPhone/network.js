// GarticPhone/network.js
import { initGameUI, showToast, updateGameStateUI, startTimer, stopTimer, showAlbumStep } from './game.js';

let peer = null;
let connections = {}; // For Host
let hostConnection = null; // For Client

export let isHost = false;
export let myId = null;
export let networkState = {
    state: 'LOBBY', // LOBBY, WRITE, DRAW, ALBUM, WAIT
    players: {}, // { id: { name, score, id } }
    hostId: null,
    turnDuration: 60,
    roundCount: 3, // Current round
    maxRounds: 3, // Total rounds

    // Core Game Data Structure
    // Each player has a "storybook" that gets passed around.
    // stories: { [originalOwnerId]: [ { type: 'text', authorId, content }, { type: 'draw', authorId, content }, ... ] }
    stories: {},

    // Who holds whose book right now?
    // assignments: { [playerId]: ownerIdOfBookBeingHeld }
    assignments: {},

    // Have players finished their current task?
    // completedTasks: { [playerId]: boolean }
    completedTasks: {}
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
        networkState.players[id] = { id: id, name: playerName };
        updateLobbyUI();
    });

    peer.on('connection', (conn) => {
        connections[conn.peer] = conn;

        conn.on('data', (data) => {
            if (data.type === 'JOIN') {
                networkState.players[conn.peer] = { id: conn.peer, name: data.name };
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
                else handlePlayingState(data.lastAction);
            } else if (data.type === 'SUBMIT_TASK') {
                 handleAction(data, null);
            }
        });

        hostConnection.on('close', () => {
            showToast("Kurucu ile bağlantı koptu. Lütfen odayı yeniden kurun veya bağlanın.", "error");
            setTimeout(() => {
                sessionStorage.removeItem('myId');
                sessionStorage.removeItem('roomCode');
                window.location.href = 'index.html';
            }, 3000);
        });
    });
}

export function broadcastState(lastAction = null) {
    if (!isHost) return;
    const payload = { type: 'SYNC_STATE', state: networkState, lastAction };
    Object.values(connections).forEach(c => c.send(payload));

    if (networkState.state === 'LOBBY') updateLobbyUI();
    else handlePlayingState(lastAction);
}

export function broadcastAction(action) {
    if (isHost) {
        handleAction(action, myId);
    } else {
        hostConnection.send(action);
    }
}

function handleAction(data, senderId) {
    if (isHost) {
        if (data.type === 'SUBMIT_TASK') {
            // Prevent race condition: Ignore late submissions if already processed
            if (networkState.completedTasks[senderId]) return;

            const ownerId = networkState.assignments[senderId];
            const storyType = data.taskType; // 'text' or 'draw'

            // Push entry to the specific storybook
            networkState.stories[ownerId].push({
                type: storyType,
                authorId: senderId,
                content: data.content
            });

            networkState.completedTasks[senderId] = true;

            // Check if all active players completed
            const allCompleted = Object.keys(networkState.players).every(pid => {
                if (pid === networkState.hostId) return networkState.completedTasks[pid];
                return networkState.completedTasks[pid] || (!connections[pid]?.open);
            });
            if (allCompleted) {
                clearTimeout(turnTimeout);
                passBooksAndNextRound();
            } else {
                broadcastState({ action: 'PLAYER_WAITING', playerId: senderId });
            }
        } else if (data.type === 'ALBUM_NEXT') {
            // Sadece host albümü ilerletir
            broadcastState({ action: 'ALBUM_SHOW_NEXT' });
        }
    }
}

function updateLobbyUI() {
    const list = document.getElementById('players-list');
    if(!list) return;
    list.innerHTML = '';

    let count = 0;
    for (const id in networkState.players) {
        const p = networkState.players[id];
        const li = document.createElement('li');
        li.textContent = p.name + (id === networkState.hostId ? ' 👑' : '');
        list.appendChild(li);
        count++;
    }
    document.getElementById('player-count').textContent = count;

    if (isHost) {
        const btnStart = document.getElementById('btn-start-game');
        if (count >= 3) {
            btnStart.removeAttribute('disabled');
            btnStart.textContent = 'Oyunu Başlat';
        } else {
            btnStart.setAttribute('disabled', 'true');
            btnStart.textContent = 'Oyunu Başlat (Min 3 Kişi)';
        }
    }
}

// GAME LOGIC FLOW

let turnTimeout;

async function startGame() {
    if (!isHost) return;

    const pCount = Object.keys(networkState.players).length;
    if (pCount < 3) return showToast("En az 3 kişi olmalı!", "warning");

    if (window.loadGarticWords) {
        await window.loadGarticWords();
    }

    networkState.turnDuration = parseInt(document.getElementById('turn-duration').value) || 60;

    // Number of rounds is limited to number of players (everyone gets their own book back)
    networkState.maxRounds = Math.min(parseInt(document.getElementById('round-count').value) || 3, pCount);
    networkState.roundCount = 1; // Round 1 starts with writing

    // Initialize stories and assignments
    const pKeys = Object.keys(networkState.players);
    networkState.stories = {};
    networkState.assignments = {};

    pKeys.forEach(pid => {
        networkState.stories[pid] = [];
        networkState.assignments[pid] = pid; // Everyone starts with their own book
    });

    // Start Phase 1: Write
    startPhase('WRITE');
}

function startPhase(phase) {
    networkState.state = phase;

    // Reset completed states
    networkState.completedTasks = {};
    Object.keys(networkState.players).forEach(pid => networkState.completedTasks[pid] = false);

    broadcastState({ action: 'START_PHASE' });

    clearTimeout(turnTimeout);
    turnTimeout = setTimeout(() => {
        forceSubmitTasks();
    }, networkState.turnDuration * 1000);
}

function forceSubmitTasks() {
    // If time is up, submit whatever they have or a placeholder
    // Client should auto-submit if possible, but host forces state progress
    Object.keys(networkState.players).forEach(pid => {
        if (!networkState.completedTasks[pid]) {
            // Fake submit a blank/default to keep the chain moving
            const ownerId = networkState.assignments[pid];
            const isDrawingTurn = networkState.state === 'DRAW';
            networkState.stories[ownerId].push({
                type: isDrawingTurn ? 'draw' : 'text',
                authorId: pid,
                content: isDrawingTurn ? '' : '... (Zamanında yazamadı)'
            });
            networkState.completedTasks[pid] = true;
        }
    });

    passBooksAndNextRound();
}

function passBooksAndNextRound() {
    if (!isHost) return;

    // Pass books mathematically to the left/right
    const pKeys = Object.keys(networkState.players);
    const oldAssignments = { ...networkState.assignments };

    // Shift assignments (e.g. index i gets book of i+1)
    for (let i = 0; i < pKeys.length; i++) {
        const nextIdx = (i + 1) % pKeys.length;
        networkState.assignments[pKeys[i]] = oldAssignments[pKeys[nextIdx]];
    }

    networkState.roundCount++;

    if (networkState.roundCount > networkState.maxRounds) {
        // Game Over -> Show Album
        networkState.state = 'ALBUM';
        broadcastState({ action: 'SHOW_ALBUM' });
    } else {
        // Toggle Write / Draw
        if (networkState.state === 'WRITE') {
            startPhase('DRAW');
        } else {
            startPhase('WRITE');
        }
    }
}

function handlePlayingState(lastAction) {
    if (lastAction?.action === 'PLAYER_WAITING') {
        // Check if I am the one waiting
        if (networkState.completedTasks[myId]) {
            document.getElementById('prompt-container').style.display = 'none';
            document.getElementById('draw-container').style.display = 'none';
            document.getElementById('wait-container').style.display = 'flex';
        }
        return; // UI stays same for others
    }

    if (networkState.state === 'ALBUM' && lastAction?.action === 'SHOW_ALBUM') {
        showAlbumScreen();
        return;
    }

    if (networkState.state === 'ALBUM' && lastAction?.action === 'ALBUM_SHOW_NEXT') {
        // Host advances the slides
        if(typeof showAlbumStep === 'function') showAlbumStep();
        return;
    }

    // Active Play Phase UI
    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('game-screen').classList.remove('hidden');

    initGameUI();
    updateGameStateUI();

    if (lastAction?.action === 'START_PHASE') {
        startTimer(networkState.turnDuration);
    }
}

function showAlbumScreen() {
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('album-screen').classList.add('active');
    document.getElementById('album-screen').classList.remove('hidden');

    stopTimer();

    // Trigger the UI to start rendering albums
    if(typeof window.initAlbumUI === 'function') window.initAlbumUI();
}