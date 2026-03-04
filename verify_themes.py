import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Helper function to take screenshots for all themes
        async def take_theme_screenshots(url, prefix):
            await page.goto(url)
            await page.wait_for_timeout(1000) # wait for render

            themes = ['default', 'blue', 'green', 'light']
            for theme in themes:
                print(f"Setting theme: {theme} on {prefix}")
                await page.select_option('#theme-dropdown', value=theme)
                await page.wait_for_timeout(500) # wait for transition
                await page.screenshot(path=f"/home/jules/verification/{prefix}_{theme}.png", full_page=True)

        await take_theme_screenshots("http://localhost:8000/", "portal")
        await take_theme_screenshots("http://localhost:8000/Aglam/", "aglam")
        await take_theme_screenshots("http://localhost:8000/ChatTabu/", "chattabu")

        await browser.close()

if __name__ == "__main__":
    if not os.path.exists("/home/jules/verification"):
        os.makedirs("/home/jules/verification")
    asyncio.run(run())