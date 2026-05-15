import { X } from "lucide-react";
import { Sidebar } from "@/components/attack/Sidebar";
import { TopTabs } from "@/components/attack/TopTabs";
import { AttackGraph } from "@/components/attack/AttackGraph";
import { InsightsPanel } from "@/components/attack/InsightsPanel";
import { Timeline } from "@/components/attack/Timeline";
import { useSessionBundle } from "@/hooks/useAttackGraphData";

const Index = () => {
  const bundle = useSessionBundle();

  return (
    <main className="h-screen w-screen bg-surface flex flex-col overflow-hidden p-3 gap-3">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <button className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-display font-bold text-2xl tracking-tight leading-none">Attack Graph</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {bundle.graph.isRunning ? `Live · ${bundle.graph.target}` : "Autonomous pentest path visualization"}
            </p>
          </div>
        </div>
        <TopTabs />
      </header>

      {/* Body */}
      <div className="flex-1 flex gap-3 min-h-0">
        <div className="shrink-0 self-start"><Sidebar /></div>
        <div className="flex-1 min-w-0 bg-card/40 rounded-3xl border border-border/50 overflow-hidden">
          <AttackGraph data={bundle.dynamicGraph} />
        </div>
        <div className="shrink-0 overflow-y-auto"><InsightsPanel data={bundle.insights} details={bundle.details} sessionId={bundle.sessionId} /></div>
      </div>

      {/* Footer */}
      <div className="shrink-0">
        <Timeline data={bundle.timeline} sessionId={bundle.graph.sessionId} />
      </div>
    </main>
  );
};

export default Index;
