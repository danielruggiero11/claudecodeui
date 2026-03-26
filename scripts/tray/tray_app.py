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

if sys.platform == "win32":
    import ctypes

MUTEX_NAME = "Global\\ClaudeCodeUI_TrayApp"


def _acquire_single_instance_mutex():
    """Create a named mutex so only one instance runs at a time (Windows only)."""
    if sys.platform != "win32":
        return None
    mutex = ctypes.windll.kernel32.CreateMutexW(None, True, MUTEX_NAME)
    if ctypes.windll.kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        print("[ClaudeCodeUI] Another instance is already running. Exiting.")
        sys.exit(0)
    return mutex


# Resolve project root (two levels up from scripts/tray/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ICON_PATH = PROJECT_ROOT / "public" / "claude.png"


def _read_env_port():
    """Read SERVER_PORT from .env file, falling back to CLAUDEUI_PORT env var or 3001."""
    env_file = PROJECT_ROOT / ".env"
    try:
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and line.startswith("SERVER_PORT="):
                return int(line.split("=", 1)[1].strip())
    except Exception:
        pass
    return int(os.environ.get("CLAUDEUI_PORT", "3001"))


PORT = _read_env_port()


def _kill_process_on_port(port):
    """Kill any process currently listening on the given port (Windows only)."""
    if sys.platform != "win32":
        return
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, shell=True,
        )
        for line in result.stdout.splitlines():
            # Match lines like  TCP  0.0.0.0:12488  0.0.0.0:0  LISTENING  1234
            if f":{port}" in line and "LISTENING" in line:
                parts = line.split()
                pid = parts[-1]
                if pid.isdigit() and int(pid) != os.getpid():
                    print(f"[ClaudeCodeUI] Killing stale process on port {port} (PID {pid})")
                    subprocess.run(
                        ["taskkill", "/F", "/PID", pid],
                        capture_output=True, shell=True,
                    )
                    time.sleep(1)
    except Exception as e:
        print(f"[ClaudeCodeUI] Port cleanup warning: {e}")


class ClaudeCodeUITray:
    def __init__(self):
        self.icon = None
        self.server_process = None
        self.start_server()
        self.create_tray_icon()

    def start_server(self):
        """Start the Node.js production server."""
        _kill_process_on_port(PORT)

        node_exe = "node"
        server_script = str(PROJECT_ROOT / "server" / "index.js")

        env = os.environ.copy()
        env["SERVER_PORT"] = str(PORT)
        env["NODE_ENV"] = "production"

        # Always rebuild to ensure dist/ matches latest source
        print("[ClaudeCodeUI] Building frontend...")
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
            # Fall back to existing dist/ if available
            dist_index = PROJECT_ROOT / "dist" / "index.html"
            if not dist_index.exists():
                sys.exit(1)
            print("[ClaudeCodeUI] Using existing dist/ as fallback.")
        else:
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
    _acquire_single_instance_mutex()
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
