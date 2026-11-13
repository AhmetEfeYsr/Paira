/**
 * BilgiYarismasiNetwork - Network layer
 */
class BilgiYarismasiNetwork extends BaseGameNetwork {
    constructor(engine, view, isSolo = false) {
        super({
            onStateSync: (state) => this.handleStateSync(state),
            onPlayerJoin: (id, player) => this.handlePlayerJoin(id, player),
            onPlayerLeave: (id) => this.handlePlayerLeave(id),
            onAction: (action, payload, senderId) => this.handleAction(action, payload, senderId)
        });
        
        this.engine = engine;
        this.view = view;
        this.isSolo = Boolean(isSolo);
        if (this.isSolo) {
            this.isHostNode = true;
        }
        
        const initialCode = this.isHostNode ? (sessionStorage.getItem('myId') || sessionStorage.getItem('roomCode') || '') : (this.roomCode || '');

        this.lobbyUI = new SharedLobbyUI({
            roomCode: initialCode,
            isHost: this.isHostNode,
            onKickPlayer: (id) => this.kickPlayer(id)
        });

        let inPeerReady = false;
        this.onPeerReady = (id) => {
            if (inPeerReady) return;
            inPeerReady = true;
            try {
                super._handlePeerReady(id);
                this.view.setMyId(id);
                const codeToSet = this.isHostNode ? id : this.roomCode;
                this.lobbyUI.setRoomCode(codeToSet);
                if (this.isHostNode && this.engine && this.engine.state) {
                    this.lobbyUI.renderPlayers(this.engine.state.players, this.myId);
                    if (this.isSolo) {
                        document.getElementById('btn-start-game')?.classList.remove('disabled');
                    }
                }
            } finally {
                inPeerReady = false;
            }
        };

        if (this.isHostNode) {
            this.engine.onStateChange = (state) => {
                this.view.updateUI(state, this.isHostNode);
                this.lobbyUI.renderPlayers(state.players, this.myId);
                if (this.isSolo) {
                    document.getElementById('btn-start-game')?.classList.remove('disabled');
                    return;
                }
                
                const stateCopy = { ...state };
                delete stateCopy.activeQuestions;
                
                const isRevealed = Boolean(state.status === 'playing' && state.currentQuestion && state.currentQuestion.reveal_answer);

                if (state.status === 'playing' && state.currentQuestion) {
                    stateCopy.currentQuestion = {
                        category: state.currentQuestion.category,
                        question_text: state.currentQuestion.question_text,
                        shuffled_choices: state.currentQuestion.shuffled_choices,
                        reveal_answer: state.currentQuestion.reveal_answer,
                        gorsel_url: state.currentQuestion.gorsel_url,
                        ses_url: state.currentQuestion.ses_url
                    };
                    if (isRevealed) {
                        stateCopy.currentQuestion.correct_answer_index = state.currentQuestion.correct_answer_index;
                        if (state.currentQuestion.fun_fact) {
                            stateCopy.currentQuestion.fun_fact = state.currentQuestion.fun_fact;
                        }
                    }
                } else {
                    stateCopy.currentQuestion = null;
                }

                if (!isRevealed) {
                    const maskedAnswers = {};
                    Object.keys(state.answersInRound || {}).forEach(pid => {
                        maskedAnswers[pid] = { answered: true };
                    });
                    stateCopy.answersInRound = maskedAnswers;
                }
                
                this.broadcastState({ state: stateCopy, hostId: this.myId });
            };

            let lastSyncSec = -1;
            this.engine.onTimerTick = (secs) => {
                this.view.updateTimer(secs);
                if (!this.isSolo && lastSyncSec !== secs) {
                    lastSyncSec = secs;
                    if (secs === this.engine.state.turnDuration || secs % 5 === 0 || secs <= 5) {
                        const durationLeft = Math.max(0, this.engine.localTurnEndTime - window.PairaTime.now());
                        this.broadcast('SYNC_TIME', { durationLeft });
                    }
                }
            };
            
            this.engine.onSound = (sound) => {
                window.PairaAudio && window.PairaAudio.play(sound);
                if (!this.isSolo) {
                    this.broadcast('PLAY_SOUND', { sound });
                }
            };
        }

        window.addEventListener('beforeunload', () => {
            if (!this.isSolo) this.leaveRoom();
        });
    }

    autoInit() {
        if (this.isSolo) {
            this.myId = 'solo-player';
            this.isHostNode = true;
            this.view.setMyId('solo-player');

            const codeContainer = document.querySelector('.lobby-header .code-container');
            if (codeContainer) codeContainer.style.display = 'none';
            const copyBtn = document.getElementById('btn-copy-room');
            if (copyBtn) copyBtn.style.display = 'none';

            this.engine.addPlayer('solo-player', this.myName, true);
            document.getElementById('btn-start-game')?.classList.remove('disabled');
            return Promise.resolve('solo-player');
        }
        return super.autoInit();
    }

    sendGameAction(actionType, payload = {}) {
        if (this.isSolo) {
            if (this.onAction) this.onAction(actionType, payload, this.myId);
            return;
        }
        super.sendGameAction(actionType, payload);
    }

    leaveRoom() {
        if (this.isSolo) {
            this._isLeaving = true;
            sessionStorage.removeItem('myId');
            sessionStorage.removeItem('roomCode');
            window.location.href = 'index.html';
            return;
        }
        super.leaveRoom();
    }

    handleStateSync(data) {
        if (!data || !data.state) return;
        this.engine.setState(data.state);
        this.view.updateUI(data.state, this.isHostNode);
        this.lobbyUI.renderPlayers(data.state.players, this.myId);
    }

    handlePlayerJoin(id, player) {
        if (this.isHostNode) {
            if (player.oldId && player.oldId !== id && this.engine.state.players[player.oldId]) {
                delete this.engine.state.players[player.oldId];
            }
            this.engine.addPlayer(id, player.name, player.isHost || false);
        }
    }

    handlePlayerLeave(id) {
        if (this.isHostNode) {
            this.engine.removePlayer(id);
        }
    }

    handleAction(action, payload, senderId) {
        if (action === 'ANSWER' && this.isHostNode) {
            this.engine.handleAnswer(senderId, payload.choiceIndex, payload.timeRemaining);
        }
    }

    _handleDataReceived(action, payload, senderId) {
        super._handleDataReceived(action, payload, senderId);
        
        if (action === 'SYNC_TIME' && !this.isHostNode) {
            if (this.engine.state.status === 'playing' && !this.engine.state.currentQuestion?.reveal_answer) {
                this.engine.localTurnEndTime = window.PairaTime.now() + payload.durationLeft;
                this.engine.startRenderTimer();
            }
        }
        else if (action === 'PLAY_SOUND' && !this.isHostNode) {
            window.PairaAudio && window.PairaAudio.play(payload.sound);
        }
    }

    kickPlayer(id) {
        if (this.isHostNode) {
            this.sendToPeer(id, 'KICKED');
            setTimeout(() => {
                if (this.connections[id]) {
                    this.connections[id].close();
                    this._handleDisconnection(id);
                }
            }, 500);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    window.PairaAudio && window.PairaAudio.init();
    
    const urlParams = new URLSearchParams(window.location.search);
    const isSolo = sessionStorage.getItem('isSolo') === 'true' || urlParams.get('mode') === 'solo';
    const isHost = isSolo ? true : sessionStorage.getItem('isHost') === 'true';
    const engine = new BilgiYarismasiGameEngine(isHost, isSolo);
    
    const view = new BilgiYarismasiView({
        onStartGame: (settings) => {
            if (!engine.startGame(settings)) {
                if (engine.lastStartError === 'NO_QUESTIONS') {
                    if (window.showToast) window.showToast("Seçili kategori ve zorluk aralığında soru bulunamadı!", "warning");
                } else {
                    if (window.showToast) window.showToast("Oyuna başlamak için en az 2 kişi olmalı!", "warning");
                }
            }
        },
        onAnswer: (choiceIndex) => {
            const timeRemaining = Math.max(0, engine.localTurnEndTime - window.PairaTime.now());
            network.sendGameAction('ANSWER', { choiceIndex, timeRemaining });
            window.PairaAudio && window.PairaAudio.play('pass');
        },
        onBackToLobby: () => {
            if (isHost) engine.backToLobby();
        }
    });

    const network = new BilgiYarismasiNetwork(engine, view, isSolo);
    window.gameEngine = engine;
    window.gameNetwork = network;
    
    if (!isHost) {
        engine.onTimerTick = (secs) => view.updateTimer(secs);
        engine.onSound = (sound) => {
            if (sound === 'tick') {
                window.PairaAudio && window.PairaAudio.play(sound);
            }
        };
    }

    const hostSettings = document.getElementById('host-settings');
    const clientWaiting = document.getElementById('client-waiting');
    
    if (isHost) {
        hostSettings?.classList.remove('hidden');
        clientWaiting?.classList.add('hidden');
    } else {
        hostSettings?.classList.add('hidden');
        clientWaiting?.classList.remove('hidden');
    }

    try {
        const res = await fetch('tr.json');
        const data = await res.json();
        engine.setQuestions(Array.isArray(data) ? data : null);
    } catch {
        engine.setQuestions(null);
    }
    
    view.populateCategories(engine.allQuestions);
    
    network.autoInit().catch(err => console.error("Network init failed", err));
});

