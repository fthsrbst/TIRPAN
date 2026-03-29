# TIRPAN — Prerequisites & Setup Guide

## System Requirements

### Minimum (Raspberry Pi 5)
- **CPU**: ARM Cortex-A76 (RPi 5) or x86_64
- **RAM**: 16 GB
- **Storage**: 50 GB free
- **OS**: Ubuntu 22.04+, Kali Linux, Raspberry Pi OS
- **Network**: Same network as targets

### Recommended (Main PC)
- **CPU**: AMD Ryzen 7 9800X3D (or similar)
- **RAM**: 32 GB DDR5
- **GPU**: RTX 5070 Ti (for local LLM inference via Ollama)
- **Storage**: 100 GB+ free (Metasploit + ExploitDB + models)
- **OS**: Ubuntu 22.04+ or Kali Linux

---

## Installation Steps

### Step 1: System Packages

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Python 3.11
sudo apt install python3.11 python3.11-venv python3-pip -y

# Nmap (network scanner)
sudo apt install nmap -y

# SearchSploit (exploit database)
sudo apt install exploitdb -y

# Git
sudo apt install git -y

# Docker
sudo apt install docker.io docker-compose -y
sudo usermod -aG docker $USER
# Log out and back in for docker group to take effect

# Build tools (needed for WeasyPrint PDF generation)
sudo apt install build-essential python3-dev libffi-dev \
    libcairo2 libpango-1.0-0 libgdk-pixbuf2.0-0 -y
```

### Step 2: Metasploit Framework

```bash
# Install Metasploit
curl https://raw.githubusercontent.com/rapid7/metasploit-omnibus/master/config/templates/metasploit-framework-wrappers/msfupdate.erb > msfinstall
chmod 755 msfinstall
./msfinstall

# Initialize database
msfdb init

# Start Metasploit RPC daemon (we'll use this)
msfrpcd -P your_password_here -S -a 127.0.0.1 -p 55553
```

### Step 3: Local LLM (Ollama or LM Studio)

TIRPAN supports two local inference backends. Install at least one, or skip both and use OpenRouter (cloud API).

#### Option A — Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull models for local inference
ollama pull llama3:8b          # General purpose (4.7GB)
ollama pull mistral:7b         # Good for parsing (4.1GB)
```

Ollama runs as a background service on `http://127.0.0.1:11434` by default.

#### Option B — LM Studio

LM Studio is a GUI-based local LLM runner that exposes an OpenAI-compatible REST API.

1. Download from https://lmstudio.ai/ (Linux, macOS, Windows)
2. Load any GGUF model from the *Model Catalog*
3. In *Local Server* → start the server on port `1234` (default)
4. In TIRPAN Web UI → Settings → LM Studio → set Base URL to `http://127.0.0.1:1234` and choose the loaded model

Default base URL used by TIRPAN: `http://127.0.0.1:1234`

```bash
# Verify LM Studio server is running
curl http://127.0.0.1:1234/v1/models
```

### Step 4: Python Project Setup

```bash
# Clone the project
cd ~/Desktop/Capstone-proejct

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Step 5: API Keys

```bash
# Create .env file
cp .env.example .env

# Edit and add your keys:
# OPENROUTER_API_KEY=sk-or-...
# MSF_RPC_PASSWORD=your_password_here
# MSF_RPC_HOST=127.0.0.1
# MSF_RPC_PORT=55553
```

---

## API Account Setup

### OpenRouter (for Claude API access)
1. Go to https://openrouter.ai/
2. Create account
3. Add credits ($10-20 is plenty to start)
4. Go to Keys → Create new key
5. Save key to `.env` file

### Cost Estimate
| Model | Input | Output | Typical Session |
|-------|-------|--------|----------------|
| Claude 3.5 Sonnet | $3/M tokens | $15/M tokens | ~$0.50-2.00 |
| Ollama (local) | Free | Free | $0.00 |

Using Ollama for parsing/classification keeps costs low.

---

## Verification Checklist

Run each command to verify everything is installed:

```bash
# Python
python3.11 --version          # Should show 3.11.x

# Nmap
nmap --version                # Should show 7.x+

# SearchSploit
searchsploit --version        # Should show version info

# Metasploit
msfconsole --version          # Should show 6.x

# Docker
docker --version              # Should show 24.x+

# Ollama (if using Ollama)
ollama list                   # Should show pulled models

# LM Studio (if using LM Studio)
curl http://127.0.0.1:1234/v1/models  # Should return JSON with model list

# Metasploit RPC (test connection)
curl -k https://127.0.0.1:55553  # Should respond (even if error)
```

---

## Safe Practice Targets

> ⚠️ NEVER test on systems you don't own!

```bash
# Metasploitable 2 (intentionally vulnerable)
docker pull tleemcjr/metasploitable2
docker run -d --name metasploitable -p 2222:22 -p 8080:80 tleemcjr/metasploitable2

# DVWA (vulnerable web app) — for V2
docker pull vulnerables/web-dvwa
docker run -d --name dvwa -p 80:80 vulnerables/web-dvwa
```

---

## Raspberry Pi 5 Notes

- All tools work fine on ARM64
- Metasploit is RAM-heavy (~2-4GB) — you have 16GB, so it's fine
- Ollama runs Llama 3 8B at ~10 tokens/sec on RPi 5 (slower but works)
- OpenRouter API calls work normally (just needs internet)
- Use swap if needed: `sudo fallocate -l 4G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

---

## V2 Prerequisites

All V2 tools are optional. Missing binaries are detected by the health check system at startup.
The Web UI shows install hints for any missing tool. The V1 core functions without any of them.

### Go (required for nuclei, ffuf, subfinder, amass)

```bash
sudo apt install golang-go -y
# Verify
go version
# Add to PATH if needed
echo 'export PATH=$PATH:$HOME/go/bin' >> ~/.bashrc && source ~/.bashrc
```

### Web Application Testing Tools

```bash
# Nuclei — template-based vulnerability scanner
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
nuclei -version

# ffuf — web fuzzer
go install github.com/ffuf/ffuf/v2@latest
ffuf -V

# SQLMap — SQL injection
sudo apt install sqlmap -y
sqlmap --version

# Nikto — web server scanner
sudo apt install nikto -y
nikto -Version

# WhatWeb — technology fingerprinting
sudo apt install whatweb -y
whatweb --version

# dirsearch — directory enumeration
pip install dirsearch
dirsearch --version

# WPScan — WordPress scanner (requires Ruby)
sudo gem install wpscan
wpscan --version
```

### OSINT Tools

```bash
# theHarvester — email/subdomain/IP harvesting
sudo apt install theharvester -y
theHarvester -h

# subfinder — subdomain enumeration
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
subfinder -version

# amass — DNS enumeration
go install -v github.com/owasp-amass/amass/v4/...@master
amass -version

# masscan — fast port scanner (much faster than nmap for wide scans)
sudo apt install masscan -y
masscan --version
```

### Post-Exploitation & Lateral Movement Tools

```bash
# CrackMapExec / NetExec — Windows lateral movement
sudo apt install crackmapexec -y
# or newer version:
pip install netexec
nxc --version

# Impacket — SMB/Kerberos tools
pip install impacket
python3 -c "import impacket; print('impacket OK')"

# Hydra — network brute force
sudo apt install hydra -y
hydra -h 2>&1 | head -2

# Hashcat — password cracking (requires GPU for best performance)
sudo apt install hashcat -y
hashcat --version

# ligolo-ng — pivoting/tunneling
# Download from: https://github.com/nicocha30/ligolo-ng/releases
# Place ligolo-proxy and ligolo-agent in /usr/local/bin/

# chisel — HTTP tunneling
go install github.com/jpillora/chisel@latest
chisel --version
```

### LinPEAS / WinPEAS (Post-Exploitation Scripts)

```bash
# Create scripts directory
mkdir -p tools/scripts

# Download LinPEAS
curl -L https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh \
    -o tools/scripts/linpeas.sh
chmod +x tools/scripts/linpeas.sh

# Download WinPEAS
curl -L https://github.com/carlospolop/PEASS-ng/releases/latest/download/winPEASany.exe \
    -o tools/scripts/winpeas.exe
```

### API Plugin Keys (Optional)

API plugins require credentials. Set as environment variables or configure in TIRPAN Web UI (Settings → Secrets → API Keys).

| Plugin | Environment Variable | Free Tier | Where to Get |
|---|---|---|---|
| `shodan_search` | `SHODAN_API_KEY` | 100 queries/month | account.shodan.io |
| `censys_search` | `CENSYS_API_KEY` + `CENSYS_API_SECRET` | 250 queries/month | app.censys.io |

Keys stored via Web UI are saved to `SecureStore` (OS keychain) — never written to disk in plaintext.

---

## Tool Availability Summary

| Tool | V1 | V2 | Install |
|---|---|---|---|
| `nmap` | Required | Required | `apt install nmap` |
| `searchsploit` | Required | Required | `apt install exploitdb` |
| `msfconsole` | Required | Required | Metasploit installer |
| `masscan` | — | Optional | `apt install masscan` |
| `nuclei` | — | Optional | `go install ...nuclei@latest` |
| `ffuf` | — | Optional | `go install ...ffuf@latest` |
| `sqlmap` | — | Optional | `apt install sqlmap` |
| `nikto` | — | Optional | `apt install nikto` |
| `whatweb` | — | Optional | `apt install whatweb` |
| `theharvester` | — | Optional | `apt install theharvester` |
| `subfinder` | — | Optional | `go install ...subfinder@latest` |
| `amass` | — | Optional | `go install ...amass@master` |
| `hydra` | — | Optional | `apt install hydra` |
| `hashcat` | — | Optional | `apt install hashcat` |
| `crackmapexec` / `nxc` | — | Optional | `apt install crackmapexec` |
| `impacket` | — | Optional | `pip install impacket` |
| `linpeas.sh` | — | Optional | Download to `tools/scripts/` |
| `winpeas.exe` | — | Optional | Download to `tools/scripts/` |
| `ligolo-ng` | — | Optional | Download binary |
| `chisel` | — | Optional | `go install ...chisel@latest` |

Missing tools are auto-detected and excluded from agent prompts at session start.
