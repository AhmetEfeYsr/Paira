let peer = null;
let connections = {}; // Client -> { conn }
let hostConn = null;

let isHost = false;
let myId = null;
let roomCode = null;

;

const initPeer = async (mode, room = null) => {
    isHost = mode === 'host';
    const getCode = () => {
        if (typeof window.generateRoomCode === 'function') {
            return window.generateRoomCode();
        }
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    };
    roomCode = isHost ? getCode() : (room ? room.toUpperCase() : '');

    // Use a deterministic peer ID for the host so clients can find them easily
    myId = isHost ? `paira-chattabu-${roomCode}` : `client-${Math.random().toString(36).substring(2, 9)}`;

    return new Promise((resolve, reject) => {
        try {
            peer = new Peer(myId, {
                debug: 2
            });
        } catch (e) {
            reject(e);
            return;
        }

        peer.on('open', (id) => {
            console.log('My peer ID is: ' + id);

            if (isHost) {
                // Host listens for connections
                peer.on('connection', (conn) => {
                    setupHostConnection(conn);
                });
                resolve({ success: true, roomCode, myId });
            } else {
                // Client connects to host
                const hostId = `paira-chattabu-${roomCode}`;
                console.log("Connecting to host:", hostId);
                const conn = peer.connect(hostId, {
                    reliable: true
                });
                setupClientConnection(conn);

                // Wait for connection to open
                let timeout = setTimeout(() => {
                    reject(new Error("Bağlantı zaman aşımına uğradı. Oda kodunu kontrol edin."));
                }, 10000);

                conn.on('open', () => {
                    clearTimeout(timeout);
                    resolve({ success: true, roomCode, myId });
                });

                conn.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            }
        });

        peer.on('error', (err) => {
            console.error('Peer error:', err);
            reject(err);
        });
    });
};

const setupHostConnection = (conn) => {
    console.log("Client connecting:", conn.peer);

    // Support up to 10 streamers in a single room
    if (Object.keys(connections).length >= 10) {
        conn.on('open', () => {
            conn.send({ type: 'ERROR', message: 'Oda dolu! (Maksimum 10 yayıncı)' });
            setTimeout(() => conn.close(), 500);
        });
        return;
    }

    const handleOpen = () => {
        connections[conn.peer] = conn;
        console.log("Client connected:", conn.peer);

        // Notify game logic
        if (typeof window.onPlayerJoined === 'function') {
            window.onPlayerJoined(conn.peer);
        }

        conn.on('data', (data) => {
            if (typeof window.handleNetworkData === 'function') {
                window.handleNetworkData(data, conn.peer);
            }
        });

        conn.on('close', () => {
            console.log("Client disconnected:", conn.peer);
            delete connections[conn.peer];
            if (typeof window.onPlayerLeft === 'function') {
                window.onPlayerLeft(conn.peer);
            }
        });
    };

    if (conn.open) {
        handleOpen();
    } else {
        conn.on('open', handleOpen);
    }
};

const setupClientConnection = (conn) => {
    hostConn = conn;

    const handleOpen = () => {
        console.log("Connected to Host successfully");

        conn.on('data', (data) => {
            if (data.type === 'ERROR') {
                if (window.showToast) window.showToast(data.message, 'error');
                else alert(data.message);
                window.location.href = 'index.html';
                return;
            }
            if (typeof window.handleNetworkData === 'function') {
                window.handleNetworkData(data, 'host');
            }
        });

        conn.on('close', () => {
            console.log("Host disconnected");
            if (window.showToast) window.showToast("Kurucu odadan ayrıldı.", 'error');
            else alert("Kurucu odadan ayrıldı.");
            sessionStorage.removeItem('chattabu_room');
            sessionStorage.removeItem('chattabu_isHost');
            window.location.href = 'index.html';
        });
    };

    if (conn.open) {
        handleOpen();
    } else {
        conn.on('open', handleOpen);
    }
};

const broadcastToClients = (data) => {
    if (!isHost) return;
    Object.values(connections).forEach(conn => {
        if (conn && conn.open) {
            conn.send(data);
        }
    });
};

const sendToHost = (data) => {
    if (isHost) return;
    if (hostConn && hostConn.open) {
        hostConn.send(data);
    }
};

const disconnectPeer = () => {
    if (isHost) {
        broadcastToClients({ type: 'ERROR', message: 'Kurucu oyunu kapattı.' });
        Object.values(connections).forEach(conn => {
            if (conn) conn.close();
        });
    } else {
        if (hostConn) hostConn.close();
    }

    if (peer) {
        peer.destroy();
        peer = null;
    }
    connections = {};
    hostConn = null;
};

// Export to window
window.Network = {
    initPeer,
    broadcastToClients,
    sendToHost,
    disconnectPeer,
    isHost: () => isHost,
    getMyId: () => myId,
    getRoomCode: () => roomCode
};

window.addEventListener('beforeunload', () => {
    disconnectPeer();
});
