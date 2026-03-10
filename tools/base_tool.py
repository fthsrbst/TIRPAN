"""
Phase 3 — BaseTool & ToolMetadata

Her tool (core veya plugin) bu contract'ı implement eder.
"""

from abc import ABC, abstractmethod
from pydantic import BaseModel


class ToolMetadata(BaseModel):
    name: str                   # unique identifier — agent bunu kullanır
    description: str            # LLM'e gönderilecek açıklama
    parameters: dict            # JSON Schema — LLM hangi parametreleri göndereceğini bilir
    category: str               # "recon" | "exploit-search" | "exploit-exec" | "report"
    version: str = "1.0.0"


class BaseTool(ABC):
    """Tüm tool'lar bu sınıftan türer."""

    @property
    @abstractmethod
    def metadata(self) -> ToolMetadata:
        """Tool'u tanımlayan metadata."""
        ...

    @abstractmethod
    async def execute(self, params: dict) -> dict:
        """
        Tool'u çalıştır.

        Her zaman şu formatta döner:
          {"success": bool, "output": any, "error": str | None}
        """
        ...

    async def validate(self, params: dict) -> tuple[bool, str]:
        """
        Parametreleri çalıştırmadan önce doğrula.
        Override edilmezse her şeyi geçerli kabul eder.

        Returns:
          (True, "") — geçerli
          (False, "hata mesajı") — geçersiz
        """
        return True, ""

    def to_llm_dict(self) -> dict:
        """LLM'e gönderilecek tool tanımı."""
        return {
            "name": self.metadata.name,
            "description": self.metadata.description,
            "parameters": self.metadata.parameters,
        }
