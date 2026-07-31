/**
 * HizliIsimSehirNetwork - Network layer
 */
class HizliIsimSehirNetwork extends BaseGameNetwork {
    constructor(engine, view) {
        super({
            onStateSync: (state) => this.handleStateSync(state),
            onPlayerJoin: (id, player) => this.handlePlayerJoin(id, player),
            onPlayerLeave: (id) => this.handlePlayerLeave(id),
            onAction: (action, payload, senderId) => this.handleAction(action, payload, senderId)
        });
        
        this.engine = engine;
        this.view = view;
        
        const initialCode = this.isHostNode ? (sessionStorage.getItem('myId') || sessionStorage.getItem('roomCode') || '') : (this.roomCode || '');

        this.lobbyUI = new SharedLobbyUI({
            roomCode: initialCode,
            isHost: this.isHostNode,
            onKickPlayer: (id) => this.kickPlayer(id)
        });

        this.onPeerReady = (id) => {
            super._handlePeerReady(id);
            this.view.setMyId(id);
            const codeToSet = this.isHostNode ? id : this.roomCode;
            this.lobbyUI.setRoomCode(codeToSet);
        };

        if (this.isHostNode) {
            // onStateChange is set in DOMContentLoaded to include timer sync

            this.engine.onTurnResult = (result) => {
                this.view.showTurnResult(result.word, result.score, result.playerId, result.canAppeal);
                if(window.PairaAudio) {
                    if(result.score > 0) window.PairaAudio.play('correct');
                    else window.PairaAudio.play('wrong');
                }
                this.broadcast('TURN_RESULT', result);
            };

            this.engine.onScoreUpdate = (scores) => {
                this.view.renderScoreboard(scores, this.isHostNode, this.engine.state.round, this.engine.config.rounds);
                this.broadcast('SHOW_SCORES', { scores, round: this.engine.state.round, totalRounds: this.engine.config.rounds });
            };

            this.engine.onVoteStart = (word, categoryName) => {
                this.view.showVotingUI(word, categoryName);
                this.broadcast('START_VOTE', { word, categoryName });
            };

            this.engine.onVoteResult = (result) => {
                this.view.showVoteResult(result.isAccepted);
                if(window.PairaAudio) {
                    if(result.isAccepted) window.PairaAudio.play('correct');
                    else window.PairaAudio.play('wrong');
                }
                this.broadcast('VOTE_RESULT', result);
            };
        }
    }

    handleStateSync(data) {
        if (!data || !data.state) return;
        this.engine.state = data.state;
        
        if (data.state.status === 'LOBBY') {
            this.view.switchScreen('lobby-screen');
        } else if (data.state.status === 'PLAYING' || data.state.status === 'WAITING_APPEAL') {
            this.view.updateGameUI(data.state);
        }
        // SCORE screen transition is handled by explicit SHOW_SCORES action
    }

    handlePlayerJoin(id, player) {
        if (this.isHostNode) {
            this.engine.addPlayer(id, player.name, player.isHost || false);
            this.lobbyUI.renderPlayers(this.engine.state.players, this.myId);
            this.broadcast('SYNC_PLAYERS', { players: this.engine.state.players });
        }
    }

    handlePlayerLeave(id) {
        if (this.isHostNode) {
            this.engine.removePlayer(id);
            this.lobbyUI.renderPlayers(this.engine.state.players, this.myId);
            this.broadcast('SYNC_PLAYERS', { players: this.engine.state.players });
        }
    }

    handleAction(action, payload, senderId) {
        if (this.isHostNode) {
            if (action === 'CONFIG_UPDATE') {
                // If a client tried to update, ignore. Only Host updates config locally.
            } else if (action === 'SUBMIT_ANSWERS') {
                this.engine.handleTurnSubmit(senderId, payload.answers);
            } else if (action === 'APPEAL') {
                this.engine.handleAppeal(senderId);
            } else if (action === 'VOTE') {
                this.engine.handleVote(senderId, payload.vote);
            }
        }
    }

    _handleDataReceived(action, payload, senderId) {
        super._handleDataReceived(action, payload, senderId);
        
        if (!this.isHostNode) {
            if (action === 'SYNC_PLAYERS') {
                this.engine.state.players = payload.players;
                this.lobbyUI.renderPlayers(payload.players, this.myId);
            } else if (action === 'CONFIG_UPDATE') {
                this.engine.config = payload.config;
                this.view.updateClientConfig(payload.config);
            } else if (action === 'TIMER_SYNC') {
                this.view.startTimer(payload.endTime);
            } else if (action === 'TURN_RESULT') {
                this.view.showTurnResult(payload.word, payload.score, payload.playerId, payload.canAppeal);
                if(window.PairaAudio) {
                    if(payload.score > 0) window.PairaAudio.play('correct');
                    else window.PairaAudio.play('wrong');
                }
            } else if (action === 'SHOW_SCORES') {
                this.view.renderScoreboard(payload.scores, this.isHostNode, payload.round, payload.totalRounds);
            } else if (action === 'START_VOTE') {
                this.view.showVotingUI(payload.word, payload.categoryName);
            } else if (action === 'VOTE_UPDATE') {
                this.view.updateVoteCount(payload.yes, payload.no);
            } else if (action === 'VOTE_RESULT') {
                this.view.showVoteResult(payload.isAccepted);
                if(window.PairaAudio) {
                    if(payload.isAccepted) window.PairaAudio.play('correct');
                    else window.PairaAudio.play('wrong');
                }
            }
        }
        
        // Host also receives VOTE updates
        if (action === 'VOTE_UPDATE') {
            this.view.updateVoteCount(payload.yes, payload.no);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.PairaAudio && window.PairaAudio.init();
    
    const isHost = sessionStorage.getItem('isHost') === 'true';
    const engine = new HizliIsimSehirGameEngine(isHost);
    
    const view = new HizliIsimSehirView({
        onConfigUpdate: (config) => {
            if (isHost) {
                engine.config = config;
                network.broadcast('CONFIG_UPDATE', { config });
            }
        },
        onStartGame: (config) => {
            engine.startGame(config);
        },
        onTimeUp: () => {
            // Client auto-submits empty if time is up and they haven't manually submitted
            const input = document.getElementById('compact-game-input');
            if (input && !input.disabled) {
                const btn = document.getElementById('btn-finish-turn');
                if (btn) btn.click();
            }
        },
        onFinishTurn: (answers) => {
            network.sendGameAction('SUBMIT_ANSWERS', { answers });
        },
        onAppeal: () => {
            network.sendGameAction('APPEAL');
        },
        onVote: (voteStr) => {
            network.sendGameAction('VOTE', { vote: voteStr });
        },
        onNextRound: () => {
            if (isHost) engine.nextRound();
        },
        onExtendGame: (extraRounds) => {
            if (isHost) engine.extendGame(extraRounds);
        },
        onVoteTimeout: () => {
            if (isHost) engine.endVote();
        }
    });

    const network = new HizliIsimSehirNetwork(engine, view);
    
    // Setup Timer Sync Hook
    let forceTurnTimeout = null;
    if (isHost) {
        engine.onStateChange = (state) => {
            view.updateGameUI(state);
            network.broadcastState({ state: state });
            
            if (forceTurnTimeout) {
                clearTimeout(forceTurnTimeout);
                forceTurnTimeout = null;
            }

            // If it's playing and we just changed state, we need to sync timer
            if (state.status === 'PLAYING') {
                const duration = engine.config.endValue * 1000;
                const endTime = window.PairaTime.now() + duration;
                view.startTimer(endTime);
                network.broadcast('TIMER_SYNC', { endTime });

                // Host-side safety timeout: advancement if player doesn't submit
                forceTurnTimeout = setTimeout(() => {
                    const playersArr = Object.values(engine.state.players);
                    const currentPlayer = playersArr[engine.state.currentPlayerIndex];
                    if (currentPlayer && engine.state.status === 'PLAYING') {
                        console.log("Force advancing turn for player:", currentPlayer.name);
                        engine.handleTurnSubmit(currentPlayer.id, {});
                    }
                }, duration + 3000); // 3 seconds grace period
            } else {
                view.stopTimer();
            }
        };
        
        // Broadcast vote updates
        const _handleVote = engine.handleVote.bind(engine);
        engine.handleVote = (playerId, voteStr) => {
            _handleVote(playerId, voteStr);
            view.updateVoteCount(engine.state.votes.yes, engine.state.votes.no);
            network.broadcast('VOTE_UPDATE', { yes: engine.state.votes.yes, no: engine.state.votes.no });
        };
    }

    const hostSettings = document.getElementById('host-settings');
    const clientWaiting = document.getElementById('client-waiting');
    
    if (isHost) {
        hostSettings?.classList.remove('hidden');
        clientWaiting?.classList.add('hidden');
        document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.client-only').forEach(el => el.classList.add('hidden'));
    } else {
        hostSettings?.classList.add('hidden');
        clientWaiting?.classList.remove('hidden');
        document.querySelectorAll('.host-only').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.client-only').forEach(el => el.classList.remove('hidden'));
    }
    
    network.autoInit().catch(err => console.error("Network init failed", err));
});
