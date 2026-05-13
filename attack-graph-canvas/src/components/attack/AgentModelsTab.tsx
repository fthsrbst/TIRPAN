import { Button } from "@/components/ui/button";
import { Save, Loader2, X, Brain, Scan, Zap, Globe, Shield, Network, FileText, Eye } from "lucide-react";
import { LucideIcon } from "lucide-react";

const AGENT_LIST: { key: string; label: string; desc: string; icon: LucideIcon }[] = [
  { key: "brain",       label: "Brain",       desc: "Stratejik planlama ve koordinasyon",     icon: Brain   },
  { key: "scanner",     label: "Scanner",     desc: "Port ve servis keşfi",                   icon: Scan    },
  { key: "exploit",     label: "Exploit",     desc: "Zafiyet istismarı",                      icon: Zap     },
  { key: "webapp",      label: "WebApp",      desc: "Web uygulama saldırıları",               icon: Globe   },
  { key: "postexploit", label: "Post-Exploit", desc: "Erişim sonrası işlemler",               icon: Shield  },
  { key: "lateral",     label: "Lateral",     desc: "Ağ içi yayılma",                        icon: Network },
  { key: "reporting",   label: "Reporting",   desc: "Rapor oluşturma",                        icon: FileText},
  { key: "osint",       label: "OSINT",       desc: "Açık kaynak istihbaratı",                icon: Eye     },
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
          Her agent tipi için kullanılacak yapay zeka modelini seçin.
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
                  <span className="text-muted-foreground">Model seçin...</span>
                )}
              </button>

              {/* Clear button — fixed width, always visible */}
              <button
                onClick={() => onModelClear(agent.key)}
                disabled={!model}
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border border-border bg-background hover:bg-destructive/10 hover:border-destructive/40 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-20 disabled:pointer-events-none"
                title="Temizle"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <Button onClick={onSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Agent Modellerini Kaydet
      </Button>
    </div>
  );
}
