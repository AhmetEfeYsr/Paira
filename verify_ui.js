const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:8080/');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'home.png' });

  await page.goto('http://localhost:8080/CizimZinciri/index.html');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'cizimzinciri.png' });

  await browser.close();
})();
