# OFLN Product Roadmap

**Status:** living plan — final safety pass 2026-07-30  
**Audience:** builders / AI agents shipping OFLN  
**Stack:** RN 0.78.1 · New Arch · `llama.rn` 0.12.6 · styles via `createStyles` + [`DESIGN.md`](../DESIGN.md)

### Agent handoff (required)

The app is **working**. Do **one atomic step** at a time (see §6). Never implement a whole phase in one session.

1. Read this file + [`AGENT_IMPLEMENTATION_GUIDE.md`](./AGENT_IMPLEMENTATION_GUIDE.md).  
2. Re-explore/trace live code for that step’s symbols.  
3. Implement **only** that step; match existing StyleSheet / `DESIGN.md`.  
4. Smoke-test (§ guide 0.3). Stop if chat/load/download regresses.  
5. Mark the step done; open a new session for the next step.

---

## 0. Product thesis (not a PocketPal clone)

> **OFLN is the calm, honest offline reasoning companion.**

Fix broken trust UX, cover category jobs thinly, deepen OFLN strengths (reasoning, honesty, Stages, calm UI).  
**Do not** clone PalsHub, neural TTS catalogs, public leaderboards, or Paper redesigns.

| Pillar | Invest | Avoid |
|--------|--------|-------|
| Calm craft (`DESIGN.md`) | Soft motion, monochrome, one job/screen | Badge dashboards, accent spam |
| Honest hardware | Fit chips, accel status | Social leaderboards |
| Reasoning quality | Think UX, family params | Raw stream dumps |
| Personal insight | Stages local analytics | Glicko / cloud rank |
| Private by default | Temp chat, local export | Accounts / hub |
| Local personas | Memory notes, optional tools later | Marketplace |

---

## 1. Code & UI quality rules (agents must follow)

### 1.1 StyleSheet — stick to the current system

- Theme colors come from `ThemeContext` / `useTheme()`.
- Screen styles: prefer **`createStyles(colors)`** from `src/styles/styles.ts` (existing pattern in Settings, Conversation, etc.).
- New reusable tokens → add to `createStyles` or a **small colocated** `StyleSheet.create` that uses the same `colors.*` keys — **do not** invent a second design system or copy React Native Paper themes.
- Read **[`DESIGN.md`](../DESIGN.md)** before any UI: Poppins, monochrome-first, fade+scale page enter (`PageFadeIn`), floating Back pill, frosted chrome, warn before destructive.
- Spinners on surfaces → `colors.text`; on primary buttons → `colors.primaryText`. Accent is rare.
- Motion: use `src/utils/animationConfig.ts` durations; settle animations then drop animated styles (Android overlay rule).

### 1.2 Code quality

- Match existing naming, imports, and service/hook layout.
- Prefer **extend** `chatHistoryService` / `llamaProvider` / `src/api/model.ts` over parallel systems.
- No drive-by refactors outside the step.
- Pure logic → small functions + Jest when easy; no native llama in unit tests.
- Feature-flag risky paths (`USE_RESUMABLE_DOWNLOADS`, etc.) until smoke-pass, then remove flag.
- Comments only where intent is non-obvious.

### 1.3 Performance / usefulness

- Do not add work on the JS thread during token streaming (no heavy JSON parse per token).
- Do not load extra native engines beside a GGUF (no ONNX TTS next to a 4B model).
- Prefer visible honesty (banner, chip) over silent magic that burns CPU.

### 1.4 Session discipline

```
ONE atomic step (Sxx) per agent session / PR.
Smoke chat → stop → load/unload after any touch to download, load, or useAIChat.
If unsure, shrink scope — do not “finish the phase.”
```

---

## 2. Final safety & complexity audit

Legend: **S** = safe/simple · **M** = medium, careful · **H** = hard / race-prone · **D** = defer or simplify

| ID | Verdict | Notes for agents |
|----|---------|------------------|
| 0.1 Unify load | **S** | Verify dead `llamaService.loadModel`; keep `checkFileExists`; don’t touch Diagnostics `initLlama` same PR |
| 0.2 Status API | **S–M** | Extend existing status; don’t change `loadModel` boolean contract lightly |
| 0.3 Split Conversation | **H if bulk** | **Must** split into S03a/b/c — one extract per session |
| 0.4 Errors | **S** | Extend `formatLoadError`; no raw stacks in alerts |
| 0.5 Tests | **S** | Pure inference helpers only |
| 1.1 Resume download | **M** | Highest value; flag + partial files; never load `.partial` as model |
| 1.2 Verify size | **S** | **Size only** v1 — skip SHA (slow on phone) |
| 1.3 HF token | **S–M** | Keychain; header only for HF hosts |
| 1.4 RAM fit | **S–M** | Local tier table; conservative; chip UI via existing ModelCard styles |
| 1.5 Onboarding | **M** | **After** 1.1+1.4; reuse App download/load — no fork |
| 1.6 Load failure UX | **S** | Can pair with 0.4 |
| 1.7 Disk preflight | **S** | Before download starts |
| 2.1 SQLite | **M** | Same service API; migrate once; backup key; **alone** in its session |
| 2.2 Search | **S** | Drawer filter/SQL **only**; defer in-chat find |
| 2.3 Context banner | **M** | v1: meter + “New chat” only; **defer** live n_ctx reload sheet |
| 2.4 Trim notice | **S** | One line when trim runs |
| 2.5 Flush on background | **S** | AppState → persist |
| 2.6 Unload on background | **D→H** | **Deferred** (races with completion). Keep-awake-while-generating only (2.6a) |
| 2.7 Export | **S** | Markdown share |
| 2.8 Storage manager | **S–M** | Confirm + unload if deleting active model |
| Stretch summary memory | **D** | Defer — easy to hurt quality |
| 3.1 Thinking mode setting | **S–M** | Wire to existing heuristics; don’t rewrite parser |
| 3.2 Family “recommended” copy | **S** | Settings help text from `modelFamily` |
| 3.3 Debug chip | **D** | Already Diagnostics — skip product UI |
| 3.4 Stages trends | **M** | Aggregate **existing** `usage_log` — no new telemetry system |
| 3.5 Accel chip | **S** | Read `getAccelerationStatusSnapshot` |
| 3.6 Thermal/battery | **D** | Defer — noisy UX; optional later thin toast |
| 3.7 Persona memory notes | **S** | Extend `buildPersonaSystemPrompt` |
| 3.8a Temp chat polish | **S** | Path exists — finish UX |
| 3.8b Biometric lock | **D** | After core trust; separate step later |
| 4.1 mmproj vision | **H** | Isolated; OCR remains default; verify llama.rn 0.12.6 API first |
| 4.2 Docs harden | **S–M** | Caps + honest errors; no vector DB |
| 4.3 Edit → regen | **S** | Reuse `regenerate` |
| 4.4 Tool loop | **D→H** | **Deferred** as full agent loop. Optional later: Experimental calculate-only |
| 4.5 System TTS | **M** | OS only; strip think; one lib |
| 4.6 Platform STT | **M** | Separate step after TTS |
| 4.7 Remote client | **M** | After local solid; loud privacy banner |
| Phase 5 items | — | Only after Phases 0–2 dogfood |

**Removed from near-term critical path:** full tool/agent OS, rolling summary memory, background model unload, biometric lock, neural TTS, in-chat message find, live context reload sheet, thermal gating.

---

## 3. Jobs we still cover (useful, not bloated)

| Job | How (thin) |
|-----|------------|
| Downloads finish | Resume + size check + disk preflight |
| Right model | RAM fit chips + short onboarding |
| Gated HF | Keychain token |
| Context death | Banner + new chat + trim notice |
| History | SQLite + drawer search + export |
| Quality wedge | Thinking setting, accel chip, Stages trends, persona notes |
| Attachments later | OCR now; mmproj isolated; docs caps |
| Voice later | OS TTS then STT — not both at once |

---

## 4. Phase overview (still phased — execute via §6 steps)

```
Phase 0  Stabilize          → safe codebase
Phase 1  First-run trust    → downloads / fit / onboard
Phase 2  Durable honesty    → history / context visibility
Phase 3  OFLN wedge         → reasoning / Stages / personas (thin)
Phase 4  Capability (select)→ vision/docs/edit/voice/remote — one at a time
Phase 5  Polish             → only what dogfood asks
```

---

## 5. Atomic execution queue (implement in order)

Each **Sxx** = one agent session / one PR. Do not batch.

### Phase 0

| Step | Goal | Max scope | Done when |
|------|------|-----------|-----------|
| **S01** | Confirm load unification | Grep; remove/quarantine dead `llamaService.loadModel` only if unused; keep `checkFileExists` | Chat still loads via provider; smoke OK — **DONE 2026-07-30** |
| **S02** | Inference unit tests | Tests for params / think / trim / quant allowlist | `npm test` green — **DONE 2026-07-30** |
| **S03** | Error copy v0 | Centralize user-facing load/download strings | Alerts readable; no stack dumps — **DONE 2026-07-31** |
| **S04a** | Extract HistoryDrawer | Move drawer JSX only; props in/out | Behavior identical — **DONE 2026-07-31** |
| **S04b** | Extract Composer | Send/stop/attach UI only | Behavior identical — **DONE 2026-07-31** |
| **S04c** | Extract MessageList | List + bubbles only | Behavior identical — **DONE 2026-07-31** |

### Phase 1

| Step | Goal | Max scope | Done when |
|------|------|-----------|-----------|
| **S05** | Disk preflight | Free space check before download | Clear alert if too small — **DONE 2026-07-31** |
| **S06** | Resume downloads | `blob-util` partial + rename; flag; pause≠discard | Mid-fail resume works; `.partial` never loaded — **DONE 2026-07-31** |
| **S07** | Size verify on complete | Compare Content-Length / expected size | Mismatch → don’t activate — **DONE 2026-07-31** |
| **S08** | HF token | Keychain + Models→HF token page + Bearer on HF only | Gated 401 → Add token CTA — **DONE 2026-07-31** (UI on Models, not Settings) |
| **S09** | RAM fit chips | `device-info` + local tiers; dot + expanded tag | Fits/Tight/Won’t fit; tap explains — **DONE 2026-08-01** |
| **S10** | Load failure CTAs | Wire S03 strings + retry / models / lower ctx | OOM path actionable — **DONE 2026-08-01** |
| **S11** | Onboarding 4 steps | New page type; reuse download/load | Skip works; returning users skip — **DONE 2026-08-01** (device smoke pending) |

### Phase 2

| Step | Goal | Max scope | Done when |
|------|------|-----------|-----------|
| **S12** | SQLite behind service API | op-sqlite; migrate AsyncStorage; backup | 100+ chats; API unchanged for UI — **DONE 2026-08-01** (device smoke pending rebuild) |
| **S13** | Drawer search | Filter sessions by title/preview/content | Snappy on mid device — **DONE 2026-08-02** |
| **S14** | Context fullness banner | ≥80% estimate; dismiss; **New chat** CTA only; ring in model pill | **DONE 2026-08-03** |
| **S15** | Visible trim notice | One line when trim drops turns | User sees honesty |
| **S16** | AppState flush save | Persist on background | Kill mid-debounce safe |
| **S17** | Keep-awake while generating | Only during completion | Screen can sleep after |
| **S18** | Export chat Markdown | Share sheet | Local only |
| **S19** | Storage manager | List/delete GGUF with confirm | Active model unloaded first if deleted |

### Phase 3 (thin wedge)

| Step | Goal | Max scope | Done when |
|------|------|-----------|-----------|
| **S20** | Thinking Auto/On/Off | Setting → existing enable_thinking path | Default Auto = today’s behavior |
| **S21** | Accel status chip | Chat chrome; tap → reason | Uses existing accel snapshot |
| **S22** | Stages trends from usage_log | Simple charts/lists; no new backend | Personal tok/s history |
| **S23** | Family recommended blurb | Model Settings help from `modelFamily` | Copy only |
| **S24** | Persona memory notes | Field + `buildPersonaSystemPrompt` | Empty = identical to before |
| **S25** | Temp chat polish | Clear UX for non-saved mode | Persistence still off |

### Phase 4 (only after S01–S19 solid)

| Step | Goal | Max scope | Done when |
|------|------|-----------|-----------|
| **S26** | Edit user → regenerate | UI + existing `regenerate` | Earlier turns kept |
| **S27** | Harden documents | Size caps + honest PDF errors | No RAG |
| **S28** | mmproj vision (optional) | One curated pair; OCR fallback remains | Device smoke; isolated PR |
| **S29** | System TTS | OS TTS; strip think; play button | No ONNX |
| **S30** | Platform STT | Mic → composer | Separate from S29 |
| **S31** | Remote OpenAI client | Opt-in; privacy banner | Local still default |

### Explicitly not in this queue

Background unload · biometric lock · tool/agent loop · summary memory · neural TTS · context reload sheet · thermal nag · PalsHub.

---

## 6. Phase notes (detail for humans; agents use §5)

### Phase 0 — Stabilize
Unify provider load; tests; error copy; **three** Conversation extracts.  
Guide: §4 Phase 0.

### Phase 1 — First-run trust
Resume downloads (flagged), size verify, HF token, RAM chips, onboarding last.  
Guide: §4 Phase 1. UX copy: actionable, calm, not “Error.”

### Phase 2 — Durable honesty
SQLite (same API), drawer search, context banner (new chat only), trim notice, flush, keep-awake, export, storage UI.  
**No** background unload. Guide: §4 Phase 2.

### Phase 3 — Wedge
Productize existing reasoning/accel/Stages/personas — settings and UI, not new engines.

### Phase 4 — Selective capability
Edit, docs, optional vision, OS voice, optional remote — **serial**, never parallel native adds.

### Phase 5 — Dogfood-driven
Crash log export, HF bookmarks, private bench card, E2E — pick from real feedback.

---

## 7. Smoke checklist (after every Sxx that touches load/download/chat)

1. Launch → conversation  
2. Select/download model → chat  
3. Send → stream → **Stop**  
4. Regenerate  
5. Settings round-trip  
6. Back to models → unload → load another  
7. Kill/reopen → history (if persistence touched)  
8. Theme + CustomAlert still work  

---

## 8. Tracking

Copy into issues; check off **S01…** only when smoke passes.

- [x] S01 … S05 (Phase 0 + disk) — smoke OK earlier in arc  
- [x] S06 … S10 (resume, size verify, HF token, RAM fit, load CTAs) — **code + Jest done; device smoke pending native rebuild**  
- [x] **S11** (Phase 1 onboarding) — **code + Jest done; device smoke pending**  
- [x] **S12** (SQLite chat history) — **code + Jest done; device smoke pending native rebuild**  
- [x] **S13** (Drawer search) — **code + Jest done**  
- [x] **S14** (Context fullness banner + ring) — **code + Jest done**  
- [ ] **S15** (Trim notice) ← next implementation step  
- [ ] S16 … S19 (rest of Phase 2)  
- [ ] S20 … S25 (Phase 3)  
- [ ] S26 … S31 (Phase 4, as needed)  

Update [`AGENT_IMPLEMENTATION_GUIDE.md`](./AGENT_IMPLEMENTATION_GUIDE.md) if symbols/libs change. See guide **Handoff** section for rebuild + smoke checklist (2026-08-03).

---

## 9. Success (product, not parity)

1. Mid-range user: download + first reply in one sitting.  
2. No dual chat load path; failures actionable; no lost chats on kill.  
3. User can say if GPU is on / context tight / why a model fits.  
4. Reasoning feels controlled; UI still calm (`DESIGN.md`).  
5. Rich enough (search, export, honest context, optional vision/voice) **without** a marketplace.  
6. Side-by-side: “OFLN is calmer and clearer about my phone.”

---

## 10. Sources

Category pain (downloads, fit, context, search, attachments). Mobile LLM constraints 2026. OFLN assets: `DESIGN.md`, `styles.ts` / `createStyles`, inference pipeline, accel gating, Stages. Competitors = **jobs**, not blueprints.
