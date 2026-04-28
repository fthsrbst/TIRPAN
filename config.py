from dataclasses import dataclass, field
from pathlib import Path

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

_ENV = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


class OllamaConfig(BaseSettings):
    model_config = _ENV
    base_url: str = Field(default="http://127.0.0.1:11434", alias="OLLAMA_BASE_URL")
    model: str = Field(default="llama3:8b", alias="OLLAMA_MODEL")
    timeout: float = Field(default=120.0)


class OpenCodeGoConfig(BaseSettings):
    model_config = _ENV
    api_key: str = Field(default="", alias="OPENCODE_GO_API_KEY")
    model: str = Field(default="opencode-go/deepseek-v4-pro", alias="OPENCODE_GO_MODEL")
    base_url: str = Field(default="https://opencode.ai/zen/go/v1", alias="OPENCODE_GO_BASE_URL")
    timeout: float = Field(default=120.0)


class LMStudioConfig(BaseSettings):
    model_config = _ENV
    base_url: str = Field(default="http://127.0.0.1:1234", alias="LMSTUDIO_BASE_URL")
    model: str = Field(default="", alias="LMSTUDIO_MODEL")
    timeout: float = Field(default=120.0)


class LLMConfig(BaseSettings):
    model_config = _ENV
    provider: str = Field(default="ollama", alias="LLM_PROVIDER")  # "ollama" | "openrouter" | "opencode_go"
    api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    cloud_model: str = Field(default="anthropic/claude-sonnet-4-6", alias="CLOUD_MODEL")
    use_local_for_classification: bool = Field(default=True)


class SafetyConfig(BaseModel):
    # Rule 1-2: Scope
    # "0.0.0.0/0" = any target (CTF/lab mode).
    # Set to specific CIDR for production engagements: e.g. "192.168.56.0/24"
    allowed_cidr: str = "0.0.0.0/0"
    allowed_port_min: int = 1
    allowed_port_max: int = 65535

    # Rule 3-4: Exclusions
    excluded_ips: list[str] = []
    excluded_ports: list[int] = []

    # Rule 5: Mode
    allow_exploit: bool = True               # False = scan-only mode

    # Rule 6: No DoS
    block_dos_exploits: bool = True

    # Rule 7: No destructive
    block_destructive: bool = True

    # Rule 8: CVSS cap (10.0 = no cap)
    max_cvss_score: float = 10.0

    # Rule 9: Time limit (seconds, 0 = unlimited)
    session_max_seconds: int = 0

    # Rule 10: Rate limit
    max_requests_per_second: int = 50


class MetasploitConfig(BaseSettings):
    model_config = _ENV
    host: str = Field(default="127.0.0.1", alias="MSF_RPC_HOST")
    port: int = Field(default=55553, alias="MSF_RPC_PORT")
    password: str = Field(default="msfrpc", alias="MSF_RPC_PASSWORD")
    ssl: bool = Field(default=False, alias="MSF_RPC_SSL")
    # Override LHOST for reverse shells — set to the IP reachable FROM targets.
    # Leave empty for auto-detection (recommended).
    # Examples: "192.168.56.1" (VirtualBox), "10.10.14.5" (HTB/VPN tun0)
    lhost_override: str = Field(default="", alias="MSF_LHOST_OVERRIDE")
    # Override the msfconsole binary path (auto-detected if empty)
    msfconsole_path: str = Field(default="", alias="MSF_CONSOLE_PATH")
    # Auto-start msfrpcd at server startup for persistent session support
    auto_start_msfrpcd: bool = Field(default=True, alias="MSF_AUTO_START_RPCD")
    msfrpcd_path: str = Field(default="", alias="MSF_RPCD_PATH")
    persistent_console: bool = Field(default=False, alias="MSF_PERSISTENT_CONSOLE")


class ServerConfig(BaseSettings):
    model_config = _ENV
    host: str = Field(default="127.0.0.1", alias="SERVER_HOST")
    port: int = Field(default=8000, alias="SERVER_PORT")
    reload: bool = Field(default=True, alias="SERVER_RELOAD")
    allowed_origins: str = Field(
        default="http://localhost:8000,http://127.0.0.1:8000",
        alias="SERVER_ALLOWED_ORIGINS",
    )


# ── V2: Speed Profiles ────────────────────────────────────────────────────────

@dataclass
class SpeedProfile:
    """Controls scan timing and parallelism across all tools."""
    nmap_timing: str                    # nmap -T flag  e.g. "-T1"
    nmap_extra: list[str]               # extra nmap args
    max_parallel_hosts: int             # 0 = unlimited
    inter_request_delay_ms: int         # delay between HTTP requests in web tools
    exploit_timeout_seconds: int        # per-exploit MSF timeout
    description: str


SPEED_PROFILES: dict[str, SpeedProfile] = {
    "stealth": SpeedProfile(
        nmap_timing="-T1",
        nmap_extra=["--scan-delay", "5s", "--max-retries", "1"],
        max_parallel_hosts=1,
        inter_request_delay_ms=2000,
        exploit_timeout_seconds=180,
        description="IDS-evasive. Very slow. Use for production systems.",
    ),
    "normal": SpeedProfile(
        nmap_timing="-T3",
        nmap_extra=[],
        max_parallel_hosts=5,
        inter_request_delay_ms=200,
        exploit_timeout_seconds=120,
        description="Balanced. Default for most engagements.",
    ),
    "aggressive": SpeedProfile(
        nmap_timing="-T5",
        nmap_extra=["--min-rate", "5000"],
        max_parallel_hosts=0,
        inter_request_delay_ms=0,
        exploit_timeout_seconds=90,
        description="Maximum speed. Use only on lab / CTF targets.",
    ),
}


class AppConfig(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    static_dir: Path = Path(__file__).parent / "web" / "static"
    data_dir: Path = Path(__file__).parent / "data"

    ollama: OllamaConfig = Field(default_factory=OllamaConfig)
    lmstudio: LMStudioConfig = Field(default_factory=LMStudioConfig)
    opencode_go: OpenCodeGoConfig = Field(default_factory=OpenCodeGoConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    msf: MetasploitConfig = Field(default_factory=MetasploitConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    safety: SafetyConfig = Field(default_factory=SafetyConfig)

    # Active speed profile (can be overridden per session)
    speed_profile: str = Field(default="normal", alias="SPEED_PROFILE")

    # Nmap: request elevated privileges for OS detection and SYN scans.
    # "auto" = use sudo only when NOT already root (recommended).
    # True = always use sudo, False = never use sudo.
    nmap_sudo: str = Field(default="auto", alias="NMAP_SUDO")
    # sudo password (Linux/macOS only). Loaded from OS keychain at startup, never persisted.
    sudo_password: str = Field(default="")

    # Platform hints (auto-detected if empty)
    # Useful for cross-platform deployments: "kali" | "parrot" | "ubuntu" | "arch" | ""
    platform_hint: str = Field(default="", alias="PLATFORM_HINT")

    # LoRA training data collection — write per-session JSONL to data/training/
    collect_training_data: bool = Field(default=True, alias="COLLECT_TRAINING_DATA")
    ws_buffer_ttl_seconds: int = Field(default=300, alias="WS_BUFFER_TTL_SECONDS")
    cred_encryption_key: str = Field(default="", alias="CRED_ENCRYPTION_KEY")

    def model_post_init(self, __context):
        self.data_dir.mkdir(exist_ok=True)

    def get_speed_profile(self) -> SpeedProfile:
        """Return the active SpeedProfile object."""
        return SPEED_PROFILES.get(self.speed_profile, SPEED_PROFILES["normal"])

    def needs_sudo(self) -> bool:
        """Return True if nmap/privileged tools should be run via sudo.

        "auto" mode: True when the process is NOT already running as root.
        This lets Docker/root containers run without sudo, while normal
        user sessions still escalate for SYN scans and OS detection.
        """
        if self.nmap_sudo == "auto":
            import os as _os
            # Windows has no geteuid — always use sudo equivalent (runas) when on Windows,
            # but in practice TIRPAN runs in WSL/Linux where geteuid is always available.
            if not hasattr(_os, "geteuid"):
                return False  # Windows host process — not relevant
            return _os.geteuid() != 0
        # Legacy bool support (True/False stored as "True"/"False" string)
        if isinstance(self.nmap_sudo, str):
            return self.nmap_sudo.lower() not in ("false", "0", "no")
        return bool(self.nmap_sudo)


# Singleton
settings = AppConfig()
