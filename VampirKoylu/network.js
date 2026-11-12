/**
 * Network Manager for Vampir Köylü
 * Inherits from BaseGameNetwork to leverage shared code while preserving local custom API for app.js
 */
class NetworkManager extends BaseGameNetwork {
    constructor(onStateUpdate, onPlayerJoin, onPlayerLeave, onError) {
        // BaseGameNetwork expects config options
        super({
            onAction: (action, payload, senderId) => {
                // Map BaseGameNetwork action handler to the custom ones expected by app.js
                this.onStateUpdate(senderId, { type: action, ...payload });
            },
            onPlayerJoin: (id, payload) => {
                if (this.isHostNode) {
                    if (!this.players[id]) {
                        this.players[id] = {
                            id: id,
                            name: payload.name,
                            isHost: payload.isHost || false,
                            isAlive: true,
                            role: null,
                            score: 0
                        };
                    }
                    this.onPlayerJoinCallback(this.players[id]);
                    this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
                }
            },
            onPlayerLeave: (id) => {
                if (this.isHostNode) {
                    if (this.players[id]) {
                        const player = this.players[id];
                        delete this.players[id];
                        this.onPlayerLeaveCallback(player);
                        this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
                    }
                }
            }
        });

        this.players = {}; // id -> { id, name, isHost, isAlive, role... }
        this.onStateUpdate = onStateUpdate;
        this.onPlayerJoinCallback = onPlayerJoin;
        this.onPlayerLeaveCallback = onPlayerLeave;
        this.onErrorCallback = onError;
    }

    generateClientId() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let code = '';
        const array = new Uint32Array(9);
        window.crypto.getRandomValues(array);
        for (let i = 0; i < 9; i++) {
            code += chars[array[i] % chars.length];
        }
        return code;
    }

    generateId() {
        if (this.isHostNode) {
            const newCode = super.generateId();
            this.roomCode = newCode;
            sessionStorage.setItem('roomCode', newCode);
            if (typeof roomCode !== 'undefined') roomCode = newCode;
            return `vk-host-${newCode}`;
        }
        return `vk-client-${this.generateClientId()}`;
    }

    _handlePeerReady(id) {
        this.myId = id;
        sessionStorage.setItem('myId', id);
    }

    init(isHost, roomCodeParam, username, existingId = null) {
        this.isHostNode = isHost === 'true' || isHost === true;
        this.roomCode = (roomCodeParam || '').replace(/^vk-host-/i, '');
        this.myName = username;
        
        if (existingId && !this.isHostNode) {
            this.myId = existingId;
        } else {
            this.myId = this.isHostNode ? `vk-host-${this.roomCode}` : `vk-client-${this.generateClientId()}`;
        }

        // Call PeerNetworkManager.prototype.init via super.init
        return super.init(this.myId).then(() => {
            if (!this.players[this.myId]) {
                this.players[this.myId] = {
                    id: this.myId,
                    name: this.myName,
                    isHost: this.isHostNode,
                    isAlive: true,
                    role: null,
                    score: 0
                };
            }
            this.onPlayerJoinCallback(this.players[this.myId]);

            if (!this.isHostNode) {
                return this.connectToHost(this.roomCode).then(() => {
                    const hostPeerId = `vk-host-${this.roomCode}`;
                    let joinAttempts = 0;
                    this._joinSynced = false;
                    const sendJoin = () => {
                        if (this._joinSynced || joinAttempts >= 8) {
                            if (this._vkJoinInterval) clearInterval(this._vkJoinInterval);
                            return;
                        }
                        joinAttempts++;
                        this.sendToPeer(hostPeerId, 'JOIN', { name: this.myName });
                    };
                    sendJoin();
                    if (this._vkJoinInterval) clearInterval(this._vkJoinInterval);
                    this._vkJoinInterval = setInterval(sendJoin, 500);
                }).catch(err => {
                    console.error('Connection to host failed', err);
                    this.onErrorCallback('host_disconnected');
                });
            }
        }).catch(err => {
            console.error('Peer initialization failed', err);
            this.onErrorCallback('network_error');
        });
    }

    connectToHost(roomCodeParam) {
        const cleanCode = (roomCodeParam || '').replace(/^vk-host-/i, '');
        const hostId = `vk-host-${cleanCode}`;
        return super.connectToHost(hostId);
    }

    _handleDataReceived(action, payload, senderId) {
        if (action === 'JOIN' && this.isHostNode) {
            if (!this.players[senderId]) {
                this.players[senderId] = {
                    id: senderId,
                    name: payload?.name || 'Oyuncu',
                    isHost: false,
                    isAlive: true,
                    role: null,
                    score: 0
                };
            } else if (payload?.name) {
                this.players[senderId].name = payload.name;
            }
            if (this.onPlayerJoinCallback) {
                this.onPlayerJoinCallback(this.players[senderId]);
            }
            this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
            return;
        }

        if (action === 'LEAVE' && this.isHostNode) {
            if (this.players[senderId]) {
                const player = this.players[senderId];
                delete this.players[senderId];
                if (this.onPlayerLeaveCallback) {
                    this.onPlayerLeaveCallback(player);
                }
                this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
            }
            return;
        }

        if (action === 'SYNC_PLAYERS') {
            this._joinSynced = true;
            if (this._vkJoinInterval) clearInterval(this._vkJoinInterval);
            this.players = payload.players;
            if (this.onPlayerJoinCallback && Object.keys(this.players).length > 0) {
                const lastPlayer = Object.values(this.players).pop();
                this.onPlayerJoinCallback(lastPlayer);
            }
            return;
        }

        if (action === 'HOST_LEAVE') {
            this.onErrorCallback('host_disconnected');
            return;
        }

        // Pass to standard logic
        if (action === 'GAME_STATE') {
            this._joinSynced = true;
            if (this._vkJoinInterval) clearInterval(this._vkJoinInterval);
            this.onStateUpdate(senderId, { type: 'GAME_STATE', state: payload.state });
        } else {
            this.onStateUpdate(senderId, { type: action, ...payload });
        }
    }

    _handleDisconnection(peerId) {
        super._handleDisconnection(peerId);
        if (this.isHostNode) {
            if (this.players[peerId]) {
                const player = this.players[peerId];
                delete this.players[peerId];
                this.onPlayerLeaveCallback(player);
                this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
            }
        } else if (peerId.includes('host') || peerId === `vk-host-${this.roomCode}`) {
            this.onErrorCallback('host_disconnected');
        }
    }

    sendToHost(data) {
        const { type, ...payload } = data;
        if (this.isHostNode) {
            this._handleDataReceived(type, payload, this.myId);
        } else {
            const hostId = `vk-host-${this.roomCode}`;
            this.sendToPeer(hostId, type, payload);
        }
    }

    broadcast(data) {
        if (!this.isHostNode) return;
        const { type, ...payload } = data;
        Object.keys(this.connections).forEach(peerId => {
            this.sendToPeer(peerId, type, payload);
        });
    }

    sendTo(peerId, data) {
        const { type, ...payload } = data;
        if (peerId === this.myId) {
            this._handleDataReceived(type, payload, this.myId);
        } else {
            this.sendToPeer(peerId, type, payload);
        }
    }

    disconnect() {
        this.destroy();
    }

    leaveRoom() {
        if (this.isHostNode) {
            this.broadcast({ type: 'HOST_LEAVE' });
        } else {
            this.sendToHost({ type: 'LEAVE' });
        }
        this.disconnect();
        window.location.href = 'index.html';
    }
}
