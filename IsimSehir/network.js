/**
 * IsimSehir Network Manager
 * Extends the shared PeerNetworkManager for P2P connections.
 */
class NetworkManager extends window.PeerNetworkManager {
    constructor(onStateUpdate, onPlayerJoin, onPlayerLeave, onError) {
        super({
            onPeerReady: (id) => {
                console.log('Peer connected with ID:', id);
                const cleanRoomCode = this.isHost ? id.replace(/^isimsehir-host-/, '') : this.roomCode;
                this.roomCode = cleanRoomCode;
                const displayEl = document.getElementById('display-room-code');
                if (displayEl) {
                    displayEl.dataset.code = cleanRoomCode;
                    if (!displayEl.textContent.includes('•')) {
                        displayEl.textContent = cleanRoomCode;
                    }
                }
                sessionStorage.setItem('roomCode', cleanRoomCode);

                this.players[this.myId] = {
                    id: this.myId,
                    name: this.username,
                    isHost: this.isHost,
                    ready: false,
                    score: 0
                };
                this.onPlayerJoin(this.players[this.myId]);
                
                if (!this.isHost) {
                    this._connectToGameHost();
                }
            },
            onConnection: (peerId, conn) => {
                console.log('Connected to:', peerId);
                if (this.isHost) {
                    this.players[peerId] = {
                        id: peerId,
                        name: conn.metadata ? conn.metadata.username : 'Unknown',
                        isHost: false,
                        score: 0
                    };
                    this.onPlayerJoin(this.players[peerId]);
                    this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
                } else {
                    this.syncTimeWithHost();
                }
            },
            onDisconnection: (peerId) => {
                console.log('Disconnected from:', peerId);
                if (this.isHost) {
                    if (this.players[peerId]) {
                        const player = this.players[peerId];
                        delete this.players[peerId];
                        this.onPlayerLeave(player);
                        this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
                    }
                } else {
                    const expectedHostId = `isimsehir-host-${this.roomCode}`;
                    if (peerId === expectedHostId) {
                        if (this.onErrorCallback) this.onErrorCallback('host_disconnected');
                    }
                }
            },
            onError: (err) => {
                console.error('Peer error:', err);
                if (this.onErrorCallback) this.onErrorCallback(err.type || 'network_error');
            }
        });

        this.onStateUpdate = onStateUpdate;
        this.onPlayerJoin = onPlayerJoin;
        this.onPlayerLeave = onPlayerLeave;
        this.onErrorCallback = onError;
        
        this.roomCode = null;
        this.username = null;
        this.players = {};
        this.syncInterval = null;
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
        if (this.isHost) {
            this.roomCode = window.generateRoomCode ? window.generateRoomCode() : super.generateId();
            return `isimsehir-host-${this.roomCode}`;
        }
        return `isimsehir-client-${this.generateClientId()}`;
    }

    init(isHost, roomCode, username) {
        this.isHost = isHost === 'true' || isHost === true;
        this.roomCode = String(roomCode || '').replace(/^isimsehir-host-/, '');
        this.username = username;
        const requestedId = this.isHost ? `isimsehir-host-${this.roomCode}` : `isimsehir-client-${this.generateClientId()}`;
        
        // PeerNetworkManager init
        super.init(requestedId);
    }

    _connectToGameHost() {
        const hostId = `isimsehir-host-${this.roomCode}`;
        if (!this.peer || this.peer.disconnected) return;

        const conn = this.peer.connect(hostId, {
            reliable: true,
            metadata: { username: this.username }
        });

        const checkOpen = () => {
            this._setupConnection(conn);
        };

        if (conn.open) {
            checkOpen();
        } else {
            conn.on('open', checkOpen);
            conn.on('error', (err) => { if (this.onErrorCallback) this.onErrorCallback(err); });
        }
    }

    // Override _setupConnection from PeerNetworkManager to handle raw object data for backward compatibility with IsimSehir app.js
    _setupConnection(conn) {
        const attachHandlers = () => {
            if (!this.connections[conn.peer]) {
                this.connections[conn.peer] = conn;
                if (this.onConnection) this.onConnection(conn.peer, conn);
            }

            conn.on('data', (data) => {
                if (data && data.type) {
                    this.handleData(conn.peer, data);
                } else if (data && data.action) {
                    if (this.onDataReceived) {
                        this.onDataReceived(data.action, data.payload, data.senderId || conn.peer);
                    }
                }
            });

            conn.on('close', () => {
                this._handleDisconnection(conn.peer);
            });
            conn.on('error', (err) => {
                console.error(`[PeerManager] Connection error with ${conn.peer}:`, err);
                this._handleDisconnection(conn.peer);
            });
        };

        if (conn.open) {
            attachHandlers();
        } else {
            conn.on('open', attachHandlers);
        }
    }

    handleData(senderId, data) {
        if (data.type === 'TIME_PING' && this.isHost) {
            this.sendTo(senderId, {
                type: 'TIME_PONG',
                clientTime: data.clientTime,
                hostTime: window.PairaTime ? window.PairaTime.now() : Date.now()
            });
            return;
        }
        else if (data.type === 'TIME_PONG' && !this.isHost) {
            const now = Date.now();
            const rtt = now - data.clientTime;
            const latency = rtt / 2;
            const hostTimeAtArrival = data.hostTime + latency;
            if (window.PairaTime) {
                window.PairaTime.offset = hostTimeAtArrival - now;
                window.PairaTime.syncServerTime = hostTimeAtArrival;
                window.PairaTime.syncPerformanceTime = performance.now();
                window.PairaTime.isSynced = true;
            }
            return;
        }

        if (data.type === 'SYNC_PLAYERS') {
            this.players = data.players;
            Object.values(this.players).forEach(p => this.onPlayerJoin(p));
        } else if (data.type === 'KICKED' && !this.isHost) {
            if (window.showToast) window.showToast("Odadan atıldınız.", "error");
            setTimeout(() => {
                this.disconnect();
                window.location.href = 'index.html';
            }, 1500);
            return;
        }

        this.onStateUpdate(senderId, data);
    }

    kickPlayer(peerId) {
        if (!this.isHost || !peerId || peerId === this.myId) return;
        this.sendTo(peerId, { type: 'KICKED' });
        setTimeout(() => {
            if (this.connections[peerId]) {
                try { this.connections[peerId].close(); } catch (e) {}
            }
            if (this.players[peerId]) {
                const player = this.players[peerId];
                delete this.players[peerId];
                this.onPlayerLeave(player);
                this.broadcast({ type: 'SYNC_PLAYERS', players: this.players });
            }
        }, 200);
    }

    sendToHost(data) {
        if (this.isHost) {
            this.handleData(this.myId, data);
        } else {
            const hostId = `isimsehir-host-${this.roomCode}`;
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

    syncTimeWithHost() {
        if (this.isHost) return;
        
        const hostId = `isimsehir-host-${this.roomCode}`;
        if (this.connections[hostId] && this.connections[hostId].open) {
            this.connections[hostId].send({
                type: 'TIME_PING',
                clientTime: Date.now()
            });
            
            if (!this.syncInterval) {
                this.syncInterval = setInterval(() => {
                    if (this.connections[hostId] && this.connections[hostId].open) {
                        this.connections[hostId].send({
                            type: 'TIME_PING',
                            clientTime: Date.now()
                        });
                    }
                }, 10000);
            }
        }
    }

    disconnect() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        super.destroy(); // from PeerNetworkManager
    }
}
