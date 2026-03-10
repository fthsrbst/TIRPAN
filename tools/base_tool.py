"""
Phase 3 — BaseTool & ToolMetadata

Every tool (core or plugin) implements this contract.
"""

from abc import ABC, abstractmethod
from pydantic import BaseModel


class ToolMetadata(BaseModel):
    name: str                   # unique identifier — used by the agent
    description: str            # description sent to the LLM
    parameters: dict            # JSON Schema — tells the LLM which parameters to send
    category: str               # "recon" | "exploit-search" | "exploit-exec" | "report"
    version: str = "1.0.0"


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

        Returns:
          (True, "") — valid
          (False, "error message") — invalid
        """
        return True, ""

    def to_llm_dict(self) -> dict:
        """Tool definition to be sent to the LLM."""
        return {
            "name": self.metadata.name,
            "description": self.metadata.description,
            "parameters": self.metadata.parameters,
        }
