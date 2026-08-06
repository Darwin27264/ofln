# OFLN Product Roadmap

**Status:** living plan — last track update **2026-08-06** (**PAUSED** — S29 TTS + S27b docs complete; next = S28 optional or S30 STT)  
**Audience:** builders / AI agents shipping OFLN  
**Stack:** RN 0.78.1 · New Arch · `llama.rn` 0.12.6 · styles via `createStyles` + [`DESIGN.md`](../DESIGN.md)

### Agent handoff (required)

The app is **working**. Do **one atomic step** at a time (see §5 tables). Never implement a whole phase in one session.

1. Read this file + [`AGENT_IMPLEMENTATION_GUIDE.md`](./AGENT_IMPLEMENTATION_GUIDE.md) **Handoff — PAUSED** (full truth).  
2. Re-explore/trace live code for that step’s symbols.  
3. Implement **only** that step; match existing StyleSheet / `DESIGN.md`.  
4. Smoke-test (§7 + TTS/PDF when relevant). Stop if chat/load/download regresses.  
5. Mark the step done in **both** plan docs; open a new session for the next step.  
6. **Do not commit** unless the user asks.

### Agent pass-off prompt (2026-08-06)

Paste the following as the next agent’s user message (or attach this file + the guide Handoff):

```
You are continuing OFLN (React Native offline LLM app). Deliberate session pause 2026-08-06 after S27b + S29.

# Role
One atomic step only. Prefer extend over rewrite. Match StyleSheet / createStyles + DESIGN.md. Do not commit unless asked.

# Read first (required order)
1. docs/AGENT_IMPLEMENTATION_GUIDE.md — full **Handoff — session status (2026-08-06) — PAUSED**
2. docs/IMPROVEMENT_PLAN.md — status line, Phase 4 table, §8 tracking, this pass-off block
3. Trace live code before coding — docs can drift; source of truth is the repo

# Product / stack
- RN 0.78.1, New Arch bridgeless, llama.rn 0.12.6
- Calm monochrome UI (DESIGN.md)
- Live chat: useNativeCompletion: true → aiChatService.nativeCompletion via useAIChat
- Conversation model auto-load effect deps: [selectedGGUF] only (never add modelStatus/context)
- Dual unload when needed: releaseAllLlama() + llamaProvider.unloadModel()
- Large uncommitted working tree — do not commit unless asked

# Already done (do not re-litigate)
## Phase 0–3 + policy
- S01–S23 as prior arc (load, downloads, HF token, RAM, onboarding, sqlite, history search, context UI, trim, flush, keep-awake, export, storage, ModelRuntimePolicy, thinking, accel, Stages, policy blurb)
- S24 deferred (persona memory); S25 removed
- S26 edit→regenerate; S32 backup/restore

## S27 + S27b DONE
- Pipeline: documentHelpers budgets/refusals; documentParsingService 4MB PDF; image OCR budget inject
- Chat attach: Camera + Gallery + File (PDF); pending PDF preview; on send extractTextFromAttachment → buildAttachmentTextForPrompt → textForPrompt
- Hardened: sendPrepareRef, isOcrRunning blocks, sanitizeChatDocumentFileName, isLikelyPdfMeta, keepLocalCopy, delayed pending clear, preferredExt pdf for content://

## S29 DONE — System TTS
- react-native-tts@4.1.1 + patches/react-native-tts+4.1.1.patch
- ttsService uses NativeModules.TextToSpeech ONLY (never import package default — crashes unlinked)
- prepareSpeechText = stripThinkBlocks + light markdown + 4000 char cap
- MessageList assistant actions: Copy · Regenerate · tokens/s | flex spacer ≥24 | Speak (rightmost)
- stopSpeaking on beginGeneration + Stop; Conversation speakingVisibleIndex
- Android Manifest TTS_SERVICE queries
- Quality note: poppy/robotic on VM is expected; OS TTS is by design; neural/Piper deferred (RAM vs GGUF)

# Tests
npm test → 27 suites / 161 tests green after S29

# Recommended next (pick ONE with user if ambiguous)
1. S30 — Platform STT (natural continuance after TTS)
   - Mic → composer text; permissions; one native lib; monochrome mic on ChatComposer
   - Research New Arch viability of @react-native-voice/voice vs alternatives before installing
2. S28 — mmproj vision (optional, hard, device-only)
   - Must read llama.rn 0.12.6 mmproj API first
   - One curated GGUF+mmproj pair; wire projectorPath load
   - Live path today ALWAYS OCR+textForPrompt — vision requires real path changes + device smoke
   - OCR fallback always remains

# Hard constraints
- Surgical diffs; one step
- Keep useNativeCompletion: true
- No Conversation selectedGGUF effect dep changes
- Dual unload preserved
- Do not implement S24, neural TTS, RAG, S28+S30 together
- Native rebuild still owed for keychain/device-info/sqlite/keep-awake/tts
- Do not commit unless asked

# If finishing current step
- Mark DONE in both plan docs; update Handoff; leave npm test count
- Short summary: files, smoke, test count

# Explicitly out of queue
Persona memory (S24), neural TTS catalogs, RAG, tool agent loop, biometric lock, committing without ask
```

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
| 2.8 Storage manager | **S–M** | Confirm + unload if deleting active model; also clear-all chat history (separate UI section) |
| Stretch summary memory | **D** | Defer — easy to hurt quality |
| 3.1 Thinking mode setting | **S–M** | Wire to existing heuristics; don’t rewrite parser |
| 3.2 Family “recommended” copy | **S** | **Done (S19p/S23)** — `policyRecommendedBlurb` |
| 3.3 Debug chip | **D** | Already Diagnostics — skip product UI |
| 3.4 Stages trends | **M** | Aggregate **existing** `usage_log` — no new telemetry system |
| 3.5 Accel chip | **S** | Read `getAccelerationStatusSnapshot` |
| 3.6 Thermal/battery | **D** | Defer — noisy UX; optional later thin toast |
| 3.7 Persona memory notes | **S** | Extend `buildPersonaSystemPrompt` |
| 3.8a Temp chat polish | **—** | **Removed** — existing temp UI is sufficient (toggle contrast fix only if needed) |
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
| **S09** | RAM fit chips | `device-info` + local tiers; dot (left of size) + expanded tag | Fits/Tight/Won’t fit; tap explains; memo includes `ramFit` — **DONE 2026-08-01** |
| **S10** | Load failure CTAs | Wire S03 strings + retry / models / lower ctx | OOM path actionable — **DONE 2026-08-01** |
| **S11** | Onboarding 4 steps | New page type; reuse download/load | Skip works; returning users skip — **DONE 2026-08-01** (device smoke pending) |

### Phase 2

| Step | Goal | Max scope | Done when |
|------|------|-----------|-----------|
| **S12** | SQLite behind service API | op-sqlite; migrate AsyncStorage; backup | 100+ chats; API unchanged for UI — **DONE 2026-08-01** (device smoke pending rebuild) |
| **S13** | Drawer search | Filter sessions by title/preview/content | Snappy on mid device — **DONE 2026-08-02** |
| **S14** | Context fullness banner | ≥80% estimate; dismiss; **New chat** CTA only; ring in model pill | **DONE 2026-08-03** |
| **S15** | Visible trim notice | One line when trim drops turns | **DONE 2026-08-03** |
| **S16** | AppState flush save | Persist on background | **DONE 2026-08-03** |
| **S17** | Keep-awake while generating | Only during completion | **DONE 2026-08-03** |
| **S18** | Export chat Markdown | Share sheet | **DONE 2026-08-03** |
| **S19** | Storage manager | List/delete GGUF with confirm; clear-all chat history section | **DONE 2026-08-04** (+ chat clear 2026-08-05) |

### Side work (quality — not a Phase 3 product chrome item)

| Step | Goal | Max scope | Done when |
|------|------|-----------|-----------|
| **S19p** | ModelRuntimePolicy (GGUF-first prompts/templates) | Dynamic family+size policy; family sanitize stubs; default-source system prompts | Multi-model coherent chat without a prompt DB — **DONE 2026-08-04** |

### Phase 3 (thin wedge)

| Step | Goal | Max scope | Done when |
|------|------|-----------|-----------|
| **S20** | Thinking Auto/On/Off | Setting → existing enable_thinking path | Default Auto = today’s behavior — **DONE 2026-08-04** |
| **S21** | Accel status (log + quick-panel tag) | After load → View Logs INFO; selected row label | **DONE 2026-08-04** (no top-chrome chip) |
| **S22** | Stages trends from usage_log | Recent runs (bottom, 5 + expand); no new backend | **DONE 2026-08-04** |
| **S23** | Family recommended blurb | Model Settings help from policy | Copy only — **DONE 2026-08-04** (via `policyRecommendedBlurb` on Model Settings) |
| **S24** | Persona memory notes | **Deferred** — wider memory system needs planning | (not in immediate queue) |

### Phase 4 (only after S01–S19 solid)

| Step | Goal | Max scope | Done when |
|------|------|-----------|-----------|
| **S26** | Edit user → regenerate | UI + existing `regenerate` path | Earlier turns kept — **DONE 2026-08-05** |
| **S27** | Harden document **pipeline** | Caps + honest PDF *parser* errors + budget inject | Parser/OCR path hardened — **DONE 2026-08-05** (see gap) |
| **S27b** | **Chat document attach** | Attach menu → document picker → extract on send | User can attach a PDF; S27 parser used end-to-end — **DONE 2026-08-05** |
| **S28** | mmproj vision (optional) | One curated pair; OCR fallback remains | Device smoke; isolated PR |
| **S29** | System TTS | OS TTS; strip think; play button | No ONNX — **DONE 2026-08-06** |
| **S30** | Platform STT | Mic → composer | Separate from S29 |
| **S31** | Remote OpenAI client | Opt-in; privacy banner | Local still default |
| **S32** | Device backup / restore | Chats JSON + full ZIP; model catalog re-download (parallel cap 2, smallest first); system Save/Open pickers | Storage → Backup; merge/replace; schema v1 — **DONE 2026-08-05** |

### Explicitly not in this queue

Background unload · biometric lock · tool/agent loop · summary memory · neural TTS · context reload sheet · thermal nag · PalsHub · **S25 temp polish (removed)** · **S24 persona memory (deferred until designed)**.

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
**Phase 2 code-complete 2026-08-04** (device smoke still pending native rebuild).  
**No** background unload. Guide: §4 Phase 2.

### Phase 3 — Wedge
Productize existing reasoning/accel/Stages/personas — settings and UI, not new engines.  
**S19p (2026-08-04):** GGUF-first **ModelRuntimePolicy** landed — see §8a.  
**S20 (2026-08-04):** Thinking Auto/On/Off per-model via `thinkingMode` + `resolveThinkingModeForTurn` (jinja_enable only).  
**S21 (2026-08-04):** Accel INFO log after load; selected-row tag in model quick panel (no top-chrome chip).  
**S22 (2026-08-04):** Stages **Recent runs** at bottom (preview 5 + View more) + trend from `usage_log`.  
**Quick selector polish (2026-08-05):** Sticky **Browse models** / **Clear persona** footers; tab bar fixed; shared chrome padding.  
**Storage / Models / Personas polish (2026-08-05):** Storage **Clear all** chats; Models section **Local**; no card “Downloaded” badge; Personas bottom **Add** pill; S09 dot left of size + memo fix for async RAM.  
**S23** blurbs: already on Model Settings via `policyRecommendedBlurb` (do not re-add a second help system).  
**S24** Persona memory notes: **deferred** — needs wider memory-system planning (not next).  
**S25** Temp chat polish: **removed** — current temp UI is good; active toggle contrast fix only (2026-08-05).  
**S26 (2026-08-05):** Edit user message → truncate later turns → regenerate (`editUserAndRegenerate` + long-press Copy/Edit menu).  
**S27 (2026-08-05):** Document **pipeline** harden — 4MB PDF cap, encrypted/scanned honest refusals, `documentInjectCharBudget` for OCR and extract.  
**S27b (2026-08-05, harden 08-06):** Chat File (PDF) attach + extract on send; re-entrancy and filename safety.  
**S29 (2026-08-06):** OS TTS — Speak rightmost on assistant row; strip think; stop on gen; patch-package for AGP. Neural deferred.  
**Session pause 2026-08-06:** docs + pass-off prompt.  
**Recommended next:** **S30** (STT) or **S28** (optional vision). One only.

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
- [x] **S12** … **S19** (Phase 2) — **code + Jest done; device smoke pending native rebuild**  
- [x] **S19p** (ModelRuntimePolicy — system prompts + family template stubs) — **code + Jest done 2026-08-04**  
- [x] **S23** (family recommended blurb on Model Settings) — **done with S19p**  
- [x] **S20** (Thinking mode Auto/On/Off) — **code + Jest done 2026-08-04**  
- [x] **S21** (Accel status → app logs + quick-panel tag) — **code + Jest done 2026-08-04**  
- [x] **S22** (Stages trends — Recent runs bottom / 5 + View more) — **code + Jest done 2026-08-04**  
- [ ] **S24** (Persona memory notes) — **deferred** (wider memory system; plan before implement)  
- [x] ~~S25~~ (Temp chat polish) — **removed** (current UI kept; toggle contrast fixed 2026-08-05)  
- [x] **S26** (Edit user → regenerate) — **code + Jest done 2026-08-05**
- [x] **S27** (Harden document pipeline) — **parser/OCR budget only 2026-08-05**
- [x] **S27b** (Chat document attach) — **code + harden + Jest 2026-08-05/06**
- [ ] **S28** (mmproj vision, optional) — hard; device-only
- [x] **S29** (System TTS) — **code + Jest 2026-08-06** (Speak rightmost; OS only)
- [ ] **S30** (Platform STT) ← **recommended next** if continuing voice
- [ ] S31 (remote client, as needed)

Update [`AGENT_IMPLEMENTATION_GUIDE.md`](./AGENT_IMPLEMENTATION_GUIDE.md) if symbols/libs change. See guide **Handoff — PAUSED** for rebuild + smoke + full pass-off.

---

## 8a. S19p — ModelRuntimePolicy (landed 2026-08-04)

**Why:** Broken/off-topic replies on multi-model mobile chat are often **wrong chat templates** or **bloated system prompts on tiny models**, not missing cloud data.  
**What:** Pure, dynamic policy — **no database**. Resolved each load/settings/send from filename heuristics + family packages.

### Layer stack (do not invert)

1. **GGUF** `tokenizer.chat_template` when valid (preferred always)  
2. **User** per-file settings (`@model_settings_{file}` + `systemPromptSource`)  
3. **`resolveModelPolicy(modelName)`** — family + size tier defaults  
4. **Family Jinja stub** only when sanitize/metadata forces a fallback  

### New / key files

| File | Role |
|------|------|
| `src/services/inference/modelPolicy.ts` | `resolveModelPolicy`, `policyRecommendedBlurb`, `POLICY_SCHEMA_VERSION` |
| `src/services/inference/modelFamily.ts` | Families: `qwen3`, `deepseek-r1`, `smollm3`, `gemma4`, `phi`, `generic` + `resolveSizeTier` + thinking strategy |
| `src/services/inference/familyTemplates.ts` | Fallback Jinja: ChatML+think / Gemma turns / Phi tags |
| `src/services/inference/promptDefaults.ts` | Short positive system prompts by size/family |
| `src/services/modelSettingsService.ts` | `systemPromptSource: 'default' \| 'user'`; `getDefaultSettingsForModel` |
| `src/services/ggufSanitizeService.ts` | Sanitize pad **v5** embeds family id + family stub (not ChatML-for-all) |
| `llamaProvider` / `nativeCompletion` | Inject **family** stub when metadata/template missing |
| `__tests__/inference/modelPolicy.test.ts` | Policy + defaults unit tests |

### Agent rules when extending

- **New HF GGUF with healthy template:** usually **zero code** — load + use GGUF.  
- **New family:** add profile in `modelFamily.ts` + stub in `familyTemplates.ts` (and sampling tweak in `modelPolicy` if needed).  
- **Do not** add a prompt/recipe SQLite table or remote catalog for this.  
- **S20 DONE:** user Thinking Auto/On/Off via `thinkingMode` + `policy.thinking.strategy` (`jinja_enable` / `always_on` / `none`).  
- Prefer **native GGUF template**; only replace multimodal/oversized/broken Jinja.  
- User `systemPromptSource: 'user'` must never be auto-overwritten; `default` may refresh on policy upgrades.  

### Device smoke (S19p)

1. Load **Qwen3.5 0.8B** → short answers; Model Settings shows tiny-ish default prompt + policy blurb  
2. Load **Gemma 4 E2B** (if present) → coherent chat (not ChatML token soup if stub path used)  
3. Custom system prompt → save → reopen still custom after app restart  
4. Reset settings → returns to policy defaults for that filename  
5. Diagnostics log: sanitize decision includes `familyId` when pad runs  

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
