/**
 * Main Application Logic
 * Integrates Network, UI, and Game State.
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- Session Setup ---
    const isHost = sessionStorage.getItem('isHost') === 'true';
    const roomCode = sessionStorage.getItem('roomCode');
    const username = sessionStorage.getItem('username');

    if (!roomCode || !username) {
        window.location.href = 'index.html';
        return;
    }

    // --- UI Elements ---
    const ui = {
        roomCodeTxt: document.getElementById('room-code-txt'),
        networkStatus: document.getElementById('network-status'),
        playerNameDisplay: document.getElementById('player-name-display'),
        playerCount: document.getElementById('player-count'),
        playerList: document.getElementById('player-list'),
        leaveBtn: document.getElementById('leave-btn'),

        // Screens
        lobbyScreen: document.getElementById('lobby-screen'),
        gameScreen: document.getElementById('game-screen'),
        votingScreen: document.getElementById('voting-screen'),
        scoreScreen: document.getElementById('score-screen'),

        // Host Controls
        hostControls: document.getElementById('host-controls'),
        clientWaiting: document.getElementById('client-waiting'),
        hostNameDisplay: document.getElementById('host-name-display'),
        clientCatsPreview: document.getElementById('client-cats-preview'),
        startGameBtn: document.getElementById('start-game-btn'),
        settingRounds: document.getElementById('setting-rounds'),
        settingEndCondition: document.getElementById('setting-end-condition'),
        settingEndValueGroup: document.getElementById('setting-end-value-group'),
        settingEndValue: document.getElementById('setting-end-value'),
        categoryGrid: document.getElementById('category-selection-grid'),
        customCatInput: document.getElementById('custom-cat-input'),
        addCustomCatBtn: document.getElementById('add-custom-cat-btn'),

        // Gameplay Elements
        currentLetter: document.getElementById('current-letter'),
        changeLetterBtn: document.getElementById('change-letter-btn'),
        timeLeft: document.getElementById('time-left'),
        gameInputsContainer: document.getElementById('game-inputs-container'),
        finishTurnBtn: document.getElementById('finish-turn-btn'),
        finishStatusText: document.getElementById('finish-status-text'),
        currentRound: document.getElementById('current-round'),
        totalRounds: document.getElementById('total-rounds'),

        // Voting & Scoreboard fixes
        votingContainer: document.getElementById('voting-container'),
        submitVotesBtn: document.getElementById('submit-votes-btn'),
        bypassVotesBtn: document.getElementById('bypass-votes-btn'),
        votingStatusText: document.getElementById('voting-status-text'),
        scoreboardBody: document.getElementById('scoreboard-body'),
        nextRoundBtn: document.getElementById('next-round-btn'),
        extendGameGroup: document.getElementById('extend-game-group')
    };

    // Initialize UI Text
    ui.roomCodeTxt.textContent = roomCode;
    ui.playerNameDisplay.textContent = username;

    if (isHost) {
        ui.hostControls.classList.remove('hidden');
        ui.clientWaiting.classList.add('hidden');
        document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.client-only').forEach(el => el.classList.add('hidden'));
    }

    // --- Default Categories List ---
    const defaultCategories = [
        { id: 'isim', name: 'İsim' },
        { id: 'sehir', name: 'Şehir' },
        { id: 'hayvan', name: 'Hayvan' },
        { id: 'bitki', name: 'Bitki' },
        { id: 'esya', name: 'Eşya' },
        { id: 'ulke', name: 'Ülke' },
        { id: 'baskent', name: 'Başkent' },
        { id: 'unlu', name: 'Ünlü' },
        { id: 'meslek', name: 'Meslek' },
        { id: 'renk', name: 'Renk' },
        { id: 'film_dizi', name: 'Film/Dizi' },
        { id: 'marka', name: 'Marka' },
        { id: 'yiyecek', name: 'Yiyecek' },
        { id: 'oyun', name: 'Oyun' },
        { id: 'muzik', name: 'Müzik' }
    ];

    let gameConfig = {
        rounds: 3,
        endCondition: 'first_finish', // first_finish, time_limit, all_finish
        endValue: 15, // seconds or count
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
        ui.playerList.innerHTML = '';
        let count = 0;
        let hostName = 'Kurucu';

        for (const [id, p] of Object.entries(network.players)) {
            count++;
            const li = document.createElement('li');
            if (p.isHost) {
                li.classList.add('is-host');
                hostName = p.name;
            }
            if (id === network.myId) {
                const strong = document.createElement('strong');
                strong.textContent = `${p.name} (Sen)`;
                li.appendChild(strong);
            } else {
                li.textContent = p.name;
            }
            ui.playerList.appendChild(li);
        }
        ui.playerCount.textContent = count;
        if (ui.hostNameDisplay) ui.hostNameDisplay.textContent = hostName;
    }

    function handleNetworkError(err) {
        ui.networkStatus.classList.add('disconnected');
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
            case 'START_GAME':
                // Transition to game screen
                break;
            // ... more to come
        }
    }

    // --- Lobby UI Logic ---
    function renderCategories() {
        ui.categoryGrid.innerHTML = '';
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
            ui.categoryGrid.appendChild(label);
        });
        updateLocalConfig();
    }

    function updateLocalConfig() {
        if (!isHost) return;
        gameConfig.rounds = parseInt(ui.settingRounds.value, 10) || 3;
        gameConfig.endCondition = ui.settingEndCondition.value;
        gameConfig.endValue = parseInt(ui.settingEndValue.value, 10) || 15;

        const selected = Array.from(ui.categoryGrid.querySelectorAll('input:checked'));
        gameConfig.categories = selected.map(cb => ({
            id: cb.value,
            name: cb.dataset.name
        }));
    }

    function broadcastConfig() {
        if (!isHost) return;
        updateLocalConfig();
        network.broadcast({ type: 'CONFIG_UPDATE', config: gameConfig });
    }

    if (isHost) {
        renderCategories();

        ui.settingRounds.addEventListener('change', broadcastConfig);
        ui.settingEndCondition.addEventListener('change', (e) => {
            if (e.target.value === 'all_finish') {
                document.getElementById('setting-end-label').textContent = 'Kişi Sayısı (X):';
                ui.settingEndValue.value = Math.max(1, Object.keys(network.players).length - 1);
            } else {
                document.getElementById('setting-end-label').textContent = 'Saniye (X):';
            }
            broadcastConfig();
        });
        ui.settingEndValue.addEventListener('change', broadcastConfig);

        ui.addCustomCatBtn.addEventListener('click', () => {
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
                ui.categoryGrid.appendChild(label);

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

    ui.leaveBtn.addEventListener('click', () => {
        network.disconnect();
        window.location.href = 'index.html';
    });

    // --- Gameplay Mechanics ---
    const alphabet = "A B C Ç D E F G H I İ J K L M N O Ö P R S Ş T U Ü V Y Z".split(" ");
    let currentTimer = null;
    let roundTimeout = null;
    let finishedPlayers = new Set();
    let isRoundOver = false;

    function getRandomLetter() {
        return alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    function switchScreen(screenId) {
        ['lobby-screen', 'game-screen', 'voting-screen', 'score-screen'].forEach(id => {
            document.getElementById(id).classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    function generateGameInputs(categories) {
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

        ui.currentRound.textContent = roundNum;
        ui.totalRounds.textContent = config.rounds;
        ui.currentLetter.textContent = letter;
        ui.finishStatusText.textContent = '';
        ui.timeLeft.textContent = '--:--';

        generateGameInputs(config.categories);
        switchScreen('game-screen');

        ui.finishTurnBtn.disabled = false;
        ui.finishTurnBtn.classList.add('pulse');
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
        const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
        const s = (secondsLeft % 60).toString().padStart(2, '0');
        ui.timeLeft.textContent = `${m}:${s}`;
    }

    function getPlayerAnswers() {
        const answers = {};
        document.querySelectorAll('.game-input-wrapper input').forEach(input => {
            answers[input.dataset.catId] = input.value.trim().toLocaleLowerCase('tr-TR');
        });
        return answers;
    }

    // --- Interactions ---
    if (isHost) {
        ui.startGameBtn.addEventListener('click', () => {
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

        ui.changeLetterBtn.addEventListener('click', () => {
            if (gameState.status !== 'PLAYING') return;
            const newLetter = getRandomLetter();
            network.broadcast({ type: 'CHANGE_LETTER', letter: newLetter });

            // Also update self
            gameState.letter = newLetter;
            ui.currentLetter.textContent = newLetter;
        });
    }

    ui.finishTurnBtn.addEventListener('click', () => {
        if (isRoundOver) return;

        ui.finishTurnBtn.disabled = true;
        ui.finishTurnBtn.classList.remove('pulse');
        ui.finishStatusText.textContent = 'Cevaplar gönderildi, diğerleri bekleniyor...';

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
                ui.currentLetter.textContent = data.letter;
            }
        }
        else if (data.type === 'TIMER_SYNC') {
            if (!isHost) {
                clearInterval(currentTimer);
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
                if (!ui.finishTurnBtn.disabled) {
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
        if (!ui.finishTurnBtn.disabled) {
            ui.finishTurnBtn.disabled = true;
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
    let currentVotes = {}; // { catId: { playerId: voteValue } }
    let hasVoted = false;

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

        renderVotingScreen(results);
    }

    // --- Live Voting Data ---
    // Instead of waiting for everyone to submit at the end, votes are tracked live.
    let currentResultsData = null; // Stored results for rendering
    let liveVotes = {}; // Host stores: { catId: { targetPlayerId: { voterId: voteValue } } }
    let clientVotes = {}; // Client stores locally: { catId: { targetPlayerId: voteValue } }

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
            // Everyone receives aggregated vote counts
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
            receivedVotes = 0; // Means "Number of players who clicked Submit"
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
                    // Initial host "vote" (not strictly required, but syncs default state)
                }
            });
        });

        // Let the host auto-populate initial recommended scores for everyone
        if (isHost) {
            for (const catId in liveVotes) {
                for (const targetId in liveVotes[catId]) {
                    const suggested = results[catId].find(r => r.playerId === targetId).suggestedScore;
                    // Pre-fill everyone's vote as suggested to start
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
        ui.votingContainer.innerHTML = '';
        ui.submitVotesBtn.disabled = false;
        ui.bypassVotesBtn.disabled = false;
        ui.votingStatusText.textContent = '';

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

                // Construct DOM elements to avoid XSS
                const playerDiv = document.createElement('div');
                playerDiv.className = 'vote-player';
                playerDiv.textContent = playerName;

                const wordDiv = document.createElement('div');
                wordDiv.className = 'vote-word';
                wordDiv.textContent = formattedWord;

                const suggestedDiv = document.createElement('div');
                suggestedDiv.className = 'vote-suggested';
                suggestedDiv.style.color = '#facc15';
                suggestedDiv.textContent = `Önerilen: ${res.suggestedScore} Puan`;

                // Live vote display area
                const liveCountDiv = document.createElement('div');
                liveCountDiv.className = 'vote-counts-display';
                liveCountDiv.id = `live-counts-${cat.id}-${res.playerId}`;
                liveCountDiv.innerHTML = `
                    <span class="vote-count-pill">10: <span>0</span></span>
                    <span class="vote-count-pill">5: <span>0</span></span>
                    <span class="vote-count-pill">0: <span>0</span></span>
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
                ui.votingContainer.appendChild(catBlock);
            } else {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'text-muted';
                emptyMsg.textContent = 'Bu kategoriye kimse cevap veremedi.';
                catBlock.appendChild(emptyMsg);
                ui.votingContainer.appendChild(catBlock);
            }
        });
    }

    // Host live vote handler
    function handleLiveVote(voterId, catId, targetPlayerId, val) {
        if (!isHost) return;
        if (!liveVotes[catId]) liveVotes[catId] = {};
        if (!liveVotes[catId][targetPlayerId]) liveVotes[catId][targetPlayerId] = {};

        liveVotes[catId][targetPlayerId][voterId] = val;

        // Debounce or just broadcast immediately
        broadcastLiveVotes();
    }

    function broadcastLiveVotes() {
        if (!isHost) return;

        // Aggregate
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
        // Update host self
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

    ui.submitVotesBtn.addEventListener('click', () => {
        submitFinalVotes();
    });

    ui.bypassVotesBtn.addEventListener('click', () => {
        submitFinalVotes();
    });

    function submitFinalVotes() {
        if (hasVoted) return;
        hasVoted = true;

        ui.submitVotesBtn.disabled = true;
        ui.bypassVotesBtn.disabled = true;
        ui.votingStatusText.textContent = 'Karar gönderildi, diğer oyuncular bekleniyor...';

        network.sendToHost({
            type: 'FINISH_VOTING',
            id: network.myId
        });
    }

    let receivedVotes = 0; // used to count who finished voting

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

        // Aggregate final votes from liveVotes
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

        // Calculate final scores based on majority vote

        // Calculate final scores based on majority vote
        const finalScores = {}; // playerId -> { roundScore: X, totalScore: Y }

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

                // Find majority vote
                let maxCount = -1;
                let finalVote = 0;

                // Tie-breaker: favors higher score if tied
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

        // Apply and broadcast
        for (const pId in finalScores) {
            finalScores[pId].totalScore += finalScores[pId].roundScore;
            network.players[pId].score = finalScores[pId].totalScore;
        }

        network.broadcast({
            type: 'SHOW_SCORES',
            scores: finalScores
        });

        renderScoreboard(finalScores);

        // Reset state for next round
        receivedVotes = 0;
        liveVotes = {};
        gameState.playerAnswers = {};
    }

    // --- Scoreboard and Match Flow ---
    function renderScoreboard(scores) {
        switchScreen('score-screen');
        ui.scoreboardBody.innerHTML = '';

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

            ui.scoreboardBody.appendChild(tr);
        });

        if (isHost) {
            ui.nextRoundBtn.classList.remove('hidden');
            if (gameState.round >= gameConfig.rounds) {
                ui.nextRoundBtn.textContent = 'Oyunu Bitir';
                ui.extendGameGroup.classList.remove('hidden');
            } else {
                ui.nextRoundBtn.textContent = 'Sonraki Tura Geç';
                ui.extendGameGroup.classList.add('hidden');
            }
        }
    }

    if (isHost) {
        ui.nextRoundBtn.addEventListener('click', () => {
            if (gameState.round >= gameConfig.rounds) {
                // Game completely over, go back to lobby
                network.broadcast({ type: 'BACK_TO_LOBBY' });
                backToLobby();
            } else {
                // Start next round
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

        document.getElementById('extend-game-btn').addEventListener('click', () => {
            const extra = parseInt(document.getElementById('extend-rounds-input').value, 10) || 1;
            gameConfig.rounds += extra;

            ui.extendGameGroup.classList.add('hidden');
            ui.nextRoundBtn.textContent = 'Sonraki Tura Geç';

            network.broadcast({
                type: 'CONFIG_UPDATE',
                config: gameConfig
            });

            // Start the next round immediately
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

        // Reset scores
        for (const pId in network.players) {
            network.players[pId].score = 0;
        }

        switchScreen('lobby-screen');
    }

});
