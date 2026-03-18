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
                if (this.isHost) this.engine.switchTeam(this.myId);
                else this.net.sendToPeer(this.hostId, 'SWITCH_TEAM');
            },
            onSwitchRole: () => {
                if (this.isHost) this.engine.switchRole(this.myId);
                else this.net.sendToPeer(this.hostId, 'SWITCH_ROLE');
            },
            onStartGame: () => {
                if (this.isHost) {
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
            onSendChat: (msg) => {
                this.view.displayChat("Sen", msg, true);
                if (this.isHost) {
                    this.net.broadcast('CHAT', { sender: this.myName, msg }, this.myId);
                } else {
                    this.net.sendToPeer(this.hostId, 'CHAT', { sender: this.myName, msg });
                }
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
                    this.engine.setState({ status: 'lobby' });
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
            const customId = sessionStorage.getItem('myId') || this.generateRoomCode();
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
                this.engine.setState({});
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
            this.engine.switchTeam(senderId);
        }
        else if (action === 'SWITCH_ROLE' && this.isHost) {
            this.engine.switchRole(senderId);
        }
        else if (action === 'SYNC' && !this.isHost) {
            this.engine.setState(payload.state);
            this.hostId = payload.hostId;
            if (payload.durationLeft > 0) {
                this.engine.localTurnEndTime = window.PairaTime.now() + payload.durationLeft;
                this.engine.startRenderTimer();
            }
            this.view.updateUI(this.engine.state, this.isHost);
        }
        else if (action === 'ACTION' && this.isHost) {
            this.engine.processAction(payload.actionType, payload.payload, senderId);
        }
        else if (action === 'CHAT') {
            this.view.displayChat(payload.sender, payload.msg);
            if (this.isHost) {
                this.net.broadcast('CHAT', payload, senderId);
            }
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
            if (p) this.view.showToast(`${p.name} bağlantısı koptu.`, "warning");
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
                durationLeft: durationLeft
            });
        });

        this.view.updateUI(this.engine.state, this.isHost);
    }

    leaveRoom() {
        if (this.isHost) this.net.broadcast('HOST_LEAVE');
        else if (this.hostId) this.net.sendToPeer(this.hostId, 'LEAVE');

        this.net.destroy();
        sessionStorage.removeItem('myId');
        sessionStorage.removeItem('roomCode');
        window.location.href = 'index.html';
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }

    initAudio() {
        this.audioCtx = null;
        try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { }
    }

    playSound(type) {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        const now = this.audioCtx.currentTime;
        if (type === 'correct') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.1);
            gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'taboo') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
            gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'tick') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(800, now);
            gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'timeup') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
            gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
            osc.start(now); osc.stop(now + 0.8);
        } else if (type === 'start') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(440, now); osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
            gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            osc.start(now); osc.stop(now + 0.5);
        }
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