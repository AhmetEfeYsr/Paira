/**
 * BilgiYarismasiNetwork - Network layer
 */
class BilgiYarismasiNetwork extends BaseGameNetwork {
    constructor(engine, view) {
        super({
            onStateSync: (state) => this.handleStateSync(state),
            onPlayerJoin: (id, player) => this.handlePlayerJoin(id, player),
            onPlayerLeave: (id) => this.handlePlayerLeave(id),
            onAction: (action, payload, senderId) => this.handleAction(action, payload, senderId)
        });
        
        this.engine = engine;
        this.view = view;
        
        this.onPeerReady = (id) => {
            super._handlePeerReady(id);
            this.view.setMyId(id);
            this.lobbyUI.setRoomCode(this.isHostNode ? id : this.roomCode);
        };

        window.addEventListener('beforeunload', () => {
            this.leaveRoom();
        });

        this.lobbyUI = new SharedLobbyUI({
            roomCode: '',
            isHost: this.isHostNode,
            onKickPlayer: (id) => this.kickPlayer(id)
        });

        if (this.isHostNode) {
            this.engine.onStateChange = (state) => {
                this.view.updateUI(state, this.isHostNode);
                this.lobbyUI.renderPlayers(state.players, this.myId);
                
                const stateCopy = { ...state };
                delete stateCopy.activeQuestions;
                
                if (state.status === 'playing' && state.currentQuestion) {
                    stateCopy.currentQuestion = {
                        category: state.currentQuestion.category,
                        question_text: state.currentQuestion.question_text,
                        shuffled_choices: state.currentQuestion.shuffled_choices,
                        reveal_answer: state.currentQuestion.reveal_answer,
                        gorsel_url: state.currentQuestion.gorsel_url,
                        ses_url: state.currentQuestion.ses_url
                    };
                    if (state.currentQuestion.reveal_answer) {
                        stateCopy.currentQuestion.correct_answer_index = state.currentQuestion.correct_answer_index;
                    }
                } else {
                    stateCopy.currentQuestion = null;
                }
                
                this.broadcastState({ state: stateCopy, hostId: this.myId });
            };

            let lastSyncSec = -1;
            this.engine.onTimerTick = (secs) => {
                this.view.updateTimer(secs);
                if (lastSyncSec !== secs) {
                    lastSyncSec = secs;
                    if (secs % 5 === 0 || secs <= 5) {
                        const durationLeft = Math.max(0, this.engine.localTurnEndTime - window.PairaTime.now());
                        this.broadcast('SYNC_TIME', { durationLeft });
                    }
                }
            };
            
            this.engine.onSound = (sound) => {
                window.PairaAudio && window.PairaAudio.play(sound);
                this.broadcast('PLAY_SOUND', { sound });
            };
        }
    }

    handleStateSync(data) {
        if (!data || !data.state) return;
        this.engine.setState(data.state);
        this.view.updateUI(data.state, this.isHostNode);
        this.lobbyUI.renderPlayers(data.state.players, this.myId);
    }

    handlePlayerJoin(id, player) {
        if (this.isHostNode) {
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
            this.engine.localTurnEndTime = window.PairaTime.now() + payload.durationLeft;
            this.engine.startRenderTimer();
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
    
    const isHost = sessionStorage.getItem('isHost') === 'true';
    const engine = new BilgiYarismasiGameEngine(isHost);
    
    const view = new BilgiYarismasiView({
        onStartGame: (settings) => {
            if (!engine.startGame(settings)) {
                if (window.showToast) window.showToast("Oyuna başlamak için en az 2 kişi olmalı!", "warning");
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

    const network = new BilgiYarismasiNetwork(engine, view);
    
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

