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


class LMStudioConfig(BaseSettings):
    model_config = _ENV
    base_url: str = Field(default="http://127.0.0.1:1234", alias="LMSTUDIO_BASE_URL")
    model: str = Field(default="", alias="LMSTUDIO_MODEL")
    timeout: float = Field(default=120.0)


class LLMConfig(BaseSettings):
    model_config = _ENV
    provider: str = Field(default="ollama", alias="LLM_PROVIDER")  # "ollama" | "openrouter"
    api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    cloud_model: str = Field(default="anthropic/claude-sonnet-4-6", alias="CLOUD_MODEL")
    use_local_for_classification: bool = Field(default=True)


class SafetyConfig(BaseModel):
    # Rule 1-2: Scope
    allowed_cidr: str = "10.0.0.0/8"        # target must be inside this range
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

    # Rule 8: CVSS cap
    max_cvss_score: float = 10.0

    # Rule 9: Time limit (seconds)
    session_max_seconds: int = 3600          # 1 hour

    # Rule 10: Rate limit
    max_requests_per_second: int = 10


class MetasploitConfig(BaseSettings):
    model_config = _ENV
    host: str = Field(default="127.0.0.1", alias="MSF_RPC_HOST")
    port: int = Field(default=55553, alias="MSF_RPC_PORT")
    password: str = Field(default="msfrpc", alias="MSF_RPC_PASSWORD")
    ssl: bool = Field(default=False, alias="MSF_RPC_SSL")
    # Override LHOST for reverse shells — set to the IP reachable FROM targets
    # e.g. VirtualBox host-only adapter: MSF_LHOST_OVERRIDE=192.168.56.1
    lhost_override: str = Field(default="", alias="MSF_LHOST_OVERRIDE")


class ServerConfig(BaseSettings):
    model_config = _ENV
    host: str = Field(default="127.0.0.1", alias="SERVER_HOST")
    port: int = Field(default=8000, alias="SERVER_PORT")
    reload: bool = Field(default=True, alias="SERVER_RELOAD")


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
    llm: LLMConfig = Field(default_factory=LLMConfig)
    msf: MetasploitConfig = Field(default_factory=MetasploitConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    safety: SafetyConfig = Field(default_factory=SafetyConfig)

    # Active speed profile (can be overridden per session)
    speed_profile: str = Field(default="normal", alias="SPEED_PROFILE")

    # Nmap: request elevated privileges for OS detection and SYN scans.
    # Linux/macOS: uses sudo. Windows: requires the process to run as Administrator.
    nmap_sudo: bool = Field(default=True, alias="NMAP_SUDO")
    # sudo password (Linux/macOS only). Loaded from OS keychain at startup, never persisted.
    sudo_password: str = Field(default="")

    # LoRA training data collection — write per-session JSONL to data/training/
    collect_training_data: bool = Field(default=True, alias="COLLECT_TRAINING_DATA")

    def model_post_init(self, __context):
        self.data_dir.mkdir(exist_ok=True)

    def get_speed_profile(self) -> SpeedProfile:
        """Return the active SpeedProfile object."""
        return SPEED_PROFILES.get(self.speed_profile, SPEED_PROFILES["normal"])


# Singleton
settings = AppConfig()
