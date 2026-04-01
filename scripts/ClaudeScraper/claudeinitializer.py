from patchright.sync_api import sync_playwright

# Global variables within your app
playwright_instance = None
browser_context = None
claude_page = None

def init_claude_browser():
    global playwright_instance, browser_context, claude_page
    
    # Start Playwright without the 'with' block to keep it alive
    playwright_instance = sync_playwright().start()
    
    # Launch your specific profile
    browser_context = playwright_instance.chromium.launch_persistent_context(
        user_data_dir=r"C:\Users\druggiero11\AppData\Local\ClaudeUsageBot\chrome_profile",
        headless=False,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
    
    claude_page = browser_context.pages[0]
    claude_page.goto("https://claude.ai/settings/usage")
    print("Claude Browser Worker Initialized.")