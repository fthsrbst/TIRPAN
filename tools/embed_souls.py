#!/usr/bin/env python3
"""
TIRPAN — Soul Embedder
======================
Re-generates souls/_embedded.py from the current souls/*.md files.

Run after modifying any soul file:
    python3 tools/embed_souls.py

This creates an AV-resistant fallback: if Windows Defender (or any AV) deletes
the .md files, soul_loader.py will still load content from _embedded.py.
"""
import base64
import os
import sys
import zlib
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
SOULS_DIR = PROJECT_ROOT / "souls"
OUTPUT_FILE = SOULS_DIR / "_embedded.py"


def embed_souls() -> None:
    lines = [
        '"""',
        "TIRPAN — Embedded Soul Files",
        "Auto-generated fallback: if soul .md files are deleted (e.g. by AV),",
        "soul_loader.py reads from this module instead.",
        "Regenerate with: python3 tools/embed_souls.py",
        '"""',
        "",
        "_SOULS: dict[str, bytes] = {}",
        "",
    ]

    soul_files = sorted(p for p in SOULS_DIR.iterdir() if p.suffix == ".md")
    if not soul_files:
        print("ERROR: No .md files found in", SOULS_DIR)
        sys.exit(1)

    for path in soul_files:
        name = path.stem
        raw = path.read_bytes()
        compressed = zlib.compress(raw, level=9)
        encoded = base64.b85encode(compressed).decode("ascii")
        chunks = [encoded[i : i + 100] for i in range(0, len(encoded), 100)]
        lines_str = "\n    ".join(repr(c) for c in chunks)
        lines.append(f"# {name}: {len(raw):,} bytes → {len(compressed):,} compressed")
        lines.append(f'_SOULS["{name}"] = (')
        lines.append(f"    {lines_str}")
        lines.append(")")
        lines.append("")
        print(f"  Embedded: {name} ({len(raw):,} bytes → {len(compressed):,} compressed)")

    OUTPUT_FILE.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWritten: {OUTPUT_FILE}")
    print("Soul files are now protected against AV deletion.")


if __name__ == "__main__":
    embed_souls()
