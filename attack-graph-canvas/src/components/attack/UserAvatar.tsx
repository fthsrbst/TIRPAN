// Role-tinted ring around the avatar so seniority is readable at a glance.
const ROLE_RING: Record<string, string> = {
  owner: "ring-2 ring-amber-500/60",
  admin: "ring-2 ring-violet-500/60",
  analyst: "ring-2 ring-blue-500/50",
  viewer: "ring-2 ring-slate-500/40",
};

function initialsOf(name?: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  const ii = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("");
  return ii || "U";
}

/**
 * User avatar: shows the uploaded photo (base64 data URL) or falls back to
 * initials. Reused in the sidebar, profile, team and agent-flow so higher-ups
 * can recognise operators by their picture.
 */
export function UserAvatar({
  name,
  avatar,
  size = 40,
  role,
  ring = false,
  className = "",
}: {
  name?: string;
  avatar?: string | null;
  size?: number;
  role?: string;
  ring?: boolean;
  className?: string;
}) {
  const ringClass = ring && role && ROLE_RING[role] ? ROLE_RING[role] : "";
  return (
    <div
      className={`relative rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-primary/15 text-primary font-display font-bold select-none ${ringClass} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}
      title={name}
    >
      {avatar ? (
        <img src={avatar} alt={name || "avatar"} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <span>{initialsOf(name)}</span>
      )}
    </div>
  );
}

export default UserAvatar;
