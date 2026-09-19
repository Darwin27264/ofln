# Design System Spec

Portable design and interaction language for apps that should feel like **ofln**: clean, calm, easy to navigate, and consistent under motion. Use this file as the source of truth when designing or building another product in any category (chat, tools, media, editors, settings-heavy utilities, etc.).

**Do not** require ofln feature layout (message composers, model pickers, token meters). Preserve the *feel*: monochrome-first UI, soft transitions, logical page separation, and reliable overlays.

---

## 1. Design philosophy

1. **Calm and legible** — Prefer black/white/gray surfaces. The only brand accent is warm **lava gold**; reserve it for rare emphasis (progress, chips, links), not everyday chrome.
2. **One job per screen** — Each page has a clear purpose, one shared large title, related actions grouped into labeled sections, and a reliable way back.
3. **Motion is soft, not theatrical** — Enter from the center with fade + tiny scale. No sliding pages, no directional “push” chrome.
4. **Fewer colors, higher contrast** — Loaders, icons, and primary actions follow text/primary — not accent gold — unless the control sits on a filled primary or accent button.
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
| `primary` | Filled CTA backgrounds (inverts with theme: black ↔ white) |
| `primaryText` | Label/icon color **on** `primary` fills |
| `secondary` | Soft chip / list row background |
| `accent` | Warm lava gold — rare emphasis only (progress, persona chip, recommended badges, onboarding Next). **One** accent family; no secondary brand blues. |
| `accentText` | Label/icon color **on** `accent` fills (white on light gold; near-black on dark gold) |
| `success` / `warning` / `error` | Status only |
| `glass` | Fallback / reduced-transparency fill for frosted controls (~75% opacity) |
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
| accent | `#C9A227` (lava / AmbientHue deepLight) |
| accentText | `#FFFFFF` |
| success | `#34C759` |
| warning | `#FF9F0A` |
| error | `#FF453A` |
| glass | `rgba(255, 255, 255, 0.75)` |

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
| accent | `#F0D78C` (lava / AmbientHue softDark) |
| accentText | `#1A1608` |
| success | `#34C759` |
| warning | `#FF9F0A` |
| error | `#FF453A` |
| glass | `rgba(36, 36, 36, 0.75)` |

Ambient mode hues (empty-chat glow only — not theme tokens): default gold family above; temporary violet; perspective teal. Do not promote violet/teal into `accent`. All three families live in `src/components/hue/hueTokens.ts` — see §9.9 for how the hue field is built.

### 2.3 Color usage rules

- **Spinners / progress rings on page surfaces** → `text` (black on light, white on dark).
- **Spinners on filled primary buttons** → `primaryText`.
- **Labels on filled accent buttons** → `accentText` (never hard-code white).
- **Destructive actions** → `error` for icon + label; destructive alert buttons use filled `error`.
- **Do not** sprinkle `accent` on every interactive control. Prefer monochrome UI; keep gold rare (progress bar, persona chip, recommended highlight, onboarding Next / lava).
- **Never** introduce a second brand accent (no iOS blue, no Tailwind blue). Gold is the only accent.
- **Floating chrome** (pills, composer, side panels, context menus) → frosted glass (§9.7), not solid `card` / `background`.

### 2.4 Theme switch motion

- Overlay a full-screen black fade **above** the tree (`pointerEvents: none`).
- Dim to ~**0.35** opacity in **150 ms**, swap theme, fade out in **200 ms**.
- Never put the entire app under a lasting native-driven opacity wrapper.

---

## 3. Typography

- **Primary UI font:** Poppins (or a close geometric humanist sans if Poppins is unavailable).
- **Monospace:** system monospace for logs, paths, raw diagnostics, code-like output.
- **Page titles (`settingsTitle`):** **36 px**, weight **600**, `text` color, **`marginBottom: 40`**. Shared in `createStyles` — do **not** override per screen. Applies to Settings, Models, Personas, Perspective, Storage, About, editors, and every other hub/detail page.
- **Editors:** same large title + floating Back (cancel) + floating Save pill — no bordered 20 px X/Save chrome bars.
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
- **Back always available**: floating capsule bottom-left: filled `primary`, icon + “Back” in `primaryText`. Position = `max(insets.bottom, 28) + 12` on Android when edge-to-edge reports a 0 inset (otherwise GAP-only tweaks look like no change). Scroll pad tracks the same via `useScrollPadForFloatingBack`.
- **Safe areas / system bars**: full-bleed shell paints under transparent status + navigation. Only **status height** is padding at the app root (no bottom SafeArea pad — that pad was the solid black strip). Floating Back/composer use `insets.bottom + gap`. Status `barStyle` tracks theme.

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
- Card: `card` bg, `border`, radius 20, centered, horizontal inset ~28
- Title: 20 / semibold / `text`, centered
- Message: secondary color, readable multi-line, centered
- Buttons stacked full-width (not a side-by-side row):
  - **default** → filled `primary` + `primaryText`
  - **cancel** → `glass` + border + `text`
  - **destructive** → filled `error` + light label
  - Centered labels, ~14 px vertical padding, ~10 px gap between buttons
- Enter: opacity 0→1 in **240 ms**; scale **0.98→1** in **260 ms** (ease-out cubic — same language as page enter; no spring)
- Exit: ~**180 ms** fade/scale out (ease-in), then unmount
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

### 9.7 Frosted glass chrome (required for floating UI)

Do **not** rely on CSS `backdrop-filter` — it does nothing in React Native. Use a shared `FrostedGlass` wrapper over native blur (`@react-native-community/blur`) plus a light tint.

**Where it applies (keep these visually unified):**

| Surface | Variant | Notes |
| --- | --- | --- |
| Top action pills (menu, model, settings, new chat) | `chrome` | Border + radius ~30, overflow hidden |
| Bottom composer (+ button, input bar, attachment chip) | `chrome` | Same frost as top pills |
| Chat history side panel | `panel` | Full-height drawer; transparent shell + frost fill |
| Context / attach menus | `chrome` | Frosted rows, not solid `card` |

**Shared constants (`FROSTED_GLASS`):**

| Token | Value | Use |
| --- | --- | --- |
| `chromeBlurAmount` | **14** | Pills, input, menus |
| `chromeTintOpacity` | **0.45** | Tint over blur for compact chrome |
| `panelBlurAmount` | **18** | Side panel / large frost surfaces |
| `panelTintOpacity` | **0.55** | Slightly denser tint for readability on large areas |

**Tint base colors**

- Light: `rgba(255, 255, 255, tint)`
- Dark: `rgba(36, 36, 36, tint)`
- Inverted (e.g. temporary-mode on): swap to text-colored tint at the same opacity

**Implementation rules**

1. Host control: `backgroundColor: transparent`, `overflow: 'hidden'`, 1 px `border`.
2. `FrostedGlass` as `absoluteFill` behind content (or `variant="panel"` for drawers).
3. Fallback when blur/reduced transparency is unavailable: theme `glass` (~75% opacity).
4. Native rebuild required after adding the blur package (Metro reload is not enough).
5. Never leave a solid black/white bar under floating chrome — use edge fades (§9.9) instead.
6. While a frosted history/drawer panel is open, restyle **status bar + nav/home bar + Safe Area shell** to the panel’s opaque frost tone (`frostedPanelSystemBarColor`). Crossfade over ~**220 ms** (ease-out) in sync with the drawer — never snap. Restore `background` the same way on close.

### 9.8 Ambient hue field

Every glow surface — empty chat canvas, app-shell edge wash, onboarding lava, composer listening glow, response loader — is built from the shared primitives in `src/components/hue/`. Do not hand-roll another radial gradient stack.

**Falloff.** Blob alpha follows `peak · (1 − t²)³` via `hueStops()` (`hueRampStops()` when the blob should shift hue on the way out). This kernel reaches 0 at the rim **with zero slope**. A gradient that is still descending when it hits 0 leaves a slope break, and the eye reads that break as a drawn circle outline — which is what made the old 4-stop profile look fragmented. Never close a hue gradient with a linear tail.

**Layer count.** Prefer **3–4** large blobs per surface over many small ones. Each translucent layer composites as `a + b − ab`, so every overlap adds a lens-shaped seam with its own edge; more blobs multiply the artifact instead of hiding it.

**Oversize.** Draw blobs well past the area they should visibly cover (`HUE_BLOB_OVERSIZE`) so the rim sits off-screen or under other layers. A rim landing mid-screen reads as a circle however smooth its falloff.

**Grain.** The hue runs at low enough alpha that its outer falloff spans only a handful of 8-bit levels, which quantizes into concentric rings; uniform noise at ~3.5% (dark) / ~2.5% (light) randomizes which side of a quantization boundary each pixel lands on.

Grain belongs **inside** `HueBlob`, masked by the blob's own falloff, so it exists only where there is hue to band and fades out with it. A full-screen grain layer is the obvious implementation and the wrong one: it paints visible texture across the empty parts of the screen, and because `EdgeGlow` sits above every page at `zIndex: 2`, one such layer there tints the whole app.

Tile it with an SVG `Pattern`, never `<Image resizeMode="repeat">`. On Android `repeat` falls back to drawing the bitmap once at natural size in the top-left corner whenever its tile-mode postprocessor does not run, and that postprocessor allocates a bitmap the size of the view.

**Peak, not layer opacity.** `peak` is baked into the gradient stops, so blobs need no offscreen compositing pass. `HueBlob`'s `opacity` prop is a 0–1 *multiplier* for callers that animate brightness; values above 1 clamp, so bake the headroom into `peak` and rest the multiplier below 1.

**Motion.** Idle drift comes from `useHueDrift` — four sine-eased legs returning to the origin, plus a slower out-of-phase breathe (`HUE_BREATHE`). Translation alone is nearly invisible on oversized Gaussian blobs; the breathe is what the eye reads as motion. Always native-driven, applied as a transform on the parent so the SVG rasterizes once.

Mode changes (Normal ↔ Temporary ↔ Perspective) crossfade two **persistent** hue slots — never remount the field. Remounting restarted every drift loop and rebuilt eight masked SVGs in one frame, which read as a stutter. The second slot mounts lazily on the first mode change so an idle empty chat only pays for four blobs.

**Chat ↔ Settings.** `ConversationScreen` stays mounted (hidden) while Settings is open, so Back is a visibility flip rather than a full remount under `PageFadeIn`. The park is dropped when navigating anywhere else from Settings.

**Ambient motion preference** (Settings → Display preferences) gates idle drift only; the hue itself stays as a static wash. The response loader is exempt — it is progress feedback, not ambience.

### 9.9 Chat edge fades

On immersive chat (and similar full-bleed content), content scrolls under floating chrome. Soft vertical fades keep hierarchy without opaque bars.

| Edge | Height | Opacity ramp | Notes |
| --- | --- | --- | --- |
| Top (under pills) | **~72 px** | **0.75 → 0** downward | Behind pills (`zIndex` below controls) |
| Bottom (above composer) | **~40 px** fade into overlay | **0 → 0.75** downward | Never reach full opacity (no solid bar) |

- Fade color = theme `background`.
- Composer floats absolutely; message list uses padding so the last turn clears the input.
- Fade layers are `pointerEvents: 'none'`.

---

## 10. Motion “vocabulary” summary

| Moment | Motion |
| --- | --- |
| Enter page | Center fade + 2% scale-up, ~240–260 ms, then settle/unbind |
| Theme flip | Top dim overlay 150 → swap → 200 fade out |
| Alert / centered modal in | Same as page: fade 240 + scale 0.98→1 over 260 ms (ease-out; no spring) |
| Alert / centered modal out | Fade/scale ~180 ms (ease-in) |
| Menus / small panels | ~120–200 ms fade or short ease |
| Lists appear | Optional 25 ms stagger, max 200 ms |
| History panel | Spring / ease slide from left; frosted surface (not solid card) |
| Chat edge fades | Static gradient overlays; no motion required |
| Keyboard / input bar | Padding tracks keyboard height 1:1 (no nested timing / bounce) |

No slide-stack page chrome. No perpetual parent opacity. No solid opaque bars under floating frosted chrome.

---

## 11. Accessibility & platform notes

- Maintain strong contrast (black/white primary pair).
- Preserve touch targets ≥ ~44 px.
- Respect Safe Area / system bars: Android system bars stay **transparent**; app shell paints edge-to-edge underneath (page-clear under Back). Never pad a separate bottom SafeArea band. Float Back/composer with `insets.bottom + gap`.
- On Android, treat hardware back as dismiss for overlays first, then navigate.
- Prefer portable overlay alerts for cross-platform consistency.
- Frosted blur is a progressive enhancement — `glass` fallback must stay readable without blur.
- When a frosted side panel is open, match **shell canvas** to the panel’s opaque frost tone; system bars stay transparent so frost shell shows through.

---

## 12. Adaptation guide (other app categories)

When applying this system to a new product:

| Keep | Swap freely |
| --- | --- |
| Token set + light/dark invert primary | Feature screens and domain UI |
| Page fade/scale enter | Content widgets (timelines, canvases, players) |
| Floating Back pill | Input paradigms (composer, timeline scrubber, toolbar) |
| Frosted glass for floating chrome / drawers | Exact blur radius if platform-limited |
| Soft edge fades under floating chrome | Fade heights tuned to control size |
| Sectioned scrolling layouts | Domain terminology and icons |
| Neutral loaders | Charts, media previews, editors |
| Confirm-before-heavy/destructive | Exact copy and workflows |
| Absolute overlays (not opacity-trapped Modals) | Sheet vs full-screen for secondary flows |
| Poppins + monospace for raw data | Brand wordmark / marketing pages |

**Litmus test:** If you remove product-specific widgets, does the shell still feel like ofln — monochrome, soft center-fade pages, frosted floating chrome, clear hierarchy, calm alerts? If yes, the design transfer succeeded.

---

## 13. Quick checklist for implementers

- [ ] Light + dark tokens match §2 (or intentional brand-safe remap of the same roles)
- [ ] `glass` is ~75% opacity (not fully opaque, not clear)
- [ ] Every route uses the same page enter animation and unbinds after settle
- [ ] Theme toggle uses overlay dim, not opacity-wrapping the tree
- [ ] Alerts/menus are absolute overlays with defined enter/exit timing
- [ ] Floating chrome (pills, composer, side panel, menus) uses shared `FrostedGlass` (§9.7)
- [ ] Chat (or similar) uses soft top/bottom edge fades — never a solid bar (§9.9)
- [ ] Ambient glow uses the shared hue primitives — zero-slope falloff, few large blobs, grain (§9.8)
- [ ] Spinners are black/white appropriate to surface
- [ ] Screens: title → sections → content → floating Back
- [ ] Destructive / long jobs confirm first with honest copy
- [ ] Accent is lava gold only (`#C9A227` / `#F0D78C`); labels on accent fills use `accentText`
- [ ] Page titles use shared `settingsTitle` (36 / mb 40) with no per-screen overrides
- [ ] Screens: title → sections → content → floating Back (+ Save pill on editors)

---

*Derived from the ofln mobile app design language. Specs describe interaction and visual system — not a single product feature set.*
