from playwright.sync_api import sync_playwright
import time
import subprocess

# Start live server
server = subprocess.Popen(["python3", "-m", "http.server", "8080", "--directory", "."])
time.sleep(2) # Wait for server to start

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.goto("http://localhost:8080/Elementler/index.html")

    # Create room
    page.fill("#username-input", "HostAtes")
    page.click("#btn-host")

    time.sleep(3)

    # We need to test the 3-player tree! That is the complex one
    page.evaluate("""
        if (window.gameApp) {
            window.gameApp.state.players = {
                "p1": {name: "P1", element: "su"},
                "p2": {name: "P2", element: "ates"},
                "p3": {name: "P3", element: "toprak"}
            };
            window.gameApp.updateLevelSelectUI();
        }
    """)

    time.sleep(2)

    screenshot_path = "/home/jules/verification/elementler_fixed_tree.png"
    page.screenshot(path=screenshot_path)
    print(f"Screenshot saved to {screenshot_path}")

    browser.close()

# Stop live server
server.terminate()
