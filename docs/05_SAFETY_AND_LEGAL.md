# PenTestAI — Safety & Legal Guidelines

## Legal Requirements

> ⚠️ **IMPORTANT**: Penetration testing without authorization is ILLEGAL in most countries.

### Before EVERY test:
1. **Written authorization** from the system owner
2. **Defined scope** (exactly which IPs/systems)
3. **Rules of engagement** (what's allowed, what's not)
4. **Time window** (when testing is permitted)

### You MUST have:
- Explicit written permission
- Defined scope boundaries
- Emergency contact information
- Understanding of local laws (Computer Fraud and Abuse Act, CFAA in US; similar laws in other countries)

---

## Technical Safety Rules

### 10 Configurable Guardrails

| # | Rule | Config Key | Default | Description |
|---|------|-----------|---------|-------------|
| 1 | Target Scope | `target_scope` | REQUIRED | CIDR range — only these IPs |
| 2 | Port Scope | `port_scope` | `1-65535` | Which ports can be scanned |
| 3 | Excluded IPs | `excluded_ips` | `[]` | IPs to skip (e.g., routers, DNS) |
| 4 | Excluded Ports | `excluded_ports` | `[]` | Ports to skip |
| 5 | Scan-Only Mode | `allow_exploits` | `true` | Set false to disable all exploits |
| 6 | No DoS | `no_dos` | `true` | Block all denial-of-service attacks |
| 7 | No Destructive | `no_destructive` | `true` | Block data-modifying exploits |
| 8 | Max Severity | `max_exploit_severity` | `critical` | Maximum CVSS category to attempt |
| 9 | Time Limit | `max_duration_seconds` | `7200` | Auto-stop after N seconds |
| 10 | Rate Limit | `max_requests_per_second` | `50` | Prevent network flooding |

### Kill Switch
- **Web UI**: Red button in top-right corner
- **Effect**: Immediately terminates all running tools, closes Metasploit sessions
- **Audit**: Kill event is logged with timestamp

### Blocked Commands (Shell Tool)
The shell tool blocks these dangerous commands:
- `rm -rf`, `rm -r /` — recursive delete
- `dd` — disk operations
- `mkfs` — filesystem formatting
- `shutdown`, `reboot`, `halt` — system control
- `iptables` — firewall manipulation
- Any command with `|` to `/dev/` devices
- Anything targeting IPs outside scope

### Audit Logging
Every action the agent takes is logged:
```
[2025-01-15 10:32:15] SESSION_START target=192.168.1.0/24 mode=full_auto
[2025-01-15 10:32:16] TOOL_CALL tool=nmap params="-sn 192.168.1.0/24" status=ALLOWED
[2025-01-15 10:32:45] TOOL_RESULT hosts_found=4
[2025-01-15 10:33:00] TOOL_CALL tool=nmap params="-sV 192.168.1.5" status=ALLOWED
[2025-01-15 10:34:12] SAFETY_BLOCK action="exploit" reason="target 10.0.0.1 outside scope"
[2025-01-15 10:35:00] EXPLOIT_ATTEMPT module=ms17_010 target=192.168.1.5 status=SUCCESS
[2025-01-15 10:45:00] SESSION_END duration=780s findings=3
```

---

## Safe Practice Environments

| Environment | Type | Setup |
|------------|------|-------|
| Metasploitable 2 | Vulnerable VM (Docker) | `docker run -d tleemcjr/metasploitable2` |
| DVWA | Vulnerable web app | `docker run -d vulnerables/web-dvwa` |
| HackTheBox | Online CTF platform | hackthebox.com |
| VulnHub | Downloadable VMs | vulnhub.com |
| TryHackMe | Beginner-friendly labs | tryhackme.com |

---

## Ethical Guidelines

1. **Only test systems you own or have explicit permission to test**
2. **Never use this tool for malicious purposes**
3. **Report vulnerabilities responsibly** (responsible disclosure)
4. **Don't store or exfiltrate sensitive data** from test targets
5. **Keep audit logs** for accountability
6. **This tool is for DEFENSIVE security** — helping organizations find and fix vulnerabilities
