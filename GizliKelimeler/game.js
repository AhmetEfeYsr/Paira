class GizliKelimelerEngine {
    constructor() {
        this.state = {
            status: 'lobby',
            players: {}, // id: { id, name, isHost, team: 'A'|'B', role: 'SPYMASTER'|'GUESSER' }
            scoreA: 0,
            scoreB: 0,
            turnTeam: 'A',
            phase: 'CLUE', // 'CLUE' | 'GUESS'
            currentClue: null, // { word, count, remaining }
            board: [],
            marks: {}, // index -> array of playerIds
            boardSize: 25,
            winnerTeam: null,
            turnDuration: 90
        };
        this.allWords = [];
        this.fallbackWords = ["ELMA", "ARMUT", "ARABA", "GÜNEŞ", "AY", "YILDIZ", "KİTAP", "DEFTER", "KALEM", "SU", "ATEŞ", "TOPRAK", "HAVA", "ASLAN", "KAPLAN", "KARTAL", "BİLGİSAYAR", "TELEFON", "MASA", "SANDALYE", "KAPI", "PENCERE", "EV", "OKUL", "OYUN", "DENİZ", "KUM", "GÖZ", "KULAK", "AĞIZ", "BURUN", "BEYİN", "KALP", "SAAT", "GÜZEL", "ÇİRKİN"];

        this.onStateChange = null;
        this.onSound = null;
        this.onTimerTick = null;

        this.localTurnEndTime = 0;
        this.renderFrame = null;
        this.isHostNode = false;
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        if (this.onStateChange) this.onStateChange(this.state);
    }

    addPlayer(id, name, isHost, team, role) {
        this.state.players[id] = { id, name, isHost, team, role };
        this.setState({ players: this.state.players });
    }

    removePlayer(id) {
        delete this.state.players[id];
        
        if (this.state.status === 'playing') {
            const players = Object.values(this.state.players);
            const teamA = players.filter(p => p.team === 'A');
            const teamB = players.filter(p => p.team === 'B');
            
            if (teamA.length < 2 || teamB.length < 2) {
                const winner = teamA.length < 2 && teamB.length >= 2
                    ? 'B'
                    : (teamB.length < 2 && teamA.length >= 2 ? 'A' : (this.state.scoreA <= this.state.scoreB ? 'A' : 'B'));
                this.endGame(winner);
                return;
            }

            [teamA, teamB].forEach(team => {
                const hasSpymaster = team.some(p => p.role === 'SPYMASTER');
                const hasGuesser = team.some(p => p.role === 'GUESSER');
                if (!hasSpymaster) {
                    team[0].role = 'SPYMASTER';
                } else if (!hasGuesser) {
                    team[0].role = 'GUESSER';
                }
            });
        }
        
        this.setState({ players: this.state.players });
    }

    switchTeam(id) {
        if (this.state.status !== 'lobby') return;
        if (this.state.players[id]) {
            this.state.players[id].team = this.state.players[id].team === 'A' ? 'B' : 'A';
            this.setState({ players: this.state.players });
        }
    }

    shuffleTeams() {
        if (this.state.status !== 'lobby') return;
        const pKeys = Object.keys(this.state.players);
        if (pKeys.length === 0) return;

        for (let i = pKeys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pKeys[i], pKeys[j]] = [pKeys[j], pKeys[i]];
        }

        let hasSpyA = false;
        let hasSpyB = false;
        pKeys.forEach((id, index) => {
            const team = (index % 2 === 0) ? 'A' : 'B';
            this.state.players[id].team = team;
            if (team === 'A') {
                this.state.players[id].role = hasSpyA ? 'GUESSER' : 'SPYMASTER';
                hasSpyA = true;
            } else {
                this.state.players[id].role = hasSpyB ? 'GUESSER' : 'SPYMASTER';
                hasSpyB = true;
            }
        });

        this.setState({ players: this.state.players });
    }

    switchRole(id) {
        if (this.state.status !== 'lobby') return;
        if (this.state.players[id]) {
            this.state.players[id].role = this.state.players[id].role === 'SPYMASTER' ? 'GUESSER' : 'SPYMASTER';
            this.setState({ players: this.state.players });
        }
    }

    setWords(words) {
        if (words && words.length >= 36) {
            const unique = [...new Set(words.map(w => w && w.ana_kelime ? w.ana_kelime.toLocaleUpperCase('tr-TR').trim() : '').filter(Boolean))];
            this.allWords = unique.length >= 36 ? unique : this.fallbackWords;
        } else {
            this.allWords = this.fallbackWords;
        }
    }

    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    startGame(settings = {}) {
        const size = parseInt(settings.boardSize) || 25;
        const duration = parseInt(settings.turnDuration) || 90;

        this.state.boardSize = size;
        this.state.turnDuration = duration;
        this.state.status = 'playing';
        this.state.turnTeam = Math.random() < 0.5 ? 'A' : 'B';
        this.state.phase = 'CLUE';
        this.state.currentClue = null;
        this.state.winnerTeam = null;
        this.state.marks = {};

        this.generateBoard(size, this.state.turnTeam);
        this.setState(this.state);
        if (this.onSound) this.onSound('start');

        this.startTimer();
    }

    startTimer() {
        this.localTurnEndTime = window.PairaTime.now() + (this.state.turnDuration * 1000);
        this.setState(this.state);
        this.startRenderTimer();
    }

    startRenderTimer() {
        if (this.renderFrame) clearTimeout(this.renderFrame);

        let lastTickSec = -1;

        const tick = () => {
            if (this.state.status !== 'playing') return;

            const left = Math.max(0, this.localTurnEndTime - window.PairaTime.now());
            const secs = Math.ceil(left / 1000);

            if (this.onTimerTick) this.onTimerTick(secs, 'running');

            if (secs <= 10 && secs > 0 && lastTickSec !== secs) {
                if (this.onSound) this.onSound('tick');
                lastTickSec = secs;
            }

            if (left <= 0) {
                if (this.onSound) this.onSound('timeup');
                if (this.isHostNode) {
                    this.switchTurn();
                }
                return;
            }

            this.renderFrame = setTimeout(tick, 100);
        };
        this.renderFrame = setTimeout(tick, 100);
    }

    generateBoard(size, startingTeam) {
        let pool = [...this.allWords];
        this.shuffle(pool);
        const selectedWords = pool.slice(0, size);

        let teamA_count, teamB_count, neutral_count, assassin_count;

        let primaryCount, secondaryCount;

        if (size === 16) {
            primaryCount = 6; secondaryCount = 5; neutral_count = 4; assassin_count = 1;
        } else if (size === 36) {
            primaryCount = 12; secondaryCount = 11; neutral_count = 12; assassin_count = 1;
        } else {
            // default 25
            primaryCount = 9; secondaryCount = 8; neutral_count = 7; assassin_count = 1;
        }

        if (startingTeam === 'A') {
            teamA_count = primaryCount;
            teamB_count = secondaryCount;
        } else {
            teamA_count = secondaryCount;
            teamB_count = primaryCount;
        }

        this.state.scoreA = teamA_count;
        this.state.scoreB = teamB_count;

        let assignments = [];
        for (let i = 0; i < teamA_count; i++) assignments.push('TEAM_A');
        for (let i = 0; i < teamB_count; i++) assignments.push('TEAM_B');
        for (let i = 0; i < neutral_count; i++) assignments.push('NEUTRAL');
        for (let i = 0; i < assassin_count; i++) assignments.push('ASSASSIN');

        this.shuffle(assignments);

        this.state.board = selectedWords.map((word, idx) => ({
            id: idx,
            word: word,
            team: assignments[idx],
            revealed: false
        }));
    }

    isValidClue(word, count) {
        const raw = typeof word === 'string' ? word.trim() : '';
        const parsedCount = parseInt(count, 10);
        if (!raw || raw.length > 25 || /\s/.test(raw) || isNaN(parsedCount) || parsedCount < 1) {
            return false;
        }
        const norm = (s) => {
            const trimmed = String(s).trim();
            return typeof window.normalizeTurkishChars === 'function'
                ? window.normalizeTurkishChars(trimmed)
                : trimmed.toLocaleLowerCase('tr-TR');
        };
        const normClue = norm(raw);
        const conflictsWithBoard = this.state.board.some(c => {
            if (!c || c.revealed || !c.word) return false;
            const normBoard = norm(c.word);
            return normClue === normBoard || normClue.includes(normBoard) || normBoard.includes(normClue);
        });
        return !conflictsWithBoard;
    }

    processAction(actionType, payload, senderId) {
        if (this.state.status !== 'playing') return;

        const p = this.state.players[senderId];
        if (!p) return;

        if (actionType === 'SUBMIT_CLUE' && this.state.phase === 'CLUE' && p.team === this.state.turnTeam && p.role === 'SPYMASTER') {
            const count = parseInt(payload.count, 10);
            const rawWord = payload.word ? String(payload.word).trim() : '';
            if (!this.isValidClue(rawWord, count)) return;
            const cleanWord = rawWord.toLocaleUpperCase('tr-TR');

            this.state.currentClue = {
                word: cleanWord,
                count: count,
                remaining: count + 1
            };
            this.state.phase = 'GUESS';
            this.startTimer();
            if (this.onSound) this.onSound('pop');
        }
        else if (actionType === 'MARK_WORD' && this.state.phase === 'GUESS' && p.team === this.state.turnTeam && p.role === 'GUESSER') {
            const cellIdx = payload.index;
            const cell = this.state.board[cellIdx];
            if (!cell || cell.revealed) return;
            if (!this.state.marks) this.state.marks = {};
            if (!this.state.marks[cellIdx]) this.state.marks[cellIdx] = [];

            const marks = this.state.marks[cellIdx];
            const idx = marks.indexOf(senderId);
            if (idx > -1) {
                marks.splice(idx, 1);
            } else {
                marks.push(senderId);
            }
            this.setState(this.state);
        }
        else if (actionType === 'GUESS_WORD' && this.state.phase === 'GUESS' && p.team === this.state.turnTeam && p.role === 'GUESSER') {
            const cellIdx = payload.index;
            const cell = this.state.board[cellIdx];
            if (!cell || cell.revealed) return;

            cell.revealed = true;
            if (this.state.marks && this.state.marks[cellIdx]) {
                delete this.state.marks[cellIdx];
            }

            if (cell.team === 'ASSASSIN') {
                if (this.onSound) this.onSound('end');
                this.endGame(p.team === 'A' ? 'B' : 'A');
                return;
            }
            else if (cell.team === 'TEAM_' + this.state.turnTeam) {
                if (this.onSound) this.onSound('correct');
                if (this.state.turnTeam === 'A') this.state.scoreA--;
                else this.state.scoreB--;

                this.state.currentClue.remaining--;

                if (this.state.scoreA === 0) {
                    this.endGame('A');
                    return;
                }
                if (this.state.scoreB === 0) {
                    this.endGame('B');
                    return;
                }
                if (this.state.currentClue.remaining <= 0) {
                    this.switchTurn();
                    return;
                }
            }
            else {
                // Neutral or Enemy
                if (this.onSound) this.onSound('taboo');
                if (cell.team === 'TEAM_A') this.state.scoreA--;
                else if (cell.team === 'TEAM_B') this.state.scoreB--;

                if (this.state.scoreA === 0) {
                    this.endGame('A');
                    return;
                }
                if (this.state.scoreB === 0) {
                    this.endGame('B');
                    return;
                }
                this.switchTurn();
                return;
            }
            this.setState(this.state);
        }
        else if (actionType === 'END_TURN' && this.state.phase === 'GUESS' && p.team === this.state.turnTeam && p.role === 'GUESSER') {
            this.switchTurn();
        }
    }

    stopTimer() {
        if (this.renderFrame) {
            clearTimeout(this.renderFrame);
            this.renderFrame = null;
        }
    }

    switchTurn() {
        this.state.turnTeam = this.state.turnTeam === 'A' ? 'B' : 'A';
        this.state.phase = 'CLUE';
        this.state.currentClue = null;
        this.state.marks = {}; // Clear marks on turn switch

        this.startTimer();
    }

    endGame(winnerTeam) {
        this.state.status = 'ended';
        this.state.winnerTeam = winnerTeam;
        this.stopTimer();
        this.setState(this.state);
    }
}

class GizliKelimelerView {
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
        document.getElementById('btn-shuffle-teams')?.addEventListener('click', () => this.callbacks.onShuffleTeams());
        document.getElementById('btn-switch-role')?.addEventListener('click', () => this.callbacks.onSwitchRole());

        const submitClue = () => {
            const word = document.getElementById('clue-word').value.trim();
            const countStr = document.getElementById('clue-count').value;
            const count = parseInt(countStr, 10);
            if (!word || isNaN(count) || count < 1) {
                this.showToast("Lütfen geçerli bir ipucu ve en az 1 sayısı giriniz!", "warning");
                return;
            }
            if (word.length > 25) {
                this.showToast("İpucu en fazla 25 karakter olabilir!", "warning");
                return;
            }
            if (/\s/.test(word)) {
                this.showToast("İpucu tek bir kelime olmalıdır!", "warning");
                return;
            }
            const norm = (s) => {
                const trimmed = String(s).trim();
                return typeof window.normalizeTurkishChars === 'function'
                    ? window.normalizeTurkishChars(trimmed)
                    : trimmed.toLocaleLowerCase('tr-TR');
            };
            const normClue = norm(word);
            if (this.currentBoard && this.currentBoard.some(c => {
                if (!c || c.revealed || !c.word) return false;
                const normBoard = norm(c.word);
                return normClue === normBoard || normClue.includes(normBoard) || normBoard.includes(normClue);
            })) {
                this.showToast("Tahtadaki açılmamış bir kelimeyle eşleşen veya onu içeren ipucu veremezsiniz!", "warning");
                return;
            }
            this.callbacks.onSubmitClue(word, count);
            document.getElementById('clue-word').value = '';
            document.getElementById('clue-count').value = '';
        };

        document.getElementById('btn-submit-clue')?.addEventListener('click', submitClue);
        
        document.getElementById('clue-word')?.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') submitClue();
        });
        
        document.getElementById('clue-count')?.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') submitClue();
        });

        document.getElementById('btn-end-turn')?.addEventListener('click', () => this.callbacks.onEndTurn());

        document.getElementById('btn-back-lobby')?.addEventListener('click', () => this.callbacks.onBackToLobby());
        
        document.getElementById('btn-leave')?.addEventListener('click', async () => {
            const confirmed = await window.pairaConfirm({
                title: "Lobiden Ayrıl",
                message: "Lobiden ayrılmak istediğinize emin misiniz?",
                confirmText: "Ayrıl",
                cancelText: "Kal",
                confirmType: "danger"
            });
            if (confirmed) this.callbacks.onLeave();
        });

        document.getElementById('btn-leave-game')?.addEventListener('click', async () => {
            const confirmed = await window.pairaConfirm({
                title: "Oyundan Ayrıl",
                message: "Devam eden oyundan ayrılmak istediğinize emin misiniz?",
                confirmText: "Ayrıl",
                cancelText: "Oyuna Dön",
                confirmType: "danger"
            });
            if (confirmed) this.callbacks.onLeave();
        });
    }

    showScreen(screenId) {
        if(window.showScreen) window.showScreen(screenId);
    }

    showToast(msg, type = "info") {
        if(window.showToast) window.showToast(msg, type);
    }

    updateUI(state, isHost) {
        this.currentBoard = state.board || [];
        if (state.status === 'lobby') {
            this.showScreen('lobby-screen');
        } else if (state.status === 'playing') {
            this.showScreen('game-screen');
            this.updateGameUI(state);
        } else if (state.status === 'ended') {
            this.showScreen('winner-screen');
            this.updateWinnerUI(state, isHost);
        }
    }

    updateGameUI(state) {
        document.getElementById('score-a').innerText = state.scoreA;
        document.getElementById('score-b').innerText = state.scoreB;

        const turnInd = document.getElementById('turn-indicator');
        turnInd.innerText = `Takım ${state.turnTeam} Oynuyor`;
        turnInd.style.color = state.turnTeam === 'A' ? 'var(--team-a-color)' : 'var(--team-b-color)';

        const me = state.players[this.myId];
        const amITurnTeam = me && me.team === state.turnTeam;
        const amISpymaster = me && me.role === 'SPYMASTER';

        const statusMsg = document.getElementById('game-status-message');
        const inputSec = document.getElementById('clue-input-section');
        const displaySec = document.getElementById('clue-display-section');
        const btnEndTurn = document.getElementById('btn-end-turn');

        if (state.phase === 'CLUE') {
            if (amITurnTeam && amISpymaster) {
                statusMsg.innerText = "Sıra Sende: İpucu Ver!";
                inputSec.classList.remove('hidden');
                displaySec.classList.add('hidden');
            } else {
                statusMsg.innerText = "Ajan İpucu Veriyor...";
                inputSec.classList.add('hidden');
                displaySec.classList.add('hidden');
            }
        } else if (state.phase === 'GUESS') {
            inputSec.classList.add('hidden');
            displaySec.classList.remove('hidden');

            document.getElementById('current-clue-word').innerText = state.currentClue ? state.currentClue.word : '';
            document.getElementById('current-clue-count').querySelector('span').innerText = state.currentClue ? `Sayı: ${state.currentClue.count}` : '';
            document.getElementById('current-clue-rem').querySelector('span').innerText = state.currentClue ? `Kalan: ${state.currentClue.remaining}` : '';

            if (amITurnTeam && !amISpymaster) {
                statusMsg.innerText = "Tahmin Yap!";
                btnEndTurn.classList.remove('hidden');
            } else {
                statusMsg.innerText = "Tahmin Ediliyor...";
                btnEndTurn.classList.add('hidden');
            }
        }

        this.renderBoard(state, amISpymaster, amITurnTeam && !amISpymaster && state.phase === 'GUESS');
    }

    renderBoard(state, amISpymaster, canGuess) {
        const boardEl = document.getElementById('game-board');
        if (!boardEl) return;
        
        // Ensure grid class is correctly applied
        const cols = Math.sqrt(state.boardSize) || 5;
        boardEl.className = `game-board grid-${cols}x${cols}`;
        boardEl.innerHTML = '';

        state.board.forEach((cell, idx) => {
            const card = document.createElement('div');
            card.className = 'board-card';
            
            // Use a span to ensure text is centered and pointer-events are passed to the card
            const textSpan = document.createElement('span');
            textSpan.style.pointerEvents = 'none';
            textSpan.style.wordBreak = 'break-word';
            textSpan.innerText = cell.word || '';
            card.appendChild(textSpan);

            if (cell.revealed) {
                card.classList.add('revealed');
                if (cell.team === 'TEAM_A') card.classList.add('team-a');
                else if (cell.team === 'TEAM_B') card.classList.add('team-b');
                else if (cell.team === 'NEUTRAL') card.classList.add('neutral');
                else if (cell.team === 'ASSASSIN') card.classList.add('assassin');
            } else if (amISpymaster) {
                card.classList.add('spymaster');
                if (cell.team === 'TEAM_A') card.classList.add('team-a');
                else if (cell.team === 'TEAM_B') card.classList.add('team-b');
                else if (cell.team === 'NEUTRAL') card.classList.add('neutral');
                else if (cell.team === 'ASSASSIN') card.classList.add('assassin');
            }

            let isMarkedByMe = false;
            // Network Marked state check (someone marked it)
            if (state.marks && state.marks[idx] && state.marks[idx].length > 0 && !cell.revealed) {
                card.classList.add('marked');
                if (state.marks[idx].includes(this.myId)) {
                    isMarkedByMe = true;
                    card.classList.add('marked-by-me');
                }
            }

            if (!cell.revealed && canGuess) {
                card.classList.add('can-guess');
                card.style.cursor = 'pointer';
                card.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.callbacks.onMarkWord) {
                        this.callbacks.onMarkWord(idx);
                    }
                };

                // Eğer kelime bizim tarafımızdan işaretlenmişse "Tahmin" (tik) butonunu ekle
                if (isMarkedByMe) {
                    const guessBtn = document.createElement('div');
                    guessBtn.className = 'guess-confirm-btn';
                    guessBtn.title = 'Tahmin Et';
                    guessBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    guessBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation(); // Kartın kendi tıklanmasını (mark/unmark) engelle
                        if (this.callbacks.onGuessWord) {
                            this.callbacks.onGuessWord(idx);
                        }
                    };
                    card.appendChild(guessBtn);
                }
            } else {
                card.style.cursor = 'default';
                card.onclick = null;
            }

            boardEl.appendChild(card);
        });
    }

    updateWinnerUI(state, isHost = false) {
        let msg = `Takım ${state.winnerTeam} Kazandı!`;
        const winnerMsgEl = document.getElementById('winner-message');
        winnerMsgEl.innerText = msg;
        winnerMsgEl.style.color = state.winnerTeam === 'A' ? 'var(--team-a-color)' : 'var(--team-b-color)';
        
        document.getElementById('final-score-a').innerText = state.scoreA;
        document.getElementById('final-score-b').innerText = state.scoreB;

        const btnBack = document.getElementById('btn-back-lobby');
        if (btnBack) {
            if (isHost || state.players[this.myId]?.isHost) {
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

    updateTimer(secs, status) {
        const timerEl = document.getElementById('timer-display');
        if (!timerEl) return;

        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        timerEl.innerText = `${m}:${s}`;
        timerEl.style.color = secs <= 10 && secs > 0 ? 'var(--danger)' : 'var(--lilac)';
    }
}