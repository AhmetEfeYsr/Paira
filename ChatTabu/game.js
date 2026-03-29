/**
 * ChatTabuGameEngine - Core game logic
 */
class ChatTabuGameEngine {
    constructor() {
        this.fallbackWords = [
            { ana_kelime: "araba", yasakli_kelimeler: ["Taşıt","Motor","Direksiyon","Tekerlek","Vites"], kategori: "Genel", zorluk: 10 },
            { ana_kelime: "bilgisayar", yasakli_kelimeler: ["Klavye","Fare","Ekran","İnternet","Teknoloji"], kategori: "Genel", zorluk: 10 },
            { ana_kelime: "güneş", yasakli_kelimeler: ["Sıcak","Yaz","Gökyüzü","Sarı","Işık"], kategori: "Doğa", zorluk: 10 },
            { ana_kelime: "kalem", yasakli_kelimeler: ["Yazı","Kağıt","Silgi","Okul","Mürekkep"], kategori: "Eğitim", zorluk: 10 },
            { ana_kelime: "deniz", yasakli_kelimeler: ["Su","Mavi","Yüzmek","Kum","Dalga"], kategori: "Doğa", zorluk: 10 }
        ];

        this.state = {
            mode: 'solo',
            hostName: '',
            clientName: '',
            hostPlatform: '',
            clientPlatform: '',
            clientId: null,
            hostScore: 0,
            clientScore: 0,
            turnId: null,
            isGameStarted: false,
            activeWord: null,
            currentRound: 1,
            maxRounds: 5,
            turnEndTime: null,
            isGameOver: false,
            scores: {}, // username -> score
            isPaused: false
        };

        this.wordDatabase = [];
        this.currentWordIndex = 0;
        
        this.onStateChange = null;
        this.onTimerTick = null;
        this.onWordMatch = null;
        this.onTimeUp = null;

        this.timerRaf = null;
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        if (this.onStateChange) this.onStateChange(this.state);
    }

    async loadWords() {
        try {
            const response = await fetch('../Tabu/tr.json');
            if (response.ok) {
                this.wordDatabase = await response.json();
            } else {
                this.wordDatabase = this.fallbackWords;
            }
        } catch (e) {
            this.wordDatabase = this.fallbackWords;
        }
        this.wordDatabase.sort(() => (Math.random() - 0.5));
    }

    normalizeTurkish(str) {
        return str.replace(/İ/g, 'I').replace(/ı/g, 'I')
                  .replace(/Ş/g, 'S').replace(/ş/g, 'S')
                  .replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
                  .replace(/Ü/g, 'U').replace(/ü/g, 'U')
                  .replace(/Ö/g, 'O').replace(/ö/g, 'O')
                  .replace(/Ç/g, 'C').replace(/ç/g, 'C')
                  .toUpperCase().trim();
    }

    levenshtein(a, b) {
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
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    isMatch(guess, target) {
        const nGuess = this.normalizeTurkish(guess);
        const nTarget = this.normalizeTurkish(target);

        if (nGuess === nTarget) return true;
        if (nTarget.length > 4) {
            const distance = this.levenshtein(nGuess, nTarget);
            if (distance <= 1) return true;
        }
        return false;
    }

    startGameSolo() {
        this.state.mode = 'solo';
        this.state.isGameStarted = true;
        this.state.isGameOver = false;
        this.state.hostScore = 0;
        this.nextWord();
    }

    startMultiplayer(hostId) {
        this.state.turnId = hostId;
        this.state.isGameStarted = true;
        this.state.hostScore = 0;
        this.state.clientScore = 0;
        this.state.currentRound = 1;
        this.state.isGameOver = false;
        this.state.turnEndTime = window.PairaTime.now() + 60000;
        this.setState(this.state);
        this.nextWord();
        this.startTimer();
    }

    nextWord() {
        if (this.wordDatabase.length === 0) return;
        this.currentWordIndex = (this.currentWordIndex + 1) % this.wordDatabase.length;
        this.state.activeWord = this.wordDatabase[this.currentWordIndex];
        this.state.isPaused = false;
        this.setState(this.state);
    }

    checkGuess(username, message, myId, isHost) {
        if (this.state.isPaused || !this.state.activeWord) return false;

        if (this.isMatch(message, this.state.activeWord.ana_kelime)) {
            this.state.isPaused = true;
            if (!this.state.scores[username]) this.state.scores[username] = 0;
            this.state.scores[username] += 1;

            if (this.state.mode !== 'solo') {
                if (isHost) {
                    if (this.state.turnId === myId) {
                        this.state.hostScore += 1;
                    } else {
                        this.state.clientScore += 1;
                    }
                }
            }

            this.setState(this.state);
            if (this.onWordMatch) this.onWordMatch(username, this.state.activeWord);

            setTimeout(() => {
                if (this.state.mode === 'solo' || isHost) {
                    this.nextWord();
                } else if (!isHost && this.state.turnId === myId) {
                    // Client needs to request next word from host if it's their turn
                    // handled by view callback
                }
            }, 2000);

            return true;
        }
        return false;
    }

    handleTimeUp(myId, isHost) {
        if (!isHost || this.state.isGameOver) return;

        const isHostTurn = this.state.turnId === myId;

        if (isHostTurn) {
            this.state.turnId = this.state.clientId;
            this.state.turnEndTime = window.PairaTime.now() + 60000;
            this.setState(this.state);
            this.nextWord();
        } else {
            this.state.currentRound += 1;
            if (this.state.currentRound > this.state.maxRounds) {
                this.state.isGameOver = true;
            } else {
                this.state.turnId = myId;
                this.state.turnEndTime = window.PairaTime.now() + 60000;
                this.nextWord();
            }
            this.setState(this.state);
        }

        if (!this.state.isGameOver) {
            this.startTimer();
        }
    }

    startTimer() {
        if (this.timerRaf) cancelAnimationFrame(this.timerRaf);
        const tick = () => {
            if (this.state.mode === 'solo' || !this.state.isGameStarted || this.state.isGameOver) return;

            if (this.state.turnEndTime) {
                const remaining = Math.max(0, this.state.turnEndTime - window.PairaTime.now());
                const seconds = Math.ceil(remaining / 1000);

                if (this.onTimerTick) this.onTimerTick(seconds);

                if (remaining <= 0) {
                    if (this.onTimeUp) this.onTimeUp(this.state);
                } else {
                    this.timerRaf = requestAnimationFrame(tick);
                }
            } else {
                this.timerRaf = requestAnimationFrame(tick);
            }
        };
        tick();
    }

    stopTimer() {
        if (this.timerRaf) cancelAnimationFrame(this.timerRaf);
    }
}

/**
 * ChatTabuView - Handles DOM
 */
class ChatTabuView {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.isWordVisible = true;
        this.chatListener = null;

        this.bindEvents();
    }

    escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    bindEvents() {
        // Mode switch
        const modeSelect = document.getElementById('game-mode-select');
        const soloActions = document.getElementById('solo-actions');
        const multiplayerActions = document.getElementById('multiplayer-actions');
        
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => {
                if (e.target.value === 'solo') {
                    soloActions.style.display = 'block';
                    multiplayerActions.style.display = 'none';
                } else {
                    soloActions.style.display = 'none';
                    multiplayerActions.style.display = 'flex';
                }
            });
        }

        const getFormValues = () => {
            const channel = document.getElementById('channel-input')?.value.trim();
            const platform = document.getElementById('platform-select')?.value;
            const mode = document.getElementById('game-mode-select')?.value;
            if (!channel) {
                document.getElementById('login-status').innerText = 'Lütfen bir kanal adı girin!';
                return null;
            }
            return { channel, platform, mode };
        };

        document.getElementById('btn-start-solo')?.addEventListener('click', () => {
            const vals = getFormValues();
            if (!vals) return;
            sessionStorage.setItem('chattabu_channel', vals.channel);
            sessionStorage.setItem('chattabu_platform', vals.platform);
            sessionStorage.setItem('chattabu_mode', 'solo');
            window.location.href = 'game.html';
        });

        document.getElementById('btn-host')?.addEventListener('click', () => {
            const vals = getFormValues();
            if (!vals) return;
            sessionStorage.setItem('chattabu_channel', vals.channel);
            sessionStorage.setItem('chattabu_platform', vals.platform);
            sessionStorage.setItem('chattabu_mode', vals.mode);
            sessionStorage.setItem('chattabu_isHost', 'true');
            window.location.href = 'game.html';
        });

        document.getElementById('btn-join')?.addEventListener('click', () => {
            const vals = getFormValues();
            if (!vals) return;
            const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
            if (!roomCode || roomCode.length !== 6) {
                document.getElementById('login-status').innerText = 'Lütfen geçerli bir 6 haneli oda kodu girin!';
                return;
            }
            sessionStorage.setItem('chattabu_channel', vals.channel);
            sessionStorage.setItem('chattabu_platform', vals.platform);
            sessionStorage.setItem('chattabu_mode', vals.mode);
            sessionStorage.setItem('chattabu_isHost', 'false');
            sessionStorage.setItem('chattabu_room', roomCode);
            window.location.href = 'game.html';
        });

        // Game UI events
        const btnToggleVisibility = document.getElementById('btn-toggle-visibility');
        if (btnToggleVisibility) {
            btnToggleVisibility.addEventListener('click', () => {
                this.isWordVisible = !this.isWordVisible;
                const mainWord = document.getElementById('main-word');
                const forbiddenList = document.getElementById('forbidden-words');
                const iconOpen = document.getElementById('icon-eye-open');
                const iconClosed = document.getElementById('icon-eye-closed');
                
                if (this.isWordVisible) {
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

        document.getElementById('btn-leave-lobby')?.addEventListener('click', () => this.callbacks.onLeave());
        document.getElementById('btn-leave-game')?.addEventListener('click', () => this.callbacks.onLeave());
        document.getElementById('btn-start-game')?.addEventListener('click', () => this.callbacks.onStartGame());
        document.getElementById('btn-skip')?.addEventListener('click', () => this.callbacks.onSkip());
        document.getElementById('btn-taboo')?.addEventListener('click', () => this.callbacks.onTaboo());
    }

    setupChatListener(platform, channel, onMessage) {
        if (this.chatListener) this.chatListener.stop();
        if (typeof window.ChatListener === 'undefined') return;

        this.chatListener = new window.ChatListener(platform, channel, onMessage);
        this.chatListener.start();
        
        const status = document.getElementById('chat-status');
        if (status) status.textContent = '• Bağlı';
    }

    stopChatListener() {
        if (this.chatListener) this.chatListener.stop();
    }

    updateLobbyPlayers(hostName, clientName) {
        const list = document.getElementById('players-list');
        if (!list) return;
        list.innerHTML = '';

        if (hostName) {
            list.innerHTML += `<li><strong>${this.escapeHtml(hostName)}</strong> <span class="badge" style="background:var(--primary-purple)">Kurucu</span></li>`;
        }

        if (clientName) {
            list.innerHTML += `<li><strong>${this.escapeHtml(clientName)}</strong> <span class="badge" style="background:var(--danger)">Rakip</span></li>`;
        }
    }

    updateGameUI(state, myId) {
        if (!state.isGameStarted) return;

        document.getElementById('p1-score').textContent = `${state.hostScore} Puan`;
        document.getElementById('p2-score').textContent = `${state.clientScore} Puan`;

        const isMyTurn = state.mode === 'solo' || state.turnId === myId;
        const statusEl = document.getElementById('turn-status');
        const mainEl = document.getElementById('main-word');
        const fbEl = document.getElementById('forbidden-words');
        const controls = document.querySelector('.narrator-actions');
        const roundDisplay = document.getElementById('round-display');
        const turnTimer = document.getElementById('turn-timer');
        const toggleVisibilityBtn = document.getElementById('btn-toggle-visibility');

        if (state.mode !== 'solo' && roundDisplay && turnTimer) {
            roundDisplay.style.display = 'block';
            turnTimer.style.display = 'block';
            roundDisplay.textContent = `Tur: ${state.currentRound}/${state.maxRounds}`;
        }

        if (state.isGameOver) {
            statusEl.textContent = "Oyun Bitti!";
            statusEl.style.borderColor = "var(--warning)";
            controls.style.display = "none";
            if (roundDisplay) roundDisplay.textContent = "Oyun Bitti";
            if (turnTimer) turnTimer.style.display = "none";

            let winnerText = "Berabere!";
            if (state.hostScore > state.clientScore) {
                winnerText = `${this.escapeHtml(state.hostName)} Kazandı!`;
            } else if (state.clientScore > state.hostScore) {
                winnerText = `${this.escapeHtml(state.clientName)} Kazandı!`;
            }
            mainEl.textContent = winnerText;
            fbEl.innerHTML = `<li>Host Puanı: ${state.hostScore}</li><li>Rakip Puanı: ${state.clientScore}</li>`;
            return;
        }

        if (isMyTurn) {
            statusEl.textContent = "Sıra Sende! Anlat Bakalım.";
            statusEl.style.borderColor = "var(--success)";
            controls.style.display = "flex";
            if (toggleVisibilityBtn) toggleVisibilityBtn.style.display = 'flex';

            document.getElementById('btn-skip').style.display = 'inline-block';
            if (document.getElementById('btn-taboo')) document.getElementById('btn-taboo').style.display = 'none';

            if (state.activeWord) {
                mainEl.textContent = state.activeWord.ana_kelime.toLocaleUpperCase('tr-TR');
                fbEl.innerHTML = state.activeWord.yasakli_kelimeler.map(w => `<li>${this.escapeHtml(w.toLocaleUpperCase('tr-TR'))}</li>`).join('');
            }
        } else {
            statusEl.textContent = "Diğer Yayıncı Anlatıyor...";
            statusEl.style.borderColor = "var(--danger)";
            if (toggleVisibilityBtn) toggleVisibilityBtn.style.display = 'flex';

            if (state.mode !== 'solo') {
                controls.style.display = "flex";
                document.getElementById('btn-skip').style.display = 'none';
                if (document.getElementById('btn-taboo')) document.getElementById('btn-taboo').style.display = 'inline-block';

                if (state.activeWord) {
                    mainEl.textContent = state.activeWord.ana_kelime.toLocaleUpperCase('tr-TR');
                    fbEl.innerHTML = state.activeWord.yasakli_kelimeler.map(w => `<li>${this.escapeHtml(w.toLocaleUpperCase('tr-TR'))}</li>`).join('');
                }
            } else {
                controls.style.display = "none";
                mainEl.textContent = "SANSÜRLÜ";
                fbEl.innerHTML = "<li>???</li><li>???</li><li>???</li><li>???</li><li>???</li>";
            }
        }
    }

    addChatMessage(username, message, isLocal, isCorrect) {
        const chatFeed = document.getElementById('chat-feed');
        if (!chatFeed) return;
        
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg';

        if (!isLocal) {
            msgDiv.style.borderLeft = '3px solid var(--warning)';
        }
        if (isCorrect) {
            msgDiv.classList.add('correct');
        }

        const usernameSpan = document.createElement('strong');
        usernameSpan.textContent = username + ': ';
        const textSpan = document.createElement('span');
        textSpan.textContent = message + (isCorrect ? ' (🎉 DOĞRU BİLDİ!)' : '');

        msgDiv.appendChild(usernameSpan);
        msgDiv.appendChild(textSpan);

        msgDiv.dataset.text = message;
        msgDiv.dataset.username = username;

        chatFeed.appendChild(msgDiv);
        chatFeed.scrollTop = chatFeed.scrollHeight;
    }

    triggerCorrectGuess(username) {
        const chatFeed = document.getElementById('chat-feed');
        if (!chatFeed) return;
        
        const lastMsgs = Array.from(chatFeed.querySelectorAll('.chat-msg')).slice(-15);

        for (let msgDiv of lastMsgs) {
            if (msgDiv.dataset.username === username && !msgDiv.classList.contains('correct')) {
                msgDiv.classList.add('correct');
                msgDiv.querySelector('span').textContent += ' (🎉 DOĞRU BİLDİ!)';
                break;
            }
        }

        const card = document.querySelector('.card-tabu');
        if (card) {
            card.style.borderColor = 'var(--success)';
            card.style.boxShadow = '0 10px 40px var(--success-bg)';
            setTimeout(() => {
                card.style.borderColor = 'var(--neon-purple)';
                card.style.boxShadow = '0 8px 25px var(--input-bg)';
            }, 2000);
        }
    }

    updateLeaderboard(scores) {
        const list = document.getElementById('leaderboard-list');
        if (!list) return;
        list.innerHTML = '';

        const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);

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

    updateTimer(seconds) {
        const timerEl = document.getElementById('turn-timer');
        if (timerEl) {
            timerEl.textContent = seconds;
        }
    }
}

// MAIN INTEGRATION
document.addEventListener('DOMContentLoaded', async () => {
    // Only init if we are on game page
    if (!document.getElementById('main-word')) return;

    window.PairaTime = window.PairaTime || { now: () => Date.now() };

    const engine = new ChatTabuGameEngine();
    await engine.loadWords();

    const view = new ChatTabuView({
        onLeave: () => {
            view.stopChatListener();
            if (window.Network && window.Network.disconnectPeer) window.Network.disconnectPeer();
            window.location.href = 'index.html';
        },
        onStartGame: () => {
            if (!engine.state.clientName) {
                alert("Oyunu başlatmak için bir rakibin katılması gerekiyor!");
                return;
            }
            engine.startMultiplayer(window.Network.getMyId());
            if (window.Network && window.Network.broadcastToClients) {
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
                window.Network.broadcastToClients({ type: 'START_GAME' });
            }
            
            document.getElementById('lobby-screen').classList.remove('active');
            document.getElementById('game-screen').classList.add('active');

            const channel = sessionStorage.getItem('chattabu_channel');
            const platform = sessionStorage.getItem('chattabu_platform');
            view.setupChatListener(platform, channel, (u, m) => handleChatMessage(u, m));
        },
        onSkip: () => {
            if (window.Network && window.Network.isHost() && engine.state.turnId === window.Network.getMyId()) {
                engine.nextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
                view.updateGameUI(engine.state, window.Network.getMyId());
            } else if (window.Network && !window.Network.isHost()) {
                window.Network.sendToHost({ type: 'SKIP_WORD' });
            } else if (engine.state.mode === 'solo') {
                engine.nextWord();
            }
        },
        onTaboo: () => {
            if (engine.state.mode === 'solo' || engine.state.turnId === window.Network.getMyId() || engine.state.isGameOver) return;
            if (window.Network && window.Network.isHost()) {
                engine.state.clientScore = Math.max(0, engine.state.clientScore - 1);
                engine.nextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
                view.updateGameUI(engine.state, window.Network.getMyId());
            } else if (window.Network) {
                window.Network.sendToHost({ type: 'TABOO_PRESSED' });
            }
        }
    });

    engine.onStateChange = (state) => {
        if (window.Network) {
            view.updateGameUI(state, window.Network.getMyId());
        } else {
            view.updateGameUI(state, null);
        }
        view.updateLeaderboard(state.scores);
    };

    engine.onTimerTick = (secs) => {
        view.updateTimer(secs);
    };

    engine.onTimeUp = (state) => {
        if (window.Network && window.Network.isHost()) {
            engine.handleTimeUp(window.Network.getMyId(), true);
            window.Network.broadcastToClients({ type: 'TURN_END', nextTurnId: engine.state.turnId });
            window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state });
        }
    };

    engine.onWordMatch = (username, word) => {
        view.triggerCorrectGuess(username);
        if (engine.state.mode !== 'solo' && window.Network && window.Network.isHost()) {
            window.Network.broadcastToClients({
                type: 'GUESSED_CORRECTLY',
                username,
                word: word,
                scores: engine.state.scores,
                hostScore: engine.state.hostScore,
                clientScore: engine.state.clientScore
            });
        }
    };

    const handleChatMessage = (username, message) => {
        if (engine.state.mode === 'solo') {
            if (engine.state.isPaused || !engine.state.activeWord) return;
            view.addChatMessage(username, message, true, false);
            engine.checkGuess(username, message, null, true);
        } else {
            if (!engine.state.isGameStarted || !engine.state.activeWord || engine.state.isPaused) return;

            const myId = window.Network.getMyId();
            const isHost = window.Network.isHost();
            const isMyTurn = engine.state.turnId === myId;

            if (engine.state.mode === 'chat_vs_chat') {
                if (!isMyTurn) return; 
                view.addChatMessage(username, message, true, false);
                if (isHost) {
                    engine.checkGuess(username, message, myId, true);
                } else {
                    window.Network.sendToHost({ type: 'CHECK_GUESS', username, message });
                }
            } else {
                view.addChatMessage(username, message, true, false);
                if (isHost) {
                    window.Network.broadcastToClients({ type: 'CHAT_MSG', username, message });
                    engine.checkGuess(username, message, myId, true);
                } else {
                    window.Network.sendToHost({ type: 'CHAT_MSG', username, message });
                }
            }
        }
    };

    // Init Network
    const channel = sessionStorage.getItem('chattabu_channel');
    const platform = sessionStorage.getItem('chattabu_platform');
    const mode = sessionStorage.getItem('chattabu_mode') || 'solo';
    const isHostUser = sessionStorage.getItem('chattabu_isHost') === 'true';
    const roomCode = sessionStorage.getItem('chattabu_room');

    if (!channel || !platform) {
        window.location.href = 'index.html';
        return;
    }

    engine.state.mode = mode;

    if (mode === 'solo') {
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        document.querySelector('.score-board').style.display = 'none';
        
        document.getElementById('channel-name-display').textContent = `${platform.toUpperCase()} / ${channel}`;
        view.setupChatListener(platform, channel, handleChatMessage);
        
        engine.startGameSolo();
        return;
    }

    document.getElementById('channel-name-display').textContent = `${platform.toUpperCase()} / ${channel}`;

    if (isHostUser) {
        document.getElementById('settings-card').style.display = 'flex';
        document.getElementById('room-code-display').style.display = 'flex';
        engine.state.hostName = channel;
        engine.state.hostPlatform = platform;
    } else {
        document.getElementById('settings-card').style.display = 'none';
        document.getElementById('room-code-display').style.display = 'none';
    }

    try {
        const data = await window.Network.initPeer(isHostUser ? 'host' : 'client', roomCode);
        if (isHostUser) {
            document.getElementById('room-code-val').textContent = data.roomCode;
            view.updateLobbyPlayers(engine.state.hostName, engine.state.clientName);
        }
    } catch (e) {
        alert(e.message || "Bağlantı hatası");
        window.location.href = 'index.html';
    }

    window.onPlayerJoined = (peerId) => {
        window.Network.broadcastToClients({ type: 'REQUEST_INFO' });
        document.getElementById('lobby-status').textContent = 'Rakip bağlandı, bilgileri bekleniyor...';
    };

    window.onPlayerLeft = (peerId) => {
        engine.state.clientName = '';
        engine.state.clientPlatform = '';
        engine.state.clientId = null;
        view.updateLobbyPlayers(engine.state.hostName, engine.state.clientName);
        document.getElementById('lobby-status').textContent = 'Rakip ayrıldı. Yeni rakip bekleniyor...';
        
        if (engine.state.isGameStarted && !engine.state.isGameOver) {
            alert("Rakip oyundan ayrıldı. Oyun sona erdi.");
            engine.state.isGameOver = true;
            engine.setState(engine.state);
        }
    };

    window.handleNetworkData = (data, sender) => {
        if (data.type === 'REQUEST_INFO') {
            window.Network.sendToHost({ type: 'CLIENT_INFO', channel, platform, myId: window.Network.getMyId() });
        }
        else if (data.type === 'CLIENT_INFO') {
            engine.state.clientName = data.channel;
            engine.state.clientPlatform = data.platform;
            engine.state.clientId = data.myId || sender;
            view.updateLobbyPlayers(engine.state.hostName, engine.state.clientName);
            document.getElementById('lobby-status').textContent = 'Rakip hazır!';
        }
        else if (data.type === 'SYNC_STATE') {
            if (data.hostNow && data.state.turnEndTime) {
                const diff = window.PairaTime.now() - data.hostNow;
                data.state.turnEndTime += diff;
            }
            engine.state = { ...engine.state, ...data.state };
            view.updateGameUI(engine.state, window.Network.getMyId());
            view.updateLeaderboard(engine.state.scores);
        }
        else if (data.type === 'START_GAME') {
            document.getElementById('lobby-screen').classList.remove('active');
            document.getElementById('game-screen').classList.add('active');

            if (engine.state.mode !== 'solo') {
                document.getElementById('p1-name').textContent = engine.state.hostName;
                document.getElementById('p2-name').textContent = engine.state.clientName;
            }
            view.setupChatListener(platform, channel, handleChatMessage);
            view.updateGameUI(engine.state, window.Network.getMyId());
            engine.startTimer();
        }
        else if (data.type === 'NEXT_WORD') {
            engine.state.activeWord = data.word;
            engine.state.isPaused = false;
            engine.setState(engine.state);
        }
        else if (data.type === 'GUESSED_CORRECTLY') {
            engine.state.activeWord = data.word;
            engine.state.scores = data.scores;
            engine.state.hostScore = data.hostScore;
            engine.state.clientScore = data.clientScore;
            view.triggerCorrectGuess(data.username);
            engine.setState(engine.state);
        }
        else if (data.type === 'SKIP_WORD') {
            if (window.Network.isHost() && engine.state.turnId !== window.Network.getMyId()) {
                engine.nextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
            }
        }
        else if (data.type === 'NEXT_WORD_REQ') {
            if (window.Network.isHost() && engine.state.turnId !== window.Network.getMyId()) {
                engine.nextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
            }
        }
        else if (data.type === 'CHAT_MSG') {
            view.addChatMessage(data.username, data.message, false, false);
            if (window.Network.isHost()) {
                engine.checkGuess(data.username, data.message, window.Network.getMyId(), true);
            }
        }
        else if (data.type === 'CHECK_GUESS') {
            if (window.Network.isHost()) {
                engine.checkGuess(data.username, data.message, window.Network.getMyId(), true);
            }
        }
        else if (data.type === 'TABOO_PRESSED') {
            if (window.Network.isHost() && !engine.state.isGameOver && engine.state.isGameStarted) {
                if (engine.state.turnId === window.Network.getMyId()) {
                    engine.state.hostScore = Math.max(0, engine.state.hostScore - 1);
                } else {
                    engine.state.clientScore = Math.max(0, engine.state.clientScore - 1);
                }
                engine.nextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
                view.updateGameUI(engine.state, window.Network.getMyId());
            }
        }
        else if (data.type === 'TURN_END') {
            engine.state.turnId = data.nextTurnId;
            engine.state.turnEndTime = window.PairaTime.now() + 60000;
            engine.setState(engine.state);
        }
    };
});
