import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Navigate to portal
        await page.goto("http://localhost:8000/")
        await page.wait_for_timeout(1000)

        # Set themes and screenshot
        themes = ['default', 'blue', 'green', 'light']
        for theme in themes:
            print(f"Setting theme: {theme}")
            await page.select_option('#theme-dropdown', value=theme)
            await page.wait_for_timeout(500)
            await page.screenshot(path=f"/home/jules/verification/theme_{theme}_portal.png")

        # Navigate to Aglam
        await page.goto("http://localhost:8000/Aglam/")
        await page.wait_for_timeout(1000)

        for theme in themes:
            print(f"Setting theme in Aglam: {theme}")
            await page.select_option('#theme-dropdown', value=theme)
            await page.wait_for_timeout(500)
            await page.screenshot(path=f"/home/jules/verification/theme_{theme}_aglam.png")

        await browser.close()

if __name__ == "__main__":
    if not os.path.exists("/home/jules/verification"):
        os.makedirs("/home/jules/verification")
    asyncio.run(run())
