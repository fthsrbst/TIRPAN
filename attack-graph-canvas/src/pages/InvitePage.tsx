import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Building2, Shield, Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";

const API_BASE = "/api/v1";

interface InvitePreview {
  org_id: string;
  org_name: string;
  role: string;
  role_label: string;
  email: string;
  expires_at: number;
  is_valid: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  owner:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  admin:   "bg-violet-500/15 text-violet-400 border-violet-500/30",
  analyst: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  viewer:  "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner:   "Full control over organization settings, members, and billing.",
  admin:   "Team manager — can invite members and manage pentest sessions.",
  analyst: "Can create pentest sessions, run scans and exploits.",
  viewer:  "Read-only access to all reports and findings.",
};

function formatExpiry(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link.");
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/auth/invitations/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Invitation not found.");
        }
        return res.json() as Promise<InvitePreview>;
      })
      .then((data) => {
        setPreview(data);
      })
      .catch((err) => {
        setError(err.message || "Failed to load invitation.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = () => {
    navigate("/signup", { state: { token } });
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-[var(--shadow-elevated)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary-foreground))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2L6 14l4 0-2.5 8L18 10h-4l2.5-8z" />
            </svg>
          </div>
          <h1 className="font-display font-bold text-3xl tracking-tight">Tirpan</h1>
          <p className="text-muted-foreground text-sm mt-1">Autonomous Pentest AI</p>
        </div>

        <Card className="shadow-[var(--shadow-elevated)]">
          {loading && (
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Checking invitation...</p>
              </div>
            </CardContent>
          )}

          {!loading && error && (
            <>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="font-display font-semibold text-foreground">Invalid Invitation</p>
                    <p className="text-sm text-muted-foreground">This link cannot be used</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-4 py-3 text-sm">
                  {error}
                </div>
              </CardContent>
              <CardFooter className="border-t pt-4">
                <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
                  Sign In
                </Button>
              </CardFooter>
            </>
          )}

          {!loading && preview && (
            <>
              <CardHeader className="pb-4">
                {preview.is_valid ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="font-display font-semibold text-foreground">You've been invited!</p>
                      <p className="text-sm text-muted-foreground">You have been invited to join the following organization</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="font-display font-semibold text-foreground">Invitation Expired</p>
                      <p className="text-sm text-muted-foreground">This link is no longer valid</p>
                    </div>
                  </div>
                )}
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Organization</p>
                      <p className="font-semibold text-foreground">{preview.org_name}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Assigned Role</p>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${ROLE_COLORS[preview.role] || ""}`}>
                        {preview.role_label}
                      </span>
                      <p className="text-xs text-muted-foreground mt-2">
                        {ROLE_DESCRIPTIONS[preview.role] || ""}
                      </p>
                    </div>
                  </div>

                  {preview.email && (
                    <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-1">
                      This invitation is only valid for <strong className="text-foreground">{preview.email}</strong>.
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground border-t border-border pt-2">
                    Expires: <span className="text-foreground">{formatExpiry(preview.expires_at)}</span>
                  </p>
                </div>

                {!preview.is_valid && (
                  <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg px-4 py-3 text-sm">
                    This invitation has expired. Ask your organization admin to send a new one.
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col gap-2 border-t pt-4">
                {preview.is_valid ? (
                  <Button
                    className="w-full h-11 font-display font-bold"
                    onClick={handleAccept}
                  >
                    Accept Invitation & Sign Up
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
                    Sign In
                  </Button>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Already have an account?{" "}
                  <button onClick={() => navigate("/login")} className="text-accent hover:underline">
                    Sign in
                  </button>
                </p>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
