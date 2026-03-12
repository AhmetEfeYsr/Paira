/**
 * TabuNetworkManager - Integrates PeerNetworkManager with TabuGameEngine
 */
class TabuNetworkManager {
    constructor(engine, view) {
        this.engine = engine;
        this.view = view;

        this.myName = sessionStorage.getItem('playerName') || 'Oyuncu';
        this.isHost = sessionStorage.getItem('isHost') === 'true';
        this.hostId = sessionStorage.getItem('roomCode');
        this.myId = null;

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

        // Link Engine Errors to UI
        this.engine.onActionError = (err) => {
            if (err === 'NO_PASSES') this.view.triggerPassError();
        };

        // Link View events to Network/Engine
        this.view.callbacks = {
            onSwitchTeam: () => {
                if (this.isHost) {
                    this.engine.switchTeam(this.myId);
                } else {
                    this.net.sendToPeer(this.hostId, 'SWITCH_TEAM');
                }
            },
            onStartGame: () => {
                if (this.isHost) {
                    const duration = document.getElementById('round-time')?.value || 60;
                    const passLimit = document.getElementById('pass-limit')?.value || 3;
                    const category = document.getElementById('category-select')?.value || 'Hepsi';
                    const penalty = document.getElementById('taboo-penalty')?.value || 1;
                    const rounds = document.getElementById('total-rounds')?.value || 3;

                    this.engine.startGame({ duration, passLimit, category, penalty, rounds });
                }
            },
            onNarratorReady: () => {
                this.sendAction('NARRATOR_READY');
            },
            onTogglePause: () => {
                this.sendAction('TOGGLE_PAUSE');
            },
            onAction: (actionType) => {
                this.sendAction(actionType);
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

        // Fetch words and start
        this.initGame();
    }

    async initGame() {
        this.initAudio();

        try {
            const resp = await fetch('tr.json');
            const data = await resp.json();
            this.engine.setWords(data);
            this.populateCategories(data);
        } catch (err) {
            console.warn("Could not load words, using fallbacks");
            this.engine.setWords(null);
            this.populateCategories(this.engine.fallbackWords);
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
                this.engine.addPlayer(id, this.myName, true, 'A');
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

    onConnection(peerId) {
        // Handled via JOIN action to ensure data payload
    }

    onDataReceived(action, payload, senderId) {
        if (action === 'JOIN' && this.isHost) {
            const state = this.engine.state;
            if (state.players[senderId]) {
                state.players[senderId].name = payload.name;
            } else {
                const countA = Object.values(state.players).filter(p => p.team === 'A').length;
                const countB = Object.values(state.players).filter(p => p.team === 'B').length;
                this.engine.addPlayer(senderId, payload.name, false, countA <= countB ? 'A' : 'B');
            }
            this.broadcastState();
        }
        else if (action === 'SWITCH_TEAM' && this.isHost) {
            this.engine.switchTeam(senderId);
        }
        else if (action === 'SYNC' && !this.isHost) {
            this.engine.setState(payload.state);
            this.hostId = payload.hostId;

            if (payload.durationLeft > 0) {
                this.engine.localTurnEndTime = Date.now() + payload.durationLeft;
            }
            this.view.updateUI(this.engine.state, this.isHost);
        }
        else if (action === 'ACTION' && this.isHost) {
            if (this.engine.state.turnId === senderId || payload.actionType === 'TOGGLE_PAUSE' || payload.actionType === 'NARRATOR_READY') {
                if (payload.actionType === 'NARRATOR_READY') this.engine.beginTimer();
                else if (payload.actionType === 'TOGGLE_PAUSE') this.engine.togglePause();
                else this.engine.processAction(payload.actionType);
            }
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
                if (this.engine.state.turnId === senderId && this.engine.state.status === 'playing') {
                    this.engine.endTurn();
                }
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
        const stateCopy = { ...this.engine.state };
        const currentWord = stateCopy.activeWords && stateCopy.activeWords[stateCopy.wordIndex];
        delete stateCopy.activeWords; // Optimization
        stateCopy.currentWord = currentWord || null;

        const durationLeft = stateCopy.isPaused ? this.engine.pauseOffset : Math.max(0, this.engine.localTurnEndTime - Date.now());

        this.net.broadcast('SYNC', {
            state: stateCopy,
            hostId: this.hostId,
            durationLeft: durationLeft
        });
        this.view.updateUI(this.engine.state, this.isHost);
    }

    sendAction(actionType) {
        if (this.engine.state.turnId !== this.myId && actionType !== 'TOGGLE_PAUSE' && actionType !== 'NARRATOR_READY') return;

        if (this.isHost) {
            if (actionType === 'NARRATOR_READY') this.engine.beginTimer();
            else if (actionType === 'TOGGLE_PAUSE') this.engine.togglePause();
            else this.engine.processAction(actionType);
        } else {
            this.net.sendToPeer(this.hostId, 'ACTION', { actionType });
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

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }

    populateCategories(words) {
        const select = document.getElementById('category-select');
        if (!select || !words) return;
        const cats = new Set(words.map(w => w.kategori));
        select.innerHTML = '<option value="Hepsi">Hepsi</option>';
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.innerText = c;
            select.appendChild(opt);
        });
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
        } else if (type === 'pass') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
            gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
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

// Bootstrap game on load
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
                if(window.tabuNet) window.tabuNet.view.showToast("Oda kodu kopyalandı!", "success");
            });
        }
    });

    // Only run game logic if we are on game.html
    if (document.getElementById('game-screen')) {
        const engine = new TabuGameEngine();
        const view = new TabuView({});

        // Timer tick binding
        engine.onTimerTick = (secs, status) => view.updateTimer(secs, status);

        window.tabuNet = new TabuNetworkManager(engine, view);
    }
});
