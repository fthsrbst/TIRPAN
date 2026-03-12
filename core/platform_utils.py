"""
Cross-platform privilege and OS detection utilities.

Use these helpers instead of calling os.geteuid() or sys.platform directly
so that platform-specific code stays in one place.
"""

import sys

IS_WINDOWS: bool = sys.platform == "win32"
IS_LINUX: bool = sys.platform.startswith("linux")
IS_MACOS: bool = sys.platform == "darwin"


def is_elevated() -> bool:
    """Return True if the process has elevated privileges.

    Windows : running as Administrator (via ctypes shell32)
    Unix    : effective UID is 0 (root)
    """
    if IS_WINDOWS:
        try:
            import ctypes
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            return False
    else:
        import os
        return os.geteuid() == 0


def platform_name() -> str:
    """Return a lowercase platform identifier: 'windows', 'macos', or 'linux'."""
    if IS_WINDOWS:
        return "windows"
    if IS_MACOS:
        return "macos"
    return "linux"
