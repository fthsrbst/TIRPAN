import { useState, useEffect, useCallback } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  Users,
  Mail,
  Link2,
  Plus,
  Trash2,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  UserCog,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  KeyRound,
  Globe,
  CalendarDays,
  Layers,
  ImagePlus,
  Save,
  Settings2,
  UserCheck,
  UserX,
  Hash,
  Crown,
} from "lucide-react";
import { api, useAuth, hasRole } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  owner_id: string | null;
  allowed_email_domain: string;
  created_at: number;
}

interface Member {
  id: string;
  email: string;
  full_name: string;
  role: string;
  role_label: string;
  is_active: boolean;
  created_at: number;
  org_id: string | null;
}

interface Invitation {
  id: string;
  token: string;
  org_id: string;
  role: string;
  role_label: string;
  invited_by: string;
  email: string;
  expires_at: number;
  used_at: number | null;
  created_at: number;
  is_valid: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  owner:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  admin:   "bg-violet-500/15 text-violet-400 border-violet-500/30",
  analyst: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  viewer:  "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const ROLE_OPTIONS = [
  { value: "admin",   label: "Admin",   desc: "Team manager — can send invites" },
  { value: "analyst", label: "Analyst", desc: "Can create and run pentests" },
  { value: "viewer",  label: "Viewer",  desc: "Read-only access" },
];

function formatExpiry(ts: number) {
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diffH = Math.round((d.getTime() - now) / 3600000);
  if (diffH < 0) return "Expired";
  if (diffH < 24) return `${diffH}h left`;
  return `${Math.round(diffH / 24)}d left`;
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="node-card !p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-muted/60 shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold font-mono leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── RoleBar ───────────────────────────────────────────────────────────────────

function RoleBar({ members }: { members: Member[] }) {
  const counts = { owner: 0, admin: 0, analyst: 0, viewer: 0 };
  members.forEach((m) => { if (m.role in counts) counts[m.role as keyof typeof counts]++; });
  const total = members.length || 1;
  const roles: { key: keyof typeof counts; label: string; color: string; bg: string }[] = [
    { key: "owner",   label: "Owner",   color: "bg-amber-400",  bg: "bg-amber-400/20" },
    { key: "admin",   label: "Admin",   color: "bg-violet-400", bg: "bg-violet-400/20" },
    { key: "analyst", label: "Analyst", color: "bg-blue-400",   bg: "bg-blue-400/20" },
    { key: "viewer",  label: "Viewer",  color: "bg-slate-400",  bg: "bg-slate-400/20" },
  ];
  return (
    <div className="node-card !p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role breakdown</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {roles.map(({ key, color }) =>
          counts[key] > 0 ? (
            <div
              key={key}
              className={`${color} transition-all`}
              style={{ width: `${(counts[key] / total) * 100}%` }}
            />
          ) : null
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {roles.map(({ key, label, bg, color }) => (
          <div key={key} className={`flex items-center justify-between px-2 py-1 rounded-lg ${bg}`}>
            <span className={`text-[11px] font-medium ${color.replace("bg-", "text-")}`}>{label}</span>
            <span className="text-[11px] font-mono font-bold text-foreground">{counts[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "members" | "invitations" | "settings";

export default function TeamPage() {
  const { user } = useAuth();
  const isAdmin = hasRole(user, "owner", "admin");
  const isOwner = hasRole(user, "owner");

  const [tab, setTab] = useState<Tab>("members");
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Branding state
  const [brandingName, setBrandingName] = useState("");
  const [brandingLogoUrl, setBrandingLogoUrl] = useState("");
  const [brandingHasLogo, setBrandingHasLogo] = useState(false);

  // Org create / join
  const [orgAction, setOrgAction] = useState<"create" | "join" | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [orgActionLoading, setOrgActionLoading] = useState(false);
  const [orgActionError, setOrgActionError] = useState("");

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteExpire, setInviteExpire] = useState("72");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [newInviteUrl, setNewInviteUrl] = useState("");

  // Role change
  const [roleChangeId, setRoleChangeId] = useState<string | null>(null);
  const [roleChanging, setRoleChanging] = useState(false);

  const activeCount = members.filter((m) => m.is_active).length;
  const pendingInvites = invitations.filter((i) => i.is_valid && !i.used_at).length;

  const applyNewToken = (token: string, userData: Record<string, unknown>) => {
    localStorage.setItem("tirpan_token", token);
    const stored = JSON.parse(localStorage.getItem("tirpan_user") || "{}");
    localStorage.setItem("tirpan_user", JSON.stringify({ ...stored, ...userData }));
    window.location.reload();
  };

  const createOrg = async () => {
    if (!newOrgName.trim()) return;
    setOrgActionLoading(true);
    setOrgActionError("");
    try {
      const res = await api.post<{ access_token: string; user: Record<string, unknown> }>("/auth/org", { name: newOrgName.trim() });
      applyNewToken(res.access_token, res.user);
    } catch (e: unknown) {
      setOrgActionError((e as Error).message || "Could not create organization.");
      setOrgActionLoading(false);
    }
  };

  const joinOrg = async () => {
    if (!joinToken.trim()) return;
    setOrgActionLoading(true);
    setOrgActionError("");
    try {
      const res = await api.post<{ access_token: string; user: Record<string, unknown> }>("/auth/org/join", { invite_token: joinToken.trim() });
      applyNewToken(res.access_token, res.user);
    } catch (e: unknown) {
      setOrgActionError((e as Error).message || "Could not join organization.");
      setOrgActionLoading(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let orgData: OrgInfo | null = null;
      try { orgData = await api.get<OrgInfo>("/auth/org"); } catch { orgData = null; }
      setOrg(orgData);

      if (!orgData) { setMembers([]); setInvitations([]); return; }

      const [membersData, invData, brandingData] = await Promise.allSettled([
        isAdmin ? api.get<Member[]>("/auth/users") : Promise.resolve([]),
        isAdmin ? api.get<Invitation[]>("/auth/org/invitations") : Promise.resolve([]),
        api.get<{ company_name: string; logo_url: string; has_logo: boolean }>("/config/branding"),
      ]);

      if (membersData.status === "fulfilled") setMembers(membersData.value);
      if (invData.status === "fulfilled") setInvitations(invData.value);
      if (brandingData.status === "fulfilled") {
        setBrandingName(brandingData.value.company_name);
        setBrandingLogoUrl(brandingData.value.logo_url);
        setBrandingHasLogo(brandingData.value.has_logo);
      }
    } catch (e: unknown) {
      setError((e as Error).message || "Could not load data.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const createInvite = async () => {
    setInviteLoading(true);
    setInviteError("");
    try {
      const invite = await api.post<Invitation>("/auth/org/invitations", {
        role: inviteRole,
        email: inviteEmail.trim(),
        expire_hours: parseInt(inviteExpire),
      });
      const url = `${window.location.origin}/normal/invite/${invite.token}`;
      setNewInviteUrl(url);
      setInvitations((prev) => [invite, ...prev]);
    } catch (e: unknown) {
      setInviteError((e as Error).message || "Could not create invite.");
    } finally {
      setInviteLoading(false);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    try {
      await api.delete(`/auth/org/invitations/${inviteId}`);
      setInvitations((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const toggleActive = async (member: Member) => {
    try {
      const updated = await api.patch<Member>(`/auth/users/${member.id}/active?is_active=${!member.is_active}`);
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const changeRole = async (memberId: string, newRole: string) => {
    setRoleChanging(true);
    try {
      const updated = await api.patch<Member>(`/auth/users/${memberId}/role`, { role: newRole });
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setRoleChangeId(null);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setRoleChanging(false); }
  };

  if (loading) {
    return (
      <PageShell title="Company" subtitle="Organization & brand management">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Company" subtitle="Organization & brand management">
      <div className="space-y-5 max-w-5xl mx-auto">

        {error && (
          <div className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError("")} className="ml-auto hover:opacity-70">✕</button>
          </div>
        )}

        {/* ── No org ──────────────────────────────────────────────────────── */}
        {!org && (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="rounded-xl border border-border bg-muted/25 p-6 text-center space-y-2">
              <Building2 className="w-10 h-10 mx-auto text-muted-foreground/60" />
              <p className="font-display font-semibold text-foreground">No organization linked</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This account is not part of an organization yet.
              </p>
            </div>
            {orgActionError && (
              <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl px-3 py-2.5 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {orgActionError}
              </div>
            )}
            {!orgAction && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setOrgAction("create"); setOrgActionError(""); }}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-center">Create Organization</p>
                    <p className="text-xs text-muted-foreground text-center mt-0.5">Start a new org and become owner</p>
                  </div>
                </button>
                <button
                  onClick={() => { setOrgAction("join"); setOrgActionError(""); }}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                    <KeyRound className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-center">Join with Invite</p>
                    <p className="text-xs text-muted-foreground text-center mt-0.5">Enter an invitation code or link</p>
                  </div>
                </button>
              </div>
            )}
            {orgAction === "create" && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" /> Create Organization
                </h3>
                <div className="space-y-2">
                  <Label>Organization name</Label>
                  <Input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="Acme Security" onKeyDown={(e) => e.key === "Enter" && createOrg()} autoFocus />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createOrg} disabled={orgActionLoading || !newOrgName.trim()} className="gap-2">
                    {orgActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
                  </Button>
                  <Button variant="outline" onClick={() => { setOrgAction(null); setNewOrgName(""); setOrgActionError(""); }}>Cancel</Button>
                </div>
              </div>
            )}
            {orgAction === "join" && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" /> Join with Invitation
                </h3>
                <div className="space-y-2">
                  <Label>Invitation code or link</Label>
                  <Input
                    value={joinToken}
                    onChange={(e) => {
                      const val = e.target.value;
                      const match = val.match(/\/invite\/([a-zA-Z0-9_-]+)/);
                      setJoinToken(match ? match[1] : val);
                    }}
                    placeholder="Paste invite link or token…"
                    onKeyDown={(e) => e.key === "Enter" && joinOrg()}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={joinOrg} disabled={orgActionLoading || !joinToken.trim()} className="gap-2">
                    {orgActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Join
                  </Button>
                  <Button variant="outline" onClick={() => { setOrgAction(null); setJoinToken(""); setOrgActionError(""); }}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Org exists ──────────────────────────────────────────────────── */}
        {org && (
          <>
            {/* Company identity card */}
            <div className="node-card !p-5 flex items-center gap-5">
              <div className="shrink-0">
                {brandingHasLogo && brandingLogoUrl ? (
                  <img src={brandingLogoUrl} alt="Logo" className="w-16 h-16 rounded-2xl object-contain border border-border bg-muted/30" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center">
                    <Building2 className="w-8 h-8 text-primary" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display font-bold text-xl leading-tight">{org.name}</h2>
                  <Badge variant="outline" className="capitalize text-xs font-medium">{org.plan}</Badge>
                  {org.allowed_email_domain && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
                      <Globe className="w-3 h-3" /> @{org.allowed_email_domain}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Hash className="w-3 h-3" /> {org.slug}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="w-3 h-3" /> Founded {formatDate(org.created_at)}
                  </span>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setTab("settings")}
                  className="shrink-0 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Company settings"
                >
                  <Settings2 className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={Users} label="Total members" value={members.length} color="text-primary" />
              <StatCard icon={UserCheck} label="Active" value={activeCount} sub={`${members.length - activeCount} inactive`} color="text-green-400" />
              <StatCard icon={Mail} label="Pending invites" value={pendingInvites} sub={`${invitations.filter(i => i.used_at).length} used total`} color="text-blue-400" />
              <StatCard icon={Crown} label="Admins" value={members.filter(m => m.role === "owner" || m.role === "admin").length} sub="owner + admin" color="text-amber-400" />
            </div>

            {/* Role distribution */}
            {members.length > 0 && <RoleBar members={members} />}

            {/* Tab navigation */}
            <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
              {[
                { id: "members" as Tab,     label: "Members",     icon: Users,     show: isAdmin },
                { id: "invitations" as Tab,  label: "Invitations", icon: Mail,      show: isAdmin },
                { id: "settings" as Tab,     label: "Settings",    icon: Settings2, show: isAdmin },
              ].filter((t) => t.show).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
              {!isAdmin && (
                <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" /> Members
                </div>
              )}
            </div>

            {/* ── Members tab ─────────────────────────────────────────────── */}
            {tab === "members" && (
              <div className="node-card overflow-hidden !p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="font-semibold text-sm">Team members</h3>
                  {isAdmin && (
                    <Button size="sm" onClick={() => { setInviteOpen(true); setNewInviteUrl(""); setInviteError(""); }} className="h-8 gap-1.5">
                      <Plus className="w-3.5 h-3.5" /> Invite
                    </Button>
                  )}
                </div>
                <div className="divide-y divide-border">
                  {members.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-10">No members found.</p>
                  )}
                  {members.map((m) => (
                    <div key={m.id} className={`flex items-center gap-3 px-4 py-3 transition-opacity ${!m.is_active ? "opacity-45" : ""}`}>
                      <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0 font-bold text-sm text-primary uppercase">
                        {m.full_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{m.full_name}</span>
                          {m.id === user?.id && <span className="text-[10px] text-muted-foreground">(you)</span>}
                          {!m.is_active && <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 py-0">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                      </div>
                      <div className="text-[10px] text-muted-foreground hidden sm:block shrink-0">
                        {formatDate(m.created_at)}
                      </div>

                      {isAdmin && m.id !== user?.id && m.role !== "owner" ? (
                        roleChangeId === m.id ? (
                          <div className="flex items-center gap-2">
                            <Select defaultValue={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                              <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(isOwner ? [{ value: "owner", label: "Owner" }, ...ROLE_OPTIONS] : ROLE_OPTIONS).map((r) => (
                                  <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {roleChanging && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                            <button onClick={() => setRoleChangeId(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRoleChangeId(m.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer hover:opacity-80 ${ROLE_COLORS[m.role] || ""}`}
                          >
                            {m.role_label} <UserCog className="w-3 h-3" />
                          </button>
                        )
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${ROLE_COLORS[m.role] || ""}`}>
                          {m.role_label}
                        </span>
                      )}

                      {isAdmin && m.id !== user?.id && m.role !== "owner" && (
                        <button
                          onClick={() => toggleActive(m)}
                          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          title={m.is_active ? "Deactivate" : "Activate"}
                        >
                          {m.is_active
                            ? <ToggleRight className="w-5 h-5 text-green-400" />
                            : <ToggleLeft className="w-5 h-5" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Invitations tab ─────────────────────────────────────────── */}
            {tab === "invitations" && isAdmin && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Sent invitations</h3>
                  <Button size="sm" onClick={() => { setInviteOpen(true); setNewInviteUrl(""); setInviteError(""); }} className="h-8 gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> New invitation
                  </Button>
                </div>
                {invitations.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground text-sm">
                    No invitations yet.
                  </div>
                )}
                <div className="space-y-2">
                  {invitations.map((inv) => {
                    const url = `${window.location.origin}/normal/invite/${inv.token}`;
                    return (
                      <div key={inv.id} className={`node-card !p-3 flex items-center gap-3 ${!inv.is_valid ? "opacity-50" : ""}`}>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_COLORS[inv.role] || ""}`}>
                              {inv.role_label}
                            </span>
                            {inv.email && <span className="text-xs text-muted-foreground">{inv.email}</span>}
                            {inv.used_at ? (
                              <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-3 h-3" /> Used</span>
                            ) : inv.is_valid ? (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" /> {formatExpiry(inv.expires_at)}</span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-destructive"><XCircle className="w-3 h-3" /> Expired</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="text-[11px] text-muted-foreground truncate font-mono">{url}</span>
                            <CopyButton text={url} />
                          </div>
                        </div>
                        {!inv.used_at && inv.is_valid && (
                          <button onClick={() => revokeInvite(inv.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded" title="Revoke">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Settings tab ────────────────────────────────────────────── */}
            {tab === "settings" && isAdmin && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Branding panel */}
                <BrandingPanel
                  name={brandingName}
                  logoUrl={brandingLogoUrl}
                  hasLogo={brandingHasLogo}
                  onNameChange={setBrandingName}
                  onLogoChange={(url, has) => { setBrandingLogoUrl(url); setBrandingHasLogo(has); }}
                />

                {/* Org settings panel */}
                {isOwner && (
                  <OrgSettingsPanel org={org} onUpdated={(updated) => setOrg(updated)} />
                )}

                {/* Info panel */}
                <div className="node-card !p-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" /> Organization info
                  </h3>
                  <Separator />
                  <div className="space-y-3">
                    {[
                      { label: "Org ID", value: org.id, mono: true, copy: true },
                      { label: "Slug", value: `/${org.slug}`, mono: true, copy: false },
                      { label: "Plan", value: org.plan.charAt(0).toUpperCase() + org.plan.slice(1), mono: false, copy: false },
                      { label: "Created", value: formatDate(org.created_at), mono: false, copy: false },
                      { label: "Domain restriction", value: org.allowed_email_domain ? `@${org.allowed_email_domain}` : "None", mono: false, copy: false },
                    ].map(({ label, value, mono, copy }) => (
                      <div key={label} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <div className="flex items-center gap-1">
                          <span className={`text-xs text-foreground truncate max-w-[180px] ${mono ? "font-mono" : ""}`}>{value}</span>
                          {copy && <CopyButton text={value} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Member activity panel */}
                <div className="node-card !p-5 space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" /> Member activity
                  </h3>
                  <Separator />
                  <div className="space-y-2">
                    {[
                      { icon: UserCheck, label: "Active members",   value: activeCount,                            color: "text-green-400" },
                      { icon: UserX,     label: "Inactive members", value: members.length - activeCount,           color: "text-destructive" },
                      { icon: Mail,      label: "Pending invites",  value: pendingInvites,                         color: "text-blue-400" },
                      { icon: CheckCircle2, label: "Used invites",  value: invitations.filter(i => i.used_at).length, color: "text-muted-foreground" },
                    ].map(({ icon: Icon, label, value, color }) => (
                      <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-3.5 h-3.5 ${color}`} />
                          <span className="text-xs text-muted-foreground">{label}</span>
                        </div>
                        <span className="text-sm font-mono font-bold">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </>
        )}
      </div>

      {/* ── Invite dialog ──────────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={(v) => { if (!v) { setInviteOpen(false); setNewInviteUrl(""); setInviteEmail(""); setInviteRole("viewer"); setInviteExpire("72"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Invite a team member</DialogTitle>
            <DialogDescription>
              Create an invitation link. Anyone with the link can complete signup.
            </DialogDescription>
          </DialogHeader>
          {!newInviteUrl ? (
            <div className="space-y-4 py-2">
              {inviteError && (
                <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-2.5 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{inviteError}
                </div>
              )}
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(isOwner ? [{ value: "owner", label: "Owner", desc: "Super admin — full access" }, ...ROLE_OPTIONS] : ROLE_OPTIONS).map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        <span className="font-medium">{r.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">{r.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input type="email" placeholder="person@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">If set, only that address can redeem the invite.</p>
              </div>
              <div className="space-y-2">
                <Label>Link expiry</Label>
                <Select value={inviteExpire} onValueChange={setInviteExpire}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="72">3 days</SelectItem>
                    <SelectItem value="168">1 week</SelectItem>
                    <SelectItem value="720">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-3">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span className="font-medium">Invitation link created</span>
              </div>
              <div className="bg-muted rounded-lg p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Share this link:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-foreground font-mono break-all flex-1">{newInviteUrl}</code>
                  <CopyButton text={newInviteUrl} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Single-use and expires after the selected period.</p>
            </div>
          )}
          <DialogFooter>
            {!newInviteUrl ? (
              <>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button onClick={createInvite} disabled={inviteLoading} className="gap-2">
                  {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Create invite
                </Button>
              </>
            ) : (
              <Button onClick={() => setInviteOpen(false)} className="w-full">Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── Branding panel ────────────────────────────────────────────────────────────

function BrandingPanel({ name, logoUrl, hasLogo, onNameChange, onLogoChange }: {
  name: string;
  logoUrl: string;
  hasLogo: boolean;
  onNameChange: (v: string) => void;
  onLogoChange: (url: string, has: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await api.post("/config/branding", { company_name: name });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) { setError((e as Error).message || "Could not save."); }
    finally { setSaving(false); }
  };

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("tirpan_token");
      const res = await fetch("/api/v1/config/branding/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      onLogoChange(data.logo_url, true);
    } catch (err: unknown) { setError(String(err)); }
    finally { setSaving(false); }
  };

  const deleteLogo = async () => {
    setSaving(true);
    try {
      await api.delete("/config/branding/logo");
      onLogoChange("", false);
    } catch (e: unknown) { setError(String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="node-card !p-5 space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <ImagePlus className="w-4 h-4 text-muted-foreground" /> Branding
      </h3>
      <Separator />

      {error && (
        <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-2 text-xs">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Logo */}
      <div className="space-y-2">
        <Label>Company logo</Label>
        <div className="flex items-center gap-3">
          {hasLogo && logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-contain border border-border bg-muted/30" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-muted/60 border border-dashed border-border flex items-center justify-center">
              <Building2 className="w-5 h-5 text-muted-foreground/50" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs font-medium hover:bg-muted/80 transition-colors">
              <ImagePlus className="w-3.5 h-3.5" /> Upload logo
              <input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={uploadLogo} className="hidden" />
            </label>
            {hasLogo && (
              <button onClick={deleteLogo} className="text-xs text-destructive hover:opacity-70 transition-opacity text-left">
                Remove logo
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">PNG, JPG or WebP. Shown on reports.</p>
      </div>

      {/* Company name */}
      <div className="space-y-2">
        <Label htmlFor="brandingName">Display name</Label>
        <Input
          id="brandingName"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Acme Security"
          className="h-9"
        />
        <p className="text-[11px] text-muted-foreground">Used in report headers and exports.</p>
      </div>

      <Button onClick={save} disabled={saving} className="h-8 gap-2 text-xs" size="sm">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Save className="w-3.5 h-3.5" />}
        {saved ? "Saved" : "Save branding"}
      </Button>
    </div>
  );
}

// ── Org settings panel ────────────────────────────────────────────────────────

function OrgSettingsPanel({ org, onUpdated }: { org: OrgInfo; onUpdated: (o: OrgInfo) => void }) {
  const [name, setName] = useState(org.name);
  const [domain, setDomain] = useState(org.allowed_email_domain || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const updated = await api.patch<OrgInfo>("/auth/org", {
        name: name.trim() || undefined,
        allowed_email_domain: domain.trim() || null,
      });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) { setError((e as Error).message || "Could not save."); }
    finally { setSaving(false); }
  };

  return (
    <div className="node-card !p-5 space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground" /> Organization settings
        <Badge variant="outline" className="text-[10px] ml-auto">Owner only</Badge>
      </h3>
      <Separator />

      {error && (
        <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-2 text-xs">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="orgName">Organization name</Label>
        <Input id="orgName" value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="orgDomain">
          Allowed email domain <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">@</span>
          <Input
            id="orgDomain"
            placeholder="company.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value.replace(/^@/, ""))}
            className="h-9"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Leave empty for no restriction.</p>
      </div>

      <Button onClick={save} disabled={saving} className="h-8 gap-2 text-xs" size="sm">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Save className="w-3.5 h-3.5" />}
        {saved ? "Saved" : "Save settings"}
      </Button>
    </div>
  );
}
