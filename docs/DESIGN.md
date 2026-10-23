# Design brief: "Mission HQ" (Option D)

The approved visual direction is a hybrid: a calm, readable dashboard (cards, sidebar, Inter body text) with a mission-control personality (Barlow uppercase labels, mission language, the flight plan arc). The reference implementation is `docs/design/hq-reference.dc.html`. Read its markup for exact spacing, and its `<script>` block for the arc maths. It's a design prototype, not production code: rebuild it properly in React, Tailwind and shadcn.

Light theme is the default. Dark theme is an optional user setting.

## 1. Tokens

Implement as CSS variables on `:root` and `.dark`, mapped into the Tailwind theme and shadcn's variables. No hard-coded colours in components.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #F5F4F0 | #000000 | Page background |
| `--side` | #FBFAF7 | #08080A | Sidebar |
| `--surface` | #FFFFFF | #0F0F12 | Cards |
| `--soft` | #F4F3EF | #18181C | Tiles inside cards |
| `--ink` | #16181D | #F0F0FA | Text, primary buttons, arc |
| `--muted` | #5A5E66 | #A0A0A8 | Secondary text |
| `--line` | #E4E2DC | #2A2A2E | Borders, dividers |
| `--track` | #DDDAD2 | #3A3A3F | Unfilled bars, future arc |
| `--go` / `--go-bg` | #1E7A4C / #E8F4EC | #5BD08F / #0E2318 | Done, verified, refunded |
| `--hold` / `--hold-bg` | #9A4708 / #FDF1E4 | #FFB020 / #2A1F08 | Needs you, upcoming gates, deadlines |
| `--hero-bg` | linear-gradient(180deg,#FFFFFF,#FAF9F6) | linear-gradient(180deg,#17171B,#0F0F12) | Flight plan card |

Colour only carries meaning: green = done or verified, amber = needs the founder. Everything else is monochrome. Primary buttons use `--ink` with `--surface` text.

**Depth: three levels**
- `--shadow-sm` (tiles inside cards). Light: `inset 0 1px 0 rgba(255,255,255,.9), 0 1px 3px rgba(22,24,29,.09)`. Dark: `inset 0 1px 0 rgba(255,255,255,.06), 0 1px 3px rgba(0,0,0,.6)`.
- `--shadow` (cards). Light: `0 1px 2px rgba(22,24,29,.06), 0 4px 8px rgba(22,24,29,.05), 0 16px 32px -12px rgba(22,24,29,.16)`. Dark: `inset 0 1px 0 rgba(255,255,255,.08), 0 2px 4px rgba(0,0,0,.7), 0 18px 36px -12px rgba(0,0,0,.95)`.
- `--shadow-hero` (flight plan only). Light: `0 1px 2px rgba(22,24,29,.08), 0 8px 16px -4px rgba(22,24,29,.08), 0 30px 60px -18px rgba(22,24,29,.28)`. Dark: `inset 0 1px 0 rgba(255,255,255,.12), 0 0 0 1px rgba(255,255,255,.04), 0 32px 64px -18px rgba(0,0,0,1)`.

**Radius:** cards 10px, flight plan card 12px, tiles and buttons 6px, pills 4px.

## 2. Typography
- **Inter** (400/500/600) for body text, inputs and content.
- **Barlow** (500/600/700) for labels, navigation, buttons, badges and small headings: UPPERCASE, letter-spacing 0.12–0.16em, 11–13px.
- **Barlow Semi Condensed** (600/700) for display text and big numbers: the phase title, countdowns and telemetry figures. Use `font-variant-numeric: tabular-nums`.
- Self-host via `@fontsource` packages rather than Google Fonts links.
- Uppercase tracking only on short labels (a few words). Never on sentences or body copy.

Sizes (compact, approved): phase title 40px, header numbers 30px, arc readout 34px, telemetry 26px, card titles 13px Barlow, body 14px.

## 3. Language (glossary)
Mission terms are for labels and headings only. Body copy, tooltips and help text stay plain English, so the theme never gets in the way of understanding.

| UI label | Means | Old/plain name |
|---|---|---|
| Mission | The company | Company |
| Phase (e.g. BUILD PHASE) | Current stage | Stage |
| Flight plan | Roadmap with milestones and gates | Roadmap |
| Gate | Stage gate with evidence criteria | Gate |
| GO / NO-GO | Approvals queue; buttons GO, EDIT, WHY | Approvals |
| Telemetry | Metrics | Metrics |
| Vehicle | The founder's website or app | Website |
| Overnight burn | Overnight agent runs with credits | Activity |
| Next windows | Upcoming deadlines (compliance, grants, meetings) | Coming up |
| Fuel (sidebar only) | Credit balance | Credits |
| T+30 DAYS | Mission elapsed time | — |
| T–12 DAYS | Countdown to the next gate | — |

Elsewhere (billing, ledger, settings), keep "credits": money screens should be literal.

## 4. Layout: HQ page
Target: the whole HQ fits a 1440×900 screen without scrolling.

- **Sidebar** (236px):
  - GUMPTION wordmark (Barlow Semi Condensed, letter-spacing 0.3em)
  - mission switcher
  - main navigation: HOME, FLIGHT PLAN, GO / NO-GO with an amber count, TELEMETRY, LOG
  - DEPARTMENTS: Build, Grow, Run, Stay legal, Raise
  - Fuel box at the bottom: balance, a bar, and TOP UP
- **Main** (padding 18px 24px 20px, gap 14px):
  1. **Mission header.** On the left: the eyebrow "GOOD MORNING, AISHA · MISSION STUDYBUDDY", the phase title, and a Sol status line with a green dot. On the right: the next-gate countdown, the key gate metric (e.g. waitlist 64 / 150), and an AUTO MODE button showing its credit estimate.
  2. **Ask Sol bar.**
  3. **Flight plan card** (hero depth): a title row with the pager (Earlier / Now / Later), then the arc, then four task tiles for the current phase. Each tile has a badge: SOL · VERIFIED, YOU · DONE, SOL · BUILDING · ≈ N CR, HOLD · AWAITING GO.
  4. **Three-column card grid:** GO / NO-GO, TELEMETRY, VEHICLE, CHANNELS, OVERNIGHT BURN, NEXT WINDOWS.
- Below 1100px wide: two columns. Below 700px: one column, with the sidebar collapsing to a top bar.

## 5. Flight plan arc component (`FlightPlanArc`)

**Props:** `milestones: { id, day, label, kind: 'gate' | 'milestone', status }[]`, `nowDay`, `seed` (company id), `onSelectMilestone(id)`.

**Geometry** (SVG viewBox 1000×205, container `aspect-ratio: 1000/205`):
- Circle radius R = 1400, centre (500, R + 72), so the top of the arc sits at y = 72.
- Angle per day: DEG = 1.1. The view looks ahead: the view centre is `nowDay + 10 + panOffset`. `angle(day) = (day − centre) × DEG`.
- Draw the full arc from −26° to +26° in `--track`. Draw the flown part (−26° to the "now" angle) in `--ink`, 3px wide. Add a "now" tick across the arc.
- Milestones within ±22° are visible. They fade to 45% opacity beyond ±18°, and the container edges fade with a mask (linear-gradient 0→7%→93%→100%).
- Labels sit above their markers, rotated by angle × 0.8 so they follow the curve.

**Hierarchy:**
- **Gates:** 22px marker. Upcoming gates have a 3px `--hold` ring with `--hold-bg` fill and a 15px label, plus a sub-label "IN 12 DAYS" in `--hold`. Passed gates are 16px, filled `--ink`, with the sub-label "PASSED · DAY 18".
- **The next milestone:** 14px marker, 13px label, sub-label "IN 4 DAYS".
- **Other milestones:** 9px marker, 11px label.
- Past markers are filled `--ink` with labels in `--muted`. Future markers are hollow.

**No overlapping labels.** Estimate each label's width as `chars × fontSize × 0.72 + 24`. Place labels in priority order (gates, then the next milestone, then the rest, nearest the centre first). Skip any label that would overlap an already placed one (with a 16px margin); its marker still shows. Recalculate on every pan.

**Readout:** fixed in the centre below the arc. It shows "T+{elapsed} DAYS" with the sub-line "MISSION ELAPSED · {NEXT GATE} IN {N} DAYS". While panned, it shows "VIEWING DAY {n} · PRESS NOW TO RETURN".

**Panning:**
- Earlier / Later shift the view by 12 days; Now resets it. Clamp the pan to the first and last milestones.
- Horizontal swipe or drag of more than 40px pans the same way. Keep vertical scroll working (`touch-action: pan-y`).
- Milestones animate their position over 0.7s, `cubic-bezier(0.33,0,0.2,1)`.

**Parallax depth** (back to front):
1. Far star field, about 170 stars, radius 0.5–1.1.
2. Near star field, about 45 stars, radius 1.0–1.9. Both fields come from a seeded random generator (seed = company id), so each company has its own stable sky. Fade them out with a radial mask.
3. A soft radial glow under the top of the arc, plus two faint echo arcs 24px and 48px below the main one.
4. The arc and milestones, with a drop shadow.

Each layer moves by a different amount when panning (pan × 2, 4.5, 1.5 and 1 respectively) and on pointer move (up to 4, 9, 12 and 20px), easing back on pointer leave. The readout stays fixed.

**Accessibility:**
- Respect `prefers-reduced-motion`: no parallax, and instant pans.
- The pager buttons are the accessible control. Swipe is a convenience, not the only way.
- Give the arc an `aria-label` summary, e.g. "Flight plan: Build phase, day 30. Next: Quiz feature in 4 days. Launch gate in 12 days." Provide a visually hidden list of the milestones.
- Each visible milestone is focusable and opens its evidence (tasks, proof, approvals) via `onSelectMilestone`.

**Data:** milestones come from the roadmap (`stage_gates` plus key tasks or outcomes). The day is the target date, or the completed date if done, measured from the company's start. Add a column or view for this if needed.

## 6. Components
- **Cards:** `--surface`, 1px `--line` border, 10px radius, `--shadow`, padding 12px 14px. Title in Barlow 13px uppercase, with an optional right-aligned meta label in `--muted`.
- **Tiles inside cards:** `--soft` background, 6px radius, `--shadow-sm`.
- **Badges:** Barlow 11px uppercase on `--go-bg`/`--go` or `--hold-bg`/`--hold`, or outlined in `--ink` for "in progress".
- **Buttons:**
  - Primary: `--ink` fill with `--surface` text.
  - Secondary: `--surface` with a `--line` border.
  - Labels: Barlow uppercase. Minimum height 34px on desktop, 44px on touch screens.
- **Numbers:** Barlow Semi Condensed, tabular figures. Changes shown as "+18%" in `--go`.
- **Logs** (Overnight burn): a three-column grid of time (muted, tabular), description, and credits (muted, tabular). Refunds are shown in `--go`.

## 7. Scope of the restyle
Apply this system to every screen, not just HQ. Use the same tokens, type, depth and glossary on: Approvals, Activity & runs, the five department pages, Evidence, Billing & credits, the Mentor cohort view, onboarding and settings. Add a light/dark preference in settings, defaulting to light.
