/**
 * ChatListener - Unified Twitch and Kick chat listener for streamer vs chat games.
 * Supports single platform (Twitch or Kick) OR Dual/Cross-Platform mode (Hem Twitch Hem Kick!).
 */
class ChatListener {
    constructor(platform, channel, onMessageCallback, onErrorCallback = null, onOpenCallback = null) {
        this.platform = (platform || 'twitch').toLowerCase();
        
        if (typeof channel === 'object' && channel !== null) {
            this.twitchChannel = (channel.twitch || '').toLowerCase();
            this.kickChannel = (channel.kick || '').toLowerCase();
            this.channel = this.twitchChannel || this.kickChannel;
        } else {
            this.channel = (channel || '').toLowerCase();
            this.twitchChannel = this.channel;
            this.kickChannel = this.channel;
        }

        this.onMessage = onMessageCallback;
        this.onError = onErrorCallback;
        this.onOpen = onOpenCallback;
        this.isConnected = false;

        this.twitchWs = null;
        this.kickWs = null;
        this.ws = null; // fallback reference
        this.isStopped = false;
        this.reconnectTimeout = null;
        this.twitchReconnectDelay = 3000;
        this.kickReconnectDelay = 3000;

        this.kickWorkerUrl = 'https://canimablam.ahmetefeyasar07.workers.dev';
    }

    start() {
        this.isStopped = false;
        if (this.platform === 'twitch') {
            this.startTwitch(this.twitchChannel);
        } else if (this.platform === 'kick') {
            this.startKick(this.kickChannel);
        } else if (this.platform === 'both' || this.platform === 'crossplatform') {
            console.log(`[ChatListener] Starting Dual Cross-Platform mode (Twitch: ${this.twitchChannel}, Kick: ${this.kickChannel})...`);
            if (this.twitchChannel) this.startTwitch(this.twitchChannel);
            if (this.kickChannel) this.startKick(this.kickChannel);
        } else {
            this.handleError('Desteklenmeyen platform. "twitch", "kick" veya "both" kullanın.');
        }
    }

    stop() {
        this.isStopped = true;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.twitchPingInterval) {
            clearInterval(this.twitchPingInterval);
            this.twitchPingInterval = null;
        }
        if (this.kickPingInterval) {
            clearInterval(this.kickPingInterval);
            this.kickPingInterval = null;
        }
        if (this.twitchWs) {
            this.twitchWs.close();
            this.twitchWs = null;
        }
        if (this.kickWs) {
            this.kickWs.close();
            this.kickWs = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    updateStatusConnected() {
        this.isConnected = true;
        const status = document.getElementById('chat-status');
        if (status) {
            if (this.platform === 'both' || this.platform === 'crossplatform') {
                status.textContent = '• Twitch & Kick Bağlı';
            } else {
                status.textContent = '• Bağlı';
            }
            status.style.color = 'var(--success)';
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
    }

    startTwitch(targetChannel = this.twitchChannel) {
        if (!targetChannel) return;
        const cleanChannel = targetChannel.trim().toLowerCase().replace(/^#/, '');
        console.log(`[Twitch] Connecting to ${cleanChannel} chat...`);
        const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
        this.twitchWs = ws;
        this.ws = ws;

        ws.onopen = () => {
            console.log(`[Twitch] Connected to #${cleanChannel} chat.`);
            this.twitchReconnectDelay = 3000;
            this.updateStatusConnected();
            ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
            ws.send('PASS SCHMOOPIIE');
            ws.send(`NICK justinfan${Math.floor(Math.random() * 80000)}`);
            ws.send(`JOIN #${cleanChannel}`);
            if (this.onOpen) this.onOpen();

            if (this.twitchPingInterval) clearInterval(this.twitchPingInterval);
            this.twitchPingInterval = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send('PING :tmi.twitch.tv');
                }
            }, 30000);
        };

        ws.onmessage = (event) => {
            const rawMessage = event.data;
            const lines = rawMessage.split('\r\n');

            for (const message of lines) {
                if (!message) continue;

                if (message.startsWith('PING')) {
                    ws.send('PONG :tmi.twitch.tv');
                } else if (message.includes('PRIVMSG')) {
                    const usernameMatch = message.match(/display-name=([^;]+)/) || message.match(/:(.*?)!/);
                    let username = usernameMatch ? usernameMatch[1] : 'Unknown';
                    if (!username || username === 'Unknown') {
                        const fallbackMatch = message.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv/);
                        if (fallbackMatch) username = fallbackMatch[1];
                    }

                    const contentMatch = message.match(/PRIVMSG #[^:]+:(.+)/);
                    const content = contentMatch ? contentMatch[1].trim() : '';

                    if (content && this.onMessage) {
                        const prefix = (this.platform === 'both' || this.platform === 'crossplatform') ? '[Twitch] ' : '';
                        this.onMessage(prefix + username, content, 'twitch');
                    }
                }
            }
        };

        ws.onerror = (error) => {
            console.error('[Twitch] WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('[Twitch] Disconnected.');
            if (this.onClose) this.onClose();

            if (!this.isStopped) {
                const status = document.getElementById('chat-status');
                if (status) {
                    status.textContent = `• Twitch Yeniden Bağlanıyor (${Math.round(this.twitchReconnectDelay/1000)}sn)...`;
                    status.style.color = 'var(--warning)';
                }
                const delay = this.twitchReconnectDelay;
                this.twitchReconnectDelay = Math.min(30000, this.twitchReconnectDelay * 1.5);
                this.reconnectTimeout = setTimeout(() => {
                    if (!this.isStopped) {
                        console.log('[Twitch] Reconnecting...');
                        this.startTwitch(targetChannel);
                    }
                }, delay);
            }
        };
    }

    async startKick(targetChannel = this.kickChannel) {
        if (!targetChannel) return;
        const cleanChannel = targetChannel.trim().toLowerCase();
        console.log(`[Kick] Fetching channel data client-side for ${cleanChannel}...`);

        const targets = [];

        if (this.kickWorkerUrl) {
            targets.push({
                url: `${this.kickWorkerUrl}?channel=${cleanChannel}`,
                isWrapper: false
            });
        }

        targets.push(
            {
                url: `https://thingproxy.freeboard.io/fetch/https://kick.com/api/v2/channels/${cleanChannel}/chatroom`,
                isWrapper: false
            },
            {
                url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent('https://kick.com/api/v2/channels/' + cleanChannel + '/chatroom')}`,
                isWrapper: false
            },
            {
                url: `https://thingproxy.freeboard.io/fetch/https://kick.com/api/v2/channels/${cleanChannel}`,
                isWrapper: false
            },
            {
                url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent('https://kick.com/api/v2/channels/' + cleanChannel)}`,
                isWrapper: false
            },
            {
                url: `https://api.allorigins.win/get?url=${encodeURIComponent('https://kick.com/' + cleanChannel)}`,
                isWrapper: true
            }
        );

        const fetchTarget = async (target) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 6000);

            try {
                const response = await fetch(target.url, { signal: controller.signal });
                clearTimeout(timer);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                let content = '';
                if (target.isWrapper) {
                    const jsonWrapper = await response.json();
                    content = jsonWrapper.contents || '';
                } else {
                    content = await response.text();
                }

                if (!content) throw new Error('Empty content');

                let foundId = null;
                let foundKey = '32cbd69e4b950bf97679';
                let foundCluster = 'us2';

                if (content.includes('__NEXT_DATA__')) {
                    const match = content.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
                    if (match && match[1]) {
                        try {
                            const nextData = JSON.parse(match[1]);
                            const channelData = nextData.props?.pageProps?.channel;
                            if (channelData) {
                                foundId = channelData.chatroom?.id || channelData.chatroom_id;
                                if (channelData.pusher?.key) foundKey = channelData.pusher.key;
                                if (channelData.pusher?.cluster) foundCluster = channelData.pusher.cluster;
                            }
                        } catch (e) {}
                    }
                }

                if (!foundId) {
                    try {
                        const json = typeof content === 'object' ? content : JSON.parse(content);
                        foundId = json.chatroom?.id || json.chatroom_id || (target.url.includes('/chatroom') ? json.id : null);
                        if (json.pusher_key) foundKey = json.pusher_key;
                        if (json.pusher?.key) foundKey = json.pusher.key;
                        if (json.pusher_cluster) foundCluster = json.pusher_cluster;
                        if (json.pusher?.cluster) foundCluster = json.pusher.cluster;
                    } catch (e) {}
                }

                if (foundId) {
                    return { chatroomId: foundId, pusherKey: foundKey, pusherCluster: foundCluster };
                }
                throw new Error('Chatroom ID not found');
            } catch (err) {
                clearTimeout(timer);
                throw err;
            }
        };

        try {
            const result = await Promise.any(targets.map(target => fetchTarget(target)));
            console.log(`[Kick] Resolved Chatroom ID: ${result.chatroomId}, Key: ${result.pusherKey}, Cluster: ${result.pusherCluster}`);
            this.connectToKickPusher(result.pusherKey, result.pusherCluster, result.chatroomId, cleanChannel);
        } catch (e) {
            this.handleError(`[Kick] "${cleanChannel}" için Kick kanal bilgileri alınamadı. Lütfen kanal adını kontrol edin.`);
        }
    }

    connectToKickPusher(key, cluster, chatroomId, targetChannel = this.kickChannel) {
        const pusherUrl = `wss://ws-${cluster}.pusher.com/app/${key}?protocol=7&client=js&version=8.3.0&flash=false`;
        const ws = new WebSocket(pusherUrl);
        this.kickWs = ws;

        ws.onopen = () => {
            console.log(`[Kick] Connected to Pusher for ${targetChannel} (Chatroom ID: ${chatroomId}).`);
            this.updateStatusConnected();
            const subscribeMsg = JSON.stringify({
                event: 'pusher:subscribe',
                data: {
                    auth: '',
                    channel: `chatrooms.${chatroomId}.v2`
                }
            });
            ws.send(subscribeMsg);
            if (this.onOpen) this.onOpen();

            if (this.kickPingInterval) clearInterval(this.kickPingInterval);
            this.kickPingInterval = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
                }
            }, 20000);
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                if (message.event === 'App\\Events\\ChatMessageEvent') {
                    const data = JSON.parse(message.data);
                    const username = data.sender?.username || 'Unknown';
                    const content = data.content || '';

                    if (content && this.onMessage) {
                        const prefix = (this.platform === 'both' || this.platform === 'crossplatform') ? '[Kick] ' : '';
                        this.onMessage(prefix + username, content, 'kick');
                    }
                }
            } catch (e) {}
        };

        ws.onerror = (error) => {
            console.error('[Kick] WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('[Kick] Disconnected.');
            if (this.onClose) this.onClose();

            if (!this.isStopped) {
                const status = document.getElementById('chat-status');
                if (status) {
                    status.textContent = '• Kick Yeniden Bağlanıyor...';
                    status.style.color = 'var(--warning)';
                }
                this.reconnectTimeout = setTimeout(() => {
                    if (!this.isStopped) {
                        console.log('[Kick] Reconnecting...');
                        this.startKick(targetChannel);
                    }
                }, 3000);
            }
        };
    }
}

// Export to window object
window.ChatListener = ChatListener;
