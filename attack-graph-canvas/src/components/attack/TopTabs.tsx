import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { GitBranch, Users, Server, AlertCircle, Key, Bug, Grid3x3, Plus, X, Cpu, ChevronDown, Check, RefreshCw, Radio, Search } from "lucide-react";
import { useSessionContext } from "@/lib/SessionContext";
import { sessionDisplayLabel } from "@/lib/sessionDisplay";
import { ThemeToggle } from "@/components/attack/ThemeToggle";
import { openCommandPalette } from "@/lib/commandPalette";
import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";

// Tüm sekmeler — her birinde hangi minimum rol gerektiği belirtilmiş
// requireMin: bu seviye veya üstü görebilir
const ALL_TABS = [
  { icon: GitBranch, label: "Atk Graph",   to: "/attack-graph", requireMin: "viewer"  },
  { icon: Radio,     label: "Agent Flow",   to: "/agent-flow",   requireMin: "analyst" },
  { icon: Users,     label: "Agents",       to: "/agents",       requireMin: "analyst" },
  { icon: Server,    label: "Hosts",        to: "/hosts",        requireMin: "viewer"  },
  { icon: AlertCircle,label:"Findings",    to: "/findings",     requireMin: "viewer"  },
  { icon: Key,       label: "Credentials", to: "/credentials",  requireMin: "analyst" },
  { icon: Bug,       label: "Exploits",    to: "/exploits",     requireMin: "analyst" },
  { icon: Grid3x3,   label: "ATT&CK",      to: "/attack-matrix", requireMin: "viewer"  },
];

interface ModelEntry { provider: string; label: string; model: string; }

export function ModelSelector({ onModelChange }: { onModelChange?: (provider: string, model: string) => void } = {}) {
  const [open, setOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState("ollama");
  const [activeModel, setActiveModel] = useState("");
  const [allModels, setAllModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 336 });

  const loadData = async () => {
    setLoading(true);
    try {
      const settings = await api.get<Record<string, string>>("/settings").catch(() => ({}));
      const prov = (settings as any).active_provider || "ollama";
      const mod = (settings as any).ollama_model || (settings as any).cloud_model || "";
      setActiveProvider(prov);
      setActiveModel(mod);
      onModelChange?.(prov, mod);

      const entries: ModelEntry[] = [];
      const [oll, lms, orr, ocg] = await Promise.allSettled([
        api.get<{ online: boolean; models: string[]; current: string }>("/ollama/status"),
        api.get<{ online: boolean; models: string[]; current: string }>("/lmstudio/status"),
        api.get<{ models: string[]; api_key: string; cloud_model: string }>("/config/openrouter"),
        api.get<{ models: string[]; api_key: string; model: string }>("/config/opencode-go"),
      ]);
      if (oll.status === "fulfilled" && oll.value.online) {
        (oll.value.models || []).forEach((m) => entries.push({ provider: "ollama", label: "Ollama", model: m }));
        if (!mod && oll.value.current) { setActiveModel(oll.value.current); }
      }
      if (lms.status === "fulfilled" && lms.value.online) {
        (lms.value.models || []).forEach((m) => entries.push({ provider: "lmstudio", label: "LM Studio", model: m }));
      }
      if (orr.status === "fulfilled" && (orr.value as any).api_key) {
        // Load OR models if key exists
        const orModels = await api.get<{ models: string[] }>("/openrouter/models").catch(() => ({ models: [] }));
        (orModels.models || []).forEach((m) => entries.push({ provider: "openrouter", label: "OpenRouter", model: m }));
      }
      if (ocg.status === "fulfilled" && (ocg.value as any).api_key) {
        const ocgModels = await api.get<{ models: string[] }>("/opencode-go/models").catch(() => ({ models: [] }));
        (ocgModels.models || []).forEach((m) => entries.push({ provider: "opencode_go", label: "OpenCode Go", model: m }));
      }
      setAllModels(entries);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!open || !triggerRef.current) return;
    const br = triggerRef.current.getBoundingClientRect();
    const width = 336;
    let left = Math.round(br.right - width);
    const margin = 10;
    if (left < margin) left = margin;
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin);
    }
    let top = Math.round(br.bottom + 8);
    const maxH = 360;
    if (top + maxH > window.innerHeight - margin) {
      top = Math.max(margin, Math.round(br.top - maxH - 8));
    }
    if (top < margin) top = margin;
    setMenuPos({ top, left, width });
  }, [open]);

  useLayoutEffect(() => {
    updateMenuPosition();
  }, [open, updateMenuPosition, loading, allModels.length]);

  useEffect(() => {
    if (!open) return;
    const onRelayout = () => updateMenuPosition();
    window.addEventListener("resize", onRelayout);
    window.addEventListener("scroll", onRelayout, true);
    return () => {
      window.removeEventListener("resize", onRelayout);
      window.removeEventListener("scroll", onRelayout, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);


  const selectModel = async (entry: ModelEntry) => {
    setActiveProvider(entry.provider);
    setActiveModel(entry.model);
    setOpen(false);
    onModelChange?.(entry.provider, entry.model);
    try {
      await api.put("/settings/active_provider", { value: entry.provider });
      if (entry.provider === "ollama") {
        await api.post("/config/ollama", { model: entry.model });
      } else if (entry.provider === "lmstudio") {
        await api.post("/config/lmstudio", { model: entry.model });
      } else if (entry.provider === "openrouter") {
        await api.post("/config/openrouter", { cloud_model: entry.model });
      } else if (entry.provider === "opencode_go") {
        await api.post("/config/opencode-go", { model: entry.model });
      }
    } catch {}
  };

  const providerColor: Record<string, string> = {
    ollama: "text-success", lmstudio: "text-accent", openrouter: "text-warning", opencode_go: "text-primary",
  };

  const displayModel = activeModel ? (activeModel.length > 22 ? activeModel.slice(0, 20) + "…" : activeModel) : "—";

  const providerShort =
    activeProvider === "opencode_go" ? "OCG"
    : activeProvider === "openrouter" ? "OR"
    : activeProvider?.slice(0, 3).toUpperCase() || "—";

  const menuContent = (
    <div
      ref={menuRef}
      className="bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm"
      style={{
        position: "fixed",
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
        zIndex: 400,
        maxHeight: "min(360px, calc(100vh - 24px))",
      }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 bg-muted/20">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Select model</span>
        <button type="button" onClick={loadData} disabled={loading} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="max-h-[300px] overflow-y-auto overscroll-contain">
        {allModels.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {loading ? "Loading…" : "No models found. Is Ollama or LM Studio running?"}
          </div>
        ) : (
          (() => {
            const providers = [...new Set(allModels.map((m) => m.provider))];
            return providers.map((prov) => (
              <div key={prov}>
                <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-muted-foreground font-bold bg-muted/35 border-b border-border/30 sticky top-0 z-[1]">
                  {allModels.find((m) => m.provider === prov)?.label || prov}
                </div>
                {allModels.filter((m) => m.provider === prov).map((entry) => {
                  const isActive = entry.provider === activeProvider && entry.model === activeModel;
                  return (
                    <button
                      type="button"
                      key={`${entry.provider}:${entry.model}`}
                      onClick={() => selectModel(entry)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-muted/60 transition-colors border-b border-border/15 last:border-0 ${isActive ? "bg-primary/10 text-primary" : ""}`}
                    >
                      {isActive && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      {!isActive && <span className="w-3.5 shrink-0" />}
                      <span className="font-mono truncate">{entry.model}</span>
                    </button>
                  );
                })}
              </div>
            ));
          })()
        )}
      </div>
    </div>
  );

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) loadData(); }}
        className="group flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-xl min-h-9 bg-gradient-to-b from-card to-muted/30 border border-border/60 shadow-sm hover:shadow-md hover:border-border transition-all min-w-0 max-w-[200px]"
        title={activeModel || "Select model"}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ring-2 ring-background ${providerColor[activeProvider] || "text-muted-foreground"}`}
          style={{ background: "currentColor" }}
        />
        <div className="min-w-0 flex-1 text-left leading-tight">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{providerShort}</div>
          <div className="truncate font-mono text-[11px] text-foreground">{displayModel}</div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && typeof document !== "undefined" ? createPortal(menuContent, document.body) : null}
    </div>
  );
}

export const TopTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedSessionId, setSelectedSessionId, selectedSession } = useSessionContext();
  const token = typeof window !== "undefined" ? (localStorage.getItem("tirpan_token") || sessionStorage.getItem("tirpan_token")) : null;
  const perms = usePermissions();

  // usePermissions'dan gelen role bilgisine göre sekmeleri filtrele
  const ROLE_LEVELS: Record<string, number> = { viewer: 1, analyst: 2, admin: 3, owner: 4 };
  const userLevel = ROLE_LEVELS[perms.role ?? "viewer"] ?? 1;
  const tabs = ALL_TABS.filter((t) => userLevel >= (ROLE_LEVELS[t.requireMin] ?? 1));

  const navRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pillStyle, setPillStyle] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) { setPillStyle(null); return; }
    const activeIdx = tabs.findIndex((t) =>
      t.to === "/" ? location.pathname === "/" : location.pathname.startsWith(t.to)
    );
    if (activeIdx < 0 || !tabRefs.current[activeIdx]) { setPillStyle(null); return; }
    const navRect = nav.getBoundingClientRect();
    const elRect = tabRefs.current[activeIdx]!.getBoundingClientRect();
    setPillStyle({
      top: elRect.top - navRect.top,
      left: elRect.left - navRect.left,
      width: elRect.width,
      height: elRect.height,
    });
  }, [location.pathname, tabs.length]);

  return (
    <div className="flex items-center gap-2">
      <nav ref={(el) => { navRef.current = el; }} className="relative flex items-center gap-0.5 bg-card/60 backdrop-blur rounded-full p-1 border border-border/50">
        {/* Sliding active pill */}
        {pillStyle && (
          <span
            aria-hidden
            className="absolute rounded-full bg-primary pointer-events-none"
            style={{
              top: pillStyle.top,
              left: pillStyle.left,
              width: pillStyle.width,
              height: pillStyle.height,
              transition: "left 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1), top 300ms cubic-bezier(0.4, 0, 0.2, 1)",
              zIndex: 0,
            }}
          />
        )}
        {tabs.map((t, i) => (
          <NavLink
            key={t.label}
            to={t.to}
            end={t.to === "/"}
            ref={(el: HTMLAnchorElement | null) => { tabRefs.current[i] = el; }}
            className={({ isActive }) =>
              `relative z-10 pill-tab ${isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`
            }
          >
            <t.icon className="w-4 h-4" />
            <span className="hidden md:inline">{t.label}</span>
          </NavLink>
        ))}
        {perms.canCreateMission && (
          <button
            onClick={() => navigate("/missions/new")}
            className="pill-tab text-muted-foreground hover:text-foreground"
            title="New Mission"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">New Mission</span>
          </button>
        )}

        {selectedSessionId && selectedSession && (
          <div className="flex items-center gap-1 pl-2 ml-1 border-l border-border/50">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-medium max-w-[140px]">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
              <span className="truncate">{sessionDisplayLabel(selectedSession) || selectedSessionId.slice(0, 8)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedSessionId(null); }}
                className="w-4 h-4 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted shrink-0"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        )}

        <div className="pl-1 border-l border-border/30 flex items-center gap-0.5">
          <button
            onClick={openCommandPalette}
            className="pill-tab text-muted-foreground hover:text-foreground"
            title="Search (⌘K)"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>
          <ThemeToggle />
        </div>

      </nav>
    </div>
  );
};
