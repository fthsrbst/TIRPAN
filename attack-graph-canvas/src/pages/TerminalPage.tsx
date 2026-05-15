import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/attack/PageShell";
import { LiveTerminalPanel } from "@/components/attack/LiveTerminalPanel";
import { Minimize2 } from "lucide-react";

const TerminalPage = () => {
  const navigate = useNavigate();

  const handleCollapse = () => {
    localStorage.setItem("tirpan_open_terminal_popup", "1");
    navigate(-1);
  };

  return (
    <PageShell title="Terminal" subtitle="Native PTY terminal — standalone bash shell">
      <div className="flex flex-col h-full min-h-0 gap-2">
        <div className="shrink-0 flex justify-end pt-0.5">
          <button
            type="button"
            onClick={handleCollapse}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full border border-border/50 hover:bg-muted/60"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            Collapse to panel
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <LiveTerminalPanel autoOpen={true} compact={false} />
        </div>
      </div>
    </PageShell>
  );
};

export default TerminalPage;
