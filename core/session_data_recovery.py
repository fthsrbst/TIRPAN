"""
Utilities to reconstruct missing session findings from stored session events.

This module is used as a safety net when V2 event streams contain real findings
but the normalized report tables are empty or incomplete.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from database.repositories import (
    ExploitResultRepository,
    ScanResultRepository,
    SessionEventRepository,
    SessionRepository,
    VulnerabilityRepository,
)

logger = logging.getLogger(__name__)


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _parse_jsonish(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        return {}

    raw = value.strip()
    if not raw:
        return {}

    candidates = [raw, "".join(ch if ord(ch) >= 32 else " " for ch in raw)]
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except Exception:
            continue
    return {}


def _flatten_finding_payload(payload: dict) -> dict:
    flat = dict(payload or {})
    nested = flat.pop("data", None)
    if isinstance(nested, dict):
        for key, val in nested.items():
            flat.setdefault(key, val)
    return flat


def _guess_cvss(item: dict) -> float:
    cvss = _to_float(item.get("cvss_score") or item.get("cvss") or item.get("score"), 0.0)
    if cvss > 0:
        return cvss

    sev = _to_text(item.get("severity") or "").upper()
    if sev in ("CRITICAL", "CRIT"):
        return 9.0
    if sev == "HIGH":
        return 8.0
    if sev == "MEDIUM":
        return 5.5
    if sev == "LOW":
        return 2.5
    return 0.0


def _service_from_query(query: str) -> str:
    q = _to_text(query)
    if not q:
        return ""
    return q.split()[0].lower()


def _ip_of(payload: dict, fallback_target: str = "") -> str:
    for key in ("ip", "host_ip", "host", "target_ip", "target"):
        val = _to_text(payload.get(key))
        if val:
            return val
    return _to_text(fallback_target)


def _ensure_host(hosts: dict[str, dict], ip: str) -> dict:
    host = hosts.get(ip)
    if host is None:
        host = {
            "ip": ip,
            "hostname": "",
            "os": "",
            "state": "up",
            "ports": {},  # "22/tcp" -> port dict
        }
        hosts[ip] = host
    return host


def _add_open_port(host: dict, port_number: int, protocol: str, service: str = "", version: str = "") -> None:
    if port_number <= 0:
        return
    proto = _to_text(protocol or "tcp") or "tcp"
    key = f"{port_number}/{proto}"
    current = host["ports"].get(key)
    if current is None:
        host["ports"][key] = {
            "number": port_number,
            "protocol": proto,
            "state": "open",
            "service": _to_text(service),
            "version": _to_text(version),
            "banner": "",
        }
        return

    if not current.get("service") and service:
        current["service"] = _to_text(service)
    if not current.get("version") and version:
        current["version"] = _to_text(version)


def derive_session_data_from_events(events: list[dict], target: str = "") -> dict:
    """Build scan/vuln/exploit snapshots from stored event stream."""
    hosts_map: dict[str, dict] = {}
    host_open_port_hint: dict[str, int] = {}

    vulnerabilities: list[dict] = []
    vulnerability_keys: set[tuple[str, str, str, str, str]] = set()

    exploit_results: list[dict] = []
    exploit_keys: set[tuple[str, str, int, bool, int, str, str]] = set()

    last_event_ts = 0.0

    def add_vulnerability(payload: dict, created_at: float) -> None:
        host_ip = _ip_of(payload, target)
        title = _to_text(payload.get("title") or payload.get("name") or payload.get("description"))
        cve_id = _to_text(payload.get("cve_id") or payload.get("cve"))
        service = _to_text(payload.get("service"))
        service_version = _to_text(payload.get("service_version") or payload.get("version"))
        if not title:
            if cve_id:
                title = cve_id
            elif service:
                title = f"Potential issue on {service}"
            else:
                title = "Potential security issue"

        key = (host_ip.lower(), title.lower(), cve_id.lower(), service.lower(), service_version.lower())
        if key in vulnerability_keys:
            return
        vulnerability_keys.add(key)

        vulnerabilities.append(
            {
                "title": title,
                "description": _to_text(payload.get("description") or ""),
                "cve_id": cve_id,
                "cvss_score": _guess_cvss(payload),
                "exploit_path": _to_text(payload.get("exploit_path") or payload.get("module")),
                "exploit_type": _to_text(payload.get("exploit_type") or ""),
                "platform": _to_text(payload.get("platform") or ""),
                "service": service,
                "service_version": service_version,
                "host_ip": host_ip,
                "created_at": created_at,
            }
        )

    def add_exploit(payload: dict, finding_type: str, created_at: float) -> None:
        host_ip = _ip_of(payload, target)
        module = _to_text(payload.get("module") or payload.get("exploit_path") or payload.get("technique"))
        port = _to_int(payload.get("port") or payload.get("rport"), 0)

        if finding_type == "exploit_attempt":
            success = bool(payload.get("success"))
            session_opened = 1 if (success and (payload.get("session_id") or payload.get("msf_session_id"))) else 0
            output = _to_text(payload.get("output") or payload.get("result") or "")
            error = _to_text(payload.get("error") or "")
            poc_output = _to_text(payload.get("context") or "")
        elif finding_type in ("session", "session_opened", "shell_opened"):
            success = True
            session_opened = 1
            output = _to_text(payload.get("output") or payload.get("post_output_preview") or payload.get("session_id") or "")
            error = ""
            poc_output = _to_text(payload.get("context") or "")
        elif finding_type == "flag":
            success = True
            session_opened = 1
            output = _to_text(payload.get("content") or payload.get("path") or "")
            error = ""
            poc_output = _to_text(payload.get("context") or payload.get("content") or "")
        else:
            return

        key = (
            host_ip.lower(),
            module.lower(),
            port,
            bool(success),
            int(session_opened),
            error[:120],
            output[:120],
        )
        if key in exploit_keys:
            return
        exploit_keys.add(key)

        exploit_results.append(
            {
                "host_ip": host_ip,
                "port": port,
                "module": module,
                "payload": _to_text(payload.get("payload") or ""),
                "success": bool(success),
                "session_opened": int(session_opened),
                "output": output,
                "error": error,
                "poc_output": poc_output,
                "source_ip": _to_text(payload.get("source_ip") or ""),
                "created_at": created_at,
            }
        )

    def consume_finding(payload: dict, created_at: float) -> None:
        flat = _flatten_finding_payload(payload)
        finding_type = _to_text(flat.get("type") or flat.get("finding_type")).lower()
        if not finding_type:
            return

        if finding_type in ("host", "host_discovered"):
            ip = _ip_of(flat, target)
            if not ip:
                return
            host = _ensure_host(hosts_map, ip)
            hostname = _to_text(flat.get("hostname"))
            if hostname and not host["hostname"]:
                host["hostname"] = hostname

            os_raw = flat.get("os_type") or flat.get("os")
            if isinstance(os_raw, dict):
                os_name = _to_text(os_raw.get("name"))
            else:
                os_name = _to_text(os_raw)
            if os_name and (not host["os"] or len(os_name) > len(host["os"])):
                host["os"] = os_name

            for port in flat.get("ports") or []:
                if not isinstance(port, dict):
                    continue
                state = _to_text(port.get("state") or "open").lower()
                if state and state != "open":
                    continue
                pnum = _to_int(port.get("number") or port.get("port") or port.get("portid"), 0)
                _add_open_port(
                    host,
                    pnum,
                    _to_text(port.get("protocol") or "tcp"),
                    _to_text(port.get("service") or port.get("name")),
                    _to_text(port.get("version")),
                )
            return

        if finding_type in ("port_scan", "service_scan"):
            ip = _ip_of(flat, target)
            if not ip:
                return
            host = _ensure_host(hosts_map, ip)
            open_hint = _to_int(flat.get("open_ports"), 0)
            if open_hint > 0:
                host_open_port_hint[ip] = max(host_open_port_hint.get(ip, 0), open_hint)

            for svc in flat.get("services") or []:
                if not isinstance(svc, dict):
                    continue
                pnum = _to_int(svc.get("port") or svc.get("number") or svc.get("portid"), 0)
                _add_open_port(
                    host,
                    pnum,
                    _to_text(svc.get("protocol") or "tcp"),
                    _to_text(svc.get("service") or svc.get("name")),
                    _to_text(svc.get("version")),
                )
            return

        if finding_type == "os_detection":
            ip = _ip_of(flat, target)
            if not ip:
                return
            host = _ensure_host(hosts_map, ip)
            os_raw = flat.get("os")
            os_name = _to_text(os_raw.get("name") if isinstance(os_raw, dict) else os_raw)
            if os_name:
                host["os"] = os_name
            return

        if finding_type in ("vulnerability", "vuln", "cve"):
            add_vulnerability(flat, created_at)
            return

        if finding_type in ("exploit_attempt", "session", "session_opened", "shell_opened", "flag"):
            add_exploit(flat, finding_type, created_at)
            return

    for event in events:
        if not isinstance(event, dict):
            continue
        event_type = _to_text(event.get("event_type"))
        data = event.get("data") if isinstance(event.get("data"), dict) else {}
        created_at = _to_float(event.get("created_at"), 0.0)
        if created_at > last_event_ts:
            last_event_ts = created_at

        if event_type == "finding":
            consume_finding(data, created_at)
            continue

        if event_type != "tool_result":
            continue

        tool_name = _to_text(data.get("tool") or data.get("name") or data.get("tool_name")).lower()

        if tool_name == "report_finding":
            parsed = _parse_jsonish(data.get("output"))
            if isinstance(parsed, dict):
                pseudo = {
                    "type": parsed.get("finding_type") or parsed.get("type") or "unknown",
                }
                details = parsed.get("data")
                if isinstance(details, dict):
                    pseudo.update(details)
                consume_finding(pseudo, created_at)
            continue

        if tool_name == "nmap_scan":
            parsed = _parse_jsonish(data.get("output"))
            if not isinstance(parsed, dict):
                continue
            for host_data in parsed.get("hosts") or []:
                if not isinstance(host_data, dict):
                    continue
                ip = _ip_of(host_data, target)
                if not ip:
                    continue
                host = _ensure_host(hosts_map, ip)
                if not host["hostname"]:
                    host["hostname"] = _to_text(host_data.get("hostname"))
                os_raw = host_data.get("os")
                os_name = _to_text(os_raw.get("name") if isinstance(os_raw, dict) else os_raw)
                if os_name and not host["os"]:
                    host["os"] = os_name
                for port in host_data.get("ports") or []:
                    if not isinstance(port, dict):
                        continue
                    state = _to_text(port.get("state") or "open").lower()
                    if state and state != "open":
                        continue
                    pnum = _to_int(port.get("number") or port.get("port") or port.get("portid"), 0)
                    _add_open_port(
                        host,
                        pnum,
                        _to_text(port.get("protocol") or "tcp"),
                        _to_text(port.get("service") or port.get("name")),
                        _to_text(port.get("version")),
                    )
            continue

        if tool_name == "searchsploit_search":
            parsed = _parse_jsonish(data.get("output"))
            if not isinstance(parsed, dict):
                continue

            vulns = parsed.get("vulnerabilities")
            if not isinstance(vulns, list) or not vulns:
                continue

            service_guess = _service_from_query(_to_text(parsed.get("query")))
            for item in vulns[:6]:
                if not isinstance(item, dict):
                    continue
                row = {
                    "title": _to_text(item.get("title") or item.get("description") or "Potential exploit match"),
                    "description": _to_text(item.get("description") or "Derived from searchsploit result."),
                    "cve_id": _to_text(item.get("cve_id") or item.get("cve") or ""),
                    "cvss_score": _guess_cvss(item),
                    "exploit_path": _to_text(item.get("exploit_path") or item.get("path") or item.get("module") or ""),
                    "exploit_type": _to_text(item.get("exploit_type") or "exploit_db"),
                    "platform": _to_text(item.get("platform") or ""),
                    "service": _to_text(item.get("service") or service_guess),
                    "service_version": _to_text(item.get("version") or ""),
                    "host_ip": _to_text(target),
                }
                add_vulnerability(row, created_at)

        if tool_name == "metasploit_run":
            parsed = _parse_jsonish(data.get("output"))
            if isinstance(parsed, dict):
                pseudo = {
                    "type": "session" if parsed.get("session_id") else "exploit_attempt",
                    "host_ip": _to_text(target),
                    "module": _to_text(parsed.get("module") or ""),
                    "port": _to_int(parsed.get("rport") or parsed.get("port"), 0),
                    "success": bool(parsed.get("session_id")),
                    "session_id": parsed.get("session_id"),
                    "output": _to_text(parsed.get("output") or parsed.get("result") or ""),
                    "error": _to_text(parsed.get("error") or ""),
                }
                consume_finding(pseudo, created_at)

    hosts_list: list[dict] = []
    for ip in sorted(hosts_map.keys()):
        host = hosts_map[ip]
        ports = sorted(
            host["ports"].values(),
            key=lambda p: (_to_int(p.get("number"), 0), _to_text(p.get("protocol") or "tcp")),
        )
        hosts_list.append(
            {
                "ip": ip,
                "hostname": host["hostname"],
                "os": host["os"],
                "os_accuracy": 0,
                "state": "up",
                "ports": ports,
            }
        )

    scan_results: list[dict] = []
    if hosts_list:
        scan_results.append(
            {
                "target": _to_text(target) or hosts_list[0]["ip"],
                "scan_type": "recovered_from_events",
                "hosts": hosts_list,
                "duration_seconds": 0.0,
                "created_at": last_event_ts,
            }
        )

    vulnerabilities.sort(key=lambda v: (_to_float(v.get("cvss_score"), 0.0), _to_text(v.get("title"))), reverse=True)
    exploit_results.sort(key=lambda e: _to_float(e.get("created_at"), 0.0))

    return {
        "scan_results": scan_results,
        "vulnerabilities": vulnerabilities,
        "exploit_results": exploit_results,
        "port_hint_total": sum(host_open_port_hint.values()),
        "hinted_hosts": len(host_open_port_hint),
    }


def compute_session_stats(
    scan_results: list[dict],
    vulnerabilities: list[dict],
    exploit_results: list[dict],
    *,
    port_hint_total: int = 0,
    hinted_hosts: int = 0,
) -> dict:
    hosts: set[str] = set()
    open_ports: set[tuple[str, int, str]] = set()

    for scan in scan_results or []:
        for host in scan.get("hosts") or []:
            if not isinstance(host, dict):
                continue
            ip = _to_text(host.get("ip"))
            if not ip:
                continue
            hosts.add(ip)
            for port in host.get("ports") or []:
                if not isinstance(port, dict):
                    continue
                state = _to_text(port.get("state") or "open").lower()
                if state and state != "open":
                    continue
                pnum = _to_int(port.get("number") or port.get("port"), 0)
                proto = _to_text(port.get("protocol") or "tcp") or "tcp"
                if pnum > 0:
                    open_ports.add((ip, pnum, proto))

    if not hosts:
        for row in vulnerabilities or []:
            ip = _to_text(row.get("host_ip"))
            if ip:
                hosts.add(ip)
        for row in exploit_results or []:
            ip = _to_text(row.get("host_ip") or row.get("target_ip"))
            if ip:
                hosts.add(ip)

    open_count = len(open_ports)
    ports_found = open_count

    if port_hint_total > 0:
        if open_count <= 0:
            ports_found = port_hint_total
        elif hinted_hosts > 0 and hinted_hosts >= len(hosts):
            ports_found = min(open_count, port_hint_total)

    return {
        "hosts_found": len(hosts),
        "ports_found": int(ports_found),
        "vulns_found": len(vulnerabilities or []),
        "exploits_run": len(exploit_results or []),
    }


async def recover_session_findings_from_events(
    *,
    session_id: str,
    target: str,
    session_repo: SessionRepository,
    scan_repo: ScanResultRepository,
    vuln_repo: VulnerabilityRepository,
    exploit_repo: ExploitResultRepository,
    event_repo: SessionEventRepository | None = None,
    persist: bool = True,
) -> dict:
    """
    Backfill scan/vuln/exploit repositories from session events when needed.

    When persist=True:
      - missing categories are inserted into normalized tables
      - pentest_sessions stats are refreshed
    """
    event_repo = event_repo or SessionEventRepository()

    current_scans = await scan_repo.get_for_session(session_id)
    current_vulns = await vuln_repo.get_for_session(session_id)
    current_exploits = await exploit_repo.get_for_session(session_id)

    events = await event_repo.get_for_session(session_id, limit=6000)
    derived = derive_session_data_from_events(events, target=target)

    inserted = {"scan_results": 0, "vulnerabilities": 0, "exploit_results": 0}

    if persist and not current_scans and derived["scan_results"]:
        for row in derived["scan_results"]:
            await scan_repo.save(
                session_id=session_id,
                target=_to_text(row.get("target") or target),
                scan_type=_to_text(row.get("scan_type") or "recovered_from_events"),
                hosts=list(row.get("hosts") or []),
                duration_seconds=_to_float(row.get("duration_seconds"), 0.0),
            )
            inserted["scan_results"] += 1

    if persist and not current_vulns and derived["vulnerabilities"]:
        for vuln in derived["vulnerabilities"]:
            await vuln_repo.save(session_id=session_id, vuln=vuln)
            inserted["vulnerabilities"] += 1

    if persist and not current_exploits and derived["exploit_results"]:
        for result in derived["exploit_results"]:
            await exploit_repo.save(session_id=session_id, result=result)
            inserted["exploit_results"] += 1

    final_scans = await scan_repo.get_for_session(session_id) if persist else list(current_scans)
    final_vulns = await vuln_repo.get_for_session(session_id) if persist else list(current_vulns)
    final_exploits = await exploit_repo.get_for_session(session_id) if persist else list(current_exploits)

    if not final_scans:
        final_scans = list(derived["scan_results"])
    if not final_vulns:
        final_vulns = list(derived["vulnerabilities"])
    if not final_exploits:
        final_exploits = list(derived["exploit_results"])

    stats = compute_session_stats(
        final_scans,
        final_vulns,
        final_exploits,
        port_hint_total=_to_int(derived.get("port_hint_total"), 0),
        hinted_hosts=_to_int(derived.get("hinted_hosts"), 0),
    )

    if persist:
        await session_repo.update_stats(
            session_id,
            hosts_found=stats["hosts_found"],
            ports_found=stats["ports_found"],
            vulns_found=stats["vulns_found"],
            exploits_run=stats["exploits_run"],
        )

    logger.info(
        "Session recovery %s | scans=%d vulns=%d exploits=%d inserted=%s stats=%s",
        session_id[:8],
        len(final_scans),
        len(final_vulns),
        len(final_exploits),
        inserted,
        stats,
    )

    return {
        "scan_results": final_scans,
        "vulnerabilities": final_vulns,
        "exploit_results": final_exploits,
        "stats": stats,
        "inserted": inserted,
        "derived": derived,
    }
