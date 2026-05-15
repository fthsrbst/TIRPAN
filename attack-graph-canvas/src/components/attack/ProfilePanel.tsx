import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Save, Lock, Loader2, LogOut } from "lucide-react";
import { api, useAuth } from "@/lib/utils";

const ROLE_COLORS: Record<string, string> = {
  owner:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  admin:   "bg-violet-500/15 text-violet-400 border-violet-500/30",
  analyst: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  viewer:  "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

interface ProfilePanelProps {
  open: boolean;
  onClose: () => void;
}

export function ProfilePanel({ open, onClose }: ProfilePanelProps) {
  const { user, isLoggedIn, logout } = useAuth();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
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

  const saveProfile = async () => {
    if (!profileName && !profileEmail) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (profileName) body.full_name = profileName;
      if (profileEmail) body.email = profileEmail;
      const res = await api.put<{ token?: string; user?: Record<string, unknown> }>("/auth/me", body);
      if (res.user) {
        const stored = JSON.parse(localStorage.getItem("tirpan_user") || "{}");
        const updated = { ...stored, ...res.user };
        localStorage.setItem("tirpan_user", JSON.stringify(updated));
      }
      setProfileName("");
      setProfileEmail("");
      flash("ok", "Profile updated");
    } catch (e: unknown) {
      flash("err", (e as Error).message || "Failed to update profile");
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
    setSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      flash("ok", "Password changed");
    } catch (e: unknown) {
      flash("err", (e as Error).message || "Failed to change password");
    }
    setSaving(false);
  };

  const initials = (user?.full_name || "U")[0].toUpperCase();
  const roleColor = ROLE_COLORS[user?.role || ""] || "";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="left" className="w-80 p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/50">
          <SheetTitle className="font-display text-base">Profile</SheetTitle>
        </SheetHeader>

        {!isLoggedIn ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-muted-foreground">
            <Lock className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Sign in to view your profile</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Avatar + info */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border/50">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display font-bold text-lg shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold truncate">{user?.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${roleColor}`}>
                  {user?.role_label || user?.role}
                </span>
              </div>
            </div>

            {msg && (
              <div className={`px-3 py-2.5 rounded-lg text-sm border ${
                msg.type === "ok"
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-destructive/10 text-destructive border-destructive/20"
              }`}>
                {msg.text}
              </div>
            )}

            {/* Edit profile */}
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Edit Profile</p>
              <div className="space-y-2">
                <Label className="text-xs">Full Name</Label>
                <Input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder={user?.full_name || "Full name"}
                  autoComplete="off"
                  name="profile-fullname"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Email</Label>
                <Input
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  placeholder={user?.email || "Email"}
                  type="email"
                  autoComplete="off"
                  name="profile-email"
                />
              </div>
              <Button
                onClick={saveProfile}
                disabled={saving || (!profileName && !profileEmail)}
                size="sm"
                className="gap-2 w-full"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Profile
              </Button>
            </div>

            <Separator />

            {/* Change password */}
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Change Password</p>
              <div className="space-y-2">
                <Label className="text-xs">Current Password</Label>
                <div className="relative">
                  <Input
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    type={showCurrentPw ? "text" : "password"}
                    placeholder="Current password"
                    autoComplete="current-password"
                    name="profile-cur-pw"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">New Password</Label>
                <div className="relative">
                  <Input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    type={showNewPw ? "text" : "password"}
                    placeholder="New password"
                    autoComplete="new-password"
                    name="profile-new-pw"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Confirm Password</Label>
                <div className="relative">
                  <Input
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    type={showConfirmPw ? "text" : "password"}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    name="profile-confirm-pw"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                onClick={changePassword}
                disabled={saving}
                variant="outline"
                size="sm"
                className="gap-2 w-full"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                Change Password
              </Button>
            </div>

            <Separator />

            <Button
              onClick={logout}
              variant="ghost"
              size="sm"
              className="gap-2 w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
