/**
 * BaseGameNetwork - A standardized layer over PeerNetworkManager
 * Automatically handles sessionStorage reading, PeerJS initialization, 
 * and standard connection/disconnection flows for Paira Games.
 */
class BaseGameNetwork extends window.PeerNetworkManager {
    /**
     * @param {Object} options
     * @param {function(Object)} [options.onStateSync] - Callback when host broadcasts a new state.
     * @param {function(string, Object)} [options.onPlayerJoin] - Callback when a new player joins.
     * @param {function(string)} [options.onPlayerLeave] - Callback when a player disconnects.
     * @param {function(string, any, string)} [options.onAction] - Generic callback for custom game actions.
     */
    constructor(options = {}) {
        const isHost = sessionStorage.getItem('isHost') === 'true';
        
        super({
            isHost: isHost,
            onPeerReady: (id) => this._handlePeerReady(id),
            onConnection: (peerId, conn) => this._handleConnection(peerId, conn),
            onDataReceived: (action, payload, senderId) => this._handleDataReceived(action, payload, senderId),
            onDisconnection: (peerId) => this._handleDisconnection(peerId),
            onError: (err) => this._handleError(err)
        });

        this.myName = sessionStorage.getItem('username') || sessionStorage.getItem('playerName') || 'Oyuncu';
        this.roomCode = sessionStorage.getItem('roomCode');
        this.isHostNode = isHost;
        this.myId = null;

        this.onStateSync = options.onStateSync || null;
        this.onPlayerJoin = options.onPlayerJoin || null;
        this.onPlayerLeave = options.onPlayerLeave || null;
        this.onAction = options.onAction || null;
    }

    /**
     * Automatically initializes the connection based on sessionStorage role.
     */
    autoInit() {
        if (!this.myName) {
            window.location.href = 'index.html';
            return Promise.reject("No player name found.");
        }

        if (this.isHostNode) {
            // Priority: Explicit roomCode from login, then existing myId, then new generation
            const customId = sessionStorage.getItem('roomCode') || sessionStorage.getItem('myId') || this.generateRoomCode();
            this.myId = customId;
            sessionStorage.setItem('myId', customId);

            // Pre-register Host immediately in the engine so UI renders Host with 0ms delay
            if (this.onPlayerJoin) {
                this.onPlayerJoin(customId, { name: this.myName, isHost: true });
            }

            return this.init(customId);
        } else {
            if (!this.roomCode) {
                window.location.href = 'index.html';
                return Promise.reject("No room code found.");
            }
            return this.init().then(() => {
                return this.connectToHost(this.roomCode).then(() => {
                    this.sendToPeer(this.roomCode, 'JOIN', { name: this.myName });
                });
            });
        }
    }

    _handlePeerReady(id) {
        const oldId = this.myId;
        this.myId = id;
        sessionStorage.setItem('myId', id);
        
        // Let the game know we are ready with actual PeerJS ID
        if (this.onPlayerJoin && this.isHostNode) {
            this.onPlayerJoin(id, { name: this.myName, isHost: true, oldId: oldId });
        }
    }

    _handleConnection(peerId, conn) {
        // We wait for the 'JOIN' action payload to officially register the player.
    }

    _handleDataReceived(action, payload, senderId) {
        if (action === 'JOIN' && this.isHostNode) {
            if (this.onPlayerJoin) this.onPlayerJoin(senderId, payload);
        } 
        else if (action === 'LEAVE' && this.isHostNode) {
            if (this.onPlayerLeave) this.onPlayerLeave(senderId);
        }
        else if (action === 'SYNC' && !this.isHostNode) {
            if (this.onStateSync) this.onStateSync(payload);
        }
        else if (action === 'KICKED' && !this.isHostNode) {
            if (window.showToast) window.showToast("Odadan atıldınız.", "error");
            setTimeout(() => this.leaveRoom(), 2000);
        }
        else if (action === 'HOST_LEAVE' && !this.isHostNode) {
            if (window.showToast) window.showToast("Kurucu odadan ayrıldı.", "warning");
            setTimeout(() => this.leaveRoom(), 2000);
        }
        else {
            if (this.onAction) this.onAction(action, payload, senderId);
        }
    }

    _handleDisconnection(peerId) {
        super._handleDisconnection(peerId);
        
        if (this.isHostNode) {
            if (this.onPlayerLeave) this.onPlayerLeave(peerId);
        } else if (peerId === this.roomCode) {
            if (window.showToast) window.showToast("Kurucu ile bağlantı koptu, lobiye dönülüyor...", "error");
            setTimeout(() => this.leaveRoom(), 2000);
        }
    }

    _handleError(err) {
        if (err.type === 'peer-unavailable') {
            if (window.showToast) window.showToast("Oda bulunamadı veya kapandı.", "error");
            setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        } else {
            console.error("Network Error:", err);
            if (window.showToast) window.showToast("Bağlantı hatası oluştu.", "error");
        }
    }

    /**
     * Broadcasts the current state to all peers.
     * @param {Object} state - The complete game state object to sync.
     */
    broadcastState(state) {
        if (!this.isHostNode) return;
        this.broadcast('SYNC', state);
    }

    /**
     * Sends an action to the Host (for clients) or Broadcasts it (for Host).
     */
    sendGameAction(actionType, payload = {}) {
        if (this.isHostNode) {
            this.broadcast(actionType, payload);
            // Self-trigger for host to process the action locally without network roundtrip
            if (this.onAction) this.onAction(actionType, payload, this.myId);
        } else {
            this.sendToPeer(this.roomCode, actionType, payload);
        }
    }

    /**
     * Handles completely disconnecting and returning to index.
     */
    leaveRoom() {
        if (this.isHostNode) {
            this.broadcast('HOST_LEAVE');
        } else if (this.roomCode) {
            this.sendToPeer(this.roomCode, 'LEAVE');
        }

        this.destroy();
        sessionStorage.removeItem('myId');
        sessionStorage.removeItem('roomCode');
        window.location.href = 'index.html';
    }

    generateRoomCode() {
        if(window.generateRoomCode) return window.generateRoomCode();
        return "ROOM";
    }
}

window.BaseGameNetwork = BaseGameNetwork;
