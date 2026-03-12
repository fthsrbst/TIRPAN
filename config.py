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


class ServerConfig(BaseSettings):
    model_config = _ENV
    host: str = Field(default="127.0.0.1", alias="SERVER_HOST")
    port: int = Field(default=8000, alias="SERVER_PORT")
    reload: bool = Field(default=True, alias="SERVER_RELOAD")


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

    # Nmap: request elevated privileges for OS detection and SYN scans.
    # Linux/macOS: uses sudo. Windows: requires the process to run as Administrator (no sudo).
    nmap_sudo: bool = Field(default=True, alias="NMAP_SUDO")
    # sudo password (Linux/macOS only). Loaded from OS keychain at startup, never persisted to disk.
    sudo_password: str = Field(default="")

    def model_post_init(self, __context):
        self.data_dir.mkdir(exist_ok=True)


# Singleton
settings = AppConfig()
