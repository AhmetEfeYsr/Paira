/**
 * TabuNetworkManager - Integrates BaseGameNetwork with TabuGameEngine
 */
class TabuNetworkManager extends BaseGameNetwork {
    constructor(engine, view) {
        super({
            onStateSync: (payload) => this.handleStateSync(payload),
            onPlayerJoin: (peerId, payload) => this.handlePlayerJoin(peerId, payload),
            onPlayerLeave: (peerId) => this.handlePlayerLeave(peerId),
            onAction: (actionType, payload, senderId) => this.onActionReceived(actionType, payload, senderId)
        });
        
        this.engine = engine;
        this.view = view;

        // Initialize Shared Lobby UI
        this.lobbyUI = new SharedLobbyUI({
            roomCode: this.roomCode || this.myId,
            isHost: this.isHostNode,
            onKickPlayer: (id) => this.kickPlayer(id),
            onRoomStart: () => this.startGame()
        });

        // Link Engine events to Network Broadcasts (Host only)
        if (this.isHostNode) {
            this.engine.onStateChange = (state) => this.broadcastState();
            this.engine.onSound = (sound) => {
                this.playSound(sound);
                this.broadcast('PLAY_SOUND', { sound });
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
                this.sendGameAction('SWITCH_TEAM');
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
                if (this.isHostNode) {
                    this.broadcast('CHAT', { sender: this.myName, msg }, this.myId);
                } else {
                    this.sendToPeer(this.roomCode, 'CHAT', { sender: this.myName, msg });
                }
            },
            onBackToLobby: () => {
                if (this.isHostNode) {
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

        if (this.isHostNode) {
            document.getElementById('host-settings')?.classList.remove('hidden');
            document.getElementById('client-waiting')?.classList.add('hidden');
        } else {
            document.getElementById('host-settings')?.classList.add('hidden');
            document.getElementById('client-waiting')?.classList.remove('hidden');
        }
        
        // Use BaseGameNetwork autoInit
        this.autoInit().catch(err => console.error("AutoInit failed", err));
    }

    // Overriding internal handler to capture myId when ready
    _handlePeerReady(id) {
        super._handlePeerReady(id);
        this.view.setMyId(id);
        const codeToSet = this.isHostNode ? id : this.roomCode;
        if (this.isHostNode) {
            this.roomCode = id; // Sync roomCode with actual PeerJS ID
        }
        this.lobbyUI.setRoomCode(codeToSet);
        this.view.updateUI(this.engine.state, this.isHostNode);
    }

    handlePlayerJoin(peerId, payload) {
        const state = this.engine.state;
        const oldId = payload.oldId;

        if (state.players[peerId]) {
            state.players[peerId].name = payload.name;
        } else if (oldId && oldId !== peerId && state.players[oldId]) {
            const oldP = state.players[oldId];
            delete state.players[oldId];
            state.players[peerId] = {
                id: peerId,
                name: payload.name || oldP.name,
                isHost: oldP.isHost || false,
                team: oldP.team || 'A'
            };
            if (state.turnId === oldId) {
                state.turnId = peerId;
            }
            if (state.turnOrder) {
                state.turnOrder = state.turnOrder.map(id => id === oldId ? peerId : id);
            }
        } else {
            if (peerId === this.myId && this.isHostNode) {
                this.engine.addPlayer(peerId, payload.name, true, 'A');
            } else {
                const countA = Object.values(state.players).filter(p => p.team === 'A').length;
                const countB = Object.values(state.players).filter(p => p.team === 'B').length;
                this.engine.addPlayer(peerId, payload.name, false, countA <= countB ? 'A' : 'B');
            }
        }
        this.broadcastState();
    }

    handlePlayerLeave(peerId) {
        const p = this.engine.state.players[peerId];
        if (p) {
            window.showToast(`${p.name} ayrıldı.`, "info");
            const isCurrentTurn = (this.engine.state.turnId === peerId && this.engine.state.status === 'playing');
            this.engine.removePlayer(peerId);
            if (isCurrentTurn) {
                this.engine.endTurn();
            }
            this.broadcastState();
        }
    }

    handleStateSync(payload) {
        this.engine.setState(payload.state);
        if (payload.hostId) this.roomCode = payload.hostId;

        if (payload.localTurnEndTime !== undefined) {
            this.engine.localTurnEndTime = payload.localTurnEndTime;
            this.engine.pauseOffset = payload.pauseOffset;
        }
        if (this.engine.state.status === 'playing') {
            this.engine.startRenderTimer();
        }
        this.view.updateUI(this.engine.state, this.isHostNode);

        // Render player list for clients too
        const myId = this.myId;
        this.lobbyUI.renderPlayers(this.engine.state.players, myId, (p, isMe) => {
            const safeName = (window.escapeHtml ? window.escapeHtml(p.name) : String(p.name).replace(/</g, "&lt;").replace(/>/g, "&gt;"));
            return `<span>${p.isHost ? '👑 ' : ''}${safeName} ${isMe ? '(Sen)' : ''}</span> <strong>T-${p.team}</strong>`;
        });
    }

    onActionReceived(actionType, payload, senderId) {

        if (actionType === 'SWITCH_TEAM') {
            this.engine.switchTeam(senderId);
        }
        else if (actionType === 'ACTION') {
            const aType = payload.actionType;
            const isAuthorized = (senderId === this.engine.state.turnId) || (senderId === this.myId);
            if (isAuthorized) {
                if (aType === 'NARRATOR_READY') this.engine.beginTimer();
                else if (aType === 'TOGGLE_PAUSE') this.engine.togglePause();
                else this.engine.processAction(aType);
            }
        }
        else if (actionType === 'CHAT') {
            this.view.displayChat(payload.sender, payload.msg);
            if (this.isHostNode) {
                this.broadcast('CHAT', payload, senderId);
            }
        }
        else if (actionType === 'PLAY_SOUND') {
            this.playSound(payload.sound);
        }
    }

    broadcastState() {
        if (!this.isHostNode) return;
        
        const fullStateCopy = { ...this.engine.state };
        const currentWord = fullStateCopy.activeWords && fullStateCopy.activeWords[fullStateCopy.wordIndex];
        delete fullStateCopy.activeWords; // Optimization

        const turnId = fullStateCopy.turnId;

        Object.keys(this.connections).forEach(peerId => {
            const narratorPlayer = fullStateCopy.players[turnId];
            const peerPlayer = fullStateCopy.players[peerId];
            const isTeammateOfNarrator = (peerPlayer && narratorPlayer && peerPlayer.team === narratorPlayer.team && peerId !== turnId);
            const clientState = JSON.parse(JSON.stringify(fullStateCopy));
            
            if (isTeammateOfNarrator && currentWord && clientState.status === 'playing') {
                clientState.currentWord = {
                    ana_kelime: "???",
                    yasakli_kelimeler: ["???", "???", "???", "???", "???"],
                    kategori: currentWord.kategori || "Genel",
                    zorluk: currentWord.zorluk || 10
                };
            } else {
                clientState.currentWord = currentWord || null;
            }

            this.sendToPeer(peerId, 'SYNC', {
                state: clientState,
                hostId: this.myId,
                localTurnEndTime: this.engine.localTurnEndTime,
                pauseOffset: this.engine.pauseOffset
            });
        });

        // Update local host UI
        const hostPlayer = fullStateCopy.players[this.myId];
        const narratorPlayerHost = fullStateCopy.players[turnId];
        const isHostTeammate = (hostPlayer && narratorPlayerHost && hostPlayer.team === narratorPlayerHost.team && this.myId !== turnId);

        const hostState = JSON.parse(JSON.stringify(fullStateCopy));
        if (isHostTeammate && currentWord && hostState.status === 'playing') {
            hostState.currentWord = {
                ana_kelime: "???",
                yasakli_kelimeler: ["???", "???", "???", "???", "???"],
                kategori: currentWord.kategori || "Genel",
                zorluk: currentWord.zorluk || 10
            };
        } else {
            hostState.currentWord = currentWord || null;
        }

        this.view.updateUI(hostState, this.isHostNode);
        
        const myId = this.myId;
        this.lobbyUI.renderPlayers(this.engine.state.players, myId, (p, isMe) => {
            const safeName = (window.escapeHtml ? window.escapeHtml(p.name) : String(p.name).replace(/</g, "&lt;").replace(/>/g, "&gt;"));
            return `<span>${p.isHost ? '👑 ' : ''}${safeName} ${isMe ? '(Sen)' : ''}</span> <strong>T-${p.team}</strong>`;
        });
    }

    sendAction(actionType) {

        if (this.engine.state.turnId !== this.myId && actionType !== 'TOGGLE_PAUSE' && actionType !== 'NARRATOR_READY') return;
        this.sendGameAction('ACTION', { actionType });
    }

    kickPlayer(id) {
        if (this.isHostNode && id !== this.myId) {
            this.sendToPeer(id, 'KICKED');
            setTimeout(() => {
                this._handleDisconnection(id); // Force drop
                window.showToast("Oyuncu atıldı.", "info");
            }, 500);
        }
    }

    startGame() {
        if (this.isHostNode) {
            const duration = document.getElementById('turn-duration')?.value || 60;
            const passLimit = document.getElementById('pass-limit')?.value || 3;
            const penalty = document.getElementById('taboo-penalty')?.value || 1;
            const rounds = document.getElementById('round-count')?.value || 3;
            
            const categoryCheckboxes = document.querySelectorAll('#category-selection input[type="checkbox"]:checked');
            let category = Array.from(categoryCheckboxes).map(cb => cb.value);
            if(category.length === 0) category = ['Hepsi'];

            const minDifficulty = parseInt(document.getElementById('min-difficulty')?.value) || 1;
            const maxDifficulty = parseInt(document.getElementById('max-difficulty')?.value) || 100;

            this.engine.startGame({ duration, passLimit, category, penalty, rounds, minDifficulty, maxDifficulty });
            this.broadcastState();
        }
    }


    populateCategories(words) {
        const container = document.getElementById('category-selection');
        if (!container || !words) return;
        const cats = new Set(words.map(w => w.kategori).filter(Boolean));
        container.innerHTML = '';
        
        const createPill = (val, checked) => {
            const label = document.createElement('label');
            label.className = 'category-pill';
            label.innerHTML = `<input type="checkbox" value="${val}" ${checked ? 'checked' : ''}> ${val}`;
            return label;
        };
        
        container.appendChild(createPill('Hepsi', true));
        
        cats.forEach(c => {
            container.appendChild(createPill(c, false));
        });

        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                if (e.target.value === 'Hepsi' && e.target.checked) {
                    checkboxes.forEach(other => { if (other !== e.target) other.checked = false; });
                } else if (e.target.checked) {
                    const hepsi = container.querySelector('input[value="Hepsi"]');
                    if(hepsi) hepsi.checked = false;
                }
            });
        });
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

// Bootstrap game on load
document.addEventListener('DOMContentLoaded', () => {
    // Only run game logic if we are on game.html
    if (document.getElementById('game-screen')) {
        const isHost = sessionStorage.getItem('isHost') === 'true';
        const engine = new TabuGameEngine(isHost);
        const view = new TabuView({});

        // Timer tick binding
        engine.onTimerTick = (secs, status) => view.updateTimer(secs, status);

        window.tabuNet = new TabuNetworkManager(engine, view);
    }
});
