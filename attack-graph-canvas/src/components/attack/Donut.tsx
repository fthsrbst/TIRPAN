interface DonutProps {
  value: number;
  max: number;
  label: string;
  sublabel?: string;
  color?: string;
}

export const Donut = ({ value, max, label, sublabel, color = "hsl(var(--accent))" }: DonutProps) => {
  const pct = Math.min(value / max, 1);
  const r = 28;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-20 h-20">
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
        <circle cx="32" cy="32" r={r} stroke="hsl(var(--muted))" strokeWidth="6" fill="none" />
        <circle
          cx="32" cy="32" r={r}
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold text-lg leading-none">{label}</span>
        {sublabel && <span className="text-[9px] text-muted-foreground mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
};
