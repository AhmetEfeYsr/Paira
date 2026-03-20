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
        scoreScreen: document.getElementById('score-screen'),

        // Host Controls
        hostSettings: document.getElementById('host-settings'),
        clientWaiting: document.getElementById('client-waiting'),
        hostNameDisplay: document.getElementById('host-name-display'),
        clientCatsPreview: document.getElementById('client-cats-preview'),
        btnStartGame: document.getElementById('btn-start-game'),

        settingRounds: document.getElementById('setting-rounds'),
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
        currentCategoryName: document.getElementById('current-category-name'),
        playersCircle: document.getElementById('players-circle'),
        compactGameInput: document.getElementById('compact-game-input'),
        btnFinishTurn: document.getElementById('btn-finish-turn'),
        finishStatusText: document.getElementById('finish-status-text'),

        // Scoreboard
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
                        showToast('Oda kodu kopyalandı!', 'success');
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
        { id: 'spor', name: 'Spor' },
        { id: 'hastalik', name: 'Hastalık' },
        { id: 'yazar', name: 'Yazar' },
        { id: 'sarkici', name: 'Şarkıcı' }
    ];

    let gameConfig = {
        rounds: 3,
        endValue: 15, // seconds
        categories: []
    };

    let gameState = {
        status: 'LOBBY', // LOBBY, PLAYING, VOTING, SCORE
        round: 1,
        letter: '',
        currentCategory: null,
        currentPlayerIndex: 0,
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
                li.appendChild(document.createTextNode(displayName));
            }

            if(ui.playersList) ui.playersList.appendChild(li);
        }

        if(ui.playerCount) ui.playerCount.textContent = count;
        if(ui.hostNameDisplay) ui.hostNameDisplay.textContent = hostName;
    }

    function handleNetworkError(err) {
        showToast("Bağlantı koptu veya hata oluştu. Lütfen tekrar girin.", "error");
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
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
        gameConfig.endValue = parseInt(ui.settingEndValue.value, 10) || 15;

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
        if(ui.settingEndValue) ui.settingEndValue.addEventListener('change', broadcastConfig);

        if(ui.btnAddCustomCat) ui.btnAddCustomCat.addEventListener('click', () => {
            const val = ui.customCatInput.value.trim();
            if (val) {
                const id = 'custom_' + window.PairaTime.now();
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
        ['lobby-screen', 'game-screen', 'score-screen'].forEach(id => {
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

    function renderPlayersCircle() {
        if (!ui.playersCircle) return;
        ui.playersCircle.innerHTML = '';

        const totalPlayers = Object.keys(network.players).length;
        const playersArr = Object.values(network.players);

        // Circular positioning
        const rx = 40; // horizontal radius %
        const ry = 38; // vertical radius %
        const startAngle = 180; // Start at left (so 2 players sit left and right)

        playersArr.forEach((p, index) => {
            const node = document.createElement('div');

            const isActive = (index === gameState.currentPlayerIndex);
            node.className = `player-node ${isActive ? 'active-turn' : ''}`;

            // Calculate angle
            const angle = startAngle + (index * (360 / totalPlayers));
            const rad = angle * (Math.PI / 180);

            // Calculate x and y (0,0 is center)
            const x = Math.cos(rad) * rx;
            const y = Math.sin(rad) * ry;

            node.style.left = `calc(50% + ${x}%)`;
            node.style.top = `calc(50% + ${y}%)`;

            node.innerHTML = `
                <div class="node-avatar">👽</div>
                <div class="node-name">${p.name}</div>
                <div class="node-score">${p.score || 0}</div>
            `;

            ui.playersCircle.appendChild(node);
        });
    }

    function startTurn(config, roundNum, letter, category, playerIndex) {
        gameConfig = config;
        gameState.round = roundNum;
        gameState.letter = letter;
        gameState.currentCategory = category;
        gameState.currentPlayerIndex = playerIndex;
        gameState.status = 'PLAYING';
        isRoundOver = false;

        renderPlayersCircle();

        const playersArr = Object.values(network.players);
        const currentPlayer = playersArr[playerIndex];
        const isMyTurn = currentPlayer && currentPlayer.id === network.myId;

        if(ui.currentLetter) ui.currentLetter.textContent = letter;
        if(ui.currentCategoryName) ui.currentCategoryName.textContent = category.name;

        const turnIndicator = document.getElementById('turn-indicator-text');
        if (turnIndicator) {
            if (isMyTurn) {
                turnIndicator.textContent = "Senin Sıran!";
                turnIndicator.style.color = "var(--lilac)";
                turnIndicator.style.fontWeight = "bold";
            } else {
                turnIndicator.textContent = `Sıra: ${currentPlayer ? currentPlayer.name : 'Bekleniyor'}`;
                turnIndicator.style.color = "var(--text-main)";
                turnIndicator.style.fontWeight = "normal";
            }
        }

        if(ui.finishStatusText) ui.finishStatusText.textContent = '';
        if(ui.timerDisplay) {
            ui.timerDisplay.textContent = '--:--';
        }
        if(ui.timerStatusText) {
            ui.timerStatusText.style.display = 'none';
        }

        switchScreen('game-screen');

        if (ui.compactGameInput) {
            ui.compactGameInput.value = '';
            ui.compactGameInput.dataset.catId = category.id;
            ui.compactGameInput.disabled = !isMyTurn;

            // Auto-capitalize first letter locally
            ui.compactGameInput.oninput = (e) => {
                let val = e.target.value;
                if (val.length > 0) {
                    e.target.value = val.charAt(0).toLocaleUpperCase('tr-TR') + val.slice(1);
                }
            };

            if (isMyTurn) {
                setTimeout(() => ui.compactGameInput.focus(), 100);
            }
        }

        if(ui.btnFinishTurn) {
            ui.btnFinishTurn.disabled = !isMyTurn;
            if (isMyTurn) {
                ui.btnFinishTurn.classList.add('pulse');
                if(window.PairaAudio) window.PairaAudio.play('tick');
            } else {
                ui.btnFinishTurn.classList.remove('pulse');
            }
        }

        if (isHost) {
            startHostTimer(config.endValue);
        }
    }

    function startHostTimer(seconds) {
        if (!isHost) return;

        const endTime = window.PairaTime.now() + (seconds * 1000);

        network.broadcast({
            type: 'TIMER_SYNC',
            endTime: endTime
        });

        clearInterval(currentTimer);
        updateTimerDisplay(seconds); // Immediate update
        currentTimer = setInterval(() => {
            const left = Math.max(0, Math.floor((endTime - window.PairaTime.now()) / 1000));
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

        if (ui.timerStatusText) {
            ui.timerStatusText.textContent = 'Süre başladı!';
        }
    }

    function getPlayerAnswers() {
        const answers = {};
        if (ui.compactGameInput && ui.compactGameInput.dataset.catId) {
            answers[ui.compactGameInput.dataset.catId] = ui.compactGameInput.value.trim().toLocaleLowerCase('tr-TR');
        }
        return answers;
    }

    // --- Interactions ---
    switchScreen('lobby-screen');

    if (isHost) {
        if(ui.btnStartGame) {
            ui.btnStartGame.addEventListener('click', () => {
                updateLocalConfig();
                if (gameConfig.categories.length === 0) {
                    showToast("Lütfen en az bir kategori seçin.", "warning");
                    return;
                }

                const letter = getRandomLetter();
                const randomCategory = gameConfig.categories[Math.floor(Math.random() * gameConfig.categories.length)];

                // Set score to 0 for everyone
                for (const pId in network.players) {
                    network.players[pId].score = 0;
                }

                network.broadcast({
                    type: 'START_TURN',
                    config: gameConfig,
                    round: 1,
                    letter: letter,
                    category: randomCategory,
                    playerIndex: 0
                });
                startTurn(gameConfig, 1, letter, randomCategory, 0);
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
            if(ui.finishStatusText) ui.finishStatusText.textContent = 'Cevap gönderildi...';

            if (ui.compactGameInput) {
                ui.compactGameInput.disabled = true;
            }

            const myAnswers = getPlayerAnswers();

            network.sendToHost({
                type: 'PLAYER_FINISHED',
                id: network.myId,
                answers: myAnswers
            });
        });
    }

    const btnAppeal = document.getElementById('btn-appeal');
    if (btnAppeal) {
        btnAppeal.addEventListener('click', () => {
            btnAppeal.disabled = true;
            btnAppeal.textContent = 'İtiraz Edildi!';
            network.sendToHost({ type: 'APPEAL_REQUEST' });
        });
    }

    // Submit via Enter key
    if (ui.compactGameInput) {
        ui.compactGameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && ui.btnFinishTurn && !ui.btnFinishTurn.disabled) {
                e.preventDefault();
                ui.btnFinishTurn.click();
            }
        });
    }

    // Handle Network logic for gameplay
    const _handleNetworkData = network.handleData.bind(network);
    network.handleData = function(senderId, data) {
        _handleNetworkData(senderId, data); // Call original

        if (data.type === 'START_TURN') {
            if (!isHost) startTurn(data.config, data.round, data.letter, data.category, data.playerIndex);
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
                const initialLeft = Math.max(0, Math.floor((data.endTime - window.PairaTime.now()) / 1000));
                updateTimerDisplay(initialLeft); // Immediate update
                currentTimer = setInterval(() => {
                    const left = Math.max(0, Math.floor((data.endTime - window.PairaTime.now()) / 1000));
                    updateTimerDisplay(left);
                    if (left <= 0) clearInterval(currentTimer);
                }, 1000);
            }
        }
        else if (data.type === 'PLAYER_FINISHED' && isHost) {
            // In turn based, only the active player submits
            const activePlayerObj = Object.values(network.players)[gameState.currentPlayerIndex];
            if (activePlayerObj && activePlayerObj.id === data.id) {
                gameState.playerAnswers[data.id] = data.answers;
                if(window.PairaAudio) window.PairaAudio.play('pass');
                endRound(); // Which really ends the turn
            }
        }
        else if (data.type === 'END_ROUND') {
            if (!isHost) {
                isRoundOver = true;
                clearInterval(currentTimer);

                // If I am active and haven't finished, submit my text
                const activePlayerObj = Object.values(network.players)[gameState.currentPlayerIndex];
                const isMyTurn = activePlayerObj && activePlayerObj.id === network.myId;

                if (isMyTurn && ui.btnFinishTurn && !ui.btnFinishTurn.disabled) {
                    if (ui.compactGameInput) {
                        ui.compactGameInput.disabled = true;
                    }
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
            const activePlayerObj = Object.values(network.players)[gameState.currentPlayerIndex];
            if (activePlayerObj && activePlayerObj.id === data.id) {
                gameState.playerAnswers[data.id] = data.answers;
            }
        }
        else if (data.type === 'APPEAL_REQUEST' && isHost) {
            if (gameState.status === 'WAITING_APPEAL' && gameState.pendingNextTurn && gameState.pendingNextTurn.playerId === senderId) {
                clearTimeout(gameState.appealTimeout);
                gameState.status = 'VOTING';
                gameState.votes = { yes: 0, no: 0, votedPlayers: new Set() };
                
                const { word, category } = gameState.pendingNextTurn;
                
                network.broadcast({
                    type: 'START_VOTE',
                    word: word,
                    categoryName: category.name,
                    voterCount: Object.keys(network.players).length
                });
                
                startVoteHost();
            }
        }
        else if (data.type === 'VOTE' && isHost) {
            if (gameState.status === 'VOTING' && !gameState.votes.votedPlayers.has(senderId)) {
                gameState.votes.votedPlayers.add(senderId);
                if (data.vote === 'yes') gameState.votes.yes++;
                else gameState.votes.no++;
                
                network.broadcast({
                    type: 'VOTE_UPDATE',
                    yes: gameState.votes.yes,
                    no: gameState.votes.no
                });
                
                if (gameState.votes.votedPlayers.size >= Object.keys(network.players).length) {
                    endVoteHost();
                }
            }
        }
    };
    
    let voteTimer = null;
    function startVoteHost() {
        showVotingUI(gameState.pendingNextTurn.word, gameState.pendingNextTurn.category.name, true);
        
        let timeLeft = 10;
        clearInterval(voteTimer);
        voteTimer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                endVoteHost();
            }
        }, 1000);
    }
    
    function endVoteHost() {
        if (gameState.status !== 'VOTING') return;
        gameState.status = 'PLAYING';
        clearInterval(voteTimer);
        
        const { yes, no } = gameState.votes;
        const totalVotes = yes + no;
        const isAccepted = totalVotes > 0 && yes > totalVotes / 2;
        
        const { playerId, word } = gameState.pendingNextTurn;
        
        if (isAccepted) {
            const score = word.length;
            network.players[playerId].score += score;
            const finalScores = getFinalScores(playerId, score);
            
            network.broadcast({
                type: 'VOTE_RESULT',
                isAccepted: true,
                score: score,
                scores: finalScores,
                word: word,
                playerId: playerId
            });
            showTurnResult(word, score, playerId, false);
            if(window.PairaAudio) window.PairaAudio.play('correct');
        } else {
            network.broadcast({
                type: 'VOTE_RESULT',
                isAccepted: false,
                word: word
            });
            if(window.PairaAudio) window.PairaAudio.play('wrong');
        }
        
        const statusText = document.getElementById('voting-status-text');
        if (statusText) {
            if (isAccepted) {
                statusText.textContent = 'Oylama Sonucu: KABUL EDİLDİ!';
                statusText.style.color = 'var(--success)';
            } else {
                statusText.textContent = 'Oylama Sonucu: REDDEDİLDİ!';
                statusText.style.color = 'var(--danger)';
            }
        }
        
        setTimeout(() => {
            hideVotingUI();
            goToNextTurn();
        }, 2000);
    }

    let clientVoteTimer = null;
    function showVotingUI(word, categoryName, isHostCall) {
        const overlay = document.getElementById('voting-overlay');
        const text = document.getElementById('voting-text');
        const btnYes = document.getElementById('btn-vote-yes');
        const btnNo = document.getElementById('btn-vote-no');
        const spanYes = document.getElementById('vote-yes-count');
        const spanNo = document.getElementById('vote-no-count');
        const statusText = document.getElementById('voting-status-text');
        
        if (overlay) overlay.classList.remove('hidden');
        if (text) text.innerHTML = `<strong>${categoryName}</strong> kategorisi için <strong>"${word}"</strong> kelimesi kabul edilsin mi?`;
        if (spanYes) spanYes.textContent = '0';
        if (spanNo) spanNo.textContent = '0';
        if (statusText) {
            statusText.textContent = '';
            statusText.style.color = 'var(--text-muted)';
        }
        
        if (btnYes) {
            btnYes.disabled = false;
            btnYes.onclick = () => {
                btnYes.disabled = true;
                if(btnNo) btnNo.disabled = true;
                network.sendToHost({ type: 'VOTE', vote: 'yes' });
            };
        }
        if (btnNo) {
            btnNo.disabled = false;
            btnNo.onclick = () => {
                btnNo.disabled = true;
                if(btnYes) btnYes.disabled = true;
                network.sendToHost({ type: 'VOTE', vote: 'no' });
            };
        }
        
        let timeLeft = 10;
        const timerEl = document.getElementById('voting-timer');
        if (timerEl) timerEl.textContent = `Süre: ${timeLeft}`;
        
        clearInterval(clientVoteTimer);
        clientVoteTimer = setInterval(() => {
            timeLeft--;
            if (timerEl) timerEl.textContent = `Süre: ${timeLeft}`;
            if (timeLeft <= 0) clearInterval(clientVoteTimer);
        }, 1000);
    }
    
    function hideVotingUI() {
        const overlay = document.getElementById('voting-overlay');
        if (overlay) overlay.classList.add('hidden');
        clearInterval(clientVoteTimer);
    }

    function endRound() {
        if (!isHost || isRoundOver) return;
        isRoundOver = true;
        clearInterval(currentTimer);

        const activePlayerObj = Object.values(network.players)[gameState.currentPlayerIndex];
        const isHostTurn = activePlayerObj && activePlayerObj.id === network.myId;

        if (isHostTurn && ui.btnFinishTurn && !ui.btnFinishTurn.disabled) {
            ui.btnFinishTurn.disabled = true;
            gameState.playerAnswers[network.myId] = getPlayerAnswers();
        }

        network.broadcast({ type: 'END_ROUND' });

        // Wait briefly for the active player's FINAL_ANSWERS
        setTimeout(() => {
            processAnswersAndGoToNextTurn();
        }, 1500);
    }

    // --- Validation Logic ---
    let validationCache = {};
    let apiCache = {};

    async function checkWikipedia(word, keywords) {
        const wikiUrl = `https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(word)}&utf8=&format=json&srlimit=5&origin=*`;
        try {
            const wikiRes = await fetch(wikiUrl);
            const wikiData = await wikiRes.json();
            if (wikiData.query && wikiData.query.search) {
                const lowerWord = word.toLocaleLowerCase('tr-TR');
                for (let item of wikiData.query.search) {
                    const snippet = item.snippet.toLocaleLowerCase('tr-TR');
                    const title = item.title.toLocaleLowerCase('tr-TR');
                    
                    if (title === lowerWord) {
                        return true;
                    }
                    
                    if (title.includes(lowerWord) || snippet.includes(lowerWord)) {
                        if (keywords.length === 0 || keywords.some(kw => snippet.includes(kw) || title.includes(kw))) {
                            return true;
                        }
                    }
                }
            }
        } catch (e) {}
        return false;
    }

    async function validateViaApi(catId, word) {
        if (!word) return false;
        const cacheKey = `${catId}_${word}`;
        if (apiCache[cacheKey] !== undefined) return apiCache[cacheKey];

        let result = false;
        try {
            if (catId === 'sehir') {
                const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(word)}&format=json&addressdetails=1&limit=1`;
                const response = await fetch(url, { headers: { 'User-Agent': 'PairaGames/1.0' } });
                const data = await response.json();
                result = data.length > 0 && ['city', 'administrative', 'town', 'province', 'state'].includes(data[0].type || data[0].addresstype);
                if (!result) result = await checkWikipedia(word, ['şehir', 'ilçe', 'kasaba', 'başkent']);
            }
            else if (catId === 'ulke') {
                const url = `https://restcountries.com/v3.1/translation/${encodeURIComponent(word)}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    result = Array.isArray(data) && data.length > 0;
                }
                if (!result) result = await checkWikipedia(word, ['ülke', 'cumhuriyet', 'devlet']);
            }
            else if (catId === 'film_dizi') {
                const url = `https://itunes.apple.com/search?term=${encodeURIComponent(word)}&country=tr&limit=5`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.results) {
                        result = data.results.some(item => item.wrapperType === 'track' && (item.kind === 'feature-movie' || item.kind === 'tv-episode'));
                    }
                }
                if (!result) result = await checkWikipedia(word, ['dizi', 'film', 'sinema', 'televizyon', 'belgesel']);
            }
            else if (catId === 'muzik') {
                const url = `https://itunes.apple.com/search?term=${encodeURIComponent(word)}&entity=musicArtist,song&country=tr&limit=5`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.results) {
                        result = data.results.some(item => (item.wrapperType === 'track' && item.kind === 'song') || item.wrapperType === 'artist');
                    }
                }
                if (!result) result = await checkWikipedia(word, ['şarkı', 'albüm', 'müzik', 'tekli', 'single']);
            }
            else if (catId === 'sarkici') {
                const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(word)}&fmt=json`;
                const response = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'PairaGames/1.0 (contact@pairagames.com)' } });
                if (response.ok) {
                    const data = await response.json();
                    if (data.artists && data.artists.length > 0) {
                        result = data.artists.some(artist => 
                            artist.name.toLocaleLowerCase('tr-TR').includes(word.toLocaleLowerCase('tr-TR')) ||
                            (artist.aliases && artist.aliases.some(a => a.name.toLocaleLowerCase('tr-TR').includes(word.toLocaleLowerCase('tr-TR'))))
                        );
                    }
                }
                if (!result) result = await checkWikipedia(word, ['şarkıcı', 'müzisyen', 'grup', 'rapçi', 'solist']);
            }
            else if (catId === 'yazar') {
                const url = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(word)}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    result = data.numFound > 0;
                }
                if (!result) result = await checkWikipedia(word, ['yazar', 'şair', 'roman', 'edebiyat']);
            }
            else if (catId === 'hastalik') {
                result = await checkWikipedia(word, ['hastalık', 'sendrom', 'virüs', 'enfeksiyon', 'tıp', 'belirti', 'hastalığı']);
            }
            else if (catId === 'spor') {
                result = await checkWikipedia(word, ['spor', 'oyun', 'takım', 'turnuva', 'olimpiyat']);
            }
        } catch (e) {
            console.error(`API validation error for ${catId} - ${word}:`, e);
            result = false;
        }

        apiCache[cacheKey] = result;
        return result;
    }

    async function loadDictionary(catId) {
        if (validationCache[catId]) return validationCache[catId];

        try {
            const response = await fetch(`../IsimSehir/data/${catId}.json`);
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

    async function processAnswersAndGoToNextTurn() {
        if (!isHost) return;

        if (ui.finishStatusText) ui.finishStatusText.textContent = 'Cevap kontrol ediliyor...';

        const activePlayerObj = Object.values(network.players)[gameState.currentPlayerIndex];
        if (!activePlayerObj) return; // Should not happen

        const playerId = activePlayerObj.id;
        const answers = gameState.playerAnswers[playerId] || {};

        let word = answers[gameState.currentCategory.id] || "";
        word = word.trim().toLocaleLowerCase('tr-TR');

        let score = 0;

        if (word.length > 0 && word.startsWith(gameState.letter.toLocaleLowerCase('tr-TR'))) {
            const isCustomCat = gameState.currentCategory.id.startsWith('custom_');
            let isValidInDict = false;

            if (isCustomCat) {
                isValidInDict = true;
            } else {
                const dict = await loadDictionary(gameState.currentCategory.id);
                if (dict && dict.has(word)) {
                    isValidInDict = true;
                } else if (['sehir', 'ulke', 'film_dizi', 'muzik', 'sarkici', 'yazar', 'hastalik', 'spor'].includes(gameState.currentCategory.id)) {
                    isValidInDict = await validateViaApi(gameState.currentCategory.id, word);
                } else {
                    isValidInDict = false;
                }
            }

            if (isValidInDict) {
                // Score equals the length of the valid word
                score = word.length;
            }
        }

        // Apply score
        if (!network.players[playerId].score) network.players[playerId].score = 0;
        network.players[playerId].score += score;

        // Broadcast score update for immediate feedback
        const finalScores = getFinalScores(playerId, score);

        const canAppeal = (score === 0 && word.length > 0);

        network.broadcast({
            type: 'TURN_RESULT',
            word: word,
            score: score,
            scores: finalScores,
            playerId: playerId,
            canAppeal: canAppeal
        });

        // Host locally shows result
        showTurnResult(word, score, playerId, canAppeal);
        if(window.PairaAudio) {
            if(score > 0) window.PairaAudio.play('correct');
            else window.PairaAudio.play('wrong');
        }

        if (canAppeal) {
            gameState.status = 'WAITING_APPEAL';
            gameState.pendingNextTurn = { playerId, word, score, category: gameState.currentCategory };
            gameState.appealTimeout = setTimeout(() => {
                if (gameState.status === 'WAITING_APPEAL') {
                    goToNextTurn();
                }
            }, 3000);
        } else {
            setTimeout(() => {
                goToNextTurn();
            }, 3000);
        }
    }

    function getFinalScores(roundPlayerId, roundScore) {
        const scores = {};
        for (const pId in network.players) {
            scores[pId] = {
                id: pId,
                name: network.players[pId].name,
                roundScore: (pId === roundPlayerId) ? roundScore : 0,
                totalScore: network.players[pId].score
            };
        }
        return scores;
    }

    function goToNextTurn() {
        if (!isHost) return;
        
        gameState.currentPlayerIndex++;
        const totalPlayers = Object.keys(network.players).length;

        if (gameState.currentPlayerIndex >= totalPlayers) {
            gameState.currentPlayerIndex = 0;
            gameState.round++;
            
            const finalScores = getFinalScores(null, 0);

            network.broadcast({
                type: 'SHOW_SCORES',
                scores: finalScores
            });
            renderScoreboard(finalScores);
        } else {
            const letter = getRandomLetter();
            const randomCategory = gameConfig.categories[Math.floor(Math.random() * gameConfig.categories.length)];

            gameState.playerAnswers = {};

            network.broadcast({
                type: 'START_TURN',
                config: gameConfig,
                round: gameState.round,
                letter: letter,
                category: randomCategory,
                playerIndex: gameState.currentPlayerIndex
            });
            startTurn(gameConfig, gameState.round, letter, randomCategory, gameState.currentPlayerIndex);
        }
    }

    function showTurnResult(word, score, playerId, canAppeal = false) {
        if(ui.finishStatusText) {
            if (score > 0) {
                ui.finishStatusText.textContent = `Doğru! "${word}" = +${score} puan`;
                ui.finishStatusText.style.color = 'var(--success)';
            } else {
                ui.finishStatusText.textContent = `Yanlış veya Boş! +0 puan`;
                ui.finishStatusText.style.color = 'var(--danger)';
            }
        }

        const appealArea = document.getElementById('appeal-area');
        const btnAppeal = document.getElementById('btn-appeal');
        if (appealArea && btnAppeal) {
            if (canAppeal && playerId === network.myId) {
                appealArea.classList.remove('hidden');
                let secondsLeft = 3;
                btnAppeal.textContent = `İtiraz Et (${secondsLeft})`;
                btnAppeal.disabled = false;
                
                const appealInterval = setInterval(() => {
                    secondsLeft--;
                    if (secondsLeft <= 0) {
                        clearInterval(appealInterval);
                        appealArea.classList.add('hidden');
                    } else {
                        if (!btnAppeal.disabled) {
                            btnAppeal.textContent = `İtiraz Et (${secondsLeft})`;
                        }
                    }
                }, 1000);
                
                // Keep interval reference if needed, but it clears itself
            } else {
                appealArea.classList.add('hidden');
            }
        }
    }

    // Handle specific flow overrides
    const _handleDataFlow = network.handleData;
    network.handleData = function(senderId, data) {
        _handleDataFlow.call(network, senderId, data);

        if (data.type === 'SHOW_SCORES') {
            if (!isHost) {
                renderScoreboard(data.scores);
            }
        }
        else if (data.type === 'TURN_RESULT') {
            if (!isHost) {
                showTurnResult(data.word, data.score, data.playerId, data.canAppeal);
                if(window.PairaAudio) {
                    if(data.score > 0) window.PairaAudio.play('correct');
                    else window.PairaAudio.play('wrong');
                }
            }
        }
        else if (data.type === 'BACK_TO_LOBBY' && !isHost) {
            backToLobby();
        }
        else if (data.type === 'START_VOTE') {
            if (!isHost) {
                showVotingUI(data.word, data.categoryName, false);
            }
        }
        else if (data.type === 'VOTE_UPDATE') {
            const spanYes = document.getElementById('vote-yes-count');
            const spanNo = document.getElementById('vote-no-count');
            if (spanYes) spanYes.textContent = data.yes;
            if (spanNo) spanNo.textContent = data.no;
        }
        else if (data.type === 'VOTE_RESULT') {
            const statusText = document.getElementById('voting-status-text');
            if (statusText) {
                if (data.isAccepted) {
                    statusText.textContent = 'Oylama Sonucu: KABUL EDİLDİ!';
                    statusText.style.color = 'var(--success)';
                } else {
                    statusText.textContent = 'Oylama Sonucu: REDDEDİLDİ!';
                    statusText.style.color = 'var(--danger)';
                }
            }
            if (!isHost) {
                if (data.isAccepted) {
                    showTurnResult(data.word, data.score, data.playerId, false);
                    if(window.PairaAudio) window.PairaAudio.play('correct');
                } else {
                    if(window.PairaAudio) window.PairaAudio.play('wrong');
                }
                setTimeout(() => {
                    hideVotingUI();
                }, 2000);
            }
        }
    };

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
                if (gameState.round > gameConfig.rounds) {
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
                if (gameState.round > gameConfig.rounds) {
                    network.broadcast({ type: 'BACK_TO_LOBBY' });
                    backToLobby();
                } else {
                    const letter = getRandomLetter();
                    const randomCategory = gameConfig.categories[Math.floor(Math.random() * gameConfig.categories.length)];
                    
                    network.broadcast({
                        type: 'START_TURN',
                        config: gameConfig,
                        round: gameState.round,
                        letter: letter,
                        category: randomCategory,
                        playerIndex: 0
                    });
                    startTurn(gameConfig, gameState.round, letter, randomCategory, 0);
                }
            });
        }

        if(ui.btnExtendGame) {
            ui.btnExtendGame.addEventListener('click', () => {
                const extendInput = document.getElementById('extend-rounds-input');
                const extra = parseInt(extendInput ? extendInput.value : 1, 10) || 1;
                gameConfig.rounds += extra;

                if(ui.extendGameGroup) ui.extendGameGroup.classList.add('hidden');
                if(ui.btnNextRound) {
                    ui.btnNextRound.textContent = 'Sonraki Tura Geç';
                }

                network.broadcast({
                    type: 'CONFIG_UPDATE',
                    config: gameConfig
                });
            });
        }
    }

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
