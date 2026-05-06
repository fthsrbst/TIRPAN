# Agent Log

- `session_id`: `5b6be453-c6bb-4273-acd0-49a279e4fc19`
- `agent_id`: `scanner-91b4ed24`
- `agent_type`: `scanner`

## 2026-05-05T21:22:56.563313+00:00 `agent_spawned`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "target": "192.168.1.0/24"
}
```

## 2026-05-05T21:22:56.565371+00:00 `debug_log`
```json
{
  "prefix": "INFO",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "_run_child started → agent_type=scanner",
  "level": "info",
  "ts": "+484.187s"
}
```

## 2026-05-05T21:22:56.591961+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "agent_spawned",
  "task_type": "tcp_scan"
}
```

## 2026-05-05T21:22:56.612384+00:00 `agent_start`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "mission_id": "5b6be453-c6bb-4273-acd0-49a279e4fc19"
}
```

## 2026-05-05T21:22:56.612540+00:00 `llm_thinking_start`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner"
}
```

## 2026-05-05T21:23:07.000158+00:00 `reasoning`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "thought": "Starting with a service scan on 192.168.1.0/24 to discover live hosts and open TCP ports. This scan type uses -Pn, so it works even if ICMP is blocked.",
  "action": "nmap_scan",
  "reasoning": "",
  "situation": "",
  "hypothesis": "",
  "decision": ""
}
```

## 2026-05-05T21:23:07.000383+00:00 `debug_log`
```json
{
  "prefix": "THINK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "Starting with a service scan on 192.168.1.0/24 to discover live hosts and open TCP ports. This scan type uses -Pn, so it works even if ICMP is blocked.",
  "level": "debug",
  "ts": "+494.622s"
}
```

## 2026-05-05T21:23:07.000538+00:00 `debug_log`
```json
{
  "prefix": "ACTION",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "nmap_scan  params={\"target\": \"192.168.1.0/24\", \"scan_type\": \"service\"}",
  "level": "debug",
  "ts": "+494.622s"
}
```

## 2026-05-05T21:23:07.000712+00:00 `tool_call`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "nmap_scan",
  "params": {
    "target": "192.168.1.0/24",
    "scan_type": "service"
  }
}
```

## 2026-05-05T21:23:07.000799+00:00 `debug_log`
```json
{
  "prefix": "TOOL→",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "nmap_scan  {\"target\": \"192.168.1.0/24\", \"scan_type\": \"service\"}",
  "level": "debug",
  "ts": "+494.622s"
}
```

## 2026-05-05T21:25:32.030729+00:00 `debug_log`
```json
{
  "prefix": "TOOL←OK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "nmap_scan (145013ms)  {\"target\": \"192.168.1.0/24\", \"scan_type\": \"service\", \"hosts\": [{\"ip\": \"192.168.1.0\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.1\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": [{…(187720 more)",
  "level": "debug",
  "ts": "+639.652s"
}
```

## 2026-05-05T21:25:32.031367+00:00 `tool_result`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "nmap_scan",
  "success": true,
  "output": "{\"target\": \"192.168.1.0/24\", \"scan_type\": \"service\", \"hosts\": [{\"ip\": \"192.168.1.0\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.1\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": [{\"number\": 53, \"protocol\": \"tcp\", \"state\": \"open\", \"service\": \"domain\", \"version\": \"\", \"banner\": \"\"}, {\"number\": 80, \"protocol\": \"tcp\", \"state\": \"open\", \"service\": \"http\", \"version\": \"Mini web server 1.0\", \"banner\": \"\"}, {\"number\": 443, \"protocol\": \"tcp\", \"state\": \"filtered\", \"service\": \"https\", \"version\": \"\", \"banner\": \"\"}]}, {\"ip\": \"192.168.1.2\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.3\", \"hostname\": \"host.docker.internal\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.4\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.5\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.6\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.7\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.8\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": [{\"number\": 22, \"protocol\": \"tcp\", \"state\": \"open\", \"service\": \"ssh\", \"version\": \"OpenSSH 6.6.0\", \"banner\": \"\"}, {\"number\": 80, \"protocol\": \"tcp\", \"state\": \"open\", \"service\": \"http\", \"version\": \"TP-LINK router http config\", \"banner\": \"\"}, {\"number\": 443, \"protocol\": \"tcp\", \"state\": \"open\", \"service\": \"http\", \"version\": \"TP-LINK router http config\", \"banner\": \"\"}]}, {\"ip\": \"192.168.1.9\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.10\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.11\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.12\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.13\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.14\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.15\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.16\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.17\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.18\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": []}, {\"ip\": \"192.168.1.19\", \"hostname\": \"\", \"os\": \"\", \"os_accuracy\": 0, \"state\": \"up\", \"ports\": [{\"number\": 135, \"protocol\": \"tcp\", \"state\": \"open\", \"service\": \"msrpc\", \"version\": \"Microsoft Windows RPC\", \"banner\": \"\"}, {\"number\": 139, \"protocol\": \"tcp\", \"state\": \"open\", \"service\": \"netbios-ssn\", \"version\": \"Microsoft Windows netbios-ssn\", \"banner\": \"\"}, {\"number\": 445, \"protocol\": \"tcp\", \"state\": \"open\", \"service\": \n... [truncated]",
  "error": null
}
```

## 2026-05-05T21:25:32.043493+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.0",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.043707+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.0', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.665s"
}
```

## 2026-05-05T21:25:32.043870+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.1",
  "hostname": "",
  "os_type": "",
  "ports": [
    {
      "number": 53,
      "service": "domain",
      "version": "",
      "state": "open"
    },
    {
      "number": 80,
      "service": "http",
      "version": "Mini web server 1.0",
      "state": "open"
    }
  ]
}
```

## 2026-05-05T21:25:32.044007+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.1', 'hostname': '', 'os_type': '', 'ports': [{'number': 53, 'service': 'domain', 'version': '', 'state': 'open'}, {'number': 80, 'service': 'http', 'version': 'Mini w",
  "level": "debug",
  "ts": "+639.666s"
}
```

## 2026-05-05T21:25:32.044111+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.2",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.044197+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.2', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.666s"
}
```

## 2026-05-05T21:25:32.044285+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.3",
  "hostname": "host.docker.internal",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.044366+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.3', 'hostname': 'host.docker.internal', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.666s"
}
```

## 2026-05-05T21:25:32.044474+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.4",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.044608+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.4', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.666s"
}
```

## 2026-05-05T21:25:32.044714+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.5",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.044828+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.5', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.666s"
}
```

## 2026-05-05T21:25:32.044915+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.6",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.044992+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.6', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.667s"
}
```

## 2026-05-05T21:25:32.045088+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.7",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.045196+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.7', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.667s"
}
```

## 2026-05-05T21:25:32.045294+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.8",
  "hostname": "",
  "os_type": "",
  "ports": [
    {
      "number": 22,
      "service": "ssh",
      "version": "OpenSSH 6.6.0",
      "state": "open"
    },
    {
      "number": 80,
      "service": "http",
      "version": "TP-LINK router http config",
      "state": "open"
    },
    {
      "number": 443,
      "service": "http",
      "version": "TP-LINK router http config",
      "state": "open"
    }
  ]
}
```

## 2026-05-05T21:25:32.045389+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.8', 'hostname': '', 'os_type': '', 'ports': [{'number': 22, 'service': 'ssh', 'version': 'OpenSSH 6.6.0', 'state': 'open'}, {'number': 80, 'service': 'http', 'version",
  "level": "debug",
  "ts": "+639.667s"
}
```

## 2026-05-05T21:25:32.045479+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.9",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.045555+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.9', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.667s"
}
```

## 2026-05-05T21:25:32.045678+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.10",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.045870+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.10', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.667s"
}
```

## 2026-05-05T21:25:32.045995+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.11",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.046146+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.11', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.668s"
}
```

## 2026-05-05T21:25:32.046250+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.12",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.046392+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.12', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.668s"
}
```

## 2026-05-05T21:25:32.046508+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.13",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.046598+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.13', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.668s"
}
```

## 2026-05-05T21:25:32.046700+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.14",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.046822+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.14', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.668s"
}
```

## 2026-05-05T21:25:32.046912+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.15",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.046989+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.15', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.669s"
}
```

## 2026-05-05T21:25:32.047103+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.16",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.047194+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.16', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.669s"
}
```

## 2026-05-05T21:25:32.047282+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.17",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.047359+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.17', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.669s"
}
```

## 2026-05-05T21:25:32.047450+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.18",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.047577+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.18', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.669s"
}
```

## 2026-05-05T21:25:32.047666+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.19",
  "hostname": "",
  "os_type": "",
  "ports": [
    {
      "number": 135,
      "service": "msrpc",
      "version": "Microsoft Windows RPC",
      "state": "open"
    },
    {
      "number": 139,
      "service": "netbios-ssn",
      "version": "Microsoft Windows netbios-ssn",
      "state": "open"
    },
    {
      "number": 445,
      "service": "microsoft-ds",
      "version": "",
      "state": "open"
    }
  ]
}
```

## 2026-05-05T21:25:32.047750+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.19', 'hostname': '', 'os_type': '', 'ports': [{'number': 135, 'service': 'msrpc', 'version': 'Microsoft Windows RPC', 'state': 'open'}, {'number': 139, 'service': 'ne",
  "level": "debug",
  "ts": "+639.669s"
}
```

## 2026-05-05T21:25:32.047874+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.20",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.047999+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.20', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.670s"
}
```

## 2026-05-05T21:25:32.048111+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.21",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.048208+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.21', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.670s"
}
```

## 2026-05-05T21:25:32.048300+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.22",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.048377+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.22', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.670s"
}
```

## 2026-05-05T21:25:32.048494+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.23",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.048590+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.23', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.670s"
}
```

## 2026-05-05T21:25:32.048723+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.24",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.048863+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.24', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.670s"
}
```

## 2026-05-05T21:25:32.048961+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.25",
  "hostname": "",
  "os_type": "",
  "ports": [
    {
      "number": 22,
      "service": "ssh",
      "version": "OpenSSH 10.0p2 Debian 7+deb13u2",
      "state": "open"
    },
    {
      "number": 80,
      "service": "http",
      "version": "nginx",
      "state": "open"
    },
    {
      "number": 111,
      "service": "rpcbind",
      "version": "2-4",
      "state": "open"
    },
    {
      "number": 139,
      "service": "netbios-ssn",
      "version": "Samba smbd 4",
      "state": "open"
    },
    {
      "number": 222,
      "service": "ssh",
      "version": "OpenSSH 10.0",
      "state": "open"
    },
    {
      "number": 445,
      "service": "netbios-ssn",
      "version": "Samba smbd 4",
      "state": "open"
    }
  ]
}
```

## 2026-05-05T21:25:32.049054+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.25', 'hostname': '', 'os_type': '', 'ports': [{'number': 22, 'service': 'ssh', 'version': 'OpenSSH 10.0p2 Debian 7+deb13u2', 'state': 'open'}, {'number': 80, 'service",
  "level": "debug",
  "ts": "+639.671s"
}
```

## 2026-05-05T21:25:32.049178+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.26",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.049282+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.26', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.671s"
}
```

## 2026-05-05T21:25:32.049411+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.27",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.049523+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.27', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.671s"
}
```

## 2026-05-05T21:25:32.049611+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.28",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.049687+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.28', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.671s"
}
```

## 2026-05-05T21:25:32.049782+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.29",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.049879+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.29', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.671s"
}
```

## 2026-05-05T21:25:32.050017+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.30",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.050124+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.30', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.672s"
}
```

## 2026-05-05T21:25:32.050252+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.31",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.050365+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.31', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.672s"
}
```

## 2026-05-05T21:25:32.050474+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.32",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.050581+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.32', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.672s"
}
```

## 2026-05-05T21:25:32.050678+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.33",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.050819+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.33', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.672s"
}
```

## 2026-05-05T21:25:32.050927+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.34",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.051015+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.34', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.673s"
}
```

## 2026-05-05T21:25:32.051101+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.35",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.051175+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.35', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.673s"
}
```

## 2026-05-05T21:25:32.051260+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.36",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.051335+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.36', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.673s"
}
```

## 2026-05-05T21:25:32.051434+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.37",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.051569+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.37', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.673s"
}
```

## 2026-05-05T21:25:32.051673+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.38",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.051789+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.38', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.673s"
}
```

## 2026-05-05T21:25:32.051879+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.39",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.051956+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.39', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.673s"
}
```

## 2026-05-05T21:25:32.052077+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.40",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.052172+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.40', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.674s"
}
```

## 2026-05-05T21:25:32.052263+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.41",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.052338+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.41', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.674s"
}
```

## 2026-05-05T21:25:32.052437+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.42",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.052535+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.42', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.674s"
}
```

## 2026-05-05T21:25:32.052628+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.43",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.052716+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.43', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.674s"
}
```

## 2026-05-05T21:25:32.052802+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.44",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.052876+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.44', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.674s"
}
```

## 2026-05-05T21:25:32.052961+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.45",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.053036+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.45', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.675s"
}
```

## 2026-05-05T21:25:32.053122+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.46",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.053197+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.46', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.675s"
}
```

## 2026-05-05T21:25:32.053313+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.47",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.053401+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.47', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.675s"
}
```

## 2026-05-05T21:25:32.053492+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.48",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.053566+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.48', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.675s"
}
```

## 2026-05-05T21:25:32.053651+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.49",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.053725+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.49', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.675s"
}
```

## 2026-05-05T21:25:32.053864+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.50",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.053998+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.50', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.676s"
}
```

## 2026-05-05T21:25:32.054087+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.51",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.054166+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.51', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.676s"
}
```

## 2026-05-05T21:25:32.054252+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.52",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.054339+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.52', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.676s"
}
```

## 2026-05-05T21:25:32.054452+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.53",
  "hostname": "",
  "os_type": "",
  "ports": [
    {
      "number": 22,
      "service": "ssh",
      "version": "OpenSSH 10.0p2 Debian 7+deb13u2",
      "state": "open"
    },
    {
      "number": 80,
      "service": "http",
      "version": "nginx",
      "state": "open"
    },
    {
      "number": 111,
      "service": "rpcbind",
      "version": "2-4",
      "state": "open"
    },
    {
      "number": 139,
      "service": "netbios-ssn",
      "version": "Samba smbd 4",
      "state": "open"
    },
    {
      "number": 222,
      "service": "ssh",
      "version": "OpenSSH 10.0",
      "state": "open"
    },
    {
      "number": 445,
      "service": "netbios-ssn",
      "version": "Samba smbd 4",
      "state": "open"
    }
  ]
}
```

## 2026-05-05T21:25:32.054593+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.53', 'hostname': '', 'os_type': '', 'ports': [{'number': 22, 'service': 'ssh', 'version': 'OpenSSH 10.0p2 Debian 7+deb13u2', 'state': 'open'}, {'number': 80, 'service",
  "level": "debug",
  "ts": "+639.676s"
}
```

## 2026-05-05T21:25:32.054751+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.54",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.058888+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.54', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.680s"
}
```

## 2026-05-05T21:25:32.059021+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.55",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.059133+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.55', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.681s"
}
```

## 2026-05-05T21:25:32.059242+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.56",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.059345+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.56', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.681s"
}
```

## 2026-05-05T21:25:32.059450+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.57",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.059532+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.57', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.681s"
}
```

## 2026-05-05T21:25:32.059639+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.58",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.059724+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.58', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.681s"
}
```

## 2026-05-05T21:25:32.059812+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.59",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.059889+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.59', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.681s"
}
```

## 2026-05-05T21:25:32.059976+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.60",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.060058+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.60', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.682s"
}
```

## 2026-05-05T21:25:32.060152+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.61",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.060228+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.61', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.682s"
}
```

## 2026-05-05T21:25:32.060314+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.62",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.060389+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.62', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.682s"
}
```

## 2026-05-05T21:25:32.060480+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.63",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.060575+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.63', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.682s"
}
```

## 2026-05-05T21:25:32.060705+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.64",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.060857+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.64', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.682s"
}
```

## 2026-05-05T21:25:32.060949+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.65",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.061031+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.65', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.683s"
}
```

## 2026-05-05T21:25:32.061120+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.66",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.061202+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.66', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.683s"
}
```

## 2026-05-05T21:25:32.061292+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.67",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.061374+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.67', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.683s"
}
```

## 2026-05-05T21:25:32.061480+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.68",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.061630+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.68', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.683s"
}
```

## 2026-05-05T21:25:32.061718+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.69",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.061794+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.69', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.683s"
}
```

## 2026-05-05T21:25:32.061880+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.70",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.061971+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.70', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.683s"
}
```

## 2026-05-05T21:25:32.062060+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.71",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.062134+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.71', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.684s"
}
```

## 2026-05-05T21:25:32.062218+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.72",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.062292+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.72', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.684s"
}
```

## 2026-05-05T21:25:32.062377+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.73",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.062451+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.73', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.684s"
}
```

## 2026-05-05T21:25:32.062536+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.74",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.062618+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.74', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.684s"
}
```

## 2026-05-05T21:25:32.062739+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.75",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.062917+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.75', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.684s"
}
```

## 2026-05-05T21:25:32.063038+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.76",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.063138+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.76', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.685s"
}
```

## 2026-05-05T21:25:32.063231+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.77",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.063311+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.77', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.685s"
}
```

## 2026-05-05T21:25:32.063401+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.78",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.063480+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.78', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.685s"
}
```

## 2026-05-05T21:25:32.063569+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.79",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.063646+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.79', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.685s"
}
```

## 2026-05-05T21:25:32.063735+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.80",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.063812+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.80', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.685s"
}
```

## 2026-05-05T21:25:32.063900+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.81",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.063980+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.81', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.686s"
}
```

## 2026-05-05T21:25:32.064068+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.82",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.064144+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.82', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.686s"
}
```

## 2026-05-05T21:25:32.064231+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.83",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.064308+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.83', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.686s"
}
```

## 2026-05-05T21:25:32.064397+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.84",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.064472+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.84', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.686s"
}
```

## 2026-05-05T21:25:32.064559+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.85",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.064634+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.85', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.686s"
}
```

## 2026-05-05T21:25:32.064754+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.86",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.064839+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.86', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.686s"
}
```

## 2026-05-05T21:25:32.064926+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.87",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.065000+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.87', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.687s"
}
```

## 2026-05-05T21:25:32.065088+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.88",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.065167+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.88', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.687s"
}
```

## 2026-05-05T21:25:32.065254+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.89",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.065328+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.89', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.687s"
}
```

## 2026-05-05T21:25:32.065415+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.90",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.065488+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.90', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.687s"
}
```

## 2026-05-05T21:25:32.065575+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.91",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.065649+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.91', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.687s"
}
```

## 2026-05-05T21:25:32.065737+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.92",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.065813+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.92', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.687s"
}
```

## 2026-05-05T21:25:32.065901+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.93",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.066030+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.93', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.688s"
}
```

## 2026-05-05T21:25:32.066124+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.94",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.066198+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.94', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.688s"
}
```

## 2026-05-05T21:25:32.066285+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.95",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.066377+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.95', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.688s"
}
```

## 2026-05-05T21:25:32.066499+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.96",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.066621+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.96', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.688s"
}
```

## 2026-05-05T21:25:32.066768+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.97",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.066895+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.97', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.688s"
}
```

## 2026-05-05T21:25:32.067009+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.98",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.067098+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.98', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.689s"
}
```

## 2026-05-05T21:25:32.067215+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.99",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.067322+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.99', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.689s"
}
```

## 2026-05-05T21:25:32.067432+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.100",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.067531+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.100', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.689s"
}
```

## 2026-05-05T21:25:32.067645+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.101",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.067735+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.101', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.689s"
}
```

## 2026-05-05T21:25:32.067828+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.102",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.067905+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.102', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.689s"
}
```

## 2026-05-05T21:25:32.067993+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.103",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.068067+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.103', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.690s"
}
```

## 2026-05-05T21:25:32.068181+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.104",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.068272+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.104', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.690s"
}
```

## 2026-05-05T21:25:32.068360+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.105",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.068435+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.105', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.690s"
}
```

## 2026-05-05T21:25:32.068522+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.106",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.068598+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.106', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.690s"
}
```

## 2026-05-05T21:25:32.068699+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.107",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.068833+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.107', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.690s"
}
```

## 2026-05-05T21:25:32.068937+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.108",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.069022+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.108', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.691s"
}
```

## 2026-05-05T21:25:32.069115+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.109",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.069192+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.109', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.691s"
}
```

## 2026-05-05T21:25:32.069279+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.110",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.069354+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.110', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.691s"
}
```

## 2026-05-05T21:25:32.069440+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.111",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.069515+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.111', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.691s"
}
```

## 2026-05-05T21:25:32.069601+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.112",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.069675+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.112', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.691s"
}
```

## 2026-05-05T21:25:32.069761+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.113",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.069835+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.113', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.691s"
}
```

## 2026-05-05T21:25:32.069927+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.114",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.070054+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.114', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.692s"
}
```

## 2026-05-05T21:25:32.070218+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.115",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.070294+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.115', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.692s"
}
```

## 2026-05-05T21:25:32.070413+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.116",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.070510+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.116', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.692s"
}
```

## 2026-05-05T21:25:32.070616+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.117",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.070698+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.117', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.692s"
}
```

## 2026-05-05T21:25:32.070820+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.118",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.070904+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.118', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.692s"
}
```

## 2026-05-05T21:25:32.071031+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.119",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.071162+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.119', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.693s"
}
```

## 2026-05-05T21:25:32.071262+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.120",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.071339+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.120', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.693s"
}
```

## 2026-05-05T21:25:32.071455+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.121",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.071552+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.121', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.693s"
}
```

## 2026-05-05T21:25:32.071640+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.122",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.071715+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.122', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.693s"
}
```

## 2026-05-05T21:25:32.071807+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.123",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.071881+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.123', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.693s"
}
```

## 2026-05-05T21:25:32.071967+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.124",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.072041+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.124', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.694s"
}
```

## 2026-05-05T21:25:32.072127+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.125",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.072202+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.125', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.694s"
}
```

## 2026-05-05T21:25:32.072289+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.126",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.072368+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.126', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.694s"
}
```

## 2026-05-05T21:25:32.072479+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.127",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.072597+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.127', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.694s"
}
```

## 2026-05-05T21:25:32.072690+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.128",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.072801+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.128', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.694s"
}
```

## 2026-05-05T21:25:32.072890+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.129",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.072964+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.129', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.694s"
}
```

## 2026-05-05T21:25:32.073056+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.130",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.073131+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.130', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.695s"
}
```

## 2026-05-05T21:25:32.073219+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.131",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.073295+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.131', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.695s"
}
```

## 2026-05-05T21:25:32.073381+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.132",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.073455+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.132', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.695s"
}
```

## 2026-05-05T21:25:32.073542+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.133",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.073621+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.133', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.695s"
}
```

## 2026-05-05T21:25:32.073707+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.134",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.073780+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.134', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.695s"
}
```

## 2026-05-05T21:25:32.073866+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.135",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.073950+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.135', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.695s"
}
```

## 2026-05-05T21:25:32.074061+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.136",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.074146+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.136', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.696s"
}
```

## 2026-05-05T21:25:32.074250+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.137",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.074327+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.137', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.696s"
}
```

## 2026-05-05T21:25:32.074414+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.138",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.074487+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.138', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.696s"
}
```

## 2026-05-05T21:25:32.074574+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.139",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.074655+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.139', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.696s"
}
```

## 2026-05-05T21:25:32.074759+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.140",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.074870+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.140', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.696s"
}
```

## 2026-05-05T21:25:32.074957+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.141",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.075031+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.141', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.697s"
}
```

## 2026-05-05T21:25:32.075126+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.142",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.075273+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.142', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.697s"
}
```

## 2026-05-05T21:25:32.075385+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.143",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.075469+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.143', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.697s"
}
```

## 2026-05-05T21:25:32.075561+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.144",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.075636+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.144', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.697s"
}
```

## 2026-05-05T21:25:32.075722+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.145",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.075797+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.145', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.697s"
}
```

## 2026-05-05T21:25:32.075886+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.146",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.075960+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.146', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.697s"
}
```

## 2026-05-05T21:25:32.076046+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.147",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.076120+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.147', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.698s"
}
```

## 2026-05-05T21:25:32.076208+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.148",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.076283+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.148', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.698s"
}
```

## 2026-05-05T21:25:32.076375+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.149",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.076449+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.149', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.698s"
}
```

## 2026-05-05T21:25:32.076540+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.150",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.076613+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.150', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.698s"
}
```

## 2026-05-05T21:25:32.076705+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.151",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.076818+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.151', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.698s"
}
```

## 2026-05-05T21:25:32.076906+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.152",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.076980+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.152', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.699s"
}
```

## 2026-05-05T21:25:32.077067+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.153",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.077141+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.153', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.699s"
}
```

## 2026-05-05T21:25:32.077230+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.154",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.077306+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.154', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.699s"
}
```

## 2026-05-05T21:25:32.077393+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.155",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.077466+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.155', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.699s"
}
```

## 2026-05-05T21:25:32.077553+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.156",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.077626+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.156', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.699s"
}
```

## 2026-05-05T21:25:32.077713+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.157",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.077792+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.157', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.699s"
}
```

## 2026-05-05T21:25:32.077880+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.158",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.078007+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.158', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.700s"
}
```

## 2026-05-05T21:25:32.078119+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.159",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.078208+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.159', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.700s"
}
```

## 2026-05-05T21:25:32.078299+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.160",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.078376+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.160', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.700s"
}
```

## 2026-05-05T21:25:32.078465+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.161",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.078541+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.161', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.700s"
}
```

## 2026-05-05T21:25:32.078629+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.162",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.078704+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.162', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.700s"
}
```

## 2026-05-05T21:25:32.078793+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.163",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.078869+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.163', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.700s"
}
```

## 2026-05-05T21:25:32.078957+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.164",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.079013+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.164', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.701s"
}
```

## 2026-05-05T21:25:32.079055+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.165",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.079115+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.165', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.701s"
}
```

## 2026-05-05T21:25:32.079203+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.166",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.079275+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.166', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.701s"
}
```

## 2026-05-05T21:25:32.079368+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.167",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.079510+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.167', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.701s"
}
```

## 2026-05-05T21:25:32.079625+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.168",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.079742+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.168', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.701s"
}
```

## 2026-05-05T21:25:32.079850+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.169",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.079950+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.169', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.701s"
}
```

## 2026-05-05T21:25:32.080038+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.170",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.080117+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.170', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.702s"
}
```

## 2026-05-05T21:25:32.080207+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.171",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.080288+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.171', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.702s"
}
```

## 2026-05-05T21:25:32.080393+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.172",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.080529+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.172', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.702s"
}
```

## 2026-05-05T21:25:32.080619+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.173",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.080727+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.173', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.702s"
}
```

## 2026-05-05T21:25:32.080815+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.174",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.080889+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.174', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.702s"
}
```

## 2026-05-05T21:25:32.080976+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.175",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.081054+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.175', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.703s"
}
```

## 2026-05-05T21:25:32.081140+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.176",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.081213+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.176', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.703s"
}
```

## 2026-05-05T21:25:32.081299+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.177",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.081376+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.177', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.703s"
}
```

## 2026-05-05T21:25:32.081462+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.178",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.081584+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.178', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.703s"
}
```

## 2026-05-05T21:25:32.081676+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.179",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.081749+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.179', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.703s"
}
```

## 2026-05-05T21:25:32.081855+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.180",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.082029+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.180', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.704s"
}
```

## 2026-05-05T21:25:32.082162+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.181",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.082265+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.181', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.704s"
}
```

## 2026-05-05T21:25:32.082357+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.182",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.082559+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.182', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.704s"
}
```

## 2026-05-05T21:25:32.082654+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.183",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.082736+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.183', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.704s"
}
```

## 2026-05-05T21:25:32.082828+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.184",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.082903+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.184', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.704s"
}
```

## 2026-05-05T21:25:32.082991+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.185",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.083070+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.185', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.705s"
}
```

## 2026-05-05T21:25:32.083163+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.186",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.083241+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.186', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.705s"
}
```

## 2026-05-05T21:25:32.083330+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.187",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.083404+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.187', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.705s"
}
```

## 2026-05-05T21:25:32.083514+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.188",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.083607+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.188', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.705s"
}
```

## 2026-05-05T21:25:32.083748+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.189",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.083870+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.189', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.705s"
}
```

## 2026-05-05T21:25:32.083960+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.190",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.084035+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.190', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.706s"
}
```

## 2026-05-05T21:25:32.084124+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.191",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.084197+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.191', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.706s"
}
```

## 2026-05-05T21:25:32.084290+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.192",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.084368+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.192', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.706s"
}
```

## 2026-05-05T21:25:32.084479+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.193",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.084562+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.193', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.706s"
}
```

## 2026-05-05T21:25:32.084654+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.194",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.084726+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.194', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.706s"
}
```

## 2026-05-05T21:25:32.084827+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.195",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.084904+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.195', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.706s"
}
```

## 2026-05-05T21:25:32.084997+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.196",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.085072+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.196', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.707s"
}
```

## 2026-05-05T21:25:32.085164+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.197",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.085241+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.197', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.707s"
}
```

## 2026-05-05T21:25:32.085333+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.198",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.085406+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.198', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.707s"
}
```

## 2026-05-05T21:25:32.085499+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.199",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.085572+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.199', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.707s"
}
```

## 2026-05-05T21:25:32.085661+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.200",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.085740+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.200', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.707s"
}
```

## 2026-05-05T21:25:32.085829+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.201",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.085902+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.201', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.707s"
}
```

## 2026-05-05T21:25:32.086044+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.202",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.086135+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.202', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.708s"
}
```

## 2026-05-05T21:25:32.086229+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.203",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.086305+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.203', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.708s"
}
```

## 2026-05-05T21:25:32.086394+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.204",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.086473+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.204', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.708s"
}
```

## 2026-05-05T21:25:32.086562+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.205",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.086638+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.205', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.708s"
}
```

## 2026-05-05T21:25:32.086731+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.206",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.086813+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.206', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.708s"
}
```

## 2026-05-05T21:25:32.086903+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.207",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.086976+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.207', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.708s"
}
```

## 2026-05-05T21:25:32.087069+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.208",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.087145+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.208', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.709s"
}
```

## 2026-05-05T21:25:32.087258+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.209",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.087376+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.209', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.709s"
}
```

## 2026-05-05T21:25:32.087473+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.210",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.087550+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.210', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.709s"
}
```

## 2026-05-05T21:25:32.087661+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.211",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.087806+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.211', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.709s"
}
```

## 2026-05-05T21:25:32.087932+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.212",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.088071+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.212', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.710s"
}
```

## 2026-05-05T21:25:32.088166+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.213",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.088240+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.213', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.710s"
}
```

## 2026-05-05T21:25:32.088328+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.214",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.088400+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.214', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.710s"
}
```

## 2026-05-05T21:25:32.088492+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.215",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.088564+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.215', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.710s"
}
```

## 2026-05-05T21:25:32.088655+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.216",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.088729+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.216', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.710s"
}
```

## 2026-05-05T21:25:32.088824+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.217",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.088898+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.217', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.710s"
}
```

## 2026-05-05T21:25:32.088990+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.218",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.089063+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.218', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.711s"
}
```

## 2026-05-05T21:25:32.089150+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.219",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.089222+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.219', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.711s"
}
```

## 2026-05-05T21:25:32.089333+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.220",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.089413+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.220', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.711s"
}
```

## 2026-05-05T21:25:32.089501+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.221",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.089579+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.221', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.711s"
}
```

## 2026-05-05T21:25:32.089666+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.222",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.089738+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.222', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.711s"
}
```

## 2026-05-05T21:25:32.089826+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.223",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.089904+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.223', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.711s"
}
```

## 2026-05-05T21:25:32.090047+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.224",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.090149+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.224', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.712s"
}
```

## 2026-05-05T21:25:32.090262+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.225",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.090344+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.225', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.712s"
}
```

## 2026-05-05T21:25:32.090440+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.226",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.090516+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.226', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.712s"
}
```

## 2026-05-05T21:25:32.090609+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.227",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.090683+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.227', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.712s"
}
```

## 2026-05-05T21:25:32.090779+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.228",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.090857+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.228', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.712s"
}
```

## 2026-05-05T21:25:32.091013+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.229",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.091120+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.229', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.713s"
}
```

## 2026-05-05T21:25:32.091235+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.230",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.091367+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.230', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.713s"
}
```

## 2026-05-05T21:25:32.091484+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.231",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.091588+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.231', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.713s"
}
```

## 2026-05-05T21:25:32.091690+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.232",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.091784+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.232', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.713s"
}
```

## 2026-05-05T21:25:32.091902+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.233",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.092008+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.233', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.714s"
}
```

## 2026-05-05T21:25:32.092128+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.234",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.092228+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.234', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.714s"
}
```

## 2026-05-05T21:25:32.092321+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.235",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.092395+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.235', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.714s"
}
```

## 2026-05-05T21:25:32.092484+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.236",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.092561+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.236', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.714s"
}
```

## 2026-05-05T21:25:32.092649+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.237",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.092721+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.237', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.714s"
}
```

## 2026-05-05T21:25:32.092813+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.238",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.092892+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.238', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.714s"
}
```

## 2026-05-05T21:25:32.092990+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.239",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.093065+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.239', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.715s"
}
```

## 2026-05-05T21:25:32.093186+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.240",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.093326+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.240', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.715s"
}
```

## 2026-05-05T21:25:32.093443+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.241",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.093525+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.241', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.715s"
}
```

## 2026-05-05T21:25:32.093613+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.242",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.093690+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.242', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.715s"
}
```

## 2026-05-05T21:25:32.093802+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.243",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.093886+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.243', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.715s"
}
```

## 2026-05-05T21:25:32.094046+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.244",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.094151+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.244', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.716s"
}
```

## 2026-05-05T21:25:32.094240+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.245",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.094318+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.245', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.716s"
}
```

## 2026-05-05T21:25:32.094411+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.246",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.094485+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.246', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.716s"
}
```

## 2026-05-05T21:25:32.094573+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.247",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.094654+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.247', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.716s"
}
```

## 2026-05-05T21:25:32.094743+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.248",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.094817+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.248', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.716s"
}
```

## 2026-05-05T21:25:32.094906+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.249",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.094977+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.249', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.716s"
}
```

## 2026-05-05T21:25:32.095065+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.250",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.095137+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.250', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.717s"
}
```

## 2026-05-05T21:25:32.095226+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.251",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.095326+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.251', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.717s"
}
```

## 2026-05-05T21:25:32.095425+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.252",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.095512+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.252', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.717s"
}
```

## 2026-05-05T21:25:32.095602+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.253",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.095675+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.253', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.717s"
}
```

## 2026-05-05T21:25:32.095769+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.254",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.095846+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.254', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.717s"
}
```

## 2026-05-05T21:25:32.095935+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "host",
  "ip": "192.168.1.255",
  "hostname": "",
  "os_type": "",
  "ports": []
}
```

## 2026-05-05T21:25:32.096043+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "host  {'type': 'host', 'ip': '192.168.1.255', 'hostname': '', 'os_type': '', 'ports': [], 'agent_id': 'scanner-91b4ed24', 'agent_type': 'scanner', 'target': '192.168.1.0/24'}",
  "level": "debug",
  "ts": "+639.718s"
}
```

## 2026-05-05T21:25:32.096164+00:00 `observation`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "nmap_scan",
  "success": true
}
```

## 2026-05-05T21:25:32.096465+00:00 `llm_thinking_start`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner"
}
```

## 2026-05-05T21:25:58.149404+00:00 `reasoning`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "thought": "The service scan found five hosts with open TCP ports. I will report each one to Brain, then finish.",
  "action": "report_finding",
  "reasoning": "",
  "situation": "",
  "hypothesis": "",
  "decision": ""
}
```

## 2026-05-05T21:25:58.149607+00:00 `debug_log`
```json
{
  "prefix": "THINK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "The service scan found five hosts with open TCP ports. I will report each one to Brain, then finish.",
  "level": "debug",
  "ts": "+665.771s"
}
```

## 2026-05-05T21:25:58.149744+00:00 `debug_log`
```json
{
  "prefix": "ACTION",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding  params={\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.1\", \"ports\": [{\"port\": 53, \"protocol\": \"tcp\", \"service\": \"domain\"}, {\"port\": 80, \"protocol\"…(64 more)",
  "level": "debug",
  "ts": "+665.771s"
}
```

## 2026-05-05T21:25:58.150012+00:00 `tool_call`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "params": {
    "finding_type": "open_ports",
    "data": {
      "host": "192.168.1.1",
      "ports": [
        {
          "port": 53,
          "protocol": "tcp",
          "service": "domain"
        },
        {
          "port": 80,
          "protocol": "tcp",
          "service": "http",
          "version": "Mini web server 1.0"
        }
      ]
    }
  }
}
```

## 2026-05-05T21:25:58.150154+00:00 `debug_log`
```json
{
  "prefix": "TOOL→",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding  {\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.1\", \"ports\": [{\"port\": 53, \"protocol\": \"tcp\", \"service\": \"domain\"}, {\"port\": 80, \"protocol\": \"tcp\", \"service\": \"http\", \"version\": \"Mini web s…(14 more)",
  "level": "debug",
  "ts": "+665.772s"
}
```

## 2026-05-05T21:25:58.190801+00:00 `debug_log`
```json
{
  "prefix": "TOOL←OK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding (0ms)  {\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.1\", \"ports\": [{\"port\": 53, \"protocol\": \"tcp\", \"service\": \"domain\"}, {\"port\": 80, \"protocol\": \"tcp\", \"service\": \"http\", \"version\": \"Mini web server 1.0\"}]}}",
  "level": "debug",
  "ts": "+665.812s"
}
```

## 2026-05-05T21:25:58.191032+00:00 `tool_result`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "success": true,
  "output": "{\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.1\", \"ports\": [{\"port\": 53, \"protocol\": \"tcp\", \"service\": \"domain\"}, {\"port\": 80, \"protocol\": \"tcp\", \"service\": \"http\", \"version\": \"Mini web server 1.0\"}]}}",
  "error": null
}
```

## 2026-05-05T21:25:58.210942+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "open_ports",
  "host": "192.168.1.1",
  "ports": [
    {
      "port": 53,
      "protocol": "tcp",
      "service": "domain"
    },
    {
      "port": 80,
      "protocol": "tcp",
      "service": "http",
      "version": "Mini web server 1.0"
    }
  ]
}
```

## 2026-05-05T21:25:58.211132+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "open_ports  {'type': 'open_ports', 'host': '192.168.1.1', 'ports': [{'port': 53, 'protocol': 'tcp', 'service': 'domain'}, {'port': 80, 'protocol': 'tcp', 'service': 'http', 'version': 'Mini web server 1.0'}], 'ag",
  "level": "debug",
  "ts": "+665.833s"
}
```

## 2026-05-05T21:25:58.211229+00:00 `observation`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "success": true
}
```

## 2026-05-05T21:25:58.211510+00:00 `llm_thinking_start`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner"
}
```

## 2026-05-05T21:26:06.606735+00:00 `reasoning`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "thought": "Reporting 192.168.1.8 next.",
  "action": "report_finding",
  "reasoning": "",
  "situation": "",
  "hypothesis": "",
  "decision": ""
}
```

## 2026-05-05T21:26:06.607012+00:00 `debug_log`
```json
{
  "prefix": "THINK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "Reporting 192.168.1.8 next.",
  "level": "debug",
  "ts": "+674.229s"
}
```

## 2026-05-05T21:26:06.607166+00:00 `debug_log`
```json
{
  "prefix": "ACTION",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding  params={\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.8\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 6.6.0\"}…(190 more)",
  "level": "debug",
  "ts": "+674.229s"
}
```

## 2026-05-05T21:26:06.607347+00:00 `tool_call`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "params": {
    "finding_type": "open_ports",
    "data": {
      "host": "192.168.1.8",
      "ports": [
        {
          "port": 22,
          "protocol": "tcp",
          "service": "ssh",
          "version": "OpenSSH 6.6.0"
        },
        {
          "port": 80,
          "protocol": "tcp",
          "service": "http",
          "version": "TP-LINK router http config"
        },
        {
          "port": 443,
          "protocol": "tcp",
          "service": "http",
          "version": "TP-LINK router http config"
        }
      ]
    }
  }
}
```

## 2026-05-05T21:26:06.607524+00:00 `debug_log`
```json
{
  "prefix": "TOOL→",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding  {\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.8\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 6.6.0\"}, {\"port\": 80, \"protocol\": \"tcp\", \"service\": \"http…(140 more)",
  "level": "debug",
  "ts": "+674.229s"
}
```

## 2026-05-05T21:26:06.624524+00:00 `debug_log`
```json
{
  "prefix": "TOOL←OK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding (0ms)  {\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.8\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 6.6.0\"}, {\"port\": 80, \"protocol\": \"tcp\", \"service\": \"http\", \"version\": \"TP-LINK router http config\"}, {\"por…(90 more)",
  "level": "debug",
  "ts": "+674.246s"
}
```

## 2026-05-05T21:26:06.624660+00:00 `tool_result`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "success": true,
  "output": "{\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.8\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 6.6.0\"}, {\"port\": 80, \"protocol\": \"tcp\", \"service\": \"http\", \"version\": \"TP-LINK router http config\"}, {\"port\": 443, \"protocol\": \"tcp\", \"service\": \"http\", \"version\": \"TP-LINK router http config\"}]}}",
  "error": null
}
```

## 2026-05-05T21:26:06.648056+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "open_ports",
  "host": "192.168.1.8",
  "ports": [
    {
      "port": 22,
      "protocol": "tcp",
      "service": "ssh",
      "version": "OpenSSH 6.6.0"
    },
    {
      "port": 80,
      "protocol": "tcp",
      "service": "http",
      "version": "TP-LINK router http config"
    },
    {
      "port": 443,
      "protocol": "tcp",
      "service": "http",
      "version": "TP-LINK router http config"
    }
  ]
}
```

## 2026-05-05T21:26:06.648230+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "open_ports  {'type': 'open_ports', 'host': '192.168.1.8', 'ports': [{'port': 22, 'protocol': 'tcp', 'service': 'ssh', 'version': 'OpenSSH 6.6.0'}, {'port': 80, 'protocol': 'tcp', 'service': 'http', 'version': 'TP",
  "level": "debug",
  "ts": "+674.270s"
}
```

## 2026-05-05T21:26:06.648322+00:00 `observation`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "success": true
}
```

## 2026-05-05T21:26:06.648629+00:00 `llm_thinking_start`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner"
}
```

## 2026-05-05T21:26:13.675967+00:00 `reasoning`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "thought": "Reporting 192.168.1.19 with Windows RPC ports.",
  "action": "report_finding",
  "reasoning": "",
  "situation": "",
  "hypothesis": "",
  "decision": ""
}
```

## 2026-05-05T21:26:13.676142+00:00 `debug_log`
```json
{
  "prefix": "THINK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "Reporting 192.168.1.19 with Windows RPC ports.",
  "level": "debug",
  "ts": "+681.298s"
}
```

## 2026-05-05T21:26:13.676272+00:00 `debug_log`
```json
{
  "prefix": "ACTION",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding  params={\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.19\", \"ports\": [{\"port\": 135, \"protocol\": \"tcp\", \"service\": \"msrpc\", \"version\": \"Microsoft W…(180 more)",
  "level": "debug",
  "ts": "+681.298s"
}
```

## 2026-05-05T21:26:13.676403+00:00 `tool_call`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "params": {
    "finding_type": "open_ports",
    "data": {
      "host": "192.168.1.19",
      "ports": [
        {
          "port": 135,
          "protocol": "tcp",
          "service": "msrpc",
          "version": "Microsoft Windows RPC"
        },
        {
          "port": 139,
          "protocol": "tcp",
          "service": "netbios-ssn",
          "version": "Microsoft Windows netbios-ssn"
        },
        {
          "port": 445,
          "protocol": "tcp",
          "service": "microsoft-ds"
        }
      ]
    }
  }
}
```

## 2026-05-05T21:26:13.676496+00:00 `debug_log`
```json
{
  "prefix": "TOOL→",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding  {\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.19\", \"ports\": [{\"port\": 135, \"protocol\": \"tcp\", \"service\": \"msrpc\", \"version\": \"Microsoft Windows RPC\"}, {\"port\": 139, \"protocol\": \"tcp\", \"se…(130 more)",
  "level": "debug",
  "ts": "+681.298s"
}
```

## 2026-05-05T21:26:13.701198+00:00 `debug_log`
```json
{
  "prefix": "TOOL←OK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding (0ms)  {\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.19\", \"ports\": [{\"port\": 135, \"protocol\": \"tcp\", \"service\": \"msrpc\", \"version\": \"Microsoft Windows RPC\"}, {\"port\": 139, \"protocol\": \"tcp\", \"service\": \"netbios-ssn\", \"version\": \"Microsoft Windo…(80 more)",
  "level": "debug",
  "ts": "+681.323s"
}
```

## 2026-05-05T21:26:13.701336+00:00 `tool_result`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "success": true,
  "output": "{\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.19\", \"ports\": [{\"port\": 135, \"protocol\": \"tcp\", \"service\": \"msrpc\", \"version\": \"Microsoft Windows RPC\"}, {\"port\": 139, \"protocol\": \"tcp\", \"service\": \"netbios-ssn\", \"version\": \"Microsoft Windows netbios-ssn\"}, {\"port\": 445, \"protocol\": \"tcp\", \"service\": \"microsoft-ds\"}]}}",
  "error": null
}
```

## 2026-05-05T21:26:13.744622+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "open_ports",
  "host": "192.168.1.19",
  "ports": [
    {
      "port": 135,
      "protocol": "tcp",
      "service": "msrpc",
      "version": "Microsoft Windows RPC"
    },
    {
      "port": 139,
      "protocol": "tcp",
      "service": "netbios-ssn",
      "version": "Microsoft Windows netbios-ssn"
    },
    {
      "port": 445,
      "protocol": "tcp",
      "service": "microsoft-ds"
    }
  ]
}
```

## 2026-05-05T21:26:13.744820+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "open_ports  {'type': 'open_ports', 'host': '192.168.1.19', 'ports': [{'port': 135, 'protocol': 'tcp', 'service': 'msrpc', 'version': 'Microsoft Windows RPC'}, {'port': 139, 'protocol': 'tcp', 'service': 'netbios-",
  "level": "debug",
  "ts": "+681.366s"
}
```

## 2026-05-05T21:26:13.744937+00:00 `observation`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "success": true
}
```

## 2026-05-05T21:26:13.745319+00:00 `llm_thinking_start`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner"
}
```

## 2026-05-05T21:26:23.805207+00:00 `reasoning`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "thought": "Reporting 192.168.1.25 (Samba server).",
  "action": "report_finding",
  "reasoning": "",
  "situation": "",
  "hypothesis": "",
  "decision": ""
}
```

## 2026-05-05T21:26:23.805381+00:00 `debug_log`
```json
{
  "prefix": "THINK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "Reporting 192.168.1.25 (Samba server).",
  "level": "debug",
  "ts": "+691.427s"
}
```

## 2026-05-05T21:26:23.805511+00:00 `debug_log`
```json
{
  "prefix": "ACTION",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding  params={\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.25\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 10.0p2…(421 more)",
  "level": "debug",
  "ts": "+691.427s"
}
```

## 2026-05-05T21:26:23.805678+00:00 `tool_call`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "params": {
    "finding_type": "open_ports",
    "data": {
      "host": "192.168.1.25",
      "ports": [
        {
          "port": 22,
          "protocol": "tcp",
          "service": "ssh",
          "version": "OpenSSH 10.0p2 Debian 7+deb13u2"
        },
        {
          "port": 80,
          "protocol": "tcp",
          "service": "http",
          "version": "nginx"
        },
        {
          "port": 111,
          "protocol": "tcp",
          "service": "rpcbind",
          "version": "2-4"
        },
        {
          "port": 139,
          "protocol": "tcp",
          "service": "netbios-ssn",
          "version": "Samba smbd 4"
        },
        {
          "port": 222,
          "protocol": "tcp",
          "service": "ssh",
          "version": "OpenSSH 10.0"
        },
        {
          "port": 445,
          "protocol": "tcp",
          "service": "netbios-ssn",
          "version": "Samba smbd 4"
        }
      ]
    }
  }
}
```

## 2026-05-05T21:26:23.805829+00:00 `debug_log`
```json
{
  "prefix": "TOOL→",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding  {\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.25\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 10.0p2 Debian 7+deb13u2\"}, {\"port\": 80, \"protocol\": \"tcp…(371 more)",
  "level": "debug",
  "ts": "+691.427s"
}
```

## 2026-05-05T21:26:23.859486+00:00 `debug_log`
```json
{
  "prefix": "TOOL←OK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding (0ms)  {\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.25\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 10.0p2 Debian 7+deb13u2\"}, {\"port\": 80, \"protocol\": \"tcp\", \"service\": \"http\", \"version\": \"nginx\"}, {\"port\"…(321 more)",
  "level": "debug",
  "ts": "+691.481s"
}
```

## 2026-05-05T21:26:23.860125+00:00 `tool_result`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "success": true,
  "output": "{\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.25\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 10.0p2 Debian 7+deb13u2\"}, {\"port\": 80, \"protocol\": \"tcp\", \"service\": \"http\", \"version\": \"nginx\"}, {\"port\": 111, \"protocol\": \"tcp\", \"service\": \"rpcbind\", \"version\": \"2-4\"}, {\"port\": 139, \"protocol\": \"tcp\", \"service\": \"netbios-ssn\", \"version\": \"Samba smbd 4\"}, {\"port\": 222, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 10.0\"}, {\"port\": 445, \"protocol\": \"tcp\", \"service\": \"netbios-ssn\", \"version\": \"Samba smbd 4\"}]}}",
  "error": null
}
```

## 2026-05-05T21:26:23.890071+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "open_ports",
  "host": "192.168.1.25",
  "ports": [
    {
      "port": 22,
      "protocol": "tcp",
      "service": "ssh",
      "version": "OpenSSH 10.0p2 Debian 7+deb13u2"
    },
    {
      "port": 80,
      "protocol": "tcp",
      "service": "http",
      "version": "nginx"
    },
    {
      "port": 111,
      "protocol": "tcp",
      "service": "rpcbind",
      "version": "2-4"
    },
    {
      "port": 139,
      "protocol": "tcp",
      "service": "netbios-ssn",
      "version": "Samba smbd 4"
    },
    {
      "port": 222,
      "protocol": "tcp",
      "service": "ssh",
      "version": "OpenSSH 10.0"
    },
    {
      "port": 445,
      "protocol": "tcp",
      "service": "netbios-ssn",
      "version": "Samba smbd 4"
    }
  ]
}
```

## 2026-05-05T21:26:23.890532+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "open_ports  {'type': 'open_ports', 'host': '192.168.1.25', 'ports': [{'port': 22, 'protocol': 'tcp', 'service': 'ssh', 'version': 'OpenSSH 10.0p2 Debian 7+deb13u2'}, {'port': 80, 'protocol': 'tcp', 'service': 'ht",
  "level": "debug",
  "ts": "+691.512s"
}
```

## 2026-05-05T21:26:23.890632+00:00 `observation`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "success": true
}
```

## 2026-05-05T21:26:23.890862+00:00 `llm_thinking_start`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner"
}
```

## 2026-05-05T21:26:40.825245+00:00 `reasoning`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "thought": "Reporting 192.168.1.53 (similar to 192.168.1.25).",
  "action": "report_finding",
  "reasoning": "",
  "situation": "",
  "hypothesis": "",
  "decision": ""
}
```

## 2026-05-05T21:26:40.825484+00:00 `debug_log`
```json
{
  "prefix": "THINK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "Reporting 192.168.1.53 (similar to 192.168.1.25).",
  "level": "debug",
  "ts": "+708.447s"
}
```

## 2026-05-05T21:26:40.825619+00:00 `debug_log`
```json
{
  "prefix": "ACTION",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding  params={\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.53\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 10.0p2…(421 more)",
  "level": "debug",
  "ts": "+708.447s"
}
```

## 2026-05-05T21:26:40.825754+00:00 `tool_call`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "params": {
    "finding_type": "open_ports",
    "data": {
      "host": "192.168.1.53",
      "ports": [
        {
          "port": 22,
          "protocol": "tcp",
          "service": "ssh",
          "version": "OpenSSH 10.0p2 Debian 7+deb13u2"
        },
        {
          "port": 80,
          "protocol": "tcp",
          "service": "http",
          "version": "nginx"
        },
        {
          "port": 111,
          "protocol": "tcp",
          "service": "rpcbind",
          "version": "2-4"
        },
        {
          "port": 139,
          "protocol": "tcp",
          "service": "netbios-ssn",
          "version": "Samba smbd 4"
        },
        {
          "port": 222,
          "protocol": "tcp",
          "service": "ssh",
          "version": "OpenSSH 10.0"
        },
        {
          "port": 445,
          "protocol": "tcp",
          "service": "netbios-ssn",
          "version": "Samba smbd 4"
        }
      ]
    }
  }
}
```

## 2026-05-05T21:26:40.825878+00:00 `debug_log`
```json
{
  "prefix": "TOOL→",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding  {\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.53\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 10.0p2 Debian 7+deb13u2\"}, {\"port\": 80, \"protocol\": \"tcp…(371 more)",
  "level": "debug",
  "ts": "+708.447s"
}
```

## 2026-05-05T21:26:40.846092+00:00 `debug_log`
```json
{
  "prefix": "TOOL←OK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "report_finding (0ms)  {\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.53\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 10.0p2 Debian 7+deb13u2\"}, {\"port\": 80, \"protocol\": \"tcp\", \"service\": \"http\", \"version\": \"nginx\"}, {\"port\"…(321 more)",
  "level": "debug",
  "ts": "+708.468s"
}
```

## 2026-05-05T21:26:40.846245+00:00 `tool_result`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "success": true,
  "output": "{\"finding_type\": \"open_ports\", \"data\": {\"host\": \"192.168.1.53\", \"ports\": [{\"port\": 22, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 10.0p2 Debian 7+deb13u2\"}, {\"port\": 80, \"protocol\": \"tcp\", \"service\": \"http\", \"version\": \"nginx\"}, {\"port\": 111, \"protocol\": \"tcp\", \"service\": \"rpcbind\", \"version\": \"2-4\"}, {\"port\": 139, \"protocol\": \"tcp\", \"service\": \"netbios-ssn\", \"version\": \"Samba smbd 4\"}, {\"port\": 222, \"protocol\": \"tcp\", \"service\": \"ssh\", \"version\": \"OpenSSH 10.0\"}, {\"port\": 445, \"protocol\": \"tcp\", \"service\": \"netbios-ssn\", \"version\": \"Samba smbd 4\"}]}}",
  "error": null
}
```

## 2026-05-05T21:26:40.853599+00:00 `finding`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "type": "open_ports",
  "host": "192.168.1.53",
  "ports": [
    {
      "port": 22,
      "protocol": "tcp",
      "service": "ssh",
      "version": "OpenSSH 10.0p2 Debian 7+deb13u2"
    },
    {
      "port": 80,
      "protocol": "tcp",
      "service": "http",
      "version": "nginx"
    },
    {
      "port": 111,
      "protocol": "tcp",
      "service": "rpcbind",
      "version": "2-4"
    },
    {
      "port": 139,
      "protocol": "tcp",
      "service": "netbios-ssn",
      "version": "Samba smbd 4"
    },
    {
      "port": 222,
      "protocol": "tcp",
      "service": "ssh",
      "version": "OpenSSH 10.0"
    },
    {
      "port": 445,
      "protocol": "tcp",
      "service": "netbios-ssn",
      "version": "Samba smbd 4"
    }
  ]
}
```

## 2026-05-05T21:26:40.853776+00:00 `debug_log`
```json
{
  "prefix": "FINDING",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "open_ports  {'type': 'open_ports', 'host': '192.168.1.53', 'ports': [{'port': 22, 'protocol': 'tcp', 'service': 'ssh', 'version': 'OpenSSH 10.0p2 Debian 7+deb13u2'}, {'port': 80, 'protocol': 'tcp', 'service': 'ht",
  "level": "debug",
  "ts": "+708.475s"
}
```

## 2026-05-05T21:26:40.853896+00:00 `observation`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "tool": "report_finding",
  "success": true
}
```

## 2026-05-05T21:26:40.854209+00:00 `llm_thinking_start`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner"
}
```

## 2026-05-05T21:26:50.484080+00:00 `reasoning`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "thought": "Service scan completed. Found 5 hosts with open TCP ports: .1 (DNS/HTTP), .8 (SSH/HTTP/HTTPS TP-LINK router), .19 (Windows RPC/SMB), .25 and .53 (Debian/Samba servers). All findings reported. Task complete.",
  "action": "done",
  "reasoning": "",
  "situation": "",
  "hypothesis": "",
  "decision": ""
}
```

## 2026-05-05T21:26:50.484243+00:00 `debug_log`
```json
{
  "prefix": "THINK",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "Service scan completed. Found 5 hosts with open TCP ports: .1 (DNS/HTTP), .8 (SSH/HTTP/HTTPS TP-LINK router), .19 (Windows RPC/SMB), .25 and .53 (Debian/Samba servers). All findings reported. Task complete.",
  "level": "debug",
  "ts": "+718.106s"
}
```

## 2026-05-05T21:26:50.484368+00:00 `debug_log`
```json
{
  "prefix": "ACTION",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "done  params={\"findings_summary\": \"5 hosts with open TCP ports discovered in 192.168.1.0/24: 192.168.1.1 (53/domain, 80/http Mini web server), 192.168.1.8 (22/ssh …(311 more)",
  "level": "debug",
  "ts": "+718.106s"
}
```

## 2026-05-05T21:26:50.484469+00:00 `agent_done`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "scanner",
  "status": "success",
  "iterations": 7,
  "findings_count": 261
}
```

## 2026-05-05T21:26:50.484853+00:00 `debug_log`
```json
{
  "prefix": "BUS←DONE",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "msg_type=agent_done status=success",
  "level": "debug",
  "ts": "+718.106s"
}
```

## 2026-05-05T21:26:50.484990+00:00 `child_agent_done`
```json
{
  "agent_id": "scanner-91b4ed24",
  "agent_type": "brain",
  "findings": 261
}
```

## 2026-05-05T21:26:50.485100+00:00 `debug_log`
```json
{
  "prefix": "DONE↓",
  "agent_id": "scanner-91b4ed24",
  "short_id": "scan-91b4",
  "msg": "scanner status=success findings=261 iters=7",
  "level": "debug",
  "ts": "+718.107s"
}
```

