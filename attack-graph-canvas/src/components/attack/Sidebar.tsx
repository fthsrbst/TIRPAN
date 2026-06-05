import { useState, useEffect, useRef } from "react";
import { useLocation, NavLink, useNavigate } from "react-router-dom";
import { Crosshair, Terminal, Settings, ListTodo, FileText, ScrollText, Users, User, CalendarClock, Bell, X, CheckCheck, Ticket, Megaphone, MessageSquare, AlertCircle, LogOut } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/lib/permissions";
import { useAuth } from "@/lib/utils";
import { isDemoMode } from "@/lib/demoMode";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  clearAllNotifications,
} from "@/lib/api";
import { UserAvatar } from "./UserAvatar";

const SCHED_KEY  = "tirpan_scheduled_missions";
const NOTIF_KEY  = "tirpan_notifications";

// Unified notification shape used by the bell. Sources: "local" (scheduled-scan
// localStorage events) and "server" (team tickets/announcements via the API).
type UINotif = {
  id: string;
  source: "local" | "server";
  type: string;
  title: string;
  body: string;
  ts: number;        // epoch seconds
  read: boolean;
  link?: string;     // server notifications can deep-link to a ticket
};

function useNotifications() {
  const [local, setLocal] = useState<UINotif[]>([]);
  const [server, setServer] = useState<UINotif[]>([]);

  const loadLocal = () => {
    try {
      const arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]");
      setLocal(arr.map((n: any) => ({
        id: n.id, source: "local" as const, type: n.type || "local",
        title: n.title, body: n.body,
        ts: n.at ? new Date(n.at).getTime() / 1000 : Date.now() / 1000,
        read: !!n.read,
      })));
    } catch { setLocal([]); }
  };

  const loadServer = async () => {
    if (isDemoMode()) { setServer([]); return; }
    try {
      const res = await getNotifications(40);
      setServer((res.items || []).map((n: any) => ({
        id: n.id, source: "server" as const, type: n.type || "",
        title: n.title, body: n.body, ts: n.created_at,
        read: !!n.is_read, link: n.link,
      })));
    } catch { /* not logged in / offline — keep what we have */ }
  };

  useEffect(() => {
    loadLocal();
    loadServer();
    const t = setInterval(() => { loadLocal(); loadServer(); }, 15_000);
    window.addEventListener("storage", loadLocal);
    window.addEventListener("tirpan-notif", loadLocal);
    return () => { clearInterval(t); window.removeEventListener("storage", loadLocal); window.removeEventListener("tirpan-notif", loadLocal); };
  }, []);

  const notifs = [...server, ...local].sort((a, b) => b.ts - a.ts);

  const markAllRead = async () => {
    // local
    try {
      const arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]").map((n: any) => ({ ...n, read: true }));
      localStorage.setItem(NOTIF_KEY, JSON.stringify(arr));
    } catch { /* ignore */ }
    setLocal(prev => prev.map(n => ({ ...n, read: true })));
    setServer(prev => prev.map(n => ({ ...n, read: true })));
    if (!isDemoMode()) { try { await markAllNotificationsRead(); } catch { /* ignore */ } }
  };

  const markOneRead = async (n: UINotif) => {
    if (n.read) return;
    if (n.source === "server") {
      setServer(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      if (!isDemoMode()) { try { await markNotificationRead(n.id); } catch { /* ignore */ } }
    } else {
      try {
        const arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]").map((x: any) => x.id === n.id ? { ...x, read: true } : x);
        localStorage.setItem(NOTIF_KEY, JSON.stringify(arr));
      } catch { /* ignore */ }
      setLocal(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
  };

  const dismiss = async (n: UINotif) => {
    if (n.source === "server") {
      setServer(prev => prev.filter(x => x.id !== n.id));
      if (!isDemoMode()) { try { await deleteNotification(n.id); } catch { /* ignore */ } }
    } else {
      try {
        const arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]").filter((x: any) => x.id !== n.id);
        localStorage.setItem(NOTIF_KEY, JSON.stringify(arr));
      } catch { /* ignore */ }
      setLocal(prev => prev.filter(x => x.id !== n.id));
    }
  };

  const clearAll = async () => {
    localStorage.removeItem(NOTIF_KEY);
    setLocal([]);
    setServer([]);
    if (!isDemoMode()) { try { await clearAllNotifications(); } catch { /* ignore */ } }
  };

  return { notifs, unreadCount: notifs.filter(n => !n.read).length, markAllRead, markOneRead, dismiss, clearAll };
}

function notifIcon(type: string) {
  if (type === "announcement") return Megaphone;
  if (type === "ticket_reply") return MessageSquare;
  if (type === "ticket_new" || type === "ticket_assigned" || type === "ticket_status") return AlertCircle;
  return Bell;
}

export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const perms = usePermissions();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [schedCount, setSchedCount] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const { notifs, unreadCount, markAllRead, markOneRead, dismiss, clearAll } = useNotifications();

  const handleNotifClick = (n: typeof notifs[number]) => {
    markOneRead(n);
    if (n.link) {
      setBellOpen(false);
      navigate(n.link);
    }
  };

  // Re-read the stored user (avatar/name) when the profile changes elsewhere.
  const [, forceAuth] = useState(0);
  useEffect(() => {
    const h = () => forceAuth((v) => v + 1);
    window.addEventListener("tirpan-auth", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("tirpan-auth", h);
      window.removeEventListener("storage", h);
    };
  }, []);

  // Close bell panel when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
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
    { icon: Ticket,        to: "/tickets",           label: "Tickets",          show: true },
    { icon: Settings,      to: "/settings",          label: "Settings",         show: true },
  ].filter((i) => i.show);

  const activeIndex = items.findIndex((item) => isActive(item.to));
  // py-4 = 16px top padding, each item is h-11 (44px) + gap-1 (4px) = 48px per slot
  const pillTop = 16 + Math.max(0, activeIndex) * 48;


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
                    data-tour={Item.to === "/" ? "dashboard" : Item.to.slice(1)}
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
                  onClick={() => setBellOpen(v => !v)}
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
                      const Icon = notifIcon(n.type);
                      const iconColor =
                        n.type === "announcement" ? "text-amber-400" :
                        n.type === "ticket_reply" ? "text-sky-400" :
                        n.type === "launched" ? "text-green-400" :
                        n.type === "failed" ? "text-destructive" : "text-primary";
                      const bg = n.read ? "" : "bg-primary/5";
                      const timeAgo = (() => {
                        const ms = Date.now() - n.ts * 1000;
                        if (ms < 60_000) return "az önce";
                        if (ms < 3_600_000) return `${Math.floor(ms/60_000)} dk önce`;
                        if (ms < 86_400_000) return `${Math.floor(ms/3_600_000)} sa önce`;
                        return `${Math.floor(ms/86_400_000)} gün önce`;
                      })();
                      return (
                        <div
                          key={`${n.source}-${n.id}`}
                          onClick={() => handleNotifClick(n)}
                          className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors group ${bg} ${n.link ? "cursor-pointer" : ""}`}
                        >
                          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold leading-tight flex items-center gap-1.5">
                              {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                              <span className="truncate">{n.title}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                            <p className="text-[9px] text-muted-foreground/60 mt-1 font-mono">{timeAgo}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); dismiss(n); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-foreground shrink-0"
                          >
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
          <div className="pt-2 relative" ref={profileRef}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  className="block rounded-full hover:opacity-90 transition-opacity focus:outline-none"
                  aria-label="Profile menu"
                >
                  {user ? (
                    <UserAvatar name={user.full_name} avatar={user.avatar} role={user.role} size={44} ring />
                  ) : (
                    <span className="w-11 h-11 rounded-full flex items-center justify-center bg-primary/15 text-primary">
                      <User className="w-4 h-4" />
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                <p className="text-xs font-medium">{user?.full_name || "Profile"}</p>
                <p className="text-[10px] text-muted-foreground">{user?.email}</p>
              </TooltipContent>
            </Tooltip>

            {profileOpen && (
              <div className="absolute left-14 bottom-0 w-48 z-50 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
                <div className="px-3 py-2.5 border-b border-border/50">
                  <p className="text-xs font-semibold truncate">{user?.full_name || "User"}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => { setProfileOpen(false); navigate("/profile"); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors text-left"
                  >
                    <User className="w-4 h-4 text-muted-foreground" />
                    Profile
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); logout(); navigate("/login"); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-destructive/10 text-destructive transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </TooltipProvider>
      </aside>
    </>
  );
};
