/**
 * Kullanıcıya gösterilen görev başlığı: DB'deki `name`, sonra `mission_name`, en son tarama hedefi.
 */
export function sessionDisplayLabel(s: { name?: string; mission_name?: string; target?: string; id?: string } | null | undefined): string {
  if (!s) return "";
  const label = ((s.name ?? s.mission_name) || "").trim();
  if (label) return label;
  const t = (s.target || "").trim();
  if (t) return t;
  const id = s.id || "";
  return id ? id.slice(0, 12) : "";
}
