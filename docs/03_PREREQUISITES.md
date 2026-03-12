# AEGIS — Prerequisites & Setup Guide

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

### Step 3: Ollama (Local LLM)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull models for local inference
ollama pull llama3:8b          # General purpose (4.7GB)
ollama pull mistral:7b         # Good for parsing (4.1GB)
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

# Ollama
ollama list                   # Should show pulled models

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

The following tools are required only for V2 features. The V1 core functions without any of them — missing tools are reported via the health check system at session start.

### Playwright (Web Recon / Browser Feature)

Required only when `allow_browser_recon = True` in the Mission Brief.

```bash
# Install Playwright Python package
pip install playwright>=1.40

# Download Chromium browser (the only browser AEGIS uses)
playwright install chromium

# Install system dependencies for Chromium (Debian/Ubuntu/Kali)
playwright install-deps chromium
```

Verification:

```bash
python -c "from playwright.sync_api import sync_playwright; print('Playwright OK')"
```

If Playwright is not installed, the `web_recon` tool operates in degraded mode — HTTP header analysis and source scanning still work; only the `browser` action is unavailable.

---

### V2 CLI Plugin Tools (Optional — install only what you need)

Each of these is optional. Missing binaries are detected by the health check system at startup. The Web UI will display the install hint for any binary not found.

**Nuclei** (template-based vulnerability scanner):

```bash
# Requires Go 1.21+
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
# Verify
nuclei -version
```

**Gobuster** (directory/file brute force):

```bash
go install github.com/OJ/gobuster/v3@latest
# Verify
gobuster version
```

**ffuf** (web fuzzer):

```bash
go install github.com/ffuf/ffuf/v2@latest
# Verify
ffuf -V
```

**SQLMap** (automated SQL injection):

```bash
sudo apt install sqlmap -y
# or
pip install sqlmap
# Verify
sqlmap --version
```

**Nikto** (web server vulnerability scanner):

```bash
sudo apt install nikto -y
# Verify
nikto -Version
```

**Hydra** (network credential brute force):

```bash
sudo apt install hydra -y
# Verify
hydra -h 2>&1 | head -2
```

**Go installation** (required for Nuclei, Gobuster, ffuf):

```bash
# Ubuntu/Debian
sudo apt install golang-go -y
# Or install a specific version:
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.bashrc
source ~/.bashrc
go version
```

---

### V2 API Plugin Keys (Optional)

API-type plugins require credentials. Set them as environment variables or configure them through the AEGIS Web UI (Settings → Secrets).

| Plugin          | Environment Variable | Where to Get                        |
| --------------- | -------------------- | ----------------------------------- |
| `shodan_lookup` | `SHODAN_API_KEY`     | https://account.shodan.io/          |
| `virustotal_lookup` | `VIRUSTOTAL_API_KEY` | https://www.virustotal.com/gui/my-apikey |

Add to `.env`:

```bash
SHODAN_API_KEY=your_key_here
VIRUSTOTAL_API_KEY=your_key_here
```

Keys stored through the Web UI are saved to `SecureStore` (system keyring) and are never written to disk in plaintext.

---

## Tool Availability Summary

| Tool            | V1 Required | V2 Required    | Install Method                  |
| --------------- | ----------- | -------------- | ------------------------------- |
| `nmap`          | ✓           | ✓              | `apt install nmap`              |
| `searchsploit`  | ✓           | ✓              | `apt install exploitdb`         |
| `msfconsole`    | ✓           | ✓              | Metasploit installer            |
| `playwright`    | —           | Optional       | `pip install playwright`        |
| `nuclei`        | —           | Optional       | `go install ...nuclei@latest`   |
| `gobuster`      | —           | Optional       | `go install ...gobuster@latest` |
| `ffuf`          | —           | Optional       | `go install ...ffuf@latest`     |
| `sqlmap`        | —           | Optional       | `apt install sqlmap`            |
| `nikto`         | —           | Optional       | `apt install nikto`             |
| `hydra`         | —           | Optional       | `apt install hydra`             |

Any tool marked **Optional** can be absent. The health check system will detect the absence and exclude that tool from the LLM's available actions — other tools continue to work normally.
