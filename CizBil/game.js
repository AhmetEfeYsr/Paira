/**
 * CizBilGameEngine - Core game logic
 */
class CizBilGameEngine {
    constructor(isHost = true) {
        this.isHost = isHost;
        this.state = {
            status: 'lobby',
            players: {},
            currentDrawer: null,
            currentWord: '',
            targetScore: 50,
            turnDuration: 60,
            wordsLeft: [],
            guessedCorrectly: [],
            choices: null,
            revealWord: null
        };
        
        this.onStateChange = null;
        this.onTimerTick = null;
        this.onSound = null;

        this.turnTimeout = null;
        this.localTurnEndTime = 0;
        this.renderFrame = null;
        this.lastTickSec = -1;
        this.fuzzyMatcher = new window.FuzzyMatcher();
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        if (this.onStateChange) this.onStateChange(this.state);
    }

    addPlayer(id, name, isHost) {
        this.state.players[id] = { id, name, isHost, score: 0 };
        this.setState({ players: this.state.players });
    }

    removePlayer(id) {
        delete this.state.players[id];
        this.setState({ players: this.state.players });

        if (this.isHost && this.state.status === 'playing') {
            if (this.state.currentDrawer === id) {
                this.checkWinOrNextRound(); // Drawer left, skip turn
            } else {
                this.checkAllGuessed();
            }
        }
    }

    startGame(settings) {
        if (!this.isHost) return;
        if (Object.keys(this.state.players).length < 2) return false;

        this.state.targetScore = parseInt(settings.targetScore) || 50;
        this.state.turnDuration = parseInt(settings.turnDuration) || 60;
        
        if (window.cizbilWords) {
            this.state.wordsLeft = [...window.cizbilWords];
            this.state.wordsLeft.sort(() => Math.random() - 0.5);
        } else {
            this.state.wordsLeft = ["ELMA", "ARMUT", "ARABA", "TELEFON", "EV"];
        }

        Object.keys(this.state.players).forEach(id => this.state.players[id].score = 0);
        this.state.status = 'playing';

        this.startRound();
        return true;
    }

    startRound() {
        if (!this.isHost) return;

        const activePlayers = Object.keys(this.state.players);
        if (activePlayers.length === 0) {
            this.endGame();
            return;
        }

        let dIndex = activePlayers.indexOf(this.state.currentDrawer);
        dIndex = (dIndex + 1) % activePlayers.length;
        this.state.currentDrawer = activePlayers[dIndex];
        this._timerShortened = false; // Reset timer shortened flag for new round
        this.state.guessedCorrectly = [];
        this.state.revealWord = null;

        if (this.state.wordsLeft.length < 2) {
             if (window.cizbilWords) {
                 this.state.wordsLeft = [...window.cizbilWords].sort(() => Math.random() - 0.5);
             } else {
                 this.state.wordsLeft = ["YEDEK1", "YEDEK2"];
             }
        }

        const word1 = this.state.wordsLeft.pop();
        const word2 = this.state.wordsLeft.pop();
        
        this.state.currentWord = "";
        this.state.choices = [word1, word2];
        
        this.setState(this.state);
    }

    officialStartRound(chosenWord) {
        if (!this.isHost) return;
        
        this.state.currentWord = chosenWord;
        this.state.choices = null;
        
        this.localTurnEndTime = window.PairaTime.now() + (this.state.turnDuration * 1000);
        this.lastTickSec = -1;
        
        this.setState(this.state);
        this.startRenderTimer();

        clearTimeout(this.turnTimeout);
        this.turnTimeout = setTimeout(() => {
            this.checkWinOrNextRound();
        }, this.state.turnDuration * 1000);
    }

    isMatch(guess, target) {
        if (!guess || !target) return false;
        const cleanGuess = guess.toLocaleLowerCase('tr-TR').trim();
        const cleanTarget = target.toLocaleLowerCase('tr-TR').trim();
        if (cleanGuess === cleanTarget) return true;

        if (this.fuzzyMatcher) {
            return this.fuzzyMatcher.isMatch(cleanGuess, cleanTarget, 1.2); // Standard drawing match tolerance
        }
        return cleanGuess === cleanTarget;
    }

    handleGuess(senderId, text) {
        if (!this.isHost || this.state.status !== 'playing') return false;
        if (!this.state.currentWord || this.state.choices) return false; 
        if (senderId === this.state.currentDrawer) return false;

        if (this.state.guessedCorrectly.includes(senderId)) {
            if (this.isMatch(text, this.state.currentWord)) return 'spoiler';
            return false;
        }

        if (this.isMatch(text, this.state.currentWord)) {
            this.state.guessedCorrectly.push(senderId);

            const activeGuessersCount = Object.keys(this.state.players).length - 1; 
            const guessOrder = this.state.guessedCorrectly.length; 
            const maxPoints = 15;
            const minPoints = 5;
            let points = Math.max(minPoints, maxPoints - ((guessOrder - 1) * 2));

            this.state.players[senderId].score += points;
            if (this.state.players[this.state.currentDrawer]) {
                this.state.players[this.state.currentDrawer].score += Math.floor(points / 3); 
            }

            this.setState(this.state);
            this.checkAllGuessed();

            return true; // Correct
        }
        return false; // Wrong, just chat
    }

    checkAllGuessed() {
        if (!this.isHost) return;
        const activeGuessersCount = Object.keys(this.state.players).length - 1;

        if (activeGuessersCount > 0 && this.state.guessedCorrectly.length >= activeGuessersCount) {
            this.checkWinOrNextRound();
        } else if (this.state.guessedCorrectly.length === 1 && activeGuessersCount > 1 && !this._timerShortened) {
            this._timerShortened = true;
            clearTimeout(this.turnTimeout);
            this.localTurnEndTime = window.PairaTime.now() + 10000;
            this.setState(this.state);
            this.turnTimeout = setTimeout(() => {
                this.checkWinOrNextRound();
            }, 10000);
        }
    }

    checkWinOrNextRound() {
        if (!this.isHost) return;
        clearTimeout(this.turnTimeout);

        let winner = null;
        Object.values(this.state.players).forEach(p => {
            if (p.score >= this.state.targetScore) {
                winner = p;
            }
        });

        if (winner) {
            this.endGame();
        } else {
            this.state.status = 'round_end';
            this.state.revealWord = this.state.currentWord;
            this.setState(this.state);
            setTimeout(() => {
                if(this.state.status !== 'ended') this.startRound();
            }, 4000);
        }
    }

    endGame() {
        this.state.status = 'ended';
        this.state.revealWord = this.state.currentWord;
        this.setState(this.state);
        if (this.onSound) this.onSound('end');
    }

    backToLobby() {
        this.state.status = 'lobby';
        Object.keys(this.state.players).forEach(pId => this.state.players[pId].score = 0);
        this.setState(this.state);
    }

    startRenderTimer() {
        if (this.renderFrame) cancelAnimationFrame(this.renderFrame);

        const tick = () => {
            if (this.state.status !== 'playing' || this.state.choices) return;

            const left = Math.max(0, this.localTurnEndTime - window.PairaTime.now());
            const secs = Math.ceil(left / 1000);
            
            if (this.onTimerTick) this.onTimerTick(secs);

            if (secs <= 5 && secs > 0 && this.lastTickSec !== secs) {
                if (this.onSound) this.onSound('tick');
                this.lastTickSec = secs;
            }

            this.renderFrame = requestAnimationFrame(tick);
        };
        this.renderFrame = requestAnimationFrame(tick);
    }
}

/**
 * CizBilView - Handles DOM
 */
class CizBilView {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.myId = null;
        this.drawingBoard = null;
        this.isUIInitialized = false;
        
        this.bindEvents();
    }

    setMyId(id) {
        this.myId = id;
    }

    bindEvents() {
        document.getElementById('btn-start-game')?.addEventListener('click', () => {
            const settings = {
                turnDuration: document.getElementById('turn-duration')?.value,
                targetScore: document.getElementById('target-score')?.value
            };
            this.callbacks.onStartGame(settings);
        });

        document.getElementById('btn-back-to-lobby')?.addEventListener('click', () => {
            this.callbacks.onBackToLobby();
        });
        
        // Chat
        const sendGuess = () => {
            const input = document.getElementById('chat-input');
            const text = input.value.trim();
            if(!text) return;
            input.value = '';
            this.callbacks.onSendGuess(text);
        };
        document.getElementById('btn-send-chat')?.addEventListener('click', sendGuess);
        document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendGuess();
        });

        // Word choices
        document.getElementById('btn-choice-1')?.addEventListener('click', (e) => {
            this.callbacks.onChooseWord(e.target.textContent);
        });
        document.getElementById('btn-choice-2')?.addEventListener('click', (e) => {
            this.callbacks.onChooseWord(e.target.textContent);
        });
    }

    initCanvas(currentDrawer) {
        if (this.isUIInitialized) {
            // Re-apply overlay block if drawer changed
            const overlay = document.getElementById('canvas-overlay');
            if (currentDrawer === this.myId) {
                overlay.style.display = 'none';
            } else {
                overlay.style.display = 'block';
            }
            return;
        }
        this.isUIInitialized = true;

        const canvasElement = document.getElementById('drawing-board');
        if (!canvasElement) return;

        this.drawingBoard = new window.AdvancedDrawingBoard(canvasElement, {
            defaultColor: '#000000',
            defaultSize: 8,
            onDrawEvent: (eventData) => {
                this.callbacks.onDrawEvent(eventData);
            }
        });

        const overlay = document.getElementById('canvas-overlay');
        overlay.addEventListener('mousedown', (e) => { e.stopPropagation(); }, true);
        overlay.addEventListener('touchstart', (e) => { e.stopPropagation(); }, {passive: false, capture: true});

        const bindInteraction = (el, handler) => {
            el.addEventListener('pointerdown', (e) => { e.preventDefault(); handler(e); });
            el.addEventListener('click', (e) => { e.preventDefault(); handler(e); });
            el.style.touchAction = 'none';
        };

        document.querySelectorAll('.color-swatch').forEach(swatch => {
            bindInteraction(swatch, (e) => {
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                const target = e.target.closest('.color-swatch');
                target.classList.add('active');
                this.drawingBoard.setColor(target.dataset.color);
                if (target.dataset.color === '#ffffff') this.drawingBoard.setTool('eraser');
                else this.drawingBoard.setTool('brush');
            });
        });

        document.querySelectorAll('.size-btn').forEach(btn => {
            bindInteraction(btn, (e) => {
                document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                const target = e.target.closest('.size-btn');
                target.classList.add('active');
                this.drawingBoard.setSize(parseInt(target.dataset.size));
            });
        });

        document.querySelectorAll('.tool-btn').forEach(btn => {
            bindInteraction(btn, (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                const target = e.target.closest('.tool-btn');
                target.classList.add('active');
                this.drawingBoard.setTool(target.dataset.tool);
            });
        });

        bindInteraction(document.getElementById('btn-clear'), () => {
            this.callbacks.onClearCanvas();
        });

        const btnUndo = document.getElementById('btn-undo');
        if (btnUndo) {
            bindInteraction(btnUndo, () => {
                this.callbacks.onUndoCanvas();
            });
        }

        const customColorInput = document.querySelector('.custom-color-input');
        const customColorBtn = document.querySelector('.custom-color-btn');
        if (customColorInput && customColorBtn) {
            customColorInput.addEventListener('input', (e) => {
                const newColor = e.target.value;
                customColorBtn.dataset.color = newColor;
                customColorBtn.style.background = newColor;
                customColorBtn.querySelector('span').style.display = 'none';
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                customColorBtn.classList.add('active');
                this.drawingBoard.setColor(newColor);
                this.drawingBoard.setTool('brush');
            });
            customColorInput.addEventListener('pointerdown', e => {
                e.stopPropagation();
                const newColor = customColorInput.value;
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                customColorBtn.classList.add('active');
                this.drawingBoard.setColor(newColor);
                this.drawingBoard.setTool('brush');
            });
            customColorInput.addEventListener('click', e => e.stopPropagation());
        }
    }

    clearCanvasLocal() {
        if(this.drawingBoard) this.drawingBoard.clear(false);
    }
    
    undoCanvasLocal() {
        if(this.drawingBoard) this.drawingBoard.undo(false);
    }
    
    syncCanvasEvent(data) {
        if(this.drawingBoard) this.drawingBoard.replayEvent(data);
    }

    addChatMessage(name, text, isCorrect) {
        const container = document.getElementById('messages-container');
        if (!container) return;
        const msg = document.createElement('div');
        msg.className = 'chat-msg' + (isCorrect ? ' correct' : '');

        if (isCorrect) {
            msg.innerHTML = `<strong style="color:var(--success)">${window.escapeHtml(name)}</strong> doğru bildi! 🎉`;
        } else {
            msg.innerHTML = `<strong>${window.escapeHtml(name)}:</strong> <span>${window.escapeHtml(text)}</span>`;
        }

        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    updateUI(state, isHost) {
        if (state.status === 'lobby') {
            window.showScreen('lobby-screen');
        } else if (state.status === 'playing' || state.status === 'round_end') {
            window.showScreen('game-screen');
            this.updateGameUI(state);
        } else if (state.status === 'ended') {
            window.showScreen('winner-screen');
            this.updateWinnerUI(state);
        }
    }

    updateGameUI(state) {
        this.initCanvas(state.currentDrawer);
        
        const drawerName = state.players[state.currentDrawer]?.name || '...';
        document.getElementById('current-drawer').textContent = drawerName;

        const list = document.getElementById('game-scores-list');
        if (list) {
            list.innerHTML = '';
            const sorted = Object.values(state.players).sort((a,b) => b.score - a.score);
            sorted.forEach(p => {
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.padding = '5px 0';
                li.innerHTML = `<span>${window.escapeHtml(p.name)}</span> <strong style="color:var(--neon-purple);">${p.score}</strong>`;
                list.appendChild(li);
            });
        }

        const msgEl = document.getElementById('game-status-message');
        const wordEl = document.getElementById('main-word');

        if (state.status === 'round_end') {
            msgEl.textContent = 'Tur bitti! Kelime: ' + (state.revealWord || state.currentWord);
            wordEl.textContent = state.revealWord || state.currentWord;
            document.getElementById('toolbar').style.display = 'none';
            document.getElementById('canvas-overlay').style.display = 'block';
            document.getElementById('word-choice-overlay').style.display = 'none';
            return;
        }

        // FIX: Disable chat input for the drawer, enable for guessers
        const chatInput = document.getElementById('chat-input');
        const btnSendChat = document.getElementById('btn-send-chat');

        if (state.currentDrawer === this.myId) {
            msgEl.textContent = 'Çizen Sensin!';
            document.getElementById('toolbar').style.display = 'flex';
            document.getElementById('canvas-overlay').style.display = 'none';
            // Disable chat for drawer
            if (chatInput) { chatInput.disabled = true; chatInput.placeholder = 'Çizen kişi mesaj gönderemez'; }
            if (btnSendChat) btnSendChat.disabled = true;

            if (state.choices) {
                document.getElementById('word-choice-overlay').style.display = 'flex';
                document.getElementById('btn-choice-1').textContent = state.choices[0];
                document.getElementById('btn-choice-2').textContent = state.choices[1];
                wordEl.textContent = "KELİME SEÇİLİYOR...";
                msgEl.textContent = 'Bir Kelime Seç!';
            } else {
                document.getElementById('word-choice-overlay').style.display = 'none';
                wordEl.textContent = state.currentWord;
            }
        } else {
            msgEl.textContent = 'Tahmin Et!';
            document.getElementById('toolbar').style.display = 'none';
            document.getElementById('canvas-overlay').style.display = 'block';
            // Enable chat for guessers
            if (chatInput) { chatInput.disabled = false; chatInput.placeholder = 'Tahmin yaz...'; }
            if (btnSendChat) btnSendChat.disabled = false;
            document.getElementById('word-choice-overlay').style.display = 'none';

            if (state.choices) {
                wordEl.textContent = "KELİME SEÇİLİYOR...";
                msgEl.textContent = 'Çizen kelime seçiyor...';
            } else {
                wordEl.textContent = state.currentWord ? state.currentWord : '...';
            }
        }
    }

    updateWinnerUI(state) {
        const finalScores = document.getElementById('final-scores');
        finalScores.innerHTML = '';
        const sorted = Object.values(state.players).sort((a,b) => b.score - a.score);
        sorted.forEach((p, index) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.padding = '10px';
            div.style.background = 'var(--item-bg)';
            div.style.borderRadius = '8px';
            div.innerHTML = `<span>${index + 1}. ${window.escapeHtml(p.name)}</span> <strong style="color:var(--neon-purple);">${p.score} Puan</strong>`;
            finalScores.appendChild(div);
        });
    }

    updateTimer(secs) {
        const timerEl = document.getElementById('timer-display');
        if (!timerEl) return;
        timerEl.textContent = secs;
        timerEl.style.color = secs <= 5 && secs > 0 ? 'var(--danger)' : 'var(--warning)';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CizBilGameEngine, CizBilView };
} else {
    window.CizBilGameEngine = CizBilGameEngine;
    window.CizBilView = CizBilView;
}
