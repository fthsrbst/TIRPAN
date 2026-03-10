from pydantic import BaseModel, field_validator
from typing import Optional
import time


class Session(BaseModel):
    id: str
    target: str
    mode: str = "scan_only"        # "full_auto" | "ask_before_exploit" | "scan_only"
    status: str = "idle"           # "idle" | "running" | "paused" | "done" | "error"
    created_at: float = 0.0
    updated_at: float = 0.0
    finished_at: Optional[float] = None
    hosts_found: int = 0
    ports_found: int = 0
    vulns_found: int = 0
    exploits_run: int = 0
    error_message: Optional[str] = None

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        allowed = {"full_auto", "ask_before_exploit", "scan_only"}
        if v not in allowed:
            raise ValueError(f"mode must be one of {allowed}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed = {"idle", "running", "paused", "done", "error"}
        if v not in allowed:
            raise ValueError(f"status must be one of {allowed}")
        return v

    def model_post_init(self, __context) -> None:
        now = time.time()
        if self.created_at == 0.0:
            self.created_at = now
        if self.updated_at == 0.0:
            self.updated_at = now
