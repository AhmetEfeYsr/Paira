/**
 * Main Application Logic
 * Integrates Network, UI, and Game State.
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- Session Setup ---
    const isHost = sessionStorage.getItem('isHost') === 'true';
    const roomCode = sessionStorage.getItem('roomCode');
    const username = sessionStorage.getItem('username');
    let isCodeVisible = false;

    if (!roomCode || !username) {
        window.location.href = 'index.html';
        return;
    }

    // --- UI Elements ---
    const ui = {
        displayRoomCode: document.getElementById('display-room-code'),
        btnToggleCode: document.getElementById('btn-toggle-code'),
        btnCopyRoom: document.getElementById('btn-copy-room'),

        playerCount: document.getElementById('player-count'),
        playersList: document.getElementById('players-list'),

        // Screens
        lobbyScreen: document.getElementById('lobby-screen'),
        gameScreen: document.getElementById('game-screen'),
        votingScreen: document.getElementById('voting-screen'),
        scoreScreen: document.getElementById('score-screen'),

        // Host Controls
        hostSettings: document.getElementById('host-settings'),
        clientWaiting: document.getElementById('client-waiting'),
        hostNameDisplay: document.getElementById('host-name-display'),
        clientCatsPreview: document.getElementById('client-cats-preview'),
        btnStartGame: document.getElementById('btn-start-game'),

        settingRounds: document.getElementById('setting-rounds'),
        settingEndCondition: document.getElementById('setting-end-condition'),
        settingEndValueGroup: document.getElementById('setting-end-value-group'),
        settingEndValue: document.getElementById('setting-end-value'),
        categorySelection: document.getElementById('category-selection'),
        customCatInput: document.getElementById('custom-cat-input'),
        btnAddCustomCat: document.getElementById('btn-add-custom-cat'),

        // Gameplay Elements
        currentLetter: document.getElementById('current-letter'),
        btnChangeLetter: document.getElementById('btn-change-letter'),
        timerDisplay: document.getElementById('timer-display'),
        timerStatusText: document.getElementById('timer-status-text'),
        gameInputsContainer: document.getElementById('game-inputs-container'),
        btnFinishTurn: document.getElementById('btn-finish-turn'),
        finishStatusText: document.getElementById('finish-status-text'),
        currentRound: document.getElementById('current-round'),
        totalRounds: document.getElementById('total-rounds'),
        roundIndicator: document.getElementById('round-indicator'),

        // Voting & Scoreboard
        votingContainer: document.getElementById('voting-container'),
        btnSubmitVotes: document.getElementById('btn-submit-votes'),
        btnBypassVotes: document.getElementById('btn-bypass-votes'),
        votingStatusText: document.getElementById('voting-status-text'),
        scoreboardBody: document.getElementById('scoreboard-body'),
        btnNextRound: document.getElementById('btn-next-round'),
        extendGameGroup: document.getElementById('extend-game-group'),
        btnExtendGame: document.getElementById('btn-extend-game')
    };

    // Initialize UI Text
    if (ui.displayRoomCode) {
        ui.displayRoomCode.dataset.code = roomCode;
        ui.displayRoomCode.textContent = '••••••••';
    }

    if (isHost) {
        if(ui.hostSettings) ui.hostSettings.classList.remove('hidden');
        if(ui.clientWaiting) ui.clientWaiting.classList.add('hidden');
        document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.client-only').forEach(el => el.classList.add('hidden'));
    } else {
        if (ui.hostSettings) ui.hostSettings.classList.add('hidden');
        if (ui.clientWaiting) ui.clientWaiting.classList.remove('hidden');
        document.querySelectorAll('.host-only').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.client-only').forEach(el => el.classList.remove('hidden'));
    }

    if (ui.btnToggleCode) {
        const iconEyeOpen = document.getElementById('icon-eye-open');
        const iconEyeClosed = document.getElementById('icon-eye-closed');

        ui.btnToggleCode.addEventListener('click', () => {
            isCodeVisible = !isCodeVisible;
            if (iconEyeOpen && iconEyeClosed) {
                if (isCodeVisible) {
                    iconEyeOpen.classList.remove('hidden');
                    iconEyeClosed.classList.add('hidden');
                } else {
                    iconEyeOpen.classList.add('hidden');
                    iconEyeClosed.classList.remove('hidden');
                }
            }
            if (ui.displayRoomCode) {
                ui.displayRoomCode.textContent = isCodeVisible ? (ui.displayRoomCode.dataset.code || '') : '••••••••';
            }
        });
    }

    if (ui.btnCopyRoom) {
        ui.btnCopyRoom.addEventListener('click', () => {
            const codeToCopy = ui.displayRoomCode?.dataset?.code;
            if (codeToCopy) {
                navigator.clipboard.writeText(codeToCopy)
                    .then(() => {
                        const container = document.getElementById('toast-container');
                        if (container) {
                            const toast = document.createElement('div');
                            toast.className = 'toast success';
                            toast.style.borderLeftColor = 'var(--success-color)';
                            toast.textContent = 'Oda kodu kopyalandı!';
                            container.appendChild(toast);
                            setTimeout(() => toast.remove(), 4000);
                        }
                    })
                    .catch(() => console.error('Kopyalanamadı'));
            }
        });
    }

    // --- Default Categories List ---
    const defaultCategories = [
        { id: 'isim', name: 'İsim' },
        { id: 'sehir', name: 'Şehir' },
        { id: 'hayvan', name: 'Hayvan' },
        { id: 'bitki', name: 'Bitki' },
        { id: 'esya', name: 'Eşya' },
        { id: 'ulke', name: 'Ülke' },
        { id: 'unlu', name: 'Ünlü' },
        { id: 'meslek', name: 'Meslek' },
        { id: 'renk', name: 'Renk' },
        { id: 'film_dizi', name: 'Film/Dizi' },
        { id: 'marka', name: 'Marka' },
        { id: 'yiyecek', name: 'Yiyecek' },
        { id: 'oyun', name: 'Oyun' },
        { id: 'muzik', name: 'Müzik' },
        { id: 'araba', name: 'Araba' },
        { id: 'spor', name: 'Spor' },
        { id: 'hastalik', name: 'Hastalık' },
        { id: 'yazar', name: 'Yazar' },
        { id: 'sarkici', name: 'Şarkıcı' }
    ];

    let gameConfig = {
        rounds: 3,
        endCondition: 'time_limit', // first_finish, time_limit, all_finish
        endValue: 90, // seconds or count
        categories: []
    };

    let gameState = {
        status: 'LOBBY', // LOBBY, PLAYING, VOTING, SCORE
        round: 1,
        letter: '',
        playersReady: 0,
        playerAnswers: {}, // { playerId: { categoryId: 'answer' } }
        timerInterval: null,
        endTime: null
    };

    // --- Network Integration ---
    const network = new NetworkManager(
        (senderId, data) => handleNetworkData(senderId, data),
        (player) => updatePlayerList(),
        (player) => updatePlayerList(),
        (err) => handleNetworkError(err)
    );

    network.init(isHost, roomCode, username);

    function updatePlayerList() {
        if(ui.playersList) ui.playersList.innerHTML = '';
        let count = 0;
        let hostName = 'Kurucu';

        for (const [id, p] of Object.entries(network.players)) {
            count++;
            const li = document.createElement('li');

            let displayName = p.name;
            if (id === network.myId) {
                displayName += ' (Sen)';
            }
            if (p.isHost) {
                li.classList.add('is-host');
                hostName = p.name;
                // Leave the emoji for Host badge via CSS as requested initially
            }

            if (id === network.myId) {
                const strong = document.createElement('strong');
                strong.textContent = displayName;
                li.appendChild(strong);
            } else {
                li.textContent = displayName;
            }

            if(ui.playersList) ui.playersList.appendChild(li);
        }

        if(ui.playerCount) ui.playerCount.textContent = count;
        if(ui.hostNameDisplay) ui.hostNameDisplay.textContent = hostName;
    }

    function handleNetworkError(err) {
        alert("Bağlantı koptu veya hata oluştu. Lütfen tekrar girin.");
        window.location.href = 'index.html';
    }

    function handleNetworkData(senderId, data) {
        if (!data || !data.type) return;

        console.log("Recv:", data.type);

        switch(data.type) {
            case 'SYNC_PLAYERS':
                network.players = data.players;
                updatePlayerList();
                break;
            case 'CONFIG_UPDATE':
                if (!isHost) {
                    gameConfig = data.config;
                    updateClientLobbyPreview();
                }
                break;
            // ... more logic is handled in the extended handleNetworkData below
        }
    }

    // --- Lobby UI Logic ---
    function renderCategories() {
        if(!ui.categorySelection) return;
        ui.categorySelection.innerHTML = '';
        defaultCategories.forEach(cat => {
            const label = document.createElement('label');
            label.className = 'cat-checkbox';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = cat.id;
            checkbox.dataset.name = cat.name;
            // Default selected ones
            if (['isim', 'sehir', 'hayvan', 'esya', 'bitki'].includes(cat.id)) {
                checkbox.checked = true;
            }

            checkbox.addEventListener('change', broadcastConfig);

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + cat.name));
            ui.categorySelection.appendChild(label);
        });
        updateLocalConfig();
    }

    function updateLocalConfig() {
        if (!isHost) return;
        gameConfig.rounds = parseInt(ui.settingRounds.value, 10) || 3;
        gameConfig.endCondition = ui.settingEndCondition.value;
        gameConfig.endValue = parseInt(ui.settingEndValue.value, 10) || 90;

        if(ui.categorySelection) {
            const selected = Array.from(ui.categorySelection.querySelectorAll('input:checked'));
            gameConfig.categories = selected.map(cb => ({
                id: cb.value,
                name: cb.dataset.name
            }));
        }
    }

    function broadcastConfig() {
        if (!isHost) return;
        updateLocalConfig();
        network.broadcast({ type: 'CONFIG_UPDATE', config: gameConfig });
    }

    if (isHost) {
        renderCategories();

        if(ui.settingRounds) ui.settingRounds.addEventListener('change', broadcastConfig);
        if(ui.settingEndCondition) ui.settingEndCondition.addEventListener('change', (e) => {
            const label = document.getElementById('setting-end-label');
            if (e.target.value === 'all_finish') {
                if(label) label.textContent = 'Kişi Sayısı (X):';
                ui.settingEndValue.value = Math.max(1, Object.keys(network.players).length - 1);
            } else {
                if(label) label.textContent = 'Saniye (X):';
            }
            broadcastConfig();
        });
        if(ui.settingEndValue) ui.settingEndValue.addEventListener('change', broadcastConfig);

        if(ui.btnAddCustomCat) ui.btnAddCustomCat.addEventListener('click', () => {
            const val = ui.customCatInput.value.trim();
            if (val) {
                const id = 'custom_' + Date.now();
                const label = document.createElement('label');
                label.className = 'cat-checkbox';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = id;
                checkbox.dataset.name = val;
                checkbox.checked = true;
                checkbox.addEventListener('change', broadcastConfig);

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(' ' + val));
                if(ui.categorySelection) ui.categorySelection.appendChild(label);

                ui.customCatInput.value = '';
                broadcastConfig();
            }
        });
    }

    function updateClientLobbyPreview() {
        if (!ui.clientCatsPreview) return;
        ui.clientCatsPreview.innerHTML = '';

        const strong = document.createElement('strong');
        strong.textContent = `Kategoriler (${gameConfig.categories.length}):`;

        const br = document.createElement('br');

        const list = document.createTextNode(' ' + gameConfig.categories.map(c => c.name).join(', '));

        ui.clientCatsPreview.appendChild(strong);
        ui.clientCatsPreview.appendChild(br);
        ui.clientCatsPreview.appendChild(list);
    }

    // --- Gameplay Mechanics ---
    const alphabet = "A B C Ç D E F G H I İ J K L M N O Ö P R S Ş T U Ü V Y Z".split(" ");
    let currentTimer = null;
    let roundTimeout = null;
    let finishedPlayers = new Set();
    let isRoundOver = false;

    function getRandomLetter() {
        // Uniform crypto random
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        // Map perfectly if it's a power of 2, otherwise modulo with minimal bias
        return alphabet[array[0] % alphabet.length];
    }

    function switchScreen(screenId) {
        ['lobby-screen', 'game-screen', 'voting-screen', 'score-screen'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.classList.remove('active');
                el.classList.add('hidden');
            }
        });
        const target = document.getElementById(screenId);
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }
    }

    function generateGameInputs(categories) {
        if(!ui.gameInputsContainer) return;
        ui.gameInputsContainer.innerHTML = '';
        categories.forEach(cat => {
            const wrapper = document.createElement('div');
            wrapper.className = 'game-input-wrapper';

            const label = document.createElement('label');
            label.textContent = cat.name;
            label.setAttribute('for', 'input-' + cat.id);

            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'input-' + cat.id;
            input.dataset.catId = cat.id;
            input.autocomplete = 'off';
            input.spellcheck = false;

            // Auto-capitalize first letter locally
            input.addEventListener('input', (e) => {
                let val = e.target.value;
                if (val.length > 0) {
                    e.target.value = val.charAt(0).toLocaleUpperCase('tr-TR') + val.slice(1);
                }
            });

            wrapper.appendChild(label);
            wrapper.appendChild(input);
            ui.gameInputsContainer.appendChild(wrapper);
        });
    }

    function startRound(config, roundNum, letter) {
        gameConfig = config;
        gameState.round = roundNum;
        gameState.letter = letter;
        gameState.status = 'PLAYING';
        isRoundOver = false;
        finishedPlayers.clear();

        if(ui.currentRound) ui.currentRound.textContent = roundNum;
        if(ui.totalRounds) ui.totalRounds.textContent = config.rounds;
        if(ui.currentLetter) ui.currentLetter.textContent = letter;
        if(ui.finishStatusText) ui.finishStatusText.textContent = '';
        if(ui.timerDisplay) {
            if (config.endCondition === 'all_finish') {
                ui.timerDisplay.textContent = '∞';
            } else {
                ui.timerDisplay.textContent = '--:--';
            }
        }

        if(ui.timerStatusText) {
            if (config.endCondition === 'first_finish') {
                ui.timerStatusText.style.display = 'block';
                ui.timerStatusText.textContent = 'Henüz bitiren olmadı';
            } else {
                ui.timerStatusText.style.display = 'none';
            }
        }

        generateGameInputs(config.categories);
        switchScreen('game-screen');

        if(ui.btnFinishTurn) {
            ui.btnFinishTurn.disabled = false;
            ui.btnFinishTurn.classList.add('pulse');
        }

        document.querySelectorAll('.game-input-wrapper input').forEach(input => {
            input.disabled = false;
            input.value = '';
        });

        if (isHost) {
            if (config.endCondition === 'time_limit') {
                startHostTimer(config.endValue);
            }
        }
    }

    function startHostTimer(seconds) {
        if (!isHost) return;

        const endTime = Date.now() + (seconds * 1000);

        network.broadcast({
            type: 'TIMER_SYNC',
            endTime: endTime
        });

        clearInterval(currentTimer);
        updateTimerDisplay(seconds); // Immediate update
        currentTimer = setInterval(() => {
            const left = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
            updateTimerDisplay(left);

            if (left <= 0) {
                clearInterval(currentTimer);
                endRound();
            }
        }, 1000);
    }

    function updateTimerDisplay(secondsLeft) {
        if(!ui.timerDisplay) return;
        const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
        const s = (secondsLeft % 60).toString().padStart(2, '0');
        ui.timerDisplay.textContent = `${m}:${s}`;

        if (ui.timerStatusText && gameConfig.endCondition === 'first_finish') {
            ui.timerStatusText.textContent = 'Süre başladı!';
        }
    }

    function getPlayerAnswers() {
        const answers = {};
        document.querySelectorAll('.game-input-wrapper input').forEach(input => {
            answers[input.dataset.catId] = input.value.trim().toLocaleLowerCase('tr-TR');
        });
        return answers;
    }

    // --- Interactions ---
    switchScreen('lobby-screen');

    if (isHost) {
        if(ui.btnStartGame) {
            ui.btnStartGame.addEventListener('click', () => {
                updateLocalConfig();
                if (gameConfig.categories.length === 0) {
                    alert("Lütfen en az bir kategori seçin.");
                    return;
                }

                const letter = getRandomLetter();
                network.broadcast({
                    type: 'START_ROUND',
                    config: gameConfig,
                    round: 1,
                    letter: letter
                });
                startRound(gameConfig, 1, letter);
            });
        }

        if(ui.btnChangeLetter) {
            ui.btnChangeLetter.addEventListener('click', () => {
                if (gameState.status !== 'PLAYING') return;
                const newLetter = getRandomLetter();
                network.broadcast({ type: 'CHANGE_LETTER', letter: newLetter });

                // Also update self
                gameState.letter = newLetter;
                if(ui.currentLetter) ui.currentLetter.textContent = newLetter;
                document.querySelectorAll('.game-input-wrapper input').forEach(input => {
                    input.value = '';
                });
            });
        }
    }

    if(ui.btnFinishTurn) {
        ui.btnFinishTurn.addEventListener('click', () => {
            if (isRoundOver) return;

            ui.btnFinishTurn.disabled = true;
            ui.btnFinishTurn.classList.remove('pulse');
            if(ui.finishStatusText) ui.finishStatusText.textContent = 'Cevaplar gönderildi, diğerleri bekleniyor...';

            document.querySelectorAll('.game-input-wrapper input').forEach(input => {
                input.disabled = true;
            });

            const myAnswers = getPlayerAnswers();

            network.sendToHost({
                type: 'PLAYER_FINISHED',
                id: network.myId,
                answers: myAnswers
            });
        });
    }

    // Handle Network logic for gameplay
    const _handleNetworkData = network.handleData.bind(network);
    network.handleData = function(senderId, data) {
        _handleNetworkData(senderId, data); // Call original

        if (data.type === 'START_ROUND') {
            if (!isHost) startRound(data.config, data.round, data.letter);
        }
        else if (data.type === 'CHANGE_LETTER') {
            if (!isHost) {
                gameState.letter = data.letter;
                if(ui.currentLetter) ui.currentLetter.textContent = data.letter;
                document.querySelectorAll('.game-input-wrapper input').forEach(input => {
                    input.value = '';
                });
            }
        }
        else if (data.type === 'TIMER_SYNC') {
            if (!isHost) {
                clearInterval(currentTimer);
                if (gameConfig.endCondition === 'first_finish' && ui.timerStatusText) {
                    ui.timerStatusText.style.display = 'block';
                    ui.timerStatusText.textContent = 'Süre başladı!';
                }
                const initialLeft = Math.max(0, Math.floor((data.endTime - Date.now()) / 1000));
                updateTimerDisplay(initialLeft); // Immediate update
                currentTimer = setInterval(() => {
                    const left = Math.max(0, Math.floor((data.endTime - Date.now()) / 1000));
                    updateTimerDisplay(left);
                    if (left <= 0) clearInterval(currentTimer);
                }, 1000);
            }
        }
        else if (data.type === 'PLAYER_FINISHED' && isHost) {
            finishedPlayers.add(data.id);
            gameState.playerAnswers[data.id] = data.answers;

            const totalPlayers = Object.keys(network.players).length;
            const finishedCount = finishedPlayers.size;

            if (gameConfig.endCondition === 'all_finish') {
                if (finishedCount >= gameConfig.endValue || finishedCount >= totalPlayers) {
                    endRound();
                }
            }
            else if (gameConfig.endCondition === 'first_finish') {
                if (finishedCount === 1) {
                    startHostTimer(gameConfig.endValue);
                } else if (finishedCount >= totalPlayers) {
                    endRound();
                }
            }
        }
        else if (data.type === 'END_ROUND') {
            if (!isHost) {
                isRoundOver = true;
                clearInterval(currentTimer);

                // If I haven't clicked finish, send my answers now
                if (ui.btnFinishTurn && !ui.btnFinishTurn.disabled) {
                    const myAnswers = getPlayerAnswers();
                    network.sendToHost({
                        type: 'FINAL_ANSWERS',
                        id: network.myId,
                        answers: myAnswers
                    });
                }
            }
        }
        else if (data.type === 'FINAL_ANSWERS' && isHost) {
             gameState.playerAnswers[data.id] = data.answers;
        }
    };

    function endRound() {
        if (!isHost || isRoundOver) return;
        isRoundOver = true;
        clearInterval(currentTimer);

        // Host needs to submit their own answers if they haven't manually clicked finish
        if (ui.btnFinishTurn && !ui.btnFinishTurn.disabled) {
            ui.btnFinishTurn.disabled = true;
            gameState.playerAnswers[network.myId] = getPlayerAnswers();
            finishedPlayers.add(network.myId);
        }

        // Force anyone who hasn't submitted to submit
        network.broadcast({ type: 'END_ROUND' });

        // Wait a small buffer to collect late answers
        setTimeout(() => {
            processAnswersAndGoToVoting();
        }, 1500);
    }

    // --- Validation and Voting Logic ---
    let validationCache = {};
    let clientVotes = {};
    let liveVotes = {}; // Host stores: { catId: { targetPlayerId: { voterId: voteValue } } }
    let hasVoted = false;
    let receivedVotes = 0;
    let currentResultsData = null;

    async function loadDictionary(catId) {
        if (validationCache[catId]) return validationCache[catId];

        try {
            const response = await fetch(`data/${catId}.json`);
            if (response.ok) {
                const arr = await response.json();
                validationCache[catId] = new Set(arr.map(w => w.toLocaleLowerCase('tr-TR')));
            } else {
                validationCache[catId] = new Set();
            }
        } catch (e) {
            console.warn(`Dictionary not found for ${catId}, fallback to empty.`);
            validationCache[catId] = new Set();
        }
        return validationCache[catId];
    }

    async function processAnswersAndGoToVoting() {
        if (!isHost) return;

        const results = {}; // categoryId -> [ {playerId, word, suggestedScore} ]

        for (const cat of gameConfig.categories) {
            results[cat.id] = [];

            const dict = await loadDictionary(cat.id);
            const wordFrequency = {}; // word -> count

            // First pass: collect words and frequency
            for (const [playerId, answers] of Object.entries(gameState.playerAnswers)) {
                let word = answers[cat.id] || "";
                word = word.trim().toLocaleLowerCase('tr-TR');

                if (word.startsWith(gameState.letter.toLocaleLowerCase('tr-TR'))) {
                    wordFrequency[word] = (wordFrequency[word] || 0) + 1;
                }
            }

            // Second pass: assign scores
            for (const [playerId, answers] of Object.entries(gameState.playerAnswers)) {
                let word = answers[cat.id] || "";
                word = word.trim().toLocaleLowerCase('tr-TR');
                let score = 0;

                if (word.length > 0 && word.startsWith(gameState.letter.toLocaleLowerCase('tr-TR'))) {
                    const isCustomCat = cat.id.startsWith('custom_');
                    const isValidInDict = dict.has(word);

                    if (isCustomCat || isValidInDict) {
                        if (wordFrequency[word] > 1) {
                            score = 5; // Duplicate
                        } else {
                            score = 10; // Unique
                        }
                    } else {
                        score = 0; // Not in dictionary
                    }
                }

                results[cat.id].push({
                    playerId: playerId,
                    word: word,
                    suggestedScore: score
                });
            }
        }

        network.broadcast({
            type: 'START_VOTING',
            results: results,
            config: gameConfig
        });

        initVotingSession(results);
    }

    // Capture NETWORK_START_VOTING in handleData
    const _handleDataVoting = network.handleData;
    network.handleData = function(senderId, data) {
        _handleDataVoting.call(network, senderId, data);

        if (data.type === 'START_VOTING') {
            if (!isHost) {
                initVotingSession(data.results);
            }
        } else if (data.type === 'SINGLE_VOTE') {
            if (isHost) {
                handleLiveVote(senderId, data.catId, data.targetPlayerId, data.val);
            }
        } else if (data.type === 'SYNC_LIVE_VOTES') {
            updateLiveVoteUI(data.aggregatedVotes);
        } else if (data.type === 'FINISH_VOTING') {
            if (isHost) {
                handlePlayerFinishedVoting(senderId);
            }
        } else if (data.type === 'SHOW_SCORES') {
            if (!isHost) {
                renderScoreboard(data.scores);
            }
        }
    };

    function initVotingSession(results) {
        currentResultsData = results;
        clientVotes = {};
        hasVoted = false;

        if (isHost) {
            liveVotes = {};
            receivedVotes = 0;
        }

        // Initialize default votes as suggested scores
        gameConfig.categories.forEach(cat => {
            if (!results[cat.id]) return;
            clientVotes[cat.id] = {};

            if (isHost) liveVotes[cat.id] = {};

            results[cat.id].forEach(res => {
                if (!res.word) return;
                clientVotes[cat.id][res.playerId] = res.suggestedScore;

                if (isHost) {
                    liveVotes[cat.id][res.playerId] = {};
                }
            });
        });

        // Let the host auto-populate initial recommended scores for everyone
        if (isHost) {
            for (const catId in liveVotes) {
                for (const targetId in liveVotes[catId]) {
                    const suggested = results[catId].find(r => r.playerId === targetId).suggestedScore;
                    for (const pId in network.players) {
                        liveVotes[catId][targetId][pId] = suggested;
                    }
                }
            }
            broadcastLiveVotes();
        }

        renderVotingScreen(results);
    }

    function renderVotingScreen(results) {
        switchScreen('voting-screen');
        if(ui.votingContainer) ui.votingContainer.innerHTML = '';
        if(ui.btnSubmitVotes) ui.btnSubmitVotes.disabled = false;
        if(ui.btnBypassVotes) ui.btnBypassVotes.disabled = false;
        if(ui.votingStatusText) ui.votingStatusText.textContent = '';

        gameConfig.categories.forEach(cat => {
            if (!results[cat.id]) return;

            const catBlock = document.createElement('div');
            catBlock.className = 'vote-category-block';

            const title = document.createElement('h3');
            title.className = 'vote-category-title';
            title.textContent = cat.name;
            catBlock.appendChild(title);

            results[cat.id].forEach(res => {
                if (!res.word) return;

                const item = document.createElement('div');
                item.className = 'vote-item';

                const info = document.createElement('div');
                info.className = 'vote-info';

                const playerName = network.players[res.playerId] ? network.players[res.playerId].name : 'Bilinmiyor';
                const formattedWord = res.word.charAt(0).toLocaleUpperCase('tr-TR') + res.word.slice(1);

                const playerDiv = document.createElement('div');
                playerDiv.className = 'vote-player';
                playerDiv.textContent = playerName;

                const wordDiv = document.createElement('div');
                wordDiv.className = 'vote-word';
                wordDiv.textContent = formattedWord;

                const suggestedDiv = document.createElement('div');
                suggestedDiv.className = 'vote-suggested';
                suggestedDiv.style.color = 'var(--warning)';
                suggestedDiv.style.fontSize = '0.9rem';
                suggestedDiv.textContent = `Önerilen: ${res.suggestedScore} Puan`;

                // Live vote display area
                const liveCountDiv = document.createElement('div');
                liveCountDiv.className = 'vote-counts-display';
                liveCountDiv.id = `live-counts-${cat.id}-${res.playerId}`;
                liveCountDiv.innerHTML = `
                    <span class="vote-count-pill" style="border-color: var(--success); color: var(--success);">10: <span>0</span></span>
                    <span class="vote-count-pill" style="border-color: var(--warning); color: var(--warning);">5: <span>0</span></span>
                    <span class="vote-count-pill" style="border-color: var(--danger); color: var(--danger);">0: <span>0</span></span>
                `;

                info.appendChild(playerDiv);
                info.appendChild(wordDiv);
                info.appendChild(suggestedDiv);
                info.appendChild(liveCountDiv);

                const controls = document.createElement('div');
                controls.className = 'vote-controls';

                [10, 5, 0].forEach(val => {
                    const btn = document.createElement('button');
                    btn.className = `vote-btn ${res.suggestedScore === val ? 'selected' : ''}`;
                    btn.dataset.val = val;
                    btn.textContent = val;

                    btn.addEventListener('click', () => {
                        controls.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        clientVotes[cat.id][res.playerId] = val;

                        // Send single vote live
                        network.sendToHost({
                            type: 'SINGLE_VOTE',
                            catId: cat.id,
                            targetPlayerId: res.playerId,
                            val: val
                        });
                    });

                    controls.appendChild(btn);
                });

                item.appendChild(info);
                item.appendChild(controls);
                catBlock.appendChild(item);
            });

            if (results[cat.id].filter(r => r.word).length > 0) {
                if(ui.votingContainer) ui.votingContainer.appendChild(catBlock);
            } else {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'text-muted';
                emptyMsg.textContent = 'Bu kategoriye kimse cevap veremedi.';
                catBlock.appendChild(emptyMsg);
                if(ui.votingContainer) ui.votingContainer.appendChild(catBlock);
            }
        });
    }

    function handleLiveVote(voterId, catId, targetPlayerId, val) {
        if (!isHost) return;
        if (!liveVotes[catId]) liveVotes[catId] = {};
        if (!liveVotes[catId][targetPlayerId]) liveVotes[catId][targetPlayerId] = {};

        liveVotes[catId][targetPlayerId][voterId] = val;
        broadcastLiveVotes();
    }

    function broadcastLiveVotes() {
        if (!isHost) return;

        const aggregated = {}; // catId -> targetPlayerId -> { 10: x, 5: y, 0: z }

        for (const catId in liveVotes) {
            aggregated[catId] = {};
            for (const targetId in liveVotes[catId]) {
                aggregated[catId][targetId] = { 10: 0, 5: 0, 0: 0 };
                for (const voterId in liveVotes[catId][targetId]) {
                    const v = liveVotes[catId][targetId][voterId];
                    if (aggregated[catId][targetId][v] !== undefined) {
                        aggregated[catId][targetId][v]++;
                    }
                }
            }
        }

        network.broadcast({ type: 'SYNC_LIVE_VOTES', aggregatedVotes: aggregated });
        updateLiveVoteUI(aggregated);
    }

    function updateLiveVoteUI(aggregated) {
        for (const catId in aggregated) {
            for (const targetId in aggregated[catId]) {
                const el = document.getElementById(`live-counts-${catId}-${targetId}`);
                if (el) {
                    const counts = aggregated[catId][targetId];
                    const pills = el.querySelectorAll('.vote-count-pill span');
                    if (pills.length === 3) {
                        pills[0].textContent = counts[10]; // 10 votes
                        pills[1].textContent = counts[5];  // 5 votes
                        pills[2].textContent = counts[0];  // 0 votes
                    }
                }
            }
        }
    }

    if(ui.btnSubmitVotes) ui.btnSubmitVotes.addEventListener('click', submitFinalVotes);
    if(ui.btnBypassVotes) ui.btnBypassVotes.addEventListener('click', submitFinalVotes);

    function submitFinalVotes() {
        if (hasVoted) return;
        hasVoted = true;

        if(ui.btnSubmitVotes) ui.btnSubmitVotes.disabled = true;
        if(ui.btnBypassVotes) ui.btnBypassVotes.disabled = true;
        if(ui.votingStatusText) ui.votingStatusText.textContent = 'Karar gönderildi, diğer oyuncular bekleniyor...';

        network.sendToHost({
            type: 'FINISH_VOTING',
            id: network.myId
        });
    }

    function handlePlayerFinishedVoting(senderId) {
        if (!isHost) return;

        receivedVotes++;
        const totalPlayers = Object.keys(network.players).length;
        if (receivedVotes >= totalPlayers) {
            resolveVotesAndScore();
        }
    }

    function resolveVotesAndScore() {
        if (!isHost) return;

        const voteAggregator = {};
        for (const catId in liveVotes) {
            voteAggregator[catId] = {};
            for (const targetId in liveVotes[catId]) {
                voteAggregator[catId][targetId] = { 10: 0, 5: 0, 0: 0 };
                for (const voterId in liveVotes[catId][targetId]) {
                    const v = liveVotes[catId][targetId][voterId];
                    voteAggregator[catId][targetId][v]++;
                }
            }
        }

        const finalScores = {};

        for (const pId in network.players) {
            finalScores[pId] = {
                id: pId,
                name: network.players[pId].name,
                roundScore: 0,
                totalScore: network.players[pId].score || 0
            };
        }

        for (const catId in voteAggregator) {
            for (const targetPlayerId in voteAggregator[catId]) {
                const counts = voteAggregator[catId][targetPlayerId];

                let maxCount = -1;
                let finalVote = 0;

                for (const val of [10, 5, 0]) {
                    if (counts[val] > maxCount) {
                        maxCount = counts[val];
                        finalVote = val;
                    }
                }

                if (finalScores[targetPlayerId]) {
                    finalScores[targetPlayerId].roundScore += finalVote;
                }
            }
        }

        for (const pId in finalScores) {
            finalScores[pId].totalScore += finalScores[pId].roundScore;
            network.players[pId].score = finalScores[pId].totalScore;
        }

        network.broadcast({
            type: 'SHOW_SCORES',
            scores: finalScores
        });

        renderScoreboard(finalScores);

        // Reset state
        receivedVotes = 0;
        liveVotes = {};
        gameState.playerAnswers = {};
    }

    // --- Scoreboard and Match Flow ---
    function renderScoreboard(scores) {
        switchScreen('score-screen');
        if(ui.scoreboardBody) ui.scoreboardBody.innerHTML = '';

        const sorted = Object.values(scores).sort((a, b) => b.totalScore - a.totalScore);

        sorted.forEach((scoreObj, index) => {
            const tr = document.createElement('tr');

            const tdIndex = document.createElement('td');
            tdIndex.textContent = index + 1;

            const tdName = document.createElement('td');
            tdName.textContent = scoreObj.name + (scoreObj.id === network.myId ? ' (Sen)' : '');

            const tdRound = document.createElement('td');
            tdRound.textContent = '+' + scoreObj.roundScore;

            const tdTotal = document.createElement('td');
            const strong = document.createElement('strong');
            strong.textContent = scoreObj.totalScore;
            tdTotal.appendChild(strong);

            tr.appendChild(tdIndex);
            tr.appendChild(tdName);
            tr.appendChild(tdRound);
            tr.appendChild(tdTotal);

            if(ui.scoreboardBody) ui.scoreboardBody.appendChild(tr);
        });

        if (isHost) {
            if(ui.btnNextRound) {
                ui.btnNextRound.classList.remove('hidden');
                if (gameState.round >= gameConfig.rounds) {
                    ui.btnNextRound.textContent = 'Oyunu Bitir';
                    if(ui.extendGameGroup) ui.extendGameGroup.classList.remove('hidden');
                } else {
                    ui.btnNextRound.textContent = 'Sonraki Tura Geç';
                    if(ui.extendGameGroup) ui.extendGameGroup.classList.add('hidden');
                }
            }
        }
    }

    if (isHost) {
        if(ui.btnNextRound) {
            ui.btnNextRound.addEventListener('click', () => {
                if (gameState.round >= gameConfig.rounds) {
                    network.broadcast({ type: 'BACK_TO_LOBBY' });
                    backToLobby();
                } else {
                    const letter = getRandomLetter();
                    gameState.round++;
                    network.broadcast({
                        type: 'START_ROUND',
                        config: gameConfig,
                        round: gameState.round,
                        letter: letter
                    });
                    startRound(gameConfig, gameState.round, letter);
                }
            });
        }

        if(ui.btnExtendGame) {
            ui.btnExtendGame.addEventListener('click', () => {
                const extendInput = document.getElementById('extend-rounds-input');
                const extra = parseInt(extendInput ? extendInput.value : 1, 10) || 1;
                gameConfig.rounds += extra;

                if(ui.extendGameGroup) ui.extendGameGroup.classList.add('hidden');
                if(ui.btnNextRound) ui.btnNextRound.textContent = 'Sonraki Tura Geç';

                network.broadcast({
                    type: 'CONFIG_UPDATE',
                    config: gameConfig
                });

                const letter = getRandomLetter();
                gameState.round++;
                network.broadcast({
                    type: 'START_ROUND',
                    config: gameConfig,
                    round: gameState.round,
                    letter: letter
                });
                startRound(gameConfig, gameState.round, letter);
            });
        }
    }

    const _handleDataFlow = network.handleData;
    network.handleData = function(senderId, data) {
        _handleDataFlow.call(network, senderId, data);
        if (data.type === 'BACK_TO_LOBBY' && !isHost) {
            backToLobby();
        }
    };

    function backToLobby() {
        gameState.status = 'LOBBY';
        gameState.round = 1;
        gameState.playerAnswers = {};

        for (const pId in network.players) {
            network.players[pId].score = 0;
        }

        switchScreen('lobby-screen');
    }

});
