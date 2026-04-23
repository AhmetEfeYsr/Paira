/**
 * BilgiYarismasiGameEngine - Core game logic
 */
class BilgiYarismasiGameEngine {
    constructor(isHost = true) {
        this.isHost = isHost;
        this.state = {
            status: 'lobby',
            players: {},
            round: 1,
            totalRounds: 10,
            turnDuration: 20,
            wrongPenalty: true,
            activeQuestions: [],
            currentQuestion: null,
            answersInRound: {}
        };
        this.allQuestions = [];
        this.gameSeed = window.PairaTime.now();
        
        this.fallbackQuestions = [
            { kategori: ["Genel Kültür"], soru_metni: "Türkiye'nin başkenti neresidir?", dogru_cevap: "Ankara", yanlis_secenekler: ["İstanbul", "İzmir", "Bursa"], zorluk: 10 },
            { kategori: ["Bilim"], soru_metni: "Su hangi iki elementten oluşur?", dogru_cevap: "Hidrojen ve Oksijen", yanlis_secenekler: ["Azot ve Oksijen", "Helyum ve Hidrojen", "Kükürt ve Oksijen"], zorluk: 20 }
        ];

        this.onStateChange = null;
        this.onTimerTick = null;
        this.onSound = null;

        this.localTurnEndTime = 0;
        this.turnTimeout = null;
        this.renderFrame = null;
        this.isRoundEnding = false;
        this.lastTickSec = -1;
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
        
        if (this.isHost && this.state.status === 'playing' && this.checkAllPlayersAnswered()) {
             this.endRoundEarly();
        }
    }

    setQuestions(questions) {
        this.allQuestions = (questions && questions.length > 0) ? questions : this.fallbackQuestions;
    }

    seededShuffle(arr, seed) {
        const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    startGame(settings) {
        if (!this.isHost) return;
        if (Object.keys(this.state.players).length < 2) return false;

        this.state.turnDuration = Math.max(5, parseInt(settings.turnDuration) || 20);
        this.state.totalRounds = Math.max(1, parseInt(settings.roundCount) || 10);
        this.state.wrongPenalty = settings.wrongPenalty;

        let minD = parseInt(settings.minD, 10) || 1;
        let maxD = parseInt(settings.maxD, 10) || 100;
        if (minD > maxD) [minD, maxD] = [maxD, minD];
        
        const selCats = settings.categories || [];

        let filtered = this.allQuestions.filter(q => {
            const matchesCategory = selCats.length === 0 || (q.kategori && q.kategori.some(cat => selCats.includes(cat)));
            const matchesDifficulty = q.zorluk >= minD && q.zorluk <= maxD;
            return matchesCategory && matchesDifficulty;
        });

        if (filtered.length === 0) {
            filtered = [...this.allQuestions]; // fallback
        }

        if (filtered.length < this.state.totalRounds) {
             this.state.totalRounds = filtered.length;
        }

        this.gameSeed = (this.gameSeed || 1) * 0x7fff + window.PairaTime.now();
        this.state.activeQuestions = this.seededShuffle([...filtered], this.gameSeed).slice(0, this.state.totalRounds);

        Object.keys(this.state.players).forEach(pId => this.state.players[pId].score = 0);

        this.state.round = 1;
        this.state.status = 'playing';

        this.startTurn();
        return true;
    }

    getShuffledChoices(questionObj, seed) {
        const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        const choices = [
            questionObj.dogru_cevap,
            questionObj.yanlis_secenekler[0],
            questionObj.yanlis_secenekler[1],
            questionObj.yanlis_secenekler[2]
        ];
        let indices = [0, 1, 2, 3];
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        let correctIndex = indices.indexOf(0); 
        let shuffledTexts = indices.map(idx => choices[idx]);
        return { shuffledTexts, correctIndex };
    }

    startTurn() {
        if (!this.isHost) return;
        if (this.turnTimeout) { clearInterval(this.turnTimeout); this.turnTimeout = null; }

        this.state.answersInRound = {}; 

        const currentQData = this.state.activeQuestions[this.state.round - 1];
        if (!currentQData) { this.endGame(); return; }

        const seed = this.gameSeed + this.state.round;
        const { shuffledTexts, correctIndex } = this.getShuffledChoices(currentQData, seed);

        this.state.currentQuestion = {
            category: currentQData.kategori ? currentQData.kategori.join(', ') : "",
            question_text: currentQData.soru_metni,
            shuffled_choices: shuffledTexts,
            correct_answer_index: correctIndex, 
            reveal_answer: false,
            gorsel_url: currentQData.gorsel_url || null,
            ses_url: currentQData.ses_url || null
        };

        this.localTurnEndTime = window.PairaTime.now() + (this.state.turnDuration * 1000);
        this.lastTickSec = -1;
        this.isRoundEnding = false;

        this.setState(this.state);
        this.startRenderTimer();

        this.turnTimeout = setInterval(() => {
            if (window.PairaTime.now() >= this.localTurnEndTime) {
                this.endRoundEarly(); 
            }
        }, 1000);
    }

    handleAnswer(playerId, choiceIndex) {
        if (!this.isHost || this.state.status !== 'playing' || this.isRoundEnding) return;
        if (!this.state.players[playerId]) return;
        if (this.state.answersInRound[playerId]) return; 

        const timeRemaining = Math.max(0, this.localTurnEndTime - window.PairaTime.now());
        const secondsLeft = Math.ceil(timeRemaining / 1000);

        const isCorrect = choiceIndex === this.state.currentQuestion.correct_answer_index;

        let pointsEarned = 0;
        if (isCorrect) {
            pointsEarned = secondsLeft;
            this.state.players[playerId].score += pointsEarned;
        } else {
            if (this.state.wrongPenalty) {
                pointsEarned = -5;
                this.state.players[playerId].score += pointsEarned;
            }
        }

        this.state.answersInRound[playerId] = { choiceIndex, isCorrect, pointsEarned };

        this.setState(this.state);

        if (this.checkAllPlayersAnswered()) {
            this.endRoundEarly();
        }
    }

    checkAllPlayersAnswered() {
        if (!this.isHost) return false;
        const expectedPlayersCount = Object.keys(this.state.players).length;
        const answeredPlayersCount = Object.keys(this.state.answersInRound).length;
        return answeredPlayersCount >= expectedPlayersCount;
    }

    endRoundEarly() {
        if (!this.isHost || this.isRoundEnding) return;
        this.isRoundEnding = true;
        if (this.turnTimeout) { clearInterval(this.turnTimeout); this.turnTimeout = null; }

        if (this.onSound) this.onSound('end');

        if (this.state.currentQuestion) {
            this.state.currentQuestion.reveal_answer = true;
        }
        
        this.setState(this.state); 

        setTimeout(() => {
            this.isRoundEnding = false;
            this.state.round++;
            if (this.state.round > this.state.totalRounds) {
                this.endGame();
            } else {
                this.startTurn();
            }
        }, 3000); 
    }

    endGame() {
        this.state.status = 'finished';
        this.setState(this.state);
    }

    backToLobby() {
        this.state.status = 'lobby';
        Object.keys(this.state.players).forEach(pId => this.state.players[pId].score = 0);
        this.state.round = 1;
        this.setState(this.state);
    }

    startRenderTimer() {
        if (this.renderFrame) cancelAnimationFrame(this.renderFrame);

        const tick = () => {
            if (this.state.status !== 'playing') return;

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
 * BilgiYarismasiView - Handles DOM
 */
class BilgiYarismasiView {
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
                roundCount: document.getElementById('round-count')?.value,
                wrongPenalty: document.getElementById('wrong-penalty')?.checked,
                minD: document.getElementById('min-difficulty')?.value,
                maxD: document.getElementById('max-difficulty')?.value,
                categories: Array.from(document.querySelectorAll('.category-pill input:checked')).map(cb => cb.value)
            };
            this.callbacks.onStartGame(settings);
        });

        document.getElementById('btn-back-to-lobby')?.addEventListener('click', () => {
            this.callbacks.onBackToLobby();
        });
    }

    populateCategories(questions) {
        const container = document.getElementById('category-selection');
        if (!container) return;
        const cats = [...new Set(questions.flatMap(w => w.kategori).filter(Boolean))];
        container.innerHTML = '';
        cats.forEach(cat => {
            const lbl = document.createElement('label');
            lbl.className = 'category-pill';
            lbl.innerHTML = `<input type="checkbox" value="${window.escapeHtml(cat)}" checked> ${window.escapeHtml(cat)}`;
            container.appendChild(lbl);
        });
    }

    updateUI(state, isHost) {
        if (state.status === 'lobby') {
            window.showScreen('lobby-screen');
        } else if (state.status === 'playing') {
            window.showScreen('game-screen');
            this.updateGameUI(state);
        } else if (state.status === 'finished') {
            window.showScreen('winner-screen');
            this.updateWinnerUI(state);
        }
    }

    updateGameUI(state) {
        document.getElementById('round-indicator').innerText = `Soru ${state.round} / ${state.totalRounds}`;

        const scb = document.getElementById('in-game-scoreboard');
        if (scb) {
            scb.innerHTML = '';
            const sortedPlayers = Object.values(state.players).sort((a, b) => b.score - a.score);
            sortedPlayers.forEach(p => {
                const badge = document.createElement('div');
                badge.style.background = 'var(--input-bg)';
                badge.style.padding = '6px 12px';
                badge.style.borderRadius = '8px';
                badge.style.fontSize = '0.9rem';
                badge.style.border = p.id === this.myId ? '1px solid var(--primary-purple)' : '1px solid transparent';
                badge.innerHTML = `<strong>${window.escapeHtml(p.name)}:</strong> ${p.score}`;
                scb.appendChild(badge);
            });
        }

        const qCard = document.getElementById('question-card');
        const qMsg = document.getElementById('game-status-message');
        const qCategory = document.getElementById('question-category');
        const qMain = document.getElementById('main-question');

        if (state.currentQuestion) {
            qCard.classList.remove('hidden');
            qCategory.innerText = state.currentQuestion.category;
            qMain.innerText = state.currentQuestion.question_text;

            const mediaContainer = document.getElementById('media-container');
            if (mediaContainer) {
                mediaContainer.innerHTML = '';
                if (state.currentQuestion.gorsel_url) {
                    const img = document.createElement('img');
                    img.src = state.currentQuestion.gorsel_url;
                    img.style.maxWidth = '100%';
                    img.style.maxHeight = '250px';
                    img.style.borderRadius = '8px';
                    img.style.marginTop = '15px';
                    mediaContainer.appendChild(img);
                }
                if (state.currentQuestion.ses_url) {
                    const audio = document.createElement('audio');
                    audio.src = state.currentQuestion.ses_url;
                    audio.controls = true;
                    audio.style.width = '100%';
                    audio.style.marginTop = '15px';
                    audio.style.outline = 'none';
                    mediaContainer.appendChild(audio);
                }
            }

            const myAnswer = state.answersInRound[this.myId];

            if (state.currentQuestion.reveal_answer) {
                 qMsg.innerText = "Doğru cevaplar gösteriliyor...";
                 qMsg.className = "status-badge";
            } else if (myAnswer) {
                qMsg.innerText = "Cevabın Kaydedildi! Diğer oyuncular bekleniyor...";
                qMsg.className = "status-badge";
            } else {
                qMsg.innerText = "Doğru şıkkı seç, süreyi avantaja çevir!";
                qMsg.className = "status-badge guesser-mode";
            }

            const choicesContainer = document.getElementById('choices-container');
            choicesContainer.innerHTML = '';

            const letters = ['A', 'B', 'C', 'D'];

            state.currentQuestion.shuffled_choices.forEach((choiceText, idx) => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-secondary choice-btn';
                btn.style.padding = '1.2rem';
                btn.style.fontSize = '1.1rem';
                btn.style.height = 'auto';
                btn.style.whiteSpace = 'normal';
                btn.innerHTML = `<strong>${letters[idx]})</strong> ${window.escapeHtml(choiceText)}`;

                if (state.currentQuestion.reveal_answer && state.currentQuestion.correct_answer_index !== undefined) {
                    btn.classList.add('disabled');
                    if (idx === state.currentQuestion.correct_answer_index) {
                        btn.classList.add('btn-correct');
                    } else if (myAnswer && myAnswer.choiceIndex === idx) {
                        btn.classList.add('btn-wrong');
                    }
                } else if (myAnswer) {
                    btn.classList.add('disabled');
                    if (myAnswer.choiceIndex === idx) {
                        btn.classList.add('btn-selected');
                    }
                } else {
                    const handleChoice = (e) => {
                        e.preventDefault(); 
                        if (btn.classList.contains('disabled')) return;
                        
                        document.querySelectorAll('.choice-btn').forEach(b => {
                            b.classList.add('disabled');
                            b.style.pointerEvents = 'none';
                        });
                        btn.classList.add('btn-selected');

                        this.callbacks.onAnswer(idx);

                        btn.removeEventListener('pointerdown', handleChoice);
                        btn.removeEventListener('click', handleChoice);
                    };

                    btn.addEventListener('pointerdown', handleChoice);
                    btn.addEventListener('click', handleChoice);
                }

                choicesContainer.appendChild(btn);
            });

        } else {
            qCard.classList.add('hidden');
            qMsg.innerText = "Soru Yükleniyor...";
            qMsg.className = "status-badge";
        }
    }

    updateWinnerUI(state) {
        const ul = document.getElementById('final-scoreboard-list');
        ul.innerHTML = '';

        const sortedPlayers = Object.values(state.players).sort((a, b) => b.score - a.score);

        sortedPlayers.forEach((p, idx) => {
            const li = document.createElement('li');
            li.style.padding = '12px 20px';
            li.style.borderBottom = '1px solid var(--btn-secondary-border)';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.fontSize = idx === 0 ? '1.4rem' : '1.1rem';
            li.style.color = idx === 0 ? 'var(--neon-purple)' : 'var(--text-main)';
            li.style.fontWeight = idx === 0 ? '800' : '500';

            li.innerHTML = `<span>${idx + 1}. ${window.escapeHtml(p.name)} ${p.id === this.myId ? '(Sen)' : ''}</span> <span>${p.score} Puan</span>`;
            ul.appendChild(li);
        });
    }

    updateTimer(secs) {
        const timerEl = document.getElementById('timer-display');
        if (!timerEl) return;
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        timerEl.innerText = `${m}:${s}`;
        timerEl.style.color = secs <= 5 && secs > 0 ? 'var(--danger)' : 'var(--lilac)';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BilgiYarismasiGameEngine, BilgiYarismasiView };
} else {
    window.BilgiYarismasiGameEngine = BilgiYarismasiGameEngine;
    window.BilgiYarismasiView = BilgiYarismasiView;
}
