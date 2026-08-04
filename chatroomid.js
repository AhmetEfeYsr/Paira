/**
 * Paira - Kick Chatroom & Channel Proxy (Cloudflare Worker)
 * 
 * Kurulum Adımları:
 * 1. Cloudflare Dashboard > Workers & Pages > "paira-kick-proxy" (canimablam) Worker'ınızı açın.
 * 2. "Edit Code" butonuna tıklayın.
 * 3. Bu dosyadaki güncellenmiş kodları yapıştırıp "Save and Deploy" butonuna basın.
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel");

    // CORS Preflight (OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (!channel) {
      return new Response(JSON.stringify({ error: "Kanal adı zorunludur" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    const cleanChannel = channel.trim().toLowerCase();

    const fetchKickData = async (targetUrl, isWrapper = false) => {
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "application/json, text/html"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      let content = "";
      if (isWrapper) {
        const wrapper = await res.json();
        content = wrapper.contents || "";
      } else {
        content = await res.text();
      }

      if (!content) throw new Error("Empty content");

      // 1. Check __NEXT_DATA__
      if (content.includes("__NEXT_DATA__")) {
        const match = content.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
        if (match && match[1]) {
          const nextData = JSON.parse(match[1]);
          const channelData = nextData.props?.pageProps?.channel;
          if (channelData) {
            return {
              chatroom_id: channelData.chatroom?.id || channelData.id,
              pusher_key: channelData.pusher?.key || "eb1f5f2e6192d192080a",
              pusher_cluster: channelData.pusher?.cluster || "us2"
            };
          }
        }
      }

      // 2. Check Direct JSON
      try {
        const data = typeof content === 'object' ? content : JSON.parse(content);
        const chatroomId = data.id || data.chatroom_id || data.chatroom?.id;
        if (chatroomId) {
          return {
            chatroom_id: chatroomId,
            pusher_key: data.pusher_key || data.pusher?.key || "eb1f5f2e6192d192080a",
            pusher_cluster: data.pusher_cluster || data.pusher?.cluster || "us2"
          };
        }
      } catch (e) {}

      throw new Error("No Chatroom ID found");
    };

    const endpoints = [
      { url: `https://kick.com/api/v2/channels/${cleanChannel}/chatroom`, isWrapper: false },
      { url: `https://kick.com/api/v2/channels/${cleanChannel}`, isWrapper: false },
      { url: `https://kick.com/api/v1/channels/${cleanChannel}`, isWrapper: false },
      { url: `https://kick.com/${cleanChannel}`, isWrapper: false },
      { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent('https://kick.com/api/v2/channels/' + cleanChannel + '/chatroom')}`, isWrapper: false },
      { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent('https://kick.com/api/v2/channels/' + cleanChannel)}`, isWrapper: false },
      { url: `https://api.allorigins.win/get?url=${encodeURIComponent('https://kick.com/' + cleanChannel)}`, isWrapper: true }
    ];

    for (const ep of endpoints) {
      try {
        const data = await fetchKickData(ep.url, ep.isWrapper);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (e) {
        // Try next endpoint
      }
    }

    return new Response(JSON.stringify({ error: `"${cleanChannel}" kanalı için Chatroom ID bulunamadı.` }), {
      status: 444,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
};
