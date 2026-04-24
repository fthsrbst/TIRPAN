"""Target resolution helpers.

Provides conservative local-scope inference for sessions started without an
explicit target.
"""

from __future__ import annotations

import ipaddress
import logging
import socket

try:
    import psutil
except Exception:  # pragma: no cover - optional dependency fallback
    psutil = None

logger = logging.getLogger(__name__)


def normalize_targets(values: str | list[str]) -> list[str]:
    """Normalize user-provided targets into deduplicated scope tokens.

    Accepts a single string or list of strings; commas and whitespace are
    treated as separators.
    """
    raw_items: list[str] = values if isinstance(values, list) else [str(values)]
    out: list[str] = []
    for item in raw_items:
        text = str(item or "").replace(",", " ").strip()
        if not text:
            continue
        for token in text.split():
            t = token.strip()
            if t and t not in out:
                out.append(t)
    return out


def infer_local_scope_targets(*, max_targets: int = 8) -> list[str]:
    """Infer private IPv4 network scopes from active local interfaces.

    Rules:
    - Include only private, non-loopback, non-link-local IPv4 addresses.
    - Preserve interface netmask-derived network when reasonable.
    - Cap very large networks (> /16 equivalent) down to /24 around the host
      to avoid accidental huge scans.
    """
    targets: list[str] = []

    if psutil is None:
        # Fallback: derive at least one private /24 from local host addresses.
        try:
            hostname = socket.gethostname()
            for fam, _, _, _, sockaddr in socket.getaddrinfo(hostname, None):
                if fam != socket.AF_INET:
                    continue
                raw_ip = (sockaddr[0] or "").strip()
                try:
                    ip_obj = ipaddress.ip_address(raw_ip)
                except ValueError:
                    continue
                if not ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local:
                    continue
                cidr = ipaddress.ip_network(f"{raw_ip}/24", strict=False).with_prefixlen
                if cidr not in targets:
                    targets.append(cidr)
                if len(targets) >= max_targets:
                    return targets
        except Exception:
            pass

        if not targets:
            logger.info("Auto target inference unavailable: psutil not installed and no private IPv4 found")
        else:
            logger.info("Auto target inference fallback scopes: %s", ", ".join(targets))
        return targets

    stats = psutil.net_if_stats()

    for if_name, addrs in psutil.net_if_addrs().items():
        if if_name.lower().startswith("lo"):
            continue

        if_state = stats.get(if_name)
        if if_state is not None and not if_state.isup:
            continue

        for addr in addrs:
            if addr.family != socket.AF_INET:
                continue

            raw_ip = (addr.address or "").strip()
            raw_mask = (addr.netmask or "").strip()
            if not raw_ip:
                continue

            try:
                ip_obj = ipaddress.ip_address(raw_ip)
            except ValueError:
                continue

            if ip_obj.is_loopback or ip_obj.is_link_local:
                continue
            if not ip_obj.is_private:
                # Avoid broad accidental scans on public cloud interfaces.
                continue

            mask = raw_mask or "255.255.255.0"
            try:
                iface = ipaddress.ip_interface(f"{raw_ip}/{mask}")
                network = iface.network
            except ValueError:
                network = ipaddress.ip_network(f"{raw_ip}/24", strict=False)

            if network.num_addresses > 65536:
                network = ipaddress.ip_network(f"{raw_ip}/24", strict=False)

            cidr = network.with_prefixlen
            if cidr not in targets:
                targets.append(cidr)

            if len(targets) >= max_targets:
                return targets

    if not targets:
        logger.info("Auto target inference found no private IPv4 scopes")
    else:
        logger.info("Auto target inference scopes: %s", ", ".join(targets))
    return targets
