/**
 * CizBilNetwork - Network layer
 */
class CizBilNetwork extends BaseGameNetwork {
    constructor(engine, view) {
        super({
            onStateSync: (state) => this.handleStateSync(state),
            onPlayerJoin: (id, player) => this.handlePlayerJoin(id, player),
            onPlayerLeave: (id) => this.handlePlayerLeave(id),
            onAction: (action, payload, senderId) => this.handleAction(action, payload, senderId)
        });
        
        this.engine = engine;
        this.view = view;
        this.wasChoosing = false;
        
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

        window.addEventListener('beforeunload', () => {
            this.leaveRoom();
        });

        if (this.isHostNode) {
            this.engine.onStateChange = (state) => {
                if (state.choices && !this.wasChoosing) {
                     this.wasChoosing = true;
                     this.view.resetCanvasLocal();
                     this.broadcast('CLEAR_CANVAS');
                } else if (!state.choices) {
                     this.wasChoosing = false;
                }

                // Censor view for host if host is not drawer
                const hostState = JSON.parse(JSON.stringify(state));
                const isHostDrawer = (this.myId === state.currentDrawer);
                
                if (!isHostDrawer && hostState.status === 'playing') {
                    if (hostState.currentWord) {
                        hostState.currentWord = hostState.currentWord.split(/\s+/).map(word => '_ '.repeat(word.length).trim()).join('   ');
                    }
                    hostState.choices = null;
                }
                
                this.view.updateUI(hostState, this.isHostNode);
                this.lobbyUI.renderPlayers(hostState.players, this.myId);
                
                this.broadcastCensoredState();
            };

            this.engine.onTimerTick = (secs) => {
                this.view.updateTimer(secs);
                if (secs % 5 === 0 || secs <= 5) {
                    const durationLeft = Math.max(0, this.engine.localTurnEndTime - window.PairaTime.now());
                    this.broadcast('SYNC_TIME', { durationLeft });
                }
            };
            
            this.engine.onSound = (sound) => {
                window.PairaAudio && window.PairaAudio.play(sound);
                this.broadcast('PLAY_SOUND', { sound });
            };
        }
    }

    broadcastCensoredState() {
        const fullState = this.engine.state;
        
        Object.keys(this.connections).forEach(peerId => {
            const isDrawer = (peerId === fullState.currentDrawer);
            const safeState = JSON.parse(JSON.stringify(fullState));
            safeState.wordsLeft = [];
            
            if (!isDrawer && safeState.status === 'playing') {
                if (safeState.currentWord) {
                    safeState.currentWord = safeState.currentWord.split(/\s+/).map(word => '_ '.repeat(word.length).trim()).join('   ');
                }
                safeState.choices = null;
            }
            
            this.sendToPeer(peerId, 'SYNC', safeState);
        });
    }

    handleStateSync(data) {
        // OVERRIDDEN: We use custom SYNC in _handleDataReceived since base_network expects full sync payload in data
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
        if (!this.isHostNode) return;

        if (action === 'GUESS') {
            if (senderId === this.engine.state.currentDrawer) return; // Drawer cannot guess
            
            const guessResult = this.engine.handleGuess(senderId, payload.text);
            if (guessResult === 'spoiler') return; // Ignore if spoiler
            
            const isCorrect = guessResult === true;
            const name = this.engine.state.players[senderId]?.name || 'Oyuncu';
            const chatMsgText = isCorrect ? '***' : payload.text;
            const chatMsg = { name, text: chatMsgText, isCorrect };
            
            this.view.addChatMessage(name, payload.text, isCorrect);
            if (isCorrect && window.PairaAudio) window.PairaAudio.play('correct');
            
            this.broadcast('CHAT_EVENT', chatMsg);
        }
        else if (action === 'CHOOSE_WORD') {
            if (senderId === this.engine.state.currentDrawer) {
                this.engine.officialStartRound(payload.word);
            }
        }
    }

    _handleDataReceived(action, payload, senderId) {
        if (action === 'SYNC' && !this.isHostNode) {
            this.engine.state = payload; // Update client engine state silently
            this.view.updateUI(payload, this.isHostNode);
            this.lobbyUI.renderPlayers(payload.players, this.myId);
            return;
        }

        super._handleDataReceived(action, payload, senderId);
        
        if (action === 'SYNC_TIME' && !this.isHostNode) {
            this.engine.localTurnEndTime = window.PairaTime.now() + payload.durationLeft;
            this.engine.startRenderTimer();
        }
        else if (action === 'PLAY_SOUND' && !this.isHostNode) {
            window.PairaAudio && window.PairaAudio.play(payload.sound);
        }
        else if (action === 'DRAW_EVENT') {
            if (this.isHostNode && senderId === this.engine.state.currentDrawer) {
                Object.values(this.connections).forEach(c => {
                    if (c.peer !== senderId) this.sendToPeer(c.peer, 'DRAW_EVENT', payload);
                });
            }
            if (senderId !== this.myId) {
                this.view.syncCanvasEvent(payload);
            }
        }
        else if (action === 'CLEAR_CANVAS') {
            if (this.isHostNode && senderId === this.engine.state.currentDrawer) {
                Object.values(this.connections).forEach(c => {
                    if (c.peer !== senderId) this.sendToPeer(c.peer, 'CLEAR_CANVAS');
                });
            }
            if (senderId !== this.myId) {
                this.view.clearCanvasLocal();
            }
        }
        else if (action === 'UNDO_CANVAS') {
            if (this.isHostNode && senderId === this.engine.state.currentDrawer) {
                Object.values(this.connections).forEach(c => {
                    if (c.peer !== senderId) this.sendToPeer(c.peer, 'UNDO_CANVAS');
                });
            }
            if (senderId !== this.myId) {
                this.view.undoCanvasLocal();
            }
        }
        else if (action === 'CHAT_EVENT' && !this.isHostNode) {
            this.view.addChatMessage(payload.name, payload.text, payload.isCorrect);
            if (payload.isCorrect && window.PairaAudio) window.PairaAudio.play('correct');
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
    
    if (window.loadGarticWords) {
        await window.loadGarticWords();
    }
    
    const isHost = sessionStorage.getItem('isHost') === 'true';
    const engine = new CizBilGameEngine(isHost);
    
    const view = new CizBilView({
        onStartGame: (settings) => {
            if (!engine.startGame(settings)) {
                if (window.showToast) window.showToast("Oyuna başlamak için en az 2 kişi olmalı!", "warning");
            }
        },
        onSendGuess: (text) => {
            network.sendGameAction('GUESS', { text });
        },
        onChooseWord: (word) => {
            network.sendGameAction('CHOOSE_WORD', { word });
        },
        onDrawEvent: (eventData) => {
            if (engine.state.currentDrawer === network.myId) {
                network.sendGameAction('DRAW_EVENT', eventData);
            }
        },
        onClearCanvas: () => {
            if (engine.state.currentDrawer === network.myId) {
                view.clearCanvasLocal();
                network.sendGameAction('CLEAR_CANVAS');
            }
        },
        onUndoCanvas: () => {
            if (engine.state.currentDrawer === network.myId) {
                view.undoCanvasLocal();
                network.sendGameAction('UNDO_CANVAS');
            }
        },
        onBackToLobby: () => {
            if (isHost) engine.backToLobby();
        }
    });

    const network = new CizBilNetwork(engine, view);
    
    if (!isHost) {
        engine.onTimerTick = (secs) => view.updateTimer(secs);
    }

    const hostSettings = document.getElementById('host-settings');
    const clientWaiting = document.getElementById('client-waiting');
    
    if (isHost) {
        hostSettings?.classList.remove('hidden');
        hostSettings.style.display = 'flex';
        clientWaiting?.classList.add('hidden');
    } else {
        hostSettings?.classList.add('hidden');
        hostSettings.style.display = 'none';
        clientWaiting?.classList.remove('hidden');
    }

    const btnLeave = document.getElementById('btn-leave');
    if (btnLeave) {
        btnLeave.addEventListener('click', () => {
            if (confirm("Oyundan ayrılmak istediğinize emin misiniz?")) {
                network.leaveRoom();
            }
        });
    }
    
    network.autoInit().catch(err => console.error("Network init failed", err));
});
