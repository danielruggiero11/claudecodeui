# Claude Usage Profile Setup
#
# Run this ONCE to authenticate the Chrome profile used by the Claude Usage Tracker.
# Launches Chromium directly (no Playwright overhead) so you can browse normally.
# Log in to Claude.ai, verify you can see usage data, then press Enter here to save.
#
# Usage: py setup_claude_profile.py

import os
import subprocess

CHROMIUM_EXE = os.path.join(
    os.getenv("LOCALAPPDATA", ""),
    "ms-playwright", "chromium-1208", "chrome-win64", "chrome.exe",
)

PROFILE_PATH = os.path.join(
    os.getenv("LOCALAPPDATA", os.path.join(os.path.expanduser("~"), "AppData", "Local")),
    "ClaudeUsageBot",
    "chrome_profile",
)

def main():
    if not os.path.exists(CHROMIUM_EXE):
        print(f"ERROR: Chromium not found at:\n  {CHROMIUM_EXE}")
        print("Run:  py -m playwright install chromium")
        return

    os.makedirs(PROFILE_PATH, exist_ok=True)
    print(f"Profile: {PROFILE_PATH}")
    print("Launching Chromium — log in to Claude.ai and confirm you can see your usage data.")
    print()

    proc = subprocess.Popen([
        CHROMIUM_EXE,
        f"--user-data-dir={PROFILE_PATH}",
        "--no-first-run",
        "--no-default-browser-check",
        "https://claude.ai/settings/usage",
    ])

    input("Press Enter here once you are logged in and can see your usage data...")

    print("Now close the Chrome window — Chrome needs to close cleanly to save your session.")
    proc.wait()
    print("Profile saved. Enable the Claude Usage Tracker in Settings > Appearance.")

if __name__ == "__main__":
    main()
