/**
 * KelimeAviGameEngine - Core game logic
 */
class KelimeAviGameEngine {
    constructor(isHost = true) {
        this.isHost = isHost;
        this.matcher = new window.FuzzyMatcher();
        
        this.wordList = [
            "AKINTI", "BARDAK", "CÜZDAN", "DEFTER", "ELMA", "FINDIK", "GÜNEŞ", "HAYVAN", "IRMAK", "KİTAP", "MASA", "NOKTA", "OTOBÜS", "PENCERE", "RADYO", "SAAT", "TELEFON", "UÇAK", "VAGON", "YILDIZ", "ZAMAN",
            "BİLGİSAYAR", "TELEVİZYON", "KAHVE", "ÇAY", "MÜZİK", "SİNEMA", "TİYATRO", "OYUN", "ARABA", "BİSİKLET", "DENİZ", "KUMSAL", "ORMAN", "DAĞ", "KAMP", "TATİL", "FOTOĞRAF", "KAMERA", "TABLET", "KLAVYE", "FARE", "KABLO", "ŞARJ",
            "ELEKTRİK", "IŞIK", "LAMBA", "GÖZLÜK", "YÜZÜK", "KOLYE", "KÜPE", "ŞAPKA", "ATKI", "ELDİVEN", "AYAKKABI", "ÇORAP", "PANTOLON", "GÖMLEK", "KAZAK", "MONT", "CEKET", "KABAN", "YAĞMURLUK", "ŞEMSİYE", "ÇANTA", "ANAHTAR"
        ];

        this.state = {
            status: 'lobby', // lobby, playing, evaluating, finished
            players: {},
            round: 1,
            totalRounds: 3,
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
            ebeGuesses: []
        };

        this.onStateChange = null;
        this.onTimerTick = null;
        this.onSound = null;
        this.onShowResult = null;

        this.localEndTime = 0;
        this.renderFrame = null;
        this.lastTickSec = -1;
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
        if (this.state.status === 'playing') {
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
            } else {
                this.checkAllSubmissions();
            }
            this.setState({ players: this.state.players });
        } else {
            delete this.state.players[id];
            this.setState({ players: this.state.players });
        }
    }

    startGame(settings) {
        if (!this.isHost) return;
        const playerIds = Object.keys(this.state.players).filter(id => !this.state.players[id].disconnected);
        if (playerIds.length < 3) return false;

        this.state.totalRounds = parseInt(settings.totalRounds) || 3;
        this.state.turnDuration = parseInt(settings.turnDuration) || 45;
        this.state.timeIncrease = parseInt(settings.timeIncrease) || 15;
        this.state.settings.ebeWinPts = parseInt(settings.ebeWinPts) || 2;
        this.state.settings.masumWinPts = parseInt(settings.masumWinPts) || 1;
        this.state.settings.jackpotPts = parseInt(settings.jackpotPts) || 5;

        playerIds.forEach(id => this.state.players[id].score = 0);
        this.state.round = 1;
        
        this.startNewTurn();
        return true;
    }

    startNewTurn() {
        this.state.submittedWords = {};
        this.state.ebeGuesses = [];
        this.state.revealedLetters = 1;
        this.state.status = 'playing';

        const playerIds = Object.keys(this.state.players).filter(id => !this.state.players[id].disconnected);
        this.state.currentEbe = playerIds[Math.floor(Math.random() * playerIds.length)];

        playerIds.forEach(id => {
            this.state.players[id].role = (id === this.state.currentEbe) ? 'ebe' : 'masum';
        });

        this.state.targetWord = this.wordList[Math.floor(Math.random() * this.wordList.length)];
        this.localEndTime = window.PairaTime.now() + (this.state.turnDuration * 1000);

        this.setState(this.state);
        this.startRenderTimer();
    }

    handleMasumSubmission(peerId, word) {
        if (!this.isHost || this.state.status !== 'playing') return;
        if (peerId === this.state.currentEbe) return;

        const normWord = window.normalizeTurkishChars(word).trim().toUpperCase();
        const revealedPart = window.normalizeTurkishChars(this.state.targetWord.substring(0, this.state.revealedLetters)).toUpperCase();

        if (!normWord.startsWith(revealedPart)) return;

        this.state.submittedWords[peerId] = normWord;
        this.setState(this.state);
        this.checkAllSubmissions();
    }

    handleEbeGuesses(peerId, guesses) {
        if (!this.isHost || this.state.status !== 'playing') return;
        if (peerId !== this.state.currentEbe) return;
        this.state.ebeGuesses = guesses.map(g => window.normalizeTurkishChars(g).trim().toUpperCase());
        this.setState(this.state);
        this.checkAllSubmissions();
    }

    checkAllSubmissions() {
        if (!this.isHost || this.state.status !== 'playing') return;

        const playerIds = Object.keys(this.state.players);
        const activeMasums = playerIds.filter(id => id !== this.state.currentEbe && !this.state.players[id].disconnected);
        
        const receivedMasumWords = activeMasums.filter(id => this.state.submittedWords[id]).length;
        const ebeSubmitted = this.state.ebeGuesses.length > 0;

        if (receivedMasumWords >= activeMasums.length && ebeSubmitted) {
            this.evaluateRound();
        }
    }

    evaluateRound() {
        if (!this.isHost || this.state.status !== 'playing') return;
        this.state.status = 'evaluating';

        const targetWord = this.state.targetWord;
        let resultMsg = "";
        let isJackpot = false;
        let isMasumWin = false;
        let isEbeWin = false;

        let normalizedTarget = window.normalizeTurkishChars(targetWord).trim().toUpperCase();

        let jackpotWinners = [];
        for (let [peerId, word] of Object.entries(this.state.submittedWords)) {
            if (this.matcher.isMatch(word, normalizedTarget, 0.5)) {
                jackpotWinners.push(peerId);
                isJackpot = true;
            }
        }

        if (isJackpot) {
            resultMsg = "JACKPOT! Masumlar ana kelimeyi buldu!";
            jackpotWinners.forEach(id => {
                if(this.state.players[id]) this.state.players[id].score += this.state.settings.jackpotPts;
            });
            if (this.onSound) this.onSound('correct');
        } else {
            let masumMatch = false;
            let matchedWord = "";
            let matchedPeers = [];

            const entries = Object.entries(this.state.submittedWords);
            for (let i = 0; i < entries.length; i++) {
                let currentMatches = [entries[i][0]];
                for (let j = i + 1; j < entries.length; j++) {
                    if (this.matcher.isMatch(entries[i][1], entries[j][1])) {
                        currentMatches.push(entries[j][0]);
                        matchedWord = entries[i][1];
                    }
                }
                if (currentMatches.length >= 2) {
                    masumMatch = true;
                    matchedPeers = currentMatches;
                    break;
                }
            }

            if (masumMatch) {
                let ebeCaught = false;
                for (let guess of this.state.ebeGuesses) {
                    if (this.matcher.isMatch(guess, matchedWord)) {
                        ebeCaught = true; break;
                    }
                }

                if (ebeCaught) {
                    isEbeWin = true;
                    resultMsg = "EBE KAZANDI! Masumların eşleştiği kelimeyi ("+matchedWord+") bildi.";
                    if (this.state.players[this.state.currentEbe]) {
                        this.state.players[this.state.currentEbe].score += this.state.settings.ebeWinPts;
                    }
                    if (this.onSound) this.onSound('taboo');
                } else {
                    isMasumWin = true;
                    resultMsg = "MASUMLAR KAZANDI! Eşleştiler ("+matchedWord+") ama Ebe bulamadı.";
                    matchedPeers.forEach(id => {
                        if(this.state.players[id]) {
                            this.state.players[id].score += this.state.settings.masumWinPts;
                        }
                    });
                    if (this.onSound) this.onSound('correct');
                    this.state.revealedLetters++;
                }
            } else {
                resultMsg = "Masumlar kendi aralarında eşleşemedi!";
                if (this.onSound) this.onSound('pass');
            }
        }

        this.setState(this.state);
        if (this.onShowResult) this.onShowResult(resultMsg);

        setTimeout(() => {
            this.handleRoundEndTransition(isJackpot, isEbeWin, isMasumWin);
        }, 5000);
    }

    handleRoundEndTransition(isJackpot, isEbeWin, isMasumWin) {
        if (!isJackpot && !isEbeWin && isMasumWin) {
            this.state.status = 'playing';
            const left = Math.max(0, this.localEndTime - window.PairaTime.now());
            this.localEndTime = window.PairaTime.now() + left + (this.state.timeIncrease * 1000);
            this.state.submittedWords = {};
            this.state.ebeGuesses = [];
            this.setState(this.state);
            this.startRenderTimer();
        } else {
            if (this.state.round >= this.state.totalRounds) {
                this.state.status = 'finished';
                this.setState(this.state);
            } else {
                this.state.round++;
                this.startNewTurn();
            }
        }
    }

    endRoundPrematurely(reasonMsg) {
        if (!this.isHost) return;
        this.state.status = 'evaluating';
        this.setState(this.state);
        if (this.onShowResult) this.onShowResult(reasonMsg);
        setTimeout(() => {
            this.startNewTurn();
        }, 5000);
    }

    backToLobby() { this.state.status = 'lobby'; Object.keys(this.state.players).forEach(pId => { if (this.state.players[pId].disconnected) { delete this.state.players[pId]; } else { this.state.players[pId].score = 0; } }); this.setState(this.state); }

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
        if(btnAdvanced && advancedSettings) {
            btnAdvanced.addEventListener('click', () => {
                advancedSettings.classList.toggle('hidden');
            });
        }

        const masumInput = document.getElementById('masum-word-input');
        const btnSubmitMasum = document.getElementById('btn-submit-masum');
        if(btnSubmitMasum && masumInput) {
            const submitMasum = () => {
                if(btnSubmitMasum.disabled) return;
                const word = masumInput.value.trim();
                if(word.length === 0) return;

                if (window._gameState && window._gameState.targetWord) {
                    const revealedPart = window.normalizeTurkishChars(window._gameState.targetWord.substring(0, window._gameState.revealedLetters)).toUpperCase();
                    const normWord = window.normalizeTurkishChars(word).toUpperCase();
                    if (!normWord.startsWith(revealedPart)) {
                        if (window.showToast) window.showToast(`Kelime "${revealedPart}" harfi/harfleri ile başlamalıdır!`, "warning");
                        return;
                    }
                }

                btnSubmitMasum.disabled = true;
                if(window.showToast) window.showToast("Kelime gönderildi, diğerleri bekleniyor...", "info");
                this.callbacks.onSubmitMasum(word);
            };
            btnSubmitMasum.addEventListener('click', submitMasum);
            masumInput.addEventListener('keypress', (e) => {
                if(e.key === 'Enter') submitMasum();
            });
        }

        const btnSubmitEbe = document.getElementById('btn-submit-ebe');
        if(btnSubmitEbe) {
            const submitEbe = () => {
                if(btnSubmitEbe.disabled) return;
                const guesses = [
                    document.getElementById('ebe-guess-1')?.value.trim(),
                    document.getElementById('ebe-guess-2')?.value.trim(),
                    document.getElementById('ebe-guess-3')?.value.trim(),
                    document.getElementById('ebe-guess-4')?.value.trim(),
                    document.getElementById('ebe-guess-5')?.value.trim()
                ].filter(g => g && g.length > 0);

                if(guesses.length === 0) {
                    if(window.showToast) window.showToast("En az bir tahmin yapmalısın!", "warning");
                    return;
                }
                btnSubmitEbe.disabled = true;
                if(window.showToast) window.showToast("Tahminler gönderildi!", "info");
                this.callbacks.onSubmitEbe(guesses);
            };
            btnSubmitEbe.addEventListener('click', submitEbe);
            
            [1,2,3,4,5].forEach(i => {
                const input = document.getElementById(`ebe-guess-${i}`);
                if(input) {
                    input.addEventListener('keypress', (e) => {
                        if(e.key === 'Enter') submitEbe();
                    });
                }
            });
        }
    }

    updateUI(state, isHost) {
        window._gameState = state;
        if (state.status === 'lobby') {
            window.showScreen('lobby-screen');
        } else if (state.status === 'playing' || state.status === 'evaluating') {
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

        const masumArea = document.getElementById('masum-area');
        const ebeArea = document.getElementById('ebe-area');
        const letterDisplay = document.getElementById('current-letters');

        // Disable buttons if already submitted
        const hasSubmittedMasum = !!state.submittedWords[myId];
        const hasSubmittedEbe = state.ebeGuesses && state.ebeGuesses.length > 0;
        
        const btnSubmitMasum = document.getElementById('btn-submit-masum');
        if (btnSubmitMasum) btnSubmitMasum.disabled = hasSubmittedMasum;
        
        const btnSubmitEbe = document.getElementById('btn-submit-ebe');
        if (btnSubmitEbe) btnSubmitEbe.disabled = hasSubmittedEbe;

        // Clear inputs ONLY when a new round starts
        if (this._lastClearedRound !== state.round || this._lastClearedStatus !== state.status) {
            if (state.status === 'playing' && Object.keys(state.submittedWords).length === 0 && state.ebeGuesses.length === 0) {
                const masumInput = document.getElementById('masum-word-input');
                if (masumInput) masumInput.value = '';

                [1,2,3,4,5].forEach(i => {
                    const input = document.getElementById(`ebe-guess-${i}`);
                    if (input) input.value = '';
                });
                
                this._lastClearedRound = state.round;
                this._lastClearedStatus = state.status;
            }
        }

        const statusMsg = document.getElementById('game-status-message');
        if (state.status === 'evaluating') {
            // handled by onShowResult explicitly
        } else {
            statusMsg.innerText = amIEbe ? "Ebesin! Sohbeti dinle, kelimeleri tahmin et!" : "Masumsun! Aranızda şifreli konuşun.";
            statusMsg.style.color = 'var(--text-main)';
        }

        if (amIEbe) {
            masumArea.classList.add('hidden');
            ebeArea.classList.remove('hidden');
            letterDisplay.innerText = state.targetWord; // Ebe tüm kelimeyi görür
        } else {
            masumArea.classList.remove('hidden');
            ebeArea.classList.add('hidden');
            letterDisplay.innerText = state.targetWord.substring(0, state.revealedLetters) + "...";
        }
    }

    updateWinnerUI(state) {
        const scoresDiv = document.getElementById('final-scores');
        if (scoresDiv) {
            scoresDiv.innerHTML = '';
            const sorted = Object.values(state.players).sort((a,b) => b.score - a.score);
            sorted.forEach((p, index) => {
                scoresDiv.innerHTML += `<div style="font-size: 1.2rem; margin: 10px 0;">${index+1}. ${window.escapeHtml(p.name)} - <strong>${p.score} Puan</strong></div>`;
            });
        }

        const btnBack = document.getElementById('btn-back-to-lobby');
        if (btnBack) {
            const isLocalHost = sessionStorage.getItem('isHost') === 'true';
            if (isLocalHost) {
                btnBack.style.display = 'inline-block';
                const waitText = document.getElementById('waiting-rematch-text-kelimeavi');
                if (waitText) waitText.remove();
            } else {
                btnBack.style.display = 'none';
                let waitText = document.getElementById('waiting-rematch-text-kelimeavi');
                if (!waitText) {
                    waitText = document.createElement('div');
                    waitText.id = 'waiting-rematch-text-kelimeavi';
                    waitText.style.color = 'var(--text-muted)';
                    waitText.style.marginTop = '1rem';
                    waitText.style.fontSize = '1.1rem';
                    waitText.textContent = 'Kurucunun lobiye dönmesi bekleniyor...';
                    btnBack.parentNode.appendChild(waitText);
                }
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
        if(window.showToast) window.showToast(msg, "info");
        const gs = document.getElementById('game-status-message');
        if(gs) {
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

