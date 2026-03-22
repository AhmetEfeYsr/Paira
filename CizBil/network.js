// CizBil/network.js
import { initGameUI, syncCanvasEvent, clearCanvas, showToast, updateGameStateUI, startTimer, stopTimer, addChatMessage, isMatch } from './game.js';

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
    
    // Initialize audio context on first user interaction
    document.addEventListener('click', () => {
        if (window.PairaAudio) window.PairaAudio.init();
    }, { once: true });
});

function initLobby() {
    isHost = sessionStorage.getItem('isHost') === 'true';
    const playerName = sessionStorage.getItem('playerName');
    const targetRoomCode = sessionStorage.getItem('roomCode');

    if (!playerName) {
        window.location.href = 'index.html';
        return;
    }

    const storedMyId = sessionStorage.getItem('myId');

    if (isHost) {
        setupHost(playerName, storedMyId);
    } else {
        setupClient(playerName, targetRoomCode, storedMyId);
    }

    document.getElementById('btn-leave').addEventListener('click', () => {
        if(peer) {
            if (!isHost && networkState.hostId && hostConnection) {
                hostConnection.send({ type: 'LEAVE', id: myId });
            } else if (isHost) {
                Object.values(connections).forEach(c => c.send({ type: 'HOST_LEAVE' }));
            }
            peer.destroy();
        }
        sessionStorage.removeItem('myId');
        sessionStorage.removeItem('roomCode');
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

function setupHost(playerName, storedMyId) {
    const roomCode = storedMyId || generateRoomCode();
    myId = roomCode;

    peer = new Peer(roomCode, {
        debug: 2,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
        sessionStorage.setItem('myId', id);
        document.getElementById('display-room-code').dataset.code = id;
        document.getElementById('host-settings').style.display = 'flex';

        networkState.hostId = id;
        if (!networkState.players[id]) {
            networkState.players[id] = { id: id, name: playerName + " 👑", score: 0, isHost: true };
        } else {
            networkState.players[id].name = playerName + " 👑";
        }

        if (networkState.state === 'PLAYING') handlePlayingState();
        else updateLobbyUI();
    });

    peer.on('connection', (conn) => {
        if (conn.open) {
            setupHostConnectionHandlers(conn);
        } else {
            conn.on('open', () => setupHostConnectionHandlers(conn));
        }
    });

    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        if (err.type === 'unavailable-id') {
            setupHost(playerName, generateRoomCode());
        }
    });
}

function setupHostConnectionHandlers(conn) {
    connections[conn.peer] = conn;

    conn.on('data', (data) => {
        if (data.type === 'JOIN') {
            if (networkState.players[conn.peer]) {
                networkState.players[conn.peer].name = data.name; // Reconnect
            } else {
                networkState.players[conn.peer] = { id: conn.peer, name: data.name, score: 0, isHost: false };
            }
            broadcastState();
            updateLobbyUI();
        } else if (data.type === 'LEAVE') {
            handlePlayerLeave(data.id);
        } else {
            handleAction(data, conn.peer);
        }
    });

    conn.on('close', () => {
        delete connections[conn.peer];
        // Don't immediately delete player state to allow reconnect, but UI could reflect disconnect
        showToast(`${networkState.players[conn.peer]?.name || 'Oyuncu'} bağlantısı koptu.`, "warning");

        // Let's remove them after a short delay if they don't return (or keep them as ghosts if needed, but the prompt asks to remove ghosts from turns)
        // For CizBil, if they are the current drawer, we should skip turn.
        if (networkState.currentDrawer === conn.peer) {
            checkWinOrNextRound(); // Skip their turn
        }
        broadcastState();
    });
}

function handlePlayerLeave(id) {
    if (networkState.players[id]) {
        showToast(`${networkState.players[id].name} odadan ayrıldı.`, "info");
        delete networkState.players[id];
        if (networkState.currentDrawer === id && networkState.state === 'PLAYING') {
            checkWinOrNextRound(); // Skip turn
        }
        broadcastState();
        updateLobbyUI();
    }
}

function setupClient(playerName, roomCode, storedMyId) {
    peer = new Peer(storedMyId || null, {
        debug: 2,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
        myId = id;
        sessionStorage.setItem('myId', myId);
        document.getElementById('display-room-code').dataset.code = roomCode;
        document.getElementById('display-room-code').textContent = roomCode;
        document.getElementById('btn-toggle-code').style.display = 'none';

        hostConnection = peer.connect(roomCode, { reliable: true });

        const setupHostConn = () => {
            document.getElementById('client-waiting').style.display = 'flex';
            document.getElementById('client-waiting').classList.remove('hidden');
            hostConnection.send({ type: 'JOIN', name: playerName });
        };

        if (hostConnection.open) {
            setupHostConn();
        } else {
            hostConnection.on('open', setupHostConn);
        }

        hostConnection.on('data', (data) => {
            if (data.type === 'HOST_LEAVE') {
                showToast("Kurucu odadan ayrıldı, lobiye dönülüyor...", "warning");
                setTimeout(() => {
                    sessionStorage.removeItem('myId');
                    sessionStorage.removeItem('roomCode');
                    window.location.href = 'index.html';
                }, 2000);
            } else if (data.type === 'SYNC_STATE') {
                networkState = data.state;
                if (networkState.state === 'LOBBY') updateLobbyUI();
                else if (networkState.state === 'PLAYING') handlePlayingState(data.lastAction);
            } else if (data.type === 'DRAW_EVENT' || data.type === 'GUESS') {
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
    
    Object.values(connections).forEach(c => {
        const isCurrentDrawer = (c.peer === networkState.currentDrawer);
        
        // Create a safe copy of the state
        const safeState = JSON.parse(JSON.stringify(networkState));
        safeState.wordsLeft = []; // Save bandwidth and prevent peeking
        
        if (!isCurrentDrawer && safeState.state === 'PLAYING') {
            if (lastAction?.action === 'ROUND_END' || lastAction?.action === 'END_GAME') {
                safeState.currentWord = lastAction.revealWord || networkState.currentWord;
            } else if (safeState.currentWord) {
                // Sadece kelimenin harf sayısını gönder (Gizli tut)
                safeState.currentWord = safeState.currentWord.replace(/[^\s]/g, '_ ');
            }
        }
        
        let safeLastAction = lastAction;
        if (lastAction?.action === 'WORD_CHOICE' && !isCurrentDrawer) {
            safeLastAction = { ...lastAction, choices: null }; // Seçenekleri gizle
        }

        const payload = { type: 'SYNC_STATE', state: safeState, lastAction: safeLastAction };
        c.send(payload);
    });

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
        if (data.type === 'DRAW_EVENT' && senderId === networkState.currentDrawer) {
            Object.values(connections).forEach(c => {
                 if(c.peer !== senderId) c.send(data);
            });
            if (senderId !== myId) {
                handleDrawEvent(data); // Draw locally
            }
        }
        else if (data.type === 'CHOOSE_WORD') {
            if (senderId === networkState.currentDrawer && networkState.currentWord === "") {
                officialStartRound(data.word);
            }
        }
        else if (data.type === 'GUESS') {
            const senderName = networkState.players[senderId].name;
            const text = data.text;

            // Prevent guessing while word is being chosen
            if (!networkState.currentWord) return;

            if (networkState.guessedCorrectly && networkState.guessedCorrectly.includes(senderId)) return;

            if (isMatch(text, networkState.currentWord)) {
                if (!networkState.guessedCorrectly) networkState.guessedCorrectly = [];
                networkState.guessedCorrectly.push(senderId);

                const activeGuessersCount = Object.keys(networkState.players).filter(id => (connections[id]?.open || id === myId) && id !== networkState.currentDrawer).length;
                const guessOrder = networkState.guessedCorrectly.length; 
                const maxPoints = 15;
                const minPoints = 5;
                let points = Math.max(minPoints, maxPoints - ((guessOrder - 1) * 2));

                networkState.players[senderId].score += points;
                networkState.players[networkState.currentDrawer].score += Math.floor(points / 3); 

                const winMsg = { type: 'GUESS', name: senderName, text: text, isCorrect: true };
                Object.values(connections).forEach(c => c.send(winMsg));
                handleChatEvent(winMsg);

                if (networkState.guessedCorrectly.length >= activeGuessersCount) {
                    checkWinOrNextRound();
                } else if (networkState.guessedCorrectly.length === 1 && turnTimeout) {
                    clearTimeout(turnTimeout);
                    turnTimeout = setTimeout(() => {
                        showToast("Süre bitti!", "warning");
                        checkWinOrNextRound();
                    }, 10000);
                    
                    const fastTimerMsg = { type: 'SYNC_STATE', state: networkState, lastAction: { action: 'FAST_TIMER', duration: 10 } };
                    Object.values(connections).forEach(c => c.send(fastTimerMsg));
                    if (isHost) handlePlayingState(fastTimerMsg.lastAction);
                } else {
                    broadcastState();
                }
            } else {
                // Normal chat message
                const msg = { type: 'GUESS', name: senderName, text: text, isCorrect: false };
                Object.values(connections).forEach(c => c.send(msg));
                handleChatEvent(msg);
            }
        }
    } else {
        // Client receiving action
        if (data.type === 'DRAW_EVENT') handleDrawEvent(data);
        else if (data.type === 'GUESS') handleChatEvent(data);
    }
}

function handleDrawEvent(data) {
    if (data.type === 'DRAW_EVENT' && data.data) {
        syncCanvasEvent(data.data);
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

async function startGame() {
    if (!isHost || Object.keys(networkState.players).length < 2) return;

    networkState.targetScore = parseInt(document.getElementById('target-score').value) || 50;
    networkState.turnDuration = parseInt(document.getElementById('turn-duration').value) || 60;

    if (window.loadGarticWords) {
        await window.loadGarticWords();
    }

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

    // Ensure we only pick active players
    const activePlayers = Object.keys(networkState.players).filter(id => connections[id]?.open || id === myId);

    if (activePlayers.length === 0) {
        networkState.state = 'END';
        broadcastState({ action: 'END_GAME', winner: {name: 'Kimse'} });
        return;
    }

    // Pick next drawer (round robin)
    let dIndex = activePlayers.indexOf(networkState.currentDrawer);
    dIndex = (dIndex + 1) % activePlayers.length;
    networkState.currentDrawer = activePlayers[dIndex];

    networkState.guessedCorrectly = []; // Reset correctly guessed players for new round

    // Pick words
    if (networkState.wordsLeft.length < 2) {
        networkState.wordsLeft = window.cizbilWords ? [...window.cizbilWords].sort(() => Math.random() - 0.5) : ["YEDEK_KELİME", "YEDEK_2"];
    }

    // Instead of setting currentWord, we send two choices to everyone.
    // The currentDrawer will pick one.
    const word1 = networkState.wordsLeft.pop();
    const word2 = networkState.wordsLeft.pop();
    networkState.currentWord = ""; // Not chosen yet

    broadcastState({ action: 'WORD_CHOICE', choices: [word1, word2] });
}

export function officialStartRound(chosenWord) {
    if (!isHost) return;

    networkState.currentWord = chosenWord;
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
        broadcastState({ action: 'END_GAME', winner: winner, revealWord: networkState.currentWord });
    } else {
        // Short delay then start next round
        broadcastState({ action: 'ROUND_END', revealWord: networkState.currentWord });
        setTimeout(() => startRound(), 3000);
    }
}

function handlePlayingState(lastAction) {
    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('game-screen').classList.remove('hidden');

    initGameUI();

    if (lastAction?.action === 'WORD_CHOICE') {
        clearCanvas();
        updateGameStateUI(lastAction.choices);
    } else if (lastAction?.action === 'START_ROUND') {
        updateGameStateUI(); // Hide overlay, show actual word
        startTimer(networkState.turnDuration);
        document.getElementById('game-status-message').textContent = 'Tahmin et / Çiz!';
    } else if (lastAction?.action === 'SWITCH_TO_GAME') {
        clearCanvas();
        updateGameStateUI();
    } else if (lastAction?.action === 'FAST_TIMER') {
        startTimer(lastAction.duration);
        document.getElementById('game-status-message').textContent = 'Süre azaldı!';
    } else if (lastAction?.action === 'ROUND_END') {
        stopTimer();
        document.getElementById('game-status-message').textContent = 'Tur bitti! Kelime: ' + (lastAction.revealWord || networkState.currentWord);
    } else if (lastAction?.action === 'END_GAME') {
        stopTimer();
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('winner-screen').classList.add('active');
        document.getElementById('winner-screen').classList.remove('hidden');

        if (window.PairaAudio) window.PairaAudio.play('end');
        
        const finalScores = document.getElementById('final-scores');
        finalScores.innerHTML = '';
        const sorted = Object.values(networkState.players).sort((a,b) => b.score - a.score);
        sorted.forEach((p, index) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.padding = '10px';
            div.style.background = 'var(--item-bg)';
            div.style.borderRadius = '8px';
            div.innerHTML = `<span>${index + 1}. ${p.name}</span> <strong style="color:var(--neon-purple);">${p.score} Puan</strong>`;
            finalScores.appendChild(div);
        });

        document.getElementById('btn-back-to-lobby').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
}
