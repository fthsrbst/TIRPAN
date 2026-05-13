import { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Building2, UserPlus, Loader2, CheckCircle2, AlertCircle, Link2, User } from "lucide-react";

const API_BASE = "/api/v1";

type Mode = "new-org" | "invite" | "solo";

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

export default function SignupPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Davet token'ı URL'den al (?token=xxx veya state'den)
  const searchParams = new URLSearchParams(location.search);
  const tokenFromUrl = searchParams.get("token") || (location.state as { token?: string } | null)?.token || "";

  const [mode, setMode] = useState<Mode>(tokenFromUrl ? "invite" : "new-org");
  const [inviteToken, setInviteToken] = useState(tokenFromUrl);
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/normal/";

  // Davet token'ı geldiğinde preview yükle
  useEffect(() => {
    if (mode === "invite" && inviteToken.length > 10) {
      fetchInvitePreview(inviteToken);
    } else {
      setInvitePreview(null);
      setInviteError("");
    }
  }, [inviteToken, mode]);

  // URL'de token varsa otomatik yükle
  useEffect(() => {
    if (tokenFromUrl) {
      setMode("invite");
      setInviteToken(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  const fetchInvitePreview = async (token: string) => {
    setLoadingPreview(true);
    setInviteError("");
    setInvitePreview(null);
    try {
      const res = await fetch(`${API_BASE}/auth/invitations/${token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setInviteError(data.detail || "Geçersiz davet bağlantısı");
        return;
      }
      const data: InvitePreview = await res.json();
      if (!data.is_valid) {
        setInviteError("Bu davet süresi dolmuş veya kullanılmış.");
        return;
      }
      setInvitePreview(data);
      if (data.email) setEmail(data.email);
    } catch {
      setInviteError("Davet kontrol edilirken bir hata oluştu.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    if (password.length < 8) {
      setError("Şifre en az 8 karakter olmalıdır.");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("Şifre en az bir büyük harf içermelidir.");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("Şifre en az bir rakam içermelidir.");
      return;
    }
    if (mode === "new-org" && orgName.trim().length < 2) {
      setError("Şirket adı en az 2 karakter olmalıdır.");
      return;
    }
    if (mode === "invite" && !invitePreview) {
      setError("Lütfen geçerli bir davet bağlantısı girin.");
      return;
    }
    // solo mod: ek kontrol yok

    setLoading(true);

    const body: Record<string, string> = {
      email,
      full_name: fullName,
      password,
    };
    if (mode === "new-org") body.org_name = orgName.trim();
    if (mode === "invite") body.invite_token = inviteToken;
    // solo: neither field → API gives analyst role without org

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Kayıt başarısız.");
        setLoading(false);
        return;
      }

      localStorage.setItem("tirpan_token", data.access_token);
      localStorage.setItem("tirpan_user", JSON.stringify(data.user));
      window.location.href = from === "/" ? "/" : from;
    } catch {
      setError("Sunucu bağlantısı başarısız.");
      setLoading(false);
    }
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
          <CardHeader className="pb-4">
            <CardTitle className="font-display text-xl">Kayıt Ol</CardTitle>
            <CardDescription>Hesap oluşturmak için bir yöntem seçin</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Mod seçimi — sadece token yoksa göster */}
            {!tokenFromUrl && (
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted rounded-xl">
                {[
                  { id: "new-org" as Mode, icon: Building2, label: "Şirket Kur" },
                  { id: "invite"  as Mode, icon: UserPlus,  label: "Davete Katıl" },
                  { id: "solo"    as Mode, icon: User,      label: "Bireysel" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setMode(m.id); setInvitePreview(null); setInviteError(""); }}
                    className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                      mode === m.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <m.icon className="w-4 h-4" />
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Hata mesajı */}
              {error && (
                <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-4 py-3 text-sm font-medium">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              {/* ── Davet modu ── */}
              {mode === "invite" && (
                <div className="space-y-3">
                  {/* Token girişi — sadece URL'den gelmediyse göster */}
                  {!tokenFromUrl && (
                    <div className="space-y-2">
                      <Label htmlFor="inviteToken">Davet Kodu / Bağlantısı</Label>
                      <div className="relative">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="inviteToken"
                          placeholder="Davet kodunu yapıştırın"
                          value={inviteToken}
                          onChange={(e) => setInviteToken(e.target.value.trim())}
                          className="h-11 pl-9 font-mono text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* Preview yükleniyor */}
                  {loadingPreview && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Davet kontrol ediliyor...
                    </div>
                  )}

                  {/* Preview hatası */}
                  {inviteError && (
                    <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-2.5 text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      {inviteError}
                    </div>
                  )}

                  {/* Invite preview kartı */}
                  {invitePreview && (
                    <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                        <span className="text-sm font-medium text-foreground">Davet geçerli</span>
                      </div>
                      <div className="space-y-1 pl-6">
                        <p className="text-sm text-muted-foreground">
                          Organizasyon: <span className="text-foreground font-semibold">{invitePreview.org_name}</span>
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          Rol:{" "}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_COLORS[invitePreview.role] || ""}`}>
                            {invitePreview.role_label}
                          </span>
                        </p>
                        {invitePreview.email && (
                          <p className="text-xs text-muted-foreground">
                            Bu davet yalnızca <strong>{invitePreview.email}</strong> için geçerlidir.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Solo mod açıklaması ── */}
              {mode === "solo" && (
                <div className="rounded-xl border border-border bg-muted/40 p-3 flex items-start gap-2.5">
                  <User className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Bireysel Hesap</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Bir organizasyona bağlı olmadan kişisel kullanım için hesap oluşturun.
                      <strong> Analyst</strong> rolüyle başlarsınız — pentest başlatabilirsiniz.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Yeni org modu — şirket adı ── */}
              {mode === "new-org" && (
                <div className="space-y-2">
                  <Label htmlFor="orgName">Şirket / Organizasyon Adı</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="orgName"
                      placeholder="ör. ACME Security"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required={mode === "new-org"}
                      className="h-11 pl-9"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    İlk kayıt olan kişi <strong>Owner (Süper Admin)</strong> rolünü alır.
                  </p>
                </div>
              )}

              {/* ── Ortak alanlar ── */}
              <div className="space-y-2">
                <Label htmlFor="fullName">Ad Soyad</Label>
                <Input
                  id="fullName"
                  placeholder="Ad Soyad"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-posta</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ornek@sirket.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={!!(invitePreview?.email)}
                  className="h-11"
                />
                {invitePreview?.email && (
                  <p className="text-[11px] text-muted-foreground">E-posta davet ile sabitlenmiştir.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Şifre</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="h-11"
                />
                <p className="text-[11px] text-muted-foreground">En az 8 karakter, 1 büyük harf, 1 rakam</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Şifre Tekrar</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 font-display font-bold text-sm"
                disabled={loading || (mode === "invite" && (!invitePreview || !!inviteError))}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Kayıt yapılıyor...</>
                ) : mode === "new-org" ? (
                  <><Building2 className="w-4 h-4 mr-2" /> Şirketi Kur ve Kayıt Ol</>
                ) : mode === "invite" ? (
                  <><UserPlus className="w-4 h-4 mr-2" /> Daveti Kabul Et ve Kayıt Ol</>
                ) : (
                  <><User className="w-4 h-4 mr-2" /> Bireysel Hesap Oluştur</>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Zaten hesabınız var mı?{" "}
              <Link to="/login" className="text-accent font-semibold hover:underline">
                Giriş Yap
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
