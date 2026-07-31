/**
 * KelimeAviGameEngine - Core game logic
 */
class KelimeAviGameEngine {
    constructor(isHost = true) {
        this.isHost = isHost;
        
        this.state = {
            status: 'lobby', // lobby, ebe_word_select, playing, countdown, evaluating, finished
            players: {},
            round: 1,
            totalRounds: 5,
            turnDuration: 45,
            timeIncrease: 15,
            settings: {
                ebeWinPts: 2,
                masumWinPts: 1,
                jackpotPts: 5
            },
            currentEbe: null,
            targetWord: '',
            revealedLetters: 1,
            submittedWords: {},
            ebeGuesses: [],
            countdownSec: 3
        };

        this.onStateChange = null;
        this.onTimerTick = null;
        this.onSound = null;
        this.onShowResult = null;
        this.onCountdownTick = null;

        this.localEndTime = 0;
        this.renderFrame = null;
        this.lastTickSec = -1;
        this.countdownInterval = null;
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        if (this.onStateChange) this.onStateChange(this.state);
    }

    addPlayer(id, name, isHost) {
        this.state.players[id] = { id, name, role: 'masum', isHost, score: 0, disconnected: false };
        this.setState({ players: this.state.players });
    }

    removePlayer(id) {
        if (this.state.status === 'playing' || this.state.status === 'ebe_word_select' || this.state.status === 'countdown') {
            this.state.players[id].disconnected = true;
            
            const activeCount = Object.keys(this.state.players).filter(pid => !this.state.players[pid].disconnected).length;
            if (activeCount < 3) {
                this.endRoundPrematurely("Oyuncu sayısı 3'ün altına düştüğü için oyun lobiye döndürüldü.");
                setTimeout(() => {
                    this.backToLobby();
                }, 5000);
                return;
            }

            if (this.state.currentEbe === id) {
                this.endRoundPrematurely("Ebe'nin bağlantısı koptuğu için tur iptal edildi.");
            }
            this.setState({ players: this.state.players });
        } else {
            delete this.state.players[id];
            this.setState({ players: this.state.players });
        }
    }

    startGame(settings) {
        if (!this.isHost) return false;
        const playerIds = Object.keys(this.state.players).filter(id => !this.state.players[id].disconnected);
        if (playerIds.length < 3) return false;

        this.state.totalRounds = parseInt(settings.totalRounds) || 5;
        this.state.turnDuration = parseInt(settings.turnDuration) || 45;
        this.state.timeIncrease = parseInt(settings.timeIncrease) || 15;
        this.state.settings.ebeWinPts = parseInt(settings.ebeWinPts) || 2;
        this.state.settings.masumWinPts = parseInt(settings.masumWinPts) || 1;
        this.state.settings.jackpotPts = parseInt(settings.jackpotPts) || 5;

        playerIds.forEach(id => this.state.players[id].score = 0);
        
        // Rotate Ebe once per GAME SESSION (new game)
        if (this.state.ebeIndex === undefined || this.state.ebeIndex >= playerIds.length - 1) {
            this.state.ebeIndex = 0;
        } else {
            this.state.ebeIndex++;
        }
        
        this.state.currentEbe = playerIds[this.state.ebeIndex] || playerIds[0];
        playerIds.forEach(id => {
            this.state.players[id].role = (id === this.state.currentEbe) ? 'ebe' : 'masum';
        });

        this.state.round = 1;
        this.state.revealedLetters = 1;
        this.state.targetWord = '';
        this.state.submittedWords = {};
        this.state.ebeGuesses = [];
        this.state.status = 'ebe_word_select';

        if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
        if (this.countdownInterval) clearInterval(this.countdownInterval);

        this.setState(this.state);
        if (this.onTimerTick) this.onTimerTick(this.state.turnDuration);
        return true;
    }

    startNextRound() {
        this.state.submittedWords = {};
        this.state.ebeGuesses = [];
        this.state.status = 'playing';

        if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
        if (this.countdownInterval) clearInterval(this.countdownInterval);

        this.localEndTime = window.PairaTime.now() + (this.state.turnDuration * 1000);
        this.setState(this.state);
        this.startRenderTimer();

        if (this.onTimerTick) {
            this.onTimerTick(this.state.turnDuration);
        }
    }

    handleEbeTargetWord(peerId, word) {
        if (!this.isHost || (this.state.status !== 'ebe_word_select' && this.state.status !== 'playing')) return;
        if (peerId !== this.state.currentEbe) return;

        const normWord = window.normalizeTurkishChars(word).trim().toUpperCase();
        if (normWord.length < 2) return;

        this.state.targetWord = normWord;
        this.state.revealedLetters = 1;
        this.state.status = 'playing';
        this.localEndTime = window.PairaTime.now() + (this.state.turnDuration * 1000);

        this.setState(this.state);
        this.startRenderTimer();

        // Immediately sync initial timer value to all clients
        if (this.onTimerTick) {
            this.onTimerTick(this.state.turnDuration);
        }
    }

    handleMasumSubmission(peerId, word) {
        if (peerId === this.state.currentEbe) return;

        const normWord = window.normalizeTurkishChars(word).trim().toUpperCase();
        const revealedPart = window.normalizeTurkishChars(this.state.targetWord.substring(0, this.state.revealedLetters)).toUpperCase();

        if (!normWord.startsWith(revealedPart)) return;

        this.state.submittedWords[peerId] = normWord;
        if (this.isHost) {
            this.setState(this.state);
        }
    }

    handleEbeGuesses(peerId, guesses) {
        if (peerId !== this.state.currentEbe) return;
        this.state.ebeGuesses = guesses.map(g => window.normalizeTurkishChars(g).trim().toUpperCase());
        if (this.isHost) {
            this.setState(this.state);
        }
    }

    handleTriggerMatch(peerId) {
        if (!this.isHost || this.state.status !== 'playing') return;
        this.start3SecCountdown();
    }

    start3SecCountdown() {
        if (!this.isHost) return;
        this.state.status = 'countdown';
        this.state.countdownSec = 3;
        this.setState(this.state);

        if (this.onSound) this.onSound('tick');

        let count = 3;
        if (this.countdownInterval) clearInterval(this.countdownInterval);

        this.countdownInterval = setInterval(() => {
            count--;
            this.state.countdownSec = count;
            if (this.onCountdownTick) this.onCountdownTick(count);

            if (count > 0) {
                if (this.onSound) this.onSound('tick');
            } else {
                clearInterval(this.countdownInterval);
                this.evaluateRound();
            }
        }, 1000);
    }

    evaluateRound() {
        if (!this.isHost) return;
        this.state.status = 'evaluating';

        const targetWord = this.state.targetWord;
        let resultMsg = "";
        let isJackpot = false;
        let isMasumWin = false;
        let isEbeWin = false;

        let normalizedTarget = window.normalizeTurkishChars(targetWord).trim().toUpperCase();

        // Exact match check for Jackpot
        let jackpotWinners = [];
        for (let [peerId, word] of Object.entries(this.state.submittedWords)) {
            if (word === normalizedTarget) {
                jackpotWinners.push(peerId);
                isJackpot = true;
            }
        }

        if (isJackpot) {
            resultMsg = `JACKPOT! Masumlar ana kelimeyi (${targetWord}) tam bildi!`;
            jackpotWinners.forEach(id => {
                if (this.state.players[id]) this.state.players[id].score += this.state.settings.jackpotPts;
            });
            if (this.onSound) this.onSound('correct');
        } else {
            // Strict exact match among masums (NO FUZZY MATCH)
            const wordCounts = {};
            const wordPeerMap = {};

            for (let [peerId, word] of Object.entries(this.state.submittedWords)) {
                if (!word) continue;
                wordCounts[word] = (wordCounts[word] || 0) + 1;
                if (!wordPeerMap[word]) wordPeerMap[word] = [];
                wordPeerMap[word].push(peerId);
            }

            // Find word matched by >= 2 masums
            let matchedWord = null;
            let matchedPeers = [];
            for (let [w, count] of Object.entries(wordCounts)) {
                if (count >= 2) {
                    matchedWord = w;
                    matchedPeers = wordPeerMap[w];
                    break;
                }
            }

            if (matchedWord) {
                // Check if Ebe guessed this exact word
                const ebeCaught = this.state.ebeGuesses.includes(matchedWord);

                if (ebeCaught) {
                    isEbeWin = true;
                    resultMsg = `EBE KAZANDI! Masumların eşleştiği kelimeyi (${matchedWord}) yakaladı.`;
                    if (this.state.players[this.state.currentEbe]) {
                        this.state.players[this.state.currentEbe].score += this.state.settings.ebeWinPts;
                    }
                    if (this.onSound) this.onSound('taboo');
                } else {
                    isMasumWin = true;
                    resultMsg = `MASUMLAR KAZANDI! "${matchedWord}" kelimesinde eşleştiler, Ebe yakalayamadı!`;
                    matchedPeers.forEach(id => {
                        if (this.state.players[id]) {
                            this.state.players[id].score += this.state.settings.masumWinPts;
                        }
                    });
                    if (this.onSound) this.onSound('correct');
                    this.state.revealedLetters++;
                }
            } else {
                resultMsg = "Masumlar kendi aralarında birebir eşleşemedi!";
                if (this.onSound) this.onSound('pass');
            }
        }

        this.setState(this.state);
        if (this.onShowResult) this.onShowResult(resultMsg);

        setTimeout(() => {
            this.handleRoundEndTransition(isJackpot, isEbeWin, isMasumWin);
        }, 4000);
    }

    handleRoundEndTransition(isJackpot, isEbeWin, isMasumWin) {
        const targetLen = this.state.targetWord ? this.state.targetWord.length : 1;

        if (isJackpot || isEbeWin || this.state.round >= this.state.totalRounds || this.state.revealedLetters > targetLen) {
            this.state.status = 'finished';
            this.setState(this.state);
        } else {
            // Next round of the same game with the SAME Ebe and SAME word (1 more letter revealed)
            this.state.round++;
            this.startNextRound();
        }
    }

    endRoundPrematurely(reasonMsg) {
        if (!this.isHost) return;
        this.state.status = 'evaluating';
        this.setState(this.state);
        if (this.onShowResult) this.onShowResult(reasonMsg);
        setTimeout(() => {
            this.startNewTurn();
        }, 4000);
    }

    backToLobby() {
        this.state.status = 'lobby';
        Object.keys(this.state.players).forEach(pId => {
            if (this.state.players[pId].disconnected) {
                delete this.state.players[pId];
            } else {
                this.state.players[pId].score = 0;
            }
        });
        this.setState(this.state);
    }

    startRenderTimer() {
        if (this.renderFrame) cancelAnimationFrame(this.renderFrame);

        const tick = () => {
            if (this.state.status !== 'playing') return;

            const left = Math.max(0, this.localEndTime - window.PairaTime.now());
            const secs = Math.ceil(left / 1000);
            
            if (this.onTimerTick) this.onTimerTick(secs);

            if (secs <= 10 && secs > 0 && this.lastTickSec !== secs) {
                if (this.onSound) this.onSound('tick');
                this.lastTickSec = secs;
            }

            if (left <= 0 && this.isHost) {
                this.evaluateRound();
                return;
            }

            this.renderFrame = requestAnimationFrame(tick);
        };
        this.renderFrame = requestAnimationFrame(tick);
    }
}

/**
 * KelimeAviView - Handles DOM
 */
class KelimeAviView {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.myId = null;
        this.bindEvents();
    }

    setMyId(id) {
        this.myId = id;
    }

    bindEvents() {
        document.getElementById('btn-start-game')?.addEventListener('click', () => {
            const settings = {
                turnDuration: document.getElementById('turn-duration')?.value,
                totalRounds: document.getElementById('round-count')?.value,
                timeIncrease: document.getElementById('time-increase')?.value,
                ebeWinPts: document.getElementById('pts-ebe-win')?.value,
                masumWinPts: document.getElementById('pts-masum-win')?.value,
                jackpotPts: document.getElementById('pts-jackpot')?.value
            };
            this.callbacks.onStartGame(settings);
        });

        document.getElementById('btn-back-to-lobby')?.addEventListener('click', () => {
            this.callbacks.onBackToLobby();
        });

        const btnAdvanced = document.getElementById('btn-toggle-advanced');
        const advancedSettings = document.getElementById('advanced-settings');
        if (btnAdvanced && advancedSettings) {
            btnAdvanced.addEventListener('click', () => {
                advancedSettings.classList.toggle('hidden');
            });
        }

        // Ebe Secret Word Submit
        const btnSubmitEbeTarget = document.getElementById('btn-submit-ebe-target');
        const ebeTargetInput = document.getElementById('ebe-target-input');
        if (btnSubmitEbeTarget && ebeTargetInput) {
            const submitTarget = () => {
                const word = ebeTargetInput.value.trim();
                if (word.length < 2) {
                    if (window.showToast) window.showToast("Lütfen en az 2 harfli bir kelime girin!", "warning");
                    return;
                }
                this.callbacks.onSubmitEbeTargetWord(word);
            };
            btnSubmitEbeTarget.addEventListener('click', submitTarget);
            ebeTargetInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') submitTarget();
            });
        }

        // Masum Word Input & Trigger Match
        const masumInput = document.getElementById('masum-word-input');
        const btnTriggerMatch = document.getElementById('btn-trigger-match');
        if (btnTriggerMatch && masumInput) {
            btnTriggerMatch.addEventListener('click', () => {
                const word = masumInput.value.trim();
                if (word.length > 0) {
                    this.callbacks.onSubmitMasum(word);
                }
                this.callbacks.onTriggerMatch();
            });

            masumInput.addEventListener('change', () => {
                const word = masumInput.value.trim();
                if (word.length > 0) {
                    this.callbacks.onSubmitMasum(word);
                }
            });
        }

        // Ebe Guesses
        const btnSubmitEbe = document.getElementById('btn-submit-ebe');
        if (btnSubmitEbe) {
            const submitEbe = () => {
                const guesses = [
                    document.getElementById('ebe-guess-1')?.value.trim(),
                    document.getElementById('ebe-guess-2')?.value.trim(),
                    document.getElementById('ebe-guess-3')?.value.trim(),
                    document.getElementById('ebe-guess-4')?.value.trim(),
                    document.getElementById('ebe-guess-5')?.value.trim()
                ].filter(g => g && g.length > 0);

                if (guesses.length > 0) {
                    this.callbacks.onSubmitEbe(guesses);
                    if (window.showToast) window.showToast("Tahminler kaydedildi!", "info");
                }
            };
            btnSubmitEbe.addEventListener('click', submitEbe);
            
            [1, 2, 3, 4, 5].forEach(i => {
                const input = document.getElementById(`ebe-guess-${i}`);
                if (input) {
                    input.addEventListener('change', submitEbe);
                }
            });
        }
    }

    updateUI(state, isHost) {
        window._gameState = state;
        if (state.status === 'lobby') {
            window.showScreen('lobby-screen');
        } else if (state.status === 'ebe_word_select' || state.status === 'playing' || state.status === 'countdown' || state.status === 'evaluating') {
            window.showScreen('game-screen');
            this.updateGameUI(state);
        } else if (state.status === 'finished') {
            window.showScreen('winner-screen');
            this.updateWinnerUI(state);
        }
    }

    updateGameUI(state) {
        document.getElementById('round-indicator').innerText = `Tur ${state.round} / ${state.totalRounds}`;
        
        const myId = this.myId;
        const amIEbe = (state.currentEbe === myId);

        const ebeTargetArea = document.getElementById('ebe-target-select-area');
        const masumArea = document.getElementById('masum-area');
        const ebeArea = document.getElementById('ebe-area');
        const letterDisplay = document.getElementById('current-letters');
        const statusMsg = document.getElementById('game-status-message');
        const countdownOverlay = document.getElementById('countdown-overlay');

        // Countdown overlay handling
        if (state.status === 'countdown') {
            countdownOverlay?.classList.remove('hidden');
            const cdNum = document.getElementById('countdown-number');
            if (cdNum) cdNum.innerText = state.countdownSec !== undefined ? state.countdownSec : 3;
        } else {
            countdownOverlay?.classList.add('hidden');
        }

        if (state.status === 'ebe_word_select') {
            // Clear input fields when entering ebe_word_select for new turn
            if (this._lastEbeSelectKey !== `${state.round}_${state.currentEbe}`) {
                this._lastEbeSelectKey = `${state.round}_${state.currentEbe}`;
                const ebeTargetInput = document.getElementById('ebe-target-input');
                if (ebeTargetInput) ebeTargetInput.value = '';

                const masumInput = document.getElementById('masum-word-input');
                if (masumInput) masumInput.value = '';

                [1, 2, 3, 4, 5].forEach(i => {
                    const input = document.getElementById(`ebe-guess-${i}`);
                    if (input) input.value = '';
                });
            }

            if (amIEbe) {
                ebeTargetArea?.classList.remove('hidden');
                masumArea?.classList.add('hidden');
                ebeArea?.classList.add('hidden');
                if (statusMsg) statusMsg.innerText = "Kelimeni gir ve oyunu başlat!";
                if (letterDisplay) letterDisplay.innerText = "???";
            } else {
                ebeTargetArea?.classList.add('hidden');
                masumArea?.classList.add('hidden');
                ebeArea?.classList.add('hidden');
                if (statusMsg) statusMsg.innerText = "Ebe gizli kelimesini belirliyor...";
                if (letterDisplay) letterDisplay.innerText = "Ebe Kelime Seçiyor...";
            }
            this.updateTimer(state.turnDuration || 45);
            return;
        }

        ebeTargetArea?.classList.add('hidden');

        // Clear input fields when a new round starts
        if (state.status === 'playing' && this._lastPlayingRound !== state.round) {
            this._lastPlayingRound = state.round;
            const masumInput = document.getElementById('masum-word-input');
            if (masumInput) masumInput.value = '';
            [1, 2, 3, 4, 5].forEach(i => {
                const input = document.getElementById(`ebe-guess-${i}`);
                if (input) input.value = '';
            });
        }

        if (statusMsg && state.status !== 'evaluating') {
            statusMsg.innerText = amIEbe ? "Ebesin! Sohbeti dinle, kelimeleri tahmin et!" : "Masumsun! Aranızda şifreli konuşun.";
            statusMsg.style.color = 'var(--text-main)';
        }

        if (amIEbe) {
            masumArea?.classList.add('hidden');
            ebeArea?.classList.remove('hidden');
            if (letterDisplay) letterDisplay.innerText = state.targetWord || "???";
        } else {
            masumArea?.classList.remove('hidden');
            ebeArea?.classList.add('hidden');
            const revealed = state.targetWord ? state.targetWord.substring(0, state.revealedLetters) : "";
            if (letterDisplay) letterDisplay.innerText = revealed ? (revealed + "...") : "...";
        }
    }

    updateWinnerUI(state) {
        const scoresDiv = document.getElementById('final-scores');
        if (scoresDiv) {
            scoresDiv.innerHTML = '';
            const sorted = Object.values(state.players).sort((a, b) => b.score - a.score);
            sorted.forEach((p, index) => {
                scoresDiv.innerHTML += `<div style="font-size: 1.2rem; margin: 10px 0;">${index+1}. ${window.escapeHtml(p.name)} - <strong>${p.score} Puan</strong></div>`;
            });
        }

        const btnBack = document.getElementById('btn-back-to-lobby');
        if (btnBack) {
            const isLocalHost = sessionStorage.getItem('isHost') === 'true';
            if (isLocalHost) {
                btnBack.style.display = 'inline-block';
            } else {
                btnBack.style.display = 'none';
            }
        }
    }

    updateTimer(secs) {
        const timerEl = document.getElementById('timer-display');
        if (!timerEl) return;
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        timerEl.innerText = `${m}:${s}`;
        timerEl.style.color = secs <= 10 && secs > 0 ? 'var(--danger)' : 'var(--lilac)';
    }

    showResult(msg) {
        if (window.showToast) window.showToast(msg, "info");
        const gs = document.getElementById('game-status-message');
        if (gs) {
            gs.innerText = msg;
            gs.style.color = 'var(--warning)';
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { KelimeAviGameEngine, KelimeAviView };
} else {
    window.KelimeAviGameEngine = KelimeAviGameEngine;
    window.KelimeAviView = KelimeAviView;
}

