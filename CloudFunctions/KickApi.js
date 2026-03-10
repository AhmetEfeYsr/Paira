/**
 * Kick Cloud Function Endpoint (Puppeteer Stealth Edition)
 *
 * Google Cloud Function (Node.js) example to fetch Kick channel data
 * and bypass Cloudflare blocks using Headless Chrome and Stealth Plugin.
 *
 * Deployment (Google Cloud Functions):
 * 1. This folder contains a package.json.
 * 2. Deploy using Google Cloud Console or gcloud CLI.
 *    (Ensure to allocate at least 1GB - 2GB of memory for Headless Chrome).
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/**
 * HTTP Cloud Function.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
exports.getKickInfo = async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    const channel = req.query.channel;

    if (!channel) {
        return res.status(400).json({ error: 'Channel name is required as a query parameter (?channel=pairaaa)' });
    }

    let browser = null;
    try {
        const url = `https://kick.com/api/v1/channels/${channel}`;

        // Launch puppeteer in headless mode, optimized for Cloud Functions
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();

        // Emulate a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        // Go to the API endpoint. We use waitUntil 'networkidle2' or 'domcontentloaded'
        // Since it's a JSON response, 'domcontentloaded' is usually enough, but we want
        // to bypass the Cloudflare challenge page if it appears.
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait briefly just in case Cloudflare JS challenge is resolving
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get the content of the page (which should be the JSON text wrapped in <pre> tags or just plain text)
        const content = await page.evaluate(() => {
            const pre = document.querySelector('pre');
            return pre ? pre.textContent : document.body.innerText;
        });

        let data = null;
        try {
            data = JSON.parse(content);
        } catch (e) {
            if (browser) await browser.close();
            return res.status(503).json({ error: 'Failed to parse JSON. Might be stuck on Cloudflare challenge.', raw_response: content.substring(0, 100) });
        }

        if (!data || !data.chatroom) {
            if (browser) await browser.close();
            return res.status(404).json({ error: 'Channel or chatroom not found. It might be blocked by Cloudflare or invalid channel name.', raw_response: content.substring(0, 100) });
        }

        const chatroomId = data.chatroom.id;

        // Pusher Key and Cluster extraction strategy:
        // 1. Try to get it from the API response directly (Kick sometimes adds it back)
        // 2. Fallback to hardcoded known values (currently active for Kick)

        let pusherCluster = 'us2';
        let pusherKey = '32cbd69e4b950bf97679';

        if (data.pusher_key && data.pusher_cluster) {
            pusherKey = data.pusher_key;
            pusherCluster = data.pusher_cluster;
        }

        if (browser) await browser.close();

        res.status(200).json({
            channel: channel,
            chatroom_id: chatroomId,
            pusher_key: pusherKey,
            pusher_cluster: pusherCluster
        });

    } catch (error) {
        if (browser) {
            await browser.close().catch(e => console.error('Error closing browser:', e));
        }
        console.error('Error fetching Kick channel:', error);
        res.status(500).json({
            error: 'Failed to fetch channel data due to network, Cloudflare blocking, or parsing error.',
            details: error.message
        });
    }
};

/*
// ------------------------------------------------------------------
// Local Testing with Express (Uncomment to test locally)
// ------------------------------------------------------------------
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

app.get('/getKickInfo', (req, res) => {
    exports.getKickInfo(req, res);
});

const PORT = process.env.PORT || 8080;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Kick API Proxy running on port ${PORT}`);
        console.log(`Test: http://localhost:${PORT}/getKickInfo?channel=pairaaa`);
    });
}
*/
