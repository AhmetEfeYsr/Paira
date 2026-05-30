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

        this.lobbyUI = new SharedLobbyUI({
            roomCode: this.roomCode || this.myId,
            isHost: this.isHostNode
        });

        window.addEventListener('beforeunload', () => {
            this.leaveRoom();
        });
    }

    initialize(isHost, roomCode) {
        this.isHostNode = isHost;
        this.roomCode = roomCode;
        this.lobbyUI.setRoomCode(roomCode);

        this.autoInit().then(() => {
            this.myId = this.myId; // this.myId is set inside base autoInit
            if (isHost) {
                this.updateLobbyPlayers();
            } else {
                this.onConnectionEstablished();
            }
        }).catch(err => {
            console.error("AutoInit error:", err);
            window.showToast("Bağlantı kurulamadı", "error");
        });
    }

    onPlayerJoin(peerId, payload) {
        if (this.isHostNode && peerId !== this.myId) {
            this.updateLobbyPlayers();
            this.onConnectionEstablished();
        }
    }

    updateLobbyPlayers() {
        const players = {};
        players[this.myId] = { name: this.myName, isHost: true };
        
        Object.keys(this.connections).forEach(peerId => {
            players[peerId] = { name: this.game.opponentName || 'Rakip', isHost: false };
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
