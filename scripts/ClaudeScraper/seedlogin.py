import time
from patchright.sync_api import sync_playwright

PROFILE_PATH = r"C:\Users\druggiero11\AppData\Local\ClaudeUsageBot\chrome_profile"

def open_for_login():
    with sync_playwright() as p:
        # We add ignore_default_args to stop Playwright from 
        # "holding" the browser's networking too tightly
        context = p.chromium.launch_persistent_context(
            user_data_dir=PROFILE_PATH,
            headless=False,
            no_viewport=True, 
            args=[
                "--start-maximized",
                "--disable-blink-features=AutomationControlled"
            ],
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )

        page = context.pages[0]
        print("Browser launched. You should be able to navigate freely now.")
        page.goto("https://claude.ai/login")
        
        # This loop keeps the script alive WITHOUT blocking 
        # the browser's internal message loop
        try:
            while True:
                time.sleep(1)
                # Quick check to see if the browser was closed manually
                if len(context.pages) == 0:
                    break
        except KeyboardInterrupt:
            print("\nClosing...")
        finally:
            context.close()

if __name__ == "__main__":
    open_for_login()