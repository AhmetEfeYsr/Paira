from playwright.sync_api import sync_playwright

def verify_changes(page):
    # 1. Host olarak bağlan
    page.goto("http://localhost:8080/Tabu/index.html")

    # Kullanıcı adı gir ve odayı kur
    page.fill("#username-input", "HostUser")
    page.click("#btn-host")

    # Oyun lobisinin yüklendiğini bekle (Oda kodu vs. görünmeli)
    page.wait_for_selector("#display-room-code", timeout=5000)

    # Oda çıkış butonunun (Lobi) varlığını kontrol et
    page.wait_for_selector("#btn-leave-lobby", state="visible")
    print("btn-leave-lobby bulundu.")

    # Screenshot al
    page.screenshot(path="verification_lobby.png")
    print("Lobi screenshot alındı: verification_lobby.png")

    # Ayarları yapıp oyunu başlatabilmek için en az 2 kişi gerekiyor ama mock/test amaçlı
    # UI'da çıkış butonunun ve kick butonunun yerini görmek yeterli.

    # Çıkış butonuna bas
    page.click("#btn-leave-lobby")

    # Index sayfasına geri döndüğünü kontrol et
    page.wait_for_selector("#btn-host", timeout=5000)
    print("Çıkış işlemi başarılı, index sayfasına dönüldü.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_changes(page)
        except Exception as e:
            print(f"Hata oluştu: {e}")
        finally:
            browser.close()
