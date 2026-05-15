import { useState } from "react";
import { useLocation, NavLink } from "react-router-dom";
import { Crosshair, Terminal, Settings, ListTodo, FileText, ScrollText, Users, User } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/lib/permissions";
import { useAuth } from "@/lib/utils";
import { ProfilePanel } from "./ProfilePanel";

export const Sidebar = () => {
  const location = useLocation();
  const perms = usePermissions();
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const items = [
    { icon: Crosshair,  to: "/",          label: "Dashboard",   show: true },
    { icon: ListTodo,   to: "/missions",   label: "Missions",    show: true },
    { icon: Terminal,   to: "/terminal",   label: "Terminal",    show: perms.canUseTerminal },
    { icon: ScrollText, to: "/expert-log", label: "Expert Log",  show: perms.canUseTerminal },
    { icon: FileText,   to: "/reports",    label: "Reports",     show: true },
    { icon: Users,      to: "/team",       label: "Team",        show: perms.canViewTeam },
    { icon: Settings,   to: "/settings",   label: "Settings",    show: true },
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
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  <p className="text-xs font-medium">{Item.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Profile button */}
          <div className="mt-auto pt-2">
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
