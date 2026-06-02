import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { getSessions } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { usePermissions } from "@/lib/permissions";
import { useAuth } from "@/lib/utils";
import { useTheme } from "@/components/attack/ThemeToggle";
import { sessionDisplayLabel } from "@/lib/sessionDisplay";
import { COMMAND_PALETTE_EVENT } from "@/lib/commandPalette";
import {
  Crosshair, GitBranch, Users, Server, AlertCircle, Key, Bug, ListTodo,
  FileText, Settings, Terminal, CalendarClock, Grid3x3, Plus, Sun, Moon, X, Radio,
  Activity, Workflow, ScrollText, Brain, User, Link2, RefreshCw,
  Cpu, Shield, Network, Zap, LogOut, Clock,
} from "lucide-react";

type Nav = { icon: any; label: string; to: string; show: boolean; shortcut?: string };

const SETTINGS_TABS: { id: string; label: string; icon: any }[] = [
  { id: "llm", label: "LLM Provider", icon: Cpu },
  { id: "safety", label: "Safety", icon: Shield },
  { id: "msf", label: "Metasploit", icon: Bug },
  { id: "nmap", label: "Nmap", icon: Network },
  { id: "credentials", label: "Credentials", icon: Key },
  { id: "scan-profiles", label: "Scan Profiles", icon: Zap },
  { id: "agent-models", label: "Agent Models", icon: Brain },
  { id: "ml-models", label: "ML Models", icon: Cpu },
];

// Global "g then x" quick-nav sequences.
const GO_SHORTCUTS: Record<string, string> = {
  d: "/", m: "/missions", a: "/attack-graph", h: "/hosts",
  f: "/findings", r: "/reports", t: "/terminal", s: "/settings",
};

/**
 * Global ⌘K / Ctrl+K command palette: jump between pages, switch the active
 * session, and fire common actions. Mounted once at the app root.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { selectedSessionId, setSelectedSessionId } = useSessionContext();
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("tirpan_recent_pages") || "[]"); } catch { return []; }
  });
  const [search, setSearch] = useState("");

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: open ? 5000 : false,
    enabled: open,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Open from anywhere via the global event (search button, dock shortcut, …)
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen);
  }, []);

  // Reset the query each time the palette closes.
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  // Track recently visited pages (for the "Recent" group).
  useEffect(() => {
    setRecent((prev) => {
      const next = [location.pathname, ...prev.filter((p) => p !== location.pathname)].slice(0, 6);
      try { localStorage.setItem("tirpan_recent_pages", JSON.stringify(next)); } catch {}
      return next;
    });
  }, [location.pathname]);

  // "g then x" quick navigation (g d → Dashboard, g h → Hosts, …).
  useEffect(() => {
    let lastG = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const now = Date.now();
      if (e.key === "g" || e.key === "G") { lastG = now; return; }
      const to = now - lastG < 1200 ? GO_SHORTCUTS[e.key.toLowerCase()] : undefined;
      lastG = 0;
      if (to) { e.preventDefault(); navigate(to); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate]);

  const run = (fn: () => void) => {
    setOpen(false);
    // Defer so the dialog close animation doesn't swallow navigation focus.
    setTimeout(fn, 0);
  };

  const nav: Nav[] = [
    { icon: Crosshair, label: "Dashboard", to: "/", show: true },
    { icon: ListTodo, label: "Missions", to: "/missions", show: true },
    { icon: GitBranch, label: "Attack Graph", to: "/attack-graph", show: true },
    { icon: Grid3x3, label: "ATT&CK Matrix", to: "/attack-matrix", show: true },
    { icon: Users, label: "Agents", to: "/agents", show: perms.isAnalyst },
    { icon: Server, label: "Hosts", to: "/hosts", show: true },
    { icon: AlertCircle, label: "Findings", to: "/findings", show: true },
    { icon: Key, label: "Credentials", to: "/credentials", show: perms.canViewCredentials },
    { icon: Bug, label: "Exploits", to: "/exploits", show: perms.isAnalyst },
    { icon: Workflow, label: "Agent Flow", to: "/agent-flow", show: perms.isAnalyst },
    { icon: ScrollText, label: "Expert Log", to: "/expert-log", show: true },
    { icon: FileText, label: "Reports", to: "/reports", show: true },
    { icon: CalendarClock, label: "Scheduled Scans", to: "/scheduled-scans", show: true },
    { icon: Terminal, label: "Terminal", to: "/terminal", show: perms.canUseTerminal },
    { icon: Users, label: "Team", to: "/team", show: perms.canViewTeam },
    { icon: User, label: "Profile", to: "/profile", show: true },
    { icon: Settings, label: "Settings", to: "/settings", show: true },
  ].filter((n) => n.show);

  const recentNav = recent
    .filter((p) => p !== location.pathname)
    .map((p) => nav.find((n) => n.to === p))
    .filter((n): n is Nav => !!n)
    .slice(0, 4);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, sessions, actions…" onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {!search && recentNav.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentNav.map((n) => (
                <CommandItem key={`recent-${n.to}`} value={`recent ${n.label}`} onSelect={() => run(() => navigate(n.to))}>
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                  {n.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navigation">
          {nav.map((n) => (
            <CommandItem key={n.to} value={`go ${n.label}`} onSelect={() => run(() => navigate(n.to))}>
              <n.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {sessions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch session">
              {selectedSessionId && (
                <CommandItem value="clear session selection" onSelect={() => run(() => setSelectedSessionId(null))}>
                  <X className="mr-2 h-4 w-4 text-muted-foreground" />
                  Clear active session
                </CommandItem>
              )}
              {(sessions as any[]).slice(0, 12).map((s: any) => {
                const running = s.is_running || s.status === "running";
                return (
                  <CommandItem
                    key={s.id}
                    value={`session ${sessionDisplayLabel(s)} ${s.target || ""} ${s.id}`}
                    onSelect={() => run(() => { setSelectedSessionId(s.id); navigate("/"); })}
                  >
                    <Radio className={`mr-2 h-4 w-4 ${running ? "text-success" : "text-muted-foreground"}`} />
                    <span className="truncate">{sessionDisplayLabel(s) || s.target || s.id}</span>
                    {running && <CommandShortcut className="text-success">live</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Actions">
          {perms.canCreateMission && (
            <CommandItem value="new mission scan" onSelect={() => run(() => navigate("/missions/new"))}>
              <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
              New Mission
            </CommandItem>
          )}
          <CommandItem value="schedule scan recurring" onSelect={() => run(() => navigate("/scheduled-scans"))}>
            <CalendarClock className="mr-2 h-4 w-4 text-muted-foreground" />
            Schedule a scan
          </CommandItem>
          <CommandItem value="refresh reload data sessions" onSelect={() => run(() => { queryClient.invalidateQueries(); toast.success("Data refreshed"); })}>
            <RefreshCw className="mr-2 h-4 w-4 text-muted-foreground" />
            Refresh data
          </CommandItem>
          <CommandItem value="copy page link url share" onSelect={() => run(async () => {
            try { await navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }
            catch { toast.error("Couldn't copy link"); }
          })}>
            <Link2 className="mr-2 h-4 w-4 text-muted-foreground" />
            Copy page link
          </CommandItem>
          <CommandItem value="toggle theme dark light mode" onSelect={() => run(toggle)}>
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4 text-muted-foreground" /> : <Moon className="mr-2 h-4 w-4 text-muted-foreground" />}
            Switch to {theme === "dark" ? "light" : "dark"} mode
          </CommandItem>
          <CommandItem value="logout sign out exit" onSelect={() => run(() => { logout(); navigate("/login"); })}>
            <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
            Log out
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Settings">
          {SETTINGS_TABS.map((t) => (
            <CommandItem
              key={t.id}
              value={`settings ${t.label}`}
              onSelect={() => run(() => navigate("/settings", { state: { tab: t.id } }))}
            >
              <t.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              Settings · {t.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>

      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1"><kbd className="font-mono px-1 py-0.5 rounded bg-muted border border-border/50">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="font-mono px-1 py-0.5 rounded bg-muted border border-border/50">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="font-mono px-1 py-0.5 rounded bg-muted border border-border/50">esc</kbd> close</span>
        </span>
        <span className="flex items-center gap-1"><kbd className="font-mono px-1 py-0.5 rounded bg-muted border border-border/50">⌘K</kbd> toggle</span>
      </div>
    </CommandDialog>
  );
}
