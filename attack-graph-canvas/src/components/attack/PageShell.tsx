import { ReactNode } from "react";
import { Sidebar } from "@/components/attack/Sidebar";
import { TopTabs } from "@/components/attack/TopTabs";
import { Timeline } from "@/components/attack/Timeline";
import { isDemoMode } from "@/lib/demoMode";
import { FlaskConical, X } from "lucide-react";

interface ShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  rightPanel?: ReactNode;
  leftPanel?: ReactNode;
  timeline?: ReactNode;
  /** Varsayılan true. false geçilirse içerik alanı kaydırma yerine kırpar (sabit layout sayfaları için). */
  contentScrollable?: boolean;
}

export const PageShell = ({ title, subtitle, children, rightPanel, leftPanel, timeline, contentScrollable = true }: ShellProps) => {
  const demo = isDemoMode();
  return (
  <main className="h-screen w-screen bg-surface flex flex-col overflow-hidden">
    {demo && (
      <div
        style={{
          background: "rgba(204,255,0,0.08)",
          borderBottom: "1px solid rgba(204,255,0,0.25)",
          padding: "5px 16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.08em",
          color: "#ccff00",
          flexShrink: 0,
        }}
      >
        <FlaskConical size={12} />
        <span style={{ fontWeight: 700 }}>DEMO MODE</span>
        <span style={{ color: "#667700", marginLeft: 4 }}>— All data is simulated. No real network connections are made.</span>
        <a
          href="/normal/login"
          onClick={() => { try { localStorage.removeItem("tirpan_demo"); localStorage.removeItem("tirpan_token"); localStorage.removeItem("tirpan_user"); localStorage.removeItem("tirpan_demo_started"); localStorage.removeItem("tirpan_demo_running_id"); } catch {} }}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, color: "#667700", textDecoration: "none" }}
        >
          <X size={11} /> Exit Demo
        </a>
      </div>
    )}
    <div className="flex flex-col h-full w-full max-w-[1920px] mx-auto p-3 gap-3">
      <header className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <a href="/normal/" className="shrink-0" title="TIRPAN">
            <img src="/normal/scythe.png" alt="TIRPAN" className="w-10 h-10 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </a>
          <div>
            <h1 className="font-display font-bold text-2xl tracking-tight leading-none">{title}</h1>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>
        <TopTabs />
      </header>

      <div className="flex-1 flex gap-3 min-h-0">
        <div className="shrink-0 self-start"><Sidebar /></div>
        {leftPanel && <div className="shrink-0 overflow-y-auto max-h-full scrollbar-gutter-stable">{leftPanel}</div>}
        <div
          className={`flex-1 min-w-0 min-h-0 ${contentScrollable ? "overflow-auto scrollbar-gutter-stable" : "overflow-hidden"}`}
        >
          {children}
        </div>
        {rightPanel && <div className="shrink-0 overflow-y-auto scrollbar-gutter-stable">{rightPanel}</div>}
      </div>

      <div className="shrink-0 w-full">
        {timeline ?? <Timeline />}
      </div>
    </div>
  </main>
  );
};
