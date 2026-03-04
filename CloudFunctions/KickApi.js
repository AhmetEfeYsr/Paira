/**
 * Kick Cloud Function Endpoint
 *
 * Google Cloud Function (Node.js) or AWS Lambda example to fetch Kick channel data
 * and bypass Cloudflare blocks.
 *
 * Deployment:
 * 1. Initialize a Node.js project (npm init -y)
 * 2. Install dependencies: npm install cloudscraper express cors
 * 3. Deploy to Google Cloud Functions or run as a simple Express server.
 */

const cloudscraper = require('cloudscraper');

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

        // Use cloudscraper to bypass basic Cloudflare checks
        const responseString = await cloudscraper.get(url);
        const data = JSON.parse(responseString);

        if (!data || !data.chatroom) {
            return res.status(404).json({ error: 'Channel or chatroom not found.' });
        }

        const chatroomId = data.chatroom.id;

        // Extract pusher info from the response or use known defaults if Kick moves it
        // Note: Sometimes Kick removes pusher cluster info from v1 endpoint,
        // default to 'us2' and key '32cbd69e4b950bf97679' if missing.
        let pusherCluster = 'us2';
        let pusherKey = '32cbd69e4b950bf97679';

        // Attempt to dynamically fetch if available in future API updates
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
        console.error('Error fetching Kick channel:', error);
        res.status(500).json({
            error: 'Failed to fetch channel data due to network or Cloudflare blocking.',
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
