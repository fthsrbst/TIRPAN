# TIRPAN — Prerequisites & Setup Guide

## System Requirements

### Minimum
- **CPU:** x86_64 or ARM64
- **RAM:** 16 GB
- **Storage:** 50 GB free
- **OS:** Ubuntu 22.04+, Kali Linux

### Recommended
- **CPU:** 8+ cores
- **RAM:** 32 GB
- **Storage:** 100 GB+ (Metasploit + ExploitDB + models)

---

## Base Installation

```bash
sudo apt update && sudo apt upgrade -y

# Python 3.11
sudo apt install python3.11 python3.11-venv python3-pip -y

# Core tools
sudo apt install nmap exploitdb git -y

# Build deps for PDF reports (WeasyPrint)
sudo apt install build-essential python3-dev libffi-dev \
  libcairo2 libpango-1.0-0 libgdk-pixbuf2.0-0 -y
```

---

## Metasploit (optional but required for exploitation)

```bash
curl https://raw.githubusercontent.com/rapid7/metasploit-omnibus/master/config/templates/metasploit-framework-wrappers/msfupdate.erb > msfinstall
chmod 755 msfinstall
./msfinstall
msfdb init

# Start RPC daemon (TIRPAN auto-starts if configured)
msfrpcd -P your_password_here -S -a 127.0.0.1 -p 55553
```

---

## LLM Providers

TIRPAN supports **Ollama**, **LM Studio**, **OpenRouter**, and **OpenCode Go**.

### Ollama (local)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3:8b
```

### LM Studio (local)
- Start the server and set Base URL in the UI (default: `http://127.0.0.1:1234`).

### OpenRouter / OpenCode Go (cloud)
- Set `OPENROUTER_API_KEY` or `OPENCODE_GO_API_KEY` in `.env` or via the UI.

---

## Project Setup

```bash
git clone https://github.com/fthsrbst/tirpan.git
cd tirpan

python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
```

---

## Optional Tools (V2 coverage)

Install only what you need. Missing tools are detected automatically and excluded.

**Recon/Web:** masscan, nuclei, ffuf, whatweb, nikto, gobuster, arjun, sqlmap, wpscan, commix

**OSINT:** theharvester, subfinder, whois (builtin), dns tools

**Lateral/Bruteforce:** crackmapexec, impacket, hydra, hashcat, john

**Defense:** scapy (packet sniffing), iptables (blocking), sudo/root access

Use `GET /api/v1/tools/status` to see what is available.

---

## Verification Checklist

```bash
python3.11 --version
nmap --version
searchsploit --version
msfconsole --version
```

---

## Safe Practice Targets

```bash
docker run -d --name metasploitable tleemcjr/metasploitable2
docker run -d --name dvwa -p 80:80 vulnerables/web-dvwa
```
