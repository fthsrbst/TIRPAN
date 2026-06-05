/**
 * Dynamic, step-by-step tutorial for the New Mission page.
 *
 * Rather than a static modal, this drives the real page: each step switches the
 * page to the right view (profile picker ↔ form, and the individual setting
 * tabs) via the `apply` control, then spotlights the actual element on screen
 * (located by its `data-tour` attribute) with an explanatory card beside it.
 *
 * It is rendered *inside* NewMission so it can drive that page's state directly.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowLeft, X, GraduationCap, Sparkles } from "lucide-react";

export interface TourCommand {
  step?: 1 | 2;
  tab?: string;
  saveProfile?: boolean;
}

interface Step {
  title: string;
  body: string;
  tip?: string;
  target?: string;             // data-tour key to spotlight
  apply?: TourCommand;         // page state this step needs
}

const STEPS: Step[] = [
  {
    title: "New Mission — guided tour",
    body: "I'll walk you through launching a mission, step by step, highlighting each part of the screen as we go. Use Next / Back, or press → / ←. You can skip anytime and replay this from Settings.",
    apply: { step: 1 },
  },
  {
    title: "1 · Scan Profiles",
    body: "Start here. Each profile is a ready-made preset that auto-configures EVERYTHING — mode, speed, ports, exploit permissions, safety limits and objectives — for a common job like host discovery, web app testing or Active Directory. The small chips on each card preview its key settings.",
    tip: "Hover a card and click the calendar icon to schedule that preset directly — no need to open the form.",
    target: "mission-profiles",
    apply: { step: 1 },
  },
  {
    title: "2 · Custom / Advanced",
    body: "Don't want a preset? Choose Custom / Advanced to configure everything yourself. You can also pick a profile first and then fine-tune it — profiles are just a starting point, nothing is locked.",
    tip: "Next opens the full configuration form so we can walk its tabs.",
    target: "mission-custom",
    apply: { step: 1 },
  },
  {
    title: "3 · Settings — five tabs",
    body: "The form has five tabs. These settings are independent of any profile — whether or not you picked one, you can change anything here. Let's go through each tab.",
    target: "mission-tabs",
    apply: { step: 2, tab: "target" },
  },
  {
    title: "Target & Brief",
    body: "Define WHAT you're testing: the primary target (an IP, CIDR like 192.168.1.0/24, a domain or hostname), any additional targets, a mission name, scope notes, your objectives (one per line), a free-text briefing for the AI, and known technologies.",
    target: "mission-tab-content",
    apply: { step: 2, tab: "target" },
  },
  {
    title: "Mode & Speed",
    body: "Choose HOW it runs: Mode (Scan Only · Ask Before Exploit · Full Auto · Multi-agent), Speed (Stealth / Normal / Fast), scan type (SYN / Connect / UDP / Full), the port range, version & OS detection, sudo, aggressive (-A) and NSE scripts.",
    target: "mission-tab-content",
    apply: { step: 2, tab: "mode" },
  },
  {
    title: "Credentials",
    body: "Add credentials for authenticated testing — SSH, SMB, SNMP, Database or Web. You can also attach saved credentials from your vault and set a per-mission password wordlist for brute-forcing.",
    target: "mission-tab-content",
    apply: { step: 2, tab: "credentials" },
  },
  {
    title: "Safety",
    body: "Set the guardrails: allowed CIDR, excluded IPs & ports, and exactly which actions are permitted — exploit, block DoS, block destructive actions, post-exploitation, lateral movement, Docker escape and browser recon — plus max severity, time limit and rate limit.",
    target: "mission-tab-content",
    apply: { step: 2, tab: "safety" },
  },
  {
    title: "Advanced",
    body: "Fine-tune the engine: per-agent model overrides, per-tool on/off permissions, a global provider/model for the run, and 'confirm every step' for maximum oversight.",
    target: "mission-tab-content",
    apply: { step: 2, tab: "advanced" },
  },
  {
    title: "4 · Create your own profile",
    body: "Dialed in a setup you'll reuse? Click 'Save as Profile' to capture the whole current configuration. Give it a name, description, icon and color — it then appears as a Custom card in Step 1 for one-click reuse, and can be scheduled or deleted like any preset.",
    tip: "Custom profiles are saved in your browser, ready next time you open New Mission.",
    target: "mission-save-profile",
    apply: { step: 2, tab: "target", saveProfile: true },
  },
  {
    title: "5 · Schedule a scan",
    body: "Not launching now? Click Schedule Scan to pick a date & time and a recurrence — one-time, or Daily / Weekly / Monthly. Scheduled scans launch automatically in the background even while you're on another page, and you get heads-up notifications 30 and 5 minutes before each run.",
    tip: "Manage or cancel pending schedules from the Schedule dialog or the Scheduled Scans page.",
    target: "mission-schedule",
    apply: { step: 2, tab: "target", saveProfile: false },
  },
  {
    title: "Launch 🚀",
    body: "When you're ready, hit Launch Mission and the AI takes over — or schedule it for later. That's the whole flow: pick a profile or go Custom, fine-tune the settings, save profiles you like, and launch or schedule. Happy hunting!",
    target: "mission-launch",
    apply: { step: 2, tab: "target" },
  },
];

interface Rect { top: number; left: number; width: number; height: number; }

export default function NewMissionTutorial({
  open,
  onClose,
  apply,
}: {
  open: boolean;
  onClose: () => void;
  apply: (cmd: TourCommand) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ w: 380, h: 240 });
  // While the page is actively scrolling (incl. our own scroll-into-view), the
  // spotlight must track the target frame-for-frame with NO transition, or it
  // visibly lags behind ("swims"). When idle, we re-enable a transition so the
  // box and card SLIDE smoothly from one step's target to the next — the nice bit.
  const [scrolling, setScrolling] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const scrollIdle = useRef<number | null>(null);

  // Reset to the first step every time the tour opens.
  useEffect(() => { if (open) setIndex(0); }, [open]);

  // Resolve the current step's spotlight target element.
  const currentTarget = useCallback((): HTMLElement | null => {
    const step = STEPS[index];
    if (!step?.target) return null;
    return document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
  }, [index]);

  // Flag a scroll in progress so the slide transition is suppressed until motion
  // stops (then re-enabled ~140ms after the last scroll tick).
  const beginScroll = useCallback(() => {
    setScrolling(true);
    if (scrollIdle.current) window.clearTimeout(scrollIdle.current);
    scrollIdle.current = window.setTimeout(() => setScrolling(false), 140);
  }, []);

  // Any real scroll/resize (user-driven or our programmatic scroll-into-view)
  // switches the spotlight to snap-tracking so it stays glued instead of chasing.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", beginScroll, true);
    window.addEventListener("resize", beginScroll, true);
    return () => {
      window.removeEventListener("scroll", beginScroll, true);
      window.removeEventListener("resize", beginScroll, true);
      if (scrollIdle.current) window.clearTimeout(scrollIdle.current);
    };
  }, [open, beginScroll]);

  // Apply the page state this step needs; once its target has rendered, bring it
  // into view (only when off-screen) and keep the spotlight glued to it via a
  // requestAnimationFrame loop. Reading live geometry every frame means the box
  // tracks 1:1 while anything scrolls; when idle the CSS transition makes it glide
  // to the next step's target. The equality guard skips renders while still.
  useEffect(() => {
    if (!open) return;
    const step = STEPS[index];
    if (step?.apply) applyRef.current(step.apply);

    let raf = 0;
    let placed = false;
    const loop = () => {
      const el = currentTarget();
      if (!el) {
        setRect((p) => (p === null ? p : null));
      } else {
        if (!placed) {
          placed = true;
          const r0 = el.getBoundingClientRect();
          // Only scroll when the target isn't already fully on screen — keeps the
          // five same-element form-tab steps from jumping the page around.
          if (r0.top < 8 || r0.bottom > window.innerHeight - 8) {
            beginScroll();
            try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* ignore */ }
          }
        }
        const r = el.getBoundingClientRect();
        setRect((prev) =>
          prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
            ? prev
            : { top: r.top, left: r.left, width: r.width, height: r.height },
        );
      }
      raf = requestAnimationFrame(loop);
    };

    // Let the view switch (tab change / profile↔form) render before we look for
    // the freshly-mounted target; the loop then scrolls to it the first frame it
    // exists, so a slow-rendering tab still gets centered correctly.
    const t = window.setTimeout(() => { raf = requestAnimationFrame(loop); }, 200);
    return () => { window.clearTimeout(t); if (raf) cancelAnimationFrame(raf); };
  }, [open, index, currentTarget, beginScroll]);

  // Card height depends on the step's text, so re-measure per step (not per frame —
  // the rAF loop above updates `rect` constantly, which must not retrigger this).
  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    setCardSize((prev) => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
  }, [open, index]);

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") { if (index < STEPS.length - 1) go(1); }
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, go, onClose]);

  if (!open) return null;

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const pad = 8;
  const margin = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Place the card beside the target when there's room, else below / centered.
  let cardLeft: number;
  let cardTop: number;
  if (rect) {
    const rightSpace = vw - (rect.left + rect.width);
    if (rightSpace > cardSize.w + margin * 2) {
      cardLeft = rect.left + rect.width + margin;
      cardTop = Math.max(margin, Math.min(rect.top, vh - cardSize.h - margin));
    } else if (rect.left > cardSize.w + margin * 2) {
      cardLeft = rect.left - cardSize.w - margin;
      cardTop = Math.max(margin, Math.min(rect.top, vh - cardSize.h - margin));
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
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-label="New Mission tutorial">
      {/* Layer 1 — transparent click blocker so the page behind stays inert. */}
      <div className="absolute inset-0" />

      {/* Layer 2 — dim + spotlight (visual only). */}
      {rect ? (
        <div
          className="absolute rounded-xl pointer-events-none"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.66)",
            outline: "2px solid hsl(var(--primary))",
            outlineOffset: "2px",
            transition: scrolling
              ? "none"
              : "top 320ms cubic-bezier(0.4,0,0.2,1), left 320ms cubic-bezier(0.4,0,0.2,1), width 320ms cubic-bezier(0.4,0,0.2,1), height 320ms cubic-bezier(0.4,0,0.2,1)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/70 pointer-events-none" />
      )}

      {/* Layer 3 — the card. */}
      <div
        ref={cardRef}
        className="absolute w-[380px] max-w-[92vw] rounded-xl border border-border bg-card shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200"
        style={{
          top: cardTop,
          left: cardLeft,
          transition: scrolling
            ? "none"
            : "top 320ms cubic-bezier(0.4,0,0.2,1), left 320ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4" />
          </span>
          <h3 className="font-display font-bold text-base leading-tight">{step.title}</h3>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground shrink-0" title="Close tutorial" aria-label="Close tutorial">
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
              <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                Got it
              </button>
            )}
          </div>
        </div>

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
          <button onClick={onClose} className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground">
            Skip tutorial
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
