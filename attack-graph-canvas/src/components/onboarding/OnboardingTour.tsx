/**
 * Detailed, skippable first-run guided tour.
 *
 * Mounted once at the app root (inside the router). Opens automatically the first
 * time a logged-in user lands on a protected page (when `onboarding_done` is
 * false) and can be replayed via the `tirpan-start-tour` window event.
 *
 * Each step may navigate to a route (so the real page shows behind the dimmer)
 * and/or spotlight a sidebar item by its `data-tour` attribute. A robust 3-layer
 * overlay (click-blocker → dim/spotlight → card) guarantees the controls are
 * always clickable.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api, useAuth, updateStoredUser } from "@/lib/utils";
import { ArrowRight, ArrowLeft, X, Sparkles } from "lucide-react";

interface Step {
  title: string;
  body: string;
  route?: string;        // navigate here first so the page shows behind the dimmer
  target?: string;       // data-tour key to spotlight (sidebar item)
  tip?: string;          // small highlighted hint line
}

const STEPS: Step[] = [
  {
    title: "Welcome to TIRPAN 👋",
    body: "TIRPAN is an autonomous penetration-testing platform. This 90-second tour walks through launching missions, watching the AI agents work, reading findings, and managing cost & team. You can skip anytime and replay it later from Settings.",
  },
  {
    title: "1. Dashboard",
    body: "Your command center. Live mission stats, vulnerability severity breakdown, top targets, the real-time event feed, system resources — and your LLM cost & token totals for the month. Everything refreshes automatically.",
    route: "/",
    target: "dashboard",
    tip: "The Total Cost, Total Tokens and Avg $/Mission cards update live as agents run.",
  },
  {
    title: "2. New Mission",
    body: "This is where an engagement begins. You set the Target (an IP, CIDR like 192.168.1.0/24, or a domain), pick a Mode, choose a Speed Profile, and optionally narrow the Scope. Hit launch and the AI takes over.",
    route: "/missions/new",
    tip: "Mode: scan-only (recon only) · ask-before-exploit (you approve each exploit) · full-auto (hands-off). Speed: stealth / normal / aggressive.",
  },
  {
    title: "3. Missions",
    body: "Every engagement lives here. Each card shows status, hosts/vulns/exploits found, and the exact $ cost + tokens it consumed. Click a mission to see its model/agent cost breakdown, findings, and to pause, kill, rename or assign it.",
    route: "/missions",
    target: "missions",
    tip: "Admins can assign a mission to a teammate and limit which data categories they can see.",
  },
  {
    title: "4. Attack Graph",
    body: "A live visual map of the engagement. Nodes are discovered hosts and services; edges show how the agents pivot and chain exploits between them. It's the fastest way to understand the shape of a network and the path to compromise.",
    route: "/attack-graph",
    tip: "Click any node to drill into that host's services, vulnerabilities and opened shells.",
  },
  {
    title: "5. Agent Flow",
    body: "Watch the orchestration in real time. A Brain agent plans the engagement and spawns specialized child agents — recon, web, exploit, credential, lateral-movement — running in parallel. Agent Flow shows who is doing what, right now.",
    route: "/agent-flow",
    tip: "This is also where you see the brain's reasoning stream token-by-token as decisions are made.",
  },
  {
    title: "6. Findings & Reports",
    body: "Findings collects every vulnerability ranked by CVSS, with affected host, service and evidence. When you're done, Reports generates a clean, shareable vulnerability report for the whole engagement.",
    route: "/findings",
    tip: "Reports can be branded with your company logo from Settings.",
  },
  {
    title: "7. Cost & Budgets",
    body: "TIRPAN records the tokens and dollars of every single LLM call, attributed to its mission, model and user. The dashboard rolls this up — total spend, spend-by-model, and average cost per mission — so there are no billing surprises.",
    route: "/",
    target: "dashboard",
    tip: "Prices come from an editable table in Settings → Billing & Pricing (local models are free).",
  },
  {
    title: "8. Team, Roles & Limits",
    body: "Invite teammates and manage them here. See each member's monthly spend vs. their budget, and set per-person limits — once someone hits their cap they can't start new missions. Roles (owner / admin / analyst / viewer) control what each person can do.",
    route: "/team",
    target: "team",
    tip: "Fine-tune exactly what each role can see and do in Team → Roles & Permissions.",
  },
  {
    title: "9. Settings",
    body: "Configure LLM providers and models, model pricing, safety rules, and Metasploit/Nmap. You can also replay this tour — and the New Mission tutorial — anytime from here.",
    route: "/settings",
    target: "settings",
    tip: "Settings → LLM Provider is where you plug in your OpenRouter / Ollama / LM Studio model.",
  },
  {
    title: "You're all set 🚀",
    body: "That's the tour! Start by launching your first mission from New Mission. Need a refresher? Settings → Replay onboarding tour. Happy hunting.",
    route: "/",
  },
];

const STORAGE_KEY = "tirpan_onboarding_done";

interface Rect { top: number; left: number; width: number; height: number; }

export default function OnboardingTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ w: 360, h: 220 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Auto-open on first login (server flag is authoritative across devices).
  useEffect(() => {
    if (!user) return;
    let done = false;
    try { done = localStorage.getItem(STORAGE_KEY) === "1"; } catch { /* ignore */ }
    if (done) return;
    let cancelled = false;
    api.get<{ onboarding_done?: boolean }>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        if (me?.onboarding_done) {
          try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
        } else {
          setIndex(0);
          setOpen(true);
        }
      })
      .catch(() => { /* offline / unauth — don't force the tour */ });
    return () => { cancelled = true; };
  }, [user]);

  // Replay trigger (Settings button dispatches this).
  useEffect(() => {
    const handler = () => { setIndex(0); setOpen(true); };
    window.addEventListener("tirpan-start-tour", handler);
    return () => window.removeEventListener("tirpan-start-tour", handler);
  }, []);

  // Navigate + locate the current step's spotlight target.
  const locate = useCallback(() => {
    const step = STEPS[index];
    if (!step?.target) { setRect(null); return; }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [index]);

  useEffect(() => {
    if (!open) return;
    const step = STEPS[index];
    if (step?.route) {
      try { navigate(step.route); } catch { /* ignore */ }
    }
    // Let the destination render before measuring its sidebar anchor.
    const t = window.setTimeout(locate, step?.route ? 380 : 60);
    return () => window.clearTimeout(t);
  }, [open, index, locate, navigate]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => locate();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, locate]);

  // Measure the card so we can clamp it inside the viewport.
  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    setCardSize({ w: r.width, h: r.height });
  }, [open, index, rect]);

  // Keyboard navigation.
  const go = useCallback((delta: number) => {
    setIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)));
  }, []);

  const finish = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    updateStoredUser({ onboarding_done: true } as Record<string, unknown>);
    api.post("/auth/me/onboarding-done").catch(() => { /* best effort */ });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") { if (index < STEPS.length - 1) go(1); }
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, go, finish]);

  if (!open) return null;

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const pad = 8;
  const margin = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Place the card: to the right of the target when there's room, else left,
  // else centered. Always clamped inside the viewport.
  let cardLeft: number;
  let cardTop: number;
  if (rect) {
    const rightSpace = vw - (rect.left + rect.width);
    if (rightSpace > cardSize.w + margin * 2) {
      cardLeft = rect.left + rect.width + margin;
      cardTop = rect.top;
    } else if (rect.left > cardSize.w + margin * 2) {
      cardLeft = rect.left - cardSize.w - margin;
      cardTop = rect.top;
    } else {
      cardLeft = (vw - cardSize.w) / 2;
      cardTop = rect.top + rect.height + margin;
    }
  } else {
    cardLeft = (vw - cardSize.w) / 2;
    cardTop = (vh - cardSize.h) / 2;
  }
  cardLeft = Math.max(margin, Math.min(cardLeft, vw - cardSize.w - margin));
  cardTop = Math.max(margin, Math.min(cardTop, vh - cardSize.h - margin));

  return createPortal(
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      {/* Layer 1 — transparent click blocker so the page behind stays inert. */}
      <div className="absolute inset-0" />

      {/* Layer 2 — dim + spotlight (visual only, never blocks the card). */}
      {rect ? (
        <div
          className="absolute rounded-xl pointer-events-none transition-all duration-300"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.66)",
            outline: "2px solid hsl(var(--primary))",
            outlineOffset: "2px",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/70 pointer-events-none" />
      )}

      {/* Layer 3 — the card (top of the stack, fully interactive). */}
      <div
        ref={cardRef}
        className="absolute w-[360px] max-w-[92vw] rounded-xl border border-border bg-card shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200"
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </span>
          <h3 className="font-display font-bold text-base leading-tight">{step.title}</h3>
          <button onClick={finish} className="ml-auto text-muted-foreground hover:text-foreground shrink-0" title="Skip tour" aria-label="Skip tour">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>

        {step.tip && (
          <div className="mt-3 flex gap-2 text-xs text-primary/90 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
            <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="leading-relaxed">{step.tip}</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
          <span className="text-[11px] text-muted-foreground font-mono">{index + 1} / {STEPS.length}</span>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button onClick={() => go(-1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            {!isLast ? (
              <button onClick={() => go(1)} className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                Next <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={finish} className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                Get started
              </button>
            )}
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-primary" : "w-1.5 bg-muted hover:bg-muted-foreground/40"}`}
            />
          ))}
        </div>

        {!isLast && (
          <button onClick={finish} className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground">
            Skip tour
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
