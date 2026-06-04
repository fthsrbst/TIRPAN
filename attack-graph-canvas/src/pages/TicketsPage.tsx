import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { PageShell } from "@/components/attack/PageShell";
import { UserAvatar } from "@/components/attack/UserAvatar";
import { useAuth, hasMinRole } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Ticket,
  Plus,
  Send,
  ChevronLeft,
  Megaphone,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Trash2,
  Inbox,
  PenLine,
  Users as UsersIcon,
  Lock,
} from "lucide-react";
import {
  getTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  addTicketMessage,
  deleteTicketMessage,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketMsg {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string;
  author_avatar: string;
  author_role: string;
  body: string;
  created_at: number;
}

interface Participant {
  id: string;
  name: string;
  avatar: string;
  role: string;
}

interface TicketItem {
  id: string;
  org_id: string;
  title: string;
  body: string;
  status: string;
  priority: string;
  kind: string;
  created_by: string;
  created_by_name: string;
  created_by_avatar: string;
  created_by_role: string;
  assigned_to: string;
  assigned_to_name: string;
  assigned_to_avatar: string;
  created_at: number;
  updated_at: number;
  unread?: number;
  messages?: TicketMsg[];
  participants?: Participant[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; cls: string; icon: JSX.Element }> = {
  open:        { label: "Açık",    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",       icon: <Clock className="w-3 h-3" /> },
  in_progress: { label: "Devam",   cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",    icon: <Loader2 className="w-3 h-3" /> },
  resolved:    { label: "Çözüldü", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
  closed:      { label: "Kapalı",  cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",       icon: <XCircle className="w-3 h-3" /> },
};

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  low:      { label: "Düşük",  cls: "bg-zinc-500/15 text-zinc-400" },
  normal:   { label: "Normal", cls: "bg-sky-500/15 text-sky-400" },
  high:     { label: "Yüksek", cls: "bg-orange-500/15 text-orange-400" },
  critical: { label: "Kritik", cls: "bg-red-500/15 text-red-400" },
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", admin: "Admin", analyst: "Analyst", viewer: "Viewer",
};

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleString("tr-TR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function fmtRelative(ts: number) {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} gün önce`;
  return new Date(ts * 1000).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

const SCOPES = [
  { id: "all",         label: "Tümü",         icon: Inbox },
  { id: "mine",        label: "Açtıklarım",   icon: PenLine },
  { id: "assigned",    label: "Bana atanan",  icon: UsersIcon },
  { id: "announcement",label: "Duyurular",    icon: Megaphone },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const { user } = useAuth();
  const isAdmin = hasMinRole(user, "admin");
  const [searchParams, setSearchParams] = useSearchParams();

  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TicketItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [scope, setScope] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // new ticket dialog
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newKind, setNewKind] = useState("issue");
  const [newPrio, setNewPrio] = useState("normal");
  const [creating, setCreating] = useState(false);

  // reply
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = statusFilter !== "all" ? statusFilter : undefined;
      const kind = scope === "announcement" ? "announcement" : undefined;
      const sc = scope === "mine" || scope === "assigned" ? scope : undefined;
      const data = await getTickets(status, kind, sc);
      setTickets(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [scope, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Poll for new tickets/unread while the page is open.
  useEffect(() => {
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selected?.messages?.length]);

  const openTicket = useCallback(async (id: string) => {
    setDetailLoading(true);
    setSearchParams({ open: id }, { replace: true });
    try {
      const full = await getTicket(id);
      setSelected(full);
      // clear unread badge locally
      setTickets(prev => prev.map(t => t.id === id ? { ...t, unread: 0 } : t));
    } catch { /* ignore */ } finally {
      setDetailLoading(false);
    }
  }, [setSearchParams]);

  // Deep-link: open ticket from ?open=<id> (notification click).
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId && selected?.id !== openId) {
      openTicket(openId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const closeDetail = () => {
    setSelected(null);
    searchParams.delete("open");
    setSearchParams(searchParams, { replace: true });
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const created = await createTicket({
        title: newTitle.trim(), body: newBody.trim(), kind: newKind, priority: newPrio,
      });
      setShowNew(false);
      setNewTitle(""); setNewBody(""); setNewKind("issue"); setNewPrio("normal");
      await load();
      if (created?.id) openTicket(created.id);
    } catch (e: any) {
      alert(e?.message || "Oluşturulamadı");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selected) return;
    await updateTicket(selected.id, { status });
    setSelected(prev => prev ? { ...prev, status } : prev);
    setTickets(prev => prev.map(t => t.id === selected.id ? { ...t, status } : t));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bu ticket kalıcı olarak silinsin mi?")) return;
    await deleteTicket(id);
    if (selected?.id === id) closeDetail();
    setTickets(prev => prev.filter(t => t.id !== id));
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selected) return;
    setReplying(true);
    try {
      const msg = await addTicketMessage(selected.id, replyText.trim());
      setReplyText("");
      setSelected(prev => prev ? { ...prev, messages: [...(prev.messages || []), msg] } : prev);
      setTickets(prev => prev.map(t => t.id === selected.id ? { ...t, updated_at: msg.created_at } : t));
    } catch (e: any) {
      alert(e?.message || "Mesaj gönderilemedi");
    } finally {
      setReplying(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!selected) return;
    await deleteTicketMessage(selected.id, msgId);
    setSelected(prev => prev ? { ...prev, messages: (prev.messages || []).filter(m => m.id !== msgId) } : prev);
  };

  const canReply = selected && selected.status !== "closed";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageShell title="Tickets" subtitle="Takım içi mesajlaşma, sorun bildirimi ve duyurular" contentScrollable={false}>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-full overflow-hidden">

          {/* ── Left column ────────────────────────────────────────────── */}
          <div className={`flex flex-col border-r border-white/5 ${selected ? "hidden md:flex md:w-[22rem] lg:w-[26rem]" : "flex-1"}`}>

            {/* Scope tabs */}
            <div className="flex items-center gap-1 px-3 pt-3 pb-2 overflow-x-auto">
              {SCOPES.map(s => {
                const Icon = s.icon;
                const active = scope === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setScope(s.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 pb-2 border-b border-white/5">
              <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowNew(true)}>
                <Plus className="w-3.5 h-3.5" /> Yeni
              </Button>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs w-32 border-white/10 ml-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm durumlar</SelectItem>
                  <SelectItem value="open">Açık</SelectItem>
                  <SelectItem value="in_progress">Devam ediyor</SelectItem>
                  <SelectItem value="resolved">Çözüldü</SelectItem>
                  <SelectItem value="closed">Kapalı</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
                </div>
              ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                  <Ticket className="w-8 h-8 opacity-30" />
                  <span className="text-sm">Bu görünümde ticket yok</span>
                  <Button variant="outline" size="sm" className="mt-1 text-xs" onClick={() => setShowNew(true)}>
                    <Plus className="w-3 h-3 mr-1" /> Oluştur
                  </Button>
                </div>
              ) : (
                tickets.map(t => {
                  const sm = STATUS_META[t.status] || STATUS_META.open;
                  const isAnn = t.kind === "announcement";
                  const sel = selected?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => openTicket(t.id)}
                      className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.04] transition-colors ${sel ? "bg-white/[0.06]" : ""} ${isAnn ? "border-l-2 border-l-amber-500/60" : ""}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 shrink-0">
                          {isAnn
                            ? <Megaphone className="w-4 h-4 text-amber-400" />
                            : <AlertCircle className="w-4 h-4 text-sky-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm truncate ${t.unread ? "font-semibold" : "font-medium"}`}>{t.title}</span>
                            {!!t.unread && (
                              <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                                {t.unread > 9 ? "9+" : t.unread}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${sm.cls}`}>
                              {sm.icon}{sm.label}
                            </span>
                            {t.priority !== "normal" && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_META[t.priority]?.cls}`}>
                                {PRIORITY_META[t.priority]?.label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <UserAvatar name={t.created_by_name} avatar={t.created_by_avatar} role={t.created_by_role} size={18} />
                            <span className="text-[11px] text-muted-foreground truncate">{t.created_by_name}</span>
                            <span className="text-[11px] text-muted-foreground/60 ml-auto shrink-0">{fmtRelative(t.updated_at)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Right column (detail) ──────────────────────────────────── */}
          {selected ? (
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Header */}
              <div className="flex items-start gap-3 px-5 py-3 border-b border-white/5">
                <button onClick={closeDetail} className="mt-0.5 text-muted-foreground hover:text-foreground md:hidden">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.kind === "announcement"
                      ? <Megaphone className="w-4 h-4 text-amber-400 shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-sky-400 shrink-0" />}
                    <h2 className="text-sm font-semibold">{selected.title}</h2>
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${(STATUS_META[selected.status] || STATUS_META.open).cls}`}>
                      {(STATUS_META[selected.status] || STATUS_META.open).icon}
                      {(STATUS_META[selected.status] || STATUS_META.open).label}
                    </span>
                    {selected.priority !== "normal" && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_META[selected.priority]?.cls}`}>
                        {PRIORITY_META[selected.priority]?.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                    <UserAvatar name={selected.created_by_name} avatar={selected.created_by_avatar} role={selected.created_by_role} size={18} />
                    <span className="font-medium text-foreground/80">{selected.created_by_name}</span>
                    {selected.created_by_role && <span className="opacity-60">· {ROLE_LABELS[selected.created_by_role] || selected.created_by_role}</span>}
                    <span>· {fmtDate(selected.created_at)}</span>
                    {/* participants */}
                    {selected.participants && selected.participants.length > 1 && (
                      <span className="flex items-center gap-1 ml-1">
                        <span className="opacity-60">·</span>
                        <div className="flex -space-x-1.5">
                          {selected.participants.slice(0, 5).map(p => (
                            <Tooltip key={p.id}>
                              <TooltipTrigger asChild>
                                <span className="ring-1 ring-surface rounded-full">
                                  <UserAvatar name={p.name} avatar={p.avatar} role={p.role} size={18} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent><p className="text-xs">{p.name}</p></TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                        {selected.participants.length > 5 && (
                          <span className="text-[10px]">+{selected.participants.length - 5}</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && (
                    <Select value={selected.status} onValueChange={handleStatusChange}>
                      <SelectTrigger className="h-7 text-xs w-32 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Açık</SelectItem>
                        <SelectItem value="in_progress">Devam ediyor</SelectItem>
                        <SelectItem value="resolved">Çözüldü</SelectItem>
                        <SelectItem value="closed">Kapalı</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {(isAdmin || selected.created_by === user?.id) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => handleDelete(selected.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">Sil</p></TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Body + messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {selected.body && (
                  <div className={`rounded-lg border px-4 py-3 text-sm whitespace-pre-wrap ${
                    selected.kind === "announcement"
                      ? "border-amber-500/25 bg-amber-500/5"
                      : "border-white/8 bg-white/[0.03]"
                  }`}>
                    {selected.kind === "announcement" && (
                      <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold mb-2">
                        <Megaphone className="w-3.5 h-3.5" /> Duyuru
                      </div>
                    )}
                    {selected.body}
                  </div>
                )}

                {detailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
                  </div>
                ) : (selected.messages || []).length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground/70 py-6">
                    {selected.kind === "announcement"
                      ? "Bu duyuruya ilk yanıtı sen yaz."
                      : "Henüz yanıt yok. İlk mesajı yaz."}
                  </div>
                ) : (
                  (selected.messages || []).map(msg => {
                    const mine = msg.author_id === user?.id;
                    return (
                      <div key={msg.id} className={`flex gap-3 group ${mine ? "flex-row-reverse" : ""}`}>
                        <UserAvatar name={msg.author_name} avatar={msg.author_avatar} role={msg.author_role} size={30} ring />
                        <div className={`flex flex-col max-w-[72%] ${mine ? "items-end" : "items-start"}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-medium">{msg.author_name}</span>
                            {msg.author_role && (
                              <span className="text-[10px] text-muted-foreground">{ROLE_LABELS[msg.author_role] || msg.author_role}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground/60">{fmtRelative(msg.created_at)}</span>
                            {(isAdmin || mine) && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity ml-0.5"
                                title="Mesajı sil"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <div className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                            mine ? "bg-primary/20 rounded-tr-sm" : "bg-white/[0.06] rounded-tl-sm"
                          }`}>
                            {msg.body}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply box */}
              {canReply ? (
                <div className="px-4 py-3 border-t border-white/5 flex gap-2">
                  <Textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder={selected.kind === "announcement" ? "Duyuruya yanıt yaz… (Ctrl+Enter)" : "Mesaj yaz… (Ctrl+Enter ile gönder)"}
                    rows={2}
                    className="flex-1 resize-none text-sm bg-white/5 border-white/10"
                    onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); handleReply(); } }}
                  />
                  <Button
                    size="icon"
                    className="self-end h-9 w-9 shrink-0"
                    disabled={!replyText.trim() || replying}
                    onClick={handleReply}
                  >
                    {replying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              ) : (
                <div className="px-4 py-3 border-t border-white/5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Lock className="w-3.5 h-3.5" /> Bu ticket kapalı — yeni mesaj yazılamaz
                  {isAdmin && (
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => handleStatusChange("open")}>
                      Yeniden aç
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 hidden md:flex items-center justify-center text-muted-foreground flex-col gap-2">
              <Ticket className="w-10 h-10 opacity-20" />
              <span className="text-sm">Detayları görmek için bir ticket seçin</span>
            </div>
          )}
        </div>
      </TooltipProvider>

      {/* ── New ticket dialog ───────────────────────────────────────────── */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {newKind === "announcement"
                ? <Megaphone className="w-4 h-4 text-amber-400" />
                : <Ticket className="w-4 h-4" />}
              {newKind === "announcement" ? "Yeni Duyuru" : "Yeni Ticket"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {newKind === "announcement"
                ? "Duyuru organizasyondaki herkese bildirim olarak gider."
                : "Sorun bildirimi yöneticilere (üst rollere) bildirim olarak iletilir."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">Başlık</Label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Kısaca konu nedir?"
                className="bg-white/5 border-white/10"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Tür</Label>
                <Select value={newKind} onValueChange={setNewKind}>
                  <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issue">
                      <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-sky-400" /> Sorun</span>
                    </SelectItem>
                    {isAdmin && (
                      <SelectItem value="announcement">
                        <span className="flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5 text-amber-400" /> Duyuru</span>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Öncelik</Label>
                <Select value={newPrio} onValueChange={setNewPrio}>
                  <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Düşük</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Yüksek</SelectItem>
                    <SelectItem value="critical">Kritik</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Açıklama</Label>
              <Textarea
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                placeholder="Detayları buraya yaz…"
                rows={4}
                className="resize-none bg-white/5 border-white/10 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>İptal</Button>
            <Button size="sm" disabled={!newTitle.trim() || creating} onClick={handleCreate}>
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              {newKind === "announcement" ? "Duyur" : "Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
