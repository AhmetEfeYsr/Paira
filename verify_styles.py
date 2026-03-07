from playwright.sync_api import sync_playwright

def verify_theme_colors():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Go to root index.html
        page.goto('http://localhost:8000/index.html')
        page.wait_for_load_state('networkidle')

        print("Testing initial theme (paira)...")
        # Check initial theme body background to be the deep color
        body_bg = page.evaluate("window.getComputedStyle(document.body).getPropertyValue('color')")
        print(f"Body color: {body_bg}")

        # Check footer background
        footer = page.locator('.app-footer')
        footer_bg = footer.evaluate("el => window.getComputedStyle(el).backgroundColor")
        print(f"Footer background (paira theme): {footer_bg}")

        # Change theme to light
        print("Switching theme to light...")
        page.select_option('#theme-select', 'light')
        page.wait_for_timeout(500) # Wait for UI update

        # Check footer background again
        footer_bg_light = footer.evaluate("el => window.getComputedStyle(el).backgroundColor")
        print(f"Footer background (light theme): {footer_bg_light}")

        # Text colors
        footer_text = page.locator('.footer-text')
        text_color = footer_text.evaluate("el => window.getComputedStyle(el).color")
        print(f"Footer text color (light theme): {text_color}")

        browser.close()

if __name__ == '__main__':
    verify_theme_colors()
