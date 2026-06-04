---
name: AdMind AI
description: AI-powered Meta Ads platform for campaign creation and performance analytics.
colors:
  navy-void: "#060D1F"
  navy-surface: "#0B1628"
  navy-sidebar: "#070F1E"
  navy-elevated: "#121F38"
  navy-muted: "#0F1D36"
  violet-command: "#7C3AED"
  violet-soft: "#A78BFA"
  violet-deep: "#6D28D9"
  cyan-signal: "#06B6D4"
  slate-ink: "#E2E8F0"
  slate-secondary: "#CBD5E1"
  slate-dim: "#64748B"
  rose-alert: "#F43F5E"
  emerald-live: "#10B981"
  amber-budget: "#F59E0B"
typography:
  display:
    fontFamily: "'Bricolage Grotesque', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  headline:
    fontFamily: "'Bricolage Grotesque', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  title:
    fontFamily: "'Inter', sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "'Inter', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'Inter', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  mono:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "10px"
  md: "12px"
  lg: "14px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.violet-command}"
    textColor: "#FFFFFF"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.violet-deep}"
    textColor: "#FFFFFF"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-dim}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.navy-elevated}"
    textColor: "{colors.slate-secondary}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  input-default:
    backgroundColor: "{colors.navy-muted}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.xl}"
    padding: "10px 16px"
  chip-filter:
    backgroundColor: "transparent"
    textColor: "{colors.violet-soft}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  chip-filter-active:
    backgroundColor: "{colors.violet-command}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  card-default:
    backgroundColor: "{colors.navy-surface}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
---

# Design System: AdMind AI

## 1. Overview

**Creative North Star: "The Mission Control"**

AdMind AI is a deep-space operations room. The screen is a workstation where every data point is actionable intelligence: spend against budget, CTR trends, AI campaign briefs awaiting approval. The near-black navy backgrounds are not aesthetic theater — they are the absence of distraction. This is a tool that knows what it is.

The interface is dense without being cluttered, dark without being dramatic, and precise without being cold. Numbers own the screen. The violet command accent marks exactly what deserves attention: primary actions, active states, AI agent signals. The cyan accent marks live data and real-time indicators. Anything not one of these two roles uses the slate neutral ramp. The palette earns its restraint: color is information, not decoration.

This system explicitly rejects: warm neutral backgrounds in the Notion/Coda/Craft register (cream, sand, paper, linen — the whole OKLCH hue 40-100 band below chroma 0.06), and visual theater in the Vercel/Linear marketing register (heavy gradient heroes, dramatic typography reveals, motion for brand expression). The user is mid-task with real budget at stake. The tool should disappear into their work.

**Key Characteristics:**
- Near-black navy as the workspace foundation, not a stylistic statement
- Two semantic accents: violet (command, action, AI) and cyan (live, signal, data stream)
- JetBrains Mono for all numeric data — financial precision deserves monospaced clarity
- Tonal depth through background layering, not shadows
- Motion at 150-200ms to convey state change, never to entertain

## 2. Colors: The Deep Station Palette

The palette is a tonal system in two axes: depth (background layers from void to elevated) and signal (violet command + cyan live-data).

### Primary
- **Violet Command** (#7C3AED): The system's action color. Primary buttons, active nav states, AI agent indicators, interactive focus rings. Used sparingly — its rarity is its authority.
- **Soft Violet** (#A78BFA): Active navigation text, AI accent prose, sidebar highlights. The readable face of Violet Command.
- **Deep Violet** (#6D28D9): Primary button hover state and pressed state. Slightly darker than command violet.

### Secondary
- **Cyan Signal** (#06B6D4): Live data indicators, secondary chart series, accent callouts. Pairs with Violet Command as the "data stream" to violet's "command center."

### Tertiary
- **Rose Alert** (#F43F5E): Destructive actions, error states, budget threshold warnings. Reserved for "this requires your attention now."
- **Emerald Live** (#10B981): Online indicators, success states, positive performance trends.
- **Amber Budget** (#F59E0B): Budget warnings (not critical), performance watchpoints, secondary chart series.

### Neutral
- **Navy Void** (#060D1F): Page background. The deepest layer.
- **Navy Surface** (#0B1628): Cards, panels, content containers. One layer above void.
- **Navy Sidebar** (#070F1E): Sidebar and persistent navigation. Slightly darker than surface.
- **Navy Elevated** (#121F38): Secondary panels, nested containers. One layer above surface.
- **Navy Muted** (#0F1D36): Input backgrounds, muted highlights.
- **Slate Ink** (#E2E8F0): Primary body text and headings. High contrast on navy.
- **Slate Secondary** (#CBD5E1): Secondary labels, nav text at rest.
- **Slate Dim** (#64748B): Placeholder text, timestamps, tertiary labels, muted foreground.
- **Border Whisper** (rgba(148, 163, 184, 0.10)): Card and panel borders. Barely-there separation.

**The One-Accent Rule.** Violet Command (#7C3AED) appears on ≤15% of any given screen's visual weight. It marks what matters. If three elements on a screen are violet, one is wrong.

**The No-Tint Prohibition.** The neutral background ramp runs from navy void to navy elevated. Never tint toward warm or sand. These are space-blue neutrals, not editorial-warmth neutrals.

## 3. Typography

**Display Font:** Bricolage Grotesque (sans-serif fallback)
**Body/UI Font:** Inter (system-ui fallback)
**Data Font:** JetBrains Mono (monospace fallback)

**Character:** Bricolage Grotesque carries page-level headings with a confident geometric weight. Inter handles everything interactive: buttons, labels, nav, body copy. JetBrains Mono owns every number that represents financial data — budget figures, KPIs, percentages, IDs. The three families have no overlap in role; they never compete.

### Hierarchy
- **Display** (Bricolage Grotesque, 500, 1.5rem / 24px, 1.5): Page-level headings in the TopNav and section headers. Not used in compact UI or data tables.
- **Headline** (Bricolage Grotesque, 500, 1.25rem / 20px, 1.5): Card and panel headings. Sparingly — most product UI headings should use Title, not Headline.
- **Title** (Inter, 600, 1rem / 16px, 1.5): Section sub-headings within panels, label headings, modal titles.
- **Body** (Inter, 400, 0.875rem / 14px, 1.5): All prose, descriptions, AI agent message text. Max line length 65ch for conversational copy.
- **Label** (Inter, 500, 0.75rem / 12px, 1.5): Tags, chips, nav items, form labels, timestamps, secondary metadata.
- **Mono** (JetBrains Mono, 700, 0.875rem / 14px, 1.5): KPI values, spend figures, campaign IDs, CTR/ROAS/CPC values, all financial numerics.

**The Mono-Owns-Numbers Rule.** Any figure that represents a financial metric, percentage, or performance value uses JetBrains Mono. Inter for that same number is a violation — it signals "this is prose, not data," which is the wrong message when budget is on the line.

**The Heading Scope Rule.** Bricolage Grotesque is reserved for navigational headings and card titles. It is never used for button labels, form inputs, table cells, or UI-state text. Its appearance should signal "you've arrived somewhere," not "I want this to look branded."

## 4. Elevation

This system is **tonal-flat**: depth is expressed through background color, not shadows. The navy ramp runs void (#060D1F) → sidebar (#070F1E) → surface (#0B1628) → elevated (#121F38) → muted (#0F1D36), and every structural layer reads its position from that ramp. Borders (rgba(148, 163, 184, 0.10)) mark separation; the background tint signals depth.

Shadows appear in exactly one context: detached floating elements (dropdown menus, modals, tooltips, search result overlays). Even here, the shadow is diffuse and dark, not a decorative glow.

### Shadow Vocabulary
- **Floating** (`0 12px 32px rgba(0, 0, 0, 0.50)`): Dropdowns, modals, command palette overlays. The only shadow in the system.
- **Soft** (`0 4px 24px rgba(0, 0, 0, 0.30)`): Optional on cards that must float above a complex background. Use sparingly.

**The Tonal Priority Rule.** Before reaching for a shadow, ask whether a background shift alone solves the depth problem. It almost always does. Shadows are reserved for truly detached floating layers.

## 5. Components

### Buttons

Buttons signal confidence: crisp radius, immediate hover feedback, no decoration beyond color.

- **Shape:** Gently rounded (16px / 1rem radius). Not pill-shaped, not square.
- **Primary:** Violet-to-deep-violet gradient background (135deg, #7C3AED → #6D28D9), white text, 8px top/bottom × 16px left/right padding for standard size; 6px × 12px for compact.
- **Hover:** Opacity 90%, no layout change. Transition 150ms ease-out.
- **Ghost:** Transparent background, rgba(255,255,255,0.05) border, Slate Dim text. Hover: Navy Elevated background, Slate Secondary text.
- **Destructive:** Rose Alert (#F43F5E) background, white text. Same shape as primary.
- **Disabled:** 50% opacity, pointer-events none. No separate color treatment.

### Cards / Containers

- **Corner Style:** 16px radius (rounded-2xl). All cards and panels share this radius.
- **Background:** Navy Surface (#0B1628) for standard cards. Navy Sidebar (#070F1E) for the sidebar itself.
- **Shadow Strategy:** None by default. Floating cards (modals, dropdowns) use the Floating shadow.
- **Border:** 1px solid rgba(148, 163, 184, 0.10). Consistent across all cards.
- **Internal Padding:** 20px (1.25rem) standard. 16px (1rem) for compact panels. 24px (1.5rem) for spacious sections.

### Inputs / Fields

- **Style:** Semi-transparent background (rgba(255,255,255,0.04)), 1px border rgba(255,255,255,0.10), 16px radius.
- **Focus:** Border shifts to rgba(124, 58, 237, 0.60) (violet). No glow or box-shadow. The border shift is the entire focus indicator.
- **Placeholder text:** Slate Dim (#64748B). Must meet 4.5:1 contrast against the input background — verify this before shipping any new input variant.
- **Error:** Border becomes Rose Alert (#F43F5E). No background change.
- **Disabled:** 50% opacity. Non-interactive cursor.

### Navigation (Sidebar)

- **Background:** Navy Sidebar (#070F1E).
- **Rest state:** Slate Dim (#64748B) text, transparent background.
- **Hover:** Slate Secondary text, no background.
- **Active:** rgba(124, 58, 237, 0.18) background, Soft Violet (#A78BFA) text, 2px Soft Violet left-edge indicator. The indicator is structural — it marks position, not decoration.
- **Typography:** Inter 500 (label size, 0.875rem). Bricolage Grotesque is never used in nav.
- **Collapsed state:** Icons only. Tooltip on hover for label.

### Chips / Filter Pills

- **Rest:** Transparent background, Soft Violet (#A78BFA) text, 1px border rgba(124, 58, 237, 0.30), full radius (9999px).
- **Active/selected:** Violet Command (#7C3AED) background, white text, no border.
- **Typography:** Inter 500, label size (0.75rem).

### AI Chat Interface (Signature Component)

The AI agent chat is the primary interaction surface of the product. Its components have a distinct vocabulary from the rest of the UI.

- **User message bubble:** Violet gradient background (135deg, #7C3AED → #6D28D9), Slate Ink text, 18px radius, full-radius top-right corner for the "outgoing" feel. Right-aligned.
- **AI message bubble:** rgba(255,255,255,0.05) background, 1px border rgba(148,163,184,0.10), Slate Ink text, 18px radius. Left-aligned with 28px AI avatar (violet-to-cyan gradient, Sparkles icon).
- **Typing indicator:** Three Soft Violet dots, staggered bounce animation at 150ms intervals.
- **Campaign brief card:** Violet-to-cyan gradient background (135deg, rgba(124,58,237,0.18) → rgba(6,182,212,0.08)), violet border, structured data grid inside. This is the primary output artifact — it must feel more authoritative than a regular message.
- **Input field:** Full-width at bottom, dark transparent background, send button activates when there is content.

## 6. Do's and Don'ts

### Do:
- **Do** use JetBrains Mono for every financial figure, KPI value, percentage, and campaign ID.
- **Do** keep the navy background ramp as the primary depth signal. Background tint conveys hierarchy before any other technique.
- **Do** use Violet Command sparingly. Its presence should tell the user "act here" or "this is the AI." If multiple elements compete in violet, one is wrong.
- **Do** give every interactive component all states: default, hover, focus, active, disabled. A component without a focus state is an accessibility failure.
- **Do** use skeleton states for data loading, not centered spinners. The layout should hold its shape while data loads.
- **Do** keep motion at 150-200ms and use it only for state changes (hover, load, transition between states). Not for entrance choreography or page decoration.
- **Do** keep the AI agent's voice in the user's language (French or English as the session establishes). The interface is bilingual; never mix languages within a single sentence or label.

### Don't:
- **Don't** use warm-neutral backgrounds. The entire OKLCH band from L 0.84-0.97 at chroma < 0.06 hue 40-100 — cream, sand, paper, bone, linen, parchment — is prohibited. This is the exact aesthetic AdMind AI is not.
- **Don't** use gradient text (`background-clip: text` with a gradient background). Prohibited across the system. Emphasis comes from weight or color, never from decorative effects.
- **Don't** add border-left or border-right greater than 1px as a colored accent stripe on cards, alerts, or callouts. Use background tints or full borders instead.
- **Don't** use Bricolage Grotesque in UI labels, button text, table cells, or any component smaller than a card heading. Its scope is page-level and panel-level headings only.
- **Don't** build identical card grids (icon + heading + text, repeated). If four metrics need to be shown, use a KPI bar or data table, not four identical decorated cards.
- **Don't** treat the dark theme as an excuse for visual theater. No floating orbs, pulsing gradient backgrounds, particle systems, or glow effects as decorative elements. The palette is the absence of distraction, not a stage set.
- **Don't** use modals as the first answer to any interaction. Exhaust inline and progressive disclosure alternatives. The AI chat interface and the campaign brief card are examples of the right pattern: the complex output appears inline, not in a modal.
- **Don't** use display-type visual theater borrowed from the Vercel or Linear marketing aesthetic (heavy hero typography, dramatic entrance animations, color-drenched landing sections). Those are brand surfaces. This is a product. The user came to do work.
