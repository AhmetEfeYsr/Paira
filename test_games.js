const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const express = require('express');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const app = express();
const PORT = 3000;
const HOST = `http://localhost:${PORT}`;

// Serve the 'Paira' directory
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
        console.log(`\n--- Testing ${game} ---`);
        const context = await browser.newContext();
        
        try {
            const page1 = await context.newPage();
            const page2 = await context.newPage();

            // Setup Player 1 (Host)
            console.log(`[${game}] Player 1 joining as Host...`);
            await page1.goto(`${HOST}/${game}/index.html`);
            await page1.fill('#username-input', 'Player1');
            await page1.click('#btn-host');
            await page1.waitForURL(/game\.html/);

            // Wait a bit and get Room Code
            await page1.waitForTimeout(1000);
            let roomCode = await page1.evaluate(() => sessionStorage.getItem('myId') || sessionStorage.getItem('roomCode'));
            
            if (!roomCode) {
                // Sometime generateRoomCode creates it later or it's named differently
                roomCode = await page1.evaluate(() => sessionStorage.getItem('roomCode'));
            }

            console.log(`[${game}] Room Code generated: ${roomCode}`);

            if (!roomCode) {
                throw new Error("Room code could not be found in sessionStorage.");
            }

            // Setup Player 2 (Client)
            console.log(`[${game}] Player 2 joining with Room Code...`);
            await page2.goto(`${HOST}/${game}/index.html`);
            await page2.fill('#username-input', 'Player2');
            await page2.fill('#room-code-input', roomCode);
            await page2.click('#btn-join');
            await page2.waitForURL(/game\.html/);

            // Wait for PeerJS connection
            console.log(`[${game}] Waiting for connection to establish...`);
            await page1.waitForTimeout(3000);
            await page2.waitForTimeout(3000);

            // Take Screenshots
            const ss1Path = path.join(__dirname, `ss_${game}_p1.png`);
            const ss2Path = path.join(__dirname, `ss_${game}_p2.png`);
            
            await page1.screenshot({ path: ss1Path });
            await page2.screenshot({ path: ss2Path });

            // Analyze with Gemini
            console.log(`[${game}] Sending screenshots to Gemini for analysis...`);
            
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

            const prompt = `You are an AI game tester verifying a multiplayer web game.
The game being tested is '${game}'. 
Image 1 is the Host (Player 1) view. Image 2 is the Client (Player 2) view.
Verify the following:
1. Both players should be in the game room/lobby.
2. The UI should render correctly without obvious errors or 'undefined' texts.
3. Player names (Player1, Player2) or participant counts should indicate both players are connected (if visible).
4. Look for error toasts, disconnection messages, or frozen states.

Start your response with 'PASS' if everything looks normal and connected.
Start your response with 'FAIL' if there are visual errors, disconnection, or failure to join the same room.
Then, provide a brief reason.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash', // Fallback
                contents: [prompt, p1Image, p2Image]
            }).catch(async (e) => {
                console.log(`[${game}] Fallback to gemini-2.5-pro or gemini-2.0-flash-exp due to error: ` + e.message);
                return await ai.models.generateContent({
                    model: 'gemini-2.0-flash-exp',
                    contents: [prompt, p1Image, p2Image]
                });
            });

            const analysis = response.text;
            console.log(`[${game}] Result: ${analysis.split('\n')[0]}`);
            
            results.push({
                game,
                status: analysis.startsWith('PASS') ? 'PASS' : 'FAIL',
                analysis
            });

        } catch (error) {
            console.error(`[${game}] Error during test:`, error.message);
            results.push({
                game,
                status: 'ERROR',
                error: error.message
            });
        } finally {
            await context.close();
        }
    }

    await browser.close();
    server.close();

    console.log('\n--- FINAL REPORT ---');
    results.forEach(r => {
        console.log(`\nGame: ${r.game} - ${r.status}`);
        if (r.error) console.log(`Error: ${r.error}`);
        if (r.analysis) console.log(`Analysis:\n${r.analysis}`);
    });
    
    // Save report to file
    fs.writeFileSync(path.join(__dirname, 'test_report.json'), JSON.stringify(results, null, 2));
    console.log('\nReport saved to test_report.json');
}

runTests().catch(console.error);
