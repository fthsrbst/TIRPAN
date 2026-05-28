import { useState, useEffect, useRef } from "react";
import { useLocation, NavLink } from "react-router-dom";
import { Crosshair, Terminal, Settings, ListTodo, FileText, ScrollText, Users, User, CalendarClock, Bell, X, CheckCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/lib/permissions";
import { useAuth } from "@/lib/utils";
import { ProfilePanel } from "./ProfilePanel";

const SCHED_KEY  = "tirpan_scheduled_missions";
const NOTIF_KEY  = "tirpan_notifications";

type Notif = { id: string; type: "approaching" | "launched" | "failed"; title: string; body: string; at: string; read: boolean };

function useNotifications() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const load = () => {
    try { setNotifs(JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]")); } catch { setNotifs([]); }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    window.addEventListener("storage", load);
    window.addEventListener("tirpan-notif", load);
    return () => { clearInterval(t); window.removeEventListener("storage", load); window.removeEventListener("tirpan-notif", load); };
  }, []);
  const markAllRead = () => {
    try {
      const arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]").map((n: Notif) => ({ ...n, read: true }));
      localStorage.setItem(NOTIF_KEY, JSON.stringify(arr));
      setNotifs(arr);
    } catch { /* ignore */ }
  };
  const dismiss = (id: string) => {
    try {
      const arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]").filter((n: Notif) => n.id !== id);
      localStorage.setItem(NOTIF_KEY, JSON.stringify(arr));
      setNotifs(arr);
    } catch { /* ignore */ }
  };
  const clearAll = () => {
    localStorage.removeItem(NOTIF_KEY);
    setNotifs([]);
  };
  return { notifs, unreadCount: notifs.filter(n => !n.read).length, markAllRead, dismiss, clearAll };
}

export const Sidebar = () => {
  const location = useLocation();
  const perms = usePermissions();
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [schedCount, setSchedCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const { notifs, unreadCount, markAllRead, dismiss, clearAll } = useNotifications();

  // Close bell panel when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Watch localStorage for pending schedules count
  useEffect(() => {
    const update = () => {
      try {
        const arr = JSON.parse(localStorage.getItem(SCHED_KEY) || "[]");
        setSchedCount(Array.isArray(arr) ? arr.length : 0);
      } catch { setSchedCount(0); }
    };
    update();
    const t = setInterval(update, 10_000);
    window.addEventListener("storage", update);
    return () => { clearInterval(t); window.removeEventListener("storage", update); };
  }, []);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const items = [
    { icon: Crosshair,     to: "/",                 label: "Dashboard",        show: true },
    { icon: ListTodo,      to: "/missions",          label: "Missions",         show: true },
    { icon: CalendarClock, to: "/scheduled-scans",   label: "Scheduled Scans",  show: true, badge: schedCount },
    { icon: Terminal,      to: "/terminal",          label: "Terminal",         show: perms.canUseTerminal },
    { icon: ScrollText,    to: "/expert-log",        label: "Expert Log",       show: perms.canUseTerminal },
    { icon: FileText,      to: "/reports",           label: "Reports",          show: true },
    { icon: Users,         to: "/team",              label: "Team",             show: perms.canViewTeam },
    { icon: Settings,      to: "/settings",          label: "Settings",         show: true },
  ].filter((i) => i.show);

  const activeIndex = items.findIndex((item) => isActive(item.to));
  // py-4 = 16px top padding, each item is h-11 (44px) + gap-1 (4px) = 48px per slot
  const pillTop = 16 + Math.max(0, activeIndex) * 48;

  const initials = (user?.full_name || "U")[0].toUpperCase();

  return (
    <>
      <aside className="relative flex flex-col items-center gap-1 py-4 px-2 bg-card rounded-full shadow-[var(--shadow-card)] border border-border/50">
        {/* Sliding active pill */}
        {activeIndex >= 0 && (
          <div
            aria-hidden
            className="absolute w-11 h-11 rounded-full bg-primary pointer-events-none"
            style={{
              top: pillTop,
              left: "50%",
              transform: "translateX(-50%)",
              transition: "top 300ms cubic-bezier(0.4, 0, 0.2, 1)",
              zIndex: 0,
            }}
          />
        )}
        <TooltipProvider delayDuration={300}>
          {items.map((Item) => {
            const active = isActive(Item.to);
            const badge = (Item as { badge?: number }).badge ?? 0;
            return (
              <Tooltip key={Item.label}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={Item.to}
                    end={Item.to === "/"}
                    className={`relative z-10 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                      active
                        ? "text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Item.icon className="w-5 h-5" />
                    {badge > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center z-20 border-2 border-card">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  <p className="text-xs font-medium">{Item.label}</p>
                  {badge > 0 && <p className="text-[10px] text-muted-foreground">{badge} pending</p>}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Bell notification button */}
          <div className="mt-auto pt-2 relative" ref={bellRef}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setBellOpen(v => !v); if (!bellOpen) markAllRead(); }}
                  className="relative w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center z-20 border-2 border-card">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                <p className="text-xs font-medium">Notifications</p>
                {unreadCount > 0 && <p className="text-[10px] text-muted-foreground">{unreadCount} unread</p>}
              </TooltipContent>
            </Tooltip>

            {/* Notification panel */}
            {bellOpen && (
              <div className="absolute left-14 bottom-0 w-80 z-50 rounded-lg border border-border bg-card shadow-2xl overflow-hidden" style={{ minHeight: "120px", maxHeight: "480px", display: "flex", flexDirection: "column" }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Notifications</span>
                    {notifs.length > 0 && <span className="text-[10px] text-muted-foreground">({notifs.length})</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {notifs.length > 0 && (
                      <button onClick={clearAll} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Clear all">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {notifs.some(n => !n.read) && (
                      <button onClick={markAllRead} className="p-1 text-muted-foreground hover:text-primary transition-colors" title="Mark all read">
                        <CheckCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Notification list */}
                <div className="overflow-y-auto flex-1">
                  {notifs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                      <Bell className="w-8 h-8 opacity-20" />
                      <p className="text-xs">No notifications yet</p>
                    </div>
                  ) : (
                    notifs.map(n => {
                      const iconColor = n.type === "launched" ? "text-green-400" : n.type === "failed" ? "text-destructive" : "text-primary";
                      const bg = n.read ? "" : "bg-primary/5";
                      const timeAgo = (() => {
                        const ms = Date.now() - new Date(n.at).getTime();
                        if (ms < 60_000) return "just now";
                        if (ms < 3_600_000) return `${Math.floor(ms/60_000)}m ago`;
                        return `${Math.floor(ms/3_600_000)}h ago`;
                      })();
                      return (
                        <div key={n.id} className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors group ${bg}`}>
                          <Bell className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold leading-tight">{n.title}</p>
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{n.body}</p>
                            <p className="text-[9px] text-muted-foreground/60 mt-1 font-mono">{timeAgo}</p>
                          </div>
                          <button onClick={() => dismiss(n.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-foreground shrink-0">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile button */}
          <div className="pt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setProfileOpen(true)}
                  className="w-11 h-11 rounded-full flex items-center justify-center bg-primary/15 text-primary hover:bg-primary/25 transition-colors font-display font-bold text-sm"
                >
                  {user ? initials : <User className="w-4 h-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                <p className="text-xs font-medium">{user?.full_name || "Profile"}</p>
                <p className="text-[10px] text-muted-foreground">{user?.email}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </aside>

      <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
};
