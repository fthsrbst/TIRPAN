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
  owner:   "Organizasyonun tüm ayarlarını yönetebilir, üye ekleyip çıkarabilir.",
  admin:   "Takım yöneticisi — üye davet edebilir ve pentest oturumlarını yönetebilir.",
  analyst: "Pentest oturumları oluşturabilir, tarama ve exploit çalıştırabilir.",
  viewer:  "Tüm raporları ve bulguları görüntüleyebilir (salt-okunur).",
};

function formatExpiry(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Davet bağlantısı geçersiz.");
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/auth/invitations/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Davet bulunamadı.");
        }
        return res.json() as Promise<InvitePreview>;
      })
      .then((data) => {
        setPreview(data);
      })
      .catch((err) => {
        setError(err.message || "Davet yüklenirken bir hata oluştu.");
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
                <p className="text-sm">Davet kontrol ediliyor...</p>
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
                    <p className="font-display font-semibold text-foreground">Davet Geçersiz</p>
                    <p className="text-sm text-muted-foreground">Bu bağlantı kullanılamıyor</p>
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
                  Giriş Yap
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
                      <p className="font-display font-semibold text-foreground">Davet Aldınız!</p>
                      <p className="text-sm text-muted-foreground">Aşağıdaki organizasyona katılmak için davet edildiniz</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="font-display font-semibold text-foreground">Davet Süresi Dolmuş</p>
                      <p className="text-sm text-muted-foreground">Bu bağlantı artık geçerli değil</p>
                    </div>
                  </div>
                )}
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Org bilgisi */}
                <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Organizasyon</p>
                      <p className="font-semibold text-foreground">{preview.org_name}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Atanacak Rol</p>
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
                      Bu davet yalnızca <strong className="text-foreground">{preview.email}</strong> adresi için geçerlidir.
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground border-t border-border pt-2">
                    Son geçerlilik: <span className="text-foreground">{formatExpiry(preview.expires_at)}</span>
                  </p>
                </div>

                {!preview.is_valid && (
                  <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg px-4 py-3 text-sm">
                    Bu davet bağlantısının süresi dolmuş. Organizasyon yöneticinizden yeni bir davet göndermesini isteyin.
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col gap-2 border-t pt-4">
                {preview.is_valid ? (
                  <Button
                    className="w-full h-11 font-display font-bold"
                    onClick={handleAccept}
                  >
                    Daveti Kabul Et ve Kayıt Ol
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
                    Giriş Yap
                  </Button>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Zaten hesabınız var mı?{" "}
                  <button onClick={() => navigate("/login")} className="text-accent hover:underline">
                    Giriş yap
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
