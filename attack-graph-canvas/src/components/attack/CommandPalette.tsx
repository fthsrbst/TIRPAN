import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { useTheme } from "@/components/attack/ThemeToggle";
import { sessionDisplayLabel } from "@/lib/sessionDisplay";
import {
  Crosshair, GitBranch, Users, Server, AlertCircle, Key, Bug, ListTodo,
  FileText, Settings, Terminal, CalendarClock, Grid3x3, Plus, Sun, Moon, X, Radio,
} from "lucide-react";

type Nav = { icon: any; label: string; to: string; show: boolean };

/**
 * Global ⌘K / Ctrl+K command palette: jump between pages, switch the active
 * session, and fire common actions. Mounted once at the app root.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const perms = usePermissions();
  const { theme, toggle } = useTheme();
  const { selectedSessionId, setSelectedSessionId } = useSessionContext();

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
    { icon: FileText, label: "Reports", to: "/reports", show: true },
    { icon: CalendarClock, label: "Scheduled Scans", to: "/scheduled-scans", show: true },
    { icon: Terminal, label: "Terminal", to: "/terminal", show: perms.canUseTerminal },
    { icon: Users, label: "Team", to: "/team", show: perms.canViewTeam },
    { icon: Settings, label: "Settings", to: "/settings", show: true },
  ].filter((n) => n.show);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, sessions, actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

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
          <CommandItem value="toggle theme dark light" onSelect={() => run(toggle)}>
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4 text-muted-foreground" /> : <Moon className="mr-2 h-4 w-4 text-muted-foreground" />}
            Switch to {theme === "dark" ? "light" : "dark"} mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
