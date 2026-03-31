import re
from patchright.sync_api import sync_playwright

EXISTING_PROFILE_PATH = r"C:\Users\druggiero11\AppData\Local\WalmartPatchrightBot\chrome_profile"
TARGET_URL = "https://claude.ai/settings/usage"

def grab_usage_by_labels():
    with sync_playwright() as p:
        try:
            context = p.chromium.launch_persistent_context(
                user_data_dir=EXISTING_PROFILE_PATH,
                headless=False, # Keep False until you're sure the labels work
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            )

            page = context.pages[0]
            page.goto(TARGET_URL)

            # 1. Wait for the word 'spent' to appear anywhere on the page
            # 'i' flag makes it case-insensitive
            spent_element = page.locator("text=/spent/i").first
            spent_element.wait_for(timeout=15000)
            raw_spent_text = spent_element.inner_text()

            # 2. Look for the 'reset' text
            reset_element = page.locator("text=/resets/i").first
            raw_reset_text = reset_element.inner_text()

            # --- Extraction Logic ---
            # Extract all dollar amounts (e.g., ['975.74', '1,000.00'])
            amounts = re.findall(r"[\d,.]+", raw_spent_text)
            spent_val = amounts[0] if len(amounts) > 0 else "Error"
            total_val = amounts[1] if len(amounts) > 1 else "Error"

            # Extract the date after the word 'Resets'
            # This split handles "Spend limit · Resets Apr 1"
            reset_date = raw_reset_text.split("Resets")[-1].strip()

            print(f"\nSUCCESSFUL GRAB:")
            print(f"---------------------------")
            print(f"Status: {spent_val} / {total_val}")
            print(f"Reset Date: {reset_date}")
            print(f"---------------------------\n")

        except Exception as e:
            print(f"Failed to find labels: {e}")
        finally:
            if 'context' in locals():
                context.close()

if __name__ == "__main__":
    grab_usage_by_labels()