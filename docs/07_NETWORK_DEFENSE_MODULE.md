# TIRPAN — Network Defense Module (Blue Team Extension)

> 🛡️ An LLM-powered **active defense** layer that monitors the local network, detects attacks in real-time, and autonomously responds using AI-driven decision making.

---

## 1. Overview & Vision

TIRPAN V1 is a **Red Team** (offensive) tool. This module adds a **Blue Team** (defensive) counterpart. Together they form a full security loop:

```
RED  → TIRPAN attacks target network  → finds vulnerabilities
BLUE → DefenseAI monitors YOUR network   → detects & stops attacks
```

The **Defense Module** sits passively on the network, sniffs traffic, analyzes patterns, and when it detects an attack, calls an LLM to reason about it and take action.

### Why LLM-Based Defense?

| Traditional IDS               | LLM-Based Defense                        |
| ----------------------------- | ---------------------------------------- |
| Rule-based (known signatures) | Context-aware (understands intent)       |
| High false positive rate      | Lower FP (LLM reasons about context)     |
| No explanation                | Human-readable analysis                  |
| Fixed responses               | Dynamic, situation-appropriate responses |
| Can't handle zero-days        | Can reason about novel patterns          |

---

## 2. Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DefenseAI Module                              │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────────────────────┐    │
│  │  Packet Sniffer  │───▶│      Threat Analysis Engine      │    │
│  │  (Scapy)         │    │                                  │    │
│  │                  │    │  ┌────────┐  ┌────────────────┐  │    │
│  │  Live traffic    │    │  │Feature │  │   Anomaly      │  │    │
│  │  on all ifaces   │    │  │Extractor│  │   Detector     │  │    │
│  └─────────────────┘    │  └────┬───┘  └────────┬───────┘  │    │
│                          │       │                │          │    │
│  ┌─────────────────┐    │       ▼                ▼          │    │
│  │  ARP Monitor     │    │  ┌──────────────────────────┐    │    │
│  │  (Spoofing Detect│    │  │   Threat Context Builder  │    │    │
│  └─────────────────┘    │  └────────────┬─────────────┘    │    │
│                          │               │                  │    │
│  ┌─────────────────┐    │               ▼                  │    │
│  │  Port Scan Detect│    │  ┌──────────────────────────┐    │    │
│  │  (SYN tracking)  │    │  │    LLM Reasoning Engine   │    │    │
│  └─────────────────┘    │  │  (Ollama / OpenRouter)    │    │    │
│                          │  └────────────┬─────────────┘    │    │
│  ┌─────────────────┐    │               │                  │    │
│  │  Log Analyzer    │    └───────────────│──────────────────┘    │
│  │  (syslog/auth)   │                    │                       │
│  └─────────────────┘                     ▼                       │
│                          ┌──────────────────────────────────┐    │
│                          │    Response Engine               │    │
│                          │                                  │    │
│                          │  ┌──────┐  ┌──────┐  ┌───────┐  │    │
│                          │  │Block │  │Alert │  │Honeypot│  │    │
│                          │  │ IP   │  │ User │  │Redirect│  │    │
│                          │  └──────┘  └──────┘  └───────┘  │    │
│                          └──────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Audit & Reporting Database (SQLite)            │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### A. Packet Sniffer (`defense/sniffer.py`)

- Uses **Scapy** for raw packet capture
- Runs on all network interfaces or a specified one
- Feeds packets into a shared queue (async producer)
- Aggregates packets into **time windows** (e.g., 10-second buckets)

#### B. Threat Detection Subsystems (`defense/detectors/`)

| Detector                       | What It Catches              | Technique                      |
| ------------------------------ | ---------------------------- | ------------------------------ |
| `port_scan_detector.py`        | SYN scans, Nmap activity     | SYN count threshold + velocity |
| `arp_spoof_detector.py`        | ARP poisoning, MITM          | MAC-IP table consistency check |
| `dos_detector.py`              | DoS/DDoS floods              | Packet rate per source IP      |
| `brute_force_detector.py`      | SSH/HTTP brute force         | Auth failure rate from logs    |
| `lateral_movement_detector.py` | Internal recon between hosts | Unusual east-west traffic      |
| `data_exfil_detector.py`       | Large outbound transfers     | Bytes/min per destination      |

#### C. Threat Analysis Engine (`defense/analyzer.py`)

- Collects threat signals from all detectors
- Builds a **Threat Context Object** (structured summary)
- Calculates severity score (0-10)
- Decides whether to call LLM (threshold-based)

#### D. LLM Reasoning Engine (`defense/llm_defender.py`)

- Sends threat context to LLM (Ollama local for speed)
- Structured prompt: describes network event, asks for analysis
- LLM returns structured JSON:
  ```json
  {
    "threat_type": "port_scan",
    "confidence": 0.92,
    "mitre_technique": "T1046",
    "risk_level": "HIGH",
    "recommended_action": "block_ip",
    "action_params": { "ip": "192.168.1.42", "duration": 3600 },
    "reasoning": "Source 192.168.1.42 sent 847 SYN packets to 230 unique ports in 15 seconds. Classic Nmap SYN scan pattern.",
    "false_positive_likelihood": 0.05
  }
  ```

#### E. Response Engine (`defense/responder.py`)

| Action              | Implementation                     | When Used                  |
| ------------------- | ---------------------------------- | -------------------------- |
| `block_ip`          | iptables DROP rule via subprocess  | Confirmed attacker         |
| `rate_limit_ip`     | iptables LIMIT rule                | Suspicious but unconfirmed |
| `alert_user`        | WebSocket push + sound             | All detections             |
| `redirect_honeypot` | iptables REDIRECT to honeypot port | Curious scanners           |
| `log_and_watch`     | Database + enhanced monitoring     | Low severity               |
| `quarantine_host`   | Block all traffic from internal IP | Compromised internal host  |

#### F. Honeypot Mini-Server (`defense/honeypot.py`)

- Lightweight fake services (SSH, HTTP, SMB banners)
- Uses **socket** library, not real services
- **LLM-Powered**: responds to attacker queries with AI-generated responses
- Logs all attacker interactions for intelligence

---

## 3. Threat Detection Details

### 3.1 Port Scan Detection

**Algorithm:**

```
Sliding window (60 seconds):
  - Count unique destination ports contacted by each source IP
  - If source contacts > 15 ports/5s → potential scan
  - If source contacts > 50 ports/30s → confirmed scan
  - Track TCP flags: SYN-only packets = stealth scan
```

**MITRE ATT&CK Mapping:**

- T1046 — Network Service Discovery

**Detection Types:**

- TCP SYN Scan (nmap -sS)
- TCP Connect Scan (nmap -sT)
- UDP Scan (nmap -sU)
- Xmas/FIN scans (unusual flag combos)

### 3.2 ARP Spoofing Detection

**Algorithm:**

```
Maintain ARP table: {ip_address → mac_address}
On each ARP reply:
  - If known IP maps to DIFFERENT MAC → ARP spoof alert
  - If MAC changes faster than 30s → suspicious
  - Count gratuitous ARP rate (> 5/min = suspicious)
```

**MITRE ATT&CK Mapping:**

- T1557.002 — ARP Cache Poisoning

**Response:**

- Send corrective ARP to victim hosts
- Block attacker MAC at layer 2 (iptables ebtables)

### 3.3 DoS / DDoS Detection

**Algorithm:**

```
Per source IP, per 1-second window:
  - PPS (packets per second) > 1000 → alert
  - ICMP flood: ICMP PPS > 100 → alert
  - SYN flood: SYN PPS > 500 without handshake → alert
  - UDP flood: UDP PPS > 1000 → alert
```

**MITRE ATT&CK Mapping:**

- T1498 — Network Denial of Service
- T1499 — Endpoint Denial of Service

### 3.4 Brute Force Detection

**Sources:** `/var/log/auth.log`, `/var/log/syslog`, HTTP access logs

**Algorithm:**

```
SSH brute force: > 5 failed auth attempts/minute from same IP
HTTP brute force: > 20 POST /login requests/minute from same IP
FTP brute force: > 10 failed logins/minute
```

**MITRE ATT&CK Mapping:**

- T1110 — Brute Force

### 3.5 Lateral Movement Detection

**Algorithm:**

```
Internal traffic analysis:
  - New connections between hosts that never communicated before
  - SMB/RDP connections from non-admin hosts
  - Rapid internal scanning (similar to external scan detection)
  - Unusual protocol usage on internal ports
```

**MITRE ATT&CK Mapping:**

- T1021 — Remote Services
- T1135 — Network Share Discovery

---

## 4. LLM Integration for Defense

### 4.1 Prompt Design (Defense-Specific)

The LLM is given a **defender system prompt**:

```
You are an expert network security analyst and incident responder.
You analyze network events and recommend defensive actions.

Rules:
- Always provide a MITRE ATT&CK technique ID if applicable
- Rate threat severity 1-10 (1=benign, 10=critical incident)
- Recommend the MINIMUM necessary response (avoid over-blocking)
- Consider false positive likelihood
- If uncertain, recommend "log_and_watch" not "block_ip"
- Return ONLY valid JSON, no prose
```

### 4.2 LLM Decision Tree

```
Threat Event Detected
        │
        ▼
Severity score calculated (rule-based)
        │
   ┌────┴────┐
   │         │
  < 3       >= 3
   │         │
   │         ▼
   │   Send to LLM for analysis
   │         │
   │         ▼
   │   LLM returns action
   │         │
   └────┬────┘
        │
        ▼
  Execute action:
  - block_ip        (confidence > 0.85 AND severity >= 7)
  - rate_limit      (confidence > 0.70 AND severity 4-6)
  - redirect_honey  (confidence > 0.60 AND severity 3-5)
  - alert_and_watch (confidence <= 0.70 OR severity < 4)
```

### 4.3 Local vs Cloud LLM

| Use Case                      | Provider            | Why                  |
| ----------------------------- | ------------------- | -------------------- |
| Real-time detection (< 200ms) | Ollama (Llama 3 8B) | Speed, no latency    |
| Deep incident analysis        | OpenRouter (Claude) | Quality of reasoning |
| Periodic threat summaries     | Ollama              | Cost efficiency      |

---

## 5. Response Actions — Technical Implementation

### 5.1 IP Blocking (iptables)

```python
import subprocess

def block_ip(ip: str, duration_seconds: int = 3600):
    # Block all inbound from attacker
    subprocess.run(["iptables", "-I", "INPUT", "-s", ip, "-j", "DROP"])
    # Schedule unblock
    schedule_unblock(ip, duration_seconds)

def rate_limit_ip(ip: str, pps: int = 10):
    subprocess.run([
        "iptables", "-I", "INPUT", "-s", ip,
        "-m", "limit", f"--limit", f"{pps}/sec",
        "-j", "ACCEPT"
    ])
```

### 5.2 Honeypot Redirect

```python
def redirect_to_honeypot(ip: str, honeypot_port: int = 2222):
    # Redirect attacker's traffic to our honeypot
    subprocess.run([
        "iptables", "-t", "nat", "-I", "PREROUTING",
        "-s", ip, "-p", "tcp", "--dport", "22",
        "-j", "REDIRECT", "--to-port", str(honeypot_port)
    ])
```

### 5.3 LLM Honeypot Server

```python
class LLMHoneypot:
    """Fake SSH server that uses LLM to respond to attacker"""

    async def handle_attacker(self, attacker_ip, command):
        # LLM generates convincing but fake responses
        response = await llm.generate(
            system="You are a fake Linux system responding to an attacker. "
                   "Give convincing but false output. Log everything.",
            user=f"Attacker issued command: {command}"
        )
        return response
```

---

## 6. Integration with Existing TIRPAN

### 6.1 Dual-Mode Operation

The system can run in two configurations:

**Configuration A: Attack Mode (existing)**

```bash
python main.py --target 192.168.1.0/24 --mode full_auto
```

**Configuration B: Defend Mode (new)**

```bash
python main.py --mode defend --interface eth0 --protect-network 192.168.1.0/24
```

**Configuration C: Simultaneous (advanced)**

```bash
python main.py --target DMZ --mode full_auto
python main.py --mode defend --interface eth1 --protect internal
# Use case: Red team attacks DMZ while Blue team defends internal
```

### 6.2 Shared Components

| Component            | Shared Usage                                 |
| -------------------- | -------------------------------------------- |
| `core/llm_client.py` | Used by both attack agent and defense module |
| `database/db.py`     | Shared SQLite (separate tables for defense)  |
| `web/app.py`         | Same web UI, new "Defense" tab               |
| `core/safety.py`     | Defense module uses safety guardrails too    |

### 6.3 New Database Tables for Defense

```sql
-- Detected threats
CREATE TABLE threat_events (
    id INTEGER PRIMARY KEY,
    timestamp DATETIME,
    source_ip TEXT,
    threat_type TEXT,
    severity INTEGER,
    mitre_technique TEXT,
    llm_analysis TEXT,  -- Full JSON from LLM
    action_taken TEXT,
    action_result TEXT
);

-- Blocked IPs and rules
CREATE TABLE firewall_rules (
    id INTEGER PRIMARY KEY,
    ip_address TEXT,
    rule_type TEXT,      -- block, rate_limit, redirect
    reason TEXT,
    created_at DATETIME,
    expires_at DATETIME,
    active BOOLEAN
);

-- Honeypot interactions
CREATE TABLE honeypot_log (
    id INTEGER PRIMARY KEY,
    attacker_ip TEXT,
    timestamp DATETIME,
    command TEXT,
    llm_response TEXT,
    session_duration INTEGER
);

-- Network baseline for anomaly detection
CREATE TABLE traffic_baseline (
    id INTEGER PRIMARY KEY,
    time_window DATETIME,
    metric_name TEXT,   -- packets_per_sec, bytes_per_sec, etc
    avg_value FLOAT,
    std_deviation FLOAT,
    updated_at DATETIME
);
```

---

## 7. Web UI Extensions

### New "Defense" Tab — Panels

1. **Network Status Panel**
   - Live traffic graph (packets/sec, bytes/sec)
   - Connected hosts list with threat scores
   - Active firewall rules

2. **Threat Feed Panel**
   - Real-time alert stream (WebSocket)
   - Severity color coding (green → red)
   - LLM reasoning display for each alert

3. **Control Panel**
   - Start/Stop defense monitoring
   - Whitelist IP management
   - Sensitivity settings (low/medium/high)
   - Manual block/unblock controls

4. **Intelligence Panel**
   - Attack history timeline
   - Attacker IP geolocation
   - MITRE ATT&CK heatmap
   - Honeypot interaction logs

---

## 8. Technology Stack (New Components)

| Component         | Technology                     | Purpose                    |
| ----------------- | ------------------------------ | -------------------------- |
| Packet capture    | Scapy 2.5+                     | Raw packet sniffing        |
| Traffic analysis  | pandas + numpy                 | Feature extraction & stats |
| Anomaly detection | scikit-learn (IsolationForest) | ML baseline detection      |
| Firewall control  | subprocess + python-iptables   | Dynamic rule management    |
| Honeypot server   | asyncio + socket               | Fake service responder     |
| Log monitoring    | watchdog + re                  | File-based log tailing     |
| Geolocation       | geoip2 + MaxMind DB            | Attacker IP lookup         |
| MITRE mapping     | mitreattack-python             | Technique classification   |
| Visualization     | Chart.js (web)                 | Traffic graphs             |

---

## 9. MITRE ATT&CK Coverage Map

| ATT&CK Tactic     | Techniques Detected             | Detection Method        |
| ----------------- | ------------------------------- | ----------------------- |
| Reconnaissance    | T1046 (Network Scan)            | Port scan detector      |
| Discovery         | T1135 (Network Share Disc.)     | SMB traffic analysis    |
| Lateral Movement  | T1021 (Remote Services)         | Internal traffic        |
| Credential Access | T1110 (Brute Force)             | Auth log analysis       |
| Collection        | T1040 (Network Sniff)           | Promiscuous mode detect |
| Command & Control | T1071 (App Layer Protocol)      | DNS/HTTP anomaly        |
| Exfiltration      | T1048 (Exfil over Alt Protocol) | Data volume analysis    |
| Impact            | T1498 (Network DoS)             | Traffic flood detect    |

---

## 10. Research References

### Academic Papers

- **"LLM-Based Cyber Threat Intelligence"** — arXiv 2024: Using GPT models for real-time network event classification
- **"BERT for Network IDS"** — ResearchGate 2024: Transformer architecture converting traffic to text for NIDS
- **"Hybrid IDS with LLM Semantic Analysis"** — arXiv 2024: Combining signature-based + GPT-2 for zero-day detection

### Frameworks & Standards

- **MITRE ATT&CK** — attack technique taxonomy (attack.mitre.org)
- **MITRE D3FEND** — defensive countermeasure taxonomy (d3fend.mitre.org)
- **NIST SP 800-94** — Guide to IDS/IPS
- **STIX/TAXII** — Threat intelligence sharing format

### Open Source Tools (Inspiration)

- **Suricata** — Open source IDS/IPS (rule-based, for comparison)
- **Zeek (Bro)** — Network analysis framework
- **OSSEC** — Host-based IDS
- **OpenAI Evals** — Evaluating LLM defense decision quality

### Industry Products (XBOW Equivalent for Defense)

- **Darktrace** — AI-based NDR (commercial reference)
- **Vectra AI** — AI network threat detection
- **ExtraHop Reveal(x)** — ML-based NDR
- **Cisco AI Defense** (2025) — LLM-integrated defense

---

## 11. Limitations & Honest Assessment

| Limitation                     | Impact                       | Mitigation                  |
| ------------------------------ | ---------------------------- | --------------------------- |
| Requires root/admin privileges | Restricts deployment         | Document clearly            |
| LLM latency (Ollama ~200ms)    | Can miss fast-moving attacks | Rule-based pre-filter       |
| iptables Linux-only            | No Windows support in V1     | Document as Linux-only      |
| False positives from LLM       | Wrong blocks                 | Human-in-the-loop mode      |
| LLM "hallucinations"           | Wrong analysis               | Confidence threshold filter |
| Can't decrypt TLS traffic      | Blind to HTTPS content       | Metadata analysis only      |

---

## 12. Version Roadmap

```
Defense V1 (Capstone Extension):
  - Port scan detection
  - ARP spoof detection
  - Basic DoS detection
  - LLM threat analysis
  - IP blocking via iptables
  - Alert dashboard

Defense V2:
  - ML-based anomaly detection (IsolationForest baseline)
  - Brute force detection from logs
  - Honeypot with LLM responder
  - MITRE ATT&CK mapping
  - Geolocation of attackers
  - Threat intelligence feeds (AlienVault OTX)

Defense V3:
  - Full NDR (Network Detection & Response)
  - Encrypted traffic analysis (metadata only)
  - Deception technology (fake credentials, honeytokens)
  - SIEM integration
  - Automated SOAR playbooks
  - Active threat hunting
```
