"""Shared wordlist resolution for ffuf/gobuster.

The wrappers historically defaulted to a Kali path (/usr/share/wordlists/...)
that does not exist on macOS/other hosts. When the wordlist is missing the tool
errors and the old code reported an empty-but-successful scan, hiding the whole
directory/file-discovery surface (on Metasploitable: DVWA, Mutillidae,
phpMyAdmin, TWiki, ...). This module provides a repo-bundled fallback so brute
forcing works out of the box, and lets callers distinguish "no wordlist" from
"target clean".
"""

from __future__ import annotations

import os
from pathlib import Path

# Compact, high-signal list shipped with the repo (includes Metasploitable apps).
BUNDLED_WORDLIST = str(Path(__file__).resolve().parent.parent / "data" / "wordlists" / "common.txt")


def resolve_wordlist(preferred: str | None) -> str | None:
    """Return the first existing wordlist: caller's choice, else the bundled one.

    Returns None when nothing usable is found (caller should surface an error).
    """
    for candidate in (preferred, BUNDLED_WORDLIST):
        if candidate and os.path.isfile(candidate):
            return candidate
    return None
