/**
 * ChatListener - Unified Twitch and Kick chat listener for streamer vs chat games.
 *
 * Twitch: Uses native WebSockets (TMI).
 * Kick: Fetches chatroom and pusher info from a custom Cloud Function endpoint to bypass Cloudflare,
 *       then uses native WebSockets to connect to Pusher.
 */
class ChatListener {
    constructor(platform, channel, onMessageCallback, onErrorCallback = null) {
        this.platform = platform.toLowerCase();
        this.channel = channel.toLowerCase();
        this.onMessage = onMessageCallback;
        this.onError = onErrorCallback;
        this.ws = null;

        // IMPORTANT: Replace this with your deployed Google Cloud Function URL
        this.kickCloudFunctionUrl = 'https://us-central1-precise-rune-465721-f3.cloudfunctions.net/getKickInfo';
    }

    start() {
        if (this.platform === 'twitch') {
            this.startTwitch();
        } else if (this.platform === 'kick') {
            this.startKick();
        } else {
            this.handleError('Unsupported platform. Use "twitch" or "kick".');
        }
    }

    stop() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    handleError(errorMsg) {
        console.error(errorMsg);
        const status = document.getElementById('chat-status');
        if (status) {
            status.textContent = '• Bağlantı Hatası';
            status.style.color = 'var(--danger)';
        }
        if (this.onError) {
            this.onError(errorMsg);
        }
        if (window.showToast) {
            window.showToast(errorMsg, 'error');
        }
    startTwitch() {
        this.stop();
        this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        this.ws.onopen = () => {
            console.log(`[Twitch] Connected to ${this.channel} chat.`);
            const status = document.getElementById('chat-status');
            if (status) {
                status.textContent = '• Bağlı';
                status.style.color = 'var(--success)';
            }
            this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
            this.ws.send('PASS SCHMOOPIIE');
            this.ws.send(`NICK justinfan${Math.floor(Math.random() * 80000)}`);
            this.ws.send(`JOIN #${this.channel}`);
            if (this.onOpen) this.onOpen();
        };

        this.ws.onmessage = (event) => {
            const message = event.data;
            if (message.startsWith('PING')) {
                this.ws.send('PONG :tmi.twitch.tv');
            } else if (message.includes('PRIVMSG')) {
                const usernameMatch = message.match(/display-name=([^;]+)/) || message.match(/:(.*?)!/);
                const username = usernameMatch ? usernameMatch[1] : 'Unknown';
                const contentMatch = message.match(/PRIVMSG #[^:]+:(.+)/);
                const content = contentMatch ? contentMatch[1].trim() : '';

                if (content && this.onMessage) {
                    this.onMessage(username, content);
                }
            }
        };

        this.ws.onerror = (error) => {
            this.handleError('[Twitch] WebSocket error');
        };

        this.ws.onclose = () => {
            console.log('[Twitch] Disconnected.');
            if (this.onClose) this.onClose();
        };
    }

    async startKick() {
        this.stop();
        console.log(`[Kick] Fetching channel data client-side for ${this.channel}...`);

        const targets = [
            {
                url: `https://api.allorigins.win/raw?url=${encodeURIComponent('https://kick.com/' + this.channel)}`,
                type: 'html'
            },
            {
                url: `https://corsproxy.io/?https://kick.com/${this.channel}`,
                type: 'html'
            },
            {
                url: `https://api.allorigins.win/raw?url=${encodeURIComponent('https://kick.com/api/v2/channels/' + this.channel)}`,
                type: 'json'
            },
            {
                url: `https://corsproxy.io/?https://kick.com/api/v2/channels/${this.channel}`,
                type: 'json'
            }
        ];

        let chatroomId = null;
        let pusherKey = 'eb1f5f2e6192d192080a';
        let pusherCluster = 'us2';

        for (const target of targets) {
            try {
                const response = await fetch(target.url);
                if (!response.ok) continue;

                const content = await response.text();

                if (content.includes('__NEXT_DATA__')) {
                    const match = content.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
                    if (match && match[1]) {
                        const nextData = JSON.parse(match[1]);
                        const channelData = nextData.props?.pageProps?.channel;
                        if (channelData) {
                            chatroomId = channelData.chatroom?.id || channelData.id;
                            if (channelData.pusher?.key) pusherKey = channelData.pusher.key;
                            if (channelData.pusher?.cluster) pusherCluster = channelData.pusher.cluster;
                            if (chatroomId) break;
                        }
                    }
                }

                try {
                    const json = JSON.parse(content);
                    const parsedId = json.chatroom_id || json.chatroom?.id || json.id;
                    if (parsedId) {
                        chatroomId = parsedId;
                        if (json.pusher_key) pusherKey = json.pusher_key;
                        if (json.pusher?.key) pusherKey = json.pusher.key;
                        if (json.pusher_cluster) pusherCluster = json.pusher_cluster;
                        if (json.pusher?.cluster) pusherCluster = json.pusher.cluster;
                        break;
                    }
                } catch (e) {
                    // Ignore non-JSON content
                }
            } catch (e) {
                console.warn(`[Kick Client Fetch] Target failed (${target.url}):`, e);
            }
        }

        if (!chatroomId) {
            this.handleError('[Kick] Kick kanal bilgileri istemci tarafında alınamadı. Lütfen kanal adını kontrol edin.');
            return;
        }

        console.log(`[Kick] Resolved Chatroom ID: ${chatroomId}, Key: ${pusherKey}, Cluster: ${pusherCluster}`);
        this.connectToKickPusher(pusherKey, pusherCluster, chatroomId);
    }

    connectToKickPusher(key, cluster, chatroomId) {
        // Build Pusher connection URL
        const pusherUrl = `wss://ws-${cluster}.pusher.com/app/${key}?protocol=7&client=js&version=8.3.0&flash=false`;
        this.ws = new WebSocket(pusherUrl);

        this.ws.onopen = () => {
            console.log(`[Kick] Connected to Pusher for ${this.channel} (Chatroom ID: ${chatroomId}).`);
            const status = document.getElementById('chat-status');
            if (status) {
                status.textContent = '• Bağlı';
                status.style.color = 'var(--success)';
            }
            // Subscribe to the chatroom channel
            const subscribeMsg = JSON.stringify({
                event: 'pusher:subscribe',
                data: {
                    auth: '',
                    channel: `chatrooms.${chatroomId}.v2`
                }
            });
            this.ws.send(subscribeMsg);
            if (this.onOpen) this.onOpen();
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.event === 'App\\Events\\ChatMessageEvent') {
                    const chatData = JSON.parse(msg.data);
                    const username = chatData.sender.username;
                    const content = chatData.content;

                    if (content && this.onMessage) {
                        this.onMessage(username, content);
                    }
                }
            } catch (e) {
                // Ignore parse errors for non-JSON or other pusher internal messages like ping/pong
            }
        };

        this.ws.onerror = (error) => {
            this.handleError('[Kick] Pusher WebSocket error');
        };

        this.ws.onclose = () => {
            console.log('[Kick] Disconnected from Pusher.');
            if (this.onClose) this.onClose();
        };
    }
}

window.ChatListener = ChatListener;
