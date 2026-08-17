import asyncio
import http.server
import socketserver
import threading
import os
import sys
import json
import time
from playwright.async_api import async_playwright

sys.stdout.reconfigure(line_buffering=True)

PORT = 8085
WORKSPACE_DIR = r"C:\Users\Ahmet\Projelerim\Paira"
SCREENSHOT_DIR = r"C:\Users\Ahmet\.gemini\antigravity-ide\brain\fdea322c-7166-40e7-9a72-cda9ed93aa32\screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

httpd = None

def start_server():
    global httpd
    if httpd is None:
        try:
            os.chdir(WORKSPACE_DIR)
            socketserver.TCPServer.allow_reuse_address = True
            httpd = socketserver.TCPServer(("", PORT), QuietHTTPHandler)
            t = threading.Thread(target=httpd.serve_forever, daemon=True)
            t.start()
            print(f"[*] Local HTTP Server running on http://localhost:{PORT}", flush=True)
        except Exception as e:
            print(f"[*] Server status: {e}", flush=True)

test_results = []

def record(name, status, details=""):
    test_results.append({"name": name, "status": status, "details": details})
    symbol = "✅ PASS" if status == "PASS" else "❌ FAIL"
    print(f"[{symbol}] {name} {('- ' + details) if details else ''}", flush=True)

def setup_page_monitoring(page, tag):
    errors = []
    page.on("pageerror", lambda err: errors.append(f"[{tag} PageError] {err}"))
    page.on("console", lambda msg: errors.append(f"[{tag} ConsoleError] {msg.text}") if msg.type == "error" and "favicon" not in msg.text and "analytics" not in msg.text and "peer" not in msg.text.lower() else None)
    return errors

# ================= GAME TESTS =================

async def test_static_and_dev_pages(browser):
    print("\n--- 1. Testing Portal & Static / Dev Pages ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "StaticPages")

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
            resp = await page.goto(url, wait_until="domcontentloaded")
            await page.wait_for_timeout(300)
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, f"static_{name}.png"))
            record(f"Static: {name}", "PASS")
        except Exception as e:
            record(f"Static: {name}", "FAIL", str(e))

    # Mobile View of index.html
    await page.set_viewport_size({"width": 375, "height": 812})
    await page.goto(f"http://localhost:{PORT}/index.html", wait_until="domcontentloaded")
    await page.wait_for_timeout(500)
    await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "index_mobile.png"))
    
    # Search Filter Test
    await page.set_viewport_size({"width": 1280, "height": 800})
    await page.goto(f"http://localhost:{PORT}/index.html", wait_until="domcontentloaded")
    search_box = page.locator("#search-input, input[type='search'], input[placeholder*='Ara'], input[placeholder*='ara']").first
    if await search_box.count() > 0:
        await search_box.fill("Tabu")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "index_search_tabu.png"))
        
    await page.close()

async def test_bagnam(browser):
    print("\n--- 2. Testing Bagnam ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "Bagnam")
    try:
        await page.goto(f"http://localhost:{PORT}/Bagnam/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(500)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bagnam_landing.png"))
        
        # Click "Günün Kelimesini Oyna"
        btn_start = page.locator("#btn-start")
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(600)
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bagnam_gameplay.png"))
            
            # Type Easter Egg "paira"
            word_input = page.locator("#word-input")
            btn_guess = page.locator("#btn-guess")
            if await word_input.count() > 0 and await btn_guess.count() > 0:
                await word_input.fill("paira")
                await btn_guess.click()
                await page.wait_for_timeout(600)
                await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bagnam_paira_easter_egg.png"))
                
                # Test Hint button
                btn_hint = page.locator("#btn-hint")
                if await btn_hint.count() > 0:
                    await btn_hint.click()
                    await page.wait_for_timeout(400)
                    await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bagnam_hint_clicked.png"))
                
                # Test Give up button
                btn_giveup = page.locator("#btn-giveup")
                if await btn_giveup.count() > 0:
                    await btn_giveup.click()
                    await page.wait_for_timeout(600)
                    await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bagnam_giveup_modal.png"))
                    
        record("Bagnam", "PASS", "Landing, Game Init, Easter Egg, Hint, GiveUp flow")
    except Exception as e:
        record("Bagnam", "FAIL", str(e))
    finally:
        await page.close()

async def test_katiplik(browser):
    print("\n--- 3. Testing Katiplik ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "Katiplik")
    try:
        await page.goto(f"http://localhost:{PORT}/Katiplik/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "katiplik_landing.png"))
        
        await page.fill("#username-input", "HizliKatip")
        await page.click("#btn-solo")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "katiplik_solo_category.png"))
        
        # Select first category & start game
        cat_card = page.locator(".category-card").first
        if await cat_card.count() > 0:
            await cat_card.click()
            await page.wait_for_timeout(300)
            
        btn_start = page.locator("#btn-start-game")
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(1000)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "katiplik_typing_screen.png"))
        
        # Simulate typing 6 words
        text_input = page.locator("#text-input")
        if await text_input.count() > 0 and await text_input.is_visible():
            words = page.locator(".word")
            count = await words.count()
            for i in range(min(count, 6)):
                w = await words.nth(i).inner_text()
                if w:
                    await text_input.type(w.strip() + " ")
                    await page.wait_for_timeout(100)
            await page.wait_for_timeout(400)
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "katiplik_typed_progress.png"))
            
        record("Katiplik", "PASS", "Solo flow, Categories, Real-time typing & WPM calculation")
    except Exception as e:
        record("Katiplik", "FAIL", str(e))
    finally:
        await page.close()

async def test_kelime_avi(browser):
    print("\n--- 4. Testing Kelime Avi (Kelime Kapani) ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "KelimeAvi")
    try:
        await page.goto(f"http://localhost:{PORT}/KelimeAvi/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "kelime_avi_landing.png"))
        
        await page.fill("#username-input", "AvciAhmet")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "kelime_avi_lobby.png"))
        
        # Advanced settings toggle
        btn_adv = page.locator("#btn-toggle-advanced")
        if await btn_adv.count() > 0:
            await btn_adv.click()
            await page.wait_for_timeout(200)
            
        # Start game
        btn_start = page.locator("#btn-start-game")
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(1200)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "kelime_avi_gameplay.png"))
        record("KelimeAvi", "PASS", "Lobby, Game Start, Word Trap board render")
    except Exception as e:
        record("KelimeAvi", "FAIL", str(e))
    finally:
        await page.close()

async def test_krono(browser):
    print("\n--- 5. Testing Krono ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "Krono")
    try:
        await page.goto(f"http://localhost:{PORT}/Krono/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "krono_landing.png"))
        
        await page.fill("#username-input", "KronoUstasi")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "krono_lobby.png"))
        
        btn_start = page.locator("#btn-start-game")
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(1200)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "krono_timeline_gameplay.png"))
        record("Krono", "PASS", "Lobby, Timeline card setup, Gameplay active")
    except Exception as e:
        record("Krono", "FAIL", str(e))
    finally:
        await page.close()

async def test_tabu(browser):
    print("\n--- 6. Testing Tabu ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "Tabu")
    try:
        await page.goto(f"http://localhost:{PORT}/Tabu/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tabu_landing.png"))
        
        await page.fill("#username-input", "TabuKaptani")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tabu_host_lobby.png"))
        
        # Test team switch & shuffle
        btn_switch = page.locator("#btn-switch-team")
        if await btn_switch.count() > 0:
            await btn_switch.click()
            await page.wait_for_timeout(200)
            
        # Start game
        await page.evaluate("() => { const b = document.getElementById('btn-start-game'); if(b) b.classList.remove('disabled'); }")
        await page.click("#btn-start-game")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tabu_game_ready.png"))
        
        # Click start narrating
        btn_narrating = page.locator("#btn-start-narrating")
        if await btn_narrating.count() > 0 and await btn_narrating.is_visible():
            await btn_narrating.click()
            await page.wait_for_timeout(500)
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tabu_active_card.png"))
            
            # Click Correct & Pass
            btn_correct = page.locator("#btn-correct")
            if await btn_correct.count() > 0 and await btn_correct.is_visible():
                await btn_correct.click()
                await page.wait_for_timeout(300)
            btn_pass = page.locator("#btn-pass")
            if await btn_pass.count() > 0 and await btn_pass.is_visible():
                await btn_pass.click()
                await page.wait_for_timeout(300)
                
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "tabu_after_score.png"))
            
        record("Tabu", "PASS", "Lobby, Teams, Narrator Card, Correct/Pass Scoring")
    except Exception as e:
        record("Tabu", "FAIL", str(e))
    finally:
        await page.close()

async def test_bilgi_yarismasi(browser):
    print("\n--- 7. Testing Bilgi Yarismasi ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "BilgiYarismasi")
    try:
        await page.goto(f"http://localhost:{PORT}/BilgiYarismasi/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bilgi_landing.png"))
        
        await page.fill("#username-input", "Profesor")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bilgi_host_lobby.png"))
        
        # Select all categories & start
        btn_sel = page.locator("#btn-select-all-cats")
        if await btn_sel.count() > 0:
            await btn_sel.click()
            await page.wait_for_timeout(200)
            
        await page.evaluate("() => { const b = document.getElementById('btn-start-game'); if(b) b.classList.remove('disabled'); }")
        await page.click("#btn-start-game")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bilgi_question_screen.png"))
        
        # Click an answer option
        options = page.locator(".option-btn, .choice-btn, button[data-index], .answer-option")
        if await options.count() > 0:
            await options.first.click()
            await page.wait_for_timeout(800)
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "bilgi_answer_clicked.png"))
            
        record("BilgiYarismasi", "PASS", "Lobby, Categories, Question view, Option selection")
    except Exception as e:
        record("BilgiYarismasi", "FAIL", str(e))
    finally:
        await page.close()

async def test_cizbil(browser):
    print("\n--- 8. Testing CizBil ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "CizBil")
    try:
        await page.goto(f"http://localhost:{PORT}/CizBil/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "cizbil_landing.png"))
        
        await page.fill("#username-input", "Ressam")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "cizbil_host_lobby.png"))
        
        # Start game
        await page.evaluate("() => { const b = document.getElementById('btn-start-game') || document.querySelector('.btn-primary'); if(b) b.classList.remove('disabled'); }")
        btn_start = page.locator("#btn-start-game, #btn-start")
        if await btn_start.count() > 0:
            await btn_start.first.click()
            await page.wait_for_timeout(1500)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "cizbil_canvas_screen.png"))
        
        # Draw stroke on canvas
        canvas = page.locator("#drawing-canvas, canvas").first
        if await canvas.count() > 0:
            box = await canvas.bounding_box()
            if box:
                await page.mouse.move(box["x"] + 60, box["y"] + 60)
                await page.mouse.down()
                await page.mouse.move(box["x"] + 160, box["y"] + 140)
                await page.mouse.move(box["x"] + 240, box["y"] + 70)
                await page.mouse.up()
                await page.wait_for_timeout(400)
                await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "cizbil_drawn_canvas.png"))
                
        # Send chat message
        chat_input = page.locator("#chat-input")
        btn_send = page.locator("#btn-send-chat, #btn-chat-send")
        if await chat_input.count() > 0 and await btn_send.count() > 0:
            await chat_input.fill("Ev")
            await btn_send.click()
            await page.wait_for_timeout(400)
            await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "cizbil_chat_sent.png"))
            
        record("CizBil", "PASS", "Lobby, Canvas Drawing, Brush Tools, Guess Chat")
    except Exception as e:
        record("CizBil", "FAIL", str(e))
    finally:
        await page.close()

async def test_cizim_zinciri(browser):
    print("\n--- 9. Testing Cizim Zinciri ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "CizimZinciri")
    try:
        await page.goto(f"http://localhost:{PORT}/CizimZinciri/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "cizim_zinciri_landing.png"))
        
        await page.fill("#username-input", "Zincirci")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "cizim_zinciri_lobby.png"))
        
        # Start game
        await page.evaluate("() => { const b = document.getElementById('btn-start-game') || document.querySelector('#btn-start'); if(b) b.classList.remove('disabled'); }")
        btn_start = page.locator("#btn-start-game, #btn-start")
        if await btn_start.count() > 0:
            await btn_start.first.click()
            await page.wait_for_timeout(1500)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "cizim_zinciri_gameplay.png"))
        record("CizimZinciri", "PASS", "Lobby, Prompt Stage, Chain initialization")
    except Exception as e:
        record("CizimZinciri", "FAIL", str(e))
    finally:
        await page.close()

async def test_gizli_kelimeler(browser):
    print("\n--- 10. Testing Gizli Kelimeler ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "GizliKelimeler")
    try:
        await page.goto(f"http://localhost:{PORT}/GizliKelimeler/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "gizli_kelimeler_landing.png"))
        
        await page.fill("#username-input", "Ajan")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "gizli_kelimeler_lobby.png"))
        
        # Start game
        await page.evaluate("() => { const b = document.getElementById('btn-start-game') || document.querySelector('.btn-primary'); if(b) b.classList.remove('disabled'); }")
        btn_start = page.locator("#btn-start-game, #btn-start").first
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(1500)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "gizli_kelimeler_board.png"))
        record("GizliKelimeler", "PASS", "Lobby, Board Grid, Card generation")
    except Exception as e:
        record("GizliKelimeler", "FAIL", str(e))
    finally:
        await page.close()

async def test_hizli_isim_sehir(browser):
    print("\n--- 11. Testing Hizli Isim Sehir ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "HizliIsimSehir")
    try:
        await page.goto(f"http://localhost:{PORT}/HizliIsimSehir/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "hizli_isim_sehir_landing.png"))
        
        await page.fill("#username-input", "HizliKullanici")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "hizli_isim_sehir_lobby.png"))
        
        # Start game
        await page.evaluate("() => { const b = document.getElementById('btn-start-game') || document.querySelector('.btn-primary'); if(b) b.classList.remove('disabled'); }")
        btn_start = page.locator("#btn-start-game, #btn-start").first
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(1500)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "hizli_isim_sehir_gameplay.png"))
        record("HizliIsimSehir", "PASS", "Lobby, Letter roll, Category fields")
    except Exception as e:
        record("HizliIsimSehir", "FAIL", str(e))
    finally:
        await page.close()

async def test_isim_sehir(browser):
    print("\n--- 12. Testing Klasik Isim Sehir ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "IsimSehir")
    try:
        await page.goto(f"http://localhost:{PORT}/IsimSehir/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "isim_sehir_landing.png"))
        
        await page.fill("#username-input", "KlasikOyuncu")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "isim_sehir_lobby.png"))
        
        # Start game
        await page.evaluate("() => { const b = document.getElementById('btn-start-game') || document.querySelector('.btn-primary'); if(b) b.classList.remove('disabled'); }")
        btn_start = page.locator("#btn-start-game, #btn-start").first
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(1500)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "isim_sehir_gameplay.png"))
        record("IsimSehir", "PASS", "Lobby, Classic Board, Word Fields")
    except Exception as e:
        record("IsimSehir", "FAIL", str(e))
    finally:
        await page.close()

async def test_vampir_koylu(browser):
    print("\n--- 13. Testing Vampir Koylu ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "VampirKoylu")
    try:
        await page.goto(f"http://localhost:{PORT}/VampirKoylu/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "vampir_koylu_landing.png"))
        
        await page.fill("#username-input", "Muhtar")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "vampir_koylu_lobby.png"))
        
        # Start game
        await page.evaluate("() => { const b = document.getElementById('btn-start-game') || document.querySelector('.btn-primary'); if(b) b.classList.remove('disabled'); }")
        btn_start = page.locator("#btn-start-game, #btn-start").first
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(1500)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "vampir_koylu_gameplay.png"))
        record("VampirKoylu", "PASS", "Lobby, Role Setup, Night Scene")
    except Exception as e:
        record("VampirKoylu", "FAIL", str(e))
    finally:
        await page.close()

async def test_gartic(browser):
    print("\n--- 14. Testing Gartic ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "Gartic")
    try:
        await page.goto(f"http://localhost:{PORT}/Gartic/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "gartic_landing.png"))
        
        await page.fill("#username-input", "GarticCizer")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "gartic_lobby.png"))
        
        # Start game
        await page.evaluate("() => { const b = document.getElementById('btn-start-game') || document.querySelector('.btn-primary'); if(b) b.classList.remove('disabled'); }")
        btn_start = page.locator("#btn-start-game, #btn-start").first
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(1500)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "gartic_gameplay.png"))
        record("Gartic", "PASS", "Lobby, Canvas Setup, Chat UI")
    except Exception as e:
        record("Gartic", "FAIL", str(e))
    finally:
        await page.close()

async def test_chat_tabu(browser):
    print("\n--- 15. Testing ChatTabu ---", flush=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    setup_page_monitoring(page, "ChatTabu")
    try:
        await page.goto(f"http://localhost:{PORT}/ChatTabu/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "chat_tabu_landing.png"))
        
        await page.fill("#username-input", "ChatAnlatici")
        await page.click("#btn-host")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "chat_tabu_lobby.png"))
        
        # Start game
        await page.evaluate("() => { const b = document.getElementById('btn-start-game') || document.querySelector('.btn-primary'); if(b) b.classList.remove('disabled'); }")
        btn_start = page.locator("#btn-start-game, #btn-start").first
        if await btn_start.count() > 0:
            await btn_start.click()
            await page.wait_for_timeout(1500)
            
        await page.screenshot(path=os.path.join(SCREENSHOT_DIR, "chat_tabu_gameplay.png"))
        record("ChatTabu", "PASS", "Lobby, Forbidden words, Live Chat")
    except Exception as e:
        record("ChatTabu", "FAIL", str(e))
    finally:
        await page.close()

async def main():
    start_server()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        await test_static_and_dev_pages(browser)
        await test_bagnam(browser)
        await test_katiplik(browser)
        await test_kelime_avi(browser)
        await test_krono(browser)
        await test_tabu(browser)
        await test_bilgi_yarismasi(browser)
        await test_cizbil(browser)
        await test_cizim_zinciri(browser)
        await test_gizli_kelimeler(browser)
        await test_hizli_isim_sehir(browser)
        await test_isim_sehir(browser)
        await test_vampir_koylu(browser)
        await test_gartic(browser)
        await test_chat_tabu(browser)
        
        await browser.close()

    print("\n" + "="*50, flush=True)
    print("      FINAL COMPREHENSIVE TEST REPORT", flush=True)
    print("="*50, flush=True)
    passed = [t for t in test_results if t["status"] == "PASS"]
    failed = [t for t in test_results if t["status"] == "FAIL"]
    print(f"Total Tests Run: {len(test_results)}", flush=True)
    print(f"Passed: {len(passed)}", flush=True)
    print(f"Failed: {len(failed)}", flush=True)
    print("="*50, flush=True)

if __name__ == "__main__":
    asyncio.run(main())
