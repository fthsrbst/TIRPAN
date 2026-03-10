from pydantic import BaseModel, field_validator
from typing import Optional
import ipaddress


class Target(BaseModel):
    ip: str
    port_range: str = "1-65535"
    scan_only: bool = False
    excluded_ports: list[int] = []
    excluded_ips: list[str] = []

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        try:
            ipaddress.ip_address(v)
        except ValueError:
            try:
                ipaddress.ip_network(v, strict=False)
            except ValueError:
                raise ValueError(f"Invalid IP address or CIDR: {v}")
        return v

    @field_validator("port_range")
    @classmethod
    def validate_port_range(cls, v: str) -> str:
        parts = v.split("-")
        if len(parts) == 2:
            start, end = int(parts[0]), int(parts[1])
            if not (0 <= start <= 65535 and 0 <= end <= 65535 and start <= end):
                raise ValueError(f"Invalid port range: {v}")
        elif len(parts) == 1:
            port = int(parts[0])
            if not (0 <= port <= 65535):
                raise ValueError(f"Invalid port: {v}")
        else:
            raise ValueError(f"Invalid port range format: {v}")
        return v

    @property
    def is_cidr(self) -> bool:
        return "/" in self.ip

    @property
    def network(self) -> Optional[ipaddress.IPv4Network]:
        if self.is_cidr:
            return ipaddress.ip_network(self.ip, strict=False)
        return None
