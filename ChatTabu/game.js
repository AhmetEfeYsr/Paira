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
        const cleanGuess = guess.toLocaleLowerCase('tr-TR').trim();
        const cleanTarget = target.toLocaleLowerCase('tr-TR').trim();
        if (cleanGuess === cleanTarget) return true;

        if (this.fuzzyMatcher) {
            return this.fuzzyMatcher.isMatch(cleanGuess, cleanTarget, 1.0);
        }
        return cleanGuess === cleanTarget;
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

        this.setState(this.state);
        this.nextWord();
        this.startTimer();
    }

    nextWord() {
        if (this.wordDatabase.length === 0) return;
        this.currentWordIndex = (this.currentWordIndex + 1) % this.wordDatabase.length;
        this.state.activeWord = this.wordDatabase[this.currentWordIndex];
        this.state.isPaused = false;
        if (this.state.isGameStarted && this.state.mode !== 'solo') {
            const duration = (this.state.turnDuration || 60) * 1000;
            this.state.turnEndTime = window.PairaTime.now() + duration;
        }
        this.setState(this.state);
    }

    checkGuess(username, message, streamerId, isHost) {
        if (this.state.isPaused || !this.state.activeWord) return false;

        if (this.isMatch(message, this.state.activeWord.ana_kelime)) {
            this.state.isPaused = true;

            const allowAny = this.state.settings ? this.state.settings.allowAnyChat : true;
            const isTurnStreamer = streamerId === this.state.turnId;

            // In solo mode or when allowAnyChat is true or guess comes from active narrator's chat
            if (this.state.mode === 'solo' || allowAny || isTurnStreamer) {
                if (!this.state.scores[username]) this.state.scores[username] = 0;
                this.state.scores[username] += 1;

                if (this.state.mode === 'solo') {
                    const hostPlayer = this.state.players.find(p => p.isHost);
                    if (hostPlayer) hostPlayer.score += 1;
                } else {
                    const targetPlayer = this.state.players.find(p => p.id === streamerId) || this.state.players.find(p => p.id === this.state.turnId);
                    if (targetPlayer) {
                        targetPlayer.score += 1;
                    }
                }

                this.setState(this.state);
                if (this.onWordMatch) this.onWordMatch(username, this.state.activeWord);

                setTimeout(() => {
                    if (this.state.mode === 'solo' || isHost) {
                        this.nextWord();
                    }
                }, 2000);

                return true;
            }
        }
        return false;
    }

    handleTimeUp(myId, isHost) {
        if (!isHost || this.state.isGameOver) return;

        if (this.state.mode === 'solo') {
            this.state.isGameOver = true;
            this.setState(this.state);
            return;
        }

        // Advance to next streamer turn in multi-streamer room
        this.state.currentTurnIndex = (this.state.currentTurnIndex + 1) % (this.state.turnOrder.length || 1);
        
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
    }
}

/**
 * ChatTabuView - Handles UI updates and rendering
 */
class ChatTabuView {
    constructor() {
        this.chatListener = null;
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
                const icon = p?.platform === 'both' ? '⚡ Twitch + Kick' : (p?.platform === 'kick' ? '🟢 Kick' : '🟣 Twitch');
                activeTurnIndicator.innerHTML = `<span>👤 Tek Oyunculu Mod (${icon})</span>`;
            } else if (activePlayer) {
                let icon = '🟣';
                if (activePlayer.platform === 'kick') icon = '🟢';
                else if (activePlayer.platform === 'both') icon = '⚡';

                activeTurnIndicator.innerHTML = `
                    <span>🎙️ Anlatan Yayıncı:</span>
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

        if (state.isGameOver) {
            statusEl.textContent = "Oyun Bitti!";
            statusEl.style.borderColor = "var(--warning)";
            if (roundDisplay) roundDisplay.textContent = "Oyun Bitti";
            if (turnTimer) turnTimer.style.display = "none";

            if (state.mode === 'solo') {
                controls.style.display = "flex";
                const btnSkip = document.getElementById('btn-skip');
                if (btnSkip) {
                    btnSkip.style.display = 'inline-block';
                    btnSkip.textContent = 'Yeniden Başlat';
                }
                if (document.getElementById('btn-taboo')) document.getElementById('btn-taboo').style.display = 'none';

                const hostP = state.players.find(p => p.isHost);
                const score = hostP ? hostP.score : 0;
                mainEl.textContent = `SÜRE DOLDU! (${score} Kelime)`;
                fbEl.innerHTML = `<li>3 Dakikalık Tur Tamamlandı</li><li>Toplam Bilinen: ${score} Kelime</li>`;
            } else {
                controls.style.display = "none";
                const sorted = [...state.players].sort((a, b) => b.score - a.score);
                const winner = sorted[0];
                let winnerText = winner ? `🏆 Kazanan: @${winner.name} (${winner.score} Puan)!` : "Oyun Bitti";
                mainEl.textContent = winnerText;

                fbEl.innerHTML = sorted.map(p => `<li>@${window.escapeHtml(p.name)}: ${p.score} Puan</li>`).join('');
            }
            return;
        }

        if (state.mode === 'solo') {
            statusEl.textContent = "Kelimeleri Sohbete Anlat!";
            statusEl.style.borderColor = "var(--success)";
            controls.style.display = "flex";
            if (toggleVisibilityBtn) toggleVisibilityBtn.style.display = 'flex';

            const btnSkip = document.getElementById('btn-skip');
            if (btnSkip) {
                btnSkip.style.display = 'inline-block';
                btnSkip.textContent = 'Pas Geç';
            }
            if (document.getElementById('btn-taboo')) document.getElementById('btn-taboo').style.display = 'none';

            if (state.activeWord) {
                mainEl.textContent = state.activeWord.ana_kelime.toLocaleUpperCase('tr-TR');
                fbEl.innerHTML = state.activeWord.yasakli_kelimeler.map(w => `<li>${window.escapeHtml(w.toLocaleUpperCase('tr-TR'))}</li>`).join('');
            }
        } else if (isMyTurn) {
            statusEl.textContent = "Sıra Sende! Anlat Bakalım.";
            statusEl.style.borderColor = "var(--success)";
            controls.style.display = "flex";
            if (toggleVisibilityBtn) toggleVisibilityBtn.style.display = 'flex';

            document.getElementById('btn-skip').style.display = 'inline-block';
            if (document.getElementById('btn-taboo')) document.getElementById('btn-taboo').style.display = 'none';

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
                document.getElementById('btn-skip').style.display = 'none';
                if (document.getElementById('btn-taboo')) document.getElementById('btn-taboo').style.display = 'inline-block';

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

    await engine.loadWords();

    // DOM Controls
    const btnSkip = document.getElementById('btn-skip');
    const btnTaboo = document.getElementById('btn-taboo');
    const btnStartGame = document.getElementById('btn-start-game');
    const btnLeaveLobby = document.getElementById('btn-leave-lobby');
    const btnLeaveGame = document.getElementById('btn-leave-game');
    const btnToggleVisibility = document.getElementById('btn-toggle-visibility');
    const iconEyeOpen = document.getElementById('icon-eye-open');
    const iconEyeClosed = document.getElementById('icon-eye-closed');

    let wordVisible = true;

    if (btnToggleVisibility) {
        btnToggleVisibility.addEventListener('click', () => {
            wordVisible = !wordVisible;
            const mainWord = document.getElementById('main-word');
            const forbiddenWords = document.getElementById('forbidden-words');

            if (wordVisible) {
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
        });
    }

    if (btnSkip) {
        btnSkip.addEventListener('click', () => {
            if (engine.state.mode === 'solo') {
                if (engine.state.isGameOver) {
                    engine.startGameSolo();
                    view.updateGameUI(engine.state, null);
                } else {
                    engine.nextWord();
                }
            } else if (window.Network && window.Network.isHost()) {
                engine.nextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
            } else {
                window.Network.sendToHost({ type: 'SKIP_WORD' });
            }
        });
    }

    if (btnTaboo) {
        btnTaboo.addEventListener('click', () => {
            if (window.Network && window.Network.isHost()) {
                const narrator = engine.state.players.find(p => p.id === engine.state.turnId);
                if (narrator) {
                    narrator.score = Math.max(0, narrator.score - 1);
                }
                engine.nextWord();
                window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state, hostNow: window.PairaTime.now() });
                view.updateGameUI(engine.state, window.Network.getMyId());
                view.updateLeaderboard(engine.state.players, engine.state.scores);
            } else {
                window.Network.sendToHost({ type: 'TABOO_PRESSED' });
            }
        });
    }

    if (btnStartGame) {
        btnStartGame.addEventListener('click', () => {
            if (window.Network && window.Network.isHost()) {
                const allowAny = document.getElementById('setting-allow-any-chat')?.checked ?? true;
                const turnDuration = parseInt(document.getElementById('setting-turn-duration')?.value) || 60;
                const maxRounds = parseInt(document.getElementById('setting-max-rounds')?.value) || 5;

                engine.state.turnDuration = turnDuration;
                engine.state.maxRounds = maxRounds;

                let started = false;
                const launchMP = () => {
                    if (started) return;
                    started = true;
                    engine.startMultiplayer(window.Network.getMyId(), { allowAnyChat: allowAny });
                    window.Network.broadcastToClients({ type: 'START_GAME', state: engine.state });

                    document.getElementById('lobby-screen').classList.remove('active');
                    document.getElementById('game-screen').classList.add('active');

                    view.updateGameUI(engine.state, window.Network.getMyId());
                    view.updateLeaderboard(engine.state.players, engine.state.scores);
                    if (window.showToast) window.showToast("Sohbet Bağlandı! Oyun Başladı! 🎉", "success");
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

    const leaveFn = () => {
        view.stopChatListener();
        if (window.Network) window.Network.disconnectPeer();
        sessionStorage.removeItem('chattabu_room');
        sessionStorage.removeItem('chattabu_isHost');
        window.location.href = 'index.html';
    };

    if (btnLeaveLobby) btnLeaveLobby.addEventListener('click', leaveFn);
    if (btnLeaveGame) btnLeaveGame.addEventListener('click', leaveFn);

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
            window.Network.broadcastToClients({ type: 'SYNC_STATE', state: engine.state });
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
                state: engine.state
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
            statusEl.textContent = "⏳ Sohbete Bağlanılıyor, Lütfen Bekleyin...";
            statusEl.style.borderColor = "var(--warning)";
        }
        if (window.showToast) window.showToast("Sohbete bağlanılıyor... Bağlantı sağlandıktan sonra oyun başlayacak.", "info");

        let gameStarted = false;
        const launchSolo = () => {
            if (gameStarted) return;
            gameStarted = true;
            engine.startGameSolo();
            view.updateGameUI(engine.state, null);
            if (window.showToast) window.showToast("Sohbet Bağlandı! Oyun Başladı! 🎉", "success");
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
            document.getElementById('room-code-val').textContent = data.roomCode;
            engine.state.players = [{ id: myId, name: displayName, platform: platform, score: 0, isHost: true }];
            view.updateLobbyPlayers(engine.state.players);
        }
    } catch (e) {
        if (window.showToast) window.showToast(e.message || "Bağlantı hatası", "error");
        else alert(e.message || "Bağlantı hatası");
        window.location.href = 'index.html';
    }

    window.onPlayerJoined = (peerId) => {
        window.Network.broadcastToClients({ type: 'REQUEST_INFO' });
        document.getElementById('lobby-status').textContent = 'Yeni yayıncı katılıyor...';
    };

    window.onPlayerLeft = (peerId) => {
        engine.state.players = engine.state.players.filter(p => p.id !== peerId);
        engine.state.turnOrder = engine.state.turnOrder.filter(id => id !== peerId);

        view.updateLobbyPlayers(engine.state.players);
        window.Network.broadcastToClients({ type: 'SYNC_LOBBY', players: engine.state.players });

        document.getElementById('lobby-status').textContent = `${engine.state.players.length} yayıncı odada.`;
    };

    window.handleNetworkData = (data, sender) => {
        if (data.type === 'REQUEST_INFO') {
            window.Network.sendToHost({ type: 'CLIENT_INFO', channel: displayName, platform, myId: window.Network.getMyId() });
        }
        else if (data.type === 'CLIENT_INFO') {
            const senderId = data.myId || sender;
            const existingIndex = engine.state.players.findIndex(p => p.id === senderId);
            const pData = { id: senderId, name: data.channel, platform: data.platform, score: 0, isHost: false };
            
            if (existingIndex >= 0) {
                engine.state.players[existingIndex] = pData;
            } else {
                engine.state.players.push(pData);
            }

            view.updateLobbyPlayers(engine.state.players);
            window.Network.broadcastToClients({ type: 'SYNC_LOBBY', players: engine.state.players });
            document.getElementById('lobby-status').textContent = `${engine.state.players.length} yayıncı hazır!`;
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
            view.updateGameUI(engine.state, window.Network.getMyId());
            view.updateLeaderboard(engine.state.players, engine.state.scores);
        }
        else if (data.type === 'START_GAME') {
            document.getElementById('lobby-screen').classList.remove('active');
            document.getElementById('game-screen').classList.add('active');

            if (data.state) {
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

            view.setupChatListener(platform, channelConfig, handleChatMessage, () => {
                launchClient();
            });
            setTimeout(() => { launchClient(); }, 2500);
        }
        else if (data.type === 'GUESSED_CORRECTLY') {
            if (data.state) {
                engine.state = { ...engine.state, ...data.state };
            }
            view.triggerCorrectGuess(data.username);
            view.updateGameUI(engine.state, window.Network.getMyId());
            view.updateLeaderboard(engine.state.players, engine.state.scores);
            if (window.PairaAudio) window.PairaAudio.play('correct');
        }
        else if (data.type === 'SKIP_WORD') {
            if (window.Network.isHost()) {
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
            if (window.Network.isHost() && !engine.state.isGameOver && engine.state.isGameStarted) {
                const narrator = engine.state.players.find(p => p.id === engine.state.turnId);
                if (narrator) {
                    narrator.score = Math.max(0, narrator.score - 1);
                }
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
