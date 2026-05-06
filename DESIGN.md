---
# DESIGN.md — TIRPAN Design System
#
# A dual-identity offensive-security platform spanning a terminal-inspired
# expert UI, a polished SaaS dashboard, and print-ready pentest reports.
# The system's core visual signature is the #ccff00 electric-lime accent
# on deep black — a deliberate "cyber terminal" aesthetic.

tokens:
  colors:
    expert-core:
      primary: "#ccff00"            # Electric lime-green accent
      primary-on-dark: "#ccff00"    # Accent on black backgrounds
      primary-on-light: "#4a7c00"   # Dark green accent for light mode readability
      background: "#000000"         # Pure black — terminal foundation
      surface: "#0A0A0A"            # Slightly lifted panels
      card: "#111111"               # Raised card surfaces
      border: "#1A1A1A"            # Subtle borders
      text-primary: "#FFFFFF"       # White on dark
      text-secondary: "#9a9a9a"     # Muted grey (readability override)
      danger: "#FF3B3B"            # Full-red emergency/stop

    expert-semantic:
      scanner-blue: "#3b82f6"
      reasoning-amber: "#eab308"
      reflection-purple: "#a855f7"
      parallel-orange: "#f97316"
      shell-input-green: "#9dde8d"
      shell-output-green: "#46d876"
      shell-system-grey: "#b7b7b7"
      critical-red: "#ff4444"
      high-orange: "#ff8c42"
      medium-yellow: "#ffd43b"
      low-green: "#69db7c"

    expert-light-mode:
      background: "#f4f4f5"         # Zinc-100
      surface: "#ffffff"
      card: "#f0f0f1"
      border: "#d4d4d8"
      text-primary: "#18181b"       # Zinc-900
      text-secondary: "#71717a"
      primary-accent: "#4a7c00"
      danger: "#b91c1c"

    saas-core:
      background: "#fafafa"
      surface: "#ffffff"
      muted: "#f4f4f5"
      border: "#e4e4e7"
      text-primary: "#18181b"
      text-muted: "#71717a"
      accent: "#4f46e5"             # Indigo — SaaS signature
      accent-hover: "#4338ca"
      danger: "#ef4444"
      warning: "#f59e0b"
      success: "#22c55e"

    saas-dark-mode:
      background: "#09090b"
      surface: "#18181b"
      muted: "#27272a"
      border: "#3f3f46"
      text-primary: "#fafafa"
      text-muted: "#a1a1aa"

    report:
      background: "#080a0e"
      background-soft: "#0d1117"
      background-subtle: "#161b22"
      border: "#1e2430"
      ink: "#e6edf3"
      ink-light: "#c9d1d9"
      ink-muted: "#8b949e"
      accent: "#ccff00"
      critical: "#ff4444"
      high: "#ff8c42"
      medium: "#ffd43b"
      low: "#69db7c"
      info: "#8b949e"
      red-bg: "#1a0505"
      orange-bg: "#1a0d00"
      yellow-bg: "#1a1500"
      green-bg: "#051a08"

    feed-semantic:
      scan-cyan: "#06b6d4"
      success-green: "#22c55e"
      block-warning: "#f59e0b"
      accent-indigo: "#4f46e5"

  typography:
    families:
      display: "Space Grotesk"      # Headings, badges, titles, uppercase labels
      body: "Inter"                  # All body text, UI labels
      mono: "JetBrains Mono"         # Code, terminal, logs, data

    expert:
      base-size: 15px                # Global readability boost
      base-line-height: 1.6
      xs: 13px
      sm: 14px
      heading-1: 1rem
      heading-2: 0.875rem
      heading-3: 0.8rem
      code-inline: 0.82em
      code-block: 12px
      label-micro: 9px
      weight-body: 400
      weight-mono: 500               # Heavier for sharper code rendering
      letter-spacing-body: 0.01em

    saas:
      base-size: 14px
      page-title: 22px
      stat-value: 28px
      label: 12px
      badge: 11px

    report:
      base-size: 13px
      cover-title: 40px
      section-title: 22px
      cvss-num: 34px
      label-micro: 10px

  radii:
    expert: 2px                      # Brutalist sharp corners
    expert-lg: 4px                   # Slightly rounded cards
    expert-full: 9999px              # Pill / rounded-full
    saas-card: 12px                  # Soft rounded SaaS cards
    saas-input: 8px
    saas-button: 8px
    saas-badge: 9999px               # Pill badges
    saas-toggle: 11px
    report: 4px                      # Moderate rounding on report cards
    report-code: 3px

  shadows:
    expert-card: "0 1px 3px rgba(0, 0, 0, 0.3)"
    expert-card-hover: "0 2px 8px rgba(0, 0, 0, 0.5)"
    expert-light-card: "0 1px 4px rgba(0, 0, 0, 0.08)"
    expert-light-card-hover: "0 2px 8px rgba(0, 0, 0, 0.12)"
    saas-light: "0 1px 3px 0 rgba(0, 0, 0, 0.07), 0 1px 2px -1px rgba(0, 0, 0, 0.05)"
    saas-light-md: "0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06)"
    saas-dark: "0 1px 3px 0 rgba(0, 0, 0, 0.3)"
    saas-dark-md: "0 4px 6px -1px rgba(0, 0, 0, 0.4)"
    feed-glow: "0 0 0 3px color-mix(in srgb, currentColor 20%, transparent)"

  motion:
    theme-transition-duration: 0.45s
    theme-transition-easing: "cubic-bezier(0.4, 0, 0.2, 1)"
    hover-transition: "0.15s ease"
    sidebar-transition: "0.3s ease-in-out"
    panel-width-transition: "0.22s cubic-bezier(0.4, 0, 0.2, 1)"
    toast-in: "0.25s ease"
    modal-fade-in: "0.18s ease"
    sidebar-collapse: "0.2s ease"
    cursor-blink: "1s step-end infinite"
    thinking-dot: "0.6s ease infinite"
    spinner: "0.6s linear infinite"
    pulse-accent: "1.5s infinite"
    pulse-accent-easing: "ease"
    copy-hover: "0.15s ease"

  spacing:
    header-height: 60px
    sidebar-width: 280px
    saas-sidebar-width: 240px
    saas-sidebar-collapsed: 64px
    saas-header-height: 56px
    expert-page-padding: "2rem"
    expert-card-gap: 10
    saas-page-padding: "28px 32px"
    saas-card-padding: 20px
    report-page-padding: "48px 80px"
    phase-step-gap: 4px

  icons:
    library: "Material Symbols Outlined"
    variant: "FILL 0..1, wght 100..700"
    expert-sizes:
      nav: 14px
      micro: 12px
      small: 14px
      medium: 18px
      large: 20px
      xl: 48px
    saas-sizes:
      nav: 20px
      micro: 14px
      small: 16px
      medium: 18px
      large: 24px
      xl: 48px

  breakpoints:
    phone: 767px
    tablet: "768px–1024px"
    desktop: 1025px
    saas-tablet: 900px
    saas-phone: 768px
    saas-stats: 640px

  components:
    toggle-switch:
      width: 36px
      height: 20px
      thumb-size: 12px
      travel: 16px
      border-radius: 10px

    saas-toggle-switch:
      width: 40px
      height: 22px
      thumb-size: 16px
      travel: 18px
      border-radius: 11px

    phase-indicator:
      circle-size: 20px
      border-width: 2px

    saas-phase-indicator:
      circle-size: 28px
      border-width: 2px

    status-dot:
      size: 8px
      running-shadow: "0 0 0 0 rgba(59, 130, 246, 0.4)"
      running-shadow-peak: "0 0 0 5px rgba(59, 130, 246, 0)"

    feedback:
      hover: "background alpha shift, border accent highlight"
      active: "primary border + primary text + tinted background"
      focus: "#ccff00 border, no ring/outline"

  surfaces:
    terminal-shell-output:
      dark: >
        radial-gradient(circle at 20% 10%, rgba(204, 255, 0, 0.03), transparent 28%),
        radial-gradient(circle at 85% 90%, rgba(34, 197, 94, 0.04), transparent 32%),
        #040404
      light: >
        radial-gradient(circle at 20% 10%, rgba(74, 124, 0, 0.06), transparent 28%),
        radial-gradient(circle at 85% 90%, rgba(8, 120, 78, 0.05), transparent 32%),
        #f9f9fa

    attack-graph-header:
      dark: >
        linear-gradient(90deg, rgba(204, 255, 0, 0.08), transparent 35%),
        linear-gradient(180deg, #050505, #040404)
      light: >
        linear-gradient(90deg, rgba(74, 124, 0, 0.1), transparent 35%),
        linear-gradient(180deg, #f6f6f4, #f0f0ee)

    cover-page:
      accent-strip: "linear-gradient(90deg, #ccff00 0%, #69db7c 40%, #ccff00 100%)"
      glow: "radial-gradient(circle at top right, rgba(204, 255, 0, 0.04) 0%, transparent 70%)"

    done-bar:
      light: "linear-gradient(135deg, #f0fdf4, #dcfce7)"
      dark: "rgba(22, 163, 74, 0.1)"

  report-print:
    page-size: A4
    page-margin: "12mm 12mm"
    print-font-size: 11px
    print-line-height: 1.45
    color-adjust: exact
    cover-padding: "9mm 7mm"
    risk-grid-columns: 3
    cvss-metric-columns: 2
---

# TIRPAN Design System

## Product Identity

TIRPAN is an autonomous penetration testing platform. Its visual identity draws
from three traditions fused into one design language:

1. **The cyberpunk terminal** — high-contrast black backgrounds, electric
   lime-green (`#ccff00`) accents, monospace typography, and the raw
   aesthetic of command-line interfaces. This is the Expert Mode visual
   language.

2. **The modern SaaS dashboard** — clean, rounded cards, generous white space,
   indigo accents (`#4f46e5`), and progressive disclosure patterns. This is
   the SaaS Mode — designed for operators who want clarity over density.

3. **The formal security report** — dark-toned A4 pages, CVSS decomposition
   tables, severity-ranked findings, and print-optimized typography built
   for stakeholders who need to read (not operate) the output.

The green/black Expert identity is the system's **core brand** — it appears
in the CLI banner, report accent color, and expert UI. The SaaS indigo
identity is a secondary, productized face for the same underlying engine.

## Brand Color Philosophy

### Primary Accent: `#ccff00` (Electric Lime)

This is the single thread that ties the CLI, Expert UI, and report template
together. It functions as:

- **CLI**: Banner border and ASCII art fill color
- **Expert UI**: All hover/focus/active states, primary buttons, markdown
  headings, code highlights, list markers, phase indicators, status dots,
  scroll-to-bottom button, toggle switches
- **Report**: Section numbers, data-table headers, finding section labels,
  timeline dots, footer logo, code styling

In light-mode expert UI, the accent dims to `#4a7c00` (dark forest green)
for readability on white backgrounds. This is not a separate brand color —
it is the same token mapped through a contrast-aware transform.

### Severity Palette (Shared Across All Modes)

```
CRITICAL  #ff4444  •  #1a0505 bg  →  Immediate action (0–24h)
HIGH      #ff8c42  •  #1a0d00 bg  →  Urgent (24–72h)
MEDIUM    #ffd43b  •  #1a1500 bg  →  Short-term (<30 days)
LOW       #69db7c  •  #051a08 bg  →  Planned (next cycle)
INFO      #8b949e  •  —           →  Neutral
```

Every severity badge in the report, every vulnerability card in the UI,
and every feed item uses this palette. The backing tint colors provide
a consistent "colored container" pattern: each severity gets its own
background tint to reinforce the visual signal beyond just text color.

### Attack Graph Semantic Colors

The node-based attack storyboard uses a dedicated semantic palette:

- `#ccff00` — Mission start / success nodes
- `#eab308` — Reasoning steps
- `#3b82f6` — Tool actions
- `#a855f7` — Reflection insight nodes
- `#f97316` — Parallel branches

These match the agent feed's color-coded text labels (`text-yellow-400`,
`text-blue-400`, `text-purple-400`, `text-orange-400`) so the color
language is consistent between the feed and the graph visualization.

## Typography Architecture

### Three-Font Stack

| Role | Family | Where |
|------|--------|-------|
| **Display** | Space Grotesk | Headings, badges, navigation labels, mode buttons, KPI cards, phase indicators, toggle labels, report section titles — always uppercase, always bold (700+), tight letter-spacing |
| **Body** | Inter | All UI text, descriptions, settings labels, markdown body, report paragraphs |
| **Mono** | JetBrains Mono | Code blocks, inline code, terminal output, audit logs, timestamps, data tables, input fields for technical content |

### Typographic Rules

1. **Space Grotesk never appears as sentence-case body text.** It is reserved
   for labels, headings, and UI chrome that is always uppercase.

2. **JetBrains Mono is rendered at font-weight 500** (medium) rather than 400
   to ensure sharp rendering at small sizes (9–13px) on dark backgrounds.
   This was a deliberate readability optimization.

3. **All text sizes are globally bumped +2px** from typical defaults — the
   Expert UI applies a blanket `text-xs → 13px, text-sm → 14px, text-base →
   15px` override. This compensates for the high-contrast dark theme and keeps
   small labels legible.

4. **Body text carries a 0.01em letter-spacing** to open up Inter's tight
   default tracking at small sizes on dark backgrounds.

## Spacing & Layout

### Expert Mode

The Expert UI is a **fixed three-column layout** on desktop:
- Left sidebar: 280px (collapsible)
- Center: fluid, with content constrained to `max-w-4xl`
- Right sidebar (intel/systems): shown as needed, also 280px collapsible
- Header: 60px

On tablets (768–1024px), the right sidebar becomes a slide-over panel.
On phones (<768px), both sidebars become full-screen overlays with a
translucent backdrop (`rgba(0, 0, 0, 0.75)`).

A **52px minimap column** sits at the right edge of the agent feed area,
modeled after VS Code's minimap. The feed content compensates with matching
left/right padding so the feed remains visually centered.

### SaaS Mode

The SaaS UI uses a **sidebar + main layout**:
- Sidebar: 240px expanded, 64px collapsed
- Header: 56px with backdrop blur
- Page content: max-width 1100px, centered, with 28px/32px padding
- Cards use generous internal padding (20px)

SaaS defaults to light mode and feels more like a product dashboard than
a terminal. Border radii jump to 12px (vs. expert's 2px), shadows are used
generously, and the header has a glass-like backdrop blur effect.

### Report Template

Report pages use A4 dimensions with 12mm margins and generous padding
(48px/80px on screen, 9mm/7mm on print). Content is capped at 1000px.
The cover page uses `page-break-after: always` to guarantee a clean
page boundary.

## Component Design Principles

### Feedback States (Expert Mode)

Every interactive element in Expert Mode follows a consistent feedback
pattern:

- **Default**: `#1A1A1A` border, `#888888` (or `#9a9a9a`) text
- **Hover**: `rgba(204, 255, 0, 0.3–0.4)` border, `#ccff00` text
- **Active/Selected**: `rgba(204, 255, 0, 0.45–0.5)` border, `#ccff00`
  text, `rgba(204, 255, 0, 0.08)` background
- **Focus**: `#ccff00` border, no outline ring (outline: none)

No element uses browser-default focus rings. The `#ccff00` border change
is the sole focus indicator. This is applied globally via `input:focus,
select:focus, textarea:focus { border-color: #ccff00 !important; }`.

### Toggle Switches

Expert mode toggles are 36×20px with a 12px thumb that travels 16px.
SaaS mode toggles are 40×22px with a 16px thumb that travels 18px.
Both use the platform's primary accent as the "on" state background and
follow the same active/hover feedback pattern.

### Cards

Expert mode cards use sharp 2px border radius and subtle shadows
(`0 1px 3px rgba(0,0,0,0.3)`). Hover deepens the shadow. Cards are
grouped by function:
- **Mission feed cards**: bubble/balloon style with shadows
- **Intel sidebar cards**: bordered, with `linear-gradient` semi-transparent
  backgrounds
- **Attack graph KPI cards**: compact (min-width 92px), minimal
- **Settings cards**: `bg-card border border-border-color`

SaaS mode cards use 12px border radius, 20px padding, and cleaner shadows.

### Phase Indicators

The 5-phase mission pipeline (Discovery → Port Scan → Analysis →
Exploitation → Reporting) appears in both UIs but with different visual
treatment:

- **Expert**: 20px circles, 1px connector lines, monospace numbers,
  uppercase labels. Progress shown via border and background color
  transitions.
- **SaaS**: 28px circles, 2px connector lines, step labels below.
  Done steps show green fill; active steps pulse with the accent color.

### Shell Terminal

The native terminal area has a dual-gradient background designed to
evoke a subtle "glow" without being distracting. Shell output uses
three color-coded line types:
- **Input lines** (commands): `#9dde8d`
- **Output lines** (results): `#46d876`
- **System lines** (metadata): `#b7b7b7`

Shell subtabs have state-based colors:
- **Idle**: dark grey border
- **Active**: green-accent border with tinted background
- **Unread**: amber border
- **Dead**: red border with reduced opacity

## Dark/Light Mode Strategy

Expert Mode defaults to **dark** and uses the Tailwind `class` strategy
(not `media`). The `<html>` tag starts with `class="dark"`. Light mode
is applied by removing the `.dark` class and adding `.light` on `<html>`.

The theme transition uses the **View Transition API** with a blur-fade
animation: the old theme blurs out while the new theme fades in over
0.45s with a `cubic-bezier(0.4, 0, 0.2, 1)` curve.

Light mode overrides are comprehensive and implemented in `style.css`
via `html.light` selectors, working alongside the Tailwind utility
classes. Key mappings:
- `#000000` → `#f4f4f5` (background)
- `#0A0A0A` → `#ffffff` (surface)
- `#111111` → `#f0f0f1` (card)
- `#1A1A1A` → `#d4d4d8` (border)
- `#FFFFFF` → `#18181b` (text)
- `#ccff00` → `#4a7c00` (accent)

Semantic text colors (slate, yellow, purple, blue, green, orange, red,
teal, cyan) are each individually remapped to darker, more saturated
equivalents for light-mode readability.

SaaS Mode defaults to **light** and uses CSS custom properties
(`:root` for light, `.dark` class override for dark — independent of
Tailwind's dark mode strategy).

The Report Template is **dark only** with no light alternative.
Print output uses `print-color-adjust: exact` to preserve the dark
theme on paper/PDF.

## Motion Language

Transitions are **fast and functional**, never decorative:

| Context | Duration | Easing |
|---------|----------|--------|
| Hover/focus states | 150ms | ease |
| Theme switch (View Transition) | 450ms | cubic-bezier(0.4, 0, 0.2, 1) |
| Sidebar collapse | 300ms | ease-in-out |
| Graph detail panel | 220ms | cubic-bezier(0.4, 0, 0.2, 1) |
| Mobile overlay | 300ms | ease-in-out |
| Modal entrance | 180ms | ease |
| Toast entrance | 250ms | ease |
| Spinner | 600ms | linear infinite |
| Pulse (status/accent) | 1500ms | ease infinite |
| Cursor blink | 1000ms | step-end infinite |

Animation is used sparingly — primarily for:
- The blinking terminal cursor
- The "thinking" three-dot loader in agent responses
- Status-dot pulsing (blue for running, accent for active phase)
- Smooth sidebar collapse/expand
- Toast slide-in from the right

## Iconography

All icons come from **Google Material Symbols** in outlined style with
variable weight (`FILL 0..1, wght 100..700`). Icons are never used
decoratively — each icon maps to a concrete action, state, or navigation
target.

Consistent sizing by context:
- Navigation items: 14px (expert), 20px (SaaS)
- Action buttons: 13–18px
- Section headers: 18–20px
- Empty states: 48px (muted, low opacity)
- Chip/badge: 12–14px

## Report Styling Conventions

The pentest report follows a strict document hierarchy:

1. **Cover page**: Gradient accent strip at top, radial glow, CONFIDENTIAL
   badge, client branding area, target/results grid, classification footer
2. **Table of contents**: Numbered entries with green section numbers
3. **Section pages**: Page breaks before each major section
4. **Findings**: Repeating card pattern with severity-tinted header,
   CVSS badge, vector decomposition, PoC evidence block, business impact,
   and remediation block
5. **Tables**: Dark-themed with `#ccff00` headers, zebra striping on even
   rows, hover highlight
6. **Timeline**: Vertical line with green dots for major events

CVSS v3.1 scores are displayed in dedicated badges that use the severity
color palette. The font size hierarchy emphasizes the score number
(22px Space Grotesk Extra Bold) over the version label (9px).

## Design Intent & "Feel"

**The Expert Mode should feel like you're inside a cyber operations
terminal.** The pure black background, sharp 2px corners, green-on-black
text, monospace data displays, and blinking cursor create this atmosphere.
It should not feel like a web app — it should feel like a tool built for
operators who live in the terminal. The light mode exists as a practical
concession for daylight readability, but the brand's soul is dark.

**The SaaS Mode should feel like a product you'd pay for.** It replaces
the terminal aesthetic with clean rounded cards, proper shadows, clear
visual hierarchy, and progressive disclosure. The indigo accent signals
professionalism and trust rather than cyber-attack energy.

**The Report should feel like a formal security document.** It follows
a template structure that security consultants and auditors expect.
The dark theme is retained even for print because it's part of the
TIRPAN visual brand, and because dark backgrounds make the severity
colors (red/orange/yellow/green) pop more dramatically.

### Key Tensions in the Design

1. **Sharp vs. round**: Expert Mode leans brutalist (2px radius), SaaS
   leans polished (12px radius). This is intentional — the radius is
   a mode-differentiator, not an inconsistency.
2. **Green vs. indigo**: Two different primary accents for two different
   audiences. The CLI/Report/Expert share `#ccff00`; the SaaS uses
   `#4f46e5`. Both are valid TIRPAN brand colors, used in context.
3. **Dense vs. airy**: Expert Mode packs more information per pixel
   (minimap, attack graph, multiple sidebars). SaaS Mode uses generous
   padding and fewer components per view. This matches the expertise
   level of each audience.
4. **Dark-first vs. light-first**: Expert defaults dark, SaaS defaults
   light. The SaaS dark mode exists as a user preference, not a brand
   statement. Both modes have complete light and dark implementations.
