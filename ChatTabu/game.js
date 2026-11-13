/**
 * ChatTabuGameEngine - Core game logic supporting Multi-Streamer (2+ Players), Dual Cross-Platform (Twitch + Kick simultaneously), and Configurable Rules
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
            players: [], // Array of { id, name, platform, score, isHost }
            turnOrder: [], // Array of player IDs
            currentTurnIndex: 0,
            turnId: null,
            isGameStarted: false,
            activeWord: null,
            currentRound: 1,
            maxRounds: 5,
            turnDuration: 60,
            turnEndTime: null,
            isGameOver: false,
            scores: {}, // chat username -> score
            isPaused: false,
            settings: {
                allowAnyChat: true,
                pointsPerCorrect: 1,
                tabooPenalty: 1
            }
        };

        this.wordDatabase = [];
        this.currentWordIndex = 0;
        
        this.onStateChange = null;
        this.onTimerTick = null;
        this.onWordMatch = null;
        this.onTimeUp = null;

        this.timerRaf = null;
        this.fuzzyMatcher = new window.FuzzyMatcher();
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

    isMatch(guess, target) {
        if (!guess || !target) return false;
        const norm = (s) => {
            const trimmed = String(s).trim();
            return typeof window.normalizeTurkishChars === 'function'
                ? window.normalizeTurkishChars(trimmed)
                : trimmed.toLocaleLowerCase('tr-TR');
        };
        const cleanGuess = norm(guess);
        const cleanTarget = norm(target);
        if (!cleanGuess || !cleanTarget) return false;
        if (cleanGuess === cleanTarget) return true;

        const tolerance = cleanTarget.length <= 4 ? 0 : (cleanTarget.length <= 7 ? 0.8 : 1.2);
        if (tolerance > 0 && this.fuzzyMatcher) {
            return this.fuzzyMatcher.isMatch(cleanGuess, cleanTarget, tolerance);
        }
        return false;
    }

    startGameSolo() {
        this.state.mode = 'solo';
        this.state.isGameStarted = true;
        this.state.isGameOver = false;
        this.state.scores = {};
        this.state.turnEndTime = window.PairaTime.now() + 180000; // 3 minutes total for solo mode
        this.nextWord();
        this.startTimer();
    }

    startMultiplayer(hostId, settings = {}) {
        this.state.settings = { ...this.state.settings, ...settings };
        this.state.turnOrder = this.state.players.map(p => p.id);
        this.state.currentTurnIndex = 0;
        this.state.turnId = this.state.turnOrder[0] || hostId;
        this.state.isGameStarted = true;
        this.state.currentRound = 1;
        this.state.isGameOver = false;

        const duration = (this.state.turnDuration || 60) * 1000;
        this.state.turnEndTime = window.PairaTime.now() + duration;

        // Reset player scores
        this.state.players.forEach(p => p.score = 0);
        this.state.scores = {};

        this.nextWord();
        this.startTimer();
    }

    nextWord() {
        if (this.nextWordTimeout) {
            clearTimeout(this.nextWordTimeout);
            this.nextWordTimeout = null;
        }
        if (this.wordDatabase.length === 0) return;
        this.currentWordIndex = (this.currentWordIndex + 1) % this.wordDatabase.length;
        this.state.activeWord = this.wordDatabase[this.currentWordIndex];
        this.state.isPaused = false;
        this.setState(this.state);
    }

    checkGuess(username, message, streamerId, isHost) {
        if (this.state.isPaused || !this.state.activeWord || this.state.isGameOver) return false;

        if (this.isMatch(message, this.state.activeWord.ana_kelime)) {
            const allowAny = this.state.settings ? this.state.settings.allowAnyChat : true;
            const isTurnStreamer = streamerId === this.state.turnId;

            // In solo mode or when allowAnyChat is true or guess comes from active narrator's chat
            if (this.state.mode === 'solo' || allowAny || isTurnStreamer) {
                this.state.isPaused = true;
                if (this.state.turnEndTime) {
                    this.state.turnEndTime += 2000;
                }

                if (!this.state.scores[username]) this.state.scores[username] = 0;
                this.state.scores[username] += 1;

                if (this.state.mode === 'solo') {
                    const hostPlayer = this.state.players.find(p => p.isHost);
                    if (hostPlayer) hostPlayer.score += 1;
                } else {
                    const narrator = this.state.players.find(p => p.id === this.state.turnId);
                    if (narrator) {
                        narrator.score = (narrator.score || 0) + (this.state.settings?.pointsPerCorrect || 1);
                    }
                }

                this.setState(this.state);
                if (this.onWordMatch) this.onWordMatch(username, this.state.activeWord);

                if (this.nextWordTimeout) clearTimeout(this.nextWordTimeout);
                this.nextWordTimeout = setTimeout(() => {
                    this.nextWordTimeout = null;
                    if (!this.state.isGameOver && (this.state.mode === 'solo' || isHost)) {
                        this.nextWord();
                        if (this.state.mode !== 'solo' && window.Network && window.Network.isHost()) {
                            window.Network.broadcastToClients({ type: 'SYNC_STATE', state: this.state, hostNow: window.PairaTime.now() });
                        }
                    }
                }, 2000);

                return true;
            }
        }
        return false;
    }

    handleTimeUp(myId, isHost) {
        if (!isHost || this.state.isGameOver) return;
        if (this.nextWordTimeout) {
            clearTimeout(this.nextWordTimeout);
            this.nextWordTimeout = null;
        }

        if (this.state.mode === 'solo') {
            this.state.isGameOver = true;
            this.setState(this.state);
            return;
        }

        if (!this.state.turnOrder || this.state.turnOrder.length === 0) {
            this.state.isGameOver = true;
            this.setState(this.state);
            return;
        }

        // Advance to next streamer turn in multi-streamer room
        this.state.currentTurnIndex = (this.state.currentTurnIndex + 1) % this.state.turnOrder.length;
        
        if (this.state.currentTurnIndex === 0) {
            this.state.currentRound += 1;
        }

        if (this.state.currentRound > this.state.maxRounds) {
            this.state.isGameOver = true;
        } else {
            this.state.turnId = this.state.turnOrder[this.state.currentTurnIndex];
            const duration = (this.state.turnDuration || 60) * 1000;
            this.state.turnEndTime = window.PairaTime.now() + duration;
            this.nextWord();
        }

        this.setState(this.state);

        if (!this.state.isGameOver) {
            this.startTimer();
        }
    }

    startTimer() {
        if (this.timerRaf) cancelAnimationFrame(this.timerRaf);
        if (this.bgTimerInterval) clearInterval(this.bgTimerInterval);

        const checkTimer = () => {
            if (!this.state.isGameStarted || this.state.isGameOver) return false;

            if (this.state.turnEndTime) {
                const remaining = Math.max(0, this.state.turnEndTime - window.PairaTime.now());
                const seconds = Math.ceil(remaining / 1000);

                if (this.onTimerTick) this.onTimerTick(seconds);

                if (remaining <= 0) {
                    if (this.bgTimerInterval) clearInterval(this.bgTimerInterval);
                    if (this.timerRaf) cancelAnimationFrame(this.timerRaf);
                    if (this.onTimeUp) this.onTimeUp(this.state);
                    return true;
                }
            }
            return false;
        };

        const tick = () => {
            if (checkTimer()) return;
            this.timerRaf = requestAnimationFrame(tick);
        };
        tick();

        this.bgTimerInterval = setInterval(() => {
            checkTimer();
        }, 1000);

        if (!this._visibilityListenerBound) {
            this._visibilityListenerBound = true;
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && this.state.isGameStarted && !this.state.isGameOver) {
                    checkTimer();
                }
            });
        }
    }

    stopTimer() {
        if (this.timerRaf) cancelAnimationFrame(this.timerRaf);
        if (this.bgTimerInterval) clearInterval(this.bgTimerInterval);
        if (this.nextWordTimeout) {
            clearTimeout(this.nextWordTimeout);
            this.nextWordTimeout = null;
        }
    }
}

/**
 * ChatTabuView - Handles UI updates and rendering
 */
class ChatTabuView {
    constructor() {
        this.chatListener = null;
        this.wordVisible = true;
    }

    setWordVisibility(visible) {
        this.wordVisible = Boolean(visible);
        const mainWord = document.getElementById('main-word');
        const forbiddenWords = document.getElementById('forbidden-words');
        const iconEyeOpen = document.getElementById('word-eye-open');
        const iconEyeClosed = document.getElementById('word-eye-closed');

        if (this.wordVisible) {
            if (mainWord) mainWord.style.filter = 'none';
            if (forbiddenWords) forbiddenWords.style.filter = 'none';
            if (iconEyeOpen) iconEyeOpen.style.display = 'block';
            if (iconEyeClosed) iconEyeClosed.style.display = 'none';
        } else {
            if (mainWord) mainWord.style.filter = 'blur(12px)';
            if (forbiddenWords) forbiddenWords.style.filter = 'blur(12px)';
            if (iconEyeOpen) iconEyeOpen.style.display = 'none';
            if (iconEyeClosed) iconEyeClosed.style.display = 'block';
        }
    }

    setupChatListener(platform, channelConfig, onMessage, onOpen = null, onError = null) {
        if (typeof window.ChatListener === 'undefined') return;
        if (this.chatListener) {
            this.chatListener.stop();
        }
        this.chatListener = new window.ChatListener(platform, channelConfig, onMessage, onError, onOpen);
        this.chatListener.start();
    }

    stopChatListener() {
        if (this.chatListener) this.chatListener.stop();
    }

    updateLobbyPlayers(players) {
        const list = document.getElementById('players-list');
        const countDisplay = document.getElementById('player-count-display');
        if (!list) return;
        list.innerHTML = '';

        if (countDisplay) countDisplay.textContent = players.length;

        const btnStartGame = document.getElementById('btn-start-game');
        if (btnStartGame) {
            btnStartGame.classList.toggle('btn-not-ready', players.length < 2);
        }

        players.forEach((p, idx) => {
            let platformIcon = '🟣 Twitch';
            if (p.platform === 'kick') platformIcon = '🟢 Kick';
            else if (p.platform === 'both') platformIcon = '⚡ Twitch + Kick';

            const roleBadge = p.isHost 
                ? '<span class="badge" style="background:var(--primary-purple); color:#fff; font-size:0.75rem; padding:2px 8px; border-radius:6px;">Kurucu</span>' 
                : `<span class="badge" style="background:var(--input-bg); border:1px solid var(--btn-secondary-border); color:var(--text-muted); font-size:0.75rem; padding:2px 8px; border-radius:6px;">Yayıncı ${idx + 1}</span>`;

            list.innerHTML += `
                <li style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid var(--btn-secondary-bg); font-size:0.95rem;">
                    <div>
                        <strong>@${window.escapeHtml(p.name)}</strong>
                        <span style="font-size:0.8rem; color:var(--text-muted); margin-left:6px;">(${platformIcon})</span>
                    </div>
                    ${roleBadge}
                </li>
            `;
        });
    }

    updateGameUI(state, myId) {
        if (!state.isGameStarted) return;

        const activePlayer = state.players.find(p => p.id === state.turnId);
        const isMyTurn = state.mode === 'solo' || state.turnId === myId;
        const statusEl = document.getElementById('turn-status');
        const mainEl = document.getElementById('main-word');
        const fbEl = document.getElementById('forbidden-words');
        const controls = document.querySelector('.narrator-actions');
        const roundDisplay = document.getElementById('round-display');
        const turnTimer = document.getElementById('turn-timer');
        const toggleVisibilityBtn = document.getElementById('btn-toggle-visibility');
        const activeTurnIndicator = document.getElementById('active-turn-indicator');

        // Topbar Active Turn Indicator
        if (activeTurnIndicator) {
            if (state.mode === 'solo') {
                const p = state.players[0];
                const icon = p?.platform === 'both' ? 'Twitch + Kick' : (p?.platform === 'kick' ? 'Kick' : 'Twitch');
                activeTurnIndicator.innerHTML = `<span>Tek Oyunculu Mod (${icon})</span>`;
            } else if (activePlayer) {
                let icon = '🟣';
                if (activePlayer.platform === 'kick') icon = '🟢';
                else if (activePlayer.platform === 'both') icon = '⚡';

                activeTurnIndicator.innerHTML = `
                    <span>Anlatan Yayıncı:</span>
                    <span style="color:var(--primary-purple);">${icon} @${window.escapeHtml(activePlayer.name)}</span>
                    <span style="font-size:0.9rem; color:var(--text-muted);">(${activePlayer.score} Puan)</span>
                `;
            }
        }

        if (turnTimer) {
            turnTimer.style.display = 'block';
        }

        if (roundDisplay) {
            if (state.mode !== 'solo') {
                roundDisplay.style.display = 'block';
                roundDisplay.textContent = `Tur: ${state.currentRound}/${state.maxRounds}`;
            } else {
                roundDisplay.style.display = 'none';
            }
        }

        const btnSkipEl = document.getElementById('btn-skip');
        const btnTabooEl = document.getElementById('btn-taboo');

        if (state.isGameOver) {
            statusEl.textContent = "Oyun Bitti!";
            statusEl.style.borderColor = "var(--warning)";
            if (roundDisplay) roundDisplay.textContent = "Oyun Bitti";
            if (turnTimer) turnTimer.style.display = "none";
            this.setWordVisibility(true);
            if (toggleVisibilityBtn) toggleVisibilityBtn.style.display = 'none';
            if (btnSkipEl) {
                btnSkipEl.classList.remove('disabled');
                btnSkipEl.disabled = false;
            }
            if (btnTabooEl) {
                btnTabooEl.classList.remove('disabled');
                btnTabooEl.disabled = false;
            }

            if (state.mode === 'solo') {
                controls.style.display = "flex";
                if (btnSkipEl) {
                    btnSkipEl.style.display = 'inline-block';
                    btnSkipEl.textContent = 'Yeniden Başlat';
                }
                if (btnTabooEl) btnTabooEl.style.display = 'none';

                const hostP = state.players.find(p => p.isHost);
                const score = hostP ? hostP.score : 0;
                mainEl.textContent = `SÜRE DOLDU! (${score} Kelime)`;
                fbEl.innerHTML = `<li>3 Dakikalık Tur Tamamlandı</li><li>Toplam Bilinen: ${score} Kelime</li>`;
            } else {
                const isHost = window.Network && window.Network.isHost();
                if (isHost) {
                    controls.style.display = "flex";
                    if (btnSkipEl) {
                        btnSkipEl.style.display = 'inline-block';
                        btnSkipEl.textContent = 'Yeniden Başlat';
                    }
                    if (btnTabooEl) btnTabooEl.style.display = 'none';
                } else {
                    controls.style.display = "none";
                }
                const sorted = [...state.players].sort((a, b) => b.score - a.score);
                const winner = sorted[0];
                let winnerText = winner ? `Kazanan: @${winner.name} (${winner.score} Puan)` : "Oyun Bitti";
                mainEl.textContent = winnerText;

                fbEl.innerHTML = sorted.map(p => `<li>@${window.escapeHtml(p.name)}: ${p.score} Puan</li>`).join('');
            }
            return;
        }

        if (btnSkipEl) {
            btnSkipEl.classList.toggle('disabled', Boolean(state.isPaused));
            btnSkipEl.disabled = Boolean(state.isPaused);
        }
        if (btnTabooEl) {
            btnTabooEl.classList.toggle('disabled', Boolean(state.isPaused));
            btnTabooEl.disabled = Boolean(state.isPaused);
        }

        if (state.mode === 'solo') {
            statusEl.textContent = "Kelimeleri Sohbete Anlat!";
            statusEl.style.borderColor = "var(--success)";
            controls.style.display = "flex";
            if (toggleVisibilityBtn) toggleVisibilityBtn.style.display = 'flex';

            if (btnSkipEl) {
                btnSkipEl.style.display = 'inline-block';
                btnSkipEl.textContent = 'Pas Geç';
            }
            if (btnTabooEl) btnTabooEl.style.display = 'none';

            if (state.activeWord) {
                mainEl.textContent = state.activeWord.ana_kelime.toLocaleUpperCase('tr-TR');
                fbEl.innerHTML = state.activeWord.yasakli_kelimeler.map(w => `<li>${window.escapeHtml(w.toLocaleUpperCase('tr-TR'))}</li>`).join('');
            }
        } else if (isMyTurn) {
            statusEl.textContent = "Sıra Sende! Anlat Bakalım.";
            statusEl.style.borderColor = "var(--success)";
            controls.style.display = "flex";
            if (toggleVisibilityBtn) toggleVisibilityBtn.style.display = 'flex';

            if (btnSkipEl) {
                btnSkipEl.style.display = 'inline-block';
                btnSkipEl.textContent = 'Pas Geç';
            }
            if (btnTabooEl) btnTabooEl.style.display = 'none';

            if (state.activeWord) {
                mainEl.textContent = state.activeWord.ana_kelime.toLocaleUpperCase('tr-TR');
                fbEl.innerHTML = state.activeWord.yasakli_kelimeler.map(w => `<li>${window.escapeHtml(w.toLocaleUpperCase('tr-TR'))}</li>`).join('');
            }
        } else {
            const activeName = activePlayer ? activePlayer.name : 'Yayıncı';
            statusEl.textContent = `@${activeName} Anlatıyor...`;
            statusEl.style.borderColor = "var(--danger)";
            if (toggleVisibilityBtn) toggleVisibilityBtn.style.display = 'flex';

            if (state.mode !== 'solo') {
                controls.style.display = "flex";
                if (btnSkipEl) btnSkipEl.style.display = 'none';
                if (btnTabooEl) btnTabooEl.style.display = 'inline-block';

                if (state.activeWord) {
                    mainEl.textContent = state.activeWord.ana_kelime.toLocaleUpperCase('tr-TR');
                    fbEl.innerHTML = state.activeWord.yasakli_kelimeler.map(w => `<li>${window.escapeHtml(w.toLocaleUpperCase('tr-TR'))}</li>`).join('');
                }
            }
        }
    }

    addChatMessage(username, message, isSelf = false, isCorrect = false) {
        const chatFeed = document.getElementById('chat-feed');
        if (!chatFeed) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg';
        if (isSelf) {
            msgDiv.style.borderLeft = '3px solid var(--warning)';
        }
        if (isCorrect) {
            msgDiv.classList.add('correct');
        }

        const usernameSpan = document.createElement('strong');
        usernameSpan.textContent = username + ': ';
        const textSpan = document.createElement('span');
        textSpan.textContent = message + (isCorrect ? ' (DOĞRU BİLDİ!)' : '');

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
        
        const lastMsgs = Array.from(chatFeed.querySelectorAll('.chat-msg')).slice(-50).reverse();

        for (let msgDiv of lastMsgs) {
            if (msgDiv.dataset.username === username && !msgDiv.classList.contains('correct')) {
                msgDiv.classList.add('correct');
                const span = msgDiv.querySelector('span');
                if (span) span.textContent += ' (DOĞRU BİLDİ!)';
                break;
            }
        }

        const card = document.querySelector('.card-tabu');
        if (card) {
            card.style.borderColor = 'var(--success)';
            card.style.boxShadow = '0 10px 40px var(--success-bg)';
            setTimeout(() => {
                card.style.borderColor = '';
                card.style.boxShadow = '';
            }, 2000);
        }
    }

    updateLeaderboard(players = [], chatScores = {}) {
        const list = document.getElementById('leaderboard-list');
        if (!list) return;
        list.innerHTML = '';

        // 1. Streamers Section
        if (players.length > 0) {
            const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
            
            const header = document.createElement('div');
            header.style.fontSize = '0.8rem';
            header.style.fontWeight = '700';
            header.style.color = 'var(--primary-purple)';
            header.style.textTransform = 'uppercase';
            header.style.marginBottom = '6px';
            header.textContent = 'Yayıncı Skorları';
            list.appendChild(header);

            sortedPlayers.forEach(p => {
                const item = document.createElement('div');
                item.className = 'leaderboard-item';
                item.style.fontWeight = '700';

                let icon = '🟣';
                if (p.platform === 'kick') icon = '🟢';
                else if (p.platform === 'both') icon = '⚡';

                item.innerHTML = `
                    <span>${icon} @${window.escapeHtml(p.name)}</span>
                    <span style="color:var(--success); font-weight:bold;">${p.score} Puan</span>
                `;
                list.appendChild(item);
            });
        }

        // 2. Chatters Section
        const sortedChatScores = Object.entries(chatScores).sort((a, b) => b[1] - a[1]);
        if (sortedChatScores.length > 0) {
            const header = document.createElement('div');
            header.style.fontSize = '0.8rem';
            header.style.fontWeight = '700';
            header.style.color = 'var(--warning)';
            header.style.textTransform = 'uppercase';
            header.style.margin = '12px 0 6px 0';
            header.textContent = 'Top Chat Tahmincileri';
            list.appendChild(header);

            sortedChatScores.forEach(([uname, score]) => {
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
    }

    updateTimer(seconds) {
        const timerEl = document.getElementById('turn-timer');
        if (timerEl) {
            timerEl.textContent = seconds;
        }
    }
}

/**
 * Function to handle index.html initialization (login form & mode selection)
 */
function initChatTabuIndexPage() {
    const toggleTwitch = document.getElementById('toggle-twitch');
    const toggleKick = document.getElementById('toggle-kick');
    const platformInput = document.getElementById('platform-select');
    const modeCards = document.querySelectorAll('.mode-card');
    const modeInput = document.getElementById('game-mode-select');
    const singleChannelGroup = document.getElementById('single-channel-group');
    const dualChannelGroup = document.getElementById('dual-channel-group');
    const singlePlatformIcon = document.getElementById('single-platform-icon');
    const soloActions = document.getElementById('solo-actions');
    const multiplayerActions = document.getElementById('multiplayer-actions');
    const loginStatus = document.getElementById('login-status');

    let isTwitchActive = true;
    let isKickActive = false;

    const updatePlatformUI = () => {
        if (toggleTwitch) {
            if (isTwitchActive) {
                toggleTwitch.classList.add('active');
                toggleTwitch.style.border = '2px solid #9146FF';
                toggleTwitch.style.background = 'rgba(145, 70, 255, 0.2)';
                toggleTwitch.style.color = '#fff';
                toggleTwitch.style.boxShadow = '0 4px 12px rgba(145,70,255,0.3)';
            } else {
                toggleTwitch.classList.remove('active');
                toggleTwitch.style.border = '2px solid var(--btn-secondary-border)';
                toggleTwitch.style.background = 'var(--input-bg)';
                toggleTwitch.style.color = 'var(--text-muted)';
                toggleTwitch.style.boxShadow = 'none';
            }
        }

        if (toggleKick) {
            if (isKickActive) {
                toggleKick.classList.add('active');
                toggleKick.style.border = '2px solid #53FC18';
                toggleKick.style.background = 'rgba(83, 252, 24, 0.15)';
                toggleKick.style.color = '#fff';
                toggleKick.style.boxShadow = '0 4px 12px rgba(83,252,24,0.2)';
            } else {
                toggleKick.classList.remove('active');
                toggleKick.style.border = '2px solid var(--btn-secondary-border)';
                toggleKick.style.background = 'var(--input-bg)';
                toggleKick.style.color = 'var(--text-muted)';
                toggleKick.style.boxShadow = 'none';
            }
        }

        if (isTwitchActive && isKickActive) {
            if (platformInput) platformInput.value = 'both';
            if (singleChannelGroup) singleChannelGroup.style.display = 'none';
            if (dualChannelGroup) dualChannelGroup.style.display = 'block';
        } else if (isKickActive) {
            if (platformInput) platformInput.value = 'kick';
            if (singleChannelGroup) singleChannelGroup.style.display = 'block';
            if (dualChannelGroup) dualChannelGroup.style.display = 'none';
            if (singlePlatformIcon) {
                singlePlatformIcon.textContent = '🟢';
                singlePlatformIcon.style.color = '#53FC18';
            }
        } else {
            if (platformInput) platformInput.value = 'twitch';
            if (singleChannelGroup) singleChannelGroup.style.display = 'block';
            if (dualChannelGroup) dualChannelGroup.style.display = 'none';
            if (singlePlatformIcon) {
                singlePlatformIcon.textContent = '@';
                singlePlatformIcon.style.color = 'var(--primary-purple)';
            }
        }
    };

    if (toggleTwitch) {
        toggleTwitch.addEventListener('click', () => {
            if (isTwitchActive && !isKickActive) return;
            isTwitchActive = !isTwitchActive;
            updatePlatformUI();
        });
    }

    if (toggleKick) {
        toggleKick.addEventListener('click', () => {
            if (isKickActive && !isTwitchActive) return;
            isKickActive = !isKickActive;
            updatePlatformUI();
        });
    }

    // Mode Card Click Handler
    modeCards.forEach(card => {
        card.addEventListener('click', () => {
            modeCards.forEach(c => {
                c.classList.remove('active');
                c.style.border = '2px solid var(--btn-secondary-border)';
                c.style.background = 'var(--input-bg)';
            });
            card.classList.add('active');
            card.style.border = '2px solid var(--primary-purple)';
            card.style.background = 'var(--header-bg)';

            const mode = card.dataset.mode;
            if (modeInput) modeInput.value = mode;

            if (mode === 'solo') {
                if (soloActions) soloActions.style.display = 'block';
                if (multiplayerActions) multiplayerActions.style.display = 'none';
            } else {
                if (soloActions) soloActions.style.display = 'none';
                if (multiplayerActions) multiplayerActions.style.display = 'flex';
            }
        });
    });

    const checkEasterEgg = (nameStr) => {
        if (!nameStr) return nameStr;
        if (nameStr.toLowerCase().trim() === 'pairaaa') {
            if (window.showToast) window.showToast('canım ablam 💜', 'info');
            return 'canım ablam 💜';
        }
        return nameStr;
    };

    const getFormValues = () => {
        const platform = platformInput?.value || 'twitch';
        const mode = modeInput?.value || 'solo';

        if (platform === 'both') {
            const twitchCh = document.getElementById('twitch-channel-input')?.value.trim();
            const kickCh = document.getElementById('kick-channel-input')?.value.trim();

            if (!twitchCh && !kickCh) {
                if (loginStatus) loginStatus.innerText = 'Lütfen en az bir kanal kullanıcı adı girin!';
                if (window.showToast) window.showToast('Lütfen en az bir kanal kullanıcı adı girin!', 'error');
                return null;
            }

            const rawTwitch = twitchCh || kickCh;
            const rawKick = kickCh || twitchCh;
            const channelObj = { twitch: rawTwitch, kick: rawKick };

            let displayName = twitchCh && kickCh ? `${twitchCh} (Twitch & Kick)` : rawTwitch;
            if (rawTwitch.toLowerCase() === 'pairaaa' || rawKick.toLowerCase() === 'pairaaa') {
                displayName = 'canım ablam 💜';
                if (window.showToast) window.showToast('canım ablam 💜', 'info');
            }

            return {
                channel: JSON.stringify(channelObj),
                platform: 'both',
                mode: mode,
                displayName: displayName
            };
        } else {
            const channel = document.getElementById('channel-input')?.value.trim();
            if (!channel) {
                if (loginStatus) loginStatus.innerText = 'Lütfen bir kanal kullanıcı adı girin!';
                if (window.showToast) window.showToast('Lütfen bir kanal kullanıcı adı girin!', 'error');
                return null;
            }
            const displayName = checkEasterEgg(channel);
            return {
                channel: channel,
                platform: platform,
                mode: mode,
                displayName: displayName
            };
        }
    };

    document.getElementById('btn-start-solo')?.addEventListener('click', () => {
        const vals = getFormValues();
        if (!vals) return;
        sessionStorage.setItem('chattabu_channel', vals.channel);
        sessionStorage.setItem('chattabu_platform', vals.platform);
        sessionStorage.setItem('chattabu_display_name', vals.displayName);
        sessionStorage.setItem('chattabu_mode', 'solo');
        window.location.href = 'game.html';
    });

    document.getElementById('btn-host')?.addEventListener('click', () => {
        const vals = getFormValues();
        if (!vals) return;
        sessionStorage.setItem('chattabu_channel', vals.channel);
        sessionStorage.setItem('chattabu_platform', vals.platform);
        sessionStorage.setItem('chattabu_display_name', vals.displayName);
        sessionStorage.setItem('chattabu_mode', 'multiplayer');
        sessionStorage.setItem('chattabu_isHost', 'true');
        window.location.href = 'game.html';
    });

    document.getElementById('btn-join')?.addEventListener('click', () => {
        const vals = getFormValues();
        if (!vals) return;
        const roomCodeInput = document.getElementById('room-code-input');
        const roomCode = roomCodeInput ? roomCodeInput.value.trim().toUpperCase() : '';
        if (!roomCode || roomCode.length !== 6) {
            if (loginStatus) loginStatus.innerText = 'Lütfen geçerli bir 6 haneli oda kodu girin!';
            if (window.showToast) window.showToast('Lütfen geçerli bir 6 haneli oda kodu girin!', 'error');
            return;
        }
        sessionStorage.setItem('chattabu_channel', vals.channel);
        sessionStorage.setItem('chattabu_platform', vals.platform);
        sessionStorage.setItem('chattabu_display_name', vals.displayName);
        sessionStorage.setItem('chattabu_mode', 'multiplayer');
        sessionStorage.setItem('chattabu_isHost', 'false');
        sessionStorage.setItem('chattabu_room', roomCode);
        window.location.href = 'game.html';
    });
}

/**
 * Main Game Controller initialization for game.html
 */
document.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('login-screen')) {
        initChatTabuIndexPage();
        return;
    }

    if (!document.getElementById('game-screen')) return;

    const engine = new ChatTabuGameEngine();
    const view = new ChatTabuView();
    if (window.PairaAudio) window.PairaAudio.init();

    await engine.loadWords();

    // DOM Controls
    const btnSkip = document.getElementById('btn-skip');
    const btnTaboo = document.getElementById('btn-taboo');
    const btnStartGame = document.getElementById('btn-start-game');
    const btnLeaveLobby = document.getElementById('btn-leave-lobby');
    const btnLeaveGame = document.getElementById('btn-leave-game');
    const btnToggleVisibility = document.getElementById('btn-toggle-visibility');

    if (btnToggleVisibility) {
        btnToggleVisibility.addEventListener('click', () => {
            view.setWordVisibility(!view.wordVisible);
        });
    }

    if (btnSkip) {
        btnSkip.addEventListener('click', () => {
            if (engine.state.mode === 'solo') {
                if (engine.state.isGameOver) {
                    view.setWordVisibility(true);
                    engine.startGameSolo();
                    view.updateGameUI(engine.state, null);
                    return;
                }
                if (!engine.state.isGameStarted || engine.state.isPaused) return;
                engine.nextWord();
                return;
            }

            if (window.Network && window.Network.isHost()) {
                if (engine.state.isGameOver) {
                    view.setWordVisibility(true);
                    engine.startMultiplayer(window.Network.getMyId(), engine.state.settings);
                    window.Network.broadcastToClients({ type: 'START_GAME', state: engine.state, hostNow: window.PairaTime.now() });
                    view.updateGameUI(engine.state, window.Network.getMyId());
                    view.updateLeaderboard(engine.state.players, engine.state.scores);
                } else if (engine.state.isGameStarted && !engine.state.isPaused && engine.state.turnId === window.Network.getMyId()) {
                    engine.nextWord();
                    window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
                }
            } else if (window.Network && engine.state.isGameStarted && !engine.state.isGameOver && !engine.state.isPaused && engine.state.turnId === window.Network.getMyId()) {
                window.Network.sendToHost({ type: 'SKIP_WORD' });
            }
        });
    }

    if (btnTaboo) {
        btnTaboo.addEventListener('click', () => {
            if (!engine.state.isGameStarted || engine.state.isGameOver || engine.state.isPaused) return;
            const myId = window.Network ? window.Network.getMyId() : null;
            if (engine.state.turnId === myId) return;

            if (window.Network && window.Network.isHost()) {
                const narrator = engine.state.players.find(p => p.id === engine.state.turnId);
                if (narrator) {
                    narrator.score = Math.max(0, narrator.score - (engine.state.settings?.tabooPenalty || 1));
                }
                if (window.PairaAudio) window.PairaAudio.play('taboo');
                engine.nextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
                view.updateGameUI(engine.state, window.Network.getMyId());
                view.updateLeaderboard(engine.state.players, engine.state.scores);
            } else if (window.Network) {
                window.Network.sendToHost({ type: 'TABOO_PRESSED' });
            }
        });
    }

    if (btnStartGame) {
        btnStartGame.addEventListener('click', () => {
            if (window.Network && window.Network.isHost()) {
                if (engine.state.players.length < 2) {
                    if (window.showToast) window.showToast("Çoklu yayıncı modu için odada en az 2 yayıncı olmalıdır!", "warning");
                    return;
                }

                const allowAny = document.getElementById('setting-allow-any-chat')?.checked ?? true;
                const turnDuration = Math.min(180, Math.max(30, parseInt(document.getElementById('setting-turn-duration')?.value) || 60));
                const maxRounds = Math.min(15, Math.max(1, parseInt(document.getElementById('setting-max-rounds')?.value) || 5));

                engine.state.turnDuration = turnDuration;
                engine.state.maxRounds = maxRounds;

                let started = false;
                const launchMP = () => {
                    if (started) return;
                    started = true;
                    view.setWordVisibility(true);
                    engine.startMultiplayer(window.Network.getMyId(), { allowAnyChat: allowAny });
                    window.Network.broadcastToClients({ type: 'START_GAME', state: engine.state, hostNow: window.PairaTime.now() });

                    document.getElementById('lobby-screen').classList.remove('active');
                    document.getElementById('game-screen').classList.add('active');

                    view.updateGameUI(engine.state, window.Network.getMyId());
                    view.updateLeaderboard(engine.state.players, engine.state.scores);
                    if (window.showToast) window.showToast("Sohbet bağlandı, oyun başladı!", "success");
                };

                if (view.chatListener && view.chatListener.isConnected) {
                    launchMP();
                } else {
                    if (window.showToast) window.showToast("Sohbete bağlanılıyor...", "info");
                    view.setupChatListener(platform, channelConfig, handleChatMessage, () => {
                        launchMP();
                    });
                    setTimeout(() => { launchMP(); }, 3000);
                }
            }
        });
    }

    const leaveFn = async (title, message, cancelText) => {
        if (typeof window.pairaConfirm === 'function') {
            const confirmed = await window.pairaConfirm({
                title,
                message,
                confirmText: "Ayrıl",
                cancelText,
                confirmType: "danger"
            });
            if (!confirmed) return;
        }
        view.stopChatListener();
        if (window.Network) window.Network.disconnectPeer();
        sessionStorage.removeItem('chattabu_room');
        sessionStorage.removeItem('chattabu_isHost');
        window.location.href = 'index.html';
    };

    if (btnLeaveLobby) btnLeaveLobby.addEventListener('click', () => leaveFn("Lobiden Ayrıl", "Lobiden ayrılmak istediğinize emin misiniz?", "Kal"));
    if (btnLeaveGame) btnLeaveGame.addEventListener('click', () => leaveFn("Oyundan Ayrıl", "Devam eden oyundan ayrılmak istediğinize emin misiniz?", "Oyuna Dön"));

    // Engine callbacks
    engine.onStateChange = (state) => {
        view.updateGameUI(state, window.Network ? window.Network.getMyId() : null);
        view.updateLeaderboard(state.players, state.scores);
    };

    engine.onTimerTick = (seconds) => {
        view.updateTimer(seconds);
    };

    engine.onTimeUp = (state) => {
        if (engine.state.mode === 'solo') {
            engine.state.isGameOver = true;
            engine.setState(engine.state);
            if (window.showToast) window.showToast("3 Dakikalık Süre Doldu! Oyun Bitti.", "warning");
            if (window.PairaAudio) window.PairaAudio.play('end');
            return;
        }
        if (window.Network && window.Network.isHost()) {
            engine.handleTimeUp(window.Network.getMyId(), true);
            window.Network.broadcastToClients({ type: 'TURN_END', nextTurnId: engine.state.turnId });
            window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
            if (window.PairaAudio) window.PairaAudio.play('end');
        }
    };

    engine.onWordMatch = (username, word) => {
        view.triggerCorrectGuess(username);
        if (window.PairaAudio) window.PairaAudio.play('correct');
        if (engine.state.mode !== 'solo' && window.Network && window.Network.isHost()) {
            window.Network.broadcastToClients({
                type: 'GUESSED_CORRECTLY',
                username,
                word: word,
                state: engine.state,
                hostNow: window.PairaTime.now()
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

            view.addChatMessage(username, message, true, false);
            if (isHost) {
                window.Network.broadcastToClients({ type: 'CHAT_MSG', username, message, streamerId: myId });
                engine.checkGuess(username, message, myId, true);
            } else {
                window.Network.sendToHost({ type: 'CHAT_MSG', username, message, streamerId: myId });
            }
        }
    };

    // Init Network & Room State
    const channelRaw = sessionStorage.getItem('chattabu_channel');
    const platform = sessionStorage.getItem('chattabu_platform') || 'twitch';
    let displayName = sessionStorage.getItem('chattabu_display_name') || channelRaw;

    if (channelRaw && channelRaw.toLowerCase().includes('pairaaa')) {
        displayName = 'canım ablam 💜';
    }

    const mode = sessionStorage.getItem('chattabu_mode') || 'solo';
    const isHostUser = sessionStorage.getItem('chattabu_isHost') === 'true';
    const roomCode = sessionStorage.getItem('chattabu_room');

    if (!channelRaw || !platform) {
        window.location.href = 'index.html';
        return;
    }

    let channelConfig = channelRaw;
    try {
        if (channelRaw.startsWith('{')) {
            channelConfig = JSON.parse(channelRaw);
        }
    } catch(e) {}

    engine.state.mode = mode;

    if (mode === 'solo') {
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');

        engine.state.players = [{ id: 'solo-player', name: displayName, platform: platform, score: 0, isHost: true }];
        document.getElementById('channel-name-display').textContent = displayName;
        
        const statusEl = document.getElementById('turn-status');
        if (statusEl) {
            statusEl.textContent = "Sohbete bağlanılıyor, lütfen bekleyin...";
            statusEl.style.borderColor = "var(--warning)";
        }
        if (window.showToast) window.showToast("Sohbete bağlanılıyor... Bağlantı sağlandıktan sonra oyun başlayacak.", "info");

        let gameStarted = false;
        const launchSolo = () => {
            if (gameStarted) return;
            gameStarted = true;
            view.setWordVisibility(true);
            engine.startGameSolo();
            view.updateGameUI(engine.state, null);
            if (window.showToast) window.showToast("Sohbet bağlandı, oyun başladı!", "success");
        };

        view.setupChatListener(platform, channelConfig, handleChatMessage, () => {
            launchSolo();
        });

        setTimeout(() => {
            launchSolo();
        }, 3000);
        return;
    }

    document.getElementById('channel-name-display').textContent = displayName;

    if (isHostUser) {
        document.getElementById('settings-card').style.display = 'flex';
        document.getElementById('room-code-display').style.display = 'flex';
    } else {
        document.getElementById('settings-card').style.display = 'none';
        document.getElementById('room-code-display').style.display = 'none';
    }

    try {
        const data = await window.Network.initPeer(isHostUser ? 'host' : 'client', roomCode);
        const myId = window.Network.getMyId();

        if (isHostUser) {
            if (typeof window.bindStandardLobbyCode === 'function') {
                window.bindStandardLobbyCode({
                    codeSpanId: 'display-room-code',
                    toggleBtnId: 'btn-toggle-code',
                    copyBtnId: 'btn-copy-room',
                    roomCode: data.roomCode
                });
            }
            engine.state.players = [{ id: myId, name: displayName, platform: platform, score: 0, isHost: true }];
            view.updateLobbyPlayers(engine.state.players);
        }
    } catch (e) {
        if (window.showToast) window.showToast(e.message || "Bağlantı hatası", "error");
        window.location.href = 'index.html';
    }

    window.onPlayerJoined = (peerId) => {
        if (window.Network.sendToClient) {
            window.Network.sendToClient(peerId, { type: 'REQUEST_INFO' });
        } else {
            window.Network.broadcastToClients({ type: 'REQUEST_INFO' });
        }
        document.getElementById('lobby-status').textContent = 'Yeni yayıncı katılıyor...';
    };

    window.onPlayerLeft = (peerId) => {
        const wasCurrentTurn = (engine.state.isGameStarted && !engine.state.isGameOver && engine.state.turnId === peerId);
        engine.state.players = engine.state.players.filter(p => p.id !== peerId);
        engine.state.turnOrder = engine.state.turnOrder.filter(id => id !== peerId);

        view.updateLobbyPlayers(engine.state.players);
        window.Network.broadcastToClients({ type: 'SYNC_LOBBY', players: engine.state.players });

        const lobbyStatus = document.getElementById('lobby-status');
        if (lobbyStatus) lobbyStatus.textContent = `${engine.state.players.length} yayıncı odada.`;

        if (engine.state.isGameStarted && !engine.state.isGameOver) {
            if (engine.state.players.length < 2) {
                engine.state.isGameOver = true;
                engine.stopTimer();
                engine.setState(engine.state);
            } else if (wasCurrentTurn) {
                if (engine.state.currentTurnIndex >= engine.state.turnOrder.length) {
                    engine.state.currentTurnIndex = 0;
                }
                engine.state.turnId = engine.state.turnOrder[engine.state.currentTurnIndex] || window.Network.getMyId();
                const duration = (engine.state.turnDuration || 60) * 1000;
                engine.state.turnEndTime = window.PairaTime.now() + duration;
                engine.nextWord();
                engine.startTimer();
            }
            window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
        }
    };

    const ensureClientLiveUI = () => {
        const lobbyScreen = document.getElementById('lobby-screen');
        const gameScreen = document.getElementById('game-screen');
        if (lobbyScreen && lobbyScreen.classList.contains('active')) {
            lobbyScreen.classList.remove('active');
        }
        if (gameScreen && !gameScreen.classList.contains('active')) {
            gameScreen.classList.add('active');
        }
        if (!view.chatListener || !view.chatListener.isConnected) {
            view.setupChatListener(platform, channelConfig, handleChatMessage);
        }
    };

    window.handleNetworkData = (data, sender) => {
        if (data.type === 'REQUEST_INFO') {
            window.Network.sendToHost({ type: 'CLIENT_INFO', channel: displayName, platform, myId: window.Network.getMyId() });
        }
        else if (data.type === 'CLIENT_INFO') {
            if (!window.Network.isHost()) return;
            const senderId = data.myId || sender;
            const existingIndex = engine.state.players.findIndex(p => p.id === senderId);
            const preservedScore = existingIndex >= 0 ? (engine.state.players[existingIndex].score || 0) : 0;
            const preservedHost = existingIndex >= 0 ? Boolean(engine.state.players[existingIndex].isHost) : false;
            const pData = {
                id: senderId,
                name: data.channel,
                platform: data.platform,
                score: preservedScore,
                isHost: preservedHost
            };
            
            if (existingIndex >= 0) {
                engine.state.players[existingIndex] = pData;
            } else {
                engine.state.players.push(pData);
                if (engine.state.isGameStarted && !engine.state.isGameOver && !engine.state.turnOrder.includes(senderId)) {
                    engine.state.turnOrder.push(senderId);
                }
            }

            view.updateLobbyPlayers(engine.state.players);
            window.Network.broadcastToClients({ type: 'SYNC_LOBBY', players: engine.state.players });
            document.getElementById('lobby-status').textContent = `${engine.state.players.length} yayıncı hazır!`;

            if (engine.state.isGameStarted) {
                const syncPayload = {
                    type: 'SYNC_STATE',
                    state: engine.state,
                    hostNow: window.PairaTime.now()
                };
                if (window.Network.sendToClient) {
                    window.Network.sendToClient(senderId, syncPayload);
                }
                window.Network.broadcastToClients(syncPayload);
                view.updateLeaderboard(engine.state.players, engine.state.scores);
            }
        }
        else if (data.type === 'SYNC_LOBBY') {
            engine.state.players = data.players;
            view.updateLobbyPlayers(engine.state.players);
        }
        else if (data.type === 'SYNC_STATE') {
            if (data.hostNow && data.state.turnEndTime) {
                const diff = window.PairaTime.now() - data.hostNow;
                data.state.turnEndTime += diff;
            }
            engine.state = { ...engine.state, ...data.state };
            if (engine.state.isGameStarted) {
                ensureClientLiveUI();
            }
            view.updateGameUI(engine.state, window.Network.getMyId());
            view.updateLeaderboard(engine.state.players, engine.state.scores);
            if (engine.state.isGameStarted && !engine.state.isGameOver) {
                engine.startTimer();
            } else if (engine.state.isGameOver) {
                engine.stopTimer();
            }
        }
        else if (data.type === 'START_GAME') {
            document.getElementById('lobby-screen').classList.remove('active');
            document.getElementById('game-screen').classList.add('active');
            view.setWordVisibility(true);

            if (data.state) {
                if (data.hostNow && data.state.turnEndTime) {
                    const diff = window.PairaTime.now() - data.hostNow;
                    data.state.turnEndTime += diff;
                }
                engine.state = { ...engine.state, ...data.state };
            }

            let started = false;
            const launchClient = () => {
                if (started) return;
                started = true;
                view.updateGameUI(engine.state, window.Network.getMyId());
                view.updateLeaderboard(engine.state.players, engine.state.scores);
                engine.startTimer();
            };

            if (view.chatListener && view.chatListener.isConnected) {
                launchClient();
            } else {
                view.setupChatListener(platform, channelConfig, handleChatMessage, () => {
                    launchClient();
                });
                setTimeout(() => { launchClient(); }, 2500);
            }
        }
        else if (data.type === 'GUESSED_CORRECTLY') {
            if (data.state) {
                if (data.hostNow && data.state.turnEndTime) {
                    const diff = window.PairaTime.now() - data.hostNow;
                    data.state.turnEndTime += diff;
                }
                engine.state = { ...engine.state, ...data.state };
            }
            view.triggerCorrectGuess(data.username);
            view.updateGameUI(engine.state, window.Network.getMyId());
            view.updateLeaderboard(engine.state.players, engine.state.scores);
            if (window.PairaAudio) window.PairaAudio.play('correct');
        }
        else if (data.type === 'SKIP_WORD') {
            if (window.Network.isHost() && engine.state.isGameStarted && !engine.state.isGameOver && !engine.state.isPaused && sender === engine.state.turnId) {
                engine.nextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
            }
        }
        else if (data.type === 'CHAT_MSG') {
            view.addChatMessage(data.username, data.message, false, false);
            if (window.Network.isHost()) {
                engine.checkGuess(data.username, data.message, data.streamerId || sender, true);
            }
        }
        else if (data.type === 'TABOO_PRESSED') {
            if (window.Network.isHost() && engine.state.isGameStarted && !engine.state.isGameOver && !engine.state.isPaused && sender !== engine.state.turnId) {
                const narrator = engine.state.players.find(p => p.id === engine.state.turnId);
                if (narrator) {
                    narrator.score = Math.max(0, narrator.score - (engine.state.settings?.tabooPenalty || 1));
                }
                if (window.PairaAudio) window.PairaAudio.play('taboo');
                engine.nextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
                view.updateGameUI(engine.state, window.Network.getMyId());
                view.updateLeaderboard(engine.state.players, engine.state.scores);
            }
        }
        else if (data.type === 'TURN_END') {
            engine.state.turnId = data.nextTurnId;
            engine.setState(engine.state);
            if (window.PairaAudio) window.PairaAudio.play('end');
        }
    };
});
