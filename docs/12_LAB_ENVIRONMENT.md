# TIRPAN — Lab Environment & Testing Scenarios
> Professional reference for building an isolated penetration testing laboratory to validate all TIRPAN capabilities.

---

## Table of Contents

1. [Philosophy & Design Decisions](#1-philosophy--design-decisions)
2. [Network Topology](#2-network-topology)
3. [Host Machine Requirements](#3-host-machine-requirements)
4. [VirtualBox Network Configuration](#4-virtualbox-network-configuration)
5. [Virtual Machine Inventory](#5-virtual-machine-inventory)
6. [VM Setup Guides](#6-vm-setup-guides)
7. [WSL → Lab Network Bridge](#7-wsl--lab-network-bridge)
8. [Current Capability Scenarios (V1)](#8-current-capability-scenarios-v1)
9. [Advanced Configuration Scenarios](#9-advanced-configuration-scenarios)
10. [Simulated Corporate Environment (V2 Target)](#10-simulated-corporate-environment-v2-target)
11. [Future Scenarios — Lateral Movement & WLAN](#11-future-scenarios--lateral-movement--wlan)
12. [Lab Maintenance & Reset Procedures](#12-lab-maintenance--reset-procedures)
13. [Legal & Ethical Boundaries](#13-legal--ethical-boundaries)

---

## 1. Philosophy & Design Decisions

### Why VMs over Docker?

| Concern | Docker | VirtualBox VMs |
|---|---|---|
| **Isolated IP addresses** | Shared bridge, NAT issues | Full dedicated IP per machine |
| **Network realism** | Shared kernel, fake interfaces | Real NIC emulation, proper routing |
| **Lateral movement testing** | Complex routing between containers | Multiple subnets, proper gateways |
| **WLAN simulation** | Not possible | Virtual adapters, monitor mode capable |
| **OS fingerprinting** | Same kernel, nmap -O unreliable | Genuine OS signatures |
| **Port conflicts** | Port mapping workarounds | Clean namespace, no conflicts |
| **Snapshot & restore** | Limited | Full state snapshots, instant rollback |
| **MSF persistence** | Resets on container restart | Survives between sessions |

**Decision: VirtualBox VMs with Host-Only networks.**

Each VM has a real IP on a dedicated subnet. TIRPAN running in Kali WSL can reach all of them. This mirrors a real engagement where you control one machine and pivot through the network.

### Lab Network Design Goals

- **Segment isolation** — attacker (Kali) cannot trivially reach all segments
- **Realistic services** — real SSH daemons, real Apache, real SMB, not emulators
- **Known-vulnerable by design** — every target has documented CVEs for controlled testing
- **Restorable** — every VM has a clean snapshot, wipe & restore in under 60 seconds
- **Extensible** — add VMs for new scenarios without rebuilding the core lab

---

## 2. Network Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Windows 11 Host                                                          │
│                                                                           │
│  ┌──────────────────────┐                                                 │
│  │  Kali Linux (WSL2)   │  ← TIRPAN runs here (localhost:8000)            │
│  │  "Attacker"          │                                                 │
│  └──────────┬───────────┘                                                 │
│             │ vEthernet (WSL) — 172.x.x.x                                 │
│             │                                                             │
│  ┌──────────▼──────────────────────────────────────────────────────────┐ │
│  │  VirtualBox                                                          │ │
│  │                                                                      │ │
│  │  ┌─── NET-1: DMZ (192.168.56.0/24) ──────────────────────────────┐  │ │
│  │  │  Host-Only Adapter — vboxnet0                                   │  │ │
│  │  │                                                                  │  │ │
│  │  │  [192.168.56.10]  Metasploitable 2   — Primary vuln target     │  │ │
│  │  │  [192.168.56.11]  DVWA (Ubuntu+Apache) — Web app target        │  │ │
│  │  │  [192.168.56.12]  SSH Lab (Debian)    — Credential/SSH tests   │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                      │ │
│  │  ┌─── NET-2: INTERNAL (192.168.57.0/24) ─────────────────────────┐  │ │
│  │  │  Host-Only Adapter — vboxnet1  (V2 — lateral movement)         │  │ │
│  │  │                                                                  │  │ │
│  │  │  [192.168.57.10]  Win Server 2019 (AD)  — Domain controller    │  │ │
│  │  │  [192.168.57.11]  Win 10 Workstation    — Domain member        │  │ │
│  │  │  [192.168.57.12]  Internal Linux server — Post-exploit pivot   │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                      │ │
│  │  ┌─── NET-3: MANAGEMENT (192.168.58.0/24) ───────────────────────┐  │ │
│  │  │  Host-Only Adapter — vboxnet2  (V3 — management network)       │  │ │
│  │  │                                                                  │  │ │
│  │  │  [192.168.58.10]  pfSense / Router VM   — Gateway/firewall     │  │ │
│  │  │  [192.168.58.11]  Monitoring (Elastic)  — Blue team target     │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

Attacker path (current V1):
  Kali WSL → vboxnet0 → 192.168.56.0/24 (DMZ)

Attacker path (V2 lateral movement):
  Kali WSL → DMZ → pivot via 192.168.56.10 → 192.168.57.0/24 (Internal)
```

---

## 3. Host Machine Requirements

| Component | Minimum | Recommended |
|---|---|---|
| **RAM** | 16 GB | 32 GB |
| **CPU** | 4 cores, VT-x enabled | 8+ cores |
| **Storage** | 120 GB free | 250 GB SSD |
| **OS** | Windows 10/11 | Windows 11 (WSL2 optimized) |
| **VirtualBox** | 7.0+ | 7.1+ |
| **Kali WSL** | any recent | 2024.x+ |

**BIOS checklist before starting:**
- Intel VT-x / AMD-V: **Enabled**
- Hyper-V: Check — on Windows 11, Hyper-V coexists with VirtualBox 7+
- Secure Boot: Optional, not required

---

## 4. VirtualBox Network Configuration

### Create vboxnet0 (DMZ — V1 lab)

```
VirtualBox → File → Tools → Network Manager → Host-only Networks → Create

vboxnet0:
  IPv4 Address:  192.168.56.1
  IPv4 Mask:     255.255.255.0
  DHCP Server:   DISABLED  (static IPs only — predictable targets)
```

### Create vboxnet1 (Internal — V2 lateral movement)

```
vboxnet1:
  IPv4 Address:  192.168.57.1
  IPv4 Mask:     255.255.255.0
  DHCP Server:   DISABLED
```

### Create vboxnet2 (Management — V3)

```
vboxnet2:
  IPv4 Address:  192.168.58.1
  IPv4 Mask:     255.255.255.0
  DHCP Server:   DISABLED
```

---

## 5. Virtual Machine Inventory

### V1 Lab — DMZ Segment (Build these first)

| VM | OS | IP | Primary Purpose | Download |
|---|---|---|---|---|
| **Metasploitable 2** | Ubuntu 8.04 | 192.168.56.10 | Multi-service vuln target | [SourceForge](https://sourceforge.net/projects/metasploitable/) |
| **DVWA** | Ubuntu 22.04 + LAMP | 192.168.56.11 | Web app vuln testing | Build from ISO |
| **SSH Lab** | Debian 12 | 192.168.56.12 | SSH credential/tool testing | Build from ISO |

### V2 Lab — Internal Segment (Build after V2 features)

| VM | OS | IP | Primary Purpose | Download |
|---|---|---|---|---|
| **Domain Controller** | Windows Server 2019 Eval | 192.168.57.10 | AD, SMB, Kerberos | [Microsoft Eval Center](https://www.microsoft.com/en-us/evalcenter/) |
| **Workstation** | Windows 10 Eval | 192.168.57.11 | Domain member, lateral target | [Microsoft Eval Center](https://www.microsoft.com/en-us/evalcenter/) |
| **Internal Linux** | Ubuntu 22.04 | 192.168.57.12 | Post-exploit pivot point | Build from ISO |

---

## 6. VM Setup Guides

### 6.1 — Metasploitable 2 (Primary Target)

```bash
# 1. Download and extract Metasploitable2-Linux.zip
# 2. VirtualBox → New → Use existing VHD → select .vmdk
#
# VM Settings:
#   RAM: 512 MB (minimal, it's Ubuntu 8.04)
#   Network Adapter 1: Host-Only → vboxnet0
#   No NAT — this machine must not reach the internet
#
# 3. Boot and configure static IP:

# Inside Metasploitable2 (login: msfadmin / msfadmin):
sudo nano /etc/network/interfaces

# Replace dhcp line with:
auto eth0
iface eth0 inet static
  address 192.168.56.10
  netmask 255.255.255.0
  gateway 192.168.56.1

sudo /etc/init.d/networking restart
ip addr show eth0  # verify

# 4. Take snapshot: "clean-state"
```

**Services on Metasploitable 2:**

| Port | Service | Version | CVE |
|---|---|---|---|
| 21 | vsftpd | 2.3.4 | CVE-2011-2523 (backdoor) |
| 22 | OpenSSH | 4.7p1 | Credential brute-force |
| 23 | Telnet | — | Cleartext auth |
| 25 | Postfix SMTP | 2.3.19 | Open relay |
| 80 | Apache | 2.2.8 | Multiple |
| 139/445 | Samba | 3.0.20 | CVE-2007-2447 (username map script) |
| 3306 | MySQL | 5.0.51 | No root password |
| 5432 | PostgreSQL | 8.3 | Default credentials |
| 5900 | VNC | Protocol 3.3 | Weak password |
| 8180 | Apache Tomcat | 5.5 | Default credentials (tomcat/tomcat) |

### 6.2 — DVWA (Web Application Target)

```bash
# Use Ubuntu 22.04 Server ISO
# VM Settings:
#   RAM: 1 GB
#   Disk: 20 GB
#   Network: Host-Only → vboxnet0

# After Ubuntu install, configure static IP:
sudo nano /etc/netplan/00-installer-config.yaml

network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: no
      addresses: [192.168.56.11/24]
      routes:
        - to: default
          via: 192.168.56.1

sudo netplan apply

# Install LAMP + DVWA:
sudo apt update && sudo apt install -y apache2 php php-mysql mysql-server git

sudo git clone https://github.com/digininja/DVWA /var/www/html/dvwa
sudo cp /var/www/html/dvwa/config/config.inc.php.dist \
        /var/www/html/dvwa/config/config.inc.php

# Configure MySQL:
sudo mysql -e "CREATE DATABASE dvwa; \
  CREATE USER 'dvwa'@'localhost' IDENTIFIED BY 'p@ssw0rd'; \
  GRANT ALL ON dvwa.* TO 'dvwa'@'localhost'; FLUSH PRIVILEGES;"

sudo nano /var/www/html/dvwa/config/config.inc.php
# Set: db_password = 'p@ssw0rd'
# Set: recaptcha keys if needed

sudo systemctl enable --now apache2 mysql

# Access: http://192.168.56.11/dvwa
# Default login: admin / password
# Setup DB via the setup page first

# Snapshot: "clean-state"
```

### 6.3 — SSH Lab Target (Credential & SSH Tool Testing)

```bash
# Use Debian 12 minimal ISO
# VM Settings:
#   RAM: 512 MB
#   Disk: 10 GB
#   Network: Host-Only → vboxnet0

# After install, configure static IP:
sudo nano /etc/network/interfaces

auto enp0s3
iface enp0s3 inet static
  address 192.168.56.12
  netmask 255.255.255.0

sudo systemctl restart networking

# Install SSH:
sudo apt install -y openssh-server sudo

# Create test users:
sudo useradd -m -s /bin/bash labadmin
echo "labadmin:password123" | sudo chpasswd
sudo usermod -aG sudo labadmin

sudo useradd -m -s /bin/bash appuser
echo "appuser:appuser" | sudo chpasswd

# Create a file that confirms successful SSH tool run:
sudo mkdir -p /opt/flags
echo "SSH_TOOL_SUCCESS: $(hostname) $(date)" | sudo tee /opt/flags/ssh_flag.txt
sudo chmod 644 /opt/flags/ssh_flag.txt

# Allow password auth (it's disabled by default on modern Debian):
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication yes
sudo systemctl restart sshd

# Snapshot: "clean-state"
```

---

## 7. WSL → Lab Network Bridge

WSL2 runs in a separate virtual network and cannot directly reach VirtualBox host-only adapters without a route. Fix this once, it persists.

### Option A — Add Route (Recommended)

```bash
# In Kali WSL — run once per WSL session or add to ~/.bashrc:

# Find the Windows host IP as seen from WSL:
WINDOWS_HOST=$(ip route | grep default | awk '{print $3}')

# Add routes to all lab subnets:
sudo ip route add 192.168.56.0/24 via $WINDOWS_HOST
sudo ip route add 192.168.57.0/24 via $WINDOWS_HOST  # V2
sudo ip route add 192.168.58.0/24 via $WINDOWS_HOST  # V3

# Verify:
ping -c 2 192.168.56.10
nmap -p 22 192.168.56.10
```

### Option B — Windows Port Proxy (Single service fallback)

```powershell
# Windows PowerShell (Admin) — if route doesn't work:
netsh interface portproxy add v4tov4 `
  listenaddress=0.0.0.0 listenport=2210 `
  connectaddress=192.168.56.10 connectport=22

# Then SSH via: ssh msfadmin@localhost -p 2210
```

### Persistent Route (add to WSL startup)

```bash
# Add to /etc/wsl.conf or create a startup script:
cat >> ~/.bashrc << 'EOF'
# TIRPAN Lab Routes
_setup_lab_routes() {
  local gw=$(ip route | grep default | awk '{print $3}')
  sudo ip route add 192.168.56.0/24 via "$gw" 2>/dev/null
  sudo ip route add 192.168.57.0/24 via "$gw" 2>/dev/null
}
_setup_lab_routes
EOF
```

---

## 8. Current Capability Scenarios (V1)

These scenarios test every feature currently implemented in TIRPAN.

---

### Scenario 1 — Baseline Network Discovery

**Goal:** Confirm nmap integration, host discovery, service detection
**Target:** `192.168.56.10`
**TIRPAN Settings:**

```
Advanced Config → Targets:
  Primary Target:  192.168.56.10
  Target Type:     Single IP

Advanced Config → Discovery:
  Speed Profile:   Normal
  Scan Type:       SYN Stealth
  Port Range:      1-65535
  Version Detection: ✓
  OS Detection:    ✓
  NSE Categories:  default

Advanced Config → Policy:
  Allow Exploitation: ✗ (scan only)
```

**Expected Results:**
- 20+ open ports discovered
- Service versions detected (vsftpd 2.3.4, OpenSSH 4.7p1, Apache 2.2.8...)
- OS fingerprint: Linux 2.6.x
- Agent generates structured host summary

**Pass Criteria:**
- Nmap tool invoked and result parsed
- Services visible in the agent feed
- Hosts/ports counters increment in mission status bar

---

### Scenario 2 — Exploit Discovery & Execution

**Goal:** Full ReAct cycle — scan → find vuln → searchsploit → exploit
**Target:** `192.168.56.10` (vsftpd 2.3.4 backdoor)
**TIRPAN Settings:**

```
Advanced Config → Targets:
  Primary Target:  192.168.56.10
  Mode:            Full Auto

Advanced Config → Policy:
  Allow Exploitation: ✓
  Max Severity:       CRITICAL
```

**Expected Agent Flow:**
```
[RECON]    nmap -sV -p 21 192.168.56.10
           → vsftpd 2.3.4 detected

[SEARCH]   searchsploit vsftpd 2.3.4
           → exploit/unix/ftp/vsftpd_234_backdoor

[EXPLOIT]  msf: use exploit/unix/ftp/vsftpd_234_backdoor
           → session opened: shell on 192.168.56.10

[POST]     whoami → root
           hostname → metasploitable
```

**Pass Criteria:**
- CVE-2011-2523 identified via searchsploit
- Metasploit module executes successfully
- Shell session established
- Agent reports success in mission feed

---

### Scenario 3 — SSH Credential Authentication

**Goal:** Validate SSH tool (paramiko), credential storage, escalation
**Target:** `192.168.56.12` (SSH Lab)
**TIRPAN Settings:**

```
Advanced Config → Credentials → SSH:
  Label:             ssh-lab-admin
  Host Pattern:      192.168.56.12
  Username:          labadmin
  Password:          password123
  Port:              22
  Escalation:        sudo
  Save to DB:        ✓

Advanced Config → Targets:
  Primary Target:    192.168.56.12
  Mode:              Scan Only
```

**Expected Result:**
- Credential saved to encrypted DB
- SSH tool authenticates as labadmin
- Escalation to root via sudo succeeds
- Audit output includes: whoami=root, /opt/flags/ssh_flag.txt contents

**Verification Command:**
```bash
# In Kali — manual validation:
ssh labadmin@192.168.56.12
cat /opt/flags/ssh_flag.txt
```

---

### Scenario 4 — Never-Scan Hard Block Validation

**Goal:** Verify the safety guardrail works before any engagement
**Target:** Try to scan `192.168.56.1` (VirtualBox host — should be blocked)

```
Advanced Config → Scope:
  Never-Scan List:  192.168.56.1   (reason: Host gateway — never touch)
  Save Globally:    ✓

Advanced Config → Targets:
  Primary Target:   192.168.56.1
  Mode:             Full Auto
```

**Expected Result:**
```
[NEVER_SCAN] CRITICAL: 192.168.56.1 is in the never-scan list. Action blocked.
```

- Mission should start but immediately halt at safety check
- Log entry with `[NEVER_SCAN] CRITICAL` tag visible in console
- No network packets sent to target (verify with Wireshark if needed)

**Also test CIDR block:**
```
Never-Scan: 192.168.56.0/24
Target:     192.168.56.10
→ Should be blocked — IP falls within the /24
```

---

### Scenario 5 — Scan Profile Save & Load

**Goal:** Validate scan profiles — save a config, reload it in a new session

```
Step 1 — Configure:
  Speed: Stealth
  Port Range: 80,443,8080,8443
  NSE: default, http-*
  Version Detection: ✓

Step 2 — Save:
  Advanced Config → Profiles → Save
  Name: "Web App Stealth Scan"
  Description: "HTTP/HTTPS focus, stealth timing, web scripts"

Step 3 — Reload in new session:
  Advanced Config → Profiles → Select "Web App Stealth Scan" → Load
  → All fields should repopulate exactly
```

**Pass Criteria:**
- Profile visible in dropdown after save
- All fields restored correctly on load
- Deleted profile disappears from dropdown

---

### Scenario 6 — Speed Profile Impact Test

**Goal:** Confirm that stealth vs aggressive actually changes scan behaviour
**Target:** `192.168.56.10`

```bash
# Test 1 — Aggressive scan, measure time:
# Advanced Config → Discovery → Speed: Aggressive, Ports: 1-65535
# Record time in mission status bar

# Test 2 — Stealth scan, same target:
# Advanced Config → Discovery → Speed: Stealth, Ports: 1-65535
# Record time — should be 10-20x slower
```

**On Metasploitable2**, run tcpdump to observe the difference:
```bash
sudo tcpdump -i eth0 -n tcp | head -50
# Aggressive: burst of SYN packets
# Stealth: slow, spaced SYNs with delays
```

---

### Scenario 7 — Web Application Scan

**Goal:** Test TIRPAN against a web application
**Target:** `192.168.56.11` (DVWA)

```
Advanced Config → Quick Preset: "Web Application"
  → Auto-sets: ports 80,443,8080,8443, web scripts, browser recon

Primary Target: 192.168.56.11
Mode: Scan Only
```

**Expected:**
- Apache 2.4 + PHP detected
- HTTP title extracted
- Web paths discovered (gobuster/dirb if added as plugin)
- Form fields identified
- DVWA login page found at `/dvwa/login.php`

---

### Scenario 8 — Tool Health Status Check

**Goal:** Verify all tools report healthy before a mission

```
Advanced Config → Profiles → Tool Health Status → Refresh
```

**Expected status:**
```
● nmap_scan         recon        Nmap version 7.98 — sudo mode enabled
● searchsploit_search exploit-search  OK
● metasploit_run    exploit-exec OK
```

Red dot = tool not installed or misconfigured. Fix before running missions.

---

### Scenario 9 — CIDR Range Scan

**Goal:** Discover all hosts in the lab subnet
**Target:** `192.168.56.0/24`

```
Advanced Config → Targets:
  Primary Target:  192.168.56.0/24
  Target Type:     IP Range / CIDR

Advanced Config → Discovery:
  Host Discovery:  ICMP + ARP
  Speed:           Normal
  Port Range:      1-1024
  Version Detection: ✓
```

**Expected:**
- 192.168.56.10 (Metasploitable) — discovered
- 192.168.56.11 (DVWA) — discovered
- 192.168.56.12 (SSH Lab) — discovered
- Mission feed shows each host as it's found

---

## 9. Advanced Configuration Scenarios

### Scenario A — Multi-Credential Mission

Load SSH creds for the lab SSH server AND database creds for Metasploitable MySQL simultaneously:

```
Credentials → SSH:
  Host Pattern: 192.168.56.12
  Username: labadmin / Password: password123

Credentials → Database:
  Host Pattern: 192.168.56.10
  DB Type: MySQL
  Username: root
  Password: (empty)
  Port: 3306
```

Agent receives both credential sets. SSH tool uses the right one per host based on IP matching.

### Scenario B — Scope Restriction Test

```
Scope → Allowed CIDRs: 192.168.56.10/32   (only Metasploitable allowed)
Target: 192.168.56.0/24                    (full subnet)
```

Agent should only interact with `.10`, ignoring `.11` and `.12` even if discovered.

### Scenario C — Mission Briefing Context Injection

Use the Mission Briefing field to give the LLM specific context:

```
Mission Briefing:
"This is a controlled lab test. The target 192.168.56.10 is a Metasploitable 2 instance.
 Priority: confirm vsftpd 2.3.4 backdoor (CVE-2011-2523) is exploitable.
 Do NOT attack the database services — only FTP and SSH.
 Once you have a shell, run 'whoami' and 'cat /etc/passwd' then stop."
```

This overrides generic agent behaviour and focuses execution on the specified objective.

---

## 10. Simulated Corporate Environment (V2 Target)

This section describes the V2 lab — build when lateral movement and AD features are implemented.

### Corporate Scenario: "Acme Corp Internal Audit"

```
Scope:
  External DMZ:  192.168.56.0/24  (web servers, bastion)
  Internal LAN:  192.168.57.0/24  (workstations, file servers)
  Management:    192.168.58.0/24  (AD, monitoring — restricted)

Attack path:
  1. TIRPAN scans DMZ → finds exposed Tomcat on 192.168.56.10:8180
  2. Exploits Tomcat → shell on DMZ host
  3. SSH tool enumerates internal routes from DMZ host
  4. TIRPAN pivots to 192.168.57.0/24 (lateral movement)
  5. Enumerates Windows workstations via SMB
  6. Uses SMB credentials to authenticate to Domain Controller
  7. Extracts AD users / GPO configs
```

### V2 VM Setup — Domain Controller (Windows Server 2019)

```powershell
# After installing Windows Server 2019 Eval on vboxnet1:
# Static IP: 192.168.57.10

# Promote to DC (PowerShell):
Install-WindowsFeature AD-Domain-Services -IncludeManagementTools
Import-Module ADDSDeployment
Install-ADDSForest `
  -DomainName "acme.lab" `
  -DomainNetbiosName "ACME" `
  -SafeModeAdministratorPassword (ConvertTo-SecureString "P@ssw0rd123!" -AsPlainText -Force) `
  -Force

# Create test users:
New-ADUser -Name "John Smith" -SamAccountName jsmith `
  -AccountPassword (ConvertTo-SecureString "Welcome1!" -AsPlainText -Force) `
  -Enabled $true
New-ADUser -Name "Service Account" -SamAccountName svcapp `
  -AccountPassword (ConvertTo-SecureString "Svc@2024!" -AsPlainText -Force) `
  -Enabled $true

# Enable SMBv1 (for classic attacks — lab only):
Set-SmbServerConfiguration -EnableSMB1Protocol $true -Force
```

### V2 VM Setup — Windows 10 Workstation

```powershell
# Static IP: 192.168.57.11, DNS: 192.168.57.10
# Join domain:
Add-Computer -DomainName "acme.lab" `
  -Credential (Get-Credential ACME\Administrator) `
  -Restart

# Disable Windows Defender (lab only):
Set-MpPreference -DisableRealtimeMonitoring $true

# Enable WinRM (for remote execution tests):
Enable-PSRemoting -Force
```

---

## 11. Future Scenarios — Lateral Movement & WLAN

These scenarios map to V2/V3 roadmap items. Document them now, implement as features land.

### LM-1: Network Pivoting via Compromised DMZ Host

**Prerequisites:**
- Metasploitable 2 dual-homed (vboxnet0 + vboxnet1)
- Internal network (vboxnet1) not directly reachable from Kali

```bash
# On Metasploitable2, add second NIC:
# VirtualBox → Settings → Network → Adapter 2: vboxnet1
# Inside VM:
sudo ifconfig eth1 192.168.57.20 netmask 255.255.255.0 up
```

**TIRPAN Test:**
```
Phase 1: Compromise 192.168.56.10 (DMZ)
Phase 2: SSH tool runs on .10 and discovers 192.168.57.0/24
Phase 3: TIRPAN updates scope to include 192.168.57.0/24
Phase 4: Scan continues into internal network
```

### LM-2: SMB Credential Reuse (Pass-the-Hash)

```
Credentials → SMB:
  Host Pattern:  192.168.57.*
  Username:      Administrator
  NTLM Hash:     (extracted from Metasploitable /etc/shadow or Mimikatz)
  Auth Type:     NTLM

Mission Briefing:
  "Use the extracted NTLM hash to authenticate to all Windows hosts
   in 192.168.57.0/24. Do not attempt brute force — PtH only."
```

### LM-3: WLAN Interface Integration (Planned)

When WLAN support is added to TIRPAN:

```
Setup:
  - USB WiFi adapter passed through to Kali WSL (or native Kali)
  - VirtualBox VM with wireless NIC in monitor mode
  - Isolated AP (old router, lab SSID: "TIRPAN-LAB-NET")

TIRPAN Config:
  Interface: wlan0
  Mode: Monitor → Active Scan
  Target: TIRPAN-LAB-NET clients

Attack chain:
  1. Passive recon (client probe requests)
  2. Identify connected devices
  3. Deauth + capture handshake
  4. Feed captured hosts into main TIRPAN scope
  5. Standard vuln scan + exploit on discovered clients
```

### LM-4: Active Directory Attack Chain

```
Prerequisites: V2 AD lab running

Mission Briefing:
  "Corporate internal audit. Start from DMZ web server (192.168.56.10).
   Objective: reach Domain Admin on acme.lab.
   Phase 1: DMZ compromise
   Phase 2: Internal reconnaissance
   Phase 3: Kerberoasting on DC (192.168.57.10)
   Phase 4: Extract and crack service account tickets
   Stop at Domain Admin hash — do not attempt GPO modification."
```

---

## 12. Lab Maintenance & Reset Procedures

### Snapshot Strategy

```
For each VM, maintain 3 snapshots:
  [clean-state]     → Fresh install, no changes
  [post-config]     → Network configured, services running
  [mid-exploit]     → Useful state for testing post-exploit tools
```

### Reset After Test

```bash
# VirtualBox CLI — restore all lab VMs to clean state:
VBoxManage snapshot "Metasploitable2" restore "clean-state"
VBoxManage snapshot "DVWA" restore "clean-state"
VBoxManage snapshot "SSH-Lab" restore "clean-state"

# Restart all:
VBoxManage startvm "Metasploitable2" --type headless
VBoxManage startvm "DVWA" --type headless
VBoxManage startvm "SSH-Lab" --type headless
```

### TIRPAN Database Reset

```bash
# Clear all sessions from previous tests:
cd ~/TIRPAN
sqlite3 data/tirpan.db "DELETE FROM sessions WHERE target LIKE '192.168.56.%';"

# Or full DB reset (keeps tool registry, deletes sessions + logs):
sqlite3 data/tirpan.db "
  DELETE FROM sessions;
  DELETE FROM agent_events;
  DELETE FROM scan_results;
"
```

### Network Connectivity Check (run before every session)

```bash
#!/bin/bash
# ~/lab-check.sh
echo "=== TIRPAN Lab Connectivity ==="
for host in 192.168.56.10 192.168.56.11 192.168.56.12; do
  if ping -c 1 -W 1 "$host" &>/dev/null; then
    echo "  ONLINE  $host"
  else
    echo "  OFFLINE $host  ← Start the VM"
  fi
done

echo ""
echo "=== TIRPAN Server ==="
if curl -s http://localhost:8000/api/v1/tools/status | grep -q "available"; then
  echo "  ONLINE  localhost:8000"
else
  echo "  OFFLINE localhost:8000  ← Run: cd ~/TIRPAN && python3 main.py"
fi
```

```bash
chmod +x ~/lab-check.sh
# Run before every test session:
~/lab-check.sh
```

---

## 13. Legal & Ethical Boundaries

> **Every target in this lab must be a machine you own or have explicit written authorisation to test.**

### What This Lab Is For

- Developing and validating TIRPAN features in a safe, isolated environment
- Learning offensive security techniques in a controlled setting
- Preparing for CTF competitions
- Building professional penetration testing workflows

### What This Lab Is NOT For

- Testing against any machine outside the 192.168.56.0/24 subnet without explicit authorisation
- Using techniques developed here against production systems without a signed scope agreement
- Any activity that violates local law, employer policy, or platform terms of service

### Before Any Real Engagement

1. Obtain **written authorisation** specifying: scope, dates, allowed techniques
2. Configure TIRPAN **never-scan list** with all out-of-scope hosts before starting
3. Set the **scope CIDRs** to only authorised ranges
4. Review the Safety Guard settings (Policy tab) — Block DoS and Destructive are always on
5. Keep a copy of your authorisation document accessible during testing

### Responsible Disclosure

If TIRPAN discovers real vulnerabilities in a production engagement:
1. Stop exploitation immediately upon discovery
2. Document findings with CVSS score and evidence
3. Follow the agreed disclosure timeline in your scope document
4. Use TIRPAN's built-in PDF/HTML report for professional deliverables

---

*Document version: 1.0 — TIRPAN V1 Lab Reference*
*Last updated: 2026-03-15*
*Covers: V1 current capabilities + V2/V3 planned scenarios*
