from playwright.sync_api import sync_playwright
import time
import os

def verify_tabu_fallback():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # We simulate 2 players to start a game in Tabu
        context1 = browser.new_context()
        page1 = context1.new_page()

        context2 = browser.new_context()
        page2 = context2.new_page()

        # Player 1 creates game
        page1.goto("http://localhost:8000/Tabu/index.html")
        page1.fill("#username-input", "HostPlayer")
        page1.click("#btn-host")

        time.sleep(1) # Wait for redirection to game.html

        # Wait for PeerJS connection and room code to be generated
        page1.wait_for_selector("#display-room-code", state="attached", timeout=10000)

        # Click the cookie consent banner to dismiss it
        try:
            page1.get_by_text("Anladım").click(timeout=1000)
        except Exception:
            pass

        # Click the reveal code button to make it visible
        page1.click("#btn-toggle-code")

        time.sleep(1)
        room_code = page1.locator("#display-room-code").inner_text()
        print(f"Room code: {room_code}")

        # Player 2 joins game
        page2.goto("http://localhost:8000/Tabu/index.html")
        page2.fill("#username-input", "GuestPlayer")
        page2.fill("#room-code-input", room_code)
        page2.click("#btn-join")

        time.sleep(2) # Wait for join

        # Start game
        page1.click("#btn-start-game")
        time.sleep(1) # wait for start

        # Someone is narrator. Both must be able to see the word if narrator, but wait. The game waits for "Narrator Ready".
        # Click start narrator for whoever has it visible.
        if page1.locator("#btn-start-narrating").is_visible():
            page1.click("#btn-start-narrating")
        elif page2.locator("#btn-start-narrating").is_visible():
            page2.click("#btn-start-narrating")

        time.sleep(1)

        # Take a screenshot to verify fallback word keys are correct
        os.makedirs("/home/jules/verification", exist_ok=True)
        page1.screenshot(path="/home/jules/verification/tabu_game.png")
        print("Screenshot saved to /home/jules/verification/tabu_game.png")

        browser.close()

if __name__ == "__main__":
    verify_tabu_fallback()
