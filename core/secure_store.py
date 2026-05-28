"""
Secure storage for sensitive credentials using the OS keychain (keyring).

Sensitive keys stored here instead of plain-text SQLite:
  - openrouter_api_key
  - msf_password

Falls back to environment variables / empty string if keyring is unavailable.
"""

import asyncio
import logging

logger = logging.getLogger(__name__)

_SERVICE = "TIRPAN"

# Keys that should NEVER be stored in plain-text SQLite
SENSITIVE_KEYS: frozenset[str] = frozenset({"openrouter_api_key", "opencode_go_api_key", "msf_password"})


def _kr():
    try:
        import keyring
        return keyring
    except ImportError:
        return None


def get_secret(key: str) -> str:
    """Read a secret from the OS keychain. Returns '' if not found or unavailable."""
    kr = _kr()
    if kr is None:
        logger.warning("keyring not installed — secret '%s' not available from keychain", key)
        return ""
    try:
        val = kr.get_password(_SERVICE, key)
        return val or ""
    except Exception as exc:
        logger.warning("keyring get failed for '%s': %s", key, exc)
        return ""


def set_secret(key: str, value: str) -> bool:
    """Store a secret in the OS keychain. Returns True on success."""
    kr = _kr()
    if kr is None:
        logger.warning("keyring not installed — cannot store '%s' securely", key)
        return False
    try:
        if value:
            kr.set_password(_SERVICE, key, value)
        else:
            try:
                kr.delete_password(_SERVICE, key)
            except Exception:
                pass
        return True
    except Exception as exc:
        logger.warning("keyring set failed for '%s': %s", key, exc)
        return False


async def async_get_secret(key: str) -> str:
    """Async wrapper around get_secret."""
    return await asyncio.to_thread(get_secret, key)


async def async_set_secret(key: str, value: str) -> bool:
    """Async wrapper around set_secret."""
    return await asyncio.to_thread(set_secret, key, value)


# ── Fernet helpers for symmetric value encryption ────────────────────────────
# Used by core code that needs to encrypt sensitive payloads (e.g. harvested
# credentials) without taking a dependency on the web layer's encrypt_cred_data.
# Reads the same key the web layer uses, falling back to a marker on misconfig.

_PLAINTEXT_MARKER = "TIRPAN_PLAINTEXT::"


def _fernet():
    """Return a Fernet instance keyed by cred_encryption_key, or None on misconfig.

    Lookup order:
      1. config.settings.cred_encryption_key
      2. core.secure_store keychain entry 'cred_encryption_key'
    Returns None (rather than raising) so callers can fall back to a plain-text
    marker — losing finding visibility is worse than losing at-rest encryption.
    """
    try:
        from cryptography.fernet import Fernet
    except Exception:
        return None
    key = ""
    try:
        from config import settings as _settings
        key = (getattr(_settings, "cred_encryption_key", "") or "").strip()
    except Exception:
        pass
    if not key:
        key = (get_secret("cred_encryption_key") or "").strip()
    if not key:
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as exc:
        logger.warning("Fernet init failed: %s", exc)
        return None


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string. On any failure, returns a plaintext marker so callers
    can still persist — never raises."""
    if not plaintext:
        return ""
    f = _fernet()
    if f is None:
        return _PLAINTEXT_MARKER + plaintext
    try:
        return f.encrypt(plaintext.encode()).decode()
    except Exception as exc:
        logger.warning("encrypt_value failed: %s — storing as plaintext marker", exc)
        return _PLAINTEXT_MARKER + plaintext


def decrypt_value(token: str) -> str:
    """Decrypt a string produced by encrypt_value. Returns '' on failure."""
    if not token:
        return ""
    if token.startswith(_PLAINTEXT_MARKER):
        return token[len(_PLAINTEXT_MARKER):]
    f = _fernet()
    if f is None:
        return ""
    try:
        return f.decrypt(token.encode()).decode()
    except Exception as exc:
        logger.warning("decrypt_value failed: %s", exc)
        return ""
