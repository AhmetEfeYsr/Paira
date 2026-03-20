/**
 * Vampir Köylü (Feign style) Game Logic
 */

let isHost = false;
let roomCode = '';
let username = '';
let myId = '';
let network = null;

let gameState = {
    status: 'LOBBY', // LOBBY, NIGHT, DAY, VOTING, END
    dayCount: 0,
    players: {},
    settings: {
        vampireCount: 1,
        doctor: true,
        seer: true,
        discussionTime: 90
    },
    nightActions: {}, // { killerId: targetId, doctorId: targetId, seerId: targetId }
    votes: {}, // { voterId: targetId }
    logs: [] // string array
};

let timerInterval = null;
let currentTimer = 0;

// UI Elements
const els = {
    screens: {
        lobby: document.getElementById('lobby-screen'),
        game: document.getElementById('game-screen'),
        score: document.getElementById('score-screen')
    },
    lobby: {
        codeDisplay: document.getElementById('display-room-code'),
        btnToggleCode: document.getElementById('btn-toggle-code'),
        btnCopy: document.getElementById('btn-copy-room'),
        playerCount: document.getElementById('player-count'),
        playersList: document.getElementById('players-list'),
        hostSettings: document.getElementById('host-settings'),
        clientWaiting: document.getElementById('client-waiting'),
        hostNameDisplay: document.getElementById('host-name-display'),
        btnStart: document.getElementById('btn-start-game'),
        startError: document.getElementById('start-error-text'),
        
        // Settings
        vampires: document.getElementById('setting-vampires'),
        doctor: document.getElementById('setting-doctor'),
        seer: document.getElementById('setting-seer'),
        discussionTime: document.getElementById('setting-discussion-time')
    },
    game: {
        phase: document.getElementById('current-phase'),
        day: document.getElementById('current-day'),
        myRole: document.getElementById('my-role'),
        timer: document.getElementById('timer-display'),
        actionTitle: document.getElementById('action-title'),
        actionPlayers: document.getElementById('action-players-container'),
        btnSkip: document.getElementById('btn-skip-action'),
        logs: document.getElementById('game-logs')
    },
    score: {
        title: document.getElementById('end-game-title'),
        winner: document.getElementById('winner-text'),
        body: document.getElementById('endgame-body'),
        btnPlayAgain: document.getElementById('btn-play-again')
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    isHost = sessionStorage.getItem('isHost') === 'true';
    roomCode = sessionStorage.getItem('roomCode');
    username = sessionStorage.getItem('username');

    if (!roomCode || !username) {
        window.location.href = 'index.html';
        return;
    }

    if (window.PairaAudio) window.PairaAudio.init();

    setupUI();
    initNetwork();
});

function setupUI() {
    els.lobby.codeDisplay.dataset.code = roomCode;
    
    els.lobby.btnToggleCode.addEventListener('click', () => {
        const isHidden = els.lobby.codeDisplay.textContent === '••••••••';
        els.lobby.codeDisplay.textContent = isHidden ? roomCode : '••••••••';
        document.getElementById('icon-eye-open').classList.toggle('hidden', isHidden);
        document.getElementById('icon-eye-closed').classList.toggle('hidden', !isHidden);
    });

    els.lobby.btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(roomCode);
        showToast("Oda kodu kopyalandı", "success");
    });

    if (isHost) {
        els.lobby.hostSettings.classList.remove('hidden');
        els.lobby.btnStart.addEventListener('click', handleStartGame);
        els.score.btnPlayAgain.classList.remove('hidden');
        els.score.btnPlayAgain.addEventListener('click', handlePlayAgain);
    } else {
        els.lobby.clientWaiting.classList.remove('hidden');
    }
    
    els.game.btnSkip.addEventListener('click', () => {
        submitAction('skip');
    });
}

function initNetwork() {
    network = new NetworkManager(
        onStateUpdate,
        onPlayerJoin,
        onPlayerLeave,
        onError
    );
    network.init(isHost, roomCode, username);
    myId = network.myId;
}

// Network Callbacks
function onPlayerJoin(player) {
    if (isHost) {
        // If host, store in our local auth state
        gameState.players[player.id] = player;
    }
    updateLobbyPlayersList(network.players);
}

function onPlayerLeave(player) {
    if (isHost) {
        if (gameState.players[player.id]) {
            gameState.players[player.id].isAlive = false;
        }
    }
    updateLobbyPlayersList(network.players);
    if(gameState.status !== 'LOBBY' && gameState.status !== 'END') {
        addLog(`${player.name} oyundan ayrıldı.`);
        // In a full game, check if this triggers end game
    }
}

function onError(err) {
    showToast("Bağlantı hatası: " + err, "error");
    if (err === 'host_disconnected') {
        setTimeout(() => window.location.href = 'index.html', 2000);
    }
}

function onStateUpdate(senderId, data) {
    if (data.type === 'GAME_STATE') {
        gameState = data.state;
        updateUIForState();
    } else if (data.type === 'ACTION' && isHost) {
        handlePlayerAction(senderId, data.action, data.target);
    }
}

// UI Updaters
function updateLobbyPlayersList(playersObj) {
    els.lobby.playersList.innerHTML = '';
    const players = Object.values(playersObj);
    els.lobby.playerCount.textContent = players.length;

    players.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${p.name}</span>
            ${p.isHost ? '<span style="font-size: 0.8rem; background: var(--lilac); color: var(--bg-deep); padding: 2px 8px; border-radius: 10px; font-weight: bold;">Kurucu</span>' : ''}
        `;
        els.lobby.playersList.appendChild(li);
        
        if (p.isHost) els.lobby.hostNameDisplay.textContent = p.name;
    });
}

function switchScreen(screenId) {
    Object.values(els.screens).forEach(s => s.classList.remove('active'));
    Object.values(els.screens).forEach(s => s.classList.add('hidden'));
    
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
}

function updateUIForState() {
    if (gameState.status === 'LOBBY') {
        switchScreen('lobby-screen');
    } else if (gameState.status === 'END') {
        switchScreen('score-screen');
        renderEndGame();
    } else {
        switchScreen('game-screen');
        renderGameScreen();
    }
}

// Game Logic
function handleStartGame() {
    if (!isHost) return;
    
    const pCount = Object.keys(gameState.players).length;
    const vCount = parseInt(els.lobby.vampires.value);
    
    if (pCount < 3) {
        showToast("En az 3 oyuncu gerekli!", "error");
        return;
    }
    
    if (vCount >= pCount) {
        showToast("Vampir sayısı oyuncu sayısından az olmalı!", "error");
        return;
    }

    gameState.settings = {
        vampireCount: vCount,
        doctor: els.lobby.doctor.value === "1",
        seer: els.lobby.seer.value === "1",
        discussionTime: parseInt(els.lobby.discussionTime.value)
    };

    assignRoles();
    
    gameState.status = 'NIGHT';
    gameState.dayCount = 1;
    gameState.logs = ['Oyun başladı! Roller dağıtıldı.'];
    gameState.nightActions = {};
    gameState.votes = {};

    broadcastState();
}

function assignRoles() {
    const pIds = Object.keys(gameState.players);
    // Shuffle
    for (let i = pIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pIds[i], pIds[j]] = [pIds[j], pIds[i]];
    }
    
    let index = 0;
    
    // Assign Vampires
    for (let i = 0; i < gameState.settings.vampireCount; i++) {
        gameState.players[pIds[index++]].role = 'Vampir';
    }
    
    // Assign Doctor
    if (gameState.settings.doctor && index < pIds.length) {
        gameState.players[pIds[index++]].role = 'Doktor';
    }
    
    // Assign Seer
    if (gameState.settings.seer && index < pIds.length) {
        gameState.players[pIds[index++]].role = 'Büyücü';
    }
    
    // Assign Villagers
    while (index < pIds.length) {
        gameState.players[pIds[index++]].role = 'Köylü';
    }
}

function broadcastState() {
    if (isHost) {
        network.broadcast({ type: 'GAME_STATE', state: gameState });
        updateUIForState(); // Update local UI
    }
}

function renderGameScreen() {
    els.game.phase.textContent = gameState.status === 'NIGHT' ? 'Gece' : (gameState.status === 'DAY' ? 'Gündüz' : 'Oylama');
    els.game.day.textContent = gameState.dayCount;
    
    const myPlayer = gameState.players[myId];
    els.game.myRole.textContent = myPlayer ? myPlayer.role : 'Seyirci';
    
    renderLogs();
    
    if (!myPlayer || !myPlayer.isAlive) {
        els.game.actionTitle.textContent = 'Ölüsün (İzleyici)';
        els.game.actionPlayers.innerHTML = '';
        els.game.btnSkip.classList.add('hidden');
        return;
    }
    
    els.game.btnSkip.classList.add('hidden');
    els.game.actionPlayers.innerHTML = '';

    if (gameState.status === 'NIGHT') {
        if (myPlayer.role === 'Vampir') {
            els.game.actionTitle.textContent = 'Kimi avlayacaksın?';
            renderActionList(true); // Exclude other vampires? Simple version: just exclude self
        } else if (myPlayer.role === 'Doktor') {
            els.game.actionTitle.textContent = 'Kimi koruyacaksın?';
            renderActionList(false); // Can protect self
        } else if (myPlayer.role === 'Büyücü') {
            els.game.actionTitle.textContent = 'Kimin rolünü göreceksin?';
            renderActionList(true); // Exclude self
        } else {
            els.game.actionTitle.textContent = 'Uyumaya devam et...';
        }
    } else if (gameState.status === 'DAY') {
        els.game.actionTitle.textContent = 'Tartışma zamanı!';
    } else if (gameState.status === 'VOTING') {
        els.game.actionTitle.textContent = 'Kimi oylayacaksın?';
        els.game.btnSkip.classList.remove('hidden');
        renderActionList(false, true); // Allow skipping, show skip button handled above
    }
}

function renderActionList(excludeSelf, isVoting = false) {
    const pIds = Object.keys(gameState.players);
    pIds.forEach(id => {
        const p = gameState.players[id];
        if (excludeSelf && id === myId) return;
        
        const card = document.createElement('div');
        card.className = `player-action-card ${!p.isAlive ? 'dead' : ''}`;
        card.innerHTML = `<strong>${p.name}</strong>`;
        
        if (p.isAlive) {
            card.addEventListener('click', () => {
                document.querySelectorAll('.player-action-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                submitAction(id);
            });
        }
        
        els.game.actionPlayers.appendChild(card);
    });
}

function renderLogs() {
    els.game.logs.innerHTML = '';
    gameState.logs.forEach(l => {
        const d = document.createElement('div');
        d.textContent = '> ' + l;
        els.game.logs.appendChild(d);
    });
    els.game.logs.scrollTop = els.game.logs.scrollHeight;
}

function submitAction(targetId) {
    network.sendToHost({
        type: 'ACTION',
        action: gameState.status,
        target: targetId
    });
    els.game.actionTitle.textContent = 'Seçim yapıldı, bekleniyor...';
}

function addLog(msg) {
    gameState.logs.push(msg);
}

// Host handles incoming actions
function handlePlayerAction(senderId, actionType, targetId) {
    if (actionType === 'NIGHT') {
        gameState.nightActions[senderId] = targetId;
        checkNightEnd();
    } else if (actionType === 'VOTING') {
        gameState.votes[senderId] = targetId;
        checkVotingEnd();
    }
}

function checkNightEnd() {
    // Count alive actors
    let requiredActions = 0;
    Object.values(gameState.players).forEach(p => {
        if (p.isAlive && (p.role === 'Vampir' || p.role === 'Doktor' || p.role === 'Büyücü')) {
            requiredActions++;
        }
    });
    
    if (Object.keys(gameState.nightActions).length >= requiredActions) {
        resolveNight();
    }
}

function resolveNight() {
    let killedId = null;
    let protectedId = null;
    
    // Simple logic: first vamp target is killed. First doc target is protected.
    Object.entries(gameState.nightActions).forEach(([actorId, targetId]) => {
        const actor = gameState.players[actorId];
        if (!actor || !actor.isAlive) return;
        
        if (actor.role === 'Vampir') killedId = targetId;
        if (actor.role === 'Doktor') protectedId = targetId;
        // Seer gets PM in a real game, skipped for simplicity here, just log
    });
    
    addLog(`--- GÜN ${gameState.dayCount} ---`);
    if (killedId && killedId !== protectedId) {
        gameState.players[killedId].isAlive = false;
        addLog(`${gameState.players[killedId].name} gece öldürüldü!`);
    } else {
        addLog('Gece kimse ölmedi.');
    }
    
    if (checkWin()) return;
    
    gameState.status = 'DAY';
    broadcastState();
    
    // Start discussion timer
    startTimer(gameState.settings.discussionTime, () => {
        gameState.status = 'VOTING';
        gameState.votes = {};
        addLog('Tartışma bitti. Oylama başladı.');
        broadcastState();
    });
}

function checkVotingEnd() {
    let aliveCount = Object.values(gameState.players).filter(p => p.isAlive).length;
    if (Object.keys(gameState.votes).length >= aliveCount) {
        resolveVoting();
    }
}

function resolveVoting() {
    let tallies = {};
    Object.values(gameState.votes).forEach(t => {
        if (t !== 'skip') tallies[t] = (tallies[t] || 0) + 1;
    });
    
    let max = 0;
    let eliminatedId = null;
    let tie = false;
    
    Object.entries(tallies).forEach(([id, count]) => {
        if (count > max) {
            max = count;
            eliminatedId = id;
            tie = false;
        } else if (count === max) {
            tie = true;
        }
    });
    
    if (eliminatedId && !tie) {
        gameState.players[eliminatedId].isAlive = false;
        addLog(`${gameState.players[eliminatedId].name} köyden sürüldü. Rolü: ${gameState.players[eliminatedId].role}`);
    } else {
        addLog('Oylama berabere bitti veya pas geçildi. Kimse asılmadı.');
    }
    
    if (checkWin()) return;
    
    gameState.status = 'NIGHT';
    gameState.dayCount++;
    gameState.nightActions = {};
    addLog('Gece çöküyor...');
    broadcastState();
}

function checkWin() {
    let vamps = 0, others = 0;
    Object.values(gameState.players).forEach(p => {
        if (p.isAlive) {
            if (p.role === 'Vampir') vamps++;
            else others++;
        }
    });
    
    if (vamps === 0) {
        endGame('Köylüler Kazandı!');
        return true;
    } else if (vamps >= others) {
        endGame('Vampirler Kazandı!');
        return true;
    }
    return false;
}

function endGame(winnerMsg) {
    gameState.status = 'END';
    gameState.logs.push(winnerMsg);
    // Add winner prop to state
    gameState.winnerMsg = winnerMsg;
    broadcastState();
}

function renderEndGame() {
    els.score.title.textContent = 'Oyun Bitti';
    els.score.winner.textContent = gameState.winnerMsg;
    
    els.score.body.innerHTML = '';
    Object.values(gameState.players).forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.name}</td>
            <td style="color: var(--neon-purple); font-weight: bold;">${p.role || '?'}</td>
            <td>${p.isAlive ? 'Yaşıyor' : 'Öldü'}</td>
        `;
        els.score.body.appendChild(tr);
    });
}

function handlePlayAgain() {
    gameState.status = 'LOBBY';
    gameState.dayCount = 0;
    gameState.logs = [];
    Object.values(gameState.players).forEach(p => {
        p.isAlive = true;
        p.role = null;
    });
    broadcastState();
}

function startTimer(seconds, callback) {
    if (timerInterval) clearInterval(timerInterval);
    currentTimer = seconds;
    
    timerInterval = setInterval(() => {
        currentTimer--;
        
        if (isHost) {
            // Can broadcast timer if needed, but local tick is fine if we sync time
        }
        
        if (currentTimer <= 0) {
            clearInterval(timerInterval);
            if (isHost && callback) callback();
        }
    }, 1000);
}
