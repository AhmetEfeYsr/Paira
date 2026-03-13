const https = require('https');

async function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'PairaGames/1.0'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON'));
                    }
                } else {
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

async function testWikiMovie(query) {
    const wikiUrl = `https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=5&origin=*`;
    try {
        const wikiData = await fetchJSON(wikiUrl);
        let found = false;
        if (wikiData.query && wikiData.query.search) {
            for (let item of wikiData.query.search) {
                const snippet = item.snippet.toLowerCase();
                const title = item.title.toLowerCase();
                // Check if title has the query, or if it's highly relevant.
                // Sometimes Wikipedia title is "Kardeş Payı (dizi)"
                if ((title.includes(query.toLowerCase()) || snippet.includes(query.toLowerCase())) &&
                    (snippet.includes('dizi') || snippet.includes('film') || snippet.includes('sinema') || snippet.includes('televizyon') || title.includes('dizi') || title.includes('film'))) {
                    found = true;
                    break;
                }
            }
        }
        console.log(`Wiki TR Media "${query}":`, found);
    } catch (e) { console.error(e.message); }
}

async function testWikiMusic(query) {
    const wikiUrl = `https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=5&origin=*`;
    try {
        const wikiData = await fetchJSON(wikiUrl);
        let found = false;
        if (wikiData.query && wikiData.query.search) {
            for (let item of wikiData.query.search) {
                const snippet = item.snippet.toLowerCase();
                const title = item.title.toLowerCase();

                if ((title.includes(query.toLowerCase()) || snippet.includes(query.toLowerCase())) &&
                    (snippet.includes('şarkı') || snippet.includes('albüm') || snippet.includes('müzik') || snippet.includes('tekli') || title.includes('şarkı') || title.includes('albüm'))) {
                    found = true;
                    break;
                }
            }
        }
        console.log(`Wiki TR Music "${query}":`, found);
    } catch (e) { console.error(e.message); }
}


async function run() {
    await testWikiMovie('kardeş payı');
    await testWikiMovie('şaban oğlu şaban');
    await testWikiMovie('gibi');
    await testWikiMovie('leyla ile mecnun');
    await testWikiMovie('yaprak dökümü');

    await testWikiMusic('dudu');
    await testWikiMusic('gülpembe');
    await testWikiMusic('arıza');
}
run();
