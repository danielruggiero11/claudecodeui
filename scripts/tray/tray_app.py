"""
ClaudeCodeUI System Tray Application
Runs the Node.js production server with a system tray icon.

Requirements (install in a venv):
    pip install pystray Pillow
"""

import os
import sys
import subprocess
import webbrowser
import signal
import time
from pathlib import Path

import pystray
from pystray import MenuItem as item
from PIL import Image


# Resolve project root (two levels up from scripts/tray/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ICON_PATH = PROJECT_ROOT / "public" / "claude.png"
PORT = int(os.environ.get("CLAUDEUI_PORT", "3001"))


class ClaudeCodeUITray:
    def __init__(self):
        self.icon = None
        self.server_process = None
        self.start_server()
        self.create_tray_icon()

    def start_server(self):
        """Start the Node.js production server."""
        node_exe = "node"
        server_script = str(PROJECT_ROOT / "server" / "index.js")

        env = os.environ.copy()
        env["SERVER_PORT"] = str(PORT)
        env["NODE_ENV"] = "production"

        # Check if dist/ exists; if not, run build first
        dist_index = PROJECT_ROOT / "dist" / "index.html"
        if not dist_index.exists():
            print("[ClaudeCodeUI] dist/ not found, running build...")
            build_result = subprocess.run(
                ["npm", "run", "build"],
                cwd=str(PROJECT_ROOT),
                env=env,
                shell=True,
                capture_output=True,
                text=True,
            )
            if build_result.returncode != 0:
                print(f"[ClaudeCodeUI] Build failed: {build_result.stderr}")
                sys.exit(1)
            print("[ClaudeCodeUI] Build complete.")

        print(f"[ClaudeCodeUI] Starting server on port {PORT}...")
        self.server_process = subprocess.Popen(
            [node_exe, server_script],
            cwd=str(PROJECT_ROOT),
            env=env,
            shell=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        print(f"[ClaudeCodeUI] Server started (PID: {self.server_process.pid})")

    def create_icon_image(self):
        """Load the Claude logo for the system tray."""
        try:
            if ICON_PATH.exists():
                image = Image.open(ICON_PATH).convert("RGBA")
                return image.resize((64, 64), Image.Resampling.LANCZOS)
        except Exception as e:
            print(f"[ClaudeCodeUI] Error loading icon: {e}")

        # Fallback: orange circle
        image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        from PIL import ImageDraw
        draw = ImageDraw.Draw(image)
        draw.ellipse([4, 4, 60, 60], fill=(225, 132, 91, 255))
        return image

    def create_tray_icon(self):
        """Create the system tray icon with menu."""
        image = self.create_icon_image()

        menu = pystray.Menu(
            item("Open Claude Code UI", self.open_web_gui, default=True),
            pystray.Menu.SEPARATOR,
            item("Exit", self.quit_app),
        )

        self.icon = pystray.Icon(
            "claudecodeui",
            image,
            f"Claude Code UI - localhost:{PORT}",
            menu,
        )

    def open_web_gui(self, icon=None, item=None):
        """Open the web GUI in the default browser."""
        url = f"http://localhost:{PORT}"
        print(f"[ClaudeCodeUI] Opening {url}")
        webbrowser.open(url)

    def quit_app(self, icon=None, item=None):
        """Stop the server and exit."""
        print("[ClaudeCodeUI] Shutting down...")
        if self.server_process:
            if sys.platform == "win32":
                self.server_process.terminate()
            else:
                os.kill(self.server_process.pid, signal.SIGTERM)
            try:
                self.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.server_process.kill()

        if self.icon:
            self.icon.stop()
        sys.exit(0)

    def run(self):
        """Run the system tray application (blocks)."""
        self.icon.run()


def main():
    try:
        tray = ClaudeCodeUITray()
        tray.run()
    except KeyboardInterrupt:
        print("\n[ClaudeCodeUI] Interrupted, shutting down...")
        sys.exit(0)
    except Exception as e:
        print(f"[ClaudeCodeUI] Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
