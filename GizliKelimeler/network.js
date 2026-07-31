/**
 * GizliKelimelerNetwork - Network layer extending BaseGameNetwork
 */
class GizliKelimelerNetwork extends BaseGameNetwork {
    constructor(engine, view) {
        super({
            onStateSync: (data) => this.handleStateSync(data),
            onPlayerJoin: (id, player) => this.handlePlayerJoin(id, player),
            onPlayerLeave: (id) => this.handlePlayerLeave(id),
            onAction: (action, payload, senderId) => this.handleAction(action, payload, senderId)
        });

        this.engine = engine;
        this.view = view;

        this.engine.isHostNode = this.isHostNode;

        const initialCode = this.isHostNode ? (sessionStorage.getItem('myId') || sessionStorage.getItem('roomCode') || '') : (this.roomCode || '');

        this.lobbyUI = new SharedLobbyUI({
            roomCode: initialCode,
            isHost: this.isHostNode,
            onKickPlayer: (id) => this.kickPlayer(id),
            onRoomStart: () => this.startGame()
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

        // Link Engine events to Network Broadcasts (Host only)
        if (this.isHostNode) {
            this.engine.onStateChange = (state) => {
                this.broadcastState(state);
            };
            this.engine.onSound = (sound) => {
                this.playSound(sound);
                this.sendGameAction('PLAY_SOUND', { sound });
            };
        } else {
            this.engine.onSound = (sound) => this.playSound(sound);
        }

        // Link View events to Network/Engine
        this.view.callbacks = {
            onSwitchTeam: () => {
                if (this.engine.state.status !== 'lobby') return;
                this.sendGameAction('SWITCH_TEAM');
            },
            onSwitchRole: () => {
                if (this.engine.state.status !== 'lobby') return;
                this.sendGameAction('SWITCH_ROLE');
            },
            onStartGame: () => {
                this.startGame();
            },
            onSubmitClue: (word, count) => {
                this.sendGameAction('SUBMIT_CLUE', { word, count });
            },
            onMarkWord: (index) => {
                this.sendGameAction('MARK_WORD', { index });
            },
            onGuessWord: (index) => {
                this.sendGameAction('GUESS_WORD', { index });
            },
            onEndTurn: () => {
                this.sendGameAction('END_TURN');
            },
            onKickPlayer: (id) => {
                this.kickPlayer(id);
            },
            onBackToLobby: () => {
                if (this.isHostNode) {
                    if (this.engine.renderFrame) clearTimeout(this.engine.renderFrame);
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
            const resp = await fetch('../Tabu/tr.json');
            const data = await resp.json();
            this.engine.setWords(data);
        } catch (err) {
            console.warn("Could not load words, using fallbacks", err);
            this.engine.setWords(null);
        }

        const hostSettings = document.getElementById('host-settings');
        const clientWaiting = document.getElementById('client-waiting');
        if (this.isHostNode) {
            hostSettings?.classList.remove('hidden');
            clientWaiting?.classList.add('hidden');
        } else {
            hostSettings?.classList.add('hidden');
            clientWaiting?.classList.remove('hidden');
        }

        this.autoInit().catch(err => console.error("Network init failed", err));
    }

    startGame() {
        if (this.isHostNode) {
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
    }

    handleStateSync(payload) {
        if (!payload || !payload.state) return;
        this.engine.setState(payload.state);
        
        if (payload.durationLeft !== undefined) {
            this.engine.localTurnEndTime = window.PairaTime.now() + payload.durationLeft;
            this.engine.startRenderTimer();
        }

        const hostPlayer = this.engine.state.players[this.myId];
        if (hostPlayer && hostPlayer.role === 'GUESSER') {
            const maskedState = JSON.parse(JSON.stringify(this.engine.state));
            maskedState.board.forEach(cell => {
                if (!cell.revealed) cell.team = 'HIDDEN';
            });
            this.view.updateUI(maskedState, this.isHostNode);
        } else {
            this.view.updateUI(this.engine.state, this.isHostNode);
        }

        this.renderLobbyPlayers();
    }

    handlePlayerJoin(id, player) {
        if (this.isHostNode) {
            const state = this.engine.state;
            if (state.players[id]) {
                state.players[id].name = player.name;
            } else {
                const countA = Object.values(state.players).filter(p => p.team === 'A').length;
                const countB = Object.values(state.players).filter(p => p.team === 'B').length;
                this.engine.addPlayer(id, player.name, id === this.myId, countA <= countB ? 'A' : 'B', 'GUESSER');
            }
            this.broadcastState(this.engine.state);
        }
    }

    handlePlayerLeave(id) {
        if (this.isHostNode) {
            const p = this.engine.state.players[id];
            if (p) {
                this.view.showToast(`${p.name} ayrıldı.`, "info");
                this.engine.removePlayer(id);
            }
        }
    }

    handleAction(action, payload, senderId) {
        if (action === 'SWITCH_TEAM' && this.isHostNode) {
            this.engine.switchTeam(senderId);
        }
        else if (action === 'SWITCH_ROLE' && this.isHostNode) {
            this.engine.switchRole(senderId);
        }
        else if (action === 'SUBMIT_CLUE' && this.isHostNode) {
            this.engine.processAction('SUBMIT_CLUE', payload, senderId);
        }
        else if (action === 'MARK_WORD' && this.isHostNode) {
            this.engine.processAction('MARK_WORD', payload, senderId);
        }
        else if (action === 'GUESS_WORD' && this.isHostNode) {
            this.engine.processAction('GUESS_WORD', payload, senderId);
        }
        else if (action === 'END_TURN' && this.isHostNode) {
            this.engine.processAction('END_TURN', payload, senderId);
        }
    }

    _handleDataReceived(action, payload, senderId) {
        super._handleDataReceived(action, payload, senderId);
        if (action === 'PLAY_SOUND') {
            this.playSound(payload.sound);
        }
    }

    broadcastState(state) {
        if (!this.isHostNode) return;

        const durationLeft = Math.max(0, this.engine.localTurnEndTime - window.PairaTime.now());

        Object.keys(this.connections).forEach(peerId => {
            const player = this.engine.state.players[peerId];
            if (!player) return;

            const stateCopy = JSON.parse(JSON.stringify(state));

            if (player.role === 'GUESSER') {
                stateCopy.board.forEach(cell => {
                    if (!cell.revealed) cell.team = 'HIDDEN';
                });
            }

            this.sendToPeer(peerId, 'SYNC', {
                state: stateCopy,
                hostId: this.myId,
                durationLeft: durationLeft
            });
        });

        const hostPlayer = this.engine.state.players[this.myId];
        if (hostPlayer && hostPlayer.role === 'GUESSER') {
            const maskedState = JSON.parse(JSON.stringify(state));
            maskedState.board.forEach(cell => {
                if (!cell.revealed) cell.team = 'HIDDEN';
            });
            this.view.updateUI(maskedState, this.isHostNode);
        } else {
            this.view.updateUI(state, this.isHostNode);
        }

        this.renderLobbyPlayers();
    }

    renderLobbyPlayers() {
        const state = this.engine.state;
        this.lobbyUI.renderPlayers(state.players, this.myId, (p, isMe) => {
            const safeName = p.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const roleStr = p.role === 'SPYMASTER' ? 'Ajan' : 'Tahminci';
            const teamColorVar = p.team === 'A' ? 'var(--team-a-color)' : 'var(--team-b-color)';
            const teamBgVar = p.team === 'A' ? 'var(--team-a-bg)' : 'var(--team-b-bg)';
            const roleColor = p.role === 'SPYMASTER' ? 'var(--warning)' : 'var(--success)';
            const roleBg = p.role === 'SPYMASTER' ? 'var(--warning-bg)' : 'var(--success-bg)';

            return `
                <div style="display:flex; flex-direction:column; gap:4px; flex-grow:1;">
                    <span style="font-weight:500; font-size:1rem; display:flex; align-items:center; gap:4px;">
                        ${p.isHost ? '<span title="Kurucu">👑</span>' : ''}
                        ${safeName} 
                        ${isMe ? '<span style="opacity:0.6; font-size:0.8em;">(Sen)</span>' : ''}
                    </span>
                    <div style="display:flex; gap:6px;">
                        <span style="background:${teamBgVar}; color:${teamColorVar}; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:700; border: 1px solid ${teamColorVar};">Takım ${p.team}</span>
                        <span style="background:${roleBg}; color:${roleColor}; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:700; border: 1px solid ${roleColor};">${roleStr}</span>
                    </div>
                </div>
            `;
        });

        // Enforce the lobby start button constraint
        const players = Object.values(state.players);
        const teamA = players.filter(p => p.team === 'A');
        const teamB = players.filter(p => p.team === 'B');
        const meetsCriteria = teamA.some(p => p.role === 'SPYMASTER') && teamA.some(p => p.role === 'GUESSER') &&
                              teamB.some(p => p.role === 'SPYMASTER') && teamB.some(p => p.role === 'GUESSER');

        const btnStart = document.getElementById('btn-start-game');
        if (btnStart) {
            if (meetsCriteria) btnStart.classList.remove('disabled');
            else btnStart.classList.add('disabled');
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
                this.engine.removePlayer(id);
            }, 500);
        }
    }

    initAudio() {
        if (window.PairaAudio) window.PairaAudio.init();
    }

    playSound(type) {
        if (!window.PairaAudio) return;
        const mapped = type === 'timeup' ? 'end' : (type === 'start' ? 'correct' : type);
        window.PairaAudio.play(mapped);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('game-screen')) {
        const engine = new GizliKelimelerEngine();
        const view = new GizliKelimelerView({});

        engine.onTimerTick = (secs, status) => view.updateTimer(secs, status);

        window.gameNet = new GizliKelimelerNetwork(engine, view);
    }
});