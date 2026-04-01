"""
Claude Usage Scraper Service
============================
Long-lived subprocess that maintains a patchright browser session pointed at
claude.ai/settings/usage. Communicates with the Node.js server via stdin/stdout
JSON lines (one JSON object per line).

Commands (send as JSON line on stdin):
  {"cmd": "init", "profile_path": "C:\\...\\chrome_profile"}
  {"cmd": "scrape"}
  {"cmd": "close"}

Responses (one JSON line on stdout per command):
  {"status": "ok",    "data": {spent, total, reset, error, errorType, lastUpdated}}
  {"status": "error", "error": "...", "errorType": "cloudflare|auth|generic"}

Startup: emits {"status": "ready"} on stdout before accepting any commands.
Errors/logs go to stderr only so they don't corrupt the stdout JSON stream.
"""

import sys
import json
import re
import os
from datetime import datetime


# ── Helpers ────────────────────────────────────────────────────────────

def send(obj):
    """Write a JSON response line to stdout."""
    print(json.dumps(obj), flush=True)


def log(msg):
    """Write a log line to stderr (never stdout)."""
    print(f"[ClaudeUsage] {msg}", file=sys.stderr, flush=True)


def default_profile_path():
    local_app_data = os.getenv("LOCALAPPDATA") or os.path.join(
        os.path.expanduser("~"), "AppData", "Local"
    )
    return os.path.join(local_app_data, "ClaudeUsageBot", "chrome_profile")


# ── Scrape logic ───────────────────────────────────────────────────────

def do_scrape(page):
    """Reload the usage page and extract billing data. Returns a data dict."""
    page.reload(wait_until="load", timeout=20000)

    current_url = page.url
    page_content = page.content()

    # Cloudflare challenge detection
    cf_signals = [
        "Just a moment",
        "cf-challenge-running",
        "Enable JavaScript and cookies to continue",
        "cf_chl_opt",
        "Checking if the site connection is secure",
    ]
    if any(s in page_content for s in cf_signals):
        return None, "Blocked by Cloudflare — re-authentication may be needed", "cloudflare"

    # Auth redirect detection
    auth_url_signals = ["/login", "/sign-in"]
    auth_content_signals = ["Sign in to Claude", "Log in to Claude"]
    if any(s in current_url for s in auth_url_signals) or any(s in page_content for s in auth_content_signals):
        return None, "Authentication required — log in to Claude in the browser window", "auth"

    # Wait for the usage data element
    page.wait_for_selector("text=/spent/i", timeout=12000)

    spent_text = page.locator("text=/spent/i").first.inner_text()
    reset_text  = page.locator("text=/resets/i").first.inner_text()

    # Parse dollar amounts from text like "$991.79 of $1,000.00 spent"
    amounts   = re.findall(r"[\d,]+\.?\d*", spent_text)
    reset_part = re.split(r"resets", reset_text, flags=re.IGNORECASE)[-1].strip()

    data = {
        "spent":       amounts[0] if len(amounts) > 0 else "0",
        "total":       amounts[1] if len(amounts) > 1 else "0",
        "reset":       reset_part,
        "error":       None,
        "errorType":   None,
        "lastUpdated": datetime.now().isoformat(),
    }
    return data, None, None


# ── Main command loop ──────────────────────────────────────────────────

def main():
    playwright_instance = None
    browser_context     = None
    claude_page         = None

    # Signal readiness to Node.js before blocking on stdin
    send({"status": "ready"})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            cmd_obj = json.loads(line)
        except json.JSONDecodeError:
            send({"status": "error", "error": "Invalid JSON command", "errorType": "generic"})
            continue

        cmd = cmd_obj.get("cmd")

        # ── init ──────────────────────────────────────────────────────
        if cmd == "init":
            try:
                profile_path = cmd_obj.get("profile_path") or default_profile_path()
                os.makedirs(profile_path, exist_ok=True)

                # Tear down any existing session first
                if browser_context:
                    try:
                        browser_context.close()
                    except Exception:
                        pass
                if playwright_instance:
                    try:
                        playwright_instance.stop()
                    except Exception:
                        pass

                from patchright.sync_api import sync_playwright

                playwright_instance = sync_playwright().start()
                browser_context = playwright_instance.chromium.launch_persistent_context(
                    user_data_dir=profile_path,
                    headless=False,
                    no_viewport=True,
                )

                claude_page = (
                    browser_context.pages[0]
                    if browser_context.pages
                    else browser_context.new_page()
                )
                claude_page.goto(
                    "https://claude.ai/settings/usage",
                    wait_until="load",
                    timeout=20000,
                )
                log(f"Browser initialized — profile: {profile_path}")
                send({"status": "ok", "data": None})

            except Exception as exc:
                log(f"Init failed: {exc}")
                send({"status": "error", "error": str(exc), "errorType": "generic"})

        # ── scrape ────────────────────────────────────────────────────
        elif cmd == "scrape":
            if not claude_page or not browser_context:
                send({"status": "error", "error": "Browser not initialised — call init first", "errorType": "generic"})
                continue

            try:
                data, error, error_type = do_scrape(claude_page)
                if error:
                    send({"status": "error", "error": error, "errorType": error_type})
                else:
                    send({"status": "ok", "data": data})
            except Exception as exc:
                log(f"Scrape error: {exc}")
                send({"status": "error", "error": str(exc), "errorType": "generic"})

        # ── close ─────────────────────────────────────────────────────
        elif cmd == "close":
            try:
                if browser_context:
                    browser_context.close()
                if playwright_instance:
                    playwright_instance.stop()
            except Exception:
                pass
            browser_context     = None
            claude_page         = None
            playwright_instance = None
            send({"status": "ok", "data": None})
            log("Browser closed, exiting.")
            break

        else:
            send({"status": "error", "error": f"Unknown command: {cmd}", "errorType": "generic"})


if __name__ == "__main__":
    main()
