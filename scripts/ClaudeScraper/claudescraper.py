import re

def get_live_claude_usage():
    global claude_page
    try:
        # Step 1: Refresh the existing tab
        claude_page.reload(wait_until="networkidle")
        
        # Step 2: Wait for the specific data
        claude_page.wait_for_selector("text=/spent/i", timeout=10000)
        
        # Step 3: Extract
        text = claude_page.locator("text=/spent/i").first.inner_text()
        reset_text = claude_page.locator("text=/resets/i").first.inner_text()
        
        # Step 4: Parse
        amounts = re.findall(r"[\d,.]+", text)
        return {
            "spent": amounts[0] if len(amounts) > 0 else "0",
            "total": amounts[1] if len(amounts) > 1 else "0",
            "reset": reset_text.split("Resets")[-1].strip()
        }
    except Exception as e:
        print(f"Scrape failed: {e}")
        return None