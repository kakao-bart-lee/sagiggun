---
name: Some Love Admin
description: Operator desk for reviewing Threads intros — accession strip + split proof, telop chroma on ink.
colors:
  ink: "#1c1f24"
  ink-elevated: "#262a31"
  card: "#e4e2de"
  field: "#eceae6"
  on-card: "#2f3338"
  muted-on-card: "#5c6168"
  fog: "#c8c6c2"
  fog-muted: "#8b9098"
  edge: "#3d424a"
  yellow: "#e6d05a"
  red: "#ea6a80"
  blue: "#6a99f1"
  card-line: "#c5cdd8"
  thumb: "#cfcbc6"
typography:
  brand:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.2
  display:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.15
  title:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.3
  body:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
  button:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
  seal:
    fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  page-x: "24px"
  page-y: "32px"
components:
  stamp-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.yellow}"
    rounded: "{rounded.lg}"
    padding: "12px 20px"
    height: "48px"
  stamp-danger:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.red}"
    rounded: "{rounded.lg}"
    padding: "12px 20px"
    height: "48px"
  stamp-info:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.blue}"
    rounded: "{rounded.lg}"
    padding: "12px 20px"
    height: "48px"
  accession-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.on-card}"
    rounded: "{rounded.lg}"
    padding: "12px"
    width: "148px"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.on-card}"
    rounded: "{rounded.xl}"
    padding: "20px"
  status-seal:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.yellow}"
    rounded: "{rounded.full}"
    size: "44px"
  text-input:
    backgroundColor: "#ffffff"
    textColor: "{colors.on-card}"
    rounded: "{rounded.md}"
    padding: "12px"
    height: "44px"
---

## Overview

Some Love admin is an **Operate** surface: a single operator clears a batch of Threads intros. The visual world is **Accession Register × Telop Ink** — soft charcoal blotter, warm paper accession cards, and desaturated outlined seals in yellow / red / blue. Contrast is intentionally eased for long evening sessions (no pure black / bleach white). The first viewport is a **session strip** of profile cards over a **split proof desk** (photos + DM source left; draft + approve right). There is no sidebar and no KPI strip.

Copy never uses 「입수」. Prefer 「새 프로필」, 「오늘 세션」, 「대기」.

## Colors

### Surfaces

- **Ink** (`{colors.ink}` — #1c1f24): soft charcoal page ground.
- **Ink elevated** (`{colors.ink-elevated}` — #262a31): stamp / seal fills slightly above the blotter.
- **Card** (`{colors.card}` — #e4e2de): warm paper accession cards and panels.
- **Field** (`{colors.field}` — #eceae6): inputs slightly lighter than cards.
- **On-card** (`{colors.on-card}` — #2f3338): body text on paper.
- **Fog** (`{colors.fog}` — #c8c6c2): primary type on ink (not pure white).

### Telop accents

Used as **outline + label chroma**, slightly desaturated to cut glare.

- **Yellow** (`{colors.yellow}` — #e6d05a): primary stamp CTA, COLLECTED/대기 seals.
- **Red** (`{colors.red}` — #ea6a80): APPROVED seals, delete stamp.
- **Blue** (`{colors.blue}` — #6a99f1): selected card ring, DRAFTED seals, compose stamp, focus ring.

### Neutrals

- **Fog muted** / **muted on card**: secondary labels.
- **Edge** (`{colors.edge}` — #3d424a): borders instead of pure black.
- **Thumb** (`{colors.thumb}`): empty photo placeholders.

### Surface-scoped palette

The accents and fog type above are tuned for the **ink** ground and fail as text
on **paper**: against `{colors.card}` they measure yellow 1.2:1, fog 1.32:1,
blue 2.48:1, red 2.65:1 — far under the 4.5:1 floor. Messages and links inside
panels kept shipping unreadable because of this.

So the tokens are re-pointed per surface in `globals.css`, not per call site.
Anything painted with a paper background (`bg-card` / `bg-field` / `bg-thumb`)
swaps in darker paper twins, and every descendant inherits them:

- **Yellow on paper** — #7a5c00 (4.83:1)
- **Red on paper** — #b3243f (5.01:1)
- **Blue on paper** — #1f4fa8 (5.92:1)
- **Fog / fog-muted on paper** — fall back to on-card / muted-on-card

Paper cards still hold dark chips — stamp buttons, status seals, the drag-active
drop zone — and each resets to the ink values. **Invariant: a dark chip must
declare a `bg-ink-*` class**, or it will pick up the paper palette and go dark
on dark. Write text colors with the plain tokens (`text-yellow`, `text-fog`);
the surface decides the rest.

### Person colors

Surfaces that show 남/여 identify each person by hue, and that hue is
surface-scoped exactly like the accents above. There is one pair per ground:

|  | on paper | on ink |
|---|---|---|
| 남 | #1f4fa8 (5.92:1) | #6a99f1 (5.86:1) |
| 여 | #b3243f (5.01:1) | #ea6a80 (5.42:1) |

Painting the paper pair on ink measures 2.16:1 and 2.55:1 — legible in a
mockup, unreadable in use. A data mark carrying a person color needs the
contrast against **its own track or fill**, not only against the page.

Color alone never carries gender: every person-colored element ships beside a
남/여 label. Where a surface reserves color for people, status and actions stay
on yellow and the neutrals, so a hue never means both a person and a state.

## Typography

One family: **Pretendard Variable** (CDN) with system-ui fallback. Operate scale — brand 22 / display 32 / title 20 / body 14 / button 15 / seal 11. Emphasis via weight (700–800) and size, not serif display or kickers.

## Layout

- Max width ~72rem (`max-w-6xl`), horizontal padding `{spacing.page-x}`.
- **Session strip**: horizontal scroll of `{component.accession-card}` (148px wide).
- **Proof desk**: two columns from `lg` up; stacks on mobile.
- Empty session uses a dashed ink-border prompt under the strip — not metric cards.

## Elevation & Depth

Flat. Depth comes from **2px edge borders** and **double-ring stamp outlines**. No soft drop shadows, no glass. Avoid pure-black 3px frames.

## Shapes

- Cards / stamps: `{rounded.lg}`–`{rounded.xl}` (10–12px).
- Inputs: `{rounded.md}` (8px).
- Status seals: `{rounded.full}` circles ~44px with 3px accent ring.

## Components

`top-bar` — Wordmark 「Some Love」 left; text links 목록 / 새 프로필 / 로그아웃 right on fog/fog-muted. Stays on ink; never a light SaaS chrome bar.

`session-strip` — Display title 「오늘 세션」, optional subtitle, yellow `{component.stamp-primary}` 「새 프로필」, then the card rail.

`accession-card` — Paper card: index, thumb, @handle, meta, status seal. Selected state: blue 2px border. Default border `{colors.edge}`.

`status-seal` — Elevated ink disc, accent ring + label. Yellow=대기, blue=초안, red=승인/게시.

A state is drawn as a **ring, never a filled block**, and it never repeats the
label or the icon of the action that produced it: a button says what it does
(「좋다고 하셨어요」), the state says what is now true (「승낙 받음」). A state that
echoes its button reads as a second button. Where a surface reserves red for a
person color, that surface's settled state takes a neutral fog ring instead of
red, and the seal's chroma follows the surface it lands on — a yellow seal on a
paper-backed chip measures 1.2:1 and must swap to `on-card`.

An undo beside a state stays in the quiet tier: the state outweighs the control
that reverses it.

`stamp-primary` / `stamp-danger` / `stamp-info` — Min height 48px, 2px accent border, double outer ring, elevated-ink fill, accent label. Hover fills with the accent and flips text to ink.

`panel` — Paper proof surfaces for photos, raw DM, extracted fields with edge borders.

`text-input` / textarea — Field fill, 2px edge border, on-card text. Focus uses blue ring (`:focus-visible`).

## Do's and Don'ts

### Do

- Keep one primary yellow stamp per viewport when possible.
- Let the strip select the desk; preserve strip + split as the hybrid composition.
- Use telop colors on seals and CTAs at moderated saturation; keep reading surfaces warm paper, not bleach white.
- Prefer `{colors.edge}` borders and `{colors.fog}` type on ink for long sessions.
- Say 「새 프로필」 / 「오늘 세션」 — never 「입수」.

### Don't

- Don't ship a SaaS sidebar, KPI metric row, or indigo badge chrome.
- Don't fill the page with solid yellow/red/blue blocks — accents outline, they don't drench Operate reading.
- Don't add kickers/eyebrows above headings.
- Don't reintroduce Airtable marketing bands, cream editorial canvas, or pricing pills.
