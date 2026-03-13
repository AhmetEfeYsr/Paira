/**
 * PeerJS Network Manager
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
        this.players = {}; // id -> { id, name, isHost, ...state }

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
        this.myId = this.isHost ? `hizli-isimsehir-host-${this.roomCode}` : `hizli-isimsehir-client-${this.generateClientId()}`;

        this.peer = new Peer(this.myId, {
            debug: 2
        });

        this.peer.on('open', (id) => {
            console.log('Peer connected with ID:', id);

            this.players[this.myId] = {
                id: this.myId,
                name: this.username,
                isHost: this.isHost,
                ready: false,
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
        const hostId = `hizli-isimsehir-host-${this.roomCode}`;
        const conn = this.peer.connect(hostId, {
            metadata: { username: this.username }
        });
        this.setupConnection(conn);
    }

    setupConnection(conn) {
        const handleOpen = () => {
            console.log('Connected to:', conn.peer);
            this.connections[conn.peer] = conn;

            if (this.isHost) {
                // Add client to players list
                this.players[conn.peer] = {
                    id: conn.peer,
                    name: conn.metadata.username,
                    isHost: false,
                    score: 0
                };
                this.onPlayerJoin(this.players[conn.peer]);

                // Broadcast new player list to everyone
                this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
            } else {
                // I am client, send a hello if needed, or just wait for SYNC_PLAYERS
            }
        };

        if (conn.open) {
            handleOpen();
        } else {
            conn.on('open', handleOpen);
        }

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
        // Automatically route host broadcast to self
        if (data.type === 'SYNC_PLAYERS') {
            this.players = data.players;
            // Update UI list
            Object.values(this.players).forEach(p => this.onPlayerJoin(p)); // re-render
        }

        // Pass payload to game logic
        this.onStateUpdate(senderId, data);
    }

    sendToHost(data) {
        if (this.isHost) {
            // Local loopback
            this.handleData(this.myId, data);
        } else {
            const hostId = `hizli-isimsehir-host-${this.roomCode}`;
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
        }
    }

    disconnect() {
        if (this.peer) {
            this.peer.destroy();
        }
    }
}
