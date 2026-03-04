/**
 * ChatListener - Unified Twitch and Kick chat listener for streamer vs chat games.
 *
 * Twitch: Uses native WebSockets (TMI).
 * Kick: Fetches chatroom and pusher info from a custom Cloud Function endpoint to bypass Cloudflare,
 *       then uses native WebSockets to connect to Pusher.
 */
class ChatListener {
    constructor(platform, channel, onMessageCallback) {
        this.platform = platform.toLowerCase();
        this.channel = channel.toLowerCase();
        this.onMessage = onMessageCallback;
        this.ws = null;

        // IMPORTANT: Replace this with your deployed Google Cloud Function URL
        this.kickCloudFunctionUrl = 'YOUR_GOOGLE_CLOUD_FUNCTION_URL';
    }

    start() {
        if (this.platform === 'twitch') {
            this.startTwitch();
        } else if (this.platform === 'kick') {
            this.startKick();
        } else {
            console.error('Unsupported platform. Use "twitch" or "kick".');
        }
    }

    stop() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    startTwitch() {
        this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        this.ws.onopen = () => {
            console.log(`[Twitch] Connected to ${this.channel} chat.`);
            this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
            this.ws.send('PASS SCHMOOPIIE');
            this.ws.send(`NICK justinfan${Math.floor(Math.random() * 80000)}`);
            this.ws.send(`JOIN #${this.channel}`);
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
            console.error('[Twitch] WebSocket error:', error);
        };

        this.ws.onclose = () => {
            console.log('[Twitch] Disconnected.');
        };
    }

    async startKick() {
        try {
            console.log(`[Kick] Fetching channel data for ${this.channel}...`);
            // Call the cloud function to get pusher key, cluster and chatroom_id
            const response = await fetch(`${this.kickCloudFunctionUrl}?channel=${this.channel}`);
            if (!response.ok) {
                throw new Error('Failed to fetch Kick channel info from Cloud Function.');
            }
            const data = await response.json();

            if (!data.chatroom_id || !data.pusher_key || !data.pusher_cluster) {
                throw new Error('Invalid response from Cloud Function: Missing pusher or chatroom data.');
            }

            this.connectToKickPusher(data.pusher_key, data.pusher_cluster, data.chatroom_id);

        } catch (error) {
            console.error('[Kick] Initialization error:', error);
            // Fallback: If URL is not set or fails, notify the user.
            if (this.kickCloudFunctionUrl === 'YOUR_GOOGLE_CLOUD_FUNCTION_URL') {
                alert('Kick entegrasyonu için lütfen shared/chat.js dosyasındaki "YOUR_GOOGLE_CLOUD_FUNCTION_URL" adresini kendi Cloud Function adresinizle değiştirin.');
            }
        }
    }

    connectToKickPusher(key, cluster, chatroomId) {
        // Build Pusher connection URL
        const pusherUrl = `wss://ws-${cluster}.pusher.com/app/${key}?protocol=7&client=js&version=8.3.0&flash=false`;
        this.ws = new WebSocket(pusherUrl);

        this.ws.onopen = () => {
            console.log(`[Kick] Connected to Pusher for ${this.channel} (Chatroom ID: ${chatroomId}).`);
            // Subscribe to the chatroom channel
            const subscribeMsg = JSON.stringify({
                event: 'pusher:subscribe',
                data: {
                    auth: '',
                    channel: `chatrooms.${chatroomId}.v1`
                }
            });
            this.ws.send(subscribeMsg);
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
            console.error('[Kick] Pusher WebSocket error:', error);
        };

        this.ws.onclose = () => {
            console.log('[Kick] Disconnected from Pusher.');
        };
    }
}

// Export for use in modern script types if needed, or leave it global for simple <script> inclusion.
window.ChatListener = ChatListener;
