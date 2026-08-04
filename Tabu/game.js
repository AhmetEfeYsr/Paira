/**
 * TabuGameEngine - Core game logic, state management, and turn rotation.
 * Pure, testable class independent of DOM manipulation.
 */
class TabuGameEngine {
    constructor(isHost = true) {
        this.isHost = isHost;
        this.state = {
            status: 'lobby',
            players: {},
            scoreA: 0,
            scoreB: 0,
            round: 1,
            totalRounds: 3,
            turnDuration: 60,
            passLimit: 3,
            tabooPenalty: 1,
            turnId: null,
            turnOrder: [],
            turnIndex: 0,
            activeWords: [],
            wordIndex: 0,
            passesLeft: 3,
            isPaused: false,
            isWaitingForReady: false
        };
        this.allWords = [];
        this.gameSeed = window.PairaTime.now();
        this.fallbackWords = [
            { ana_kelime: "güneş", yasakli_kelimeler: ["Sarı", "Sıcak", "Gökyüzü", "Yıldız", "Yaz"], kategori: "Genel", zorluk: 10 },
            { ana_kelime: "telefon", yasakli_kelimeler: ["Konuşmak", "Akıllı", "Ekran", "Mesaj", "Aramak"], kategori: "Teknoloji", zorluk: 20 },
            { ana_kelime: "kitap", yasakli_kelimeler: ["Okumak", "Sayfa", "Kütüphane", "Yazar", "Hikaye"], kategori: "Genel", zorluk: 15 },
            { ana_kelime: "bilgisayar", yasakli_kelimeler: ["Klavye", "İnternet", "Oyun", "Ekran", "Yazılım"], kategori: "Teknoloji", zorluk: 30 },
            { ana_kelime: "pizza", yasakli_kelimeler: ["Hamur", "Peynir", "İtalyan", "Yemek", "Dilim"], kategori: "Yemek", zorluk: 10 }
        ];

        this.onStateChange = null;
        this.onTimerTick = null;
        this.onSound = null;
        this.onActionError = null;

        this.localTurnEndTime = 0;
        this.pauseOffset = 0;
        this.turnTimeout = null;
        this.renderFrame = null;
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        if (this.onStateChange) this.onStateChange(this.state);
    }

    addPlayer(id, name, isHost, team) {
        this.state.players[id] = { id, name, isHost, team };
        this.setState({ players: this.state.players });
    }

    removePlayer(id) {
        delete this.state.players[id];
        this.setState({ players: this.state.players });
    }

    switchTeam(id) {
        if (this.state.players[id]) {
            this.state.players[id].team = this.state.players[id].team === 'A' ? 'B' : 'A';
            this.setState({ players: this.state.players });
        }
    }

    setWords(words) {
        this.allWords = words && words.length > 0 ? words : this.fallbackWords;
    }

    filterWords(category, minDifficulty = 1, maxDifficulty = 100) {
        let pool = this.allWords;
        
        // Category filtering - handle both string and array
        if (category) {
            const cats = Array.isArray(category) ? category : [category];
            const hasAll = cats.includes('Hepsi');
            if (!hasAll && cats.length > 0) {
                pool = pool.filter(w => cats.includes(w.kategori));
            }
        }
        
        // Difficulty filtering
        pool = pool.filter(w => {
            const d = w.zorluk || 50;
            return d >= minDifficulty && d <= maxDifficulty;
        });
        
        if (pool.length === 0) pool = this.fallbackWords;
        this.state.activeWords = [...pool];
        this.seededShuffle(this.state.activeWords, this.gameSeed);
        this.state.wordIndex = 0;
    }

    seededShuffle(arr, seed) {
        for (let i = arr.length - 1; i > 0; i--) {
            seed = (seed * 16807) % 2147483647;
            const j = seed % (i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    /**
     * Helper to calculate Least Common Multiple.
     * Used for perfectly alternating turns even with uneven team sizes.
     */
    lcm(a, b) {
        const gcd = (x, y) => (!y ? x : gcd(y, x % y));
        return (a * b) / gcd(a, b);
    }

    generateTurnOrder() {
        const pList = Object.values(this.state.players);
        const teamA = pList.filter(p => p.team === 'A').map(p => p.id);
        const teamB = pList.filter(p => p.team === 'B').map(p => p.id);

        if (teamA.length === 0 && teamB.length === 0) return [];

        const seqLength = (teamA.length > 0 && teamB.length > 0) ? this.lcm(teamA.length, teamB.length) : Math.max(teamA.length, teamB.length);
        const order = [];

        for (let i = 0; i < seqLength; i++) {
            if (teamA.length > 0) order.push(teamA[i % teamA.length]);
            if (teamB.length > 0) order.push(teamB[i % teamB.length]);
        }
        return order;
    }

    startGame(settings) {
        this.state.status = 'playing';
        this.state.scoreA = 0;
        this.state.scoreB = 0;
        this.state.round = 1;
        this.state.totalRounds = parseInt(settings.rounds) || 3;
        this.state.turnDuration = parseInt(settings.duration) || 60;
        const pLimit = parseInt(settings.passLimit);
        this.state.passLimit = isNaN(pLimit) ? 3 : pLimit;
        const pPen = parseInt(settings.penalty);
        this.state.tabooPenalty = isNaN(pPen) ? 1 : pPen;

        this.gameSeed = window.PairaTime.now();
        this.filterWords(settings.category, parseInt(settings.minDifficulty) || 1, parseInt(settings.maxDifficulty) || 100);

        this.state.turnOrder = this.generateTurnOrder();
        this.state.turnIndex = 0;

        this.startNextTurn();
    }

    startNextTurn() {
        const order = this.state.turnOrder;
        if (!order || order.length === 0) {
            this.endGame();
            return;
        }

        let validTurnFound = false;
        const startIndex = this.state.turnIndex;

        do {
            const nextId = order[this.state.turnIndex];
            if (this.state.players[nextId]) {
                this.state.turnId = nextId;
                validTurnFound = true;
                break;
            }
            this.state.turnIndex++;
            if (this.state.turnIndex >= order.length) {
                this.state.turnIndex = 0;
                this.state.round++;
            }
        } while (this.state.turnIndex !== startIndex && this.state.round <= this.state.totalRounds);

        if (!validTurnFound || this.state.round > this.state.totalRounds) {
            this.endGame();
            return;
        }

        this.state.isWaitingForReady = true;
        this.state.isPaused = false;
        this.state.passesLeft = this.state.passLimit;

        clearTimeout(this.turnTimeout);
        this.setState(this.state);
    }

    beginTimer() {
        this.state.isWaitingForReady = false;
        this.state.isPaused = false;
        this.localTurnEndTime = window.PairaTime.now() + (this.state.turnDuration * 1000);
        this.setState(this.state);
        this.startRenderTimer();

        if (this.onSound) this.onSound('start');
    }

    togglePause() {
        if (this.state.isWaitingForReady) return;

        this.state.isPaused = !this.state.isPaused;
        if (this.state.isPaused) {
            clearTimeout(this.turnTimeout);
            this.pauseOffset = Math.max(0, this.localTurnEndTime - window.PairaTime.now());
        } else {
            this.localTurnEndTime = window.PairaTime.now() + this.pauseOffset;
        }
        this.setState(this.state);
    }

    processAction(action) {
        if (this.state.status !== 'playing' || this.state.isWaitingForReady || this.state.isPaused) return;

        const p = this.state.players[this.state.turnId];
        if (!p) return;

        if (action === 'CORRECT') {
            if (p.team === 'A') this.state.scoreA++; else this.state.scoreB++;
            if (this.onSound) this.onSound('correct');
            this.advanceWord();
        } else if (action === 'TABOO') {
            if (p.team === 'A') this.state.scoreA = Math.max(0, this.state.scoreA - this.state.tabooPenalty);
            else this.state.scoreB = Math.max(0, this.state.scoreB - this.state.tabooPenalty);
            if (this.onSound) this.onSound('taboo');
            this.advanceWord();
        } else if (action === 'PASS') {
            if (this.state.passesLeft > 0) {
                this.state.passesLeft--;
                if (this.onSound) this.onSound('pass');
                this.advanceWord();
            } else {
                if (this.onActionError) this.onActionError('NO_PASSES');
            }
        }
        this.setState(this.state);
    }

    advanceWord() {
        const oldWordObj = this.state.activeWords[this.state.wordIndex];
        const oldWord = oldWordObj ? oldWordObj.ana_kelime : null;

        this.state.wordIndex++;
        if (this.state.wordIndex >= this.state.activeWords.length) {
            this.gameSeed = (this.gameSeed * 16807) % 2147483647;
            this.seededShuffle(this.state.activeWords, this.gameSeed);
            this.state.wordIndex = 0;
        }

        const newWordObj = this.state.activeWords[this.state.wordIndex];
        const newWord = newWordObj ? newWordObj.ana_kelime : null;

        // Shuffle sonrası tamamen aynı kelime denk gelirse, veya takımın son kelimesi takılı kalırsa atla
        if (oldWord && newWord && oldWord === newWord && this.state.activeWords.length > 1) {
            this.state.wordIndex++;
            if (this.state.wordIndex >= this.state.activeWords.length) {
                this.state.wordIndex = 0;
            }
        }
    }

    startRenderTimer() {
        if (this.renderFrame) cancelAnimationFrame(this.renderFrame);

        if (this.lastTickSec === undefined) this.lastTickSec = -1;

        const tick = () => {
            if (this.state.status !== 'playing') return;

            if (!this.state.isWaitingForReady && !this.state.isPaused) {
                const left = Math.max(0, this.localTurnEndTime - window.PairaTime.now());
                const secs = Math.ceil(left / 1000);

                if (this.onTimerTick) this.onTimerTick(secs, 'running');

                if (secs <= 10 && secs > 0 && this.lastTickSec !== secs) {
                    if (this.onSound) this.onSound('tick');
                    this.lastTickSec = secs;
                }

                if (left <= 0) {
                    if (this.isHost) {
                        this.endTurn();
                    } else if (this.onTimerTick) {
                        this.onTimerTick(0, 'waiting');
                    }
                    return;
                }
            } else if (this.state.isWaitingForReady) {
                if (this.onTimerTick) this.onTimerTick(0, 'waiting');
            } else if (this.state.isPaused) {
                if (this.onTimerTick) this.onTimerTick(0, 'paused');
            }

            this.renderFrame = requestAnimationFrame(tick);
        };
        this.renderFrame = requestAnimationFrame(tick);
    }

    endTurn() {
        if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
        if (this.onSound) this.onSound('timeup');

        this.advanceWord(); // Yeni anlatıcıya yeni kelime geçmesi için

        this.state.turnIndex++;
        if (this.state.turnIndex >= this.state.turnOrder.length) {
            this.state.turnIndex = 0;
            this.state.round++;
        }

        if (this.state.round > this.state.totalRounds) {
            this.endGame();
        } else {
            this.startNextTurn();
        }
    }

    endGame() {
        this.state.status = 'ended';
        this.setState(this.state);
    }
}

/**
 * TabuView - Handles all DOM manipulation and UI events.
 */
class TabuView {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.myId = null;
        this.bindEvents();
    }

    setMyId(id) {
        this.myId = id;
    }

    bindEvents() {
        document.getElementById('btn-switch-team')?.addEventListener('click', () => this.callbacks.onSwitchTeam());
        document.getElementById('btn-start-narrating')?.addEventListener('click', () => this.callbacks.onNarratorReady());
        document.getElementById('btn-pause')?.addEventListener('click', () => this.callbacks.onTogglePause());
        document.getElementById('btn-correct')?.addEventListener('click', () => this.callbacks.onAction('CORRECT'));
        document.getElementById('btn-taboo')?.addEventListener('click', () => this.callbacks.onAction('TABOO'));
        document.getElementById('btn-pass')?.addEventListener('click', () => this.callbacks.onAction('PASS'));
        document.getElementById('btn-back-to-lobby')?.addEventListener('click', () => this.callbacks.onBackToLobby());

        document.getElementById('btn-send-chat')?.addEventListener('click', () => this.sendChat());
        document.getElementById('chat-input')?.addEventListener('keydown', (e) => { if(e.key === 'Enter') this.sendChat(); });

        document.getElementById('btn-leave-lobby')?.addEventListener('click', () => this.callbacks.onLeave());
        document.getElementById('btn-leave-game')?.addEventListener('click', () => this.callbacks.onLeave());

        // Keyboard shortcuts for quick narrating
        document.addEventListener('keydown', (e) => {
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
            
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === ' ') {
                e.preventDefault();
                this.callbacks.onAction('CORRECT');
            } else if (e.key === 'ArrowDown' || e.key === 't' || e.key === 'T' || e.key === 'x' || e.key === 'X') {
                e.preventDefault();
                this.callbacks.onAction('TABOO');
            } else if (e.key === 'ArrowLeft' || e.key === 'p' || e.key === 'P') {
                e.preventDefault();
                this.callbacks.onAction('PASS');
            }
        });
    }

    sendChat() {
        const input = document.getElementById('chat-input');
        const msg = input.value.trim();
        if (!msg) return;
        this.callbacks.onSendChat(msg);
        input.value = '';
    }


    updateUI(state, isHost) {
        if (state.status === 'lobby') {
            window.showScreen('lobby-screen');
        } else if (state.status === 'playing') {
            window.showScreen('game-screen');
            this.updateGameUI(state);
        } else if (state.status === 'ended') {
            window.showScreen('winner-screen');
            this.updateWinnerUI(state, isHost);
        }
    }

    updateGameUI(state) {
        document.getElementById('round-indicator').innerText = `Tur ${Math.min(state.round, state.totalRounds)} / ${state.totalRounds}`;
        document.getElementById('score-a').innerText = state.scoreA;
        document.getElementById('score-b').innerText = state.scoreB;

        const btnPause = document.getElementById('btn-pause');
        if (btnPause) {
            btnPause.classList.toggle('hidden', state.isWaitingForReady);
            if (state.isPaused) {
                document.getElementById('icon-pause')?.classList.add('hidden');
                document.getElementById('icon-play')?.classList.remove('hidden');
                btnPause.style.background = 'var(--danger)';
                btnPause.style.color = 'white';
            } else {
                document.getElementById('icon-play')?.classList.add('hidden');
                document.getElementById('icon-pause')?.classList.remove('hidden');
                btnPause.style.background = 'var(--input-bg)';
                btnPause.style.color = 'var(--text-main)';
            }
        }

        const tPlayer = state.players[state.turnId];
        if (!tPlayer) {
            document.getElementById('turn-name').innerText = "Sıra Değişiyor...";
            return;
        }

        document.getElementById('turn-name').innerText = `${window.escapeHtml(tPlayer.name)} (T-${tPlayer.team})`;

        const myTeam = state.players[this.myId]?.team;
        const amINarrator = state.turnId === this.myId;
        const isOpponent = myTeam !== tPlayer.team;

        document.getElementById('pass-text').innerText = `Pas (${state.passesLeft})`;
        document.getElementById('btn-pass').classList.toggle('disabled', state.passesLeft <= 0);

        const wordCard = document.getElementById('word-card');
        const narratorActions = document.getElementById('narrator-actions');
        const gameStatusMessage = document.getElementById('game-status-message');
        const startTurnContainer = document.getElementById('start-turn-container');

        if (state.isWaitingForReady) {
            wordCard.classList.add('hidden');
            narratorActions.classList.add('hidden');

            if (amINarrator) {
                startTurnContainer.classList.remove('hidden');
                gameStatusMessage.innerText = "Sıra Sende! Hazır olduğunda süreyi başlat.";
                gameStatusMessage.className = "status-badge guesser-mode";
            } else {
                startTurnContainer.classList.add('hidden');
                gameStatusMessage.innerText = `${window.escapeHtml(tPlayer.name)} hazırlanıyor...`;
                gameStatusMessage.className = "status-badge";
            }
        } else {
            startTurnContainer.classList.add('hidden');
            let wordObj = state.currentWord || (state.activeWords?.[state.wordIndex]);

            if (wordObj && (amINarrator || isOpponent)) {
                const prevWord = document.getElementById('main-word').innerText;
                const newWord = wordObj.ana_kelime.toLocaleUpperCase('tr-TR');
                
                if (prevWord !== newWord) {
                    this.triggerWordPop();
                    document.getElementById('main-word').innerText = newWord;
                    const fw = document.getElementById('forbidden-words');
                    fw.innerHTML = '';
                    wordObj.yasakli_kelimeler.forEach(w => {
                        const li = document.createElement('li');
                        li.innerText = w.toLocaleUpperCase('tr-TR');
                        fw.appendChild(li);
                    });
                }
            }

            if (amINarrator) {
                wordCard.classList.remove('hidden');
                narratorActions.classList.remove('hidden');
                gameStatusMessage.innerText = "Sıra Sende - Anlatıyorsun!";
                gameStatusMessage.className = "status-badge guesser-mode";
            } else if (isOpponent) {
                wordCard.classList.remove('hidden');
                narratorActions.classList.add('hidden');
                gameStatusMessage.innerText = "Rakip Anlatıyor - Kontrol Et!";
                gameStatusMessage.className = "status-badge opponent-mode";
            } else {
                wordCard.classList.add('hidden');
                narratorActions.classList.add('hidden');
                gameStatusMessage.innerText = "Takım Arkadaşın Anlatıyor - Tahmin Et!";
                gameStatusMessage.className = "status-badge";
            }
        }
    }

    updateWinnerUI(state, isHost) {
        let msg = "Berabere!";
        if (state.scoreA > state.scoreB) msg = "Takım A Kazandı!";
        else if (state.scoreB > state.scoreA) msg = "Takım B Kazandı!";
        document.getElementById('winner-team-name').innerText = msg;
        document.getElementById('final-score-a').innerText = state.scoreA;
        document.getElementById('final-score-b').innerText = state.scoreB;

        const btnBack = document.getElementById('btn-back-to-lobby');
        if (btnBack) {
            if (isHost) {
                btnBack.classList.remove('hidden');
                const waitMsg = document.getElementById('client-wait-lobby-msg');
                if (waitMsg) waitMsg.classList.add('hidden');
            } else {
                btnBack.classList.add('hidden');
                let waitMsg = document.getElementById('client-wait-lobby-msg');
                if (!waitMsg) {
                    waitMsg = document.createElement('div');
                    waitMsg.id = 'client-wait-lobby-msg';
                    waitMsg.style.marginTop = '1.5rem';
                    waitMsg.style.color = 'var(--text-muted)';
                    waitMsg.style.fontSize = '1.1rem';
                    waitMsg.style.fontWeight = '500';
                    btnBack.parentNode.appendChild(waitMsg);
                }
                waitMsg.innerText = "Kurucunun lobiye dönmesi bekleniyor...";
                waitMsg.classList.remove('hidden');
            }
        }
    }

    displayChat(sender, msg, isSelf = false) {
        const cBox = document.getElementById('chat-messages');
        if (!cBox) return;
        const div = document.createElement('div');
        div.className = `chat-msg ${isSelf ? 'self' : ''}`;
        const safeSender = window.escapeHtml(sender);
        const safeMsg = window.escapeHtml(msg);
        div.innerHTML = `<strong>${safeSender}:</strong> ${safeMsg}`;
        cBox.appendChild(div);
        cBox.scrollTop = cBox.scrollHeight;
    }

    updateTimer(secs, status) {
        const timerEl = document.getElementById('timer-display');
        if (!timerEl) return;

        if (status === 'waiting') {
            timerEl.innerText = "BEKLİYOR";
            timerEl.style.color = 'var(--lilac)';
        } else if (status === 'paused') {
            timerEl.innerText = "DURDU";
            timerEl.style.color = 'var(--warning)';
        } else {
            const m = Math.floor(secs / 60).toString().padStart(2, '0');
            const s = (secs % 60).toString().padStart(2, '0');
            timerEl.innerText = `${m}:${s}`;
            timerEl.style.color = secs <= 10 && secs > 0 ? 'var(--danger)' : 'var(--lilac)';
        }
    }

    triggerWordPop() {
        const cardEl = document.getElementById('word-card');
        if (cardEl) {
            cardEl.classList.remove('pop-animation');
            void cardEl.offsetWidth;
            cardEl.classList.add('pop-animation');
        }
    }

    triggerPassError() {
        const btnPass = document.getElementById('btn-pass');
        if (btnPass) {
            btnPass.classList.add('error-shake');
            setTimeout(() => btnPass.classList.remove('error-shake'), 400);
        }
    }
}

// Exports for tests or modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TabuGameEngine, TabuView };
} else {
    window.TabuGameEngine = TabuGameEngine;
    window.TabuView = TabuView;
}
