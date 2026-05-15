/**
 * Kapsamlı mock data — Demo mode'da tüm API çağrıları bu verileri döner.
 * Gerçek bir TIRPAN oturumunu simüle eder.
 */

const NOW = () => Math.floor(Date.now() / 1000);
const OFFSET = (s: number) => NOW() - s;

// ── Raw session (API formatı) ─────────────────────────────────────────────────

export const MOCK_SESSION_001: any = {
  id: "demo-session-001",
  name: "Metasploitable 2 Lab",
  target: "192.168.56.101",
  scope: "192.168.56.0/24",
  status: "done",
  is_running: false,
  mode: "full_auto",
  hosts_found: 1,
  vulns_found: 8,
  exploits_run: 3,
  created_at: OFFSET(272),
  finished_at: OFFSET(0),
  scan_results: [
    {
      id: "sr-001",
      session_id: "demo-session-001",
      target: "192.168.56.101",
      created_at: OFFSET(260),
      hosts: [
        {
          ip: "192.168.56.101",
          os_type: "Linux",
          os: "Linux 2.6.24-16-server (Ubuntu 8.04)",
          state: "up",
          ports: [
            { number: 21, service: "ftp", version: "vsftpd 2.3.4", state: "open" },
            { number: 22, service: "ssh", version: "OpenSSH 4.7p1 Debian", state: "open" },
            { number: 23, service: "telnet", version: "Linux telnetd", state: "open" },
            { number: 25, service: "smtp", version: "Postfix smtpd", state: "open" },
            { number: 80, service: "http", version: "Apache httpd 2.2.8", state: "open" },
            { number: 139, service: "netbios-ssn", version: "Samba smbd 3.X", state: "open" },
            { number: 445, service: "microsoft-ds", version: "Samba smbd 3.0.20", state: "open" },
            { number: 512, service: "exec", version: "netkit-rsh rexecd", state: "open" },
            { number: 513, service: "login", version: "", state: "open" },
            { number: 514, service: "tcpwrapped", version: "", state: "open" },
            { number: 1099, service: "java-rmi", version: "GNU Classpath grmiregistry", state: "open" },
            { number: 1524, service: "bindshell", version: "Metasploitable root shell", state: "open" },
            { number: 2049, service: "nfs", version: "2-4 (RPC #100003)", state: "open" },
            { number: 2121, service: "ftp", version: "ProFTPD 1.3.1", state: "open" },
            { number: 3306, service: "mysql", version: "MySQL 5.0.51a-3ubuntu5", state: "open" },
            { number: 3632, service: "distccd", version: "distccd v1 (GNU 4.2.4)", state: "open" },
            { number: 5432, service: "postgresql", version: "PostgreSQL 8.3.0 - 8.3.7", state: "open" },
            { number: 5900, service: "vnc", version: "VNC (protocol 3.3)", state: "open" },
            { number: 6000, service: "X11", version: "access denied", state: "open" },
            { number: 6667, service: "irc", version: "UnrealIRCd", state: "open" },
            { number: 8009, service: "ajp13", version: "Apache Jserv (Protocol v1.3)", state: "open" },
            { number: 8180, service: "http", version: "Apache Tomcat/Coyote JSP", state: "open" },
          ],
        },
      ],
    },
  ],
  vulnerabilities: [
    { id: "v1", session_id: "demo-session-001", host_ip: "192.168.56.101", cve: "CVE-2011-2523", title: "vsftpd 2.3.4 Backdoor Command Execution", cvss_score: 10.0, exploit_type: "rce", service: "ftp", port: 21, created_at: OFFSET(230) },
    { id: "v2", session_id: "demo-session-001", host_ip: "192.168.56.101", cve: "CVE-2007-2447", title: "Samba username map script RCE", cvss_score: 9.3, exploit_type: "rce", service: "smb", port: 445, created_at: OFFSET(210) },
    { id: "v3", session_id: "demo-session-001", host_ip: "192.168.56.101", cve: "CVE-2004-2687", title: "DistCC Daemon Remote Code Execution", cvss_score: 9.3, exploit_type: "rce", service: "distccd", port: 3632, created_at: OFFSET(195) },
    { id: "v4", session_id: "demo-session-001", host_ip: "192.168.56.101", cve: "CVE-2009-2446", title: "MySQL 5.0.51 Local Privilege Escalation (UDF)", cvss_score: 7.2, exploit_type: "privesc", service: "mysql", port: 3306, created_at: OFFSET(185) },
    { id: "v5", session_id: "demo-session-001", host_ip: "192.168.56.101", cve: "CWE-319", title: "Cleartext Protocols (Telnet, FTP, rsh)", cvss_score: 7.5, exploit_type: "exposure", service: "telnet/ftp/rsh", port: 23, created_at: OFFSET(175) },
    { id: "v6", session_id: "demo-session-001", host_ip: "192.168.56.101", cve: null, title: "Anonymous FTP Access Enabled", cvss_score: 5.3, exploit_type: "info_disclosure", service: "ftp", port: 21, created_at: OFFSET(165) },
    { id: "v7", session_id: "demo-session-001", host_ip: "192.168.56.101", cve: null, title: "NFS Shares Accessible Without Authentication", cvss_score: 5.0, exploit_type: "exposure", service: "nfs", port: 2049, created_at: OFFSET(155) },
    { id: "v8", session_id: "demo-session-001", host_ip: "192.168.56.101", cve: "CVE-2010-2075", title: "UnrealIRCd 3.2.8.1 Backdoor", cvss_score: 7.5, exploit_type: "rce", service: "irc", port: 6667, created_at: OFFSET(145) },
  ],
  exploit_results: [
    { id: "e1", session_id: "demo-session-001", host_ip: "192.168.56.101", module: "exploit/unix/ftp/vsftpd_234_backdoor", port: 21, success: true, session_opened: true, session_type: "shell", output: "[+] uid=0(root) gid=0(root) groups=0(root)\nCommand shell session 1 opened", created_at: OFFSET(220) },
    { id: "e2", session_id: "demo-session-001", host_ip: "192.168.56.101", module: "exploit/multi/samba/usermap_script", port: 445, success: true, session_opened: true, session_type: "shell", output: "[+] Command shell session 2 opened\nuid=0(root) gid=0(root)", created_at: OFFSET(200) },
    { id: "e3", session_id: "demo-session-001", host_ip: "192.168.56.101", module: "exploit/unix/misc/distcc_exec", port: 3632, success: true, session_opened: true, session_type: "shell", output: "[+] Command shell session 3 opened\nuid=1(daemon)", created_at: OFFSET(185) },
  ],
  mission_context: {
    hosts: {
      "192.168.56.101": {
        ip: "192.168.56.101",
        os_type: "Linux",
        os: "Ubuntu 8.04",
        ports: [
          { number: 21, service: "ftp", version: "vsftpd 2.3.4", state: "open" },
          { number: 22, service: "ssh", version: "OpenSSH 4.7p1", state: "open" },
          { number: 445, service: "smb", version: "Samba 3.0.20", state: "open" },
          { number: 3306, service: "mysql", version: "MySQL 5.0.51a", state: "open" },
          { number: 3632, service: "distccd", version: "distccd v1 (4.2.4)", state: "open" },
        ],
      },
    },
    active_sessions: [
      { host_ip: "192.168.56.101", session_type: "shell", privilege_level: 2, username: "root" },
    ],
    credentials_count: 3,
    attack_graph: { edges: [] },
  },
};

export const MOCK_SESSION_002: any = {
  id: "demo-session-002",
  name: "Internal Network Recon",
  target: "192.168.1.0/24",
  scope: "192.168.1.0/24",
  status: "done",
  is_running: false,
  mode: "scan_only",
  hosts_found: 8,
  vulns_found: 4,
  exploits_run: 0,
  created_at: OFFSET(86400),
  finished_at: OFFSET(85908),
  scan_results: [
    {
      id: "sr-002",
      session_id: "demo-session-002",
      target: "192.168.1.0/24",
      created_at: OFFSET(86200),
      hosts: [
        { ip: "192.168.1.1", os_type: "Linux", ports: [{ number: 22, service: "ssh", version: "OpenSSH 8.9", state: "open" }, { number: 80, service: "http", version: "nginx 1.18", state: "open" }] },
        { ip: "192.168.1.10", os_type: "Windows", ports: [{ number: 445, service: "smb", version: "Windows SMB", state: "open" }, { number: 3389, service: "rdp", version: "MS RDP", state: "open" }] },
        { ip: "192.168.1.20", os_type: "Linux", ports: [{ number: 22, service: "ssh", version: "OpenSSH 7.4", state: "open" }, { number: 8080, service: "http", version: "Apache 2.4.6", state: "open" }] },
        { ip: "192.168.1.30", os_type: "Windows", ports: [{ number: 135, service: "msrpc", version: "", state: "open" }, { number: 445, service: "smb", version: "Windows 10 SMB", state: "open" }] },
        { ip: "192.168.1.100", os_type: "Linux", ports: [{ number: 3306, service: "mysql", version: "MySQL 8.0", state: "open" }, { number: 6379, service: "redis", version: "Redis 6.0.16", state: "open" }] },
        { ip: "192.168.1.200", os_type: "Windows", ports: [{ number: 88, service: "kerberos", version: "", state: "open" }, { number: 389, service: "ldap", version: "AD LDAP", state: "open" }, { number: 445, service: "smb", version: "Windows Server 2022", state: "open" }] },
      ],
    },
  ],
  vulnerabilities: [
    { id: "v9", session_id: "demo-session-002", host_ip: "192.168.1.1", cve: null, title: "Default Credentials on Admin Panel", cvss_score: 7.3, exploit_type: "auth_bypass", service: "http", port: 80 },
    { id: "v10", session_id: "demo-session-002", host_ip: "192.168.1.100", cve: null, title: "Redis Exposed Without Authentication", cvss_score: 7.5, exploit_type: "auth_bypass", service: "redis", port: 6379 },
    { id: "v11", session_id: "demo-session-002", host_ip: "192.168.1.200", cve: "CVE-2021-42278", title: "Active Directory sAMAccountName Spoofing", cvss_score: 7.5, exploit_type: "privesc", service: "ldap", port: 389 },
    { id: "v12", session_id: "demo-session-002", host_ip: "192.168.1.10", cve: null, title: "SMB Signing Disabled", cvss_score: 5.4, exploit_type: "relay", service: "smb", port: 445 },
  ],
  exploit_results: [],
  mission_context: {
    hosts: {},
    active_sessions: [],
    credentials_count: 0,
    attack_graph: { edges: [] },
  },
};

export const MOCK_SESSION_003: any = {
  id: "demo-session-003",
  name: "HackTheBox — Lame",
  target: "10.10.14.56",
  scope: "10.10.14.0/24",
  status: "done",
  is_running: false,
  mode: "full_auto",
  hosts_found: 1,
  vulns_found: 6,
  exploits_run: 2,
  created_at: OFFSET(3600),
  finished_at: OFFSET(3600 - 764),
  scan_results: [
    {
      id: "sr-003",
      session_id: "demo-session-003",
      target: "10.10.14.56",
      created_at: OFFSET(3550),
      hosts: [
        {
          ip: "10.10.14.56",
          os_type: "Linux",
          os: "Linux 2.6.24",
          ports: [
            { number: 21, service: "ftp", version: "vsftpd 2.3.4", state: "open" },
            { number: 22, service: "ssh", version: "OpenSSH 4.7p1", state: "open" },
            { number: 139, service: "netbios-ssn", version: "Samba smbd 3.X", state: "open" },
            { number: 445, service: "microsoft-ds", version: "Samba smbd 3.0.20", state: "open" },
            { number: 3632, service: "distccd", version: "distccd v1 (4.2.4)", state: "open" },
          ],
        },
      ],
    },
  ],
  vulnerabilities: [
    { id: "v13", session_id: "demo-session-003", host_ip: "10.10.14.56", cve: "CVE-2007-2447", title: "Samba 3.0.20 usermap_script RCE", cvss_score: 9.3, exploit_type: "rce", service: "smb", port: 445 },
    { id: "v14", session_id: "demo-session-003", host_ip: "10.10.14.56", cve: "CVE-2011-2523", title: "vsftpd 2.3.4 Backdoor", cvss_score: 10.0, exploit_type: "rce", service: "ftp", port: 21 },
    { id: "v15", session_id: "demo-session-003", host_ip: "10.10.14.56", cve: "CVE-2004-2687", title: "DistCC RCE", cvss_score: 9.3, exploit_type: "rce", service: "distccd", port: 3632 },
    { id: "v16", session_id: "demo-session-003", host_ip: "10.10.14.56", cve: null, title: "Anonymous FTP Access", cvss_score: 5.3, exploit_type: "info_disclosure", service: "ftp", port: 21 },
    { id: "v17", session_id: "demo-session-003", host_ip: "10.10.14.56", cve: null, title: "Weak SSH Key Algorithms", cvss_score: 4.8, exploit_type: "exposure", service: "ssh", port: 22 },
    { id: "v18", session_id: "demo-session-003", host_ip: "10.10.14.56", cve: null, title: "SMB NULL Session Enumeration", cvss_score: 5.0, exploit_type: "info_disclosure", service: "smb", port: 445 },
  ],
  exploit_results: [
    { id: "e4", session_id: "demo-session-003", host_ip: "10.10.14.56", module: "exploit/multi/samba/usermap_script", port: 445, success: true, session_opened: true, session_type: "shell", output: "[+] uid=0(root) gid=0(root)", created_at: OFFSET(3400) },
    { id: "e5", session_id: "demo-session-003", host_ip: "10.10.14.56", module: "exploit/unix/ftp/vsftpd_234_backdoor", port: 21, success: true, session_opened: true, session_type: "shell", output: "[+] uid=0(root) gid=0(root)", created_at: OFFSET(3350) },
  ],
  mission_context: {
    hosts: {
      "10.10.14.56": { ip: "10.10.14.56", os_type: "Linux", ports: [] },
    },
    active_sessions: [{ host_ip: "10.10.14.56", session_type: "shell", privilege_level: 2, username: "root" }],
    credentials_count: 2,
    attack_graph: { edges: [] },
  },
};

export const MOCK_SESSIONS_LIST = [
  // List format (lighter — from /api/v1/sessions)
  {
    id: MOCK_SESSION_003.id,
    name: MOCK_SESSION_003.name,
    target: MOCK_SESSION_003.target,
    status: MOCK_SESSION_003.status,
    is_running: false,
    mode: MOCK_SESSION_003.mode,
    hosts_found: MOCK_SESSION_003.hosts_found,
    vulns_found: MOCK_SESSION_003.vulns_found,
    exploits_run: MOCK_SESSION_003.exploits_run,
    created_at: MOCK_SESSION_003.created_at,
    finished_at: MOCK_SESSION_003.finished_at,
    scope: MOCK_SESSION_003.scope,
  },
  {
    id: MOCK_SESSION_002.id,
    name: MOCK_SESSION_002.name,
    target: MOCK_SESSION_002.target,
    status: MOCK_SESSION_002.status,
    is_running: false,
    mode: MOCK_SESSION_002.mode,
    hosts_found: MOCK_SESSION_002.hosts_found,
    vulns_found: MOCK_SESSION_002.vulns_found,
    exploits_run: MOCK_SESSION_002.exploits_run,
    created_at: MOCK_SESSION_002.created_at,
    finished_at: MOCK_SESSION_002.finished_at,
    scope: MOCK_SESSION_002.scope,
  },
  {
    id: MOCK_SESSION_001.id,
    name: MOCK_SESSION_001.name,
    target: MOCK_SESSION_001.target,
    status: MOCK_SESSION_001.status,
    is_running: false,
    mode: MOCK_SESSION_001.mode,
    hosts_found: MOCK_SESSION_001.hosts_found,
    vulns_found: MOCK_SESSION_001.vulns_found,
    exploits_run: MOCK_SESSION_001.exploits_run,
    created_at: MOCK_SESSION_001.created_at,
    finished_at: MOCK_SESSION_001.finished_at,
    scope: MOCK_SESSION_001.scope,
  },
];

export const MOCK_SYSTEM_STATS = {
  cpu: 34,
  ram_used_gb: 5.8,
  ram_total_gb: 16,
  tokens: 52400,
  gpu: null,
  sessions_total: 3,
  sessions_running: 0,
};

export const MOCK_CREDENTIALS = [
  { id: 1, username: "root", password: "$1$/avpfBJ1$x0z8w5UF9Iv./DR9E9Lid.", hash: "$1$/avpfBJ1$x0z8w5UF9Iv./DR9E9Lid.", target: "192.168.56.101", source: "hashdump", type: "md5crypt", session_id: "demo-session-001", created_at: OFFSET(215) },
  { id: 2, username: "msfadmin", password: "msfadmin", hash: "", target: "192.168.56.101", source: "brute_force", type: "plaintext", session_id: "demo-session-001", created_at: OFFSET(210) },
  { id: 3, username: "user", password: "user", hash: "", target: "192.168.56.101", source: "brute_force", type: "plaintext", session_id: "demo-session-001", created_at: OFFSET(205) },
  { id: 4, username: "postgres", password: "postgres", hash: "", target: "192.168.56.101", source: "default_creds", type: "plaintext", session_id: "demo-session-001", created_at: OFFSET(200) },
  { id: 5, username: "root", password: "", hash: "aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0", target: "10.10.14.56", source: "mimikatz", type: "ntlm", session_id: "demo-session-003", created_at: OFFSET(3380) },
];

export const MOCK_TOOLS_STATUS = {
  core: [
    { name: "nmap", available: true, version: "7.94", path: "/usr/bin/nmap" },
    { name: "searchsploit", available: true, version: "4.20.0", path: "/usr/bin/searchsploit" },
    { name: "metasploit", available: true, version: "6.3.44", path: "/usr/bin/msfconsole" },
  ],
  extended: [
    { name: "whatweb", available: true, version: "0.5.5", path: "/usr/bin/whatweb" },
    { name: "nikto", available: true, version: "2.1.6", path: "/usr/bin/nikto" },
    { name: "nuclei", available: true, version: "3.1.7", path: "/usr/local/bin/nuclei" },
    { name: "ffuf", available: true, version: "2.1.0", path: "/usr/local/bin/ffuf" },
    { name: "sqlmap", available: true, version: "1.7.11", path: "/usr/bin/sqlmap" },
    { name: "theHarvester", available: true, version: "4.4.3", path: "/usr/bin/theHarvester" },
    { name: "subfinder", available: true, version: "2.6.3", path: "/usr/local/bin/subfinder" },
    { name: "crackmapexec", available: false, version: null, path: null, install_hint: "pip install crackmapexec" },
    { name: "impacket", available: false, version: null, path: null, install_hint: "pip install impacket" },
  ],
};

export const MOCK_SCAN_PROFILES = [
  { id: "stealth", name: "Stealth", description: "T1 timing — IDS-evasive, minimal log footprint", nmap_flags: "-T1 --scan-delay 5s" },
  { id: "normal", name: "Normal", description: "T3 timing — Balanced, default for most engagements", nmap_flags: "-T3" },
  { id: "aggressive", name: "Aggressive", description: "T5 timing — Maximum speed, lab/CTF only", nmap_flags: "-T5 --min-rate 5000" },
];

export const MOCK_AGENTS = [
  { id: "agent-brain", name: "Brain", type: "coordinator", status: "done", tasks_completed: 14, created_at: OFFSET(272) },
  { id: "agent-scanner", name: "Scanner", type: "scanner", status: "done", tasks_completed: 2, created_at: OFFSET(265) },
  { id: "agent-exploit", name: "Exploit", type: "exploit", status: "done", tasks_completed: 3, created_at: OFFSET(240) },
  { id: "agent-post", name: "Post-Exploit", type: "post_exploit", status: "done", tasks_completed: 5, created_at: OFFSET(190) },
];

export const MOCK_LOOT = [
  { id: "l1", session_id: "demo-session-001", type: "file", path: "/etc/shadow", content: "root:$1$/avpfBJ1$x0z8w5UF9Iv./DR9E9Lid.:14747:0:99999:7:::\nmsfadmin:$1$XN10Zj2c$Xh41s4ER9kQNQKVA.eMFi/:14747", host: "192.168.56.101", created_at: OFFSET(210) },
  { id: "l2", session_id: "demo-session-001", type: "file", path: "/etc/passwd", content: "root:x:0:0:root:/root:/bin/bash\nmsfadmin:x:1000:1000:msfadmin,,,:/home/msfadmin:/bin/bash", host: "192.168.56.101", created_at: OFFSET(208) },
];

export const MOCK_SHELLS = [
  { id: "sh1", session_id: "demo-session-001", host: "192.168.56.101", type: "shell", port: 6200, user: "root", created_at: OFFSET(220), active: false },
  { id: "sh2", session_id: "demo-session-001", host: "192.168.56.101", type: "shell", port: 4444, user: "root", created_at: OFFSET(200), active: false },
];

export const MOCK_EVENTS = (sessionId: string) => {
  const events: any[] = [];
  const session = [MOCK_SESSION_001, MOCK_SESSION_002, MOCK_SESSION_003].find(s => s.id === sessionId) || MOCK_SESSION_001;
  const ts = (s: number) => session.created_at + s;

  if (sessionId === "demo-session-001" || sessionId === "demo-session-003") {
    events.push(
      { id: "ev1", type: "phase_change", content: "Reconnaissance started", created_at: ts(5), session_id: sessionId },
      { id: "ev2", type: "reasoning", content: "Starting engagement. No prior knowledge. Beginning with host discovery.", created_at: ts(8), session_id: sessionId },
      { id: "ev3", type: "tool_result", content: "nmap: Host is up (0.0012s latency). Running full port scan...", created_at: ts(15), session_id: sessionId },
      { id: "ev4", type: "reasoning", content: "23 open ports found. vsftpd 2.3.4 detected — known backdoor CVE-2011-2523 (CVSS 10.0). Targeting first.", created_at: ts(30), session_id: sessionId },
      { id: "ev5", type: "tool_result", content: "searchsploit: vsftpd_234_backdoor — CVSS 10.0 CRITICAL", created_at: ts(45), session_id: sessionId },
      { id: "ev6", type: "phase_change", content: "Exploitation started", created_at: ts(60), session_id: sessionId },
      { id: "ev7", type: "reasoning", content: "CVE-2011-2523 confirmed. Executing exploit.", created_at: ts(65), session_id: sessionId },
      { id: "ev8", type: "shell_open", content: "Shell opened: 192.168.56.101 — uid=0(root)", created_at: ts(80), session_id: sessionId },
      { id: "ev9", type: "finding", content: "CRITICAL: vsftpd 2.3.4 Backdoor — CVSS 10.0", created_at: ts(82), session_id: sessionId },
      { id: "ev10", type: "reasoning", content: "Root shell obtained. Checking Samba 3.0.20 for additional critical finding.", created_at: ts(90), session_id: sessionId },
      { id: "ev11", type: "shell_open", content: "Shell opened: 192.168.56.101 — uid=0(root) via Samba usermap_script", created_at: ts(120), session_id: sessionId },
      { id: "ev12", type: "finding", content: "CRITICAL: Samba usermap_script RCE — CVSS 9.3", created_at: ts(122), session_id: sessionId },
      { id: "ev13", type: "phase_change", content: "Post-exploitation started", created_at: ts(140), session_id: sessionId },
      { id: "ev14", type: "tool_result", content: "shell_exec: /etc/shadow read. 3 password hashes harvested.", created_at: ts(165), session_id: sessionId },
      { id: "ev15", type: "agent_done", content: "Engagement complete. 3 CRITICAL · 2 HIGH · 3 MEDIUM findings. Report generated.", created_at: ts(272), session_id: sessionId },
    );
  }
  return events.slice(0, 500);
};

// ── Running demo session (başlatıldığında) ─────────────────────────────────────

export function buildRunningMockSession(): any {
  const startedAt = parseInt(localStorage.getItem("tirpan_demo_started") || "0") || NOW();
  const elapsed = NOW() - startedAt;

  // Progressively reveal data based on elapsed time
  const hasPortScan = elapsed > 10;
  const hasVulns = elapsed > 25;
  const hasExploit1 = elapsed > 45;
  const hasExploit2 = elapsed > 65;
  const hasExploit3 = elapsed > 85;
  const isDone = elapsed > 120;

  const session: any = {
    id: "demo-session-running",
    name: "Demo Engagement (Live)",
    target: localStorage.getItem("tirpan_demo_target") || "192.168.56.101",
    scope: "192.168.56.0/24",
    status: isDone ? "done" : "running",
    is_running: !isDone,
    mode: "full_auto",
    hosts_found: hasPortScan ? 1 : 0,
    vulns_found: [hasVulns, hasExploit1, hasExploit2, hasExploit3].filter(Boolean).length * 2,
    exploits_run: [hasExploit1, hasExploit2, hasExploit3].filter(Boolean).length,
    created_at: startedAt,
    finished_at: isDone ? startedAt + 120 : null,
    scan_results: hasPortScan ? MOCK_SESSION_001.scan_results : [],
    vulnerabilities: hasVulns ? MOCK_SESSION_001.vulnerabilities.slice(0, hasExploit3 ? 8 : hasExploit2 ? 5 : hasExploit1 ? 3 : 1) : [],
    exploit_results: [
      ...(hasExploit1 ? [MOCK_SESSION_001.exploit_results[0]] : []),
      ...(hasExploit2 ? [MOCK_SESSION_001.exploit_results[1]] : []),
      ...(hasExploit3 ? [MOCK_SESSION_001.exploit_results[2]] : []),
    ],
    mission_context: {
      hosts: hasPortScan ? MOCK_SESSION_001.mission_context.hosts : {},
      active_sessions: hasExploit1 ? MOCK_SESSION_001.mission_context.active_sessions : [],
      credentials_count: hasExploit1 ? 2 : 0,
      attack_graph: { edges: [] },
    },
  };
  return session;
}
