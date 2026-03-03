/**
 * Universal Chat Listener for Twitch and Kick
 * Connects to the given channel's chat and triggers a callback for every new message.
 * Supports Twitch via standard anonymous IRC WebSocket.
 * Supports Kick via its public API polling (with a CORS proxy).
 */

class ChatListener {
    constructor(platform, channelName, onMessage) {
        this.platform = platform.toLowerCase();
        this.channelName = channelName.trim();
        this.onMessage = onMessage;

        this.isConnected = false;

        // Twitch specific
        this.twSocket = null;

        // Kick specific
        this.kickInterval = null;
        this.kickLastMessageTime = new Date().getTime();
        this.kickChatroomId = null;

        // Start connection
        this.connect();
    }

    connect() {
        if (this.platform === 'twitch') {
            this.connectTwitch();
        } else if (this.platform === 'kick') {
            this.connectKick();
        } else {
            console.error("Desteklenmeyen platform:", this.platform);
        }
    }

    disconnect() {
        this.isConnected = false;

        if (this.twSocket) {
            this.twSocket.close();
            this.twSocket = null;
        }

        if (this.kickInterval) {
            clearInterval(this.kickInterval);
            this.kickInterval = null;
        }
        console.log(`${this.platform} (${this.channelName}) chat bağlantısı kesildi.`);
    }

    // --- TWITCH IMPLEMENTATION (IRC over WebSocket) ---
    connectTwitch() {
        // Connect to Twitch IRC WebSocket
        this.twSocket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        this.twSocket.onopen = () => {
            console.log("Twitch IRC bağlantısı kuruldu.");
            // Anonymously authenticate
            this.twSocket.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
            this.twSocket.send('PASS SCHMOOPIIE');
            const randomUser = `justinfan${Math.floor(Math.random() * 80000)}`;
            this.twSocket.send(`NICK ${randomUser}`);
            this.twSocket.send(`USER ${randomUser} 8 * :${randomUser}`);
            // Join the specific channel
            this.twSocket.send(`JOIN #${this.channelName.toLowerCase()}`);
            this.isConnected = true;
        };

        this.twSocket.onmessage = (event) => {
            const data = event.data;

            // Handle PING to keep connection alive
            if (data.startsWith('PING')) {
                this.twSocket.send('PONG :tmi.twitch.tv');
                return;
            }

            // Parse PRIVMSG (normal chat messages)
            if (data.includes('PRIVMSG')) {
                const messageMatch = data.match(/display-name=([^;]+).*?PRIVMSG #[^:]+:(.+)/);
                if (messageMatch && messageMatch.length >= 3) {
                    const username = messageMatch[1].trim();
                    const message = messageMatch[2].trim();
                    this.onMessage({ username, message, platform: 'twitch' });
                } else {
                    // Fallback parsing if tags aren't present
                    const fallbackMatch = data.match(/:([^!]+)!.*?PRIVMSG #[^:]+:(.+)/);
                    if(fallbackMatch && fallbackMatch.length >= 3) {
                        const username = fallbackMatch[1].trim();
                        const message = fallbackMatch[2].trim();
                        this.onMessage({ username, message, platform: 'twitch' });
                    }
                }
            }
        };

        this.twSocket.onerror = (error) => {
            console.error("Twitch Socket Hatası:", error);
            this.isConnected = false;
        };

        this.twSocket.onclose = () => {
            console.log("Twitch Socket Kapatıldı.");
            this.isConnected = false;
        };
    }


    // --- KICK IMPLEMENTATION (API Polling via CORS Proxy) ---
    async connectKick() {
        console.log(`Kick kanalı aranıyor: ${this.channelName}...`);

        // Step 1: Get the channel's chatroom ID
        // Using corsproxy.io to bypass browser CORS policies for external APIs
        const channelApiUrl = `https://corsproxy.io/?https://kick.com/api/v1/channels/${this.channelName}`;

        try {
            const response = await fetch(channelApiUrl, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error("Kanal bulunamadı veya API erişimi engellendi.");
            }

            const data = await response.json();

            if (data && data.chatroom && data.chatroom.id) {
                this.kickChatroomId = data.chatroom.id;
                console.log(`Kick Chatroom ID bulundu: ${this.kickChatroomId}. Mesajlar dinleniyor...`);
                this.isConnected = true;
                this.pollKickMessages(); // Start polling immediately

                // Poll every 2 seconds (avoiding rate limits as much as possible)
                this.kickInterval = setInterval(() => {
                    this.pollKickMessages();
                }, 2000);
            } else {
                throw new Error("Chatroom ID verisi alınamadı.");
            }
        } catch (error) {
            console.error("Kick Bağlantı Hatası:", error);
            alert("Kick chatine bağlanılamadı. Kanal adını kontrol edin veya daha sonra tekrar deneyin.");
        }
    }

    async pollKickMessages() {
        if (!this.kickChatroomId) return;

        const messagesApiUrl = `https://corsproxy.io/?https://kick.com/api/v2/channels/${this.kickChatroomId}/messages`;

        try {
            const response = await fetch(messagesApiUrl, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) return;

            const data = await response.json();

            if (data && data.data && Array.isArray(data.data)) {
                // Kick API returns newest messages last, or we sort them by created_at just in case
                const messages = data.data;

                messages.forEach(msg => {
                    const msgTime = new Date(msg.created_at).getTime();

                    // Only process new messages (ones that arrived after our last check)
                    if (msgTime > this.kickLastMessageTime) {
                        const username = msg.sender ? msg.sender.username : "Bilinmeyen";
                        const content = msg.content ? msg.content.trim() : "";

                        if (content) {
                            this.onMessage({ username, message: content, platform: 'kick' });
                        }
                    }
                });

                // Update last seen message time to the newest message in the batch
                if (messages.length > 0) {
                    const latestMsgTime = new Date(messages[messages.length - 1].created_at).getTime();
                    if(latestMsgTime > this.kickLastMessageTime) {
                        this.kickLastMessageTime = latestMsgTime;
                    }
                }
            }
        } catch (error) {
            // Silently ignore polling errors to not flood console, it might be temporary network issue
            // console.error("Kick Polling Hatası:", error);
        }
    }
}
