// ÇizimZinciri/network.js
import { initGameUI, updateGameStateUI, startTimer, stopTimer, renderAlbumState } from './game.js';

export let isHost = false;
export let myId = null;
export let networkManager = null;
export let networkState = {
    state: 'LOBBY', // LOBBY, WRITE, DRAW, ALBUM, WAIT
    players: {}, // { id: { name, score, id } }
    hostId: null,
    turnDuration: 60,
    roundCount: 1, // Current round
    maxRounds: 3, // Total rounds

    stories: {},
    assignments: {},
    completedTasks: {},
    
    // Album sequence array to ensure strictly synced linear presentation
    albumSequence: [],
    albumIndex: -1
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

    networkManager = new window.PeerNetworkManager({
        isHost: isHost,
        onPeerReady: (id) => {
            myId = id;
            if (isHost) {
                document.getElementById('display-room-code').dataset.code = id;
                document.getElementById('host-settings').style.display = 'flex';
                networkState.hostId = id;
                networkState.players[id] = { id: id, name: playerName };
                updateLobbyUI();
            } else {
                document.getElementById('display-room-code').dataset.code = targetRoomCode;
                document.getElementById('display-room-code').textContent = targetRoomCode;
                document.getElementById('btn-toggle-code').style.display = 'none';
                
                networkManager.connectToHost(targetRoomCode).then(() => {
                    document.getElementById('client-waiting').style.display = 'flex';
                    document.getElementById('client-waiting').classList.remove('hidden');
                    networkManager.sendToPeer(targetRoomCode, 'JOIN', { name: playerName });
                }).catch(() => {
                    if (window.showToast) window.showToast("Kurucuya bağlanılamadı.", "error");
                    else alert("Kurucuya bağlanılamadı.");
                });
            }
        },
        onDataReceived: (action, payload, senderId) => {
            handleNetworkData(action, payload, senderId);
        },
        onConnection: (peerId) => {
            // Handled via JOIN action
        },
        onDisconnection: (peerId) => {
            if (isHost) {
                if (networkState.players[peerId]) {
                    delete networkState.players[peerId];
                    
                    // Check if the remaining players have all completed their tasks
                    if (networkState.state === 'WRITE' || networkState.state === 'DRAW') {
                        const allCompleted = Object.keys(networkState.players).every(pid => {
                            if (pid === networkState.hostId) return networkState.completedTasks[pid];
                            return networkState.completedTasks[pid] || !networkManager.connections[pid];
                        });
                        if (allCompleted) {
                            clearTimeout(turnTimeout);
                            passBooksAndNextRound();
                        }
                    }
                    broadcastState();
                }
            } else {
                if (peerId === targetRoomCode) {
                    if (window.showToast) window.showToast("Kurucu ile bağlantı koptu.", "error");
                    else alert("Kurucu ile bağlantı koptu.");
                    setTimeout(() => window.location.href = 'index.html', 3000);
                }
            }
        }
    });

    if (isHost) {
        const code = generateRoomCode();
        networkManager.init(code);
    } else {
        networkManager.init();
    }

    document.getElementById('btn-leave').addEventListener('click', () => {
        networkManager.destroy();
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
        navigator.clipboard.writeText(code).then(() => {
            if(window.showToast) window.showToast("Kopyalandı!", "success");
        });
    });
}



function handleNetworkData(action, payload, senderId) {
    if (isHost) {
        if (action === 'JOIN') {
            networkState.players[senderId] = { id: senderId, name: payload.name };
            broadcastState();
        } else if (action === 'SUBMIT_TASK') {
            // Check round payload to avoid race conditions with late submissions
            if (payload.round !== networkState.roundCount) return;
            // Prevent race condition: Ignore late submissions if already processed
            if (networkState.completedTasks[senderId]) return;

            const ownerId = networkState.assignments[senderId];
            
            // Push entry to the specific storybook
            networkState.stories[ownerId].push({
                type: payload.taskType,
                authorId: senderId,
                content: payload.content
            });

            networkState.completedTasks[senderId] = true;

            // Check if all active players completed
            const allCompleted = Object.keys(networkState.players).every(pid => {
                if (pid === networkState.hostId) return networkState.completedTasks[pid];
                return networkState.completedTasks[pid] || !networkManager.connections[pid];
            });
            
            if (allCompleted) {
                clearTimeout(turnTimeout);
                passBooksAndNextRound();
            } else {
                broadcastState({ action: 'PLAYER_WAITING', playerId: senderId });
            }
        } else if (action === 'ALBUM_NEXT') {
            // Sadece host albümü ilerletir
            networkState.albumIndex++;
            networkManager.broadcast('ALBUM_INDEX_UPDATE', { albumIndex: networkState.albumIndex });
            handlePlayingState({ action: 'ALBUM_UPDATE' });
        }
    } else {
        if (action === 'SYNC_STATE') {
            networkState = payload.state;
            if (networkState.state === 'LOBBY') updateLobbyUI();
            else handlePlayingState(payload.lastAction);
        } else if (action === 'ALBUM_INDEX_UPDATE') {
            networkState.albumIndex = payload.albumIndex;
            handlePlayingState({ action: 'ALBUM_UPDATE' });
        }
    }
}

export function broadcastState(lastAction = null) {
    if (!isHost) return;

    if (networkState.state === 'LOBBY') {
        networkManager.broadcast('SYNC_STATE', { state: networkState, lastAction });
    } else if (networkState.state === 'ALBUM') {
        const stateToSend = { ...networkState, stories: {} };
        networkManager.broadcast('SYNC_STATE', { state: stateToSend, lastAction });
    } else {
        Object.keys(networkManager.connections).forEach(peerId => {
            if (peerId !== networkState.hostId) {
                const stateToSend = { ...networkState };
                stateToSend.stories = {};
                const assignedBook = networkState.assignments[peerId];
                if (assignedBook && networkState.stories[assignedBook]) {
                    const storyArr = networkState.stories[assignedBook];
                    if (storyArr.length > 0) {
                        stateToSend.stories[assignedBook] = [ storyArr[storyArr.length - 1] ];
                    } else {
                        stateToSend.stories[assignedBook] = [];
                    }
                }
                stateToSend.albumSequence = [];
                networkManager.sendToPeer(peerId, 'SYNC_STATE', { state: stateToSend, lastAction });
            }
        });
    }

    if (networkState.state === 'LOBBY') updateLobbyUI();
    else handlePlayingState(lastAction);
}

export function broadcastAction(actionData) {
    if (isHost) {
        handleNetworkData(actionData.type, actionData, myId);
    } else {
        const targetRoomCode = sessionStorage.getItem('roomCode');
        networkManager.sendToPeer(targetRoomCode, actionData.type, actionData);
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
    if (pCount < 3) {
        if(window.showToast) window.showToast("En az 3 kişi olmalı!", "warning");
        return;
    }

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
    }, (networkState.turnDuration + 2) * 1000);
}

function forceSubmitTasks() {
    // If time is up, submit whatever they have or a placeholder
    Object.keys(networkState.players).forEach(pid => {
        if (!networkState.completedTasks[pid]) {
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

    // Pass books mathematically
    const pKeys = Object.keys(networkState.players);
    const oldAssignments = { ...networkState.assignments };

    // Shift assignments
    for (let i = 0; i < pKeys.length; i++) {
        const nextIdx = (i + 1) % pKeys.length;
        networkState.assignments[pKeys[i]] = oldAssignments[pKeys[nextIdx]];
    }

    networkState.roundCount++;

    if (networkState.roundCount > networkState.maxRounds) {
        prepareAlbum();
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

function prepareAlbum() {
    networkState.albumSequence = [];
    const owners = Object.keys(networkState.stories);
    owners.forEach(ownerId => {
        networkState.albumSequence.push({ type: 'TITLE', ownerId });
        const story = networkState.stories[ownerId];
        story.forEach((step, idx) => {
            networkState.albumSequence.push({ type: 'ENTRY', ownerId, stepIdx: idx, stepData: step });
        });
    });
    networkState.albumSequence.push({ type: 'END' });
    networkState.albumIndex = 0;
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

    if (networkState.state === 'ALBUM') {
        if (lastAction?.action === 'SHOW_ALBUM' || lastAction?.action === 'ALBUM_UPDATE') {
            showAlbumScreen();
            renderAlbumState(networkState);
        }
        return;
    }

    // Active Play Phase UI
    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('game-screen').classList.remove('hidden');

    initGameUI(networkState, myId);
    updateGameStateUI(networkState, myId);

    // Update round indicator
    const roundEl = document.getElementById('round-indicator');
    if (roundEl) {
        roundEl.textContent = `Tur ${networkState.roundCount}/${networkState.maxRounds}`;
    }

    if (lastAction?.action === 'START_PHASE') {
        startTimer(networkState.turnDuration, networkState, myId);
    }
}

function showAlbumScreen() {
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('album-screen').classList.add('active');
    document.getElementById('album-screen').classList.remove('hidden');

    stopTimer();

    if (isHost) {
        document.getElementById('btn-next-story').style.display = 'inline-block';
        document.getElementById('btn-next-story').onclick = () => {
            broadcastAction({ type: 'ALBUM_NEXT' });
        };
        document.getElementById('btn-back-to-lobby').onclick = () => {
            window.location.href = 'index.html'; 
        };
    }
}