const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    console.log("Navigating to index...");
    await page.goto('http://localhost:8080/index.html');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'home.png' });
    console.log("Screenshot saved: home.png");

    console.log("Navigating to CizimZinciri...");
    await page.goto('http://localhost:8080/CizimZinciri/index.html');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'cizimzinciri.png' });
    console.log("Screenshot saved: cizimzinciri.png");

    await browser.close();
})();
