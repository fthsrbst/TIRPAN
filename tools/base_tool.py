"""
Phase 3 — BaseTool & ToolMetadata

Every tool (core or plugin) implements this contract.

V2 additions:
  - ToolHealthStatus: self-reported availability + install hints
  - BaseTool.health_check(): overridable per-tool health probe
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from pydantic import BaseModel


class ToolMetadata(BaseModel):
    name: str                   # unique identifier — used by the agent
    description: str            # description sent to the LLM
    parameters: dict            # JSON Schema — tells the LLM which parameters to send
    category: str               # "recon" | "exploit-search" | "exploit-exec" | "report" | "post-exploit"
    version: str = "1.0.0"


@dataclass
class ToolHealthStatus:
    """
    Returned by BaseTool.health_check().

    available=False  → tool excluded from LLM prompt; agent continues without it
    degraded=True    → tool works at reduced capacity; note appended to LLM description
    """
    available: bool = True
    degraded: bool = False
    message: str = "OK"
    install_hint: str | None = None
    fallback_active: bool = False


class BaseTool(ABC):
    """All tools inherit from this class."""

    @property
    @abstractmethod
    def metadata(self) -> ToolMetadata:
        """Metadata that describes the tool."""
        ...

    @abstractmethod
    async def execute(self, params: dict) -> dict:
        """
        Execute the tool.

        Always returns in this format:
          {"success": bool, "output": any, "error": str | None}
        """
        ...

    async def validate(self, params: dict) -> tuple[bool, str]:
        """
        Validate parameters before execution.
        If not overridden, accepts everything as valid.
        """
        return True, ""

    async def health_check(self) -> ToolHealthStatus:
        """
        Self-report availability.  Override in each tool for real checks.
        Default: always available (preserves V1 behaviour).
        """
        return ToolHealthStatus(available=True, degraded=False, message="OK")

    def to_llm_dict(self, health: ToolHealthStatus | None = None) -> dict:
        """Tool definition to be sent to the LLM."""
        desc = self.metadata.description
        if health and health.degraded and health.message:
            desc = f"[DEGRADED: {health.message}] {desc}"
        return {
            "name": self.metadata.name,
            "description": desc,
            "parameters": self.metadata.parameters,
        }
