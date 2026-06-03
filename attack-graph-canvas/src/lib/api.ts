import { isDemoMode } from "@/lib/demoMode";
import {
  MOCK_SESSIONS_LIST,
  MOCK_SESSION_001,
  MOCK_SESSION_002,
  MOCK_SESSION_003,
  MOCK_SYSTEM_STATS,
  MOCK_CREDENTIALS,
  MOCK_TOOLS_STATUS,
  MOCK_SCAN_PROFILES,
  MOCK_AGENTS,
  MOCK_LOOT,
  MOCK_SHELLS,
  MOCK_EVENTS,
  buildRunningMockSession,
} from "@/lib/mockData";

const BASE_URL = "";

function getAuthToken(): string | null {
  try {
    return localStorage.getItem("tirpan_token") || sessionStorage.getItem("tirpan_token");
  } catch {
    return null;
  }
}

function mockDelay<T>(data: T, ms = 120): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(data), ms));
}

function getMockSession(sid: string): any {
  // Check for running demo session
  const runningId = localStorage.getItem("tirpan_demo_running_id");
  if (runningId && sid === runningId) return buildRunningMockSession();
  const map: Record<string, any> = {
    "demo-session-001": MOCK_SESSION_001,
    "demo-session-002": MOCK_SESSION_002,
    "demo-session-003": MOCK_SESSION_003,
  };
  return map[sid] || MOCK_SESSION_001;
}

function getMockSessionsList(): any[] {
  const runningId = localStorage.getItem("tirpan_demo_running_id");
  if (!runningId) return MOCK_SESSIONS_LIST;
  const running = buildRunningMockSession();
  const runningListItem = {
    id: running.id,
    name: running.name,
    target: running.target,
    status: running.status,
    is_running: running.is_running,
    mode: running.mode,
    hosts_found: running.hosts_found,
    vulns_found: running.vulns_found,
    exploits_run: running.exploits_run,
    created_at: running.created_at,
    finished_at: running.finished_at,
    scope: running.scope,
  };
  // If done, remove running session from active and add to list
  if (!running.is_running) localStorage.removeItem("tirpan_demo_running_id");
  return [runningListItem, ...MOCK_SESSIONS_LIST];
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(err);
  }
  return res.json() as Promise<T>;
}

export function buildAuthWsUrl(path = "/ws"): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const token = getAuthToken();
  return `${proto}://${window.location.host}${path}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export const getSessions = () =>
  isDemoMode() ? mockDelay(getMockSessionsList()) : apiFetch<any[]>("/api/v1/sessions");

export const getSession = (sid: string) =>
  isDemoMode() ? mockDelay(getMockSession(sid)) : apiFetch<any>(`/api/v1/sessions/${sid}`);

export const getSessionEvents = (sid: string, limit = 2000) =>
  isDemoMode() ? mockDelay(MOCK_EVENTS(sid).slice(0, limit)) : apiFetch<any>(`/api/v1/sessions/${sid}/events?limit=${limit}`);

export const getReportHtml = (sid: string) =>
  isDemoMode()
    ? mockDelay(buildMockReportHtml(sid))
    : fetch(`${BASE_URL}/api/v1/sessions/${sid}/report/html`).then(r => r.text());

export const getSystemStats = () =>
  isDemoMode() ? mockDelay(MOCK_SYSTEM_STATS) : apiFetch<any>("/api/v1/system/stats");

// ── LLM usage & cost ─────────────────────────────────────────────────────────

const MOCK_USAGE_SUMMARY = {
  period: "month",
  prompt_tokens: 1_842_300,
  completion_tokens: 612_400,
  total_tokens: 2_454_700,
  cost_usd: 9.8412,
  calls: 1284,
  missions: 6,
  avg_cost_per_mission: 1.6402,
  is_estimated: false,
  by_model: [
    { model: "anthropic/claude-sonnet-4-6", provider: "openrouter", prompt_tokens: 1_500_000, completion_tokens: 480_000, cost_usd: 11.7, calls: 980 },
    { model: "deepseek-r1", provider: "opencode_go", prompt_tokens: 342_300, completion_tokens: 132_400, cost_usd: 0.48, calls: 304 },
  ],
  by_user: [
    { user_id: "u1", full_name: "Demo Owner", email: "owner@demo", cost_usd: 7.2, total_tokens: 1_800_000, missions: 4, monthly_budget_usd: 50 },
    { user_id: "u2", full_name: "Demo Analyst", email: "analyst@demo", cost_usd: 2.64, total_tokens: 654_700, missions: 2, monthly_budget_usd: 10 },
  ],
};

export const getUsageSummary = (period = "month") =>
  isDemoMode() ? mockDelay(MOCK_USAGE_SUMMARY) : apiFetch<any>(`/api/v1/usage/summary?period=${period}`);

export const getSessionUsage = (sid: string) =>
  isDemoMode()
    ? mockDelay({ session_id: sid, prompt_tokens: 320_000, completion_tokens: 96_000, total_tokens: 416_000, cost_usd: 1.86, is_estimated: false,
        by_model: [{ model: "anthropic/claude-sonnet-4-6", provider: "openrouter", prompt_tokens: 320_000, completion_tokens: 96_000, cost_usd: 1.86, calls: 210 }],
        by_agent: [{ agent_type: "brain", prompt_tokens: 180_000, completion_tokens: 60_000, cost_usd: 1.16, calls: 90 }, { agent_type: "exploit", prompt_tokens: 140_000, completion_tokens: 36_000, cost_usd: 0.7, calls: 120 }] })
    : apiFetch<any>(`/api/v1/sessions/${sid}/usage`);

export const getUsersUsage = () =>
  isDemoMode()
    ? mockDelay({ period: "month", users: MOCK_USAGE_SUMMARY.by_user.map((u) => ({ user_id: u.user_id, full_name: u.full_name, email: u.email, role: "analyst", spend_this_month: u.cost_usd, monthly_budget_usd: u.monthly_budget_usd, remaining_usd: u.monthly_budget_usd - u.cost_usd, over_budget: false })) })
    : apiFetch<any>("/api/v1/usage/users");

export const getPricing = () =>
  isDemoMode() ? mockDelay({ pricing: {} }) : apiFetch<any>("/api/v1/config/pricing");

export const savePricing = (pricing: Record<string, { in: number; out: number }>) =>
  isDemoMode() ? mockDelay({ ok: true }) : apiFetch<any>("/api/v1/config/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pricing }) });

export const fetchOpenRouterPrices = () =>
  isDemoMode()
    ? mockDelay({ pricing: { "anthropic/claude-sonnet-4-6": { in: 3, out: 15 }, "openai/gpt-4o": { in: 2.5, out: 10 } }, count: 2 })
    : apiFetch<{ pricing: Record<string, { in: number; out: number }>; count: number }>("/api/v1/config/pricing/openrouter");

export const setUserBudget = (userId: string, monthly_budget_usd: number) =>
  isDemoMode() ? mockDelay({ ok: true }) : apiFetch<any>(`/api/v1/auth/users/${userId}/budget`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly_budget_usd }) });

export const getMyUsage = () =>
  isDemoMode()
    ? mockDelay({ spend_this_month: 3.42, monthly_budget_usd: 10, remaining_usd: 6.58, over_budget: false, pct: 34.2, period: "month" })
    : apiFetch<any>("/api/v1/usage/me");

export const setOrgBudget = (monthly_budget_usd: number) =>
  isDemoMode() ? mockDelay({ ok: true }) : apiFetch<any>("/api/v1/auth/org/budget", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly_budget_usd }) });

export const getAudit = () =>
  isDemoMode() ? mockDelay({ logs: [] }) : apiFetch<any>("/api/v1/audit");

export const getCredentials = () =>
  isDemoMode() ? mockDelay(MOCK_CREDENTIALS) : apiFetch<any[]>("/api/v1/credentials");

export const getSettings = () =>
  isDemoMode()
    ? mockDelay({ model: "claude-3-7-sonnet", max_iterations: 50, rate_limit: 10, time_limit: 0 })
    : apiFetch<any>("/api/v1/settings");

export const getSessionAgents = (sid: string) =>
  isDemoMode() ? mockDelay(MOCK_AGENTS) : apiFetch<any>(`/api/v1/sessions/${sid}/agents`);

export const getSessionLoot = (sid: string) =>
  isDemoMode() ? mockDelay(MOCK_LOOT.filter(l => l.session_id === sid)) : apiFetch<any>(`/api/v1/sessions/${sid}/loot`);

export const getSessionShells = (sid: string) =>
  isDemoMode() ? mockDelay(MOCK_SHELLS.filter(s => s.session_id === sid)) : apiFetch<any>(`/api/v1/sessions/${sid}/shells`);

export const getAttackGraph = (sid: string) =>
  isDemoMode() ? mockDelay({}) : apiFetch<any>(`/api/v1/sessions/${sid}/attack-graph`);

// ── ML API ─────────────────────────────────────────────────────────────────

export const getMlSuggestions = (sid: string, topN = 8) =>
  isDemoMode()
    ? mockDelay(_mockMlSuggestions(sid))
    : apiFetch<any>(`/api/v1/sessions/${sid}/ml-suggestions?top_n=${topN}`);

export const getMlStatus = () =>
  isDemoMode()
    ? mockDelay({ training: { status: "idle" }, models: {} })
    : apiFetch<any>("/api/v1/ml/status");

export const triggerMlTraining = () =>
  isDemoMode()
    ? mockDelay({ status: "started" })
    : apiFetch<any>("/api/v1/ml/train", { method: "POST" });

export const getMlMetrics = () =>
  isDemoMode()
    ? mockDelay({})
    : apiFetch<any>("/api/v1/ml/metrics");

function _mockMlSuggestions(_sid: string): any {
  return {
    current_phase: "exploitation",
    model_available: false,
    suggestions: [
      { ttp_id: "T1190", ttp_name: "Exploit Public-Facing Application", tactic: "initial-access", confidence: 0.84, url: "https://attack.mitre.org/techniques/T1190" },
      { ttp_id: "T1021", ttp_name: "Remote Services", tactic: "lateral-movement", confidence: 0.61, url: "https://attack.mitre.org/techniques/T1021" },
      { ttp_id: "T1003", ttp_name: "OS Credential Dumping", tactic: "credential-access", confidence: 0.43, url: "https://attack.mitre.org/techniques/T1003" },
      { ttp_id: "T1059", ttp_name: "Command and Scripting Interpreter", tactic: "execution", confidence: 0.38, url: "https://attack.mitre.org/techniques/T1059" },
    ],
  };
}

export const getSessionCredentialsHarvested = (sid: string) =>
  isDemoMode()
    ? mockDelay(MOCK_CREDENTIALS.filter(c => c.session_id === sid))
    : apiFetch<any>(`/api/v1/sessions/${sid}/credentials/harvested`);

export const getScanProfiles = () =>
  isDemoMode() ? mockDelay(MOCK_SCAN_PROFILES) : apiFetch<any[]>("/api/v1/scan-profiles");

export const getNeverScan = () =>
  isDemoMode() ? mockDelay([]) : apiFetch<any[]>("/api/v1/never-scan");

export const getToolsStatus = () =>
  isDemoMode() ? mockDelay(MOCK_TOOLS_STATUS) : apiFetch<any>("/api/v1/tools/status");

export const createSession = (body: any) => {
  if (isDemoMode()) {
    const startedAt = Math.floor(Date.now() / 1000);
    const target = body.target || "192.168.56.101";
    localStorage.setItem("tirpan_demo_started", String(startedAt));
    localStorage.setItem("tirpan_demo_target", target);
    localStorage.setItem("tirpan_demo_running_id", "demo-session-running");
    return mockDelay({ id: "demo-session-running", target, status: "running", is_running: true, created_at: startedAt });
  }
  return apiFetch<any>("/api/v1/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
};

export const killSession = (sid: string) => {
  if (isDemoMode()) {
    localStorage.removeItem("tirpan_demo_running_id");
    return mockDelay({ ok: true });
  }
  return apiFetch<any>(`/api/v1/sessions/${sid}/kill`, { method: "POST" });
};

export const pauseSession = (sid: string) =>
  isDemoMode() ? mockDelay({ ok: true }) : apiFetch<any>(`/api/v1/sessions/${sid}/pause`, { method: "POST" });

export const resumeSession = (sid: string) =>
  isDemoMode() ? mockDelay({ ok: true }) : apiFetch<any>(`/api/v1/sessions/${sid}/resume`, { method: "POST" });

export const injectSession = (sid: string, content: string) =>
  isDemoMode()
    ? mockDelay({ ok: true })
    : apiFetch<any>(`/api/v1/sessions/${sid}/inject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content }) });

export const deleteSession = (sid: string) => {
  if (isDemoMode()) return mockDelay({ ok: true });
  return apiFetch<any>(`/api/v1/sessions/${sid}`, { method: "DELETE" });
};

export const renameSession = (sid: string, name: string) =>
  isDemoMode()
    ? mockDelay({ ok: true })
    : apiFetch<any>(`/api/v1/sessions/${sid}/name`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });

// ── Mock report HTML ───────────────────────────────────────────────────────────
function buildMockReportHtml(sid: string): string {
  const s = getMockSession(sid);
  const vulns = (s.vulnerabilities || []) as any[];
  const crits = vulns.filter((v: any) => v.cvss_score >= 9).length;
  const highs = vulns.filter((v: any) => v.cvss_score >= 7 && v.cvss_score < 9).length;
  const meds  = vulns.filter((v: any) => v.cvss_score >= 4 && v.cvss_score < 7).length;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TIRPAN Report — ${s.target}</title>
<style>body{background:#000;color:#fff;font-family:JetBrains Mono,monospace;padding:40px;max-width:900px;margin:0 auto}
h1{color:#ccff00;font-size:2rem;margin-bottom:4px}h2{color:#ccff00;font-size:1.1rem;margin-top:32px;border-bottom:1px solid #1a1a1a;padding-bottom:8px}
.badge{display:inline-block;padding:2px 8px;font-size:.7rem;border-radius:2px;margin-right:6px}
.crit{background:rgba(255,59,59,.15);color:#ff5555;border:1px solid rgba(255,59,59,.3)}
.high{background:rgba(255,149,0,.12);color:#ff9500;border:1px solid rgba(255,149,0,.25)}
.med{background:rgba(234,179,8,.1);color:#eab308;border:1px solid rgba(234,179,8,.2)}
.finding{border-left:3px solid #ccff00;padding:12px 16px;margin:8px 0;background:#0a0a0a}
.finding.critical{border-color:#ff3b3b}.finding.high{border-color:#ff9500}
table{width:100%;border-collapse:collapse;font-size:.85rem}th{text-align:left;color:#888;padding:6px 8px;border-bottom:1px solid #1a1a1a}
td{padding:6px 8px;border-bottom:1px solid #0d0d0d}
</style></head><body>
<div style="color:#888;font-size:.75rem;margin-bottom:16px;font-family:monospace">TIRPAN v1.0.0 — Autonomous Penetration Testing Report</div>
<h1>Vulnerability Report</h1>
<div style="color:#888;margin-bottom:24px">${s.target} · Session ${s.id} · ${new Date((s.created_at||0)*1000).toLocaleString()}</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px">
  <div style="border:1px solid #ff3b3b22;background:#ff3b3b09;padding:16px;text-align:center"><div style="font-size:2rem;color:#ff3b3b;font-weight:700">${crits}</div><div style="font-size:.7rem;color:#888;margin-top:4px">CRITICAL</div></div>
  <div style="border:1px solid #ff950022;background:#ff950009;padding:16px;text-align:center"><div style="font-size:2rem;color:#ff9500;font-weight:700">${highs}</div><div style="font-size:.7rem;color:#888;margin-top:4px">HIGH</div></div>
  <div style="border:1px solid #eab30822;background:#eab30809;padding:16px;text-align:center"><div style="font-size:2rem;color:#eab308;font-weight:700">${meds}</div><div style="font-size:.7rem;color:#888;margin-top:4px">MEDIUM</div></div>
  <div style="border:1px solid #1a1a1a;background:#0a0a0a;padding:16px;text-align:center"><div style="font-size:2rem;color:#888;font-weight:700">${vulns.length}</div><div style="font-size:.7rem;color:#888;margin-top:4px">TOTAL</div></div>
</div>
<h2>Target Information</h2>
<table><tr><th>Field</th><th>Value</th></tr>
<tr><td>Target</td><td>${s.target}</td></tr>
<tr><td>Mode</td><td>${s.mode}</td></tr>
<tr><td>Hosts Found</td><td>${s.hosts_found}</td></tr>
<tr><td>Exploits Run</td><td>${s.exploits_run}</td></tr>
</table>
<h2>Vulnerabilities</h2>
${vulns.map((v: any) => `<div class="finding ${v.cvss_score>=9?'critical':v.cvss_score>=7?'high':''}">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
    <strong>${v.title}</strong>
    <span class="badge ${v.cvss_score>=9?'crit':v.cvss_score>=7?'high':'med'}">CVSS ${v.cvss_score?.toFixed(1)}</span>
  </div>
  <div style="color:#888;font-size:.8rem">${v.host_ip} · Port ${v.port} · ${v.cve||'N/A'}</div>
</div>`).join('')}
<div style="color:#444;font-size:.7rem;margin-top:48px;padding-top:16px;border-top:1px solid #1a1a1a">
Generated by TIRPAN — Targeted Intrusion Recon, Penetration &amp; Autonomy Node<br>
For authorized security testing only. Non-Commercial License.
</div></body></html>`;
}
