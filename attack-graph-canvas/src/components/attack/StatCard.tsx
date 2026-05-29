import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/attack/Sparkline";

export type StatAccent =
  | "primary" | "accent" | "destructive" | "warning" | "success" | "muted" | "violet";

const ICON_BG: Record<StatAccent, string> = {
  primary: "bg-primary/15 text-primary",
  accent: "bg-accent/15 text-accent",
  destructive: "bg-destructive/15 text-destructive",
  warning: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
  muted: "bg-muted text-muted-foreground",
  violet: "bg-violet-500/15 text-violet-400",
};

const VALUE_TEXT: Record<StatAccent, string> = {
  primary: "",
  accent: "text-accent",
  destructive: "text-destructive",
  warning: "text-warning",
  success: "text-success",
  muted: "",
  violet: "text-violet-400",
};

const BAR_BG: Record<StatAccent, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  destructive: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  muted: "bg-muted-foreground",
  violet: "bg-violet-500",
};

const GLOW: Record<StatAccent, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  destructive: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  muted: "bg-muted-foreground",
  violet: "bg-violet-500",
};

const SPARK_COLOR: Record<StatAccent, string> = {
  primary: "hsl(var(--primary))",
  accent: "hsl(var(--accent))",
  destructive: "hsl(var(--destructive))",
  warning: "hsl(var(--warning))",
  success: "hsl(var(--success))",
  muted: "hsl(var(--muted-foreground))",
  violet: "#a78bfa",
};

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  accent?: StatAccent;
  /** Small muted line under the value. */
  sublabel?: ReactNode;
  /** 0–100 progress bar at the bottom of the card. */
  progress?: number;
  /** Tiny trend sparkline rendered above the progress bar. */
  spark?: number[];
  /** Tooltip on hover. */
  hint?: string;
  onClick?: () => void;
  /** Highlights the card with a ring (selected state). */
  active?: boolean;
}

export const StatCard = ({
  icon: Icon,
  label,
  value,
  accent = "muted",
  sublabel,
  progress,
  spark,
  hint,
  onClick,
  active,
}: StatCardProps) => {
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      title={hint}
      className={`node-card !p-4 relative overflow-hidden text-left w-full transition-all ${
        onClick ? "cursor-pointer hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5" : ""
      } ${active ? "ring-2 ring-inset ring-primary" : ""}`}
    >
      <div
        className={`pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-[0.10] ${GLOW[accent]}`}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 truncate">
            {label}
          </div>
          <div className={`font-display font-bold text-3xl leading-none ${VALUE_TEXT[accent]}`}>
            {value}
          </div>
          {sublabel && (
            <div className="text-[10px] text-muted-foreground mt-1.5 truncate">{sublabel}</div>
          )}
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ICON_BG[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {spark && spark.length > 1 && (
        <div className="relative mt-2 -mb-1">
          <Sparkline data={spark} height={24} color={SPARK_COLOR[accent]} fill />
        </div>
      )}
      {progress != null && (
        <div className="relative mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${BAR_BG[accent]}`}
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </div>
      )}
    </Tag>
  );
};
