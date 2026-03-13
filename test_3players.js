const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();

    // 1. HOST
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();

    hostPage.on('console', msg => console.log('HOST LOG:', msg.text()));
    hostPage.on('pageerror', err => console.log('HOST ERROR:', err.message));

    await hostPage.goto('http://localhost:8080/KelimeAvi/index.html');
    await hostPage.fill('#username-input', 'HostPlayer');
    await hostPage.click('#btn-host');

    // Wait for the game lobby to load and room code to be generated
    await hostPage.waitForSelector('#display-room-code');
    // Wait for the host code to be fully visible and generated
    await hostPage.waitForTimeout(2000);
    const roomCode = await hostPage.evaluate(() => {
        return document.getElementById('display-room-code').dataset.code;
    });

    console.log("Room Code generated:", roomCode);

    if(!roomCode) {
        console.log("Room code is empty! Exiting...");
        await browser.close();
        return;
    }

    // 2. CLIENT 1
    const client1Context = await browser.newContext();
    const client1Page = await client1Context.newPage();
    client1Page.on('console', msg => console.log('CLIENT1 LOG:', msg.text()));
    client1Page.on('pageerror', err => console.log('CLIENT1 ERROR:', err.message));

    await client1Page.goto('http://localhost:8080/KelimeAvi/index.html');
    await client1Page.fill('#username-input', 'Client1');
    await client1Page.fill('#room-code-input', roomCode);
    await client1Page.click('#btn-join');
    await client1Page.waitForTimeout(3000); // give enough time to join via peerjs

    // 3. CLIENT 2
    const client2Context = await browser.newContext();
    const client2Page = await client2Context.newPage();
    client2Page.on('console', msg => console.log('CLIENT2 LOG:', msg.text()));
    client2Page.on('pageerror', err => console.log('CLIENT2 ERROR:', err.message));

    await client2Page.goto('http://localhost:8080/KelimeAvi/index.html');
    await client2Page.fill('#username-input', 'Client2');
    await client2Page.fill('#room-code-input', roomCode);
    await client2Page.click('#btn-join');
    await client2Page.waitForTimeout(3000);

    console.log("Checking player count on Host...");
    const playerCount = await hostPage.evaluate(() => {
        return Object.keys(window.gameApp.state.players).length;
    });
    console.log("Total players in room:", playerCount);

    console.log("Host clicking 'Oyunu Başlat'...");
    await hostPage.click('#btn-start-game');

    await hostPage.waitForTimeout(2000);

    const hostStatus = await hostPage.evaluate(() => window.gameApp.state.status);
    console.log("Game Status after clicking Start:", hostStatus);

    await browser.close();
})();
