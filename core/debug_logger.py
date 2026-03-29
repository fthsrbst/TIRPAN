"""
TIRPAN — Debug Logger
=====================
Toggle'lanabilir, renkli, detaylı debug logging sistemi.

Kullanım:
  Konsol'da görmek için: TIRPAN_DEBUG=true  (varsayılan: true)
  Kapatmak için:         TIRPAN_DEBUG=false

Kaldırma:
  Tüm bu sistemi production'dan kaldırmak için sadece bu dosyayı silin
  ve import'ları temizleyin (dbg. ile başlayan satırlar).

Log seviyeleri:
  TRACE  -> her şey (tool param/output detayları)
  DEBUG  -> tool call/result, bus mesajları, agent lifecycle
  INFO   -> brain iterasyonları, spawn/wait olayları
  WARN   -> timeout, retry, fallback durumları
  ERROR  -> hata ve exception'lar
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any


# ── Renk kodları (ANSI) ───────────────────────────────────────────────────────

class C:
    """ANSI renk sabitleri. tty yoksa boş string döner."""
    _use: bool = sys.stderr.isatty() or bool(os.getenv("FORCE_COLOR"))

    RESET   = "\033[0m"    if _use else ""
    BOLD    = "\033[1m"    if _use else ""
    DIM     = "\033[2m"    if _use else ""

    # Kategorilere göre renkler
    BRAIN   = "\033[95m"   if _use else ""   # magenta  — brain döngüsü
    SPAWN   = "\033[93m"   if _use else ""   # yellow   — agent spawn
    WAIT    = "\033[96m"   if _use else ""   # cyan     — wait_for_agents
    BUS     = "\033[94m"   if _use else ""   # blue     — bus mesajları
    TOOL_IN = "\033[36m"   if _use else ""   # dark cyan — tool call giden
    TOOL_OK = "\033[32m"   if _use else ""   # green    — tool başarılı
    TOOL_ER = "\033[31m"   if _use else ""   # red      — tool hata
    FIND    = "\033[33m"   if _use else ""   # orange   — finding
    THINK   = "\033[35m"   if _use else ""   # purple   — LLM thinking
    SAFETY  = "\033[41m"   if _use else ""   # red bg   — safety block
    WARN    = "\033[33m"   if _use else ""   # yellow   — uyarı
    ERROR   = "\033[31m"   if _use else ""   # red      — hata
    DIM_W   = "\033[37m"   if _use else ""   # dim white — metadata


# ── Seviye sabitleri ─────────────────────────────────────────────────────────

TRACE = 0
DEBUG = 1
INFO  = 2
WARN  = 3
ERROR = 4

_LEVEL_NAMES = {TRACE: "TRACE", DEBUG: "DEBUG", INFO: "INFO", WARN: "WARN", ERROR: "ERROR"}


# ── Global state ─────────────────────────────────────────────────────────────

def _parse_level(val: str) -> int:
    return {
        "trace": TRACE, "debug": DEBUG, "info": INFO, "warn": WARN, "error": ERROR
    }.get(val.lower(), DEBUG)


_ENABLED: bool = os.getenv("TIRPAN_DEBUG", "true").lower() not in ("false", "0", "no")
_LEVEL: int    = _parse_level(os.getenv("TIRPAN_LOG_LEVEL", "debug"))

# Başlangıç zamanı (göreli timestamp için)
_T0: float = time.time()

# ── UI Callback Registry (session_id → progress_callback) ────────────────────
# UI'ya debug mesajı göndermek için kullanılır.
# Session başladığında register_session() ile kayıt olur.
from typing import Callable as _Callable
_ui_callbacks: dict[str, _Callable] = {}


def register_session(session_id: str, callback: _Callable) -> None:
    """V2 session başladığında progress_callback'i kaydet."""
    _ui_callbacks[session_id] = callback


def unregister_session(session_id: str) -> None:
    """Session bittiğinde callback'i temizle."""
    _ui_callbacks.pop(session_id, None)


def _emit_to_ui(prefix: str, agent_id: str, msg: str, level: str = "debug") -> None:
    """Tüm aktif session'lara debug_log event'i gönder."""
    if not _ui_callbacks:
        return
    payload = {
        "prefix": prefix.strip(),
        "agent_id": agent_id,
        "short_id": _short(agent_id) if agent_id else "sys",
        "msg": msg,
        "level": level,
        "ts": f"+{time.time() - _T0:7.3f}s",
    }
    for cb in list(_ui_callbacks.values()):
        try:
            cb("debug_log", payload)
        except Exception:
            pass


# ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

def _ts() -> str:
    """Göreli zaman damgası: +14.231s formatında"""
    elapsed = time.time() - _T0
    return f"+{elapsed:7.3f}s"


def _short(agent_id: str) -> str:
    """agent_id kısalt: 'scanner-f472bfd8' -> 'scnr-f472'"""
    if not agent_id:
        return "sys"
    parts = agent_id.split("-")
    if len(parts) >= 2:
        prefix = parts[0][:4]
        suffix = parts[-1][:4]
        return f"{prefix}-{suffix}"
    return agent_id[:8]


def _trim(val: Any, max_len: int = 200) -> str:
    """Değeri stringe çevirip kırp."""
    if isinstance(val, (dict, list)):
        s = json.dumps(val, ensure_ascii=False, default=str)
    else:
        s = str(val)
    if len(s) > max_len:
        return s[:max_len] + f"…({len(s) - max_len} more)"
    return s


def _print(color: str, prefix: str, agent_id: str, msg: str,
           dim_suffix: str = "", level: str = "debug") -> None:
    """Tek satır debug çıktısı stderr'e + UI console'a."""
    ts = _ts()
    aid = _short(agent_id)
    suffix = f" {C.DIM_W}{dim_suffix}{C.RESET}" if dim_suffix else ""
    line = (
        f"{C.DIM}{ts}{C.RESET} "
        f"{color}{C.BOLD}{prefix:<10}{C.RESET} "
        f"{C.DIM_W}[{aid:<9}]{C.RESET} "
        f"{msg}{suffix}"
    )
    print(line, file=sys.stderr, flush=True)
    # UI console'a da gönder (ANSI kodları olmadan)
    _emit_to_ui(prefix, agent_id, msg, level=level)


# ── Public API ────────────────────────────────────────────────────────────────

def is_enabled() -> bool:
    return _ENABLED


# Brain döngüsü
def brain_iter(agent_id: str, iteration: int, active_agents: dict) -> None:
    if not _ENABLED or _LEVEL > DEBUG:
        return
    agents_str = ", ".join(
        f"{_short(k)}({v})" for k, v in active_agents.items()
    ) or "none"
    _print(C.BRAIN, "BRAIN", agent_id,
           f"iter={iteration} | active=[{agents_str}]")


def brain_think(agent_id: str, thought: str) -> None:
    if not _ENABLED or _LEVEL > DEBUG:
        return
    _print(C.THINK, "THINK", agent_id, _trim(thought, 300))


def brain_action(agent_id: str, action: str, params: dict) -> None:
    if not _ENABLED or _LEVEL > DEBUG:
        return
    p = _trim(params, 150)
    _print(C.BRAIN, "ACTION", agent_id, f"{C.BOLD}{action}{C.RESET}  params={p}")


# Agent spawn / done
def agent_spawn(brain_id: str, agent_id: str, agent_type: str, target: str) -> None:
    if not _ENABLED or _LEVEL > INFO:
        return
    _print(C.SPAWN, "SPAWN↑", brain_id,
           f"{C.BOLD}{agent_type}{C.RESET} "
           f"id={C.SPAWN}{agent_id}{C.RESET} target={target}")


def agent_done(
    agent_id: str, agent_type: str, status: str,
    findings: int, iterations: int
) -> None:
    if not _ENABLED or _LEVEL > INFO:
        return
    color = C.TOOL_OK if status in ("success", "partial") else C.TOOL_ER
    _print(color, "DONE↓", agent_id,
           f"{agent_type} status={C.BOLD}{status}{C.RESET} "
           f"findings={findings} iters={iterations}")


def agent_error(agent_id: str, error_msg: str) -> None:
    if not _ENABLED or _LEVEL > WARN:
        return
    _print(C.ERROR, "AGENT_ERR", agent_id, _trim(error_msg, 200))


# wait_for_agents
def wait_start(brain_id: str, agent_ids: list, timeout: float) -> None:
    if not _ENABLED or _LEVEL > DEBUG:
        return
    ids_str = ", ".join(_short(a) for a in agent_ids)
    _print(C.WAIT, "WAIT▶", brain_id,
           f"waiting=[{ids_str}] timeout={timeout}s")


def wait_done(brain_id: str, completed: list, timed_out: list) -> None:
    if not _ENABLED or _LEVEL > DEBUG:
        return
    ok  = ", ".join(_short(a) for a in completed) or "-"
    bad = ", ".join(_short(a) for a in timed_out) or "-"
    color = C.TOOL_OK if not timed_out else C.WARN
    _print(color, "WAIT◀", brain_id,
           f"completed=[{ok}] timed_out=[{C.TOOL_ER}{bad}{C.RESET}]")


# Tool call / result
def tool_call(agent_id: str, tool_name: str, params: dict) -> None:
    if not _ENABLED or _LEVEL > DEBUG:
        return
    p = _trim(params, 200)
    _print(C.TOOL_IN, "TOOL→", agent_id,
           f"{C.BOLD}{tool_name}{C.RESET}  {p}")


def tool_ok(agent_id: str, tool_name: str, output: Any, duration_ms: float = 0) -> None:
    if not _ENABLED or _LEVEL > DEBUG:
        return
    out = _trim(output, 250)
    dur = f" ({duration_ms:.0f}ms)" if duration_ms else ""
    _print(C.TOOL_OK, "TOOL←OK", agent_id,
           f"{C.BOLD}{tool_name}{C.RESET}{dur}  {out}")


def tool_fail(agent_id: str, tool_name: str, error_msg: str, duration_ms: float = 0) -> None:
    if not _ENABLED or _LEVEL > WARN:
        return
    dur = f" ({duration_ms:.0f}ms)" if duration_ms else ""
    _print(C.TOOL_ER, "TOOL←ERR", agent_id,
           f"{C.BOLD}{tool_name}{C.RESET}{dur}  "
           f"{C.ERROR}{_trim(error_msg, 200)}{C.RESET}")


# Bus mesajları
def bus_send(
    sender_id: str, msg_type: str,
    recipient: str | None, payload_summary: str
) -> None:
    if not _ENABLED or _LEVEL > TRACE:
        return
    to = _short(recipient) if recipient else "*all*"
    _print(C.BUS, "BUS→", sender_id,
           f"{msg_type} to={to}  {_trim(payload_summary, 120)}")


def bus_finding(sender_id: str, finding_type: str, summary: str) -> None:
    if not _ENABLED or _LEVEL > DEBUG:
        return
    _print(C.FIND, "FINDING", sender_id,
           f"{C.BOLD}{finding_type}{C.RESET}  {_trim(summary, 200)}")


def bus_agent_done(agent_id: str, msg_type: str, status: str) -> None:
    if not _ENABLED or _LEVEL > INFO:
        return
    color = C.TOOL_OK if status in ("success", "partial") else C.TOOL_ER
    _print(color, "BUS←DONE", agent_id,
           f"msg_type={msg_type} status={C.BOLD}{status}{C.RESET}")


# Safety block
def safety_block(agent_id: str, tool_name: str, reason: str) -> None:
    if not _ENABLED or _LEVEL > WARN:
        return
    _print(C.SAFETY, "SAFETY!", agent_id,
           f"{C.BOLD}{tool_name}{C.RESET} BLOCKED: {_trim(reason, 200)}",
           level="warn")


# Genel
def info(agent_id: str, msg: str) -> None:
    if not _ENABLED or _LEVEL > INFO:
        return
    _print(C.DIM_W, "INFO", agent_id, msg, level="info")


def warn(agent_id: str, msg: str) -> None:
    if not _ENABLED or _LEVEL > WARN:
        return
    _print(C.WARN, "WARN", agent_id, msg, level="warn")


def error(agent_id: str, msg: str) -> None:
    if not _ENABLED:
        return
    _print(C.ERROR, "ERROR", agent_id, msg, level="error")


def trace(agent_id: str, msg: str) -> None:
    if not _ENABLED or _LEVEL > TRACE:
        return
    _print(C.DIM, "TRACE", agent_id, msg, level="trace")


# ── Session banner ───────────────────────────────────────────────────────────

def print_banner() -> None:
    """Session başlangıcında debug durumunu göster."""
    if not _ENABLED:
        return
    level_name = _LEVEL_NAMES.get(_LEVEL, "DEBUG")
    print(
        f"\n{C.BOLD}{C.BRAIN}[TIRPAN DEBUG]{C.RESET} "
        f"mode=ON level={level_name} | "
        f"set TIRPAN_DEBUG=false to disable\n",
        file=sys.stderr, flush=True,
    )
