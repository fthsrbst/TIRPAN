# AEGIS — Safety & Legal Guidelines

## Legal Requirements

> WARNING: Penetration testing without authorization is ILLEGAL in most countries.

### Before EVERY test:

1. **Written authorization** from the system owner
2. **Defined scope** (exactly which IPs/systems/domains)
3. **Rules of engagement** (what's allowed, what's not)
4. **Time window** (when testing is permitted)

### You MUST have:

- Explicit written permission
- Defined scope boundaries
- Emergency contact information
- Understanding of local laws (CFAA in US, Computer Misuse Act in UK, TCK 243-244 in TR, etc.)

---

## Technical Safety Rules

### 10 Configurable Guardrails (V1 — apply to every tool call)

| # | Rule | Config Key | Default | Description |
|---|------|-----------|---------|-------------|
| 1 | Target Scope | `allowed_cidr` | REQUIRED | CIDR range — only these IPs allowed |
| 2 | Port Scope | `allowed_port_min/max` | `1-65535` | Which ports can be scanned |
| 3 | Excluded IPs | `excluded_ips` | `[]` | IPs to always skip (e.g., routers, DNS) |
| 4 | Excluded Ports | `excluded_ports` | `[]` | Ports to always skip |
| 5 | Scan-Only Mode | `allow_exploit` | `true` | Set false to disable all exploits |
| 6 | No DoS | `block_dos_exploits` | `true` | Block all denial-of-service attacks |
| 7 | No Destructive | `block_destructive` | `true` | Block data-modifying / wipe exploits |
| 8 | Max Severity | `max_cvss_score` | `10.0` | Maximum CVSS score to attempt |
| 9 | Time Limit | `session_max_seconds` | `3600` | Auto-stop after N seconds |
| 10 | Rate Limit | `max_requests_per_second` | `10` | Prevent network flooding |

### Kill Switch

- **Web UI:** Red button — immediately stops all agents and tools
- **API:** `POST /api/v1/sessions/{sid}/kill`
- **Effect:** Sets kill switch flag → blocks ALL future actions immediately
- **Audit:** Kill event logged with timestamp and triggering user/reason

---

## V2 Permission Flags

V2 adds post-exploitation capabilities that are **disabled by default**.
Operators must explicitly enable each one in the mission configuration.

| Flag | Default | What it enables |
|------|---------|-----------------|
| `allow_persistence` | `false` | Crontab, systemd, SSH key, registry backdoors |
| `allow_credential_harvest` | `false` | /etc/shadow dump, mimikatz, browser credentials |
| `allow_lateral_movement` | `false` | Credential spray, PSExec, pass-the-hash, pivoting |
| `allow_data_exfil` | `false` | File download from target systems |
| `allow_docker_escape` | `false` | Container escape techniques |

**These flags MUST be explicitly set to `true` in the StartSessionRequest.**
The safety pipeline checks them before every relevant action — even if an agent attempts
to bypass them, the action is blocked and audit-logged.

### Example: Full Authorized Red Team Mission

```json
{
  "target": "192.168.1.0/24",
  "mode": "full_auto",
  "allow_persistence": true,
  "allow_credential_harvest": true,
  "allow_lateral_movement": true,
  "allow_data_exfil": false,
  "allow_docker_escape": false
}
```

### Example: Scan + Exploit Only (No Post-Exploitation)

```json
{
  "target": "10.0.0.5",
  "mode": "full_auto"
  // all allow_* flags default to false
}
```

---

## Audit Logging

Every action taken by every agent is logged to the `audit_log` table with:
- `session_id` — which mission
- `agent_id` — which agent (Brain, Scanner, Exploit, etc.) made the call
- `event_type` — what happened
- `tool_name` — which tool was called
- `target` — what was targeted
- `details` — full JSON payload
- `created_at` — timestamp

**Audit log is append-only.** Nothing is ever deleted or modified.

Example entries:
```
[2026-03-21 10:32:15] SESSION_START      agent=brain       target=192.168.1.0/24
[2026-03-21 10:32:16] AGENT_SPAWNED      agent=brain       spawned=scanner
[2026-03-21 10:32:17] TOOL_CALL          agent=scanner     tool=nmap_scan       ALLOWED
[2026-03-21 10:32:45] TOOL_RESULT        agent=scanner     hosts_found=4
[2026-03-21 10:33:00] AGENT_SPAWNED      agent=brain       spawned=exploit
[2026-03-21 10:33:01] SAFETY_BLOCK       agent=exploit     reason="target outside scope"
[2026-03-21 10:35:00] TOOL_CALL          agent=exploit     tool=metasploit_run  ALLOWED
[2026-03-21 10:35:12] SHELL_OPENED       agent=shell_mgr   host=192.168.1.5     priv=user
[2026-03-21 10:36:00] SAFETY_BLOCK       agent=postexploit reason="allow_credential_harvest=false"
[2026-03-21 10:45:00] SESSION_END        agent=brain       duration=780s
```

---

## Shell Command Safety

When agents execute commands on target systems through the Shell Manager,
the following commands are always blocked regardless of permission flags:

- `rm -rf /` or any recursive delete to root paths
- `dd` targeting system devices
- `mkfs` — filesystem formatting
- `shutdown`, `reboot`, `halt` — system control
- Commands piping to `/dev/` devices
- `iptables -F` or full firewall flush (blocks AEGIS's own access)

---

## Safe Practice Environments

**Always test against systems you own or have explicit authorization for.**

| Environment | Type | Setup |
|------------|------|-------|
| Metasploitable 2 | Vulnerable VM | `docker run -d tleemcjr/metasploitable2` |
| DVWA | Vulnerable web app | `docker run -d vulnerables/web-dvwa` |
| VulnHub | Downloadable VMs | vulnhub.com |
| HackTheBox | Online CTF platform | hackthebox.com |
| TryHackMe | Beginner-friendly labs | tryhackme.com |
| Internal lab | VirtualBox VMs | See: [12_LAB_ENVIRONMENT.md](12_LAB_ENVIRONMENT.md) |

---

## Ethical Guidelines

1. **Only test systems you own or have explicit written permission to test**
2. **Never use this tool for malicious purposes**
3. **Report vulnerabilities responsibly** — notify the owner before public disclosure
4. **Minimize impact** — prefer read-only techniques unless exploitation is specifically authorized
5. **Keep audit logs** — maintain records for accountability and client reporting
6. **Handle harvested data carefully** — treat credentials and sensitive data with confidentiality
7. **This tool is for DEFENSIVE security** — helping organizations find and fix vulnerabilities

---

## Multi-Agent Safety Notes

With V2's multi-agent architecture, additional considerations apply:

- **Each agent is audited independently** — the audit log records which specific agent
  (Brain, Scanner, Exploit, etc.) performed each action
- **Brain cannot override safety rules** — even the Brain Agent's tool calls go through
  the same SafetyGuard pipeline as all other agents
- **Shell Manager command execution is also audited** — every command run via
  `shell_manager.execute()` is logged with the requesting agent's ID
- **Permission flags are mission-level** — they cannot be changed mid-mission
  by any agent, including Brain
- **Pause applies to all agents** — pausing a mission halts all spawned agents,
  not just the one currently running
