import { useLocation, NavLink } from "react-router-dom";
import { Crosshair, Terminal, Settings, ListTodo, FileText, ScrollText, Users, Shield } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/lib/permissions";

export const Sidebar = () => {
  const location = useLocation();
  const perms = usePermissions();

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
    { icon: Users,      to: "/team",       label: "Takım",       show: perms.canViewTeam },
    { icon: Settings,   to: "/settings",   label: "Settings",    show: true },
  ].filter((i) => i.show);

  return (
    <aside className="flex flex-col items-center gap-1 py-4 px-2 bg-card rounded-full shadow-[var(--shadow-card)] border border-border/50">
      <TooltipProvider delayDuration={300}>
        {items.map((Item) => {
          const active = isActive(Item.to);
          return (
            <Tooltip key={Item.label}>
              <TooltipTrigger asChild>
                <NavLink
                  to={Item.to}
                  end={Item.to === "/"}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
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

        {/* Rol rozeti — alt kısımda */}
        <div className="mt-auto pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground cursor-default">
                <Shield className="w-4 h-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              <p className="text-xs font-medium capitalize">{perms.user?.role_label || perms.role}</p>
              <p className="text-[10px] text-muted-foreground">{perms.user?.email}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
};
