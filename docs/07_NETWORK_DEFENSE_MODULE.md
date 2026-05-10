# TIRPAN — Network Defense Module (Blue Team)

This module provides an LLM-assisted blue-team monitor with a fast, rule-based
detector engine and an automated response agent.

---

## Overview

**Defense stack:**
- `NetworkMonitor` collects events (packets + auth logs).
- `DetectorEngine` raises alerts using fast rules.
- `DefenseAgent` analyzes alerts with an LLM and triggers response tools.

---

## Implemented Components

### Monitor Layer (`defense/monitor.py`)
- **ScapySniffer** (optional): live packet capture if scapy + root available.
- **AuthLogPoller**: parses `/var/log/auth.log` and `/var/log/secure`.
- **RemoteHostPoller**: SSH polls `ss/netstat` + auth logs from remote hosts.

### Detector Engine (`defense/detector.py`)
- Port scan detection (unique ports per window)
- Brute force detection (failed auth threshold)
- ARP spoof detection (same IP with multiple MACs)
- DoS detection (pps threshold)
- Lateral movement detection (internal exploit ports)
- Data exfil detection (large outbound volume)

### Defense Agent (`defense/defense_agent.py`)
- ReAct loop over alerts
- Manual or auto mode (approval gating)
- Prediction and pre-hardening via KillChainPredictor

### Defense Tools (`defense/tools/`)
- `create_alert`, `update_attacker_profile`
- `block_ip` (DROP/RATE_LIMIT)
- `deploy_honeypot`, `deploy_canary`, `deception_ops`
- `analyze_logs`, `network_survey`, `capture_pcap`
- `harden_service`, `ssh_remote_cmd`

---

## API Endpoints

All endpoints are under `/api/v1/defense`:

- `POST /sessions` — create session
- `POST /sessions/{id}/start` — start monitoring
- `POST /sessions/{id}/stop` — stop monitoring
- `PATCH /sessions/{id}/mode` — manual/auto
- `GET /sessions/{id}/alerts` — alerts
- `GET /sessions/{id}/profiles` — attacker profiles
- `PATCH /sessions/{id}/detector` — enable/disable detectors
- `POST /sessions/{id}/battle` — battle mode (tie to pentest session)

---

## Operating Modes

- **manual:** agent proposes actions, operator approves
- **auto:** agent executes responses directly
- **battle mode:** defense subscribes to red-team events and reacts

---

## Requirements

- **Scapy** is optional but recommended for live packet capture.
- **sudo/root** is required for packet sniffing and iptables actions.
- Remote host polling requires SSH access to those hosts.
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
