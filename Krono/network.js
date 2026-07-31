/**
 * KronoNetwork - Network layer extending BaseGameNetwork
 */
class KronoNetwork extends BaseGameNetwork {
    constructor(game) {
        super({
            onStateSync: (data) => this.handleStateSync(data),
            onPlayerJoin: (id, player) => this.handlePlayerJoin(id, player),
            onPlayerLeave: (id) => this.handlePlayerLeave(id),
            onAction: (action, payload, senderId) => this.handleAction(action, payload, senderId)
        });

        this.game = game;
        this.isSolo = sessionStorage.getItem('isSolo') === 'true';
        this.isHost = this.isHostNode;

        if (this.isSolo) {
            this.setupSoloMode();
        } else {
            this.setupMultiplayerMode();
        }
    }

    setupSoloMode() {
        // Mock Player for solo mode
        this.game.players = [{
            id: 'solo-player',
            name: this.myName,
            score: 0,
            isHost: true,
            status: 'ready'
        }];
        this.game.myId = 'solo-player';
        
        // Hide room code UI
        const roomContainer = document.getElementById('room-code-container');
        if (roomContainer) roomContainer.style.display = 'none';
        
        // Start lobby update
        this.game.updateLobbyUI();
        
        // Enable start button immediately
        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) {
            startBtn.classList.remove('disabled');
        }
    }

    setupMultiplayerMode() {
        const initialCode = this.isHostNode ? (sessionStorage.getItem('myId') || sessionStorage.getItem('roomCode') || '') : (this.roomCode || '');

        this.lobbyUI = new SharedLobbyUI({
            roomCode: initialCode,
            isHost: this.isHostNode,
            onKickPlayer: (id) => this.kickPlayer(id),
            onRoomStart: () => {
                this.startGame();
            }
        });

        this.onPeerReady = (id) => {
            super._handlePeerReady(id);
            this.game.myId = id;
            if (this.isHostNode) {
                const hostPlayer = Object.values(this.game.players).find(p => p.isHost);
                if (hostPlayer) hostPlayer.id = id;
                this.game.updateLobbyUI();
            } else {
                this.game.players = [{
                    id: id,
                    name: this.myName,
                    score: 0,
                    isHost: false,
                    status: 'ready'
                }];
                this.game.updateLobbyUI();
            }

            const codeToSet = this.isHostNode ? id : this.roomCode;
            this.lobbyUI.setRoomCode(codeToSet);
        };

        window.addEventListener('beforeunload', () => {
            this.leaveRoom();
        });

        // Hide settings if not host
        const hostSettings = document.getElementById('host-settings');
        const clientWaiting = document.getElementById('client-waiting');
        if (!this.isHostNode) {
            hostSettings?.classList.add('hidden');
            clientWaiting?.classList.remove('hidden');
        } else {
            hostSettings?.classList.remove('hidden');
            clientWaiting?.classList.add('hidden');
        }

        this.autoInit().catch(err => console.error("Krono network init failed", err));
    }

    startGame() {
        if (this.isHostNode) {
            this.game.settings.turnDuration = parseInt(document.getElementById('turn-duration').value) || 60;
            this.game.settings.roundCount = parseInt(document.getElementById('round-count').value) || 3;
            
            this.sendGameAction('SYNC_SETTINGS', {
                settings: this.game.settings
            });

            this.game.startNewRound();
        }
    }

    handleStateSync(data) {
        // Handled via custom action
    }

    handlePlayerJoin(id, player) {
        if (this.isHostNode) {
            const existing = this.game.players.find(p => p.id === id);
            if (!existing) {
                this.game.players.push({
                    id: id,
                    name: player.name,
                    score: 0,
                    isHost: false,
                    status: 'ready'
                });
            }
            this.game.updateLobbyUI();

            // Enable start button if there's an opponent
            if (this.game.players.length > 1) {
                document.getElementById('btn-start-game')?.classList.remove('disabled');
            }

            // Sync settings and current player list to the new player
            this.broadcast('SYNC_LOBBY', {
                players: this.game.players,
                settings: this.game.settings
            });
        }
    }

    handlePlayerLeave(id) {
        this.game.players = this.game.players.filter(p => p.id !== id);
        this.game.updateLobbyUI();
        
        if (this.game.gameState !== 'LOBBY') {
            this.game.showToast("Rakip ayrıldı. Oyun bitti.", "warning");
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);
        } else if (this.isHostNode && this.game.players.length < 2 && !this.isSolo) {
            document.getElementById('btn-start-game')?.classList.add('disabled');
        }
    }

    handleAction(action, payload, senderId) {
        switch (action) {
            case 'SYNC_LOBBY':
                if (!this.isHostNode) {
                    this.game.players = payload.players;
                    this.game.settings = payload.settings;
                    this.game.updateLobbyUI();
                }
                break;
            case 'SYNC_SETTINGS':
                if (!this.isHostNode) {
                    this.game.settings = payload.settings;
                    const durationEl = document.getElementById('turn-duration');
                    const roundEl = document.getElementById('round-count');
                    if (durationEl) durationEl.value = payload.settings.turnDuration;
                    if (roundEl) roundEl.value = payload.settings.roundCount;
                }
                break;
            case 'GAME_START':
                this.game.startRound(payload.gameData);
                break;
            case 'SCORE_UPDATE':
                const p = this.game.players.find(pl => pl.id === payload.playerId);
                if (p) {
                    p.score = payload.score;
                    this.game.updateScoreBoard();
                }
                break;
            case 'OPPONENT_FINISHED':
                this.game.onOpponentFinished(payload.playerId, payload.timeSpent, payload.correctCount);
                break;
            case 'ROUND_OVER':
                this.game.endRound(payload.scores);
                break;
            case 'RETURN_LOBBY':
                this.game.returnToLobby();
                break;
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

    send(data) {
        if (this.isSolo) return;
        const { type, ...payload } = data;
        this.sendGameAction(type, payload);
    }
}