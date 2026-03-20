class KronoNetwork {
    constructor(game) {
        this.game = game;
        this.isHost = sessionStorage.getItem('isHost') === 'true';
        this.isSolo = sessionStorage.getItem('isSolo') === 'true';
        this.roomCode = sessionStorage.getItem('roomCode');
        this.playerName = sessionStorage.getItem('playerName') || 'Oyuncu';

        if (this.isSolo) {
            this.setupSoloMode();
        } else {
            this.setupMultiplayerMode();
        }
    }

    setupSoloMode() {
        // Mock PeerManager for solo mode
        this.game.players = [{
            id: 'solo-player',
            name: this.playerName,
            score: 0,
            isHost: true,
            status: 'ready'
        }];
        this.game.myId = 'solo-player';
        
        // Hide room code UI
        document.getElementById('room-code-container').style.display = 'none';
        
        // Start lobby update
        this.game.updateLobbyUI();
        
        // Enable start button immediately
        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) {
            startBtn.classList.remove('disabled');
        }
    }

    setupMultiplayerMode() {
        this.peerManager = new PeerNetworkManager({
            isHost: this.isHost,
            onPeerReady: (id) => {
                this.onConnected(id);
                if (this.isHost) {
                    this.onRoomCode(this.roomCode);
                }
            },
            onConnection: (peerId, conn) => {
                if (this.isHost) {
                    // Send room details to the connecting client
                    this.peerManager.sendToPeer(peerId, 'ROOM_DETAILS', {
                        roomCode: this.roomCode
                    });
                }
            },
            onDataReceived: (action, payload, senderId) => {
                if (action === 'PLAYER_JOIN') {
                    this.onPlayerJoined({ id: senderId, name: payload.name, score: payload.score || 0, isHost: payload.isHost || false });
                    if (this.isHost) {
                        // Tell them we also joined
                        this.peerManager.sendToPeer(senderId, 'PLAYER_JOIN', { name: this.playerName, score: 0, isHost: true });
                    }
                } else if (action === 'ROOM_DETAILS') {
                    this.onRoomCode(payload.roomCode);
                } else {
                    this.onData({ type: action, ...payload }, senderId);
                }
            },
            onDisconnection: (peerId) => this.onPlayerLeft(peerId),
            onError: (err) => this.onError(err)
        });

        // Initialize and Connect
        const myId = this.isHost ? `krono-host-${this.roomCode}` : null;
        this.peerManager.init(myId).then(id => {
            if (!this.isHost) {
                this.peerManager.connectToHost(`krono-host-${this.roomCode}`).then(() => {
                    this.peerManager.sendToPeer(`krono-host-${this.roomCode}`, 'PLAYER_JOIN', { name: this.playerName, score: 0, isHost: false });
                }).catch(err => {
                    this.onError("Odaya bağlanılamadı.");
                });
            }
        }).catch(err => {
            this.onError("Bağlantı kurulamadı.");
        });
    }

    onConnected(id) {
        this.game.myId = id;
        if (this.isHost) {
            this.game.players = [{
                id: id,
                name: this.playerName,
                score: 0,
                isHost: true,
                status: 'ready'
            }];
            this.game.updateLobbyUI();
        }
    }

    onRoomCode(code) {
        const display = document.getElementById('display-room-code');
        if (display) {
            display.textContent = code;
            display.dataset.code = code;
        }
        
        // Hide settings if not host
        if (!this.isHost) {
            document.getElementById('host-settings').classList.add('hidden');
            document.getElementById('client-waiting').classList.remove('hidden');
        }
    }

    onPlayerJoined(player) {
        // Enforce max 2 players
        if (this.isHost && Object.keys(this.peerManager.connections).length > 1) {
            // Can't easily reject via peerManager without custom logic, 
            // but we can just ignore or disconnect them. 
            // PeerManager handles basic connection.
        }

        const existing = this.game.players.find(p => p.id === player.id);
        if (!existing) {
            this.game.players.push({
                id: player.id,
                name: player.name,
                score: player.score || 0,
                isHost: player.isHost,
                status: 'ready'
            });
        }
        this.game.updateLobbyUI();
        
        if (this.isHost) {
            // Enable start button if there's an opponent
            if (this.game.players.length > 1) {
                document.getElementById('btn-start-game').classList.remove('disabled');
            }
            
            // Sync settings to new player
            this.send({
                type: 'SYNC_SETTINGS',
                settings: this.game.settings
            });
        }
    }

    onPlayerLeft(id) {
        this.game.players = this.game.players.filter(p => p.id !== id);
        this.game.updateLobbyUI();
        
        if (this.game.gameState !== 'LOBBY') {
            this.game.showToast("Rakip ayrıldı. Oyun bitti.", "warning");
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);
        } else if (this.isHost && this.game.players.length < 2 && !this.isSolo) {
            document.getElementById('btn-start-game').classList.add('disabled');
        }
    }

    onData(data, peerId) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'SYNC_SETTINGS':
                if (!this.isHost) {
                    this.game.settings = data.settings;
                }
                break;
            case 'GAME_START':
                this.game.startRound(data.gameData);
                break;
            case 'SCORE_UPDATE':
                const p = this.game.players.find(p => p.id === data.playerId);
                if (p) {
                    p.score = data.score;
                    this.game.updateScoreBoard();
                }
                break;
            case 'OPPONENT_FINISHED':
                this.game.onOpponentFinished(data.playerId, data.timeSpent, data.correctCount);
                break;
            case 'ROUND_OVER':
                this.game.endRound(data.scores);
                break;
        }
    }

    onError(err) {
        console.error("Network Error:", err);
        this.game.showToast("Bağlantı hatası: " + err, "error");
        if (!this.peerManager.peer || this.peerManager.peer.disconnected) {
            setTimeout(() => window.location.href = 'index.html', 3000);
        }
    }

    send(data) {
        if (this.isSolo) return;
        const { type, ...payload } = data;
        this.peerManager.broadcast(type, payload);
    }
}