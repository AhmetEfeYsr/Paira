import time
import os
from playwright.sync_api import sync_playwright

def verify_frontend():
    os.makedirs("/home/jules/verification", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Tabu sayfasının en altını görmek için biraz daha uzun bir ekran resmi
        page = browser.new_page(viewport={'width': 1200, 'height': 1200})

        page.goto("http://localhost:8080/Tabu/index.html")
        page.wait_for_selector('.rules-grid')
        # Rules gridin resmini al
        page.locator('.seo-rules-container').screenshot(path="/home/jules/verification/tabu_rules.png")

        # Elementler
        page.goto("http://localhost:8080/Elementler/index.html")
        page.wait_for_selector('.rules-grid')
        page.locator('.seo-rules-container').screenshot(path="/home/jules/verification/elementler_rules.png")

        # Elementler tam ekran resmini al, ortalama doğrusu kontrolü
        page.screenshot(path="/home/jules/verification/elementler_full.png")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
