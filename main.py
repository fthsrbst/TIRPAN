"""
TIRPAN — Main entry point.

Modes
-----
  server             Start the web UI (default)
  run                Run a pentest directly from the terminal (no web UI)

Examples
--------
  python main.py                                           # web UI on :8000
  python main.py --host 0.0.0.0 --port 9000               # expose on network
  python main.py --no-reload                               # production mode
  python main.py run --target 192.168.1.0/24               # terminal scan
  python main.py run --target 10.0.0.1 --mode full_auto   # full auto attack
  python main.py run --target 10.0.0.5 --mode scan_only --time-limit 300
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys
from pathlib import Path

import uvicorn
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from config import SafetyConfig, settings
from core.tool_registry import ToolRegistry
from tools.metasploit_tool import MetasploitTool
from tools.nmap_tool import NmapTool
from tools.searchsploit_tool import SearchSploitTool
from tools.ssh_tool import SSHTool
from tools.shell_session_tool import ShellSessionTool

console = Console()
logger = logging.getLogger(__name__)

_VERSION = "0.1.0"

ASCII_BANNER = r"""
     _    _____ ____ ___ ____
    / \  | ____/ ___|_ _/ ___|
   / _ \ |  _|| |  _ | |\___ \
  / ___ \| |__| |_| || | ___) |
 /_/   \_\_____\____|___|____/
"""


# ── Tool Registry ──────────────────────────────────────────────────────────────

def build_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(NmapTool())
    registry.register(SearchSploitTool())
    registry.register(MetasploitTool())
    registry.register(SSHTool())
    registry.register(ShellSessionTool())
    registry.load_plugins(Path("plugins/"))
    return registry


# ── Rich Banner ────────────────────────────────────────────────────────────────

def print_banner(subtitle: str = "") -> None:
    console.print(
        Panel(
            f"[bold green]{ASCII_BANNER}[/bold green]\n"
            f"[dim]Autonomous Penetration Testing & Network Defense[/dim]"
            + (f"\n[cyan]{subtitle}[/cyan]" if subtitle else ""),
            title=f"[bold white]TIRPAN v{_VERSION}[/bold white]",
            border_style="green",
            padding=(0, 2),
        )
    )


def print_server_info(host: str, port: int, registry: ToolRegistry) -> None:
    t = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
    t.add_column(style="dim")
    t.add_column(style="white")
    t.add_row("URL", f"[link]http://{host}:{port}[/link]")
    t.add_row("Mode", "Web UI")
    t.add_row("Tools", ", ".join(m.metadata.name for m in registry._tools.values()))
    t.add_row("LLM", f"{settings.llm.provider} / {settings.ollama.model}")
    console.print(t)
    console.print("[dim]Press Ctrl+C to stop.[/dim]\n")


def print_run_config(
    target: str,
    mode: str,
    safety: SafetyConfig,
    registry: ToolRegistry,
) -> None:
    t = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
    t.add_column(style="dim")
    t.add_column(style="white")
    t.add_row("Target", f"[bold cyan]{target}[/bold cyan]")
    t.add_row("Mode", f"[bold yellow]{mode}[/bold yellow]")
    t.add_row("Scope", safety.allowed_cidr or "unrestricted")
    t.add_row("Exploits", "[red]ENABLED[/red]" if safety.allow_exploit else "[green]DISABLED (scan only)[/green]")
    t.add_row("Time limit", f"{safety.session_max_seconds}s" if safety.session_max_seconds else "none")
    t.add_row("Rate limit", f"{safety.max_requests_per_second} req/s")
    t.add_row("LLM", f"{settings.llm.provider} / {settings.ollama.model}")
    t.add_row("Tools", ", ".join(m.metadata.name for m in registry._tools.values()))
    console.print(t)


# ── Argument Parser ────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        prog="tirpan",
        description="TIRPAN — Autonomous Penetration Testing Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  python main.py                                 start web UI on localhost:8000
  python main.py --host 0.0.0.0 --port 9000     expose web UI on the network
  python main.py run --target 192.168.1.0/24    terminal scan (scan_only)
  python main.py run --target 10.0.0.1 \\
        --mode full_auto \\
        --scope 10.0.0.0/24 \\
        --time-limit 600                         full auto with 10-minute cap
""",
    )

    # ── Shared server flags (apply to default "server" mode) ──────────────────
    root.add_argument("--host", default=settings.server.host,
                      help="bind address (default: %(default)s)")
    root.add_argument("--port", type=int, default=settings.server.port,
                      help="listen port (default: %(default)s)")
    root.add_argument("--no-reload", action="store_true",
                      help="disable hot-reload (recommended for production)")
    root.add_argument("--log-level",
                      choices=["debug", "info", "warning", "error"],
                      default="info",
                      help="logging verbosity (default: %(default)s)")

    subparsers = root.add_subparsers(dest="command")

    # ── Sub-command: run ──────────────────────────────────────────────────────
    run_p = subparsers.add_parser(
        "run",
        help="run a pentest directly from the terminal (no web UI)",
        description="Run the TIRPAN pentest agent directly in the terminal.",
    )
    run_p.add_argument(
        "--target", "-t", required=True,
        help="target IP address or CIDR range (e.g. 192.168.1.0/24)",
    )
    run_p.add_argument(
        "--mode", "-m",
        choices=["full_auto", "ask_before_exploit", "scan_only"],
        default="scan_only",
        help="operation mode (default: %(default)s)",
    )
    run_p.add_argument(
        "--scope",
        default="0.0.0.0/0",
        metavar="CIDR",
        help="restrict scanning to this CIDR (default: unrestricted)",
    )
    run_p.add_argument(
        "--exclude-ips", default="",
        metavar="IP[,IP]",
        help="comma-separated IPs to skip (e.g. 192.168.1.1,192.168.1.254)",
    )
    run_p.add_argument(
        "--exclude-ports", default="",
        metavar="PORT[,PORT]",
        help="comma-separated ports to never probe",
    )
    run_p.add_argument(
        "--time-limit", type=int, default=0,
        metavar="SECONDS",
        help="auto-stop after N seconds (0 = no limit)",
    )
    run_p.add_argument(
        "--rate-limit", type=int, default=10,
        metavar="REQ/S",
        help="max requests per second (default: %(default)s)",
    )
    run_p.add_argument(
        "--max-iterations", type=int, default=50,
        metavar="N",
        help="max agent iterations (default: %(default)s)",
    )
    run_p.add_argument(
        "--no-dos-block", action="store_true",
        help="allow DoS-category exploits (dangerous — use with caution)",
    )
    run_p.add_argument(
        "--no-destructive-block", action="store_true",
        help="allow destructive exploits (dangerous — use with caution)",
    )
    run_p.add_argument(
        "--output", "-o",
        metavar="DIR",
        help="directory to save the report (default: reports/)",
    )

    return root


# ── Terminal pentest runner ────────────────────────────────────────────────────

async def run_pentest(args: argparse.Namespace, registry: ToolRegistry) -> int:
    """Run the agent in terminal mode and stream events to stdout."""
    import uuid

    from core.agent import PentestAgent
    from core.safety import SafetyGuard
    from models.session import Session

    excluded_ips = [ip.strip() for ip in args.exclude_ips.split(",") if ip.strip()]
    excluded_ports = [
        int(p.strip()) for p in args.exclude_ports.split(",")
        if p.strip().isdigit()
    ]

    safety_cfg = SafetyConfig(
        allowed_cidr=args.scope,
        excluded_ips=excluded_ips,
        excluded_ports=excluded_ports,
        allow_exploit=(args.mode != "scan_only"),
        block_dos_exploits=not args.no_dos_block,
        block_destructive=not args.no_destructive_block,
        session_max_seconds=args.time_limit or 0,
        max_requests_per_second=args.rate_limit,
    )

    print_run_config(args.target, args.mode, safety_cfg, registry)
    console.print()

    session = Session(
        id=str(uuid.uuid4()),
        target=args.target,
        mode=args.mode,
    )

    safety = SafetyGuard(safety_cfg)
    agent = PentestAgent(
        session=session,
        target=args.target,
        mode=args.mode,
        registry=registry,
        safety=safety,
        max_iterations=args.max_iterations,
        progress_callback=_terminal_progress,
    )

    # Graceful Ctrl+C handling
    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def _sigint_handler(*_):
        console.print("\n[yellow]Interrupt received — stopping agent...[/yellow]")
        agent._safety.emergency_stop()
        stop_event.set()

    try:
        loop.add_signal_handler(signal.SIGINT, _sigint_handler)
    except NotImplementedError:
        # Windows
        signal.signal(signal.SIGINT, _sigint_handler)

    console.rule("[bold green]MISSION START[/bold green]")

    try:
        ctx = await agent.run()
    except Exception as exc:
        console.print(f"\n[bold red]MISSION FAILED:[/bold red] {exc}")
        logger.exception("Agent run failed")
        return 1
    finally:
        import contextlib
        with contextlib.suppress(NotImplementedError):
            loop.remove_signal_handler(signal.SIGINT)

    # ── Summary ───────────────────────────────────────────────────────────────
    console.rule("[bold green]MISSION COMPLETE[/bold green]")
    summary = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
    summary.add_column(style="dim")
    summary.add_column(style="bold white")
    summary.add_row("Hosts found", str(len(ctx.discovered_hosts)))
    summary.add_row("Open ports",  str(ctx.total_ports))
    summary.add_row("Vulns found", str(ctx.total_vulns))
    summary.add_row("Exploits run", str(ctx.total_exploits))
    summary.add_row("Iterations",  str(ctx.iteration))
    console.print(summary)

    # ── Report ────────────────────────────────────────────────────────────────
    if ctx.discovered_hosts or ctx.scan_results:
        report_dir = Path(args.output) if getattr(args, "output", None) else Path("reports")
        await _save_terminal_report(session, ctx, report_dir)

    return 0


def _terminal_progress(event: str, data: dict) -> None:
    """Stream agent events to the Rich console."""
    if event == "reasoning":
        thought = data.get("thought", "")
        action = data.get("action", "")
        if thought:
            console.print(f"[yellow dim]  THINK:[/yellow dim]  {thought}")
        if action:
            console.print(f"[cyan]  ACTION:[/cyan] [bold]{action}[/bold]")

    elif event == "tool_call":
        tool = data.get("tool", "")
        params = data.get("params", {})
        console.print(f"[blue]  CALL:[/blue]   [bold]{tool}[/bold]  {params}")

    elif event == "tool_result":
        tool = data.get("tool", "")
        success = data.get("success", False)
        icon = "[green]OK[/green]" if success else "[red]FAILED[/red]"
        output_preview = str(data.get("output", "") or "")[:120].replace("\n", " ")
        console.print(f"[blue]  RESULT:[/blue]  {tool} → {icon}  {output_preview}")

    elif event == "phase_change":
        phase = data.get("attack_phase", "")
        console.rule(f"[bold cyan]Phase: {phase}[/bold cyan]")

    elif event == "reflection":
        content = data.get("content", "")
        if content:
            console.print(f"[purple dim]  REFLECT:[/purple dim] {content[:160]}")

    elif event == "safety_block":
        tool = data.get("tool", "")
        reason = data.get("reason", "")
        console.print(f"[orange3]  SAFETY:[/orange3]  Blocked {tool} — {reason}")

    elif event == "error":
        console.print(f"[bold red]  ERROR:[/bold red]   {data.get('error', '')}")

    elif event == "max_iterations":
        console.print("[yellow]  MAX ITERATIONS reached — wrapping up.[/yellow]")

    elif event == "kill_switch":
        console.print("[bold red]  KILL SWITCH activated.[/bold red]")


async def _save_terminal_report(session, ctx, report_dir: Path) -> None:
    """Attempt to generate an HTML report after a terminal run."""
    try:
        from database.db import init_db
        from database.repositories import SessionRepository
        from reporting.report_generator import ReportGenerator

        await init_db()
        repo = SessionRepository()
        await repo.create(session)
        await repo.update_stats(
            session.id,
            hosts_found=len(ctx.discovered_hosts),
            ports_found=ctx.total_ports,
            vulns_found=ctx.total_vulns,
            exploits_run=ctx.total_exploits,
        )
        await repo.update_status(session.id, "done")

        report_dir.mkdir(parents=True, exist_ok=True)
        gen = ReportGenerator()
        html = await gen.generate_html(session.id)
        out_path = report_dir / f"{session.id[:8]}_report.html"
        out_path.write_text(html, encoding="utf-8")
        console.print(f"\n[green]Report saved:[/green] {out_path}")
    except Exception as exc:
        console.print(f"[yellow]Report generation skipped:[/yellow] {exc}")


# ── Entry Point ────────────────────────────────────────────────────────────────

def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(levelname)-8s %(name)s: %(message)s",
    )

    registry = build_registry()

    if args.command == "run":
        # ── Terminal pentest mode ──────────────────────────────────────────────
        print_banner(f"Terminal Mode  ·  target: {args.target}  ·  mode: {args.mode}")
        console.print()
        return asyncio.run(run_pentest(args, registry))

    else:
        # ── Web server mode (default) ──────────────────────────────────────────
        print_banner("Web UI Mode")
        print_server_info(args.host, args.port, registry)

        reload = not args.no_reload
        try:
            uvicorn.run(
                "web.app:app",
                host=args.host,
                port=args.port,
                reload=reload,
                reload_dirs=["web", "core", "tools"] if reload else None,
                reload_excludes=["*.pyc", "*.db-shm", "*.db-wal"],
                log_level=args.log_level,
            )
        except KeyboardInterrupt:
            console.print("\n[dim]Server stopped.[/dim]")
        return 0


if __name__ == "__main__":
    sys.exit(main())
