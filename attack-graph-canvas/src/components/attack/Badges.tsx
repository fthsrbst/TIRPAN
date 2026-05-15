export const StartBadge = ({ label = "START" }: { label?: string }) => (
  <div className="flex items-center gap-2">
    <div className="relative w-10 h-10 rounded-full bg-accent flex items-center justify-center animate-pulse-glow">
      <div className="w-2 h-2 rounded-full bg-foreground" />
      <div className="absolute inset-0 rounded-full border-2 border-foreground/80" style={{ clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%,0 45%,45% 45%,45% 55%,55% 55%,55% 45%,100% 45%,100% 55%,0 55%)" }} />
    </div>
    <span className="font-display font-bold text-sm tracking-wider">{label}</span>
  </div>
);

export const CheckBadge = () => (
  <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center">
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  </div>
);
