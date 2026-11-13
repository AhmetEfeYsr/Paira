// ÇizimZinciri/network.js
import { initGameUI, updateGameStateUI, startTimer, stopTimer, renderAlbumState, resetGameUIState } from './game.js';

export let isHost = false;
export let myId = null;
export let networkManager = null;
export const networkState = {
    state: 'LOBBY', // LOBBY, WRITE, DRAW, ALBUM, WAIT
    players: {}, // { id: { name, score, id } }
    playerNames: {}, // Preserved map of id -> name for album attribution
    playerOrder: [], // Deterministic active player order for book shifting
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

let cachedBlankWebP = null;
function getBlankWebPDataURL() {
    if (cachedBlankWebP) return cachedBlankWebP;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 450;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 800, 450);
        const url = canvas.toDataURL('image/webp', 0.5);
        if (url && url.startsWith('data:image/webp')) {
            cachedBlankWebP = url;
            return cachedBlankWebP;
        }
    } catch (e) {}
    return 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
}

let lobbyUI = null;
let turnTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize audio on first user interaction (AudioContext requires user gesture)
    const initAudioOnce = () => {
        if (window.PairaAudio) window.PairaAudio.init();
        document.removeEventListener('pointerdown', initAudioOnce);
        document.removeEventListener('keydown', initAudioOnce);
    };
    document.addEventListener('pointerdown', initAudioOnce, { once: true });
    document.addEventListener('keydown', initAudioOnce, { once: true });

    const doLeave = () => {
        if (networkManager) networkManager.leaveRoom();
        else window.location.href = 'index.html';
    };

    document.getElementById('btn-leave-lobby')?.addEventListener('click', async () => {
        const confirmed = await window.pairaConfirm({
            title: "Lobiden Ayrıl",
            message: "Lobiden ayrılmak istediğinize emin misiniz?",
            confirmText: "Ayrıl",
            cancelText: "Kal",
            confirmType: "danger"
        });
        if (confirmed) doLeave();
    });

    document.getElementById('btn-leave-game')?.addEventListener('click', async () => {
        const confirmed = await window.pairaConfirm({
            title: "Oyundan Ayrıl",
            message: "Devam eden oyundan ayrılmak istediğinize emin misiniz?",
            confirmText: "Ayrıl",
            cancelText: "Oyuna Dön",
            confirmType: "danger"
        });
        if (confirmed) doLeave();
    });

    document.getElementById('btn-leave')?.addEventListener('click', async () => {
        const confirmed = await window.pairaConfirm({
            title: "Oyundan Ayrıl",
            message: "Oyundan ayrılmak istediğinize emin misiniz?",
            confirmText: "Ayrıl",
            cancelText: "Kal",
            confirmType: "danger"
        });
        if (confirmed) doLeave();
    });

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

    lobbyUI = new window.SharedLobbyUI({
        roomCode: isHost ? '' : targetRoomCode,
        isHost: isHost,
        onKickPlayer: (pid) => {
            if (isHost && networkManager) {
                networkManager.sendToPeer(pid, 'KICKED');
                setTimeout(() => {
                    if (networkManager.connections[pid]) {
                        networkManager.connections[pid].close();
                    }
                    delete networkState.players[pid];
                    networkState.playerOrder = networkState.playerOrder.filter(id => id !== pid);
                    broadcastState();
                }, 300);
            }
        },
        onRoomStart: () => {
            startGame();
        }
    });

    networkManager = new window.BaseGameNetwork({
        onStateSync: (statePayload) => {
            Object.assign(networkState, statePayload);
            if (networkState.state === 'LOBBY') {
                stopTimer();
                resetGameUIState();
                if (typeof window.showScreen === 'function') window.showScreen('lobby-screen');
                updateLobbyUI();
            } else {
                handlePlayingState({ action: 'SYNC_STATE' });
            }
        },
        onPlayerJoin: (senderId, payload) => {
            if (isHost) {
                if (payload.isHost) {
                    myId = senderId;
                    networkState.hostId = senderId;
                }
                if (payload.oldId && payload.oldId !== senderId && networkState.players[payload.oldId]) {
                    delete networkState.players[payload.oldId];
                    const orderIdx = networkState.playerOrder.indexOf(payload.oldId);
                    if (orderIdx !== -1) {
                        networkState.playerOrder[orderIdx] = senderId;
                    }
                    if (networkState.assignments && networkState.assignments[payload.oldId]) {
                        networkState.assignments[senderId] = networkState.assignments[payload.oldId];
                        delete networkState.assignments[payload.oldId];
                    }
                    if (networkState.completedTasks && networkState.completedTasks[payload.oldId] !== undefined) {
                        networkState.completedTasks[senderId] = networkState.completedTasks[payload.oldId];
                        delete networkState.completedTasks[payload.oldId];
                    }
                }
                networkState.players[senderId] = { id: senderId, name: payload.name, isHost: Boolean(payload.isHost || senderId === myId) };
                networkState.playerNames[senderId] = payload.name;
                if (!networkState.playerOrder.includes(senderId)) {
                    networkState.playerOrder.push(senderId);
                }
                broadcastState();
            }
        },
        onPlayerLeave: (senderId) => {
            if (isHost) {
                if (networkState.players[senderId]) {
                    delete networkState.players[senderId];
                    delete networkState.assignments[senderId];
                    delete networkState.completedTasks[senderId];
                    networkState.playerOrder = networkState.playerOrder.filter(id => id !== senderId);
                    
                    // Handle mid-game disconnect
                    if (networkState.state === 'WRITE' || networkState.state === 'DRAW') {
                        const activeCount = Object.keys(networkState.players).length;
                        if (activeCount < 2) {
                            endGameCleanly();
                            return;
                        }
                        const allCompleted = Object.keys(networkState.players).every(pid => {
                            if (pid === networkState.hostId) return networkState.completedTasks[pid];
                            return networkState.completedTasks[pid] || !networkManager.connections[pid];
                        });
                        if (allCompleted) {
                            clearTimeout(turnTimeout);
                            passBooksAndNextRound();
                            return;
                        }
                    }
                    broadcastState();
                }
            }
        },
        onAction: (action, payload, senderId) => {
            handleNetworkData(action, payload, senderId);
        }
    });

    networkManager.autoInit().then(() => {
        myId = networkManager.myId;
        if (isHost) {
            networkState.hostId = myId;
            networkState.players[myId] = { id: myId, name: playerName, isHost: true };
            networkState.playerNames[myId] = playerName;
            if (!networkState.playerOrder.includes(myId)) {
                networkState.playerOrder.push(myId);
            }
            lobbyUI.setRoomCode(myId);
            document.getElementById('host-settings').style.display = 'flex';
            updateLobbyUI();
        } else {
            lobbyUI.setRoomCode(targetRoomCode);
            document.getElementById('client-waiting').style.display = 'flex';
            document.getElementById('client-waiting').classList.remove('hidden');
        }
    }).catch((err) => {
        console.error("Network init error:", err);
        if (window.showToast) window.showToast("Bağlantı kurulamadı.", "error");
    });

    window.addEventListener('beforeunload', () => {
        if (networkManager) networkManager.leaveRoom();
    });
}

function handleNetworkData(action, payload, senderId) {
    if (isHost) {
        if (action === 'SUBMIT_TASK') {
            if (payload.round !== networkState.roundCount) return;
            if (networkState.completedTasks[senderId]) return;

            const ownerId = networkState.assignments[senderId];
            if (!ownerId || !networkState.stories[ownerId]) return; // Guard against undefined owner
            
            networkState.stories[ownerId].push({
                type: payload.taskType,
                authorId: senderId,
                authorName: networkState.players[senderId]?.name || networkState.playerNames[senderId] || 'Oyuncu',
                content: payload.content
            });

            networkState.completedTasks[senderId] = true;

            const allCompleted = Object.keys(networkState.players).every(pid => {
                if (pid === networkState.hostId) return networkState.completedTasks[pid];
                return networkState.completedTasks[pid] || !networkManager.connections[pid];
            });
            
            if (allCompleted) {
                clearTimeout(turnTimeout);
                passBooksAndNextRound();
            } else {
                networkManager.broadcast('PLAYER_WAITING', { playerId: senderId });
                handlePlayingState({ action: 'PLAYER_WAITING', playerId: senderId });
            }
        } else if (action === 'ALBUM_NEXT') {
            if (networkState.albumSequence && networkState.albumSequence.length > 0) {
                networkState.albumIndex = Math.min(networkState.albumIndex + 1, networkState.albumSequence.length - 1);
            } else {
                networkState.albumIndex++;
            }
            networkManager.broadcast('ALBUM_INDEX_UPDATE', { albumIndex: networkState.albumIndex });
            handlePlayingState({ action: 'ALBUM_UPDATE' });
        }
    } else {
        if (action === 'ALBUM_INDEX_UPDATE') {
            if (networkState.albumSequence && networkState.albumSequence.length > 0) {
                networkState.albumIndex = Math.min(payload.albumIndex, networkState.albumSequence.length - 1);
            } else {
                networkState.albumIndex = payload.albumIndex;
            }
            handlePlayingState({ action: 'ALBUM_UPDATE' });
        } else if (action === 'PLAYER_WAITING') {
            networkState.completedTasks[payload.playerId] = true;
            handlePlayingState({ action: 'PLAYER_WAITING', playerId: payload.playerId });
        } else if (action === 'GAME_TOAST') {
            if (payload?.message && window.showToast) {
                window.showToast(payload.message, payload.type || 'info');
            }
        }
    }
}

export function broadcastState(lastAction = null) {
    if (!isHost) return;

    if (networkState.state === 'LOBBY') {
        networkManager.broadcastState(networkState);
    } else if (networkState.state === 'ALBUM') {
        const albumPayload = { ...networkState, stories: {} };
        networkManager.broadcastState(albumPayload);
    } else {
        Object.keys(networkState.players).forEach(peerId => {
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
                networkManager.sendToPeer(peerId, 'SYNC', stateToSend);
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
        networkManager.sendGameAction(actionData.type, actionData);
    }
}

function updateLobbyUI() {
    if (!lobbyUI) return;
    lobbyUI.renderPlayers(networkState.players, myId);

    if (isHost) {
        const btnStart = document.getElementById('btn-start-game');
        if (!btnStart) return;
        const count = Object.keys(networkState.players).length;
        if (count >= 3) {
            btnStart.removeAttribute('disabled');
            btnStart.textContent = 'Oyunu Başlat';
            btnStart.classList.remove('disabled');
        } else {
            btnStart.setAttribute('disabled', 'true');
            btnStart.textContent = 'Oyunu Başlat (Min 3 Kişi)';
            btnStart.classList.add('disabled');
        }
    }
}

function endGameCleanly() {
    if (!isHost) return;
    clearTimeout(turnTimeout);
    stopTimer();
    const msg = "Yeterli oyuncu kalmadığı için oyun sonlandırıldı.";
    if (window.showToast) window.showToast(msg, "warning");
    networkManager?.broadcast('GAME_TOAST', { message: msg, type: 'warning' });

    const hasEntries = Object.values(networkState.stories).some(story => Array.isArray(story) && story.length > 0);
    if (hasEntries) {
        prepareAlbum();
        networkState.state = 'ALBUM';
        broadcastState({ action: 'SHOW_ALBUM' });
    } else {
        returnToLobby();
    }
}

async function startGame() {
    if (!isHost) return;

    const pCount = Object.keys(networkState.players).length;
    if (pCount < 3) {
        if(window.showToast) window.showToast("En az 3 kişi olmalı!", "warning");
        return;
    }

    networkState.turnDuration = Math.max(15, parseInt(document.getElementById('turn-duration')?.value) || 60);
    const requestedRounds = Math.max(1, parseInt(document.getElementById('round-count')?.value) || 3);
    networkState.maxRounds = Math.min(requestedRounds, pCount);
    networkState.roundCount = 1;
    resetGameUIState();

    const pKeys = Object.keys(networkState.players);
    networkState.playerOrder = [...pKeys];
    networkState.stories = {};
    networkState.assignments = {};

    pKeys.forEach(pid => {
        networkState.playerNames[pid] = networkState.players[pid]?.name || networkState.playerNames[pid] || 'Oyuncu';
        networkState.stories[pid] = [];
        networkState.assignments[pid] = pid;
    });

    startPhase('WRITE');

    if (requestedRounds > pCount) {
        const msg = `Tur sayısı oyuncu sayısına göre ${networkState.maxRounds} olarak ayarlandı.`;
        if (window.showToast) window.showToast(msg, "info");
        networkManager?.broadcast('GAME_TOAST', { message: msg, type: 'info' });
    }
}

function startPhase(phase) {
    networkState.state = phase;
    networkState.completedTasks = {};
    Object.keys(networkState.players).forEach(pid => networkState.completedTasks[pid] = false);

    broadcastState({ action: 'START_PHASE' });

    clearTimeout(turnTimeout);
    turnTimeout = setTimeout(() => {
        forceSubmitTasks();
    }, (networkState.turnDuration + 6) * 1000);
}

function forceSubmitTasks() {
    if (!isHost) return;
    Object.keys(networkState.players).forEach(pid => {
        if (!networkState.completedTasks[pid]) {
            const ownerId = networkState.assignments[pid];
            const isDrawingTurn = networkState.state === 'DRAW';
            if (ownerId && networkState.stories[ownerId]) {
                networkState.stories[ownerId].push({
                    type: isDrawingTurn ? 'draw' : 'text',
                    authorId: pid,
                    authorName: networkState.players[pid]?.name || networkState.playerNames[pid] || 'Oyuncu',
                    content: isDrawingTurn ? getBlankWebPDataURL() : '... (Zamanında yazamadı)'
                });
            }
            networkState.completedTasks[pid] = true;
        }
    });

    passBooksAndNextRound();
}

function passBooksAndNextRound() {
    if (!isHost) return;

    const pKeys = (networkState.playerOrder && networkState.playerOrder.length > 0
        ? networkState.playerOrder
        : Object.keys(networkState.players)).filter(pid => networkState.players[pid] && networkState.assignments[pid] !== undefined);
    if (pKeys.length < 2) {
        endGameCleanly();
        return;
    }

    const oldAssignments = { ...networkState.assignments };

    // Shift assignments deterministically among active players
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
        const ownerName = networkState.playerNames[ownerId] || networkState.players[ownerId]?.name || 'Bilinmeyen';
        networkState.albumSequence.push({ type: 'TITLE', ownerId, ownerName });
        const story = networkState.stories[ownerId];
        if (story) {
            story.forEach((step, idx) => {
                const enrichedStep = {
                    ...step,
                    authorName: step.authorName || networkState.playerNames[step.authorId] || networkState.players[step.authorId]?.name || 'Bilinmeyen'
                };
                networkState.albumSequence.push({ type: 'ENTRY', ownerId, stepIdx: idx, stepData: enrichedStep });
            });
        }
    });
    networkState.albumSequence.push({ type: 'END' });
    networkState.albumIndex = 0;
}

function handlePlayingState(lastAction) {
    if (lastAction?.action === 'PLAYER_WAITING') {
        if (networkState.completedTasks[myId]) {
            document.getElementById('prompt-container').style.display = 'none';
            document.getElementById('draw-container').style.display = 'none';
            document.getElementById('wait-container').style.display = 'flex';
        }
        return;
    }

    if (networkState.state === 'ALBUM') {
        if (lastAction?.action === 'SHOW_ALBUM' || lastAction?.action === 'ALBUM_UPDATE' || lastAction?.action === 'SYNC_STATE') {
            showAlbumScreen();
            renderAlbumState(networkState);
        }
        return;
    }

    if (typeof window.showScreen === 'function') {
        window.showScreen('game-screen');
    } else {
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.add('active');
        document.getElementById('game-screen').classList.remove('hidden');
    }

    initGameUI(networkState, myId);
    updateGameStateUI(networkState, myId);

    const roundEl = document.getElementById('round-indicator');
    if (roundEl) {
        roundEl.textContent = `Tur ${networkState.roundCount}/${networkState.maxRounds}`;
    }

    if (lastAction?.action === 'START_PHASE' || lastAction?.action === 'SYNC_STATE') {
        startTimer(networkState.turnDuration, networkState, myId);
    }
}

export function returnToLobby() {
    if (!isHost) return;
    clearTimeout(turnTimeout);
    stopTimer();
    resetGameUIState();
    networkState.state = 'LOBBY';
    networkState.roundCount = 1;
    networkState.stories = {};
    networkState.assignments = {};
    networkState.completedTasks = {};
    networkState.albumSequence = [];
    networkState.albumIndex = -1;
    broadcastState();
    if (typeof window.showScreen === 'function') window.showScreen('lobby-screen');
    updateLobbyUI();
}

export function showAlbumScreen() {
    if (typeof window.showScreen === 'function') {
        window.showScreen('album-screen');
    } else {
        document.querySelectorAll('.view-state').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
        });
        document.getElementById('album-screen').classList.add('active');
        document.getElementById('album-screen').classList.remove('hidden');
    }

    stopTimer();

    if (isHost) {
        document.getElementById('btn-next-story').style.display = 'inline-block';
        document.getElementById('btn-back-to-lobby').style.display = 'none';
        document.getElementById('btn-next-story').onclick = () => {
            broadcastAction({ type: 'ALBUM_NEXT' });
        };
        document.getElementById('btn-back-to-lobby').onclick = () => {
            returnToLobby();
        };
    } else {
        document.getElementById('btn-next-story').style.display = 'none';
        document.getElementById('btn-back-to-lobby').style.display = 'none';
    }
}

window.networkState = networkState;
window.startGame = startGame;