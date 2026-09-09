# ofln styles

Living styles reference for ofln. Full interaction/motion system lives in [`DESIGN.md`](./DESIGN.md). Tokens: `src/context/ThemeContext.tsx`. Shared layout styles: `src/styles/styles.ts` (`createStyles`).

---

## Color roles

| Role | What it is | What it is not |
| --- | --- | --- |
| **Primary** | Black ↔ white invert. Filled CTAs, Back pill, selected rows, user bubbles. | Brand color / accent |
| **Accent** | Warm **lava gold** (same family as onboarding lava + ambient glow). Rare emphasis. | Everyday buttons, spinners, borders |
| **Status** | `success` / `warning` / `error` only | Decoration |

### Accent (single family)

Keep one gold — do not add a second brand (no iOS `#007AFF`, no Tailwind blue).

| Mode | `accent` | `accentText` (on accent fills) | Source |
| --- | --- | --- | --- |
| Light | `#C9A227` | `#FFFFFF` | Lava / AmbientHue `deepLight`, onboarding Next |
| Dark | `#F0D78C` | `#1A1608` | Lava / AmbientHue `softDark`, onboarding Next |

**Use accent for:** progress bar, chat persona chip, recommended badges, downloaded indicators, markdown links, onboarding Next, rare “Use”/highlight fills that intentionally sit off the mono primary.

**Use `accentText` on those fills** — never hard-code `#fff`.

**Ambient-only hues** (empty chat glow, not theme tokens): default gold; temporary violet; perspective teal. Do not promote violet/teal into `accent`.

### Surfaces (light / dark)

Monochrome canvas: white/`#0A0A0A` background, soft `surface` / `card`, slate secondary text, hairline `border`. Primary inverts with theme. See `DESIGN.md` §2 for the full hex table.

---

## Page titles

One pattern everywhere — `styles.settingsTitle`:

| Property | Value |
| --- | --- |
| Font | Poppins |
| Size | **36** |
| Weight | **600** |
| Color | `colors.text` |
| `marginBottom` | **40** |

Do **not** override `marginBottom` or `fontSize` per screen (Settings, Models, Personas, Perspective, Storage, About, HF, Diagnostics, Performance, editors, onboarding steps).

### Editors (persona / perspective)

Same title as Settings — no 20 px bordered X + Save bar.

```
[ settingsTitle — “Create Persona” / “Edit perspective” … ]
[ scrolling form ]
[ Floating Back — cancel ]     [ Save pill — primary ]
```

---

## Layout skeleton

```
[ Large page title — settingsTitle ]
[ Optional short description ]

[ SECTION ]
[ rows / tiles ]

[ Floating Back — bottom-left ]
[ Optional floating actions — bottom-right ]
```

- Screen padding ~**20**
- Scroll bottom pad clears floating Back (`useScrollPadForFloatingBack`)
- Hub tiles ~radius **30**; list cards ~**12–14**
- Frosted glass for floating chrome (pills, composer, drawers) — see `DESIGN.md` §9.7

---

## Motion (short)

| Moment | Spec |
| --- | --- |
| Page enter | Fade 240 ms + scale 0.98→1 over 260 ms; unbind after settle |
| Theme flip | Dim overlay 150 → swap → 200 out (never opacity-wrap the tree) |
| Alert in/out | Same enter language; ~180 ms exit |

---

## Quick checks

- [ ] Only gold accent; persona chip / Next / lava share that family
- [ ] Primary stays black/white invert for CTAs and Back
- [ ] Every page title is `settingsTitle` without local margin/size overrides
- [ ] Editors use title + floating Back/Save, not a top chrome bar
- [ ] Spinners on surfaces use `text`, not accent
