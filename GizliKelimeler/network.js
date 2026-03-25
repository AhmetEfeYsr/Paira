class GizliKelimelerNetworkManager {
    constructor(engine, view) {
        this.engine = engine;
        this.view = view;

        this.myName = sessionStorage.getItem('playerName') || 'Oyuncu';
        this.isHost = sessionStorage.getItem('isHost') === 'true';
        this.hostId = sessionStorage.getItem('roomCode');
        this.myId = null;

        this.engine.isHostNode = this.isHost;

        this.net = new PeerNetworkManager({
            isHost: this.isHost,
            onPeerReady: (id) => this.onPeerReady(id),
            onConnection: (peerId) => this.onConnection(peerId),
            onDataReceived: (action, payload, senderId) => this.onDataReceived(action, payload, senderId),
            onDisconnection: (peerId) => this.onDisconnection(peerId),
            onError: (err) => this.onError(err)
        });

        // Link Engine events to Network Broadcasts (Host only)
        if (this.isHost) {
            this.engine.onStateChange = (state) => this.broadcastState();
            this.engine.onSound = (sound) => {
                this.playSound(sound);
                this.net.broadcast('PLAY_SOUND', { sound });
            };
        } else {
            this.engine.onSound = (sound) => this.playSound(sound);
        }

        // Link View events to Network/Engine
        this.view.callbacks = {
            onSwitchTeam: () => {
                if (this.engine.state.status !== 'lobby') return;
                if (this.isHost) this.engine.switchTeam(this.myId);
                else this.net.sendToPeer(this.hostId, 'SWITCH_TEAM');
            },
            onSwitchRole: () => {
                if (this.engine.state.status !== 'lobby') return;
                if (this.isHost) this.engine.switchRole(this.myId);
                else this.net.sendToPeer(this.hostId, 'SWITCH_ROLE');
            },
            onStartGame: () => {
                if (this.isHost) {
                    const players = Object.values(this.engine.state.players);
                    const teamA = players.filter(p => p.team === 'A');
                    const teamB = players.filter(p => p.team === 'B');
                    if (teamA.length === 0 || teamB.length === 0) {
                        this.view.showToast("Her takımda en az 1 oyuncu olmalı!", "error");
                        return;
                    }
                    if (!teamA.some(p => p.role === 'SPYMASTER') || !teamB.some(p => p.role === 'SPYMASTER')) {
                        this.view.showToast("Her takımda en az 1 Ajan olmalı!", "error");
                        return;
                    }
                    if (!teamA.some(p => p.role === 'GUESSER') || !teamB.some(p => p.role === 'GUESSER')) {
                        this.view.showToast("Her takımda en az 1 Tahminci olmalı!", "error");
                        return;
                    }
                    const boardSize = document.getElementById('board-size')?.value || 25;
                    const turnDuration = document.getElementById('turn-duration')?.value || 90;
                    this.engine.startGame({ boardSize, turnDuration });
                }
            },
            onSubmitClue: (word, count) => {
                if (this.isHost) this.engine.processAction('SUBMIT_CLUE', { word, count }, this.myId);
                else this.net.sendToPeer(this.hostId, 'ACTION', { actionType: 'SUBMIT_CLUE', payload: { word, count } });
            },
            onGuessWord: (index) => {
                if (this.isHost) this.engine.processAction('GUESS_WORD', { index }, this.myId);
                else this.net.sendToPeer(this.hostId, 'ACTION', { actionType: 'GUESS_WORD', payload: { index } });
            },
            onEndTurn: () => {
                if (this.isHost) this.engine.processAction('END_TURN', {}, this.myId);
                else this.net.sendToPeer(this.hostId, 'ACTION', { actionType: 'END_TURN', payload: {} });
            },
            onKickPlayer: (id) => {
                if (this.isHost && id !== this.myId) {
                    this.net.sendToPeer(id, 'KICKED');
                    setTimeout(() => {
                        this.net._handleDisconnection(id); // Force drop
                        this.engine.removePlayer(id);
                        this.view.showToast("Oyuncu atıldı.", "info");
                    }, 500);
                }
            },
            onBackToLobby: () => {
                if (this.isHost) {
                    if (this.engine.renderFrame) cancelAnimationFrame(this.engine.renderFrame);
                    this.engine.setState({
                        status: 'lobby',
                        board: [],
                        scoreA: 0,
                        scoreB: 0,
                        winnerTeam: null,
                        currentClue: null,
                        phase: 'CLUE',
                        turnTeam: 'A'
                    });
                }
            },
            onLeave: () => {
                this.leaveRoom();
            }
        };

        this.initGame();
    }

    async initGame() {
        this.initAudio();

        try {
            // Load word list using same structure as Tabu or from root tr.json
            const resp = await fetch('../Tabu/tr.json');
            const data = await resp.json();
            this.engine.setWords(data);
        } catch (err) {
            console.warn("Could not load words, using fallbacks", err);
            this.engine.setWords(null);
        }

        if (!sessionStorage.getItem('playerName')) {
            window.location.href = 'index.html';
            return;
        }

        if (this.isHost) {
            document.getElementById('host-settings')?.classList.remove('hidden');
            document.getElementById('client-waiting')?.classList.add('hidden');
            const customId = sessionStorage.getItem('myId') || (window.generateRoomCode ? window.generateRoomCode() : "ROOM");
            this.net.init(customId);
        } else {
            document.getElementById('host-settings')?.classList.add('hidden');
            document.getElementById('client-waiting')?.classList.remove('hidden');
            if (!this.hostId) {
                window.location.href = 'index.html';
                return;
            }
            this.net.init();
        }
    }

    onPeerReady(id) {
        this.myId = id;
        this.view.setMyId(id);

        if (this.isHost) {
            this.hostId = id;
            if (!this.engine.state.players[id]) {
                this.engine.addPlayer(id, this.myName, true, 'A', 'SPYMASTER');
            } else {
                this.engine.state.players[id].name = this.myName;
                this.engine.setState(this.engine.state);
            }

            const codeDisplay = document.getElementById('display-room-code');
            if (codeDisplay) {
                codeDisplay.dataset.code = id;
                codeDisplay.innerText = window.isCodeVisible ? id : '••••••••';
            }

            this.view.updateUI(this.engine.state, this.isHost);
        } else {
            this.net.connectToHost(this.hostId).then(() => {
                this.net.sendToPeer(this.hostId, 'JOIN', { name: this.myName });
            }).catch(err => {
                this.view.showToast("Kurucuya bağlanılamadı.", "error");
            });
        }
    }

    onConnection(peerId) {}

    onDataReceived(action, payload, senderId) {
        if (action === 'JOIN' && this.isHost) {
            const state = this.engine.state;
            if (state.players[senderId]) {
                state.players[senderId].name = payload.name;
            } else {
                const countA = Object.values(state.players).filter(p => p.team === 'A').length;
                const countB = Object.values(state.players).filter(p => p.team === 'B').length;
                this.engine.addPlayer(senderId, payload.name, false, countA <= countB ? 'A' : 'B', 'GUESSER');
            }
            this.broadcastState();
        }
        else if (action === 'SWITCH_TEAM' && this.isHost) {
            if (this.engine.state.status !== 'lobby') return;
            this.engine.switchTeam(senderId);
        }
        else if (action === 'SWITCH_ROLE' && this.isHost) {
            if (this.engine.state.status !== 'lobby') return;
            this.engine.switchRole(senderId);
        }
        else if (action === 'SYNC' && !this.isHost) {
            this.engine.setState(payload.state);
            this.hostId = payload.hostId;
            if (payload.localTurnEndTime !== undefined) {
                this.engine.localTurnEndTime = payload.localTurnEndTime;
                this.engine.startRenderTimer();
            } else if (payload.durationLeft !== undefined) {
                this.engine.localTurnEndTime = window.PairaTime.now() + payload.durationLeft;
                this.engine.startRenderTimer();
            }
            this.view.updateUI(this.engine.state, this.isHost);
        }
        else if (action === 'ACTION' && this.isHost) {
            this.engine.processAction(payload.actionType, payload.payload, senderId);
        }
        else if (action === 'PLAY_SOUND') {
            this.playSound(payload.sound);
        }
        else if (action === 'KICKED' && !this.isHost) {
            this.view.showToast("Odadan atıldınız.", "error");
            setTimeout(() => this.leaveRoom(), 2000);
        }
        else if (action === 'HOST_LEAVE' && !this.isHost) {
            this.view.showToast("Kurucu odadan ayrıldı.", "warning");
            setTimeout(() => this.leaveRoom(), 2000);
        }
        else if (action === 'LEAVE' && this.isHost) {
            const p = this.engine.state.players[senderId];
            if (p) {
                this.view.showToast(`${p.name} ayrıldı.`, "info");
                this.engine.removePlayer(senderId);
            }
        }
    }

    onDisconnection(peerId) {
        if (this.isHost) {
            const p = this.engine.state.players[peerId];
            if (p) {
                this.view.showToast(`${p.name} bağlantısı koptu.`, "warning");
                this.engine.removePlayer(peerId);
            }
        } else if (peerId === this.hostId) {
            this.view.showToast("Kurucu ile bağlantı koptu, lobiye dönülüyor...", "error");
            setTimeout(() => this.leaveRoom(), 2000);
        }
    }

    onError(err) {
        if (err.type === 'peer-unavailable') {
            this.view.showToast("Oda bulunamadı veya kapandı.", "error");
            setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        } else {
            console.error("Network Error:", err);
        }
    }

    broadcastState() {
        if (!this.isHost) return;

        const durationLeft = Math.max(0, this.engine.localTurnEndTime - window.PairaTime.now());

        // We must mask the board for Guessers before sending.
        // We broadcast customized syncs per client depending on their role.
        Object.keys(this.net.connections).forEach(peerId => {
            const player = this.engine.state.players[peerId];
            if(!player) return;

            const stateCopy = JSON.parse(JSON.stringify(this.engine.state));

            // If the player is a GUESSER, mask unrevealed teams
            if (player.role === 'GUESSER') {
                stateCopy.board.forEach(cell => {
                    if (!cell.revealed) cell.team = 'HIDDEN';
                });
            }

            this.net.sendToPeer(peerId, 'SYNC', {
                state: stateCopy,
                hostId: this.hostId,
                durationLeft: durationLeft,
                localTurnEndTime: this.engine.localTurnEndTime
            });
        });

        // Host GUESSER ise tahta bilgisini maskele
        const hostPlayer = this.engine.state.players[this.myId];
        if (hostPlayer && hostPlayer.role === 'GUESSER') {
            const maskedState = JSON.parse(JSON.stringify(this.engine.state));
            maskedState.board.forEach(cell => {
                if (!cell.revealed) cell.team = 'HIDDEN';
            });
            this.view.updateUI(maskedState, this.isHost);
        } else {
            this.view.updateUI(this.engine.state, this.isHost);
        }
    }

    leaveRoom() {
        if (this.isHost) this.net.broadcast('HOST_LEAVE');
        else if (this.hostId) this.net.sendToPeer(this.hostId, 'LEAVE');

        this.net.destroy();
        sessionStorage.removeItem('myId');
        sessionStorage.removeItem('roomCode');
        window.location.href = 'index.html';
    }


    initAudio() {
        if(window.PairaAudio) window.PairaAudio.init();
    }

    playSound(type) {
        if(!window.PairaAudio) return;
        const mapped = type === 'timeup' ? 'end' : (type === 'start' ? 'correct' : type);
        window.PairaAudio.play(mapped);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.isCodeVisible = false;
    document.getElementById('toggle-code-visibility')?.addEventListener('click', () => {
        window.isCodeVisible = !window.isCodeVisible;
        const disp = document.getElementById('display-room-code');
        if (disp) disp.innerText = window.isCodeVisible ? (disp.dataset.code || '••••••••') : '••••••••';
    });

    document.getElementById('display-room-code')?.addEventListener('click', () => {
        const disp = document.getElementById('display-room-code');
        const code = disp?.dataset?.code;
        if (code) {
            navigator.clipboard.writeText(code).then(() => {
                if(window.gameNet) window.gameNet.view.showToast("Oda kodu kopyalandı!", "success");
            });
        }
    });

    if (document.getElementById('game-screen')) {
        const engine = new GizliKelimelerEngine();
        const view = new GizliKelimelerView({});

        engine.onTimerTick = (secs, status) => view.updateTimer(secs, status);

        window.gameNet = new GizliKelimelerNetworkManager(engine, view);
    }
});