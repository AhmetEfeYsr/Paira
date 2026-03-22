const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const express = require('express');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const app = express();
const PORT = 3000;
const HOST = `http://localhost:${PORT}`;

app.use(express.static(path.join(__dirname)));

const MULTIPLAYER_GAMES = [
    'BilgiYarismasi', 'ChatTabu', 'CizBil', 'CizimZinciri', 'Gartic', 
    'GizliKelimeler', 'HizliIsimSehir', 'IsimSehir', 'Katiplik', 
    'KelimeAvi', 'Krono', 'Tabu'
];

async function runTests() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let server;
    
    console.log('Starting local server...');
    await new Promise((resolve) => {
        server = app.listen(PORT, () => {
            console.log(`Server running at ${HOST}`);
            resolve();
        });
    });

    const browser = await chromium.launch({ headless: true });
    const results = [];

    for (const game of MULTIPLAYER_GAMES) {
        console.log(`\n================================`);
        console.log(`   Testing Game: ${game}   `);
        console.log(`================================`);
        
        const context = await browser.newContext();
        let status = 'ERROR';
        let report = '';

        try {
            const p1 = await context.newPage();
            const p2 = await context.newPage();
            const p3 = await context.newPage(); // Some games like CizimZinciri need 3 players

            // Hide cookie banners forcefully
            await context.addInitScript(() => {
                const style = document.createElement('style');
                style.textContent = '.cookie-banner, #cookieBanner, .toast-container { display: none !important; pointer-events: none !important; visibility: hidden !important; z-index: -9999 !important; }';
                document.head.appendChild(style);
                
                setInterval(() => {
                    document.querySelectorAll('.cookie-banner, #cookieBanner').forEach(e => e.remove());
                }, 500);
            });

            // 1. LOGIN PHASE
            console.log(`[${game}] Logging in...`);
            await p1.goto(`${HOST}/${game}/index.html`);
            await p2.goto(`${HOST}/${game}/index.html`);
            await p3.goto(`${HOST}/${game}/index.html`);

            const p1HasUsername = await p1.locator('#username-input').count() > 0;
            const p1HasChannel = await p1.locator('#channel-input').count() > 0;
            const p1HasGameMode = await p1.locator('#game-mode-select').count() > 0;

            let isStreamerVsChat = false;

            const forceClick = async (page, selector) => {
                await page.waitForSelector(selector, { state: 'attached' });
                await page.$eval(selector, el => {
                    if(!el.disabled) el.click();
                });
            };

            if (p1HasUsername) {
                await p1.fill('#username-input', 'HostPlayer');
                await forceClick(p1, '#btn-host');
            } else if (p1HasChannel && p1HasGameMode) {
                // ChatTabu specific
                await p1.selectOption('#game-mode-select', 'streamer_vs_streamer');
                await p1.evaluate(() => document.getElementById('game-mode-select').dispatchEvent(new Event('change')));
                await p1.fill('#channel-input', 'testchannel_host');
                await forceClick(p1, '#btn-host');
            } else if (p1HasChannel && !p1HasGameMode) {
                // Gartic (ÇizBil Streamer vs Chat)
                isStreamerVsChat = true;
                await p1.fill('#channel-input', 'testchannel_host');
                await forceClick(p1, '#btn-start');
            } else {
                console.log(`[${game}] Unrecognized login screen. Skipping.`);
                throw new Error("Unrecognized login screen");
            }

            await p1.waitForURL(/game\.html/, { timeout: 10000 });
            await p1.waitForTimeout(1000);

            let roomCode = await p1.evaluate(() => sessionStorage.getItem('myId') || sessionStorage.getItem('roomCode'));
            if (!roomCode) roomCode = await p1.evaluate(() => sessionStorage.getItem('roomCode'));
            
            console.log(`[${game}] Room Code: ${roomCode}`);

            if (!isStreamerVsChat) {
                if (p1HasUsername) {
                    await p2.fill('#username-input', 'ClientPlayer2');
                    await p2.fill('#room-code-input', roomCode);
                    await forceClick(p2, '#btn-join');

                    await p3.fill('#username-input', 'ClientPlayer3');
                    await p3.fill('#room-code-input', roomCode);
                    await forceClick(p3, '#btn-join');
                } else if (p1HasChannel && p1HasGameMode) {
                    await p2.selectOption('#game-mode-select', 'streamer_vs_streamer');
                    await p2.evaluate(() => document.getElementById('game-mode-select').dispatchEvent(new Event('change')));
                    await p2.fill('#channel-input', 'testchannel_client2');
                    await p2.fill('#room-code-input', roomCode);
                    await forceClick(p2, '#btn-join');

                    await p3.selectOption('#game-mode-select', 'streamer_vs_streamer');
                    await p3.evaluate(() => document.getElementById('game-mode-select').dispatchEvent(new Event('change')));
                    await p3.fill('#channel-input', 'testchannel_client3');
                    await p3.fill('#room-code-input', roomCode);
                    await forceClick(p3, '#btn-join');
                }
                
                await p2.waitForURL(/game\.html/, { timeout: 10000 });
                await p3.waitForURL(/game\.html/, { timeout: 10000 }).catch(() => {});
            }

            // Wait for peers to connect
            console.log(`[${game}] Waiting 3s for WebRTC peer connection...`);
            await p1.waitForTimeout(3000);

            // 2. GAMEPLAY START PHASE
            console.log(`[${game}] Attempting to start the game...`);
            const startBtns = ['#btn-start', '#start-game-btn', '#btn-start-game', '.start-btn', '#start-btn'];
            for (const selector of startBtns) {
                if (await p1.locator(selector).count() > 0) {
                    const isDisabled = await p1.$eval(selector, el => el.disabled);
                    if (!isDisabled) {
                        await forceClick(p1, selector);
                        console.log(`[${game}] Clicked ${selector} to start game.`);
                        break;
                    }
                }
            }
            await p1.waitForTimeout(2000);

            // 3. INTERACTION PHASE (Drawing, Clicking, Typing)
            // We will inject some generic actions if elements are present.
            console.log(`[${game}] Performing generic interactions...`);
            
            // Check for canvas (Drawing games)
            const hasCanvas = await p1.locator('canvas').count() > 0;
            if (hasCanvas) {
                console.log(`[${game}] Canvas detected. Drawing...`);
                await p1.evaluate(() => {
                    const canvas = document.querySelector('canvas');
                    if(canvas) {
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = 'red';
                        ctx.fillRect(50, 50, 100, 100);
                        // Trigger events if the game listens to pointer events
                        canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 60 }));
                        canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 140 }));
                        canvas.dispatchEvent(new MouseEvent('mouseup'));
                    }
                });
                await p1.waitForTimeout(1000);
            }

            // Check for inputs (Word games)
            const inputs = await p1.locator('input[type="text"]').all();
            if (inputs.length > 0) {
                console.log(`[${game}] Text inputs detected. Typing...`);
                for (let i = 0; i < Math.min(inputs.length, 3); i++) {
                    if (await inputs[i].isVisible()) {
                        await inputs[i].fill('testword');
                        await inputs[i].press('Enter');
                    }
                }
            }

            // Check for answer buttons (Quiz games)
            const answerBtns = await p2.locator('.answer-btn, .option-btn, .choice').all();
            if (answerBtns.length > 0) {
                console.log(`[${game}] Options detected. Clicking...`);
                await p2.evaluate(() => {
                    const btn = document.querySelector('.answer-btn, .option-btn, .choice');
                    if(btn) btn.click();
                });
            }

            await p1.waitForTimeout(2000);

            // 4. VERIFICATION PHASE VIA GEMINI
            console.log(`[${game}] Taking screenshots and sending to Gemini...`);
            
            const ss1Path = path.join(__dirname, `ss_${game}_p1.png`);
            const ss2Path = path.join(__dirname, `ss_${game}_p2.png`);
            
            await p1.screenshot({ path: ss1Path, fullPage: true });
            await p2.screenshot({ path: ss2Path, fullPage: true });

            const p1Image = {
                inlineData: {
                    data: Buffer.from(fs.readFileSync(ss1Path)).toString("base64"),
                    mimeType: "image/png"
                }
            };
            
            const p2Image = {
                inlineData: {
                    data: Buffer.from(fs.readFileSync(ss2Path)).toString("base64"),
                    mimeType: "image/png"
                }
            };

            const prompt = `You are an expert Game QA Tester evaluating an end-to-end test of a multiplayer web game called '${game}'.
I have opened two browser windows:
Image 1: Host Player (Player 1)
Image 2: Client Player (Player 2)

We joined the lobby and attempted to start and interact with the game.
Analyze the screenshots and verify:
1. GAME STATE: Are they in the active game phase (not stuck in lobby or loading)?
2. SYNCHRONIZATION: 
   - Are the timers/clocks roughly matching on both screens?
   - If there is a score, is it visible on both?
   - If it's a drawing game (like CizBil/Gartic), does the drawing on the Host screen appear on the Client screen?
3. ERRORS: Are there any error messages, 'undefined' text, overlapping UI, or disconnection toast notifications?

Reply strictly in this format:
RESULT: PASS or FAIL
REASON: Detailed explanation covering sync, timers, scores, and UI health.`;

            let response;
            try {
                response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [prompt, p1Image, p2Image]
                });
            } catch (e) {
                console.log(`[${game}] Fallback to gemini-2.0-flash-exp due to error: ` + e.message);
                response = await ai.models.generateContent({
                    model: 'gemini-2.0-flash-exp',
                    contents: [prompt, p1Image, p2Image]
                });
            }

            const analysis = response.text;
            console.log(`[${game}] AI Analysis:\n${analysis}`);
            
            status = analysis.includes('RESULT: PASS') ? 'PASS' : 'FAIL';
            report = analysis;

        } catch (error) {
            console.error(`[${game}] Test failed with exception:`, error.message);
            status = 'ERROR';
            report = error.message;
        } finally {
            await context.close();
        }

        results.push({ game, status, report });
    }

    await browser.close();
    server.close();

    console.log('\n\n================================');
    console.log('       FINAL TEST REPORT        ');
    console.log('================================');
    results.forEach(r => {
        console.log(`\n[${r.game}] => ${r.status}`);
        if (r.status !== 'PASS') {
            console.log(`Reason: ${r.report.split('\n').slice(1).join('\n')}`);
        }
    });
    
    fs.writeFileSync(path.join(__dirname, 'advanced_test_report.json'), JSON.stringify(results, null, 2));
    console.log('\nReport saved to advanced_test_report.json');
}

runTests().catch(console.error);