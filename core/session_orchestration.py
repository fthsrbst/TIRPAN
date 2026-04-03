"""
Session orchestration services.

Moves long-running session task lifecycle logic out of web routes so the API
layer stays focused on request/response handling.
"""

from __future__ import annotations

import asyncio
import logging

from database.repositories import (
    AuditLogRepository,
    ExploitResultRepository,
    MissionContextRepository,
    ScanResultRepository,
    SessionRepository,
    VulnerabilityRepository,
)

logger = logging.getLogger(__name__)


async def run_v2_agent_task(
    *,
    session_id: str,
    agent,
    mission_ctx,
    session_repo: SessionRepository,
    audit_repo: AuditLogRepository,
    scan_repo: ScanResultRepository,
    vuln_repo: VulnerabilityRepository,
    exploit_repo: ExploitResultRepository,
    mission_ctx_repo: MissionContextRepository | None = None,
) -> None:
    """Background task for V2 BrainAgent sessions."""
    from web import session_manager
    import core.debug_logger as _dbg

    try:
        await session_repo.update_status(session_id, "running")
        await audit_repo.log("SESSION_START", session_id=session_id, details={"mode": "v2_auto"})

        result = await agent.run()

        if mission_ctx_repo is not None:
            try:
                await mission_ctx_repo.save_context(session_id, mission_ctx.to_dict())
            except Exception:
                pass

        # Flush mission context findings into report repositories.
        try:
            for host_ip, host_info in mission_ctx.hosts.items():
                ports = [
                    {
                        "number": p.number,
                        "protocol": p.protocol,
                        "state": p.state,
                        "service": p.service,
                        "version": p.version,
                    }
                    for p in host_info.ports
                ]
                if ports:
                    await scan_repo.save(
                        session_id=session_id,
                        target=host_ip,
                        scan_type="service",
                        hosts=[{
                            "ip": host_ip,
                            "hostname": host_info.hostname,
                            "os": host_info.os_type,
                            "os_accuracy": 0,
                            "state": "up",
                            "ports": ports,
                        }],
                        duration_seconds=0.0,
                    )
        except Exception as exc:
            logger.warning("V2 scan flush failed: %s", exc)

        try:
            for vuln in mission_ctx.vulnerabilities:
                await vuln_repo.save(session_id=session_id, vuln={
                    "title": vuln.title,
                    "service": vuln.service,
                    "service_version": vuln.version,
                    "cvss_score": vuln.cvss,
                    "cve_id": getattr(vuln, "cve_id", ""),
                    "exploit_path": getattr(vuln, "exploit_path", ""),
                    "exploit_type": getattr(vuln, "exploit_type", ""),
                    "platform": getattr(vuln, "platform", ""),
                    "description": getattr(vuln, "description", ""),
                })
        except Exception as exc:
            logger.warning("V2 vuln flush failed: %s", exc)

        try:
            for sess in mission_ctx.active_sessions:
                await exploit_repo.save(session_id=session_id, result={
                    "host_ip": sess.host_ip,
                    "port": 0,
                    "module": getattr(sess, "module", ""),
                    "payload": "",
                    "success": True,
                    "session_opened": 1,
                    "output": f"{sess.session_type} session opened as {sess.username or 'user'}",
                    "error": "",
                    "poc_output": "",
                    "source_ip": "",
                })
        except Exception as exc:
            logger.warning("V2 exploit flush failed: %s", exc)

        await session_repo.update_status(session_id, "done")
        await session_manager.broadcast(session_id, {
            "type": "session_done",
            "session_id": session_id,
            "v2": True,
            "hosts": len(mission_ctx.hosts),
            "vulnerabilities": len(mission_ctx.vulnerabilities),
            "sessions": len(mission_ctx.active_sessions),
            "credentials": len(mission_ctx.credentials),
            "loot": len(mission_ctx.loot),
            "findings": result.to_dict() if result else {},
            "narrative": getattr(agent, "_mission_narrative", ""),
        })

    except asyncio.CancelledError:
        await session_repo.update_status(session_id, "stopped", "Emergency stop")
        await session_manager.broadcast(session_id, {
            "type": "session_event",
            "session_id": session_id,
            "event": "kill_switch",
            "data": {},
        })

    except Exception as exc:
        logger.error("V2 agent task failed for session %s: %s", session_id, exc)
        await session_repo.update_status(session_id, "error", str(exc))
        await session_manager.broadcast(session_id, {
            "type": "session_error",
            "session_id": session_id,
            "error": str(exc),
        })

    finally:
        session_manager.cleanup(session_id)
        _dbg.unregister_session(session_id)


async def run_agent_task(
    *,
    session_id: str,
    agent,
    session_repo: SessionRepository,
    audit_repo: AuditLogRepository,
) -> None:
    """Background task for V1 PentestAgent sessions."""
    from web import session_manager

    try:
        await session_repo.update_status(session_id, "running")
        await audit_repo.log("SESSION_START", session_id=session_id)

        ctx = await agent.run()

        await session_repo.update_status(session_id, "done")
        await session_repo.update_stats(
            session_id,
            hosts_found=len(ctx.discovered_hosts),
            ports_found=ctx.total_ports,
            vulns_found=ctx.total_vulns,
            exploits_run=ctx.total_exploits,
        )
        await audit_repo.log(
            "SESSION_END",
            session_id=session_id,
            details={
                "hosts": len(ctx.discovered_hosts),
                "ports": ctx.total_ports,
                "vulns": ctx.total_vulns,
                "exploits": ctx.total_exploits,
                "iterations": ctx.iteration,
            },
        )
        await session_manager.broadcast(session_id, {
            "type": "session_done",
            "session_id": session_id,
            "hosts": len(ctx.discovered_hosts),
            "ports": ctx.total_ports,
            "vulns": ctx.total_vulns,
            "exploits": ctx.total_exploits,
            "narrative": "",
        })

    except asyncio.CancelledError:
        logger.warning("Agent task cancelled (emergency stop) for session %s", session_id)
        try:
            _ctx = agent._ctx
            await session_repo.update_stats(
                session_id,
                hosts_found=len(_ctx.discovered_hosts),
                ports_found=_ctx.total_ports,
                vulns_found=_ctx.total_vulns,
                exploits_run=_ctx.total_exploits,
            )
        except Exception:
            pass
        await session_repo.update_status(session_id, "stopped", "Emergency stop triggered by user")
        await audit_repo.log(
            "KILL_SWITCH",
            session_id=session_id,
            details={"reason": "Emergency stop - task cancelled"},
        )
        await session_manager.broadcast(session_id, {
            "type": "session_event",
            "session_id": session_id,
            "event": "kill_switch",
            "data": {},
        })

    except Exception as exc:
        logger.error("Agent task failed for session %s: %s", session_id, exc)
        try:
            _ctx = agent._ctx
            await session_repo.update_stats(
                session_id,
                hosts_found=len(_ctx.discovered_hosts),
                ports_found=_ctx.total_ports,
                vulns_found=_ctx.total_vulns,
                exploits_run=_ctx.total_exploits,
            )
        except Exception:
            pass
        await session_repo.update_status(session_id, "error", str(exc))
        await audit_repo.log("SESSION_ERROR", session_id=session_id, details={"error": str(exc)})
        await session_manager.broadcast(session_id, {
            "type": "session_error",
            "session_id": session_id,
            "error": str(exc),
        })

    finally:
        session_manager.cleanup(session_id)
