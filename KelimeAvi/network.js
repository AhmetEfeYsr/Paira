/**
 * KelimeAviNetwork - Network layer
 */
class KelimeAviNetwork extends BaseGameNetwork {
    constructor(engine, view) {
        super({
            onStateSync: (state) => this.handleStateSync(state),
            onPlayerJoin: (id, player) => this.handlePlayerJoin(id, player),
            onPlayerLeave: (id) => this.handlePlayerLeave(id),
            onAction: (action, payload, senderId) => this.handleAction(action, payload, senderId),
            onPeerReady: (id) => {
                this.view.setMyId(id);
                this.lobbyUI.setRoomCode(this.isHostNode ? id : this.roomCode);
            }
        });
        
        this.engine = engine;
        this.view = view;

        this.lobbyUI = new SharedLobbyUI({
            roomCode: '',
            isHost: this.isHostNode,
            onKickPlayer: (id) => this.kickPlayer(id)
        });

        if (this.isHostNode) {
            this.engine.onStateChange = (state) => {
                const isHostEbe = (this.myId === state.currentEbe);
                const hostState = JSON.parse(JSON.stringify(state));

                if (!isHostEbe && hostState.status === 'playing' && hostState.targetWord) {
                    hostState.targetWord = hostState.targetWord.substring(0, hostState.revealedLetters);
                }

                this.view.updateUI(hostState, this.isHostNode);
                this.lobbyUI.renderPlayers(hostState.players, this.myId);

                // Enforce min 3 players requirement on start game button
                const btnStart = document.getElementById('btn-start-game');
                if (btnStart) {
                    const count = Object.keys(hostState.players).length;
                    if (count < 3) {
                        btnStart.classList.add('disabled');
                        btnStart.setAttribute('disabled', 'true');
                        btnStart.textContent = 'Oyunu Başlat (Min 3 Kişi)';
                    } else {
                        btnStart.classList.remove('disabled');
                        btnStart.removeAttribute('disabled');
                        btnStart.textContent = 'Oyunu Başlat';
                    }
                }
                
                this.broadcastCensoredState();
            };

            this.engine.onTimerTick = (secs) => {
                this.view.updateTimer(secs);
                if (secs % 5 === 0 || secs <= 5) {
                    const durationLeft = Math.max(0, this.engine.localEndTime - window.PairaTime.now());
                    this.broadcast('SYNC_TIME', { durationLeft });
                }
            };
            
            this.engine.onSound = (sound) => {
                window.PairaAudio && window.PairaAudio.play(sound);
                this.broadcast('PLAY_SOUND', { sound });
            };

            this.engine.onShowResult = (msg) => {
                this.view.showResult(msg);
                this.broadcast('SHOW_RESULT', { msg });
            };
        }

        window.addEventListener('beforeunload', () => {
            this.leaveRoom();
        });
    }

    broadcastCensoredState() {
        const fullState = this.engine.state;
        
        Object.keys(this.connections).forEach(peerId => {
            const isEbe = (peerId === fullState.currentEbe);
            const safeState = JSON.parse(JSON.stringify(fullState));
            
            if (!isEbe && safeState.status === 'playing' && safeState.targetWord) {
                safeState.targetWord = safeState.targetWord.substring(0, safeState.revealedLetters);
            }
            
            this.sendToPeer(peerId, 'SYNC', safeState);
        });
    }

    handleStateSync(data) {}

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
        if (!this.isHostNode) return;

        if (action === 'SUBMIT_MASUM') {
            this.engine.handleMasumSubmission(senderId, payload.word);
        }
        else if (action === 'SUBMIT_EBE') {
            this.engine.handleEbeGuesses(senderId, payload.guesses);
        }
    }

    _handleDataReceived(action, payload, senderId) {
        if (action === 'SYNC' && !this.isHostNode) {
            this.engine.state = payload;
            this.view.updateUI(payload, this.isHostNode);
            this.lobbyUI.renderPlayers(payload.players, this.myId);
            return;
        }

        super._handleDataReceived(action, payload, senderId);
        
        if (action === 'SYNC_TIME' && !this.isHostNode) {
            this.engine.localEndTime = window.PairaTime.now() + payload.durationLeft;
            this.engine.startRenderTimer();
        }
        else if (action === 'PLAY_SOUND' && !this.isHostNode) {
            window.PairaAudio && window.PairaAudio.play(payload.sound);
        }
        else if (action === 'SHOW_RESULT' && !this.isHostNode) {
            this.view.showResult(payload.msg);
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

document.addEventListener('DOMContentLoaded', () => {
    window.PairaAudio && window.PairaAudio.init();
    
    const isHost = sessionStorage.getItem('isHost') === 'true';
    const engine = new KelimeAviGameEngine(isHost);
    
    const view = new KelimeAviView({
        onStartGame: (settings) => {
            if (!engine.startGame(settings)) {
                if (window.showToast) window.showToast("Oynamak için en az 3 oyuncu gerekiyor!", "warning");
            }
        },
        onSubmitMasum: (word) => {
            network.sendGameAction('SUBMIT_MASUM', { word });
        },
        onSubmitEbe: (guesses) => {
            network.sendGameAction('SUBMIT_EBE', { guesses });
        },
        onBackToLobby: () => {
            if (isHost) engine.backToLobby();
        }
    });

    const network = new KelimeAviNetwork(engine, view);
    
    if (!isHost) {
        engine.onTimerTick = (secs) => view.updateTimer(secs);
    }

    const hostSettings = document.getElementById('host-settings');
    const clientWaiting = document.getElementById('client-waiting');
    
    if (isHost) {
        hostSettings?.classList.remove('hidden');
        hostSettings.style.display = 'block';
        clientWaiting?.classList.add('hidden');
    } else {
        hostSettings?.classList.add('hidden');
        hostSettings.style.display = 'none';
        clientWaiting?.classList.remove('hidden');
    }
    
    network.autoInit().catch(err => console.error("Network init failed", err));
});
