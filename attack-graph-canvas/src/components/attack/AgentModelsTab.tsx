import { Button } from "@/components/ui/button";
import { Save, Loader2, X, Brain, Scan, Zap, Globe, Shield, Network, FileText, Eye } from "lucide-react";
import { LucideIcon } from "lucide-react";

const AGENT_LIST: { key: string; label: string; desc: string; icon: LucideIcon }[] = [
  { key: "brain",       label: "Brain",       desc: "Strategic planning & coordination",     icon: Brain   },
  { key: "scanner",     label: "Scanner",     desc: "Port and service discovery",             icon: Scan    },
  { key: "exploit",     label: "Exploit",     desc: "Vulnerability exploitation",             icon: Zap     },
  { key: "webapp",      label: "WebApp",      desc: "Web application testing",               icon: Globe   },
  { key: "postexploit", label: "Post-Exploit", desc: "Post-access actions",                    icon: Shield  },
  { key: "lateral",     label: "Lateral",     desc: "Internal movement",                     icon: Network },
  { key: "reporting",   label: "Reporting",   desc: "Report generation",                      icon: FileText},
  { key: "osint",       label: "OSINT",       desc: "Open-source intelligence",               icon: Eye     },
];

function formatModelDisplay(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (obj.model) return `${obj.provider || ""}:${obj.model}`;
    return JSON.stringify(val);
  }
  return String(val);
}

interface Props {
  agentModels: Record<string, string>;
  saving: boolean;
  onOpenPicker: (onSelect: (model: string, provider: string) => void) => void;
  onModelChange: (key: string, value: string) => void;
  onModelClear: (key: string) => void;
  onSave: () => void;
}

export default function AgentModelsTab({
  agentModels,
  saving,
  onOpenPicker,
  onModelChange,
  onModelClear,
  onSave,
}: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display font-bold text-lg tracking-tight">Agent Models</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the model used for each agent type.
        </p>
      </div>

      <div className="divide-y divide-border/40">
        {AGENT_LIST.map((agent) => {
          const Icon = agent.icon;
          const model = formatModelDisplay(agentModels[agent.key]);

          return (
            <div key={agent.key} className="py-4 flex items-center gap-4">
              {/* Icon + label */}
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>

              <div className="min-w-0 w-36 shrink-0">
                <div className="text-sm font-medium">{agent.label}</div>
                <div className="text-xs text-muted-foreground truncate">{agent.desc}</div>
              </div>

              {/* Model button — takes remaining space */}
              <button
                onClick={() =>
                  onOpenPicker((m, provider) => onModelChange(agent.key, `${provider}:${m}`))
                }
                className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-border bg-background hover:bg-muted/50 text-sm text-left truncate transition-colors"
              >
                {model ? (
                  <span className="text-foreground font-mono text-xs">{model}</span>
                ) : (
                  <span className="text-muted-foreground">Select model…</span>
                )}
              </button>

              {/* Clear button — fixed width, always visible */}
              <button
                onClick={() => onModelClear(agent.key)}
                disabled={!model}
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border border-border bg-background hover:bg-destructive/10 hover:border-destructive/40 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-20 disabled:pointer-events-none"
                title="Clear"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <Button onClick={onSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Agent Models
      </Button>
    </div>
  );
}
