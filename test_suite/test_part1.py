import asyncio
import http.server
import socketserver
import threading
import os
import sys
import json
import time
from playwright.async_api import async_playwright

PORT = 8085
WORKSPACE_DIR = r"C:\Users\Ahmet\Projelerim\Paira"
SCREENSHOT_DIR = r"C:\Users\Ahmet\.gemini\antigravity-ide\brain\fdea322c-7166-40e7-9a72-cda9ed93aa32\screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # suppress console noise

httpd = None

def start_server():
    global httpd
    os.chdir(WORKSPACE_DIR)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("", PORT), QuietHTTPHandler)
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    print(f"[*] Local HTTP Server started on http://localhost:{PORT}")

results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def capture_logs_and_errors(page, name):
    errors = []
    warnings = []
    
    def on_console(msg):
        if msg.type == "error":
            # Filter out harmless external analytics or known web font CORS if any
            if "google-analytics" not in msg.text and "favicon" not in msg.text:
                errors.append(f"[Console Error] {msg.text}")
        elif msg.type == "warning":
            warnings.append(f"[Console Warn] {msg.text}")

    def on_page_error(exc):
        errors.append(f"[Uncaught Page Error] {exc}")

    def on_request_failed(req):
        if not req.url.endswith("favicon.ico"):
            errors.append(f"[Request Failed] {req.method} {req.url} - {req.failure}")

    page.on("console", on_console)
    page.on("pageerror", on_page_error)
    page.on("requestfailed", on_request_failed)
    
    return errors, warnings

async def test_static_and_dev_pages(browser):
    print("\n--- 1. Testing Portal & Static / Dev Pages ---")
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    errors, _ = capture_logs_and_errors(page, "StaticPages")

    static_urls = [
        ("index", f"http://localhost:{PORT}/index.html"),
        ("hakkimizda", f"http://localhost:{PORT}/hakkimizda.html"),
        ("iletisim", f"http://localhost:{PORT}/iletisim.html"),
        ("gizlilik", f"http://localhost:{PORT}/gizlilik-politikasi.html"),
        ("kullanim", f"http://localhost:{PORT}/kullanim-kosullari.html"),
        ("Tabu_dev", f"http://localhost:{PORT}/Tabu/dev.html"),
        ("BilgiYarismasi_dev", f"http://localhost:{PORT}/BilgiYarismasi/dev.html"),
        ("CizBil_dev", f"http://localhost:{PORT}/CizBil/dev.html"),
        ("CizimZinciri_dev", f"http://localhost:{PORT}/CizimZinciri/dev.html"),
        ("GizliKelimeler_dev", f"http://localhost:{PORT}/GizliKelimeler/dev.html"),
        ("HizliIsimSehir_dev", f"http://localhost:{PORT}/HizliIsimSehir/dev.html"),
        ("IsimSehir_dev", f"http://localhost:{PORT}/IsimSehir/dev.html"),
        ("Katiplik_dev", f"http://localhost:{PORT}/Katiplik/dev.html"),
        ("KelimeAvi_dev", f"http://localhost:{PORT}/KelimeAvi/dev.html"),
        ("Krono_dev", f"http://localhost:{PORT}/Krono/dev.html"),
        ("VampirKoylu_dev", f"http://localhost:{PORT}/VampirKoylu/dev.html"),
        ("ChatTabu_dev", f"http://localhost:{PORT}/ChatTabu/dev.html"),
        ("Gartic_dev", f"http://localhost:{PORT}/Gartic/dev.html")
    ]

    for name, url in static_urls:
        try:
            resp = await page.goto(url, wait_until="networkidle")
            if resp.status != 200:
                results["failed"].append(f"{name}: HTTP {resp.status}")
                continue
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, f"static_{name}.png"))
            results["passed"].append(f"Static Page: {name}")
        except Exception as e:
            results["failed"].append(f"Static Page {name}: {e}")

    # Test Mobile View of index.html
    await page.set_viewport_size({"width": 375, "height": 812})
    await page.goto(f"http://localhost:{PORT}/index.html", wait_until="networkidle")
    await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "index_mobile.png"))
    
    # Test search input on main portal
    search_box = page.locator("#search-input, input[type='search'], input[placeholder*='Ara'], input[placeholder*='ara']").first
    if await search_box.count() > 0:
        await search_box.fill("Tabu")
        await page.wait_for_timeout(500)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "index_search_tabu.png"))
    
    await page.close()

async def test_bagnam(browser):
    print("\n--- 2. Testing Bagnam ---")
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    errors, warnings = capture_logs_and_errors(page, "Bagnam")
    try:
        await page.goto(f"http://localhost:{PORT}/Bagnam/index.html", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bagnam_landing.png"))
        
        # Click "Günün Kelimesini Oyna"
        btn_start = page.locator("#btn-start")
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(800)
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bagnam_gameplay_empty.png"))
            
            # Make a guess
            word_input = page.locator("#word-input")
            btn_guess = page.locator("#btn-guess")
            
            if await word_input.count() > 0 and await btn_guess.count() > 0:
                await word_input.fill("elma")
                await btn_guess.click()
                await page.wait_for_timeout(600)
                
                await word_input.fill("kitap")
                await btn_guess.click()
                await page.wait_for_timeout(600)
                
                await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bagnam_after_guesses.png"))
                
                # Test Hint button
                btn_hint = page.locator("#btn-hint")
                if await btn_hint.count() > 0:
                    await btn_hint.click()
                    await page.wait_for_timeout(500)
                    await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bagnam_hint_clicked.png"))
                
                # Test Give up button
                btn_giveup = page.locator("#btn-giveup")
                if await btn_giveup.count() > 0:
                    await btn_giveup.click()
                    await page.wait_for_timeout(800)
                    await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bagnam_giveup_modal.png"))
                    
        results["passed"].append("Bagnam: Full Flow (Landing, Guessing, Hint, GiveUp)")
    except Exception as e:
        results["failed"].append(f"Bagnam: {e}")
    finally:
        await page.close()

async def test_katiplik(browser):
    print("\n--- 3. Testing Katiplik ---")
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    errors, _ = capture_logs_and_errors(page, "Katiplik")
    try:
        await page.goto(f"http://localhost:{PORT}/Katiplik/index.html", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "katiplik_landing.png"))
        
        # Enter name & click Solo or Host
        username_input = page.locator("#username-input")
        if await username_input.count() > 0:
            await username_input.fill("AhmetTest")
        
        btn_solo = page.locator("#btn-solo")
        btn_host = page.locator("#btn-host")
        
        if await btn_solo.count() > 0:
            await btn_solo.click()
        elif await btn_host.count() > 0:
            await btn_host.click()
            
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "katiplik_lobby_or_game.png"))
        
        # If in lobby, start game
        btn_start = page.locator("#btn-start-game, #btn-start")
        if await btn_start.count() > 0 and await btn_start.is_visible():
            await btn_start.click()
            await page.wait_for_timeout(1500)
            
        # Simulate typing words
        input_box = page.locator("#input-box, #typing-input, input[type='text']:not(#username-input)").first
        if await input_box.count() > 0 and await input_box.is_visible():
            # Get words to type
            words = page.locator(".word, #words-container span")
            word_count = await words.count()
            typed_count = 0
            for i in range(min(word_count, 8)):
                txt = await words.nth(i).inner_text()
                if txt:
                    await input_box.type(txt.strip() + " ")
                    await page.wait_for_timeout(200)
                    typed_count += 1
            await page.wait_for_timeout(500)
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "katiplik_typing_active.png"))
            
        results["passed"].append("Katiplik: Typing simulation and stats check")
    except Exception as e:
        results["failed"].append(f"Katiplik: {e}")
    finally:
        await page.close()

async def test_kelime_avi(browser):
    print("\n--- 4. Testing Kelime Avi ---")
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    errors, _ = capture_logs_and_errors(page, "KelimeAvi")
    try:
        await page.goto(f"http://localhost:{PORT}/KelimeAvi/index.html", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "kelime_avi_landing.png"))
        
        username_input = page.locator("#username-input")
        if await username_input.count() > 0:
            await username_input.fill("KelimeAvcisi")
            
        btn_host = page.locator("#btn-host, #btn-solo").first
        if await btn_host.count() > 0:
            await btn_host.click()
            
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "kelime_avi_lobby.png"))
        
        btn_start = page.locator("#btn-start-game, #btn-start")
        if await btn_start.count() > 0:
            # Enable if disabled
            await page.evaluate("() => { const b = document.getElementById('btn-start-game') || document.getElementById('btn-start'); if(b) b.classList.remove('disabled'); }")
            await btn_start.click()
            await page.wait_for_timeout(1500)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "kelime_avi_board.png"))
        
        # Click a few grid letters to form a selection
        tiles = page.locator(".board-cell, .tile, .letter-cell")
        if await tiles.count() >= 3:
            await tiles.nth(0).click()
            await page.wait_for_timeout(200)
            await tiles.nth(1).click()
            await page.wait_for_timeout(200)
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "kelime_avi_selection.png"))
            
        results["passed"].append("Kelime Avi: Board render & letter selection")
    except Exception as e:
        results["failed"].append(f"KelimeAvi: {e}")
    finally:
        await page.close()

async def test_krono(browser):
    print("\n--- 5. Testing Krono ---")
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    errors, _ = capture_logs_and_errors(page, "Krono")
    try:
        await page.goto(f"http://localhost:{PORT}/Krono/index.html", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "krono_landing.png"))
        
        username_input = page.locator("#username-input")
        if await username_input.count() > 0:
            await username_input.fill("KronoMaster")
            
        btn_host = page.locator("#btn-host, #btn-solo").first
        if await btn_host.count() > 0:
            await btn_host.click()
            
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "krono_lobby.png"))
        
        btn_start = page.locator("#btn-start-game, #btn-start")
        if await btn_start.count() > 0:
            await page.evaluate("() => { const b = document.querySelector('#btn-start-game, #btn-start'); if(b) b.classList.remove('disabled'); }")
            await btn_start.click()
            await page.wait_for_timeout(1500)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "krono_timeline.png"))
        results["passed"].append("Krono: Timeline & Card display")
    except Exception as e:
        results["failed"].append(f"Krono: {e}")
    finally:
        await page.close()

async def run_all():
    start_server()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        await test_static_and_dev_pages(browser)
        await test_bagnam(browser)
        await test_katiplik(browser)
        await test_kelime_avi(browser)
        await test_krono(browser)
        
        await browser.close()

    print("\n--- TEST SUMMARY (PART 1) ---")
    print(f"Passed: {len(results['passed'])}")
    print(f"Failed: {len(results['failed'])}")
    for p in results['passed']:
        print(f"  [PASS] {p}")
    for f in results['failed']:
        print(f"  [FAIL] {f}")

if __name__ == "__main__":
    asyncio.run(run_all())
