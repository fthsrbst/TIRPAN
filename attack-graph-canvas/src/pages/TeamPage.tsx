import { useState, useEffect, useCallback } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { api, useAuth, hasRole } from "@/lib/utils";

// ── Tipler ────────────────────────────────────────────────────────────────────

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

// ── Sabitler ──────────────────────────────────────────────────────────────────

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
  return `${Math.round(diffH / 24)} days left`;
}

// ── Kopyala butonu ─────────────────────────────────────────────────────────────

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

// ── Ana sayfa ─────────────────────────────────────────────────────────────────

type Tab = "members" | "invitations" | "org";

export default function TeamPage() {
  const { user } = useAuth();
  const isAdmin = hasRole(user, "owner", "admin");
  const isOwner = hasRole(user, "owner");

  const [tab, setTab] = useState<Tab>("members");
  const [org, setOrg] = useState<OrgInfo | null>(null);

  // Org oluşturma / katılma
  const [orgAction, setOrgAction] = useState<"create" | "join" | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [orgActionLoading, setOrgActionLoading] = useState(false);
  const [orgActionError, setOrgActionError] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Davet dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteExpire, setInviteExpire] = useState("72");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [newInviteUrl, setNewInviteUrl] = useState("");

  // Rol değiştirme
  const [roleChangeId, setRoleChangeId] = useState<string | null>(null);
  const [roleChanging, setRoleChanging] = useState(false);

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
      try {
        orgData = await api.get<OrgInfo>("/auth/org");
      } catch {
        orgData = null;
      }
      setOrg(orgData);

      if (!orgData) {
        setMembers([]);
        setInvitations([]);
        return;
      }

      let membersData: Member[] = [];
      if (isAdmin) {
        membersData = await api.get<Member[]>("/auth/users");
      }
      setMembers(membersData);

      if (isAdmin) {
        const invData = await api.get<Invitation[]>("/auth/org/invitations");
        setInvitations(invData);
      } else {
        setInvitations([]);
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
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  const toggleActive = async (member: Member) => {
    try {
      const updated = await api.patch<Member>(`/auth/users/${member.id}/active?is_active=${!member.is_active}`);
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  const changeRole = async (memberId: string, newRole: string) => {
    setRoleChanging(true);
    try {
      const updated = await api.patch<Member>(`/auth/users/${memberId}/role`, { role: newRole });
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setRoleChangeId(null);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setRoleChanging(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Team" subtitle="Organization and member management">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Team" subtitle="Organization and member management">
      <div className="space-y-4 max-w-4xl mx-auto">

        {error && (
          <div className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError("")} className="ml-auto hover:opacity-70">✕</button>
          </div>
        )}

        {!org && (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="rounded-xl border border-border bg-muted/25 p-6 text-center space-y-2">
              <Building2 className="w-10 h-10 mx-auto text-muted-foreground/60" />
              <p className="font-display font-semibold text-foreground">No organization linked</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This account is not part of an organization yet. Create a new one or join with an invitation code.
              </p>
            </div>

            {orgActionError && (
              <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-2.5 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {orgActionError}
              </div>
            )}

            {/* Action cards */}
            {!orgAction && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setOrgAction("create"); setOrgActionError(""); }}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
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
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
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

            {/* Create org form */}
            {orgAction === "create" && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  Create Organization
                </h3>
                <div className="space-y-2">
                  <Label>Organization name</Label>
                  <Input
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="Acme Security"
                    onKeyDown={(e) => e.key === "Enter" && createOrg()}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createOrg} disabled={orgActionLoading || !newOrgName.trim()} className="gap-2">
                    {orgActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create
                  </Button>
                  <Button variant="outline" onClick={() => { setOrgAction(null); setNewOrgName(""); setOrgActionError(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Join with invite form */}
            {orgAction === "join" && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" />
                  Join with Invitation
                </h3>
                <div className="space-y-2">
                  <Label>Invitation code or link</Label>
                  <Input
                    value={joinToken}
                    onChange={(e) => {
                      // Accept full URL or just the token
                      const val = e.target.value;
                      const match = val.match(/\/invite\/([a-zA-Z0-9_-]+)/);
                      setJoinToken(match ? match[1] : val);
                    }}
                    placeholder="Paste invite link or token…"
                    onKeyDown={(e) => e.key === "Enter" && joinOrg()}
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground">You can paste the full invite URL or just the token.</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={joinOrg} disabled={orgActionLoading || !joinToken.trim()} className="gap-2">
                    {orgActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    Join
                  </Button>
                  <Button variant="outline" onClick={() => { setOrgAction(null); setJoinToken(""); setOrgActionError(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Org header */}
        {org && (
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-lg leading-tight">{org.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                /{org.slug} · Plan: <span className="capitalize">{org.plan}</span>
                {org.allowed_email_domain && ` · @${org.allowed_email_domain}`}
              </p>
            </div>
            {isAdmin && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {members.length} {members.length === 1 ? "member" : "members"}
              </Badge>
            )}
          </div>
        )}

        {/* Tab navigation */}
        {org && (
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          {[
            { id: "members" as Tab, label: "Members", icon: Users, show: isAdmin },
            { id: "invitations" as Tab, label: "Invitations", icon: Mail, show: isAdmin },
            { id: "org" as Tab, label: "Organization", icon: Building2, show: isOwner },
          ].filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
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
        )}

        {/* Members tab */}
        {org && (tab === "members") && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Team members</h3>
              {isAdmin && (
                <Button size="sm" onClick={() => { setInviteOpen(true); setNewInviteUrl(""); setInviteError(""); }} className="h-8 gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Send invite
                </Button>
              )}
            </div>
            <div className="divide-y divide-border">
              {members.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No members loaded or insufficient permissions.</p>
              )}
              {members.map((m) => (
                <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${!m.is_active ? "opacity-50" : ""}`}>
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0 font-semibold text-sm text-primary uppercase">
                    {m.full_name.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{m.full_name}</span>
                      {m.id === user?.id && (
                        <span className="text-[10px] text-muted-foreground">(you)</span>
                      )}
                      {!m.is_active && (
                        <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>

                  {/* Rol — admin/owner değiştirebilir, kendi rolü hariç */}
                  {isAdmin && m.id !== user?.id && m.role !== "owner" ? (
                    roleChangeId === m.id ? (
                      <div className="flex items-center gap-2">
                        <Select defaultValue={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(isOwner ? [{ value: "owner", label: "Owner" }, ...ROLE_OPTIONS] : ROLE_OPTIONS).map((r) => (
                              <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {roleChanging && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                        <button onClick={() => setRoleChangeId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRoleChangeId(m.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer hover:opacity-80 transition-opacity ${ROLE_COLORS[m.role] || ""}`}
                      >
                        {m.role_label}
                        <UserCog className="w-3 h-3 ml-0.5" />
                      </button>
                    )
                  ) : (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${ROLE_COLORS[m.role] || ""}`}>
                      {m.role_label}
                    </span>
                  )}

                  {/* Aktif/Pasif toggle */}
                  {isAdmin && m.id !== user?.id && m.role !== "owner" && (
                    <button
                      onClick={() => toggleActive(m)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={m.is_active ? "Deactivate account" : "Activate account"}
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

        {/* Invitations tab */}
        {org && tab === "invitations" && isAdmin && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Sent invitations</h3>
              <Button size="sm" onClick={() => { setInviteOpen(true); setNewInviteUrl(""); setInviteError(""); }} className="h-8 gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                New invitation
              </Button>
            </div>
            {invitations.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                No invitations sent yet.
              </div>
            )}
            <div className="space-y-2">
              {invitations.map((inv) => {
                const url = `${window.location.origin}/normal/invite/${inv.token}`;
                return (
                  <div key={inv.id} className={`rounded-xl border border-border bg-card p-3 flex items-center gap-3 ${!inv.is_valid ? "opacity-60" : ""}`}>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_COLORS[inv.role] || ""}`}>
                          {inv.role_label}
                        </span>
                        {inv.email && <span className="text-xs text-muted-foreground">{inv.email}</span>}
                        {inv.used_at ? (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="w-3 h-3" /> Used
                          </span>
                        ) : inv.is_valid ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" /> {formatExpiry(inv.expires_at)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-destructive">
                            <XCircle className="w-3 h-3" /> Expired
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground truncate font-mono">{url}</span>
                        <CopyButton text={url} />
                      </div>
                    </div>
                    {!inv.used_at && inv.is_valid && (
                      <button
                        onClick={() => revokeInvite(inv.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
                        title="Revoke invite"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Org settings tab */}
        {org && tab === "org" && isOwner && (
          <OrgSettingsPanel org={org} onUpdated={(updated) => setOrg(updated)} />
        )}
      </div>

      {/* ── Davet dialog ───────────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={(v) => { if (!v) { setInviteOpen(false); setNewInviteUrl(""); setInviteEmail(""); setInviteRole("viewer"); setInviteExpire("72"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Invite a team member</DialogTitle>
            <DialogDescription>
              Create an invitation link. Anyone with the link can complete signup (subject to your settings).
            </DialogDescription>
          </DialogHeader>

          {!newInviteUrl ? (
            <div className="space-y-4 py-2">
              {inviteError && (
                <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-2.5 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {inviteError}
                </div>
              )}
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(isOwner ? [{ value: "owner", label: "Owner", desc: "Super admin — full access" }, ...ROLE_OPTIONS] : ROLE_OPTIONS).map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        <div>
                          <span className="font-medium">{r.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{r.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  Email <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Input
                  type="email"
                  placeholder="person@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  If set, only that email address can redeem the invite.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Link expiry</Label>
                <Select value={inviteExpire} onValueChange={setInviteExpire}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
              <p className="text-xs text-muted-foreground">
                The link is single-use and expires after the selected period.
              </p>
            </div>
          )}

          <DialogFooter>
            {!newInviteUrl ? (
              <>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button onClick={createInvite} disabled={inviteLoading} className="gap-2">
                  {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Create invite
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

// ── Org ayarları paneli (owner only) ──────────────────────────────────────────

function OrgSettingsPanel({ org, onUpdated }: { org: OrgInfo; onUpdated: (o: OrgInfo) => void }) {
  const [name, setName] = useState(org.name);
  const [domain, setDomain] = useState(org.allowed_email_domain || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await api.patch<OrgInfo>("/auth/org", {
        name: name.trim() || undefined,
        allowed_email_domain: domain.trim() || null,
      });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError((e as Error).message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <h3 className="font-semibold text-sm border-b border-border pb-3">Organization settings</h3>

      {error && (
        <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-2.5 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="orgName">Organization name</Label>
        <Input
          id="orgName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-10 max-w-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="orgDomain">
          Allowed email domain{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <div className="flex items-center gap-2 max-w-sm">
          <span className="text-muted-foreground text-sm">@</span>
          <Input
            id="orgDomain"
            placeholder="company.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value.replace(/^@/, ""))}
            className="h-10"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          When set, only addresses on this domain can join the organization. Leave empty for no restriction.
        </p>
      </div>

      <div className="pt-1">
        <Button onClick={save} disabled={saving} className="h-9 gap-2">
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : null}
          {saved ? "Saved" : "Save"}
        </Button>
      </div>

      {/* Slug bilgisi */}
      <div className="border-t border-border pt-4 space-y-1">
        <p className="text-xs text-muted-foreground">Organization ID (cannot be changed)</p>
        <div className="flex items-center gap-2">
          <code className="text-xs text-foreground font-mono">/{org.slug}</code>
          <CopyButton text={org.slug} />
        </div>
      </div>
    </div>
  );
}
