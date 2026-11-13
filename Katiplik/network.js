class KatiplikNetwork extends BaseGameNetwork {
    constructor(game) {
        super({
            onPlayerJoin: (peerId, payload) => this.handlePlayerJoin(peerId, payload),
            onAction: (actionType, payload, senderId) => {
                if (senderId === this.myId) return;
                this.onMessageReceived({ type: actionType, ...payload });
            },
            onPlayerLeave: (peerId) => {
                window.showToast("Rakip ayrıldı", "warning");
                setTimeout(() => window.location.href = 'index.html', 3000);
            }
        });
        this.game = game;

        this.lobbyUI = new SharedLobbyUI({
            roomCode: this.roomCode || this.myId,
            isHost: this.isHostNode
        });

        this.onPeerReady = (id) => {
            super._handlePeerReady(id);
            const codeToSet = this.isHostNode ? id : this.roomCode;
            this.lobbyUI.setRoomCode(codeToSet);
        };

        window.addEventListener('beforeunload', () => {
            this.leaveRoom();
        });
    }

    _handleDataReceived(action, payload, senderId) {
        if (action === 'JOIN' && this.isHostNode) {
            const activeOpponents = Array.from(this._joinedPeers).filter(id => id !== senderId);
            const isReconnectingOpponent = payload && payload.oldId && this._joinedPeers.has(payload.oldId);
            if (activeOpponents.length >= 1 && !isReconnectingOpponent) {
                this.sendToPeer(senderId, 'ROOM_FULL', { reason: 'Oda dolu! Katiplik Düellosu en fazla 2 kişiliktir.' });
                setTimeout(() => {
                    const conn = this.connections[senderId];
                    delete this.connections[senderId];
                    if (conn) conn.close();
                }, 300);
                return;
            }
            if (isReconnectingOpponent && payload.oldId !== senderId) {
                this._joinedPeers.delete(payload.oldId);
                if (this.connections[payload.oldId]) {
                    delete this.connections[payload.oldId];
                }
            }
        } else if (action === 'ROOM_FULL' && !this.isHostNode) {
            this._isLeaving = true;
            if (this._joinInterval) {
                clearInterval(this._joinInterval);
                this._joinInterval = null;
            }
            const msg = (payload && payload.reason) ? payload.reason : 'Oda dolu olduğu için katılınamadı.';
            if (window.showToast) window.showToast(msg, 'error');
            setTimeout(() => this.leaveRoom(), 2000);
            return;
        }
        super._handleDataReceived(action, payload, senderId);
    }

    initialize(isHost, roomCode) {
        this.isHostNode = isHost;
        this.roomCode = roomCode;
        this.lobbyUI.setRoomCode(roomCode);

        this.autoInit().then(() => {
            if (isHost) {
                this.lobbyUI.setRoomCode(this.myId);
                this.updateLobbyPlayers();
            } else {
                this.onConnectionEstablished();
            }
        }).catch(err => {
            console.error("AutoInit error:", err);
            window.showToast("Bağlantı kurulamadı", "error");
        });
    }

    handlePlayerJoin(peerId, payload) {
        if (this.isHostNode && peerId !== this.myId) {
            if (payload && payload.name) {
                this.game.opponentName = payload.name;
                const p2NameEl = document.getElementById('p2-name');
                if (p2NameEl) p2NameEl.textContent = payload.name;
            }
            this.updateLobbyPlayers();
            this.onConnectionEstablished();
        }
    }

    updateLobbyPlayers() {
        const players = {};
        if (this.myId) {
            players[this.myId] = { name: this.myName, isHost: this.isHostNode };
        }
        
        Object.keys(this.connections).forEach(peerId => {
            players[peerId] = { name: this.game.opponentName || 'Rakip', isHost: !this.isHostNode };
        });
        this.lobbyUI.renderPlayers(players, this.myId);
    }

    sendMessage(data) {
        const { type, ...payload } = data;
        this.sendGameAction(type, payload);
    }

    onConnectionEstablished() {
        window.showScreen('game-screen');
        this.updateLobbyPlayers();

        if (this.game.isHost) {
            if (!this.game.opponentName) {
                this.game.opponentName = 'Rakip';
            }
            
            setTimeout(() => {
                this.sendMessage({
                    type: 'player_info',
                    name: this.game.playerName
                });
                
                this.game.loadCategories();
            }, 300);
        } else {
            this.game.loadCategories();
            setTimeout(() => {
                this.sendMessage({
                    type: 'player_info',
                    name: this.game.playerName
                });
            }, 300);
        }
    }

    onMessageReceived(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'player_info':
                this.game.opponentName = data.name;
                document.getElementById('p2-name').textContent = data.name;
                this.updateLobbyPlayers();
                
                if (!this.game.isHost && this.game.opponentName) {
                    this.sendMessage({
                        type: 'player_info',
                        name: this.game.playerName
                    });
                }
                break;
                
            case 'game_start':
                this.game.startGame(data.text, data.imlaMode, data.kbMode);
                break;
                
            case 'progress_update':
                this.game.updateOpponentProgress(data.progress, data.wpm);
                break;
                
            case 'game_finished':
                this.game.opponentFinished(data.time, data.wpm, data.accuracy);
                break;
                
            case 'play_again':
                this.game.resetGame();
                break;
        }
    }
}
