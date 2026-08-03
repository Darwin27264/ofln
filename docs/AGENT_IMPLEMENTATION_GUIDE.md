# OFLN Agent Implementation Guide

**Companion to:** [`IMPROVEMENT_PLAN.md`](./IMPROVEMENT_PLAN.md) (atomic steps **S01–S31**)  
**Code map date:** 2026-08-03 · **Last handoff:** 2026-08-03  
**Stack:** RN **0.78.1**, New Architecture (bridgeless), `llama.rn` **0.12.6**

The app is **working**. Prefer surgical, clean code. **One Sxx step per session** (small adjacent steps may merge if the user asks).

---

## Handoff — session status (2026-08-03)

### Completed (code in working tree — **not committed**)

| Steps | Summary |
|-------|---------|
| **S01–S05** | Unified load path; inference unit tests; user-facing errors; HistoryDrawer / ChatComposer / MessageList extracts; disk preflight |
| **S06–S07** | Resumable downloads (`.gguf.partial` + `.chunk`, pause≠discard, `USE_RESUMABLE_DOWNLOADS`); size verify before activate |
| **S08** | HF token in Keychain; UI on **Models → HF token** (`HfTokenScreen`), not Settings; Bearer only for `huggingface.co` |
| **S09** | RAM fit: green/amber/red **dot** (collapsed) + color **tag** (expanded); tap → explanation |
| **S10** | Load-failure CTAs: Retry / Models / Lower context (auto step-down `n_ctx` then retry) |
| **S11** | First-run onboarding; 4 steps; `@has_completed_onboarding`; Skip / optional Download; About → **Review onboarding** |
| **S12** | Chat history → **op-sqlite** (`ofln_chats.sqlite`, WAL); same API; migrate + `@chat_history_async_backup` |
| **S13** | History drawer search — title / preview / message snippets; in-memory filter + `searchChats` SQL |
| **S14** | Context fullness: ≥80% banner (Dismiss + New chat); small ring inside model quick-select (fade in/out) |

**Side fix (not an Sxx):** Brief background remount could wipe `selectedGGUF` while `llamaProvider` still held RAM — `App.tsx` + Conversation rehydrate from provider when ready (`modelSelectionRehydrate.ts`). No load/unload on resume.

**Next unchecked step:** **S15 — Trim notice** (alone; do not start S16).

### Native rebuild required before device smoke

JS-only reload is **not** enough. New native deps:

- `react-native-keychain` (^10)
- `react-native-device-info` (^15)
- `@op-engineering/op-sqlite` (^15)

```bash
cd android && ./gradlew clean && cd .. && npm run android
```

Until rebuild: HF token may show “secure storage isn’t linked”; RAM dots may be absent; chat history falls back to AsyncStorage if SQLite isn’t linked.

### Device smoke still owed (user pending rebuild)

Treat **S06–S14** as **code-complete / Jest-green**, not fully device-signed-off until:

1. Pause → resume → complete download; Discard removes partial  
2. `.partial` / `.chunk` never appear as loadable models  
3. Save HF token → gated download works; Clear removes it  
4. RAM dots + expanded tag; tap explains rating  
5. Force OOM / load fail → Lower context / Retry / Models  
6. **S11:** Clear `@has_completed_onboarding` → 4 steps; Skip → don’t show again; About → Review  
7. **S12:** Existing chats survive migrate; save/load/delete/pin/rename; kill/reopen  
8. **S13:** Drawer search title/preview/body; clear + close resets query  
9. **S14:** Long chat → banner ≥80%; ring in model pill; fade in on first send / fade out on new chat  
10. **Rehydrate:** Load model → home briefly → return → pill still shows model (no full reload)  

Also run `IMPROVEMENT_PLAN.md` §7 core smoke after rebuild.

### Key files (touched this arc)

| Area | Paths |
|------|--------|
| Download | `src/api/model.ts` |
| HF auth | `src/services/hfTokenService.ts`, `src/screens/HfTokenScreen.tsx` |
| RAM fit | `src/services/ramFitService.ts`, `ModelCard` props `ramFit` |
| Load CTAs | `src/utils/loadFailureAlert.ts`, `userFacingErrors.ts` |
| Disk | `src/utils/diskPreflight.ts` |
| Onboarding | `src/services/onboardingService.ts`, `src/screens/OnboardingScreen.tsx`, `App.tsx` gate |
| Chat history | `src/services/chatHistoryService.ts`, `chatHistoryHelpers.ts`; search in `HistoryDrawer` |
| Context UI | `src/utils/contextFullness.ts`, `ContextFullnessBanner.tsx`, `ContextFullnessRing.tsx` |
| Rehydrate | `src/utils/modelSelectionRehydrate.ts`, `App.tsx` AppState restore |
| Chat extract | `HistoryDrawer.tsx`, `ChatComposer.tsx`, `MessageList.tsx`, `StaggerFadeIn.tsx` |
| Tests | `__tests__/inference/*`, `downloadHelpers`, `diskPreflight`, `hfTokenService`, `ramFitService`, `loadFailureAlert`, `userFacingErrors`, `onboardingService`, `chatHistoryHelpers`, `contextFullness`, `modelSelectionRehydrate` |

`npm test` → **15 suites / 78 tests** green (2026-08-03).

### Do **not** for S15

- Don’t change `trimConversation` algorithm — only surface when turns were dropped  
- Don’t combine with S16 (AppState flush)  
- Keep `useNativeCompletion: true`; don’t touch Conversation `selectedGGUF` effect deps  
- Dual unload still: `releaseAllLlama()` + `llamaProvider.unloadModel()` when leaving to models  

---

## 0. Mandatory protocol

### 0.1 Before code

1. Open `IMPROVEMENT_PLAN.md` → pick the **next unchecked Sxx** only.  
2. Read the matching brief below (map Sxx → work).  
3. **Explore live code** (grep/trace) — this guide can drift.  
4. List invariants you must not break (§1).  
5. Plan the **smallest** diff that completes Sxx.

### 0.2 While coding

- **UI:** `createStyles(colors)` from `src/styles/styles.ts` + tokens from `useTheme()`; follow [`DESIGN.md`](../DESIGN.md). No Paper, no new palette, no accent spam.  
- **Motion:** `animationConfig.ts` + `PageFadeIn` for new pages.  
- **Architecture:** extend existing services; no parallel download/load/chat stacks.  
- **Quality:** clear names, minimal comments, no unrelated refactors.  
- Keep `useNativeCompletion: true` on Conversation.  
- Do not add `modelStatus`/`context` to Conversation `selectedGGUF` effect deps.  
- Dual unload on back-to-models: `releaseAllLlama()` + `llamaProvider.unloadModel()`.

### 0.3 After code

Run smoke in `IMPROVEMENT_PLAN.md` §7. If anything fails → fix or revert before starting another Sxx.

### 0.4 Exploration greps

```text
loadModel|unloadModel|getNativeContext|releaseAllLlama|initLlama
handleSubmit|nativeCompletion|useNativeCompletion|persistMessages|stopCompletion
downloadModel|createCancellationToken|DocumentDirectoryPath|.partial|USE_RESUMABLE
hfAuthHeaders|hfAxiosGet|HfTokenScreen|getHfToken
classifyRamFit|ramFit|getTotalMemoryBytes|showLoadFailureAlert
chatHistoryService|@chat_history|saveChat|@has_completed_onboarding
trimConversation|contextTrim|aiChatService.nativeCompletion
contextFullness|ContextFullnessBanner|ContextFullnessRing
shouldRehydrateSelectionFromProvider|modelSelectionRehydrate
createStyles|DESIGN
```

---

## 1. Hard invariants

| ID | Invariant |
|----|-----------|
| I1 | Product load = `llamaProvider.loadModel` → `getNativeContext()` |
| I2 | Chat = `nativeCompletion` / `context.completion` |
| I3 | Back to models = dual release |
| I4 | Auto-load effect deps = `[selectedGGUF]` only |
| I5 | Android `use_mlock === false`; n_ctx soft-cap 2048 |
| I6 | Accel allowlist Android: `Q4_0` \| `Q6_K` |
| I7 | Think / enable_thinking / meta-loop stay coherent |
| I8 | `persistEpoch` / chat-id guards in `useAIChat` |
| I9 | Final models live at `` `${RNFS.DocumentDirectoryPath}/*.gguf` `` — never load `.partial` |
| I10 | No React Navigation mid-plan — `App.tsx` page state |
| I11 | Styles via theme + `createStyles` / `DESIGN.md` |

---

## 2. Codebase map (short)

| Area | Where |
|------|--------|
| Entry / pages | `App.tsx` — gate `@has_completed_onboarding` → `onboarding` else `conversation`; model rehydrate on active |
| Load | `src/providers/llamaProvider.ts` (sole product path) |
| Helpers | `llamaService.ts` — keep `checkFileExists`; dead stop/completion helpers unused by UI |
| Chat | `useAIChat` → `aiChatService.nativeCompletion` → `saveChat` |
| Download | `src/api/model.ts` — resumable via `react-native-blob-util` when flagged |
| History | `chatHistoryService` — SQLite (`ofln_chats.sqlite`); AsyncStorage migrate once |
| Inference | `src/services/inference/*` (incl. `contextTrim`), `ggufSanitizeService`, accel |
| Context UI | `contextFullness.ts`, banner + ring in Conversation / model pill |
| Styles | `src/styles/styles.ts` → `createStyles(colors)` |
| Design | `DESIGN.md`, `animationConfig.ts`, `PageFadeIn`, `CustomAlert`, `FrostedGlass` |

**Monoliths:** ConversationScreen ~2.6k · ModelSelection ~2.4k — extract carefully if needed.

---

## 3. Libraries (prefer these)

| Need | Use | Avoid |
|------|-----|--------|
| Resume download | **`react-native-blob-util`** (already dep) | New FS stack same PR; Expo-only for this |
| Paths / exists | **`react-native-fs`** | Mixing dest roots |
| HF token | **`react-native-keychain`** | AsyncStorage secrets |
| RAM / disk | **`react-native-device-info`** | Guessing from model name only |
| Chat DB | **`@op-engineering/op-sqlite`** (S12 ✅) | WatermelonDB; sqlite-storage |
| TTS / STT | OS: `react-native-tts`, `@react-native-voice/voice` | Neural ONNX / PocketPal speech engines |
| Tools (deferred) | `expr-eval` if ever | `eval()`, full agent OS |

Add **at most one native module per Sxx**. Rebuild + smoke.

---

## 4. Map Sxx → implementation briefs

### S01 — Unify load (safe) ✅

**Trace:** `llamaProvider.loadModel`, former `llamaService.loadModel`, Diagnostics `initLlama`.  
**Done:** Confirmed UI callers use provider only; removed unused `llamaService.loadModel`; kept `checkFileExists`. Diagnostics `initLlama` untouched.  
**Don’t (still):** Change Diagnostics in same step; don’t alter accel gating.  
**UI:** none.

### S02 — Unit tests (safe) ✅

**Trace:** `buildCompletionParams`, `finalizeVisibleAndThought`, `trimConversation`, `isQuantAllowedForAndroidAccel`.  
**Done:** Jest suites under `__tests__/inference/` lock tiny-Qwen n_predict cap (384), simple-prompt stops, think strip/finalize, trim newest-first, Q4_0/Q6_K allowlist. No native llama in CI.  
**Don’t (still):** Native llama in CI.

### S03 — Error copy (safe) ✅

**Trace:** `formatLoadError`, download/load catches, `CustomAlert`.  
**Done:** `src/utils/userFacingErrors.ts` maps RAM / corrupt / 401 / disk / network → calm title+message; wired ModelSelection, Conversation switch, App load-after-download. `formatLoadError` truncated for logs. No JNI in alerts.  
**UI:** Existing `showAlert`; titles are meaning-first (not bare “Error”).  
**CTAs:** S10 ✅ (`showLoadFailureAlert`).

### S04a — Extract HistoryDrawer (careful) ✅

**Done:** `src/components/HistoryDrawer.tsx` (panel + backdrop + context menu + `ChatHistoryCard`); shared `StaggerFadeIn` for history + model selector. Conversation keeps history state/handlers; props only. No useAIChat / effect-deps / persistence changes.  
**UI:** Same styles (`slideOutPanel`, FrostedGlass); no restyle.

### S04b — Extract Composer (careful) ✅

**Done:** `src/components/ChatComposer.tsx` — attach menu (restored), pending image preview, input bar, send/stop. Conversation keeps keyboard padding, OCR/send handlers, attach anims; props only. Also restores attach-menu JSX dropped in S04a splice.  
**UI:** Same `createStyles` keys (`bottomContainer`, `inputBar`, …); no restyle.

### S04c — Extract MessageList (careful) ✅

**Done:** `src/components/MessageList.tsx` — bubbles, thinking toggle, copy/regen, empty greeting/presets; `ThinkingIndicator` moved with it. Conversation keeps scroll/keyboard/useAIChat; props only.  
**UI:** Same `createStyles` keys; no restyle.

### S05 — Disk preflight (safe) ✅

**Trace:** `App.handleDownloadModel`, ModelSelection download start.  
**Done:** `src/utils/diskPreflight.ts` — free ≥ size×1.1 + 256MB pad via `RNFS.getFSInfo`; calm alert before download in ModelSelection (curated + quant paths). Unknown size skips check.  
**UI:** CustomAlert; storage-full copy.

### S06 — Resume downloads (medium) ✅

**Trace:** `src/api/model.ts`, cancel tokens, dest paths.  
**Done:** `react-native-blob-util` → `*.gguf.partial` + AsyncStorage meta; resume via `.chunk` then append/replace (avoids 200-on-Range append corruption); `cancel('pause'|'discard')`; `USE_RESUMABLE_DOWNLOADS` flag; serialize by model; ModelCard pause/resume/discard; App passes `expectedBytes`.  
**Don’t:** Load `.partial`; delete dest at start of resume path; mix AI-sdk hub download.  
**UI:** Progress + “Paused”; monochrome progress (`colors.text`).

### S07 — Size verify (safe) ✅

**Done:** `sizesMatch` + `verifyAndActivate` before rename; mismatch leaves `.partial` + alert (corrupt/incomplete copy).  
**Don’t:** Full SHA v1 (too slow).

### S08 — HF token (safe–medium) ✅

**Done:** `react-native-keychain` + `src/services/hfTokenService.ts`; Models page → **HF token** sub-page (`HfTokenScreen`); Bearer only for `huggingface.co` on API + downloads; 401/403 → Add token CTA. Guards when native module not linked yet.  
**UI:** Models header chip; token form on sub-page (Back → Models). **Requires full native rebuild** (not Metro Reload).

### S09 — RAM fit chips (safe–medium) ✅

**Done:** `react-native-device-info` + `src/services/ramFitService.ts` (local device-RAM buckets → Fits / Tight / Won’t fit); collapsed **color dot**; expanded **color tag** (dot + label); tap either → `explainRamFit` alert.  
**UI:** Theme `success` / `warning` / `error`; no text chip on collapsed row. **Requires full native rebuild.**

### S10 — Load failure CTAs (safe) ✅

**Done:** `src/utils/loadFailureAlert.ts` — kind-aware CTAs (Retry / Models / Lower context); OOM lowers `n_ctx` one step then retries; wired ModelSelection + Conversation load paths.  
**UI:** CustomAlert; primary = filled; cancel secondary; left-aligned copy.

### S11 — Onboarding (medium) ✅

**Done:** `PageType` `onboarding`; `OnboardingScreen` 4 steps (Welcome → Private → Get a model → Ready); `@has_completed_onboarding` via `onboardingService`; Skip / Browse models / finish mark complete; Download optional (Continue primary); About → Review onboarding.  
**UI:** `PageFadeIn` remount per step; `settingsTitle`; primary CTA; Skip tertiary. No slide deck.  
**Don’t (still):** Second download stack; combine with S12.

### S12 — SQLite (medium) ✅

**Done:** `@op-engineering/op-sqlite`; `chatHistoryService` same public methods; WAL; transactions on migrate + multi-delete; one-time migrate from `@chat_history` with backup `@chat_history_async_backup` + flag `@chat_history_migrated_v1`; AsyncStorage fallback if native unlinked; pure helpers + Jest.  
**Don’t (still):** Change message shape; don’t combine with search UI (S13).

### S13 — Drawer search (safe) ✅

**Done:** Search box in `HistoryDrawer` (frosted drawer, `textTertiary` placeholder); filters title / customTitle / preview / message (+ thought) via `filterChatsBySearchQuery`; `chatHistoryService.searchChats` SQL LIKE on sqlite + JS fallback; clears on drawer close.  
**UI:** Surface search row; empty-state when no matches.

### S14 — Context banner (medium, simplified) ✅

**Done:** `estimateContextFullness` (~3.5 chars/token vs model `n_ctx`); soft `ContextFullnessBanner` at ≥80% (Dismiss + New chat only); `ContextFullnessRing` inside model quick-select pill (right); fade in on first user message / fade out on new chat; tap ring → calm alert. No n_ctx reload sheet.  
**UI:** Banner: `surface` + border; warning icon only. Ring: monochrome track/fill; warning fill when high.

### S15 — Trim notice (safe) — **NEXT**

**Trace:** `trimConversation` in `src/services/inference/contextTrim.ts`; product path `aiChatService.nativeCompletion` (~line 191); dead/legacy path also in `llamaService` (prefer not to expand).  
**Do:** When trim drops turns, surface **one** calm system-style line in the chat (or equivalent single notice). Prefer returning trim metadata from the completion path (e.g. dropped count) rather than guessing in UI.  
**Don’t:** Change trim algorithm / budgets; don’t add a second trim implementation; don’t do S16.  
**UI:** `textSecondary`, 13–14 px; no accent spam; one job.

### S16 — AppState flush (safe)

**Do:** On background, flush `persistMessages` / pending save.  
**Don’t:** Unload model here.

### S17 — Keep-awake while generating (safe)

**Do:** Activate only during completion; clear on stop/end.  
**Don’t:** Background unload (deferred — races).

### S18 — Export Markdown (safe)

**Do:** Build MD from messages; share sheet.  
**UI:** Row action; confirm not needed for export.

### S19 — Storage manager (safe–medium)

**Do:** List GGUF sizes; delete with confirm; if active → unload first.  
**UI:** Settings-style sections; destructive = `error` + confirm alert.

### S20 — Thinking mode (safe–medium)

**Trace:** `buildCompletionParams`, `resolveEnableThinking`.  
**Do:** Auto/On/Off setting; Auto = current behavior.  
**Don’t:** Rewrite think parser.  
**UI:** Model Settings slider/segment using existing settings controls.

### S21 — Accel chip (safe)

**Do:** Read runtime accel snapshot; tap → short alert with reason.  
**UI:** Small frosted/top pill style consistent with existing top pills; monochrome.

### S22 — Stages trends (medium, thin)

**Do:** Aggregate existing `usage_log` / performanceTracking; simple list/chart with `react-native-chart-kit` already in app.  
**Don’t:** Network upload; new analytics SDK.  
**UI:** Stages already exists — extend calmly; one section job.

### S23 — Family blurb (safe)

**Do:** Help text from `resolveModelFamily` in Model Settings.  
**UI:** Body help `textSecondary` 14 px.

### S24 — Persona memory notes (safe)

**Do:** `memoryNotes: string[]` on persona; inject in `buildPersonaSystemPrompt`.  
**UI:** PersonaEditor — multiline field; section label uppercase small.

### S25 — Temp chat polish (safe)

**Trace:** `isTemporaryMode`, `disablePersistence`.  
**Do:** Clear labeling when temp on.  
**UI:** Subtle chip; no color noise.

### S26 — Edit → regenerate (safe)

**Trace:** `useAIChat.regenerate`.  
**Do:** Edit user content → truncate → regenerate.  
**UI:** Inline edit matching bubble styles.

### S27 — Harden documents (safe–medium)

**Trace:** `documentParsingService`.  
**Do:** Caps; scanned PDF honest refusal; budget inject.  
**Don’t:** Vector RAG.

### S28 — mmproj vision (hard, optional)

**Trace:** `visionService`, `projectorPath`, OCR path.  
**Do:** Read llama.rn 0.12.6 mmproj API first; one curated pair; OCR fallback remains.  
**Don’t:** Combine with S29/S30. Device-only acceptance.

### S29 — System TTS (medium)

**Do:** `react-native-tts`; speak `stripThinkBlocks`; stop on new gen.  
**Don’t:** ONNX/neural.  
**UI:** Play icon on assistant bubble; `colors.text`.

### S30 — Platform STT (medium) — after S29

**Do:** `@react-native-voice/voice` → composer text; permissions.  
**UI:** Mic on composer; match composer chrome.

### S31 — Remote client (medium)

**Do:** Opt-in base URL + key (keychain); fetch SSE; banner always on.  
**Don’t:** Change local default.  
**UI:** Settings section; persistent `warning` banner in chat when remote active.

---

## 5. Deferred (do not implement until queue says so)

| Item | Why deferred |
|------|----------------|
| Background model unload | Races with `stopCompletion` / load |
| Biometric app lock | Extra native + gate complexity |
| Full tool/agent loop | Unreliable on small phone models; high chat-path risk |
| Rolling summary memory | Easy to pollute prompts |
| Context “increase n_ctx + reload” sheet | Needs careful reload UX; banner+new chat enough first |
| Neural TTS / ONNX | RAM fight with GGUF |
| In-chat full-text find | Drawer search first |
| Thermal/battery nags | Noisy; little gain |

---

## 6. Clean code checklist (every PR)

- [ ] Only one Sxx in the diff  
- [ ] Traced callers before edit  
- [ ] Used `createStyles` / theme tokens / `DESIGN.md` for UI  
- [ ] No second download/load/chat path  
- [ ] No `.partial` activation  
- [ ] Smoke §7 passed for touched areas  
- [ ] Updated this guide if symbols moved  

---

## 7. If guide ≠ code

**Trust the code.** Fix the guide in the same PR.
