/**
 * Paira Games - Hızlı İsim Şehir Cloudflare Worker
 * 
 * Bu Worker, oyunda kullanıcıların girdiği, oylama ile kabul edilen (VOTED_ACCEPTED)
 * veya reddedilen (REJECTED) kelimeleri loglar.
 * 
 * Dağıtım (Deploy):
 * 1. npx wrangler deploy
 * 2. Cloudflare Dashboard > Workers & Pages > KV namespaces > PAIRA_WORDS KV bağla.
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// In-memory fallback if KV is not attached yet
const memoryLogs = [];

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);

        // POST /api/log-word - Log a word from the game
        if (request.method === 'POST' && url.pathname === '/api/log-word') {
            try {
                const body = await request.json();
                const { word, categoryId, categoryName, status, letter } = body;

                if (!word || !categoryId) {
                    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                        status: 400,
                        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                    });
                }

                const logEntry = {
                    id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    word: word.trim(),
                    categoryId,
                    categoryName: categoryName || categoryId,
                    status: status || 'UNKNOWN', // 'VOTED_ACCEPTED' | 'REJECTED'
                    letter: letter || '',
                    timestamp: new Date().toISOString()
                };

                // Store in Cloudflare KV if bound
                if (env && env.PAIRA_WORDS) {
                    await env.PAIRA_WORDS.put(`word:${logEntry.id}`, JSON.stringify(logEntry), {
                        expirationTtl: 60 * 60 * 24 * 30 // 30 days retention
                    });
                } else {
                    // Fallback to in-memory array
                    memoryLogs.unshift(logEntry);
                    if (memoryLogs.length > 500) memoryLogs.pop();
                }

                return new Response(JSON.stringify({ success: true, entry: logEntry }), {
                    status: 200,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                });
            }
        }

        // GET /api/words - Fetch all logged words for admin review
        if (request.method === 'GET' && url.pathname === '/api/words') {
            try {
                let logs = [];
                if (env && env.PAIRA_WORDS) {
                    const list = await env.PAIRA_WORDS.list({ prefix: 'word:' });
                    for (const key of list.keys) {
                        const val = await env.PAIRA_WORDS.get(key.name);
                        if (val) logs.push(JSON.parse(val));
                    }
                } else {
                    logs = memoryLogs;
                }

                return new Response(JSON.stringify({ count: logs.length, words: logs }), {
                    status: 200,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                });
            }
        }

        return new Response(JSON.stringify({ message: 'Paira Games Worker Running' }), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
    }
};
