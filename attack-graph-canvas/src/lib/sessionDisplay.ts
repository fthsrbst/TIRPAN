/**
 * Kullanıcıya gösterilen görev başlığı: DB'deki `name`, sonra `mission_name`.
 * Hedef IP / CIDR'ye düşmez — ad yoksa kısa UUID göster.
 */
export function sessionDisplayLabel(s: { name?: string; mission_name?: string; target?: string; id?: string } | null | undefined): string {
  if (!s) return "";
  // || so an empty-string name falls through to mission_name
  const label = ((s.name || s.mission_name) || "").trim();
  if (label) return label;
  const id = s.id || "";
  return id ? id.slice(0, 12) : "";
}
