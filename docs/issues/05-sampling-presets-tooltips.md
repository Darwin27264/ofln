# Add sampling parameter presets (Creative, Balanced, Precise) and help tooltips

**Labels:** `good first issue`, `enhancement`, `ui`, `settings`  
**Difficulty:** Beginner  

---

### Description

Currently, users who want to tweak model generation behavior (temperature, `top_p`, `top_k`, repeat penalty) must manually adjust sliders without context. For newcomers to local LLMs, understanding the effect of temperature (e.g. 0.2 vs 0.8) can be confusing.

We want to add:
1. **Three one-tap preset chips:**
   - **Precise / Coding:** Low temperature (`0.2`), `top_p: 0.8`, repeat penalty `1.1` (deterministic, factual answers, code generation).
   - **Balanced:** Default temperature (`0.7`), `top_p: 0.9` (natural conversational flow).
   - **Creative:** High temperature (`0.9`), `top_p: 0.95` (brainstorming, storytelling).
2. **Short helper tooltips / subtitles:** Explaining in one clear sentence what each slider does.

### Design Guidelines

- Follow [`DESIGN.md`](../../DESIGN.md):
  - Segmented control or horizontal chip group using `theme.surface` and `theme.primary` for the selected chip.
  - Subtitle tooltips in `theme.textSecondary` with subtle typography.
  - Smooth animation between preset selections.

### Code Pointers

- Settings screen: [`src/screens/ModelSettingsScreen.tsx`](../../src/screens/ModelSettingsScreen.tsx) or chat configuration modal.
- Parameter types: [`src/types/model.ts`](../../src/types/model.ts) and [`src/services/inferencePerfParams.ts`](../../src/services/inferencePerfParams.ts).
- Tests: [`__tests__/inferencePerfParams.test.ts`](../../__tests__/inferencePerfParams.test.ts).

### Definition of Done

1. Three preset buttons appear at the top of the parameter tuning section.
2. Tapping a preset automatically updates the underlying slider values.
3. Sliders can still be manually fine-tuned (which un-highlights the presets).
4. Informative 1-line tooltips describe the effect of Temperature and Top-P.
5. All checks pass (`npm run typecheck`, `npm run lint:ci`, `npm test`).
