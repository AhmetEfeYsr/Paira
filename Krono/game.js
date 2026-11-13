class KronoGame {
    constructor() {
        this.gameState = 'LOBBY';
        this.players = [];
        this.myId = null;
        this.settings = {
            turnDuration: 60,
            roundCount: 3
        };
        
        this.currentRound = 0;
        this.eventsData = [];
        this.currentRoundEvents = [];
        this.correctOrder = [];
        
        this.timer = null;
        this.nextRoundTimeout = null;
        this.timeLeft = 0;
        this.hintsRemaining = 2;
        this.finishedPlayers = 0;
        this.roundResults = {};
        this.myRoundResultText = '';
        this.usedEventIds = new Set();

        this.sortableInstance = null;

        this.init();
    }

    async init() {
        await this.loadEventsData();
        this.network = new KronoNetwork(this);
        this.bindEvents();
        
        // Eğer solo moddaysa direkt oyunu başlat
        if (this.network.isSolo) {
            this.startNewRound();
        }
    }

    async loadEventsData() {
        try {
            const response = await fetch('tr.json');
            this.eventsData = await response.json();
        } catch (error) {
            console.error('Veri yüklenemedi:', error);
            this.showToast('Tarihi olaylar yüklenemedi!', 'error');
        }
    }

    bindEvents() {
        // Lobby Events
        document.getElementById('btn-leave-lobby')?.addEventListener('click', async () => {
            const confirmed = await window.pairaConfirm({
                title: "Lobiden Ayrıl",
                message: "Lobiden çıkmak istediğinize emin misiniz?",
                confirmText: "Ayrıl",
                cancelText: "Kal",
                confirmType: "danger"
            });
            if (confirmed) {
                if (this.network && !this.network.isSolo) this.network.leaveRoom();
                else window.location.href = 'index.html';
            }
        });

        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                if (startBtn.classList.contains('disabled')) return;
                
                this.settings.turnDuration = parseInt(document.getElementById('turn-duration').value) || 60;
                this.settings.roundCount = parseInt(document.getElementById('round-count').value) || 3;
                
                this.network.send({
                    type: 'SYNC_SETTINGS',
                    settings: this.settings
                });

                this.startNewRound();
            });
        }

        // Settings sync
        ['turn-duration', 'round-count'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', (e) => {
                if (this.network.isHost && !this.network.isSolo) {
                    this.settings.turnDuration = parseInt(document.getElementById('turn-duration').value) || 60;
                    this.settings.roundCount = parseInt(document.getElementById('round-count').value) || 3;
                    this.network.send({
                        type: 'SYNC_SETTINGS',
                        settings: this.settings
                    });
                }
            });
        });

        // Game Events
        document.getElementById('btn-leave-game')?.addEventListener('click', async () => {
            const confirmed = await window.pairaConfirm({
                title: "Oyundan Ayrıl",
                message: "Devam eden oyundan çıkmak istediğinize emin misiniz?",
                confirmText: "Ayrıl",
                cancelText: "Oyuna Dön",
                confirmType: "danger"
            });
            if (confirmed) {
                if (this.network && !this.network.isSolo) this.network.leaveRoom();
                else window.location.href = 'index.html';
            }
        });

        document.getElementById('btn-hint')?.addEventListener('click', () => this.useHint());
        document.getElementById('btn-submit')?.addEventListener('click', () => this.checkAnswers(true));

        document.getElementById('btn-back-to-lobby')?.addEventListener('click', () => {
            if (this.network.isSolo) {
                this.players.forEach(p => p.score = 0);
                this.currentRound = 0;
                this.usedEventIds.clear();
                this.startNewRound();
            } else if (this.network.isHost) {
                this.returnToLobby();
            }
        });

        document.getElementById('btn-exit-game')?.addEventListener('click', () => {
            if (this.network && !this.network.isSolo) this.network.leaveRoom();
            else window.location.href = 'index.html';
        });
    }

    updateLobbyUI() {
        const countSpan = document.getElementById('player-count');
        const list = document.getElementById('players-list');
        if (!countSpan || !list) return;

        countSpan.textContent = this.players.length;
        list.innerHTML = '';

        this.players.forEach(p => {
            const li = document.createElement('li');
            const safeName = p.name ? (window.escapeHtml ? window.escapeHtml(p.name) : p.name.replace(/</g, "&lt;").replace(/>/g, "&gt;")) : '';
            const initial = safeName.charAt(0).toUpperCase();
            li.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:30px;height:30px;border-radius:50%;background:var(--primary-purple);color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;">
                        ${initial}
                    </div>
                    <span>${safeName} ${p.id === this.myId ? '(Sen)' : ''}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    ${p.isHost ? '<span style="font-size:0.8rem;background:var(--warning);color:var(--bg-navy);padding:2px 8px;border-radius:10px;font-weight:bold;">Kurucu</span>' : ''}
                </div>
            `;
            if (this.network && this.network.isHost && !this.network.isSolo && p.id !== this.myId) {
                const kickBtn = document.createElement('button');
                kickBtn.className = 'btn btn-danger btn-icon';
                kickBtn.style.padding = '4px 8px';
                kickBtn.title = "Oyuncuyu At";
                kickBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                kickBtn.onclick = () => this.network.kickPlayer(p.id);
                li.lastElementChild.appendChild(kickBtn);
            }
            list.appendChild(li);
        });
    }

    shuffleArray(arr) {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    startNewRound() {
        this.currentRound++;
        
        let pool = this.eventsData.filter(ev => !this.usedEventIds.has(ev.id));
        if (pool.length < 5) {
            this.usedEventIds.clear();
            pool = [...this.eventsData];
        }

        const pickUniqueYearHand = (items) => {
            const shuffled = this.shuffleArray(items);
            const picked = [];
            const seenYears = new Set();
            for (const ev of shuffled) {
                if (!seenYears.has(ev.tarih)) {
                    seenYears.add(ev.tarih);
                    picked.push(ev);
                    if (picked.length === 5) break;
                }
            }
            return picked;
        };

        let selected = pickUniqueYearHand(pool);
        if (selected.length < 5 && this.usedEventIds.size > 0) {
            this.usedEventIds.clear();
            selected = pickUniqueYearHand(this.eventsData);
        }
        selected.forEach(ev => this.usedEventIds.add(ev.id));
        
        const gameData = {
            round: this.currentRound,
            totalRounds: this.settings.roundCount,
            timeLimit: this.settings.turnDuration,
            events: selected
        };

        this.network.send({
            type: 'GAME_START',
            gameData: gameData
        });

        this.startRound(gameData);
    }

    startRound(gameData) {
        if (this.nextRoundTimeout) {
            clearTimeout(this.nextRoundTimeout);
            this.nextRoundTimeout = null;
        }
        this.gameState = 'PLAYING';
        this.switchView('game-screen');
        
        this.currentRound = gameData.round;
        this.settings.roundCount = gameData.totalRounds;
        this.settings.turnDuration = gameData.timeLimit;
        
        // Initial random order is already provided by host in gameData.events
        this.currentRoundEvents = [...gameData.events];
        const sorted = [...this.currentRoundEvents].sort((a, b) => a.tarih - b.tarih);
        this.correctOrder = sorted.map(e => e.id);
        
        this.hintsRemaining = 2;
        this.finishedPlayers = 0;
        this.roundResults = {};
        this.myRoundResultText = '';

        // Audio trigger for round start
        window.PairaAudio && window.PairaAudio.play('correct');

        // Update UI
        document.getElementById('round-indicator').textContent = `Tur ${this.currentRound} / ${this.settings.roundCount}`;
        document.getElementById('hint-count').textContent = this.hintsRemaining;
        document.getElementById('btn-hint').classList.remove('disabled');
        document.getElementById('btn-submit').classList.remove('disabled');
        document.getElementById('btn-submit').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Kontrol Et`;
        
        document.getElementById('game-status-message').textContent = 'Olayları kronolojik olarak sırala (Eskiden Yeniye)';
        document.getElementById('game-actions').classList.remove('hidden');
        
        this.updateScoreBoard();
        this.renderEvents();
        this.startTimer();
    }

    renderEvents() {
        const container = document.getElementById('events-container');
        container.innerHTML = '';
        container.classList.remove('hidden');

        this.currentRoundEvents.forEach((ev, index) => {
            const el = document.createElement('div');
            el.className = 'event-card';
            el.dataset.id = ev.id;
            
            // Format year
            let yearStr = ev.tarih < 0 ? `M.Ö. ${Math.abs(ev.tarih)}` : ev.tarih.toString();
            const safeTitle = window.escapeHtml ? window.escapeHtml(ev.olay) : ev.olay;

            el.innerHTML = `
                <div class="event-order">${index + 1}</div>
                <div class="event-title">${safeTitle}</div>
                <div class="event-date">${yearStr}</div>
                <div class="order-controls">
                    <button class="btn-order btn-up" aria-label="Yukarı taşı" onclick="window.gameInstance.moveCard(this, -1)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    </button>
                    <div class="drag-handle" title="Sürükleyerek taşı">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    </div>
                    <button class="btn-order btn-down" aria-label="Aşağı taşı" onclick="window.gameInstance.moveCard(this, 1)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                </div>
            `;
            container.appendChild(el);
        });

        this.updateOrderNumbers();

        if (this.sortableInstance) {
            this.sortableInstance.destroy();
        }

        this.sortableInstance = new Sortable(container, {
            animation: 150,
            handle: '.event-card',
            filter: '.locked, .btn-order',
            preventOnFilter: false,
            onEnd: () => {
                this.forceLockedCardsToCorrectPosition();
            }
        });
    }

    forceLockedCardsToCorrectPosition() {
        const container = document.getElementById('events-container');
        if (!container) return;
        const cards = Array.from(container.children);
        
        const sortedCards = new Array(cards.length).fill(null);
        
        cards.forEach(card => {
            if (card.classList.contains('locked')) {
                const id = parseInt(card.dataset.id);
                const correctIndex = this.correctOrder.indexOf(id);
                if (correctIndex !== -1 && correctIndex < sortedCards.length) {
                    sortedCards[correctIndex] = card;
                }
            }
        });
        
        let unlockedPtr = 0;
        cards.forEach(card => {
            if (!card.classList.contains('locked')) {
                while (unlockedPtr < sortedCards.length && sortedCards[unlockedPtr] !== null) {
                    unlockedPtr++;
                }
                if (unlockedPtr < sortedCards.length) {
                    sortedCards[unlockedPtr] = card;
                }
            }
        });
        
        container.innerHTML = '';
        sortedCards.forEach(card => {
            if (card) {
                container.appendChild(card);
            }
        });
        
        this.updateOrderNumbers();
    }

    moveCard(btn, direction) {
        if (this.gameState !== 'PLAYING') return;
        
        const card = btn.closest('.event-card');
        if (card.classList.contains('locked')) return;

        const container = document.getElementById('events-container');
        const cards = Array.from(container.children);
        const index = cards.indexOf(card);
        const newIndex = index + direction;

        if (newIndex >= 0 && newIndex < cards.length) {
            const targetCard = cards[newIndex];
            // Normal yer değiştirme
            if (direction < 0) {
                container.insertBefore(card, targetCard);
            } else {
                container.insertBefore(card, targetCard.nextSibling);
            }
            
            // Sıralamayı güncelle ve animasyon ekle
            card.style.transform = direction < 0 ? 'translateY(10px)' : 'translateY(-10px)';
            setTimeout(() => card.style.transform = '', 150);
            
            this.forceLockedCardsToCorrectPosition();
        }
    }

    updateOrderNumbers() {
        const cards = document.querySelectorAll('.event-card');
        cards.forEach((card, index) => {
            const orderEl = card.querySelector('.event-order');
            if (orderEl) orderEl.textContent = index + 1;
            
            // Yukarı/Aşağı butonlarını duruma göre gizle/göster (kilitli kartları hesaba katarak)
            const upBtn = card.querySelector('.btn-up');
            const downBtn = card.querySelector('.btn-down');
            
            if (upBtn && downBtn) {
                upBtn.style.opacity = index === 0 ? '0.3' : '1';
                upBtn.style.pointerEvents = index === 0 ? 'none' : 'auto';
                
                downBtn.style.opacity = index === cards.length - 1 ? '0.3' : '1';
                downBtn.style.pointerEvents = index === cards.length - 1 ? 'none' : 'auto';
            }
        });
    }

    useHint() {
        if (this.hintsRemaining <= 0 || this.gameState !== 'PLAYING') return;

        const cards = Array.from(document.querySelectorAll('.event-card'));
        
        // Play pass sound on hint
        window.PairaAudio && window.PairaAudio.play('pass');

        if (this.hintsRemaining === 2) {
            // Hint 1: Reveal a random date that is not yet revealed
            const unrevealed = cards.filter(c => !c.querySelector('.event-date').classList.contains('visible'));
            if (unrevealed.length > 0) {
                const randomCard = unrevealed[Math.floor(Math.random() * unrevealed.length)];
                randomCard.querySelector('.event-date').classList.add('visible');
            }
        } else if (this.hintsRemaining === 1) {
            // Hint 2: Place one unrevealed/unlocked item correctly and lock it
            const unrevealedAndUnlocked = cards.filter(
                c => !c.classList.contains('locked') && !c.querySelector('.event-date')?.classList.contains('visible')
            );
            const unlockedCards = unrevealedAndUnlocked.length > 0
                ? unrevealedAndUnlocked
                : cards.filter(c => !c.classList.contains('locked'));
            if (unlockedCards.length > 0) {
                const randomCard = unlockedCards[Math.floor(Math.random() * unlockedCards.length)];
                randomCard.classList.add('locked');
                randomCard.querySelector('.event-date').classList.add('visible');
                this.forceLockedCardsToCorrectPosition();
            }
        }

        this.hintsRemaining--;
        document.getElementById('hint-count').textContent = this.hintsRemaining;
        
        if (this.hintsRemaining === 0) {
            document.getElementById('btn-hint').classList.add('disabled');
        }
    }

    startTimer() {
        clearInterval(this.timer);
        this.timeLeft = this.settings.turnDuration;
        this.updateTimerDisplay();

        const endTime = window.PairaTime.now() + (this.timeLeft * 1000);
        let lastTickSec = -1;

        this.timer = setInterval(() => {
            const left = Math.max(0, endTime - window.PairaTime.now());
            this.timeLeft = Math.ceil(left / 1000);
            this.updateTimerDisplay();

            if (this.timeLeft <= 10 && this.timeLeft > 0 && lastTickSec !== this.timeLeft) {
                window.PairaAudio && window.PairaAudio.play('tick');
                lastTickSec = this.timeLeft;
            }

            if (left <= 0) {
                clearInterval(this.timer);
                window.PairaAudio && window.PairaAudio.play('end');
                this.checkAnswers(false);
            }
        }, 100);
    }

    updateTimerDisplay() {
        const display = document.getElementById('timer-display');
        const m = Math.floor(this.timeLeft / 60).toString().padStart(2, '0');
        const s = (this.timeLeft % 60).toString().padStart(2, '0');
        display.textContent = `${m}:${s}`;
        
        if (this.timeLeft <= 10) {
            display.style.color = 'var(--danger)';
            display.classList.add('timer-pulse');
        } else {
            display.style.color = 'var(--lilac)';
            display.classList.remove('timer-pulse');
        }
    }

    checkAnswers(manualSubmit) {
        if (this.gameState !== 'PLAYING') return;
        this.gameState = 'FINISHED';
        clearInterval(this.timer);
        document.getElementById('timer-display')?.classList.remove('timer-pulse');
        
        document.getElementById('btn-hint').classList.add('disabled');
        document.getElementById('btn-submit').classList.add('disabled');
        
        const cards = document.querySelectorAll('.event-card');
        let correctCount = 0;
        
        cards.forEach((card, index) => {
            const id = parseInt(card.dataset.id);
            const dateEl = card.querySelector('.event-date');
            dateEl.classList.add('visible'); // reveal all dates
            
            const event = this.currentRoundEvents.find(e => e.id === id);
            const expectedId = this.correctOrder[index];
            const expectedEvent = this.currentRoundEvents.find(e => e.id === expectedId);
            
            if (event && expectedEvent && event.tarih === expectedEvent.tarih) {
                correctCount++;
                card.classList.add('locked'); // green
                card.classList.remove('wrong');
            } else {
                card.classList.add('wrong');
            }
            
            // Disable drag
            card.style.pointerEvents = 'none';
        });

        // Play feedback sound
        if (correctCount === 5) {
            window.PairaAudio && window.PairaAudio.play('correct');
        } else {
            window.PairaAudio && window.PairaAudio.play('wrong');
        }

        // Calculate score
        const timeSpent = this.settings.turnDuration - this.timeLeft;
        // Base score: 20 per correct
        let roundScore = correctCount * 20;
        // Bonus for time if fully correct
        if (correctCount === 5 && this.timeLeft > 0) {
            roundScore += Math.floor(this.timeLeft / 2); // 0.5 points per remaining second
        }

        const me = this.players.find(p => p.id === this.myId);
        if (me) {
            me.score += roundScore;
        }

        this.updateScoreBoard();
        
        this.myRoundResultText = `${correctCount} doğru! Puan: +${roundScore}`;
        document.getElementById('game-status-message').textContent = this.myRoundResultText;

        this.network.send({
            type: 'SCORE_UPDATE',
            playerId: this.myId,
            score: me ? me.score : roundScore
        });

        this.network.send({
            type: 'OPPONENT_FINISHED',
            playerId: this.myId,
            timeSpent: timeSpent,
            correctCount: correctCount
        });

        this.onOpponentFinished(this.myId, timeSpent, correctCount);
    }

    onOpponentFinished(playerId, timeSpent, correctCount) {
        if (this.roundResults[playerId]) return;
        this.finishedPlayers++;
        this.roundResults[playerId] = { timeSpent, correctCount };

        if (playerId !== this.myId) {
            this.showToast('Rakibin turu bitirdi!', 'info');
        }

        this._checkAllPlayersFinishedRound();
    }

    checkRoundCompletionAfterLeave(leftPlayerId) {
        if (this.roundResults[leftPlayerId]) {
            delete this.roundResults[leftPlayerId];
            this.finishedPlayers = Math.max(0, this.finishedPlayers - 1);
        }
        if (this.gameState === 'FINISHED') {
            this._checkAllPlayersFinishedRound();
        }
    }

    _checkAllPlayersFinishedRound() {
        const totalPlayers = this.network.isSolo ? 1 : this.players.length;
        const finishedCount = Object.keys(this.roundResults).filter(pid => this.players.some(p => p.id === pid)).length;
        const statusMsg = document.getElementById('game-status-message');

        if (finishedCount >= totalPlayers && totalPlayers > 0) {
            if (this.nextRoundTimeout) return;
            // Everyone finished - show countdown before next action
            const isLastRound = this.currentRound >= this.settings.roundCount;
            const baseText = this.myRoundResultText || statusMsg.textContent;
            let countdown = 4;
            
            const updateCountdown = () => {
                if (countdown > 0) {
                    if (isLastRound) {
                        statusMsg.textContent = `${baseText} • Sonuçlar ${countdown}s sonra...`;
                    } else {
                        statusMsg.textContent = `${baseText} • Sonraki tur ${countdown}s sonra...`;
                    }
                    countdown--;
                    this.nextRoundTimeout = setTimeout(updateCountdown, 1000);
                } else {
                    this.nextRoundTimeout = null;
                    if (this.network.isHost || this.network.isSolo) {
                        if (isLastRound) {
                            const finalScores = this.players.map(p => ({ id: p.id, name: p.name, score: p.score }));
                            this.network.send({
                                type: 'ROUND_OVER',
                                scores: finalScores
                            });
                            this.endRound(finalScores);
                        } else {
                            this.startNewRound();
                        }
                    }
                }
            };
            updateCountdown();
        } else if (this.gameState === 'FINISHED') {
            const baseText = this.myRoundResultText ? `${this.myRoundResultText} • ` : '';
            statusMsg.textContent = `${baseText}Rakibin bitirmesi bekleniyor...`;
        } else if (this.gameState === 'PLAYING') {
            statusMsg.textContent = 'Rakibin turu bitirdi! Sıralamanı tamamla.';
        }
    }

    endRound(scores) {
        this.gameState = 'GAMEOVER';
        this.switchView('winner-screen');
        
        window.PairaAudio && window.PairaAudio.play('end');
        
        // Update scores array from server if needed
        scores.forEach(s => {
            const p = this.players.find(pl => pl.id === s.id);
            if (p) p.score = s.score;
        });

        const sorted = [...this.players].sort((a, b) => b.score - a.score);
        const winner = sorted[0];

        const title = document.getElementById('winner-name');
        if (this.network.isSolo) {
            title.textContent = "Oyun Bitti!";
        } else {
            if (sorted.length > 1 && sorted[0].score === sorted[1].score) {
                title.textContent = "Berabere!";
            } else {
                title.textContent = `${window.escapeHtml(winner.name)} Kazandı!`;
            }
        }

        const container = document.getElementById('final-scores-container');
        container.innerHTML = '';
        
        sorted.forEach((p, index) => {
            const el = document.createElement('div');
            el.style.display = 'flex';
            el.style.justifyContent = 'space-between';
            el.style.alignItems = 'center';
            el.style.padding = '10px 20px';
            el.style.background = index === 0 && !this.network.isSolo ? 'rgba(var(--success-rgb), 0.2)' : 'var(--input-bg)';
            el.style.borderRadius = '10px';
            el.style.border = index === 0 && !this.network.isSolo ? '1px solid var(--success)' : '1px solid transparent';
            
            el.innerHTML = `
                <span style="font-weight:600;">${window.escapeHtml(p.name)}</span>
                <strong style="color:var(--neon-purple); font-size:1.5rem;">${p.score}</strong>
            `;
            container.appendChild(el);
        });

        const btnBack = document.getElementById('btn-back-to-lobby');
        const btnExit = document.getElementById('btn-exit-game');
        if (this.network.isSolo) {
            if (btnBack) {
                btnBack.style.display = 'flex';
                btnBack.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> Tekrar Oyna`;
            }
            if (btnExit) {
                btnExit.style.display = 'flex';
                btnExit.textContent = 'Ana Menüye Dön';
            }
        } else {
            if (btnBack) {
                btnBack.style.display = this.network.isHost ? 'flex' : 'none';
                btnBack.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg> Lobiye Dön`;
            }
            if (btnExit) {
                btnExit.style.display = 'flex';
                btnExit.textContent = 'Odadan Çık';
            }
        }
    }

    returnToLobby() {
        clearInterval(this.timer);
        if (this.nextRoundTimeout) {
            clearTimeout(this.nextRoundTimeout);
            this.nextRoundTimeout = null;
        }
        this.players.forEach(p => p.score = 0);
        this.currentRound = 0;
        this.usedEventIds.clear();
        this.gameState = 'LOBBY';
        
        if (this.network && this.network.isHost) {
            this.network.send({ type: 'RETURN_LOBBY' });
        }
        this.updateLobbyUI();
        this.switchView('lobby-screen');
    }

    updateScoreBoard() {
        const container = document.getElementById('score-board-container');
        if (!container) return;
        
        container.innerHTML = '';
        this.players.forEach((p) => {
            const isSelf = p.id === this.myId;
            const el = document.createElement('div');
            el.className = `team ${isSelf ? 'team-self' : 'team-opponent'}`;
            el.innerHTML = `${window.escapeHtml(p.name)}: <span>${p.score}</span>`;
            container.appendChild(el);
        });
    }

    switchView(viewId) {
        if(window.showScreen) window.showScreen(viewId);
    }

    showToast(msg, type = "info") {
        if(window.showToast) window.showToast(msg, type);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('game-screen')) {
        window.gameInstance = new KronoGame();
    }
});