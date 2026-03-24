/**
 * PeerJS Network Manager for Vampir Köylü
 * Handles P2P connections without a centralized backend.
 */
class NetworkManager {
    constructor(onStateUpdate, onPlayerJoin, onPlayerLeave, onError) {
        this.peer = null;
        this.connections = {}; // id -> DataConnection
        this.isHost = false;
        this.myId = null;
        this.roomCode = null;
        this.username = null;
        this.players = {}; // id -> { id, name, isHost, isAlive, role... }

        this.onStateUpdate = onStateUpdate;
        this.onPlayerJoin = onPlayerJoin;
        this.onPlayerLeave = onPlayerLeave;
        this.onError = onError;
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

    init(isHost, roomCode, username) {
        this.isHost = isHost === 'true' || isHost === true;
        this.roomCode = roomCode;
        this.username = username;
        this.myId = this.isHost ? `vk-host-${this.roomCode}` : `vk-client-${this.generateClientId()}`;

        this.peer = new Peer(this.myId, {
            debug: 2
        });

        this.peer.on('open', (id) => {
            console.log('Peer connected with ID:', id);

            this.players[this.myId] = {
                id: this.myId,
                name: this.username,
                isHost: this.isHost,
                isAlive: true,
                role: null,
                score: 0
            };
            this.onPlayerJoin(this.players[this.myId]);

            if (!this.isHost) {
                this.connectToHost();
            }
        });

        this.peer.on('connection', (conn) => {
            if (!this.isHost) {
                // Clients shouldn't receive direct connections in a star topology
                conn.close();
                return;
            }
            this.setupConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            this.onError(err.type || 'network_error');
        });
    }

    connectToHost() {
        const hostId = `vk-host-${this.roomCode}`;
        const conn = this.peer.connect(hostId, {
            metadata: { username: this.username }
        });
        
        conn.on('open', () => {
            console.log('Connected to host:', hostId);
            this.connections[hostId] = conn;
        });

        this.setupConnection(conn);
    }

    setupConnection(conn) {
        conn.on('open', () => {
            console.log('Connection open with:', conn.peer);
            this.connections[conn.peer] = conn;

            if (this.isHost) {
                // Add client to players list
                this.players[conn.peer] = {
                    id: conn.peer,
                    name: conn.metadata.username,
                    isHost: false,
                    isAlive: true,
                    role: null,
                    score: 0
                };
                this.onPlayerJoin(this.players[conn.peer]);

                // Broadcast new player list to everyone
                this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
            }
        });

        conn.on('data', (data) => {
            this.handleData(conn.peer, data);
        });

        conn.on('close', () => {
            this.handleDisconnect(conn.peer);
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            this.handleDisconnect(conn.peer);
        });
    }

    handleDisconnect(peerId) {
        console.log('Disconnected from:', peerId);
        if (this.connections[peerId]) {
            delete this.connections[peerId];
        }

        if (this.isHost) {
            if (this.players[peerId]) {
                const player = this.players[peerId];
                delete this.players[peerId];
                this.onPlayerLeave(player);
                this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
            }
        } else {
            // If client loses connection to host
            if (peerId.includes('host')) {
                this.onError('host_disconnected');
            }
        }
    }

    handleData(senderId, data) {
        if (data.type === 'SYNC_PLAYERS') {
            this.players = data.players;
            // Update UI list
            Object.values(this.players).forEach(p => this.onPlayerJoin(p)); 
        }

        // Pass payload to game logic
        this.onStateUpdate(senderId, data);
    }

    sendToHost(data) {
        if (this.isHost) {
            // Local loopback
            this.handleData(this.myId, data);
        } else {
            const hostId = `vk-host-${this.roomCode}`;
            if (this.connections[hostId] && this.connections[hostId].open) {
                this.connections[hostId].send(data);
            }
        }
    }

    broadcast(data) {
        if (!this.isHost) return;
        Object.values(this.connections).forEach(conn => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }

    sendTo(peerId, data) {
        if (this.connections[peerId] && this.connections[peerId].open) {
            this.connections[peerId].send(data);
        } else if (peerId === this.myId) {
            // Local loopback if sending to self
            this.handleData(this.myId, data);
        }
    }

    disconnect() {
        if (this.peer) {
            this.peer.destroy();
        }
    }
}
