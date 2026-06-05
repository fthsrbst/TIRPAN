"""
Deterministic Metasploit-module → CVE → CVSS resolution.

When an exploit *succeeds* (a shell/RCE is confirmed) we want to record a real
vulnerability with a meaningful CVSS score — not leave it as a bare exploit_results
row that the UI/report vuln counter never sees. The exploit/brain layer used to
publish only "session"/"exploit_attempt" findings on success, so confirmed wins
(e.g. vsftpd 2.3.4 backdoor, Samba usermap_script) never appeared in the
`vulnerabilities` table and their CVSS never reached the report. This module is the
bridge: module name → CVE → CVSS, with a sane fallback for confirmed RCE.

CVE→CVSS scores are sourced from the curated table in tools.searchsploit_tool so
there is a single source of truth.
"""

from __future__ import annotations

# Single source of truth for CVE→CVSS scores.
try:  # pragma: no cover - defensive import
    from tools.searchsploit_tool import _KNOWN_CVE_CVSS as _CVE_CVSS
except Exception:  # pragma: no cover
    _CVE_CVSS: dict[str, float] = {}

# Metasploit module path (or a distinctive substring of it) → CVE.
# Matched case-insensitively by substring, so both
# "exploit/unix/ftp/vsftpd_234_backdoor" and a bare "vsftpd_234_backdoor" resolve.
_MODULE_CVE: dict[str, str] = {
    # ── Metasploitable 2 staples ──────────────────────────────────────────────
    "vsftpd_234_backdoor":        "CVE-2011-2523",   # vsftpd 2.3.4 backdoor
    "usermap_script":             "CVE-2007-2447",   # Samba usermap_script RCE
    "unreal_ircd_3281_backdoor":  "CVE-2010-2075",   # UnrealIRCd 3.2.8.1 backdoor
    "distcc_exec":                "CVE-2004-2687",    # distccd RCE
    "java_rmi_server":            "CVE-2011-3556",    # Java RMI server
    "php_cgi_arg_injection":      "CVE-2012-1823",    # PHP-CGI argument injection
    "twiki_history":              "CVE-2005-2877",    # TWiki history RCE
    # ── Broader coverage (best-effort) ────────────────────────────────────────
    "proftpd_modcopy_exec":       "CVE-2015-3306",    # ProFTPD mod_copy
    "tomcat_mgr_upload":          "CVE-2017-12617",   # Tomcat manager upload/PUT RCE
    "tomcat_jsp_upload_bypass":   "CVE-2017-12615",
    "ms08_067_netapi":            "CVE-2008-4250",    # Conficker
    "ms17_010_eternalblue":       "CVE-2017-0144",    # EternalBlue
    "is_known_pipename":          "CVE-2017-7494",    # SambaCry
    "drupal_drupalgeddon2":       "CVE-2018-7600",
    "apache_mod_cgi_bash_env":    "CVE-2014-6271",    # Shellshock
    "shellshock":                 "CVE-2014-6271",
    "heartbleed":                 "CVE-2014-0160",
    "jboss":                      "CVE-2017-12149",
    "php_cgi":                    "CVE-2012-1823",
}

# Confirmed unauthenticated remote shell ⇒ critical by definition. Used only when
# no specific CVE/CVSS is known for the module that produced the shell.
_DEFAULT_SHELL_CVSS = 9.8
_DEFAULT_RCE_CVSS = 8.8


def cve_for_module(module: str) -> str:
    """Best-effort CVE lookup for a Metasploit module path. Empty string if unknown."""
    m = (module or "").lower()
    if not m:
        return ""
    for key, cve in _MODULE_CVE.items():
        if key and key in m:
            return cve
    return ""


def cvss_for_cve(cve: str) -> float:
    """CVSS base score for a CVE from the curated table; 0.0 if unknown."""
    if not cve:
        return 0.0
    return float(_CVE_CVSS.get(cve.upper(), 0.0))


def resolve_cvss(module: str = "", cve: str = "", *, got_shell: bool = True) -> tuple[str, float]:
    """
    Resolve (cve, cvss) for a confirmed exploit.

    Prefers an explicit CVE, then the module→CVE map, then a severity-appropriate
    default for a confirmed shell/RCE so a real win is never recorded as CVSS 0.
    """
    resolved_cve = (cve or "").strip() or cve_for_module(module)
    score = cvss_for_cve(resolved_cve)
    if score <= 0.0:
        score = _DEFAULT_SHELL_CVSS if got_shell else _DEFAULT_RCE_CVSS
    return resolved_cve, score


def vuln_from_exploit(
    *,
    module: str,
    host_ip: str,
    port: int = 0,
    service: str = "",
    cve: str = "",
    got_shell: bool = True,
) -> dict:
    """
    Build a vulnerability finding dict from a *confirmed* successful exploit.

    The returned dict is shaped for both ctx.add_vulnerability and
    VulnerabilityRepository.save (finding_type='vulnerability').
    """
    resolved_cve, score = resolve_cvss(module=module, cve=cve, got_shell=got_shell)
    impact = "remote shell obtained" if got_shell else "remote code execution confirmed"
    pretty_module = (module or "").split("/")[-1] or module
    title = f"Confirmed exploit: {pretty_module}"
    if resolved_cve:
        title = f"{resolved_cve} — confirmed exploit ({pretty_module})"
    return {
        "type": "vulnerability",
        "title": title,
        "host_ip": host_ip,
        "port": int(port or 0),
        "service": service or "",
        "cve_id": resolved_cve,
        "cvss_score": score,
        "cvss": score,
        "exploit_path": module or "",
        "module": module or "",
        "exploit_type": "remote",
        "description": (
            f"Vulnerability CONFIRMED by successful exploitation of `{module}` "
            f"against {host_ip}{':' + str(port) if port else ''} — {impact}. "
            "Recorded automatically from a proven exploit (not a candidate match)."
        ),
        "confirmed": True,
    }
