import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  /** Optional call-to-action rendered below the hint. */
  action?: React.ReactNode;
  className?: string;
  /** Compact variant for tight spaces (e.g. table cells). */
  compact?: boolean;
}

/** Consistent empty / no-data placeholder used across list and dashboard views. */
export function EmptyState({ icon: Icon, title, hint, action, className = "", compact = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "py-6 gap-1.5" : "py-12 gap-2"} ${className}`}
    >
      <div
        className={`rounded-2xl bg-muted/40 flex items-center justify-center ${compact ? "w-10 h-10" : "w-14 h-14"}`}
      >
        <Icon className={`text-muted-foreground/50 ${compact ? "w-5 h-5" : "w-7 h-7"}`} />
      </div>
      <p className={`font-medium text-foreground/80 ${compact ? "text-xs" : "text-sm"}`}>{title}</p>
      {hint && <p className="text-[11px] text-muted-foreground max-w-[280px]">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
