/**
 * Kick Cloud Function Endpoint (TLS Fingerprint Edition)
 *
 * Google Cloud Function (Node.js) to fetch Kick channel data
 * and bypass Cloudflare blocks using TLS fingerprinting (`got-scraping`).
 * his approach is extremely lightweight compared to running a headless browser.
 *
 * Deployment (Google Cloud Functions):
 * 1. Deploy using Google Cloud Console or gcloud CLI.
 *    (Default memory 256MB is more than enough).
 */

const { gotScraping } = require('got-scraping');

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

    try {
        const url = `https://kick.com/api/v1/channels/${channel}`;

        // got-scraping automatically handles TLS fingerprinting and header rotation
        // to mimic a real browser (Chrome/Firefox/Safari) and bypass Cloudflare WAF/Bot Management.
        const response = await gotScraping({
            url: url,
            responseType: 'json',
            // Setting a header generator to mimic a realistic browser request
            headerGeneratorOptions: {
                browsers: [{ name: 'chrome', minVersion: 110 }],
                devices: ['desktop'],
                locales: ['en-US', 'en'],
                operatingSystems: ['windows', 'macos']
            }
        });

        const data = response.body;

        if (!data || !data.chatroom) {
            return res.status(404).json({ error: 'Channel or chatroom not found. It might be blocked by Cloudflare or invalid channel name.' });
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

        res.status(200).json({
            channel: channel,
            chatroom_id: chatroomId,
            pusher_key: pusherKey,
            pusher_cluster: pusherCluster
        });

    } catch (error) {
        console.error('Error fetching Kick channel:', error.message);
        res.status(500).json({
            error: 'Failed to fetch channel data due to network or Cloudflare blocking.',
            details: error.response ? error.response.body : error.message
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
