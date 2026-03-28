const { chromium } = require('playwright');
const path = require('path');

async function run() {
    // Edge user data path
    const userDataDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data');
    
    console.log('Launching Edge with user profile...');
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        channel: 'msedge',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browserContext.newPage();
    
    const url = 'https://console.cloud.google.com/iam-admin/quotas?project=precise-rune-465721-f3&metric=aiplatform.googleapis.com%2Fus_multi_region_online_prediction_requests_per_base_model';
    
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });

    // Wait for the page to load and check if logged in
    const title = await page.title();
    console.log(`Page title: ${title}`);

    if (title.includes('Sign in')) {
        console.log('Error: Not logged in. Please log in to Edge first.');
        await browserContext.close();
        return;
    }

    try {
        console.log('Searching for "Edit Quotas" button...');
        // This is a simplified attempt since selectors can change
        await page.click('button:has-text("Edit Quotas")');
        
        console.log('Filling form...');
        await page.fill('input[name="newLimit"]', '100');
        
        const justification = "Developing Paira Games (pairaaa.com). Claude 3 Opus (opus-4-6) is critical for our semantic word analysis in 'Bagnam' game and procedural content generation in our trivia games. The current 0 quota prevents us from deploying these features. We expect high peak traffic from influencers (Kick/Twitch) and need at least 100 RPM.";
        await page.fill('textarea', justification);
        
        console.log('Submitting...');
        await page.click('button:has-text("Submit")');
        
        console.log('Done! Request submitted.');
    } catch (e) {
        console.log('Error during form filling: ' + e.message);
        // Take a screenshot for debugging (though user can't see it easily)
        await page.screenshot({ path: 'quota_error.png' });
    }

    await browserContext.close();
}

run().catch(console.error);
