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
        this.timeLeft = 0;
        this.hintsRemaining = 2;
        this.finishedPlayers = 0;
        this.roundResults = {};

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
        document.getElementById('btn-leave-lobby')?.addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.getElementById('btn-copy-room')?.addEventListener('click', () => {
            const code = document.getElementById('display-room-code').dataset.code;
            if (code) {
                navigator.clipboard.writeText(code);
                this.showToast("Oda kodu kopyalandı", "success");
            }
        });

        const toggleCodeBtn = document.getElementById('btn-toggle-code');
        if (toggleCodeBtn) {
            toggleCodeBtn.addEventListener('click', () => {
                const display = document.getElementById('display-room-code');
                const eyeOpen = document.getElementById('icon-eye-open');
                const eyeClosed = document.getElementById('icon-eye-closed');
                const code = display.dataset.code;
                
                if (display.textContent === '••••••••') {
                    display.textContent = code;
                    eyeOpen.classList.remove('hidden');
                    eyeClosed.classList.add('hidden');
                } else {
                    display.textContent = '••••••••';
                    eyeOpen.classList.add('hidden');
                    eyeClosed.classList.remove('hidden');
                }
            });
        }

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
        document.getElementById('btn-leave-game')?.addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.getElementById('btn-hint')?.addEventListener('click', () => this.useHint());
        document.getElementById('btn-submit')?.addEventListener('click', () => this.checkAnswers(true));

        document.getElementById('btn-back-to-lobby')?.addEventListener('click', () => {
            if (this.network.isHost) {
                this.returnToLobby();
            }
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
            li.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:30px;height:30px;border-radius:50%;background:var(--primary-purple);color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;">
                        ${p.name.charAt(0).toUpperCase()}
                    </div>
                    <span>${p.name} ${p.id === this.myId ? '(Sen)' : ''}</span>
                </div>
                ${p.isHost ? '<span style="font-size:0.8rem;background:var(--warning);color:var(--bg-navy);padding:2px 8px;border-radius:10px;font-weight:bold;">Kurucu</span>' : ''}
            `;
            list.appendChild(li);
        });
    }

    startNewRound() {
        this.currentRound++;
        
        // Pick 5 random events
        const shuffled = [...this.eventsData].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 5);
        
        // Correct order (oldest to newest)
        const sorted = [...selected].sort((a, b) => a.tarih - b.tarih);
        
        const gameData = {
            round: this.currentRound,
            totalRounds: this.settings.roundCount,
            timeLimit: this.settings.turnDuration,
            events: selected,
            correctOrder: sorted.map(e => e.id)
        };

        this.network.send({
            type: 'GAME_START',
            gameData: gameData
        });

        this.startRound(gameData);
    }

    startRound(gameData) {
        this.gameState = 'PLAYING';
        this.switchView('game-screen');
        
        this.currentRound = gameData.round;
        this.settings.roundCount = gameData.totalRounds;
        this.settings.turnDuration = gameData.timeLimit;
        
        // Initial random order is already provided by host in gameData.events
        this.currentRoundEvents = [...gameData.events];
        this.correctOrder = gameData.correctOrder;
        
        this.hintsRemaining = 2;
        this.finishedPlayers = 0;
        this.roundResults = {};

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

            el.innerHTML = `
                <div class="event-order">${index + 1}</div>
                <div class="event-title">${ev.olay}</div>
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

        if (this.sortableInstance) {
            this.sortableInstance.destroy();
        }

        this.sortableInstance = new Sortable(container, {
            animation: 150,
            handle: '.event-card',
            filter: '.locked',
            onEnd: () => {
                this.updateOrderNumbers();
            }
        });
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
            if (targetCard.classList.contains('locked')) {
                // Eğer hedef kart kilitliyse, kilitli olmayan bir sonraki/önceki karta geç
                let nextAvailableIndex = newIndex + direction;
                while(nextAvailableIndex >= 0 && nextAvailableIndex < cards.length) {
                    if(!cards[nextAvailableIndex].classList.contains('locked')) {
                        if (direction < 0) {
                            container.insertBefore(card, cards[nextAvailableIndex]);
                        } else {
                            container.insertBefore(card, cards[nextAvailableIndex].nextSibling);
                        }
                        this.updateOrderNumbers();
                        return;
                    }
                    nextAvailableIndex += direction;
                }
                // Gidecek yer yoksa hiçbir şey yapma
                return;
            }

            // Normal yer değiştirme
            if (direction < 0) {
                container.insertBefore(card, targetCard);
            } else {
                container.insertBefore(card, targetCard.nextSibling);
            }
            
            // Sıralamayı güncelle ve animasyon ekle
            card.style.transform = direction < 0 ? 'translateY(10px)' : 'translateY(-10px)';
            setTimeout(() => card.style.transform = '', 150);
            
            this.updateOrderNumbers();
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
        
        if (this.hintsRemaining === 2) {
            // Hint 1: Reveal a random date that is not yet revealed
            const unrevealed = cards.filter(c => !c.querySelector('.event-date').classList.contains('visible'));
            if (unrevealed.length > 0) {
                const randomCard = unrevealed[Math.floor(Math.random() * unrevealed.length)];
                randomCard.querySelector('.event-date').classList.add('visible');
            }
        } else if (this.hintsRemaining === 1) {
            // Hint 2: Place one item correctly and lock it
            const unlockedCards = cards.filter(c => !c.classList.contains('locked'));
            if (unlockedCards.length > 0) {
                const randomCard = unlockedCards[Math.floor(Math.random() * unlockedCards.length)];
                const id = parseInt(randomCard.dataset.id);
                const correctIndex = this.correctOrder.indexOf(id);
                
                // Move DOM element to correct index
                const container = document.getElementById('events-container');
                // Remove it first to avoid index shifting issues
                container.removeChild(randomCard);
                
                if (correctIndex >= container.children.length) {
                    container.appendChild(randomCard);
                } else {
                    container.insertBefore(randomCard, container.children[correctIndex]);
                }
                
                randomCard.classList.add('locked');
                randomCard.querySelector('.event-date').classList.add('visible');
                this.updateOrderNumbers();
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

        this.timer = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.checkAnswers(false);
            }
        }, 1000);
    }

    updateTimerDisplay() {
        const display = document.getElementById('timer-display');
        const m = Math.floor(this.timeLeft / 60).toString().padStart(2, '0');
        const s = (this.timeLeft % 60).toString().padStart(2, '0');
        display.textContent = `${m}:${s}`;
        
        if (this.timeLeft <= 10) {
            display.style.color = 'var(--danger)';
            display.style.transform = 'scale(1.1)';
            setTimeout(() => display.style.transform = 'scale(1)', 200);
        } else {
            display.style.color = 'var(--lilac)';
        }
    }

    checkAnswers(manualSubmit) {
        if (this.gameState !== 'PLAYING') return;
        this.gameState = 'FINISHED';
        clearInterval(this.timer);
        
        document.getElementById('btn-hint').classList.add('disabled');
        document.getElementById('btn-submit').classList.add('disabled');
        
        const cards = document.querySelectorAll('.event-card');
        let correctCount = 0;
        
        cards.forEach((card, index) => {
            const id = parseInt(card.dataset.id);
            const dateEl = card.querySelector('.event-date');
            dateEl.classList.add('visible'); // reveal all dates
            
            if (this.correctOrder[index] === id) {
                correctCount++;
                card.classList.add('locked'); // green
                card.classList.remove('wrong');
            } else {
                card.classList.add('wrong');
            }
            
            // Disable drag
            card.style.pointerEvents = 'none';
        });

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
        
        document.getElementById('game-status-message').textContent = `${correctCount} doğru! Puan: +${roundScore}`;

        this.network.send({
            type: 'SCORE_UPDATE',
            playerId: this.myId,
            score: me.score
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
        this.finishedPlayers++;
        this.roundResults[playerId] = { timeSpent, correctCount };

        const totalPlayers = this.network.isSolo ? 1 : this.players.length;

        if (playerId !== this.myId) {
            this.showToast('Rakibin turu bitirdi!', 'info');
        }

        if (this.finishedPlayers >= totalPlayers) {
            // Everyone finished
            setTimeout(() => {
                if (this.network.isHost) {
                    if (this.currentRound >= this.settings.roundCount) {
                        // Game Over
                        const finalScores = this.players.map(p => ({ id: p.id, name: p.name, score: p.score }));
                        this.network.send({
                            type: 'ROUND_OVER',
                            scores: finalScores
                        });
                        this.endRound(finalScores);
                    } else {
                        // Next round
                        this.startNewRound();
                    }
                }
            }, 4000); // 4 seconds review time
        } else {
            document.getElementById('game-status-message').textContent = 'Rakibin bitirmesi bekleniyor...';
        }
    }

    endRound(scores) {
        this.gameState = 'GAMEOVER';
        this.switchView('winner-screen');
        
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
                title.textContent = `${winner.name} Kazandı!`;
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
                <span style="font-weight:600;">${p.name}</span>
                <strong style="color:var(--primary-purple); font-size:1.5rem;">${p.score}</strong>
            `;
            container.appendChild(el);
        });

        if (!this.network.isHost) {
            document.getElementById('btn-back-to-lobby').style.display = 'none';
        } else {
            document.getElementById('btn-back-to-lobby').style.display = 'flex';
        }
    }

    returnToLobby() {
        // Reset scores
        this.players.forEach(p => p.score = 0);
        this.currentRound = 0;
        
        // Send reset signal? Not strictly needed if we just reload or re-init
        // For simplicity, let's just reload the page for everyone to avoid state issues.
        this.network.send({ type: 'SYNC_SETTINGS', settings: this.settings }); // Just to make sure
        
        // Actually, just reloading is safer.
        window.location.reload();
    }

    updateScoreBoard() {
        const container = document.getElementById('score-board-container');
        if (!container) return;
        
        container.innerHTML = '';
        this.players.forEach((p, i) => {
            const color = i === 0 ? 'var(--primary-purple)' : 'var(--danger)';
            const el = document.createElement('div');
            el.className = 'team';
            el.style.color = color;
            el.innerHTML = `${p.name}: <span>${p.score}</span>`;
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