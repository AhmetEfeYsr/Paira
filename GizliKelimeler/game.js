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
        this.setState({ players: this.state.players });
    }

    switchTeam(id) {
        if (this.state.players[id]) {
            this.state.players[id].team = this.state.players[id].team === 'A' ? 'B' : 'A';
            this.setState({ players: this.state.players });
        }
    }

    switchRole(id) {
        if (this.state.players[id]) {
            this.state.players[id].role = this.state.players[id].role === 'SPYMASTER' ? 'GUESSER' : 'SPYMASTER';
            this.setState({ players: this.state.players });
        }
    }

    setWords(words) {
        if (words && words.length >= 36) {
            this.allWords = words.map(w => w.ana_kelime.toUpperCase());
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

    startGame(settings) {
        const size = parseInt(settings.boardSize) || 25;
        const duration = parseInt(settings.turnDuration) || 90;

        this.state.boardSize = size;
        this.state.turnDuration = duration;
        this.state.status = 'playing';
        this.state.turnTeam = Math.random() < 0.5 ? 'A' : 'B';
        this.state.phase = 'CLUE';
        this.state.currentClue = null;
        this.state.winnerTeam = null;

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
        if (this.renderFrame) cancelAnimationFrame(this.renderFrame);

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
                    this.setState(this.state);
                }
                return;
            }

            this.renderFrame = requestAnimationFrame(tick);
        };
        this.renderFrame = requestAnimationFrame(tick);
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

    processAction(actionType, payload, senderId) {
        if (this.state.status !== 'playing') return;

        const p = this.state.players[senderId];
        if (!p) return;

        if (actionType === 'SUBMIT_CLUE' && this.state.phase === 'CLUE' && p.team === this.state.turnTeam && p.role === 'SPYMASTER') {
            const count = parseInt(payload.count);
            if (!payload.word || isNaN(count)) return;

            this.state.currentClue = {
                word: payload.word.toUpperCase(),
                count: count,
                remaining: count + 1
            };
            this.state.phase = 'GUESS';
            this.setState(this.state);
            if(this.onSound) this.onSound('tick');
        }
        else if (actionType === 'GUESS_WORD' && this.state.phase === 'GUESS' && p.team === this.state.turnTeam && p.role === 'GUESSER') {
            const cellIdx = payload.index;
            const cell = this.state.board[cellIdx];
            if (!cell || cell.revealed) return;

            cell.revealed = true;

            if (cell.team === 'ASSASSIN') {
                if (this.onSound) this.onSound('timeup'); // Game over sound
                this.endGame(p.team === 'A' ? 'B' : 'A');
            }
            else if (cell.team === 'TEAM_' + this.state.turnTeam) {
                if (this.onSound) this.onSound('correct');
                if (this.state.turnTeam === 'A') this.state.scoreA--;
                else this.state.scoreB--;

                this.state.currentClue.remaining--;

                if (this.state.scoreA === 0) this.endGame('A');
                else if (this.state.scoreB === 0) this.endGame('B');
                else if (this.state.currentClue.remaining <= 0) {
                    this.switchTurn();
                }
            }
            else {
                // Neutral or Enemy
                if (this.onSound) this.onSound('taboo');
                if (cell.team === 'TEAM_A') this.state.scoreA--;
                else if (cell.team === 'TEAM_B') this.state.scoreB--;

                if (this.state.scoreA === 0) this.endGame('A');
                else if (this.state.scoreB === 0) this.endGame('B');
                else this.switchTurn();
            }
            this.setState(this.state);
        }
        else if (actionType === 'END_TURN' && this.state.phase === 'GUESS' && p.team === this.state.turnTeam && p.role === 'GUESSER') {
            this.switchTurn();
            this.setState(this.state);
        }
    }

    switchTurn() {
        this.state.turnTeam = this.state.turnTeam === 'A' ? 'B' : 'A';
        this.state.phase = 'CLUE';
        this.state.currentClue = null;

        this.startTimer();
    }

    endGame(winnerTeam) {
        this.state.status = 'ended';
        this.state.winnerTeam = winnerTeam;
        if (this.renderFrame) cancelAnimationFrame(this.renderFrame);
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
        document.getElementById('btn-switch-role')?.addEventListener('click', () => this.callbacks.onSwitchRole());
        document.getElementById('btn-start-game')?.addEventListener('click', () => this.callbacks.onStartGame());

        const submitClue = () => {
            const word = document.getElementById('clue-word').value.trim();
            const count = document.getElementById('clue-count').value;
            if(!word || !count) {
                this.showToast("Lütfen ipucu ve sayı giriniz!", "warning");
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
        document.getElementById('btn-leave')?.addEventListener('click', () => this.callbacks.onLeave());
        document.getElementById('btn-leave-game')?.addEventListener('click', () => this.callbacks.onLeave());
    }

    showScreen(screenId) {
        if(window.showScreen) window.showScreen(screenId);
    }

    showToast(msg, type = "info") {
        if(window.showToast) window.showToast(msg, type);
    }

    updateUI(state, isHost) {
        const playerCount = Object.keys(state.players).length;
        document.getElementById('player-count').innerText = playerCount;

        const btnStart = document.getElementById('btn-start-game');
        if (btnStart) {
            if (playerCount >= 2) btnStart.classList.remove('disabled');
            else btnStart.classList.add('disabled');
        }

        const pList = document.getElementById('players-list');
        if (pList) {
            pList.innerHTML = '';
            Object.values(state.players).forEach(p => {
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';

                const safeName = p.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const infoSpan = document.createElement('div');
                infoSpan.style.display = 'flex';
                infoSpan.style.flexDirection = 'column';
                infoSpan.style.gap = '4px';
                
                const roleStr = p.role === 'SPYMASTER' ? 'Ajan' : 'Tahminci';
                const teamColorVar = p.team === 'A' ? 'var(--team-a-color)' : 'var(--team-b-color)';
                const teamBgVar = p.team === 'A' ? 'var(--team-a-bg)' : 'var(--team-b-bg)';
                const roleColor = p.role === 'SPYMASTER' ? 'var(--warning)' : 'var(--success)';
                const roleBg = p.role === 'SPYMASTER' ? 'var(--warning-bg)' : 'var(--success-bg)';
                
                infoSpan.innerHTML = `
                    <span style="font-weight:500; font-size:1rem; display:flex; align-items:center; gap:4px;">
                        ${p.isHost ? '<span title="Kurucu">👑</span>' : ''}
                        ${safeName} 
                        ${p.id === this.myId ? '<span style="opacity:0.6; font-size:0.8em;">(Sen)</span>' : ''}
                    </span>
                    <div style="display:flex; gap:6px;">
                        <span style="background:${teamBgVar}; color:${teamColorVar}; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:700; border: 1px solid ${teamColorVar};">Takım ${p.team}</span>
                        <span style="background:${roleBg}; color:${roleColor}; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:700; border: 1px solid ${roleColor};">${roleStr}</span>
                    </div>
                `;
                li.appendChild(infoSpan);

                if (isHost && p.id !== this.myId && state.status !== 'playing') {
                    const kickBtn = document.createElement('button');
                    kickBtn.className = 'btn btn-danger btn-icon';
                    kickBtn.style.padding = '4px 8px';
                    kickBtn.style.marginLeft = '8px';
                    kickBtn.title = "Oyuncuyu At";
                    kickBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                    kickBtn.onclick = () => this.callbacks.onKickPlayer(p.id);
                    li.appendChild(kickBtn);
                }
                pList.appendChild(li);
            });
        }

        if (state.status === 'lobby') {
            this.showScreen('lobby-screen');
        } else if (state.status === 'playing') {
            this.showScreen('game-screen');
            this.updateGameUI(state);
        } else if (state.status === 'ended') {
            this.showScreen('winner-screen');
            this.updateWinnerUI(state);
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
            document.getElementById('current-clue-count').innerText = state.currentClue ? `Sayı: ${state.currentClue.count}` : '';
            document.getElementById('current-clue-rem').innerText = state.currentClue ? `Kalan: ${state.currentClue.remaining}` : '';

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

            if (!cell.revealed && canGuess) {
                card.style.cursor = 'pointer';
                card.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.callbacks.onGuessWord(idx);
                };
            } else {
                card.style.cursor = 'default';
                card.onclick = null;
            }

            boardEl.appendChild(card);
        });
    }

    updateWinnerUI(state) {
        let msg = `Takım ${state.winnerTeam} Kazandı!`;
        const winnerMsgEl = document.getElementById('winner-message');
        winnerMsgEl.innerText = msg;
        winnerMsgEl.style.color = state.winnerTeam === 'A' ? 'var(--team-a-color)' : 'var(--team-b-color)';
        
        document.getElementById('final-score-a').innerText = state.scoreA;
        document.getElementById('final-score-b').innerText = state.scoreB;

        const btnBack = document.getElementById('btn-back-lobby');
        if (state.players[this.myId]?.isHost) {
            btnBack.classList.remove('hidden');
        } else {
            btnBack.classList.add('hidden');
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