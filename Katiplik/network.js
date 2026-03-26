class KatiplikNetwork extends BaseGameNetwork {
    constructor(game) {
        super({
            onAction: (actionType, payload, senderId) => this.onMessageReceived({ type: actionType, ...payload }),
            onPlayerLeave: (peerId) => {
                window.showToast("Rakip ayrıldı", "warning");
                setTimeout(() => window.location.href = 'index.html', 3000);
            }
        });
        this.game = game;

        // Custom lobby UI initialization
        this.lobbyUI = new SharedLobbyUI({
            roomCode: this.roomCode || this.myId,
            isHost: this.isHostNode
        });
    }

    initialize(isHost, roomCode) {
        // Katiplik used a specific host ID structure, so we simulate it here or just use base init
        const myId = isHost ? `katiplik-host-${roomCode}` : null;
        
        // We override roomCode locally for custom join logic
        if (isHost) {
            this.init(myId).then((id) => {
                this.lobbyUI.setRoomCode(roomCode);
                this.myId = id;
            }).catch(err => {
                window.showToast("Bağlantı kurulamadı", "error");
            });
        } else {
            this.init().then(() => {
                this.connectToHost(`katiplik-host-${roomCode}`).then(() => {
                    this.onConnectionEstablished();
                }).catch(err => {
                    window.showToast("Odaya bağlanılamadı", "error");
                });
            }).catch(err => {
                window.showToast("Bağlantı kurulamadı", "error");
            });
        }
    }

    // Capture standard join to establish connection
    onPlayerJoin(peerId, payload) {
        if (this.isHostNode && peerId !== this.myId) {
            this.onConnectionEstablished();
        }
    }

    _handleDataReceived(action, payload, senderId) {
        // Fallback for custom join logic
        if (action === 'JOIN' && this.isHostNode) {
            this.onConnectionEstablished();
        }
        super._handleDataReceived(action, payload, senderId);
    }

    sendMessage(data) {
        const { type, ...payload } = data;
        this.sendGameAction(type, payload);
    }

    onConnectionEstablished() {
        window.showScreen('game-screen');

        if (this.game.isHost) {
            this.game.opponentName = 'Rakip';
            
            setTimeout(() => {
                this.sendMessage({
                    type: 'player_info',
                    name: this.game.playerName
                });
                
                this.game.loadCategories();
            }, 500);
        }
    }

    onMessageReceived(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'player_info':
                this.game.opponentName = data.name;
                document.getElementById('p2-name').textContent = data.name;
                
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
