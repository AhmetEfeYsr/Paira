class ChatManager {
    constructor(network, playerName) {
        this.network = network;
        this.playerName = playerName;
        this.bindEvents();
    }
    
    bindEvents() {
        document.getElementById('chat-toggle')?.addEventListener('click', () => {
            document.getElementById('chat-panel')?.classList.toggle('active');
        });
        document.getElementById('chat-close')?.addEventListener('click', () => {
            document.getElementById('chat-panel')?.classList.remove('active');
        });
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('chat-send');
        if (input && sendBtn) {
            sendBtn.addEventListener('click', () => this.sendChat(input.value));
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendChat(input.value);
            });
        }
    }
    
    sendChat(text) {
        if (!text.trim()) return;
        this.addMessage(this.playerName, text, true);
        this.network.sendMessage({ type: 'chat', text: text, sender: this.playerName });
        document.getElementById('chat-input').value = '';
    }
    
    addMessage(sender, text, isSelf) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        const div = document.createElement('div');
        div.className = `chat-message ${isSelf ? 'self' : 'other'}`;
        div.innerHTML = `<strong>${sender}:</strong> <span>${text}</span>`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }
}

class KatiplikNetwork {
    constructor(game) {
        this.game = game;
        this.peerManager = new PeerNetworkManager({
            isHost: game.isHost,
            onPeerReady: (id) => {
                console.log("Peer ready:", id);
            },
            onConnection: (peerId, conn) => {
                this.onConnectionEstablished();
            },
            onDataReceived: (action, payload, senderId) => {
                this.onMessageReceived({ type: action, ...payload });
            },
            onDisconnection: (peerId) => {
                window.showToast("Rakip ayrıldı", "warning");
                setTimeout(() => window.location.href = 'index.html', 3000);
            },
            onError: (err) => {
                console.error("Network error:", err);
                window.showToast("Bağlantı hatası", "error");
            }
        });
    }

    initialize(isHost, roomCode) {
        const myId = isHost ? `katiplik-host-${roomCode}` : null;
        this.peerManager.init(myId).then(() => {
            if (!isHost) {
                this.peerManager.connectToHost(`katiplik-host-${roomCode}`).then(() => {
                    this.onConnectionEstablished();
                }).catch(err => {
                    window.showToast("Odaya bağlanılamadı", "error");
                });
            }
        }).catch(err => {
            window.showToast("Bağlantı kurulamadı", "error");
        });
    }

    sendMessage(data) {
        const { type, ...payload } = data;
        this.peerManager.broadcast(type, payload);
    }

    onConnectionEstablished() {
        document.getElementById('waiting-screen')?.classList.add('hidden');
        document.getElementById('waiting-screen')?.classList.remove('active');
        document.getElementById('game-screen')?.classList.remove('hidden');
        document.getElementById('game-screen')?.classList.add('active');

        if (this.game.isHost) {
            this.game.opponentName = 'Rakip';
            
            setTimeout(() => {
                this.sendMessage({
                    type: 'player_info',
                    name: this.game.playerName
                });
                
                this.game.loadCategories();
            }, 500);
        }
    }

    onMessageReceived(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'chat':
                if (this.game.chat) {
                    this.game.chat.addMessage(data.sender, data.text, false);
                }
                break;
            case 'player_info':
                this.game.opponentName = data.name;
                document.getElementById('p2-name').textContent = data.name;
                
                if (!this.game.isHost && this.game.opponentName) {
                    this.sendMessage({
                        type: 'player_info',
                        name: this.game.playerName
                    });
                }
                break;
                
            case 'game_start':
                this.game.startGame(data.text, data.imlaMode, data.kbMode);
                break;
                
            case 'progress_update':
                this.game.updateOpponentProgress(data.progress, data.wpm);
                break;
                
            case 'game_finished':
                this.game.opponentFinished(data.time, data.wpm, data.accuracy);
                break;
                
            case 'play_again':
                this.game.resetGame();
                break;
        }
    }
}
