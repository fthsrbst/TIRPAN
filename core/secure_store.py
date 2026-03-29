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
SENSITIVE_KEYS: frozenset[str] = frozenset({"openrouter_api_key", "msf_password"})


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
