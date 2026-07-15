# Design System Spec

Portable design and interaction language for apps that should feel like **ofln**: clean, calm, easy to navigate, and consistent under motion. Use this file as the source of truth when designing or building another product in any category (chat, tools, media, editors, settings-heavy utilities, etc.).

**Do not** require ofln feature layout (message composers, model pickers, token meters). Preserve the *feel*: monochrome-first UI, soft transitions, logical page separation, and reliable overlays.

---

## 1. Design philosophy

1. **Calm and legible** — Prefer black/white/gray surfaces. Color is for meaning (error, warning, success, rare accent), not decoration.
2. **One job per screen** — Each page has a clear purpose, a large title, related actions grouped into labeled sections, and a reliable way back.
3. **Motion is soft, not theatrical** — Enter from the center with fade + tiny scale. No sliding pages, no directional “push” chrome.
4. **Fewer colors, higher contrast** — Loaders, icons, and primary actions follow text/primary — not brand blues — unless the control sits on a filled primary button.
5. **Stable after animation** — Animated opacity/transform must not stay permanently attached to page trees (breaks Android overlays). Settle, then drop animated styles.
6. **Warn before expensive/destructive work** — Confirm with a clear alert; say what will happen and roughly how long/costly it is when relevant.

---

## 2. Themes & color tokens

Support **light** and **dark**. Persist the user’s choice. Switch with a brief dim overlay (do **not** wrap the whole app tree in animated opacity).

### 2.1 Token names (required)

| Token | Role |
| --- | --- |
| `background` | Screen canvas |
| `surface` | Recessed panels, secondary wells |
| `card` | Elevated / bordered content blocks |
| `overlay` | Light scrims / frosted hints |
| `text` | Primary body copy & neutral icons/spinners |
| `textSecondary` | Supporting copy |
| `textTertiary` | Hints, meta, disabled-looking labels |
| `border` / `borderLight` | Hairlines and card edges |
| `primary` | Filled CTA backgrounds (inverts with theme) |
| `primaryText` | Label/icon color **on** `primary` fills |
| `secondary` | Soft chip / list row background |
| `accent` | Optional emphasis only (links, rare highlights) — **not** for every spinner |
| `success` / `warning` / `error` | Status only |
| `glass` | Translucent cancel / frosted controls |
| `transparent` | Explicit transparent |

### 2.2 Reference palette (ofln)

**Light**

| Token | Hex / value |
| --- | --- |
| background | `#FFFFFF` |
| surface | `#F8F9FA` |
| card | `#FFFFFF` |
| overlay | `rgba(0, 0, 0, 0.1)` |
| text | `#000000` |
| textSecondary | `#334155` |
| textTertiary | `#94A3B8` |
| border | `#E2E8F0` |
| borderLight | `#F1F5F9` |
| primary | `#000000` |
| primaryText | `#FFFFFF` |
| secondary | `#EAEAEA` |
| accent | `#2563EB` |
| success | `#34C759` |
| warning | `#FF9F0A` |
| error | `#FF453A` |
| glass | `rgba(255, 255, 255, 0.8)` |

**Dark**

| Token | Hex / value |
| --- | --- |
| background | `#0A0A0A` |
| surface | `#141414` |
| card | `#1A1A1A` |
| overlay | `rgba(255, 255, 255, 0.1)` |
| text | `#FFFFFF` |
| textSecondary | `#E5E7EB` |
| textTertiary | `#9CA3AF` |
| border | `#2A2A2A` |
| borderLight | `#1F1F1F` |
| primary | `#FFFFFF` |
| primaryText | `#000000` |
| secondary | `#2A2A2A` |
| accent | `#3B82F6` |
| success | `#34C759` |
| warning | `#FF9F0A` |
| error | `#FF453A` |
| glass | `rgba(26, 26, 26, 0.8)` |

### 2.3 Color usage rules

- **Spinners / progress rings on page surfaces** → `text` (black on light, white on dark).
- **Spinners on filled primary buttons** → `primaryText`.
- **Destructive actions** → `error` for icon + label; destructive alert buttons use filled `error`.
- **Do not** sprinkle `accent` on every interactive control. Prefer monochrome UI; keep accent rare.

### 2.4 Theme switch motion

- Overlay a full-screen black fade **above** the tree (`pointerEvents: none`).
- Dim to ~**0.35** opacity in **150 ms**, swap theme, fade out in **200 ms**.
- Never put the entire app under a lasting native-driven opacity wrapper.

---

## 3. Typography

- **Primary UI font:** Poppins (or a close geometric humanist sans if Poppins is unavailable).
- **Monospace:** system monospace for logs, paths, raw diagnostics, code-like output.
- **Page titles:** ~36 px on hub screens (Settings-style), ~28–32 px acceptable on denser utility screens; weight 600–700; `text` color; generous bottom margin (~24–40).
- **Section labels:** 12–13 px, semibold, uppercase or near-uppercase, `textSecondary`, modest letter-spacing.
- **Row titles:** 16 px (primary actions may go 18 px), semibold.
- **Row subtitles:** 12–13 px, `textSecondary`.
- **Body / help text:** 14–16 px, `textSecondary`, line-height ~1.4–1.5.
- Avoid stacking multiple competing headlines on one screen.

---

## 4. Spacing, radius, elevation

| Element | Spec |
| --- | --- |
| Screen padding | ~20 px |
| Bottom scroll padding | leave ~80–100 px clear for floating Back |
| Card / list row radius | 12–14 px typical; large hub tiles ~30 px |
| Primary pill / Back button | radius ~30 px |
| Alert dialog | radius 20 px, padding 24 px, max width ~400 |
| Borders | 1 px `border` on cards and rows |
| Shadows | Prefer border + surface contrast over heavy multi-layer shadows |
| Icon in rows | 24 px typical; hero/important rows may use ~28–30 px |

---

## 5. Layout & information architecture

Category-agnostic structure shared by most screens:

```
[ Large page title ]
[ Optional 1–2 sentence description ]

[ SECTION LABEL ]
[ Primary action / content rows ]

[ SECTION LABEL ]
[ Secondary tools ]

[ Floating Back pill — bottom-left ]
```

### Principles

- **Hub screens** (e.g. Settings-like): 2-column tile grid of equal weight destinations; each tile = icon + short label.
- **Detail screens**: single scrolling column; important actions visually larger at the top.
- **Tools / diagnostics-style screens**: group by severity and frequency — everyday actions first, heavy/experimental later; live output below actions that produce it.
- **Separation**: use section labels + spacing, not dense card nesting.
- **Back always available**: floating capsule bottom-left: filled `primary`, icon + “Back” in `primaryText`.
- **Safe areas**: respect top/bottom insets; status bar style tracks theme (`dark-content` on light, `light-content` on dark).

Adapt content freely (timeline, canvas, clipboard, editor) — keep hierarchy, spacing, and back pattern.

---

## 6. Page transition animations

### Spec (required feel)

| Property | Value |
| --- | --- |
| Style | Fade + slight scale from center (no slide) |
| Opacity | `0 → 1` |
| Scale | `0.98 → 1` |
| Fade duration | **240 ms** |
| Scale duration | **260 ms** |
| Easing | Ease-out cubic (entering) |
| Driver | Native driver |
| Scope | **Per-page mount** wrapper (each route remount gets its own animation) |

### Implementation rules

1. Start values set before paint (layout effect) so pages never flash fully opaque then snap.
2. After finish, **unbind** opacity/scale styles (plain `flex: 1` view) so overlays/alerts work on Android.
3. Apply the same wrapper to **every** navigable page — no special-case hard cuts.
4. Avoid long-lived parent opacity animations around the navigation tree.

---

## 7. Shared animation durations & easing

Centralize durations so UI motion stays cohesive:

| Token | Duration | Use |
| --- | --- | --- |
| `FAST` | 120 ms | Buttons, toggles, micro-feedback |
| `STANDARD` | 200 ms | Menus, panels, most UI chrome |
| `PAGE` | ~220–250 ms | Historical page budget; prefer page fade 240/260 above |
| `SLOW` | 300 ms | Stretch / thinking / emphasis |

**Easing**

| Name | Curve | Use |
| --- | --- | --- |
| `STANDARD` | cubic-bezier(0.4, 0, 0.2, 1) | Default Material-like |
| `EASE_OUT` | cubic ease-out | Enters (pages, cards) |
| `EASE_IN` | sharper ease-in | Exits |
| `DECELERATE` / `ACCELERATE` | as needed | Rare directional motion |

**List stagger (optional):** ~25 ms between items, cap total delay ~200 ms.

**Always** prefer native-driven opacity/transform for motion that must stay at 60 fps.

---

## 8. Popups, menus, and overlays

### 8.1 Confirm / alert dialogs

Use a **custom in-tree absolute overlay** (not platform `Modal` when the tree may use native opacity/transform). Pattern:

- Full-screen host, high z-index / elevation
- Dim scrim: `rgba(0,0,0,0.5)`, tap-outside dismisses when cancelable
- Card: `card` bg, `border`, radius 20, centered, horizontal inset 20
- Title: 20 / semibold / `text`
- Message: secondary color, readable multi-line
- Buttons in a row:
  - **default** → filled `primary` + `primaryText`
  - **cancel** → `glass` + border + `text`
  - **destructive** → filled `error` + light label
- Enter: opacity 0→1 in **200 ms**; scale **0.9→1** with light spring (tension ~50, friction ~7)
- Exit: ~**150 ms** fade/scale out, then unmount
- Android hardware back dismisses when cancelable

`showAlert(title, message, buttons)` API — fall back to system alert only if the custom host is unavailable.

### 8.2 Secondary overlays (menus, log viewers, sheets)

Same reliability rule: prefer **absolute overlays inside the screen** over nested `Modal` when parents animate with the native driver.

Examples of ofln-style overlays:

- Full-screen detail viewers (logs): header bar + scroll body + bottom action row
- Context / attach menus: anchored or centered card with dimmed backdrop
- Keep Enter/Exit soft (fade; optional small scale). Avoid slidey banners as the primary language.

### 8.3 When to interrupt with an alert

Show a confirm when the action is:

- **Destructive** (clear data, delete)
- **Expensive / long-running** (multi-minute work, heavy media, re-init of large resources)
- **Risky to current session** (may slow, unload, or destabilize in-progress work)

Copy should say **what**, **why it might feel slow**, and what to **cancel** vs continue. Prefer Cancel as the safe default.

---

## 9. Controls & components

### 9.1 Primary CTA

- Height comfortable for thumb (~44–52 px tap)
- Filled `primary`, label `primaryText`, radius 12–30 depending on context
- Disabled: lower opacity and/or `surface` + muted text

### 9.2 Navigation / action rows

- Card background, 1 px border, horizontal layout: icon | title+subtitle | chevron
- Important rows may be taller (~88 px min) with larger type
- Two-up compact actions (e.g. path / clear) share a row with equal flex

### 9.3 Hub tiles (settings-style)

- Large rounded block (~radius 30), icon above or beside short label
- Equal visual weight; 2-across grid with small gutters (~5–10)

### 9.4 Floating Back

- Absolute bottom-left (~15–20 from edges)
- Pill: `primary` fill, Ionicons `arrow-back` + “Back”, `primaryText`
- Never rely on gesture-only back for primary navigation affordance

### 9.5 Loading

- `ActivityIndicator` / circular progress in **neutral** `text` (or `primaryText` on primary fills)
- Progress % text in `textSecondary`
- Avoid colored brand spinners

### 9.6 Icons

- Outline Ionicons (or equivalent outline set) by default
- Color = surrounding text context (`text`, `textSecondary`, or `primaryText` on fills)
- Error actions use `error`

---

## 10. Motion “vocabulary” summary

| Moment | Motion |
| --- | --- |
| Enter page | Center fade + 2% scale-up, ~240–260 ms, then settle/unbind |
| Theme flip | Top dim overlay 150 → swap → 200 fade out |
| Alert in | Fade 200 + spring scale from 0.9 |
| Alert out | Fade/scale ~150 |
| Menus / small panels | ~120–200 ms fade or short ease |
| Lists appear | Optional 25 ms stagger, max 200 ms |

No slide-stack page chrome. No perpetual parent opacity.

---

## 11. Accessibility & platform notes

- Maintain strong contrast (black/white primary pair).
- Preserve touch targets ≥ ~44 px.
- Respect Safe Area / system bars.
- On Android, treat hardware back as dismiss for overlays first, then navigate.
- Prefer portable overlay alerts for cross-platform consistency.

---

## 12. Adaptation guide (other app categories)

When applying this system to a new product:

| Keep | Swap freely |
| --- | --- |
| Token set + light/dark invert primary | Feature screens and domain UI |
| Page fade/scale enter | Content widgets (timelines, canvases, players) |
| Floating Back pill | Input paradigms (composer, timeline scrubber, toolbar) |
| Sectioned scrolling layouts | Domain terminology and icons |
| Neutral loaders | Charts, media previews, editors |
| Confirm-before-heavy/destructive | Exact copy and workflows |
| Absolute overlays (not opacity-trapped Modals) | Sheet vs full-screen for secondary flows |
| Poppins + monospace for raw data | Brand wordmark / marketing pages |

**Litmus test:** If you remove product-specific widgets, does the shell still feel like ofln — monochrome, soft center-fade pages, clear hierarchy, calm alerts? If yes, the design transfer succeeded.

---

## 13. Quick checklist for implementers

- [ ] Light + dark tokens match §2 (or intentional brand-safe remap of the same roles)
- [ ] Every route uses the same page enter animation and unbinds after settle
- [ ] Theme toggle uses overlay dim, not opacity-wrapping the tree
- [ ] Alerts/menus are absolute overlays with defined enter/exit timing
- [ ] Spinners are black/white appropriate to surface
- [ ] Screens: title → sections → content → floating Back
- [ ] Destructive / long jobs confirm first with honest copy
- [ ] Accent color stays rare

---

*Derived from the ofln mobile app design language. Specs describe interaction and visual system — not a single product feature set.*
