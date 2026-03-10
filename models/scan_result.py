from pydantic import BaseModel
from typing import Optional


class Port(BaseModel):
    number: int
    protocol: str = "tcp"          # "tcp" | "udp"
    state: str = "open"            # "open" | "closed" | "filtered"
    service: str = ""
    version: str = ""
    banner: str = ""


class Host(BaseModel):
    ip: str
    hostname: str = ""
    os: str = ""
    os_accuracy: int = 0
    state: str = "up"              # "up" | "down"
    ports: list[Port] = []

    @property
    def open_ports(self) -> list[Port]:
        return [p for p in self.ports if p.state == "open"]


class ScanResult(BaseModel):
    target: str
    scan_type: str                  # "ping" | "service" | "os" | "full"
    hosts: list[Host] = []
    duration_seconds: float = 0.0
    raw_output: str = ""

    @property
    def live_hosts(self) -> list[Host]:
        return [h for h in self.hosts if h.state == "up"]
