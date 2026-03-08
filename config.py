from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path


class OllamaConfig(BaseSettings):
    base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")
    model: str = Field(default="llama3:8b", alias="OLLAMA_MODEL")
    timeout: float = Field(default=120.0)


class LLMConfig(BaseSettings):
    provider: str = Field(default="ollama", alias="LLM_PROVIDER")  # "ollama" | "openrouter"
    api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    cloud_model: str = Field(default="claude-sonnet-4-6", alias="CLOUD_MODEL")
    use_local_for_classification: bool = Field(default=True)


class ServerConfig(BaseSettings):
    host: str = Field(default="127.0.0.1", alias="SERVER_HOST")
    port: int = Field(default=8000, alias="SERVER_PORT")
    reload: bool = Field(default=True, alias="SERVER_RELOAD")


class AppConfig(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    static_dir: Path = Path(__file__).parent / "web" / "static"
    data_dir: Path = Path(__file__).parent / "data"

    ollama: OllamaConfig = Field(default_factory=OllamaConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)

    def model_post_init(self, __context):
        self.data_dir.mkdir(exist_ok=True)


# Singleton
settings = AppConfig()
