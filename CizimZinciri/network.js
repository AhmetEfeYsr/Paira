// ÇizimZinciri/network.js
import { initGameUI, updateGameStateUI, startTimer, stopTimer, renderAlbumState } from './game.js';

export let isHost = false;
export let myId = null;
export let networkManager = null;
export const networkState = {
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

    document.getElementById('btn-leave-lobby')?.addEventListener('click', async () => {
        const confirmed = await window.pairaConfirm({
            title: "Lobiden Ayrıl",
            message: "Lobiden ayrılmak istediğinize emin misiniz?",
            confirmText: "Ayrıl",
            cancelText: "Kal",
            confirmType: "danger"
        });
        if (confirmed) window.location.href = 'index.html';
    });

    document.getElementById('btn-leave-game')?.addEventListener('click', async () => {
        const confirmed = await window.pairaConfirm({
            title: "Oyundan Ayrıl",
            message: "Devam eden oyundan ayrılmak istediğinize emin misiniz?",
            confirmText: "Ayrıl",
            cancelText: "Oyuna Dön",
            confirmType: "danger"
        });
        if (confirmed) window.location.href = 'index.html';
    });

    document.getElementById('btn-leave')?.addEventListener('click', async () => {
        const confirmed = await window.pairaConfirm({
            title: "Oyundan Ayrıl",
            message: "Oyundan ayrılmak istediğinize emin misiniz?",
            confirmText: "Ayrıl",
            cancelText: "Kal",
            confirmType: "danger"
        });
        if (confirmed) window.location.href = 'index.html';
    });

    document.getElementById('btn-copy-room')?.addEventListener('click', () => {
        const code = document.getElementById('display-room-code')?.dataset.code;
        if (code) {
            window.copyToClipboard(code, "Oda kodu panoya kopyalandı!");
        }
    });

    const toggleCodeBtn = document.getElementById('btn-toggle-code');
    if (toggleCodeBtn) {
        toggleCodeBtn.addEventListener('click', () => {
            const display = document.getElementById('display-room-code');
            const eyeOpen = document.getElementById('icon-eye-open');
            const eyeClosed = document.getElementById('icon-eye-closed');
            const code = display ? display.dataset.code : '';
            
            if (display && display.textContent.includes('•')) {
                display.textContent = code;
                eyeOpen?.classList.remove('hidden');
                eyeClosed?.classList.add('hidden');
            } else if (display) {
                display.textContent = '••••••••';
                eyeOpen?.classList.add('hidden');
                eyeClosed?.classList.remove('hidden');
            }
            if (window.PairaAudio) window.PairaAudio.play('pop');
        });
    }

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
                if (networkManager.connections[pid]) {
                    networkManager.connections[pid].close();
                }
                delete networkState.players[pid];
                broadcastState();
            }
        },
        onRoomStart: () => {
            startGame();
        }
    });

    networkManager = new window.BaseGameNetwork({
        onStateSync: (statePayload) => {
            Object.assign(networkState, statePayload);
            if (networkState.state === 'LOBBY') updateLobbyUI();
            else handlePlayingState({ action: 'SYNC_STATE' });
        },
        onPlayerJoin: (senderId, payload) => {
            if (isHost) {
                if (payload.oldId && payload.oldId !== senderId && networkState.players[payload.oldId]) {
                    delete networkState.players[payload.oldId];
                    if (networkState.assignments && networkState.assignments[payload.oldId]) {
                        networkState.assignments[senderId] = networkState.assignments[payload.oldId];
                        delete networkState.assignments[payload.oldId];
                    }
                    if (networkState.completedTasks && networkState.completedTasks[payload.oldId] !== undefined) {
                        networkState.completedTasks[senderId] = networkState.completedTasks[payload.oldId];
                        delete networkState.completedTasks[payload.oldId];
                    }
                }
                networkState.players[senderId] = { id: senderId, name: payload.name, isHost: senderId === myId };
                broadcastState();
            }
        },
        onPlayerLeave: (senderId) => {
            if (isHost) {
                if (networkState.players[senderId]) {
                    delete networkState.players[senderId];
                    
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

    document.getElementById('btn-leave').addEventListener('click', () => {
        networkManager.leaveRoom();
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
                broadcastState({ action: 'PLAYER_WAITING', playerId: senderId });
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
        }
    }
}

export function broadcastState(lastAction = null) {
    if (!isHost) return;

    if (networkState.state === 'LOBBY' || networkState.state === 'ALBUM') {
        networkManager.broadcastState(networkState);
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

async function startGame() {
    if (!isHost) return;

    const pCount = Object.keys(networkState.players).length;
    if (pCount < 3) {
        if(window.showToast) window.showToast("En az 3 kişi olmalı!", "warning");
        return;
    }

    networkState.turnDuration = parseInt(document.getElementById('turn-duration').value) || 60;
    networkState.maxRounds = Math.min(parseInt(document.getElementById('round-count').value) || 3, pCount);
    networkState.roundCount = 1;

    const pKeys = Object.keys(networkState.players);
    networkState.stories = {};
    networkState.assignments = {};

    pKeys.forEach(pid => {
        networkState.stories[pid] = [];
        networkState.assignments[pid] = pid;
    });

    startPhase('WRITE');
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
                    content: isDrawingTurn ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' : '... (Zamanında yazamadı)'
                });
            }
            networkState.completedTasks[pid] = true;
        }
    });

    passBooksAndNextRound();
}

function passBooksAndNextRound() {
    if (!isHost) return;

    const pKeys = Object.keys(networkState.players).filter(pid => networkState.assignments[pid] !== undefined);
    if (pKeys.length === 0) return;

    const oldAssignments = { ...networkState.assignments };

    // Shift assignments securely
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
        networkState.albumSequence.push({ type: 'TITLE', ownerId });
        const story = networkState.stories[ownerId];
        if (story) {
            story.forEach((step, idx) => {
                networkState.albumSequence.push({ type: 'ENTRY', ownerId, stepIdx: idx, stepData: step });
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

    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('game-screen').classList.remove('hidden');

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
    networkState.state = 'LOBBY';
    networkState.currentRound = 0;
    networkState.stories = {};
    networkState.assignments = {};
    networkState.completedTasks = {};
    networkState.albumSequence = [];
    networkState.currentAlbumIndex = 0;
    broadcastState();
    if (typeof window.showScreen === 'function') window.showScreen('lobby-screen');
    updateLobbyUI();
}

export function showAlbumScreen() {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    document.getElementById('album-screen').classList.add('active');
    document.getElementById('album-screen').classList.remove('hidden');

    stopTimer();

    if (isHost) {
        document.getElementById('btn-next-story').style.display = 'inline-block';
        document.getElementById('btn-next-story').onclick = () => {
            broadcastAction({ type: 'ALBUM_NEXT' });
        };
        document.getElementById('btn-back-to-lobby').onclick = () => {
            returnToLobby();
        };
    }
}