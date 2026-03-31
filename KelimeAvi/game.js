class FuzzyMatcher {
    constructor() {
        this.qwertyMap = {
            'q': ['w','a','s'], 'w': ['q','e','a','s','d'], 'e': ['w','r','s','d','f'],
            'r': ['e','t','d','f','g'], 't': ['r','y','f','g','h'], 'y': ['t','u','g','h','j'],
            'u': ['y','ı','i','h','j','k'], 'ı': ['u','o','j','k','l'], 'o': ['ı','p','k','l','ş'],
            'p': ['o','ğ','l','ş','i'], 'ğ': ['p','ü','ş','i'], 'ü': ['ğ','ş'],
            'a': ['q','w','s','z','x'], 's': ['a','d','w','e','z','x','c'], 'd': ['s','f','e','r','x','c','v'],
            'f': ['d','g','r','t','c','v','b'], 'g': ['f','h','t','y','v','b','n'], 'h': ['g','j','y','u','b','n','m'],
            'j': ['h','k','u','ı','n','m','ö'], 'k': ['j','l','ı','o','m','ö','ç'], 'l': ['k','ş','o','p','ö','ç'],
            'ş': ['l','i','p','ğ','ç'], 'i': ['ş','p','ğ'],
            'z': ['a','s','x'], 'x': ['z','c','s','d'], 'c': ['x','v','d','f'],
            'v': ['c','b','f','g'], 'b': ['v','n','g','h'], 'n': ['b','m','h','j'],
            'm': ['n','ö','j','k'], 'ö': ['m','ç','k','l'], 'ç': ['ö','l','ş']
        };
    }

    isAdjacent(char1, char2) {
        if (!this.qwertyMap[char1]) return false;
        return this.qwertyMap[char1].includes(char2);
    }

    getDistance(word1, word2) {
        if (!word1) word1 = "";
        if (!word2) word2 = "";
        if (word1.length > 50) word1 = word1.substring(0, 50);
        if (word2.length > 50) word2 = word2.substring(0, 50);
        
        word1 = word1.toLocaleLowerCase('tr-TR');
        word2 = word2.toLocaleLowerCase('tr-TR');

        const len1 = word1.length;
        const len2 = word2.length;
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = word1[i - 1] === word2[j - 1] ? 0 :
                            (this.isAdjacent(word1[i - 1], word2[j - 1]) ? 0.4 : 1);

                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );

                if (i > 1 && j > 1 && word1[i - 1] === word2[j - 2] && word1[i - 2] === word2[j - 1]) {
                    matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 0.5);
                }
            }
        }
        return matrix[len1][len2];
    }

    isMatch(word1, word2, tolerance = 1.2) {
        return this.getDistance(word1, word2) <= tolerance;
    }
}

/**
 * KelimeAviGameEngine - Core game logic
 */
class KelimeAviGameEngine {
    constructor(isHost = true) {
        this.isHost = isHost;
        this.matcher = new FuzzyMatcher();
        
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
        this.state.submittedWords[peerId] = word;
        this.setState(this.state);
        this.checkAllSubmissions();
    }

    handleEbeGuesses(peerId, guesses) {
        if (!this.isHost || this.state.status !== 'playing') return;
        if (peerId !== this.state.currentEbe) return;
        this.state.ebeGuesses = guesses;
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

        let jackpotWinners = [];
        for (let [peerId, word] of Object.entries(this.state.submittedWords)) {
            if (this.matcher.isMatch(word, targetWord, 0.5)) {
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

    escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
                scoresDiv.innerHTML += `<div style="font-size: 1.2rem; margin: 10px 0;">${index+1}. ${this.escapeHtml(p.name)} - <strong>${p.score} Puan</strong></div>`;
            });
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

