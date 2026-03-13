import asyncio
from playwright.async_api import async_playwright
import time
import subprocess
import os

async def main():
    server_process = subprocess.Popen(["python3", "-m", "http.server", "8081"])
    time.sleep(1)

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()

            # Set session storage required to bypass login
            await page.goto("http://localhost:8081/index.html")
            await page.evaluate("""() => {
                sessionStorage.setItem('isHost', 'true');
                sessionStorage.setItem('roomCode', '1234');
                sessionStorage.setItem('username', 'TestHost');
                sessionStorage.setItem('myId', 'host-123');
            }""")

            # Navigate to the game page
            await page.goto("http://localhost:8081/HizliIsimSehir/game.html")
            await page.wait_for_load_state('networkidle')

            # Inject mock state to force it to render the game layout
            await page.evaluate("""() => {
                // Ensure UI is visible
                document.querySelectorAll('.view-state').forEach(el => el.classList.add('hidden'));
                document.getElementById('game-screen').classList.remove('hidden');
                document.getElementById('game-screen').classList.add('active');

                // Create minimal mock data inside the app's variables via DOM manipulation if needed
                // Better: simulate network event
                window.network = window.network || { players: {} };
                window.network.players = {
                    'p1': { id: 'p1', name: 'TestHost', isHost: true, score: 0 },
                    'p2': { id: 'p2', name: 'Player2', score: 10 },
                    'p3': { id: 'p3', name: 'Player3', score: 20 },
                    'p4': { id: 'p4', name: 'Player4', score: 30 }
                };
                window.network.myId = 'p1';

                // We simulate an event being received
                window.dispatchEvent(new CustomEvent('test-start-game'));

                // Directly manipulate the DOM to test the layout visually
                document.getElementById('current-letter').textContent = 'K';
                document.getElementById('current-category-name').textContent = 'Hayvan';
                document.getElementById('timer-display').textContent = '00:15';

                const playersCircle = document.getElementById('players-circle');
                playersCircle.innerHTML = '';

                const playersArr = Object.values(window.network.players);
                const rx = 40;
                const ry = 38;
                const startAngle = 180;

                playersArr.forEach((p, index) => {
                    const node = document.createElement('div');
                    const isActive = index === 0;
                    node.className = `player-node ${isActive ? 'active-turn' : ''}`;

                    const angle = startAngle + (index * (360 / playersArr.length));
                    const rad = angle * (Math.PI / 180);

                    const x = Math.cos(rad) * rx;
                    const y = Math.sin(rad) * ry;

                    node.style.left = `calc(50% + ${x}%)`;
                    node.style.top = `calc(50% + ${y}%)`;

                    node.innerHTML = `
                        <div class="node-avatar">👽</div>
                        <div class="node-name">${p.name}</div>
                        <div class="node-score">${p.score}</div>
                    `;
                    playersCircle.appendChild(node);
                });
            }""")

            # Wait to render and capture screenshot
            await page.wait_for_timeout(500)
            await page.screenshot(path="isimsehir_circular_test2.png", full_page=True)
            await browser.close()
    finally:
        server_process.terminate()

if __name__ == "__main__":
    asyncio.run(main())
