import { LucideIcon, Loader2 } from "lucide-react";
import { ReactNode } from "react";

type Status = "completed" | "success" | "sent" | "running" | "active" | "pending";

interface NodeCardProps {
  icon: LucideIcon | React.ComponentType<any> | React.ReactNode;
  title: string;
  subtitle?: string;
  status?: Status;
  time?: string;
  children?: ReactNode;
  className?: string;
  data?: any;
}

const statusColor: Record<Status, string> = {
  completed: "bg-success",
  success: "bg-success",
  sent: "bg-success",
  running: "bg-accent",
  active: "bg-accent",
  pending: "bg-muted-foreground",
};

const statusLabel: Record<Status, string> = {
  completed: "completed",
  success: "success",
  sent: "sent",
  running: "running",
  active: "active",
  pending: "pending",
};

export const NodeCard = ({ icon: Icon, title, subtitle, status = "completed", time, children, className = "" }: NodeCardProps) => {
  const isActive = status === "active" || status === "running";
  const isPending = status === "pending";

  const renderIcon = () => {
    if (!Icon) return null;
    if (typeof Icon === "function") {
      return <Icon className={`w-4 h-4 ${isActive ? "text-accent" : "text-foreground"}`} />;
    }
    return <span className={`w-4 h-4 ${isActive ? "text-accent" : "text-foreground"}`}>{Icon}</span>;
  };

  return (
    <div
      className={`node-card w-[230px] transition-all duration-300 ${className} ${
        isActive ? "ring-1 ring-accent/50 shadow-[0_0_20px_rgba(var(--accent),0.15)]" : ""
      } ${isPending ? "opacity-60" : "opacity-100"}`}
    >
      <div className="flex items-start gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-accent/20" : "bg-muted"}`}>
          {renderIcon()}
        </div>
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-sm leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {children}
      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
        {isActive ? (
          <Loader2 className="w-3 h-3 text-accent animate-spin" />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor[status]}`} />
        )}
        <span className="capitalize">{statusLabel[status]}</span>
        {time && <span className="ml-auto">{time}</span>}
      </div>
    </div>
  );
};
