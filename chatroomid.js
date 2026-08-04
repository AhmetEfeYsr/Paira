/**
 * Paira - Kick Chatroom & Channel Proxy (Cloudflare Worker)
 * 
 * Kurulum Adımları:
 * 1. https://dash.cloudflare.com adresine ücretsiz üye olun veya giriş yapın.
 * 2. Sol menüden "Workers & Pages" > "Create Application" > "Create Worker" butonuna tıklayın.
 * 3. Worker adını "paira-kick-proxy" koyun ve "Deploy" butonuna basın.
 * 4. "Edit Code" butonuna tıklayın ve bu dosyadaki tüm kodları yapıştırıp "Save and Deploy" deyin.
 * 5. Size verilen URL'yi (Örn: https://paira-kick-proxy.USERNAME.workers.dev) kopyalayın.
 * 6. shared/chat.js içerisindeki `kickWorkerUrl` değişkenine kopyaladığınız bu URL'yi yapıştırın!
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel");

    // CORS Preflight (OPTIONS) İzinleri
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

    try {
      // 1. Kick API v2 Denemesi
      let response = await fetch(`https://kick.com/api/v2/channels/${cleanChannel}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7"
        }
      });

      if (response.ok) {
        const data = await response.json();
        return new Response(JSON.stringify({
          chatroom_id: data.chatroom?.id || data.id,
          pusher_key: data.pusher?.key || "eb1f5f2e6192d192080a",
          pusher_cluster: data.pusher?.cluster || "us2"
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // 2. Eğer API engellenirse HTML __NEXT_DATA__ Ayıklaması
      let htmlResponse = await fetch(`https://kick.com/${cleanChannel}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
      });

      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
        if (match && match[1]) {
          const nextData = JSON.parse(match[1]);
          const channelData = nextData.props?.pageProps?.channel;
          if (channelData) {
            return new Response(JSON.stringify({
              chatroom_id: channelData.chatroom?.id || channelData.id,
              pusher_key: channelData.pusher?.key || "eb1f5f2e6192d192080a",
              pusher_cluster: channelData.pusher?.cluster || "us2"
            }), {
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            });
          }
        }
      }

      return new Response(JSON.stringify({ error: "Kanal verisi bulunamadı" }), {
        status: 444,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  }
};
