"""
TIRPAN — Session Tracer
=======================
Her agent konuşmasını, LLM mesajlarını, tool çağrılarını ve sonuçlarını
session klasörüne JSONL formatında kaydeder.

Dosya konumu:
  data/sessions/{session_id}/debug/conversation.jsonl

Her satır bir JSON objesi:
  {
    "seq":        int,         # Sıra numarası (session genelinde artan)
    "ts":         ISO-8601,    # Zaman damgası
    "iteration":  int,         # Agent iterasyon numarası
    "session_id": str,
    "agent_id":   str,
    "agent_type": str,
    "event":      str,         # llm_request | llm_response | reasoning | tool_call | tool_result
    "data":       dict         # Olaya özgü veri (tam, truncate edilmemiş)
  }

Kullanım (BaseAgent içinde):
  tracer = get_tracer(session_id)
  tracer.log_llm_request(agent_id, agent_type, iteration, messages)
  tracer.log_llm_response(agent_id, agent_type, iteration, response)
  tracer.log_reasoning(agent_id, agent_type, iteration, action_dict)
  tracer.log_tool_call(agent_id, agent_type, iteration, tool_name, params)
  tracer.log_tool_result(agent_id, agent_type, iteration, tool_name, result, duration_ms)
"""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DATA_DIR = Path("data/sessions")

# Ortam değişkeni ile kapatılabilir
_ENABLED: bool = os.getenv("TIRPAN_SESSION_TRACE", "true").lower() not in ("false", "0", "no")


def _debug_dir(session_id: str) -> Path:
    """data/sessions/{session_id}/debug/ dizinini oluştur ve döndür."""
    d = _DATA_DIR / session_id / "debug"
    d.mkdir(parents=True, exist_ok=True)
    return d


class SessionTracer:
    """
    Per-session JSONL tracer.

    Thread-safe: _lock korur sıra numarasını ve dosya yazımını.
    Aynı session için get_tracer() her zaman aynı instance'ı döndürür.
    """

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self._lock = threading.Lock()
        self._seq = 0
        self._path = _debug_dir(session_id) / "conversation.jsonl"

    # ── Public log methods ───────────────────────────────────────────────────

    def log_llm_request(
        self,
        agent_id: str,
        agent_type: str,
        iteration: int,
        messages: list[dict],
    ) -> None:
        """LLM'e gönderilen tam mesaj dizisini kaydet."""
        self._write(
            agent_id=agent_id,
            agent_type=agent_type,
            iteration=iteration,
            event="llm_request",
            data={"messages": messages},
        )

    def log_llm_response(
        self,
        agent_id: str,
        agent_type: str,
        iteration: int,
        response: str,
    ) -> None:
        """LLM'den gelen ham cevabı kaydet (parse edilmeden önce)."""
        self._write(
            agent_id=agent_id,
            agent_type=agent_type,
            iteration=iteration,
            event="llm_response",
            data={"response": response},
        )

    def log_reasoning(
        self,
        agent_id: str,
        agent_type: str,
        iteration: int,
        action_dict: dict,
    ) -> None:
        """Parse edilmiş reasoning çıktısını kaydet (thought, action, parameters)."""
        self._write(
            agent_id=agent_id,
            agent_type=agent_type,
            iteration=iteration,
            event="reasoning",
            data={
                "thought":     action_dict.get("thought", ""),
                "action":      action_dict.get("action", ""),
                "reasoning":   action_dict.get("reasoning", ""),
                "parameters":  action_dict.get("parameters", {}),
            },
        )

    def log_tool_call(
        self,
        agent_id: str,
        agent_type: str,
        iteration: int,
        tool_name: str,
        params: dict,
    ) -> None:
        """Tool çağrısını tam parametrelerle kaydet."""
        # _session_id gibi dahili parametreleri temizle
        clean_params = {k: v for k, v in params.items() if not k.startswith("_")}
        self._write(
            agent_id=agent_id,
            agent_type=agent_type,
            iteration=iteration,
            event="tool_call",
            data={"tool": tool_name, "params": clean_params},
        )

    def log_tool_result(
        self,
        agent_id: str,
        agent_type: str,
        iteration: int,
        tool_name: str,
        result: dict,
        duration_ms: float = 0.0,
    ) -> None:
        """Tool sonucunu tam çıktıyla kaydet (truncate yok)."""
        self._write(
            agent_id=agent_id,
            agent_type=agent_type,
            iteration=iteration,
            event="tool_result",
            data={
                "tool":        tool_name,
                "success":     result.get("success", False),
                "output":      result.get("output"),
                "error":       result.get("error"),
                "duration_ms": round(duration_ms, 1),
            },
        )

    # ── Internal ─────────────────────────────────────────────────────────────

    def _write(
        self,
        agent_id: str,
        agent_type: str,
        iteration: int,
        event: str,
        data: dict,
    ) -> None:
        if not _ENABLED:
            return
        with self._lock:
            self._seq += 1
            entry = {
                "seq":        self._seq,
                "ts":         datetime.now(timezone.utc).isoformat(),
                "iteration":  iteration,
                "session_id": self.session_id,
                "agent_id":   agent_id,
                "agent_type": agent_type,
                "event":      event,
                "data":       data,
            }
            try:
                with self._path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
            except OSError as exc:
                logger.warning("SessionTracer: yazma hatası %s: %s", self._path, exc)


# ── Singleton registry ────────────────────────────────────────────────────────

_tracers: dict[str, SessionTracer] = {}
_registry_lock = threading.Lock()


def get_tracer(session_id: str) -> SessionTracer:
    """session_id için SessionTracer singleton'ını döndür (yoksa oluştur)."""
    with _registry_lock:
        if session_id not in _tracers:
            _tracers[session_id] = SessionTracer(session_id)
        return _tracers[session_id]


def remove_tracer(session_id: str) -> None:
    """Session bittiğinde tracer'ı registry'den kaldır (opsiyonel temizlik)."""
    with _registry_lock:
        _tracers.pop(session_id, None)
