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

    init(isHost, roomCode, username, existingId = null) {
        this.isHostNode = isHost === 'true' || isHost === true;
        this.roomCode = roomCode;
        this.myName = username;
        
        if (existingId && !this.isHostNode) {
            this.myId = existingId;
        } else {
            this.myId = this.isHostNode ? `vk-host-${this.roomCode}` : `vk-client-${this.generateClientId()}`;
        }

        // We skip standard autoInit and perform custom init sequence
        // NOTE: call the base class init (PeerNetworkManager.init) explicitly via super
        // to avoid recursively calling this overridden init method.
        return super.init(this.myId).then(() => {
            this.players[this.myId] = {

                id: this.myId,
                name: this.myName,
                isHost: this.isHostNode,
                isAlive: true,
                role: null,
                score: 0
            };
            this.onPlayerJoinCallback(this.players[this.myId]);

            if (!this.isHostNode) {
                return this.connectToHost(this.roomCode).then(() => {
                    this.sendToPeer(`vk-host-${this.roomCode}`, 'JOIN', { name: this.myName });
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

    connectToHost(roomCode) {
        const hostId = `vk-host-${roomCode}`;
        const conn = this.peer.connect(hostId, {
            metadata: { username: this.myName }
        });
        
        conn.on('open', () => {
            console.log('Connected to host:', hostId);
            this.connections[hostId] = conn;
        });

        this._setupConnection(conn);
        return Promise.resolve();

    }

    _handleDataReceived(action, payload, senderId) {
        if (action === 'SYNC_PLAYERS') {
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
