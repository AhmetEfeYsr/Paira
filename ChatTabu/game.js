// --- ChatTabu Logic ---

// Fallback Word List (same as Tabu fallback)
const fallbackWords = [
    { ana_kelime: "araba", yasakli_kelimeler: ["Taşıt","Motor","Direksiyon","Tekerlek","Vites"], kategori: "Genel", zorluk: 10 },
    { ana_kelime: "bilgisayar", yasakli_kelimeler: ["Klavye","Fare","Ekran","İnternet","Teknoloji"], kategori: "Genel", zorluk: 10 },
    { ana_kelime: "güneş", yasakli_kelimeler: ["Sıcak","Yaz","Gökyüzü","Sarı","Işık"], kategori: "Doğa", zorluk: 10 },
    { ana_kelime: "kalem", yasakli_kelimeler: ["Yazı","Kağıt","Silgi","Okul","Mürekkep"], kategori: "Eğitim", zorluk: 10 },
    { ana_kelime: "deniz", yasakli_kelimeler: ["Su","Mavi","Yüzmek","Kum","Dalga"], kategori: "Doğa", zorluk: 10 },
    { ana_kelime: "kitap", yasakli_kelimeler: ["Okumak","Sayfa","Yazar","Kütüphane","Roman"], kategori: "Eğitim", zorluk: 10 },
    { ana_kelime: "telefon", yasakli_kelimeler: ["Aramak","Mesaj","Cep","Ekran","İletişim"], kategori: "Teknoloji", zorluk: 10 },
    { ana_kelime: "ev", yasakli_kelimeler: ["Yaşamak","Aile","Odalar","Kapı","Pencere"], kategori: "Genel", zorluk: 10 },
    { ana_kelime: "ağaç", yasakli_kelimeler: ["Yeşil","Yaprak","Orman","Doğa","Dal"], kategori: "Doğa", zorluk: 10 },
    { ana_kelime: "kedi", yasakli_kelimeler: ["Miyav","Hayvan","Evcil","Tüy","Kuyruk"], kategori: "Hayvanlar", zorluk: 10 }
];

let wordDatabase = [];
let currentWordIndex = 0;
let currentWord = null;
let chatListener = null;

let state = {
    platform: '',
    channel: '',
    scores: {}, // username -> score
    isPaused: false
};
let isWordVisible = true;

// Fuzzy Matcher implementation for Turkish characters (from KelimeAvi/Bagnam concept)
const normalizeTurkish = (str) => {
    return str.replace(/İ/g, 'I').replace(/ı/g, 'I')
              .replace(/Ş/g, 'S').replace(/ş/g, 'S')
              .replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
              .replace(/Ü/g, 'U').replace(/ü/g, 'U')
              .replace(/Ö/g, 'O').replace(/ö/g, 'O')
              .replace(/Ç/g, 'C').replace(/ç/g, 'C')
              .toUpperCase().trim();
};

const levenshtein = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

const isMatch = (guess, target) => {
    const nGuess = normalizeTurkish(guess);
    const nTarget = normalizeTurkish(target);

    // Direct match or within 1 edit distance for slightly longer words
    if (nGuess === nTarget) return true;

    if (nTarget.length > 4) {
        const distance = levenshtein(nGuess, nTarget);
        if (distance <= 1) return true;
    }
    return false;
};

window.PairaTime = window.PairaTime || { now: () => Date.now() };

// Modals & Timers
let gameState = {
    mode: 'solo', // solo, streamer_vs_streamer, chat_vs_chat
    hostName: '',
    clientName: '',
    hostPlatform: '',
    clientPlatform: '',
    clientId: null,
    hostScore: 0,
    clientScore: 0,
    turnId: null, // myId of the current narrator
    isGameStarted: false,
    activeWord: null,
    currentRound: 1,
    maxRounds: 5,
    turnEndTime: null,
    isGameOver: false
};

document.addEventListener('DOMContentLoaded', async () => {
    // If we are on index.html (Setup)
    if (document.getElementById('game-mode-select')) {
        setupLogin();
    }
    // If we are on game.html
    else if (document.getElementById('main-word')) {
        await initGame();

        const btnToggleVisibility = document.getElementById('btn-toggle-visibility');
        if (btnToggleVisibility) {
            btnToggleVisibility.addEventListener('click', () => {
                isWordVisible = !isWordVisible;
                const mainWord = document.getElementById('main-word');
                const forbiddenList = document.getElementById('forbidden-words');
                const iconOpen = document.getElementById('icon-eye-open');
                const iconClosed = document.getElementById('icon-eye-closed');
                
                if (isWordVisible) {
                    mainWord.classList.remove('blurred-text');
                    forbiddenList.classList.remove('blurred-text');
                    iconOpen.style.display = 'block';
                    iconClosed.style.display = 'none';
                } else {
                    mainWord.classList.add('blurred-text');
                    forbiddenList.classList.add('blurred-text');
                    iconOpen.style.display = 'none';
                    iconClosed.style.display = 'block';
                }
            });
        }
    }
});

function setupLogin() {
    const modeSelect = document.getElementById('game-mode-select');
    const soloActions = document.getElementById('solo-actions');
    const multiplayerActions = document.getElementById('multiplayer-actions');
    const loginStatus = document.getElementById('login-status');

    modeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'solo') {
            soloActions.style.display = 'block';
            multiplayerActions.style.display = 'none';
        } else {
            soloActions.style.display = 'none';
            multiplayerActions.style.display = 'flex';
        }
    });

    const getFormValues = () => {
        const channel = document.getElementById('channel-input').value.trim();
        const platform = document.getElementById('platform-select').value;
        const mode = document.getElementById('game-mode-select').value;
        if (!channel) {
            loginStatus.innerText = 'Lütfen bir kanal adı girin!';
            return null;
        }
        return { channel, platform, mode };
    };

    document.getElementById('btn-start-solo').addEventListener('click', () => {
        const vals = getFormValues();
        if (!vals) return;
        sessionStorage.setItem('chattabu_channel', vals.channel);
        sessionStorage.setItem('chattabu_platform', vals.platform);
        sessionStorage.setItem('chattabu_mode', 'solo');
        window.location.href = 'game.html';
    });

    document.getElementById('btn-host').addEventListener('click', () => {
        const vals = getFormValues();
        if (!vals) return;
        sessionStorage.setItem('chattabu_channel', vals.channel);
        sessionStorage.setItem('chattabu_platform', vals.platform);
        sessionStorage.setItem('chattabu_mode', vals.mode);
        sessionStorage.setItem('chattabu_isHost', 'true');
        window.location.href = 'game.html';
    });

    document.getElementById('btn-join').addEventListener('click', () => {
        const vals = getFormValues();
        if (!vals) return;
        const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
        if (!roomCode || roomCode.length !== 6) {
            loginStatus.innerText = 'Lütfen geçerli bir 6 haneli oda kodu girin!';
            return;
        }
        sessionStorage.setItem('chattabu_channel', vals.channel);
        sessionStorage.setItem('chattabu_platform', vals.platform);
        sessionStorage.setItem('chattabu_mode', vals.mode);
        sessionStorage.setItem('chattabu_isHost', 'false');
        sessionStorage.setItem('chattabu_room', roomCode);
        window.location.href = 'game.html';
    });
}

async function initGame() {
    const channel = sessionStorage.getItem('chattabu_channel');
    const platform = sessionStorage.getItem('chattabu_platform');
    const mode = sessionStorage.getItem('chattabu_mode') || 'solo';
    const isHost = sessionStorage.getItem('chattabu_isHost') === 'true';
    const roomCode = sessionStorage.getItem('chattabu_room');

    if (!channel || !platform) {
        window.location.href = 'index.html';
        return;
    }

    gameState.mode = mode;

    // Set UI for Host vs Client
    if (mode === 'solo') {
        // Switch directly to game screen
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        document.querySelector('.score-board').style.display = 'none';
        startGameSolo(channel, platform);
        return;
    }

    // MULTIPLAYER LOGIC
    document.getElementById('channel-name-display').textContent = `${platform.toUpperCase()} / ${channel}`;

    if (isHost) {
        document.getElementById('settings-card').style.display = 'flex';
        document.getElementById('room-code-display').style.display = 'flex';
        gameState.hostName = channel;
        gameState.hostPlatform = platform;
    } else {
        document.getElementById('settings-card').style.display = 'none';
        document.getElementById('room-code-display').style.display = 'none';
    }

    try {
        const data = await window.Network.initPeer(isHost ? 'host' : 'client', roomCode);
        console.log("Peer initialized:", data);
        if (isHost) {
            document.getElementById('room-code-val').textContent = data.roomCode;
            updatePlayersList();
        }
    } catch (e) {
        alert(e.message || "Bağlantı hatası");
        window.location.href = 'index.html';
    }

    // Load Words
    try {
        const response = await fetch('../Tabu/tr.json');
        if (response.ok) {
            wordDatabase = await response.json();
        } else {
            wordDatabase = fallbackWords;
        }
    } catch (e) {
        wordDatabase = fallbackWords;
    }
    wordDatabase.sort(() => (window.crypto.getRandomValues(new Uint32Array(1))[0] % 100) - 50);

    // Setup network callbacks
    window.onPlayerJoined = (peerId) => {
        // Once client joins, host asks them for their name/platform
        window.Network.broadcastToClients({ type: 'REQUEST_INFO' });
        document.getElementById('lobby-status').textContent = 'Rakip bağlandı, bilgileri bekleniyor...';
    };

    window.onPlayerLeft = (peerId) => {
        gameState.clientName = '';
        gameState.clientPlatform = '';
        gameState.clientId = null;
        updatePlayersList();
        document.getElementById('lobby-status').textContent = 'Rakip ayrıldı. Yeni rakip bekleniyor...';
        
        if (gameState.isGameStarted && !gameState.isGameOver) {
            alert("Rakip oyundan ayrıldı. Oyun sona erdi.");
            gameState.isGameOver = true;
            updateGameUI();
        }
    };

    window.handleNetworkData = (data, sender) => {
        if (data.type === 'REQUEST_INFO') {
            window.Network.sendToHost({ type: 'CLIENT_INFO', channel, platform, myId: window.Network.getMyId() });
        }
        else if (data.type === 'CLIENT_INFO') {
            gameState.clientName = data.channel;
            gameState.clientPlatform = data.platform;
            // The client's myId is their peerId, but sometimes it might be omitted if old logic.
            // Better to use sender as a robust fallback since sender IS the peerId in PeerJS handleNetworkData.
            gameState.clientId = data.myId || sender;
            updatePlayersList();
            document.getElementById('lobby-status').textContent = 'Rakip hazır!';
        }
        else if (data.type === 'SYNC_STATE') {
            if (data.hostNow && data.state.turnEndTime) {
                const diff = window.PairaTime.now() - data.hostNow;
                data.state.turnEndTime += diff;
            }
            gameState = { ...gameState, ...data.state };
            updateGameUI();
        }
        else if (data.type === 'START_GAME') {
            document.getElementById('lobby-screen').classList.remove('active');
            document.getElementById('game-screen').classList.add('active');

            // Connect to chat listeners
            setupChatListeners();
            updateGameUI();
        }
        else if (data.type === 'NEXT_WORD') {
            gameState.activeWord = data.word;
            updateGameUI();
        }
        else if (data.type === 'GUESSED_CORRECTLY') {
            // Replicate correct guess visually for clients
            gameState.activeWord = data.word;
            state.scores = data.scores;
            gameState.hostScore = data.hostScore;
            gameState.clientScore = data.clientScore;
            handleCorrectGuessUI(data.username);
            updateGameUI();
        }
        else if (data.type === 'SKIP_WORD') {
            if (isHost && gameState.turnId !== window.Network.getMyId()) {
                hostNextWord();
            }
        }
        else if (data.type === 'NEXT_WORD_REQ') {
            if (isHost && gameState.turnId !== window.Network.getMyId()) {
                hostNextWord();
            }
        }
        else if (data.type === 'CHAT_MSG') {
            // Sadece Streamer vs Streamer modunda karşı tarafın mesajını ekranda göster
            handleChatMessageUI(data.username, data.message, false);
            if (isHost) {
                checkGuess(data.username, data.message);
            }
        }
        else if (data.type === 'CHECK_GUESS') {
            // Chat vs Chat modunda client'tan gelen mesajı ekrana basmadan host tarafında gizlice kontrol et
            if (isHost) {
                checkGuess(data.username, data.message);
            }
        }
        else if (data.type === 'TABOO_PRESSED') {
            if (isHost && !gameState.isGameOver && gameState.isGameStarted) {
                if (gameState.turnId === window.Network.getMyId()) {
                    gameState.hostScore = Math.max(0, gameState.hostScore - 1);
                } else {
                    gameState.clientScore = Math.max(0, gameState.clientScore - 1);
                }
                hostNextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: gameState, hostNow: window.PairaTime.now() });
                updateGameUI();
            }
        }
        else if (data.type === 'TURN_END') {
            gameState.turnId = data.nextTurnId;
            gameState.turnEndTime = window.PairaTime.now() + 60000;
            updateGameUI();
            startTurn();
        }
    };

    // Controls
    document.getElementById('btn-leave-lobby').addEventListener('click', leaveGame);
    document.getElementById('btn-leave-game').addEventListener('click', leaveGame);

    document.getElementById('btn-start-game').addEventListener('click', () => {
        if (!gameState.clientName) {
            alert("Oyunu başlatmak için bir rakibin katılması gerekiyor!");
            return;
        }

        gameState.turnId = window.Network.getMyId(); // Host starts
        gameState.isGameStarted = true;
        gameState.hostScore = 0;
        gameState.clientScore = 0;
        gameState.currentRound = 1;
        gameState.isGameOver = false;

        // Set initial timer for 60 seconds
        if (gameState.mode !== 'solo') {
            gameState.turnEndTime = window.PairaTime.now() + 60000;
        }

        window.Network.broadcastToClients({ type: 'SYNC_STATE', state: gameState, hostNow: window.PairaTime.now() });
        window.Network.broadcastToClients({ type: 'START_GAME' });

        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');

        setupChatListeners();
        startTurn();
    });

    document.getElementById('btn-skip').addEventListener('click', () => {
        if (window.Network.isHost() && gameState.turnId === window.Network.getMyId()) {
            hostNextWord();
        } else {
            window.Network.sendToHost({ type: 'SKIP_WORD' });
        }
    });

    document.getElementById('btn-taboo').addEventListener('click', () => {
        if (gameState.mode === 'solo' || gameState.turnId === window.Network.getMyId() || gameState.isGameOver) return;

        if (window.Network.isHost()) {
            // Deduct client score, since it's client's turn if host is pressing it
            gameState.clientScore = Math.max(0, gameState.clientScore - 1);
            hostNextWord();
            window.Network.broadcastToClients({ type: 'SYNC_STATE', state: gameState, hostNow: window.PairaTime.now() });
            updateGameUI();
        } else {
            window.Network.sendToHost({ type: 'TABOO_PRESSED' });
        }
    });

    updatePlayersList();
}

function updatePlayersList() {
    const list = document.getElementById('players-list');
    list.innerHTML = '';

    if (gameState.hostName) {
        list.innerHTML += `<li><strong>${gameState.hostName}</strong> <span class="badge" style="background:var(--primary-purple)">Kurucu</span></li>`;
    } else {
        const c = sessionStorage.getItem('chattabu_channel');
        list.innerHTML += `<li><strong>${c}</strong> <span class="badge">Ben</span></li>`;
    }

    if (gameState.clientName) {
        list.innerHTML += `<li><strong>${gameState.clientName}</strong> <span class="badge" style="background:var(--danger)">Rakip</span></li>`;
    }
}

function leaveGame() {
    if (chatListener) chatListener.stop();
    window.Network.disconnectPeer();
    window.location.href = 'index.html';
}

function startGameSolo(channel, platform) {
    // Basic solo implementation directly here
    document.getElementById('channel-name-display').textContent = `${platform.toUpperCase()} / ${channel}`;

    if (typeof ChatListener === 'undefined') {
        alert('ChatListener kütüphanesi yüklenemedi!');
        return;
    }

    chatListener = new ChatListener(platform, channel, handleChatMessage);
    chatListener.start();

    document.getElementById('chat-status').textContent = '• Bağlı';

    document.getElementById('btn-skip').addEventListener('click', soloNextWord);
    document.getElementById('btn-leave-game').addEventListener('click', leaveGame);

    // Load words and start
    fetch('../Tabu/tr.json').then(res => res.json()).then(data => {
        wordDatabase = data;
        wordDatabase.sort(() => Math.random() - 0.5);
        soloNextWord();
    }).catch(e => {
        wordDatabase = fallbackWords;
        soloNextWord();
    });
}

function soloNextWord() {
    if (wordDatabase.length === 0) return;
    currentWordIndex = (currentWordIndex + 1) % wordDatabase.length;
    currentWord = wordDatabase[currentWordIndex];
    gameState.activeWord = currentWord;

    const mainEl = document.getElementById('main-word');
    const fbEl = document.getElementById('forbidden-words');

    mainEl.textContent = currentWord.ana_kelime.toLocaleUpperCase('tr-TR');
    fbEl.innerHTML = currentWord.yasakli_kelimeler.map(w => `<li>${w.toLocaleUpperCase('tr-TR')}</li>`).join('');

    state.isPaused = false;
    document.getElementById('btn-skip').style.display = 'inline-block';
}

// MULTIPLAYER GAME LOOP
let timerRaf;
function updateTimer() {
    if (gameState.mode === 'solo' || !gameState.isGameStarted || gameState.isGameOver) {
        if (timerRaf) cancelAnimationFrame(timerRaf);
        return;
    }

    const timerEl = document.getElementById('turn-timer');
    if (gameState.turnEndTime) {
        const remaining = Math.max(0, gameState.turnEndTime - window.PairaTime.now());
        const seconds = Math.ceil(remaining / 1000);

        timerEl.textContent = seconds;

        if (remaining <= 0) {
            timerEl.textContent = "0";
            if (window.Network.isHost()) {
                handleTimeUp();
            }
        } else {
            timerRaf = requestAnimationFrame(updateTimer);
        }
    } else {
        timerRaf = requestAnimationFrame(updateTimer);
    }
}

function handleTimeUp() {
    if (!window.Network.isHost()) return;
    if (gameState.isGameOver) return;

    // Switch turn
    const isHostTurn = gameState.turnId === window.Network.getMyId();

    if (isHostTurn) {
        // Switch to client
        gameState.turnId = gameState.clientId;
        gameState.turnEndTime = window.PairaTime.now() + 60000;
        window.Network.broadcastToClients({ type: 'TURN_END', nextTurnId: gameState.turnId });
        window.Network.broadcastToClients({ type: 'SYNC_STATE', state: gameState });
        startTurn();
    } else {
        // Round ends
        gameState.currentRound += 1;
        if (gameState.currentRound > gameState.maxRounds) {
            gameState.isGameOver = true;
            window.Network.broadcastToClients({ type: 'SYNC_STATE', state: gameState });
            updateGameUI();
        } else {
            // Back to host
            gameState.turnId = window.Network.getMyId();
            gameState.turnEndTime = window.PairaTime.now() + 60000;
            window.Network.broadcastToClients({ type: 'TURN_END', nextTurnId: gameState.turnId });
            window.Network.broadcastToClients({ type: 'SYNC_STATE', state: gameState });
            startTurn();
        }
    }
}

function startTurn() {
    if (timerRaf) cancelAnimationFrame(timerRaf);
    if (gameState.mode !== 'solo') {
        timerRaf = requestAnimationFrame(updateTimer);
    }

    if (!window.Network.isHost()) return;

    if (!gameState.isGameOver) {
        hostNextWord();
    }
}

function hostNextWord() {
    if (wordDatabase.length === 0) return;
    currentWordIndex = (currentWordIndex + 1) % wordDatabase.length;
    const word = wordDatabase[currentWordIndex];
    gameState.activeWord = word;

    updateGameUI();
    window.Network.broadcastToClients({ type: 'NEXT_WORD', word });
}

function setupChatListeners() {
    if (chatListener) chatListener.stop();

    const channel = sessionStorage.getItem('chattabu_channel');
    const platform = sessionStorage.getItem('chattabu_platform');

    chatListener = new ChatListener(platform, channel, handleChatMessage);
    chatListener.start();

    document.getElementById('chat-status').textContent = '• Bağlı';

    // Set UI Names
    if (gameState.mode !== 'solo') {
        document.getElementById('p1-name').textContent = gameState.hostName;
        document.getElementById('p2-name').textContent = gameState.clientName;
    }
}

function updateGameUI() {
    if (!gameState.isGameStarted) return;

    document.getElementById('p1-score').textContent = `${gameState.hostScore} Puan`;
    document.getElementById('p2-score').textContent = `${gameState.clientScore} Puan`;

    const isMyTurn = gameState.mode === 'solo' || gameState.turnId === window.Network.getMyId();
    const statusEl = document.getElementById('turn-status');
    const mainEl = document.getElementById('main-word');
    const fbEl = document.getElementById('forbidden-words');
    const controls = document.querySelector('.narrator-actions');
    const roundDisplay = document.getElementById('round-display');
    const turnTimer = document.getElementById('turn-timer');
    const toggleVisibilityBtn = document.getElementById('btn-toggle-visibility');

    if (gameState.mode !== 'solo') {
        roundDisplay.style.display = 'block';
        turnTimer.style.display = 'block';
        roundDisplay.textContent = `Tur: ${gameState.currentRound}/${gameState.maxRounds}`;
    }

    if (gameState.isGameOver) {
        statusEl.textContent = "Oyun Bitti!";
        statusEl.style.borderColor = "var(--warning)";
        controls.style.display = "none";
        roundDisplay.textContent = "Oyun Bitti";
        turnTimer.style.display = "none";

        let winnerText = "Berabere!";
        if (gameState.hostScore > gameState.clientScore) {
            winnerText = `${gameState.hostName} Kazandı!`;
        } else if (gameState.clientScore > gameState.hostScore) {
            winnerText = `${gameState.clientName} Kazandı!`;
        }
        mainEl.textContent = winnerText;
        fbEl.innerHTML = `<li>Host Puanı: ${gameState.hostScore}</li><li>Rakip Puanı: ${gameState.clientScore}</li>`;
        return;
    }

    if (isMyTurn) {
        statusEl.textContent = "Sıra Sende! Anlat Bakalım.";
        statusEl.style.borderColor = "var(--success)";
        controls.style.display = "flex";
        if (toggleVisibilityBtn) toggleVisibilityBtn.style.display = 'flex';

        document.getElementById('btn-skip').style.display = 'inline-block';
        if (document.getElementById('btn-taboo')) document.getElementById('btn-taboo').style.display = 'none';

        if (gameState.activeWord) {
            mainEl.textContent = gameState.activeWord.ana_kelime.toLocaleUpperCase('tr-TR');
            fbEl.innerHTML = gameState.activeWord.yasakli_kelimeler.map(w => `<li>${w.toLocaleUpperCase('tr-TR')}</li>`).join('');
        }
        } else {
            statusEl.textContent = "Diğer Yayıncı Anlatıyor...";
            statusEl.style.borderColor = "var(--danger)";
            if (toggleVisibilityBtn) toggleVisibilityBtn.style.display = 'flex';

            if (gameState.mode !== 'solo') {
            controls.style.display = "flex";
            document.getElementById('btn-skip').style.display = 'none';
            if (document.getElementById('btn-taboo')) document.getElementById('btn-taboo').style.display = 'inline-block';

            if (gameState.activeWord) {
                mainEl.textContent = gameState.activeWord.ana_kelime.toLocaleUpperCase('tr-TR');
                fbEl.innerHTML = gameState.activeWord.yasakli_kelimeler.map(w => `<li>${w.toLocaleUpperCase('tr-TR')}</li>`).join('');
            }
        } else {
            controls.style.display = "none";
            mainEl.textContent = "SANSÜRLÜ";
            fbEl.innerHTML = "<li>???</li><li>???</li><li>???</li><li>???</li><li>???</li>";
        }
    }

    state.isPaused = false;

}

function handleChatMessage(username, message) {
    if (gameState.mode === 'solo') {
        if (state.isPaused || !gameState.activeWord) return;
        handleChatMessageUI(username, message, true);
        checkGuess(username, message);
    } else {
        // Multiplayer Chat Logic
        if (!gameState.isGameStarted || !gameState.activeWord || state.isPaused) return;

        const isMyTurn = gameState.turnId === window.Network.getMyId();

        // Chat vs Chat Logic: Display and send ONLY if it's my turn
        if (gameState.mode === 'chat_vs_chat') {
            if (!isMyTurn) return; // Do not process or display chat

            handleChatMessageUI(username, message, true);

            if (window.Network.isHost()) {
                checkGuess(username, message);
            } else {
                // Sadece kontrol edilmesi için Hosta yolla (Ekrana çizmesi için değil, CHECK_GUESS olarak)
                window.Network.sendToHost({ type: 'CHECK_GUESS', username, message });
            }
        } else {
            // Streamer vs Streamer: Process and broadcast all chats
            handleChatMessageUI(username, message, true);

            if (window.Network.isHost()) {
                window.Network.broadcastToClients({ type: 'CHAT_MSG', username, message });
                checkGuess(username, message);
            } else {
                window.Network.sendToHost({ type: 'CHAT_MSG', username, message });
            }
        }
    }
}

function handleChatMessageUI(username, message, isLocal) {
    const chatFeed = document.getElementById('chat-feed');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';

    // Add small visual indicator if it's from the other channel
    if (!isLocal) {
        msgDiv.style.borderLeft = '3px solid var(--warning)';
    }

    // Sanitize textContent
    const usernameSpan = document.createElement('strong');
    usernameSpan.textContent = username + ': ';
    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    msgDiv.appendChild(usernameSpan);
    msgDiv.appendChild(textSpan);

    // Save for reference if needed
    msgDiv.dataset.text = message;

    chatFeed.appendChild(msgDiv);

    // Autoscroll
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

function checkGuess(username, message) {
    if (state.isPaused || !gameState.activeWord) return;

    if (isMatch(message, gameState.activeWord.ana_kelime)) {
        state.isPaused = true;

        if (!state.scores[username]) state.scores[username] = 0;
        state.scores[username] += 1;

        if (gameState.mode !== 'solo') {
            const isHostTurn = gameState.turnId === window.Network.getMyId() && window.Network.isHost() ||
                              gameState.turnId === window.Network.getMyId() && !window.Network.isHost(); // wait host checks

            // Actually the host processes all guesses and assigns score to the current turn narrator
            if (window.Network.isHost()) {
                if (gameState.turnId === window.Network.getMyId()) {
                    gameState.hostScore += 1;
                } else {
                    gameState.clientScore += 1;
                }

                window.Network.broadcastToClients({
                    type: 'GUESSED_CORRECTLY',
                    username,
                    word: gameState.activeWord,
                    scores: state.scores,
                    hostScore: gameState.hostScore,
                    clientScore: gameState.clientScore
                });
            }
        }

        handleCorrectGuessUI(username);
    }
}

function handleCorrectGuessUI(username) {
    state.isPaused = true;

    // Find the message in chat and make it green
    const chatFeed = document.getElementById('chat-feed');
    const lastMsgs = Array.from(chatFeed.querySelectorAll('.chat-msg')).slice(-10); // Check last 10 messages for performance

    for (let msgDiv of lastMsgs) {
        const u = msgDiv.querySelector('strong').textContent.replace(': ', '');
        if (u === username && isMatch(msgDiv.dataset.text || '', gameState.activeWord.ana_kelime)) {
            msgDiv.classList.add('correct');
            msgDiv.querySelector('span').textContent += ' (🎉 DOĞRU BİLDİ!)';
            break;
        }
    }

    updateLeaderboard();
    updateGameUI();

    document.getElementById('btn-skip').style.display = 'none';

    // Confetti effect / visual cue on main card
    document.querySelector('.card-tabu').style.borderColor = 'var(--success)';
    document.querySelector('.card-tabu').style.boxShadow = '0 10px 40px var(--success-bg)';

    // Auto advance after correct guess
    setTimeout(() => {
        document.querySelector('.card-tabu').style.borderColor = 'var(--neon-purple)';
        document.querySelector('.card-tabu').style.boxShadow = '0 8px 25px var(--input-bg)';

        if (gameState.mode === 'solo') {
            soloNextWord();
        } else if (window.Network.isHost()) {
            hostNextWord();
        } else if (gameState.turnId === window.Network.getMyId()) {
             window.Network.sendToHost({ type: 'NEXT_WORD_REQ' });
        }
    }, 2000);
}

function updateLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    const sortedScores = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);

    sortedScores.forEach(([uname, score]) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = uname;

        const scoreSpan = document.createElement('span');
        scoreSpan.textContent = `${score} Puan`;
        scoreSpan.style.color = 'var(--primary-purple)';
        scoreSpan.style.fontWeight = 'bold';

        item.appendChild(nameSpan);
        item.appendChild(scoreSpan);
        list.appendChild(item);
    });
}
