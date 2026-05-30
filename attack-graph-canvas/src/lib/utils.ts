import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isDemoMode } from "@/lib/demoMode";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toggleInSet<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const API_BASE = "/api/v1";

function getToken(): string | null {
  try {
    return localStorage.getItem("tirpan_token") || sessionStorage.getItem("tirpan_token");
  } catch {
    return null;
  }
}

const DEMO_API_RESPONSES: Record<string, unknown> = {
  "/credentials": [],
  "/tools/status": { tools: [{ name: "nmap", available: true }, { name: "metasploit", available: true }, { name: "nuclei", available: true }] },
  "/settings": { model: "claude-3-7-sonnet", max_iterations: 50, rate_limit: 10, time_limit: 0 },
  "/ollama/status": { online: false, models: [], current: "" },
  "/lmstudio/status": { online: false, models: [], current: "" },
  "/scan-profiles": [],
  "/never-scan": [],
  "/audit": { logs: [] },
  "/system/stats": { cpu: 34, ram_used_gb: 5.8, ram_total_gb: 16, tokens: 52400, gpu: null },
};

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (isDemoMode()) {
    if (path in DEMO_API_RESPONSES) {
      return new Promise(resolve => setTimeout(() => resolve(DEMO_API_RESPONSES[path] as T), 80));
    }
    // Silently ignore unknown demo requests
    return new Promise((_, reject) => setTimeout(() => reject(new Error("Demo mode")), 80));
  }

  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    const demo = (() => { try { return localStorage.getItem("tirpan_demo") === "1"; } catch { return false; } })();
    if (!demo) {
      localStorage.removeItem("tirpan_token");
      localStorage.removeItem("tirpan_user");
      window.location.href = "/normal/login";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "analyst" | "viewer";
  role_label: string;
  org_id: string | null;
  is_active: boolean;
  created_at: number;
  avatar?: string;
  last_login?: number | null;
}

/** Persist a partial update to the stored user and notify listeners (sidebar avatar, etc.). */
export function updateStoredUser(patch: Partial<AuthUser>): void {
  const store = localStorage.getItem("tirpan_user") ? localStorage : sessionStorage;
  try {
    const cur = JSON.parse(store.getItem("tirpan_user") || "{}");
    store.setItem("tirpan_user", JSON.stringify({ ...cur, ...patch }));
  } catch {
    store.setItem("tirpan_user", JSON.stringify(patch));
  }
  window.dispatchEvent(new Event("tirpan-auth"));
}

export const ROLE_HIERARCHY: Record<string, number> = {
  owner: 40,
  admin: 30,
  analyst: 20,
  viewer: 10,
};

export function hasRole(user: AuthUser | null, ...roles: string[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

export function hasMinRole(user: AuthUser | null, minRole: string): boolean {
  if (!user) return false;
  return (ROLE_HIERARCHY[user.role] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}

export function useAuth() {
  const token = getToken();
  let user: AuthUser | null = null;
  try {
    const raw = localStorage.getItem("tirpan_user") || sessionStorage.getItem("tirpan_user");
    if (raw) user = JSON.parse(raw);
  } catch {}

  const isLoggedIn = !!token;
  const logout = () => {
    [localStorage, sessionStorage].forEach((s) => {
      s.removeItem("tirpan_token");
      s.removeItem("tirpan_user");
    });
    window.location.href = "/normal/login";
  };

  return { token, user, isLoggedIn, logout };
}
