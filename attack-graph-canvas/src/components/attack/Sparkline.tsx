interface SparklineProps {
  data: number[];
  color?: string;
  fill?: boolean;
  height?: number;
}

export const Sparkline = ({ data, color = "hsl(var(--accent))", fill = false, height = 40 }: SparklineProps) => {
  const w = 100, h = height;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`);
  const path = `M${pts.join(" L")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      {fill && (
        <path d={`${path} L${w},${h} L0,${h} Z`} fill={color} opacity="0.15" />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};
