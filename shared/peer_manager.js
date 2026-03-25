/**
 * @typedef {Object} PeerMessage
 * @property {string} action - The action type to perform.
 * @property {any} [payload] - Optional data payload for the action.
 * @property {string} [senderId] - The ID of the peer who sent the message.
 */

/**
 * PeerNetworkManager - A standardized PeerJS wrapper for Paira Games.
 * Handles initialization, reconnections, broadcasting, and targeted messages.
 */
class PeerNetworkManager {
    /**
     * @param {Object} options
     * @param {boolean} [options.isHost=false]
     * @param {function(string): void} [options.onPeerReady] - Callback when local peer is open.
     * @param {function(string, any): void} [options.onDataReceived] - Callback for incoming data (action, payload, senderId).
     * @param {function(string, any): void} [options.onConnection] - Callback when a peer connects (peerId, conn).
     * @param {function(string): void} [options.onDisconnection] - Callback when a peer disconnects (peerId).
     * @param {function(Error): void} [options.onError] - General error callback.
     */
    constructor(options = {}) {
        this.isHost = options.isHost || false;
        this.onPeerReady = options.onPeerReady || null;
        this.onDataReceived = options.onDataReceived || null;
        this.onConnection = options.onConnection || null;
        this.onDisconnection = options.onDisconnection || null;
        this.onError = options.onError || null;

        /** @type {any} The local PeerJS instance */
        this.peer = null;
        /** @type {string|null} The local Peer ID */
        this.myId = null;

        /** @type {Object.<string, any>} Active connections mapped by peer ID */
        this.connections = {};

        // Auto-initialize if required options are provided, otherwise can be manual
    }

    /**
     * Initializes the local Peer connection. Uses sessionStorage to attempt reconnection if an ID exists.
     * @param {string} [forceId] - Optional exact ID to use for the peer.
     * @returns {Promise<string>} Resolves with the local Peer ID when ready.
     */
    init(forceId = null) {
        return new Promise((resolve, reject) => {
            const savedId = sessionStorage.getItem('myId');
            this.myId = forceId || savedId || this.generateId();
            sessionStorage.setItem('myId', this.myId);

            // Assuming PeerJS is globally available via script tag
            if (typeof Peer === 'undefined') {
                const err = new Error('PeerJS is not loaded.');
                if (this.onError) this.onError(err);
                return reject(err);
            }

            this.peer = new Peer(this.myId);

            this.peer.on('open', (id) => {
                this.myId = id;
                if (this.onPeerReady) this.onPeerReady(id);
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                this._setupConnection(conn);
            });

            this.peer.on('disconnected', () => {
                console.warn('[PeerManager] Peer disconnected. Attempting to reconnect...');
                this.peer.reconnect();
            });

            this.peer.on('error', (err) => {
                console.error('[PeerManager] Peer error:', err);
                if (err.type === 'unavailable-id') {
                    // Try generating a new ID if the requested one is taken
                    this.myId = this.generateId();
                    sessionStorage.setItem('myId', this.myId);
                    this.init(this.myId).then(resolve).catch(reject);
                } else if (this.onError) {
                    this.onError(err);
                    reject(err);
                }
            });
        });
    }

    /**
     * Internal method to set up event listeners on a PeerJS DataConnection.
     * Handles race conditions by checking conn.open immediately.
     * @param {any} conn - The PeerJS DataConnection.
     */
    _setupConnection(conn) {
        const attachHandlers = () => {
            if (!this.connections[conn.peer]) {
                this.connections[conn.peer] = conn;
                if (this.onConnection) this.onConnection(conn.peer, conn);
            }

            conn.on('data', (data) => {
                // Ensure structured message handling
                if (data && data.action) {
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

    /**
     * Internal handler for cleanup when a peer disconnects.
     * @param {string} peerId
     */
    _handleDisconnection(peerId) {
        if (this.connections[peerId]) {
            delete this.connections[peerId];
            if (this.onDisconnection) this.onDisconnection(peerId);
        }
    }

    /**
     * Connects to a remote peer (e.g., a client connecting to a host).
     * @param {string} hostId - The ID of the peer to connect to.
     * @returns {Promise<any>} Resolves with the connection when open.
     */
    connectToHost(hostId) {
        return new Promise((resolve, reject) => {
            if (!this.peer || this.peer.disconnected) {
                return reject(new Error('Local peer is not initialized or is disconnected.'));
            }

            const conn = this.peer.connect(hostId, { reliable: true });

            const checkOpen = () => {
                this._setupConnection(conn);
                resolve(conn);
            };

            if (conn.open) {
                checkOpen();
            } else {
                conn.on('open', checkOpen);
                conn.on('error', (err) => reject(err));
            }
        });
    }

    /**
     * Sends a message to a specific peer.
     * @param {string} targetId - The ID of the receiving peer.
     * @param {string} action - The action string.
     * @param {any} [payload] - Data to send.
     */
    sendToPeer(targetId, action, payload = null) {
        const conn = this.connections[targetId];
        if (conn && conn.open) {
            conn.send({ action, payload, senderId: this.myId });
        } else {
            console.warn(`[PeerManager] Cannot send to ${targetId}: Connection not open.`);
        }
    }

    /**
     * Broadcasts a message to all connected peers. Useful for hosts.
     * @param {string} action - The action string.
     * @param {any} [payload] - Data to send.
     * @param {string} [excludeId] - Optional peer ID to exclude from broadcast.
     */
    broadcast(action, payload = null, excludeId = null) {
        Object.keys(this.connections).forEach(peerId => {
            if (peerId !== excludeId) {
                this.sendToPeer(peerId, action, payload);
            }
        });
    }

    /**
     * Closes the local peer connection entirely.
     */
    destroy() {
        Object.values(this.connections).forEach(conn => conn.close());
        this.connections = {};
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }

    /**
     * Generates a short alphanumeric ID.
     * @returns {string}
     */
    generateId() {
        return Math.random().toString(36).substr(2, 6).toUpperCase();
    }
}

window.PeerNetworkManager = PeerNetworkManager;
