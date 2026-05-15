import type { AuthUser } from "./utils";

export function isDemoMode(): boolean {
  try {
    return localStorage.getItem("tirpan_demo") === "1";
  } catch {
    return false;
  }
}

export const DEMO_USER: AuthUser = {
  id: "demo-user",
  email: "demo@tirpan.io",
  full_name: "Demo User",
  role: "analyst",
  role_label: "Analyst",
  org_id: null,
  is_active: true,
  created_at: 0,
};

export function setDemoMode() {
  try {
    localStorage.setItem("tirpan_demo", "1");
    localStorage.setItem("tirpan_token", "demo-token");
    localStorage.setItem("tirpan_user", JSON.stringify(DEMO_USER));
  } catch {}
}

export function clearDemoMode() {
  try {
    localStorage.removeItem("tirpan_demo");
    localStorage.removeItem("tirpan_token");
    localStorage.removeItem("tirpan_user");
  } catch {}
}
