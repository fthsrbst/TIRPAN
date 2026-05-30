import { useRef, useState } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { UserAvatar } from "@/components/attack/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Eye, EyeOff, Save, Lock, Loader2, LogOut, Camera, Trash2,
  Mail, Shield, CalendarDays, Clock, Upload,
} from "lucide-react";
import { api, useAuth, updateStoredUser, type AuthUser } from "@/lib/utils";

const ROLE_COLORS: Record<string, string> = {
  owner:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  admin:   "bg-violet-500/15 text-violet-400 border-violet-500/30",
  analyst: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  viewer:  "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const ROLE_DESC: Record<string, string> = {
  owner:   "Full control over the organization, billing and members.",
  admin:   "Manages the team, invites members and assigns roles.",
  analyst: "Creates and runs pentest missions.",
  viewer:  "Read-only access to results and reports.",
};

/** Read a file, downscale to a square-ish thumbnail, return a JPEG data URL. */
function downscaleImage(file: File, max = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { user, isLoggedIn, logout } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [profileName, setProfileName] = useState(user?.full_name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const flash = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const persistUser = (u: Partial<AuthUser>) => updateStoredUser(u);

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      flash("err", "Please choose an image file");
      return;
    }
    setSavingAvatar(true);
    try {
      const dataUrl = await downscaleImage(file);
      const res = await api.put<{ user?: AuthUser }>("/auth/me", { avatar: dataUrl });
      if (res.user) persistUser(res.user);
      flash("ok", "Photo updated");
    } catch (err: unknown) {
      flash("err", (err as Error).message || "Failed to upload photo");
    }
    setSavingAvatar(false);
  };

  const removeAvatar = async () => {
    setSavingAvatar(true);
    try {
      const res = await api.put<{ user?: AuthUser }>("/auth/me", { avatar: "" });
      if (res.user) persistUser(res.user);
      flash("ok", "Photo removed");
    } catch (err: unknown) {
      flash("err", (err as Error).message || "Failed to remove photo");
    }
    setSavingAvatar(false);
  };

  const saveProfile = async () => {
    const body: Record<string, string> = {};
    if (profileName && profileName !== user?.full_name) body.full_name = profileName;
    if (profileEmail && profileEmail !== user?.email) body.email = profileEmail;
    if (Object.keys(body).length === 0) {
      flash("err", "Nothing to update");
      return;
    }
    setSaving(true);
    try {
      const res = await api.put<{ user?: AuthUser }>("/auth/me", body);
      if (res.user) persistUser(res.user);
      flash("ok", "Profile updated");
    } catch (err: unknown) {
      flash("err", (err as Error).message || "Failed to update profile");
    }
    setSaving(false);
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      flash("err", "Current and new password are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      flash("err", "New passwords do not match");
      return;
    }
    setSavingPw(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      flash("ok", "Password changed");
    } catch (err: unknown) {
      flash("err", (err as Error).message || "Failed to change password");
    }
    setSavingPw(false);
  };

  if (!isLoggedIn || !user) {
    return (
      <PageShell title="Profile" subtitle="Your account">
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Lock className="w-10 h-10 opacity-30" />
          <p className="text-sm">Sign in to view your profile.</p>
        </div>
      </PageShell>
    );
  }

  const roleColor = ROLE_COLORS[user.role] || "";
  const memberSince = user.created_at ? new Date(user.created_at * 1000).toLocaleDateString() : "—";
  const lastLogin = user.last_login ? new Date(user.last_login * 1000).toLocaleString() : "—";

  return (
    <PageShell title="Profile" subtitle="Manage your account and photo">
      {msg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-xl text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2 ${
            msg.type === "ok"
              ? "bg-success/15 text-success border border-success/30"
              : "bg-destructive/15 text-destructive border border-destructive/30"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-5xl mx-auto w-full pb-6">
        {/* ── Identity card ─────────────────────────────── */}
        <div className="lg:col-span-1 node-card !p-6 flex flex-col items-center text-center h-fit">
          <div className="relative group">
            <UserAvatar name={user.full_name} avatar={user.avatar} role={user.role} ring size={120} />
            <button
              onClick={onPickFile}
              disabled={savingAvatar}
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white disabled:opacity-100"
              title="Change photo"
            >
              {savingAvatar ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
            </button>
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

          <div className="mt-4 font-display font-bold text-lg">{user.full_name}</div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
          <span className={`inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleColor}`}>
            {user.role_label || user.role}
          </span>

          <div className="flex gap-2 mt-4 w-full">
            <Button onClick={onPickFile} disabled={savingAvatar} variant="outline" size="sm" className="gap-1.5 flex-1">
              <Upload className="w-3.5 h-3.5" /> Upload
            </Button>
            {user.avatar && (
              <Button onClick={removeAvatar} disabled={savingAvatar} variant="outline" size="sm" className="gap-1.5 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            Your photo appears next to your name in Team and Agent Flow so leads can recognise who ran what.
            Images are downscaled automatically.
          </p>

          <Separator className="my-4" />

          <div className="w-full space-y-2 text-left text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>{ROLE_DESC[user.role] || "Member"}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Member since {memberSince}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-3.5 h-3.5 shrink-0" /> Last login {lastLogin}
            </div>
          </div>
        </div>

        {/* ── Forms ─────────────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Account details */}
          <div className="node-card !p-6 space-y-4">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> Account details
            </h3>
            <div className="space-y-2">
              <Label className="text-xs">Full Name</Label>
              <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Full name" autoComplete="off" name="profile-fullname" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Email</Label>
              <Input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} placeholder="Email" type="email" autoComplete="off" name="profile-email" />
            </div>
            <Button onClick={saveProfile} disabled={saving} size="sm" className="gap-2">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save changes
            </Button>
          </div>

          {/* Change password */}
          <div className="node-card !p-6 space-y-4">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" /> Change password
            </h3>
            <div className="space-y-2">
              <Label className="text-xs">Current Password</Label>
              <div className="relative">
                <Input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type={showCurrentPw ? "text" : "password"} placeholder="Current password" autoComplete="current-password" name="profile-cur-pw" />
                <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">New Password</Label>
                <div className="relative">
                  <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type={showNewPw ? "text" : "password"} placeholder="New password" autoComplete="new-password" name="profile-new-pw" />
                  <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Confirm Password</Label>
                <div className="relative">
                  <Input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type={showConfirmPw ? "text" : "password"} placeholder="Confirm new password" autoComplete="new-password" name="profile-confirm-pw" />
                  <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">At least 8 characters, 1 uppercase letter, 1 number.</p>
            <Button onClick={changePassword} disabled={savingPw} variant="outline" size="sm" className="gap-2">
              {savingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Change password
            </Button>
          </div>

          <div className="flex justify-end">
            <Button onClick={logout} variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
