# OFLN Agent Implementation Guide

**Companion to:** [`IMPROVEMENT_PLAN.md`](./IMPROVEMENT_PLAN.md) (atomic steps **S01–S31** + **S19p**)  
**Code map date:** 2026-08-05 · **Last handoff:** 2026-08-05 (S26 edit→regenerate; next = S27)  
**Stack:** RN **0.78.1**, New Architecture (bridgeless), `llama.rn` **0.12.6**

The app is **working**. Prefer surgical, clean code. **One Sxx step per session** (small adjacent steps may merge if the user asks).

---

## Handoff — session status (2026-08-05)

### Completed (code in working tree — **not committed**)

| Steps | Summary |
|-------|---------|
| **S01–S05** | Unified load path; inference unit tests; user-facing errors; HistoryDrawer / ChatComposer / MessageList extracts; disk preflight |
| **S06–S07** | Resumable downloads (`.gguf.partial` + `.chunk`, pause≠discard, `USE_RESUMABLE_DOWNLOADS`); size verify before activate |
| **S08** | HF token in Keychain; UI on **Models → HF token** (`HfTokenScreen`), not Settings; Bearer only for `huggingface.co` |
| **S09** | RAM fit: green/amber/red **dot** (collapsed, left of size) + color **tag** (expanded); tap → explanation; ModelCard memo must re-render when `ramFit` arrives |
| **S10** | Load-failure CTAs: Retry / Models / Lower context (auto step-down `n_ctx` then retry) |
| **S11** | First-run onboarding; 4 steps; `@has_completed_onboarding`; Skip / optional Download; About → **Review onboarding** |
| **S12** | Chat history → **op-sqlite** (`ofln_chats.sqlite`, WAL); same API; migrate + `@chat_history_async_backup` |
| **S13** | History drawer search — title / preview / message snippets; in-memory filter + `searchChats` SQL |
| **S14** | Context fullness: ≥80% banner (Dismiss + New chat); small ring inside model quick-select (fade in/out) |
| **S15** | Trim notice: `applyConversationTrim` + live `nativeCompletion` trim; MessageList one-liner when drops > 0 |
| **S16** | AppState flush on leave-`active`; serialized `persistMessages` (no duplicate chat rows); `logError` on save fail |
| **S17** | Keep-awake while generating: `@sayem314/react-native-keep-awake@1`; activate start / clear stop·end·abort |
| **S18** | Export Markdown: history long-press **Export** → `buildChatMarkdown` + system `Share` sheet |
| **S19** | Storage manager: Settings → **Storage**; list GGUF sizes; delete+confirm; dual-unload if active; **Clear all chat history** section |
| **S19p** | **ModelRuntimePolicy**: GGUF-first templates; family stubs (Qwen/Gemma/Phi); size-tier system prompts; `systemPromptSource`; Settings policy blurb (**S23**) |
| **S20** | **Thinking mode** Auto/On/Off per-model (`thinkingMode`); `resolveThinkingModeForTurn` → `buildCompletionParams`; Model Settings segmented control |
| **S21** | **Accel status** — INFO log after load; selected-row CPU/GPU/NPU tag in quick panel; **no** top-chrome chip |
| **S22** | **Stages trends** — history + trend helpers; Recent runs **bottom**, preview **5** + View more; chronological sparklines |
| **S23** | Family recommended blurb — done with S19p via `policyRecommendedBlurb` on Model Settings |
| **S26** | **Edit → regenerate** — pencil on user bubble; save truncates later turns + `editUserAndRegenerate` |

**Phase 2 (S12–S19) is code-complete.** Phase 3 product steps **S19p + S20–S23** code-complete.  
**S24 deferred** (wider persona memory). **S25 removed** (temp UI kept). **S26 done.**  
**Next unchecked step is S27.**

**Side polish (not formal Sxx — keep):**
- Quick selector: fixed Models/Personas tab bar; sticky footers — **Browse models** (Models) + **Clear persona** (Personas when selected; red `person` icon); shared `selectorChrome*` padding.
- Rehydrate: `modelSelectionRehydrate.ts` + App/Conversation (no full reload on brief background).
- **Personas library:** bottom-right **Add** pill matches Back (same size/placement as Performance **Clear**).
- **Models list:** section title **Local** (on-device files; not “Available”); no per-card “Downloaded” badge.
- **S09 UI polish:** fit **dot left of size** label; smaller collapsed dot (10px); `React.memo` compares `ramFit` so dots appear after async `getTotalMemoryBytes` without needing expand.
- **Temp toggle:** active state solid `theme.colors.primary` fill + `primaryText` icon.

**Next unchecked step:** **S27 — Harden documents** (alone; do not start S28). Do **not** implement S24 unless user reopens memory design.

### Robustness notes (landed with S15–S22 + S19p)

- **Live chat path** uses `useNativeCompletion: true` → `aiChatService.nativeCompletion` (not dead `llamaService` completion helpers).
- **S15 gap fixed:** `nativeCompletion` now calls `applyConversationTrim` (streamChat already did). UI notice is session-sticky after first drop; clears on new chat / history switch.
- **S16:** Flush once on `active` → `inactive|background`; serialize saves so parallel first-saves cannot create two chat IDs; completion errors also persist partial/error text.
- **S17:** Quiet no-op until native rebuild (`TurboModuleRegistry.get`, never import package’s `getEnforcing` path in product JS).
- **S19:** Final `.gguf` only; basename-safe delete; unload uses `releaseAllLlama()` + `llamaProvider.unloadModel()`. Separate **Chat history** section: `clearAllChats` + confirm; App resets live conversation via `onChatHistoryCleared` → `handleNewChat`.
- **S09 memo:** Custom `ModelCard` comparator must include `ramFit` (and `isPaused` / size) — otherwise async total-RAM never paints until expand changes `isExpanded`.
- **S19p:** Prefer GGUF Jinja; Android sanitize pad **v5** is family-aware (`__ofln_f='…'`); missing metadata → `resolveModelPolicy(file).template.familyStub`; settings seed via `getDefaultSettingsForModel`; no prompt DB.
- **S20:** `settings.thinkingMode` (`auto`|`on`|`off`, default **auto**) applied only for `policy.thinking.strategy === 'jinja_enable'`; Auto = `resolveEnableThinking` unchanged; always_on/none omit `enable_thinking`.
- **S21:** INFO Acceleration in View Logs after load; optional quick-panel row label; quant allowlist unchanged.
- **S22:** Personal history from existing `usage_log.json` only; no new telemetry SDK or network.

### Native rebuild required before device smoke

JS-only reload is **not** enough. New native deps:

- `react-native-keychain` (^10)
- `react-native-device-info` (^15)
- `@op-engineering/op-sqlite` (^15)
- `@sayem314/react-native-keep-awake` (^1.4) — S17

```bash
cd android && ./gradlew clean && cd .. && npm run android
```

Until rebuild: HF token may show “secure storage isn’t linked”; RAM dots may be absent; chat history falls back to AsyncStorage if SQLite isn’t linked; keep-awake is a quiet no-op.

### Device smoke still owed (user pending rebuild)

Treat **S06–S22 + S19p** as **code-complete / Jest-green**, not fully device-signed-off until:

1. Pause → resume → complete download; Discard removes partial  
2. `.partial` / `.chunk` never appear as loadable models  
3. Save HF token → gated download works; Clear removes it  
4. RAM dots (left of size on collapsed card) + expanded tag; appear without expanding; tap explains rating  
5. Force OOM / load fail → Lower context / Retry / Models  
6. **S11:** Clear `@has_completed_onboarding` → 4 steps; Skip → don’t show again; About → Review  
7. **S12:** Existing chats survive migrate; save/load/delete/pin/rename; kill/reopen  
8. **S13:** Drawer search title/preview/body; clear + close resets query  
9. **S14:** Long chat → banner ≥80%; ring in model pill; fade in on first send / fade out on new chat  
10. **S15:** Long chat that exceeds budget → one calm “Older messages were trimmed…” line (not on short chats); clears on New chat  
11. **S16:** Mid-reply → home/kill → reopen → user turn (+ partial assistant if any) still in history  
12. **S17:** During generation screen stays awake; after Stop / reply ends, screen can sleep again  
13. **S18:** History long-press → Export → share sheet with Markdown (user/assistant; thoughts included)  
14. **S19:** Settings → Storage → sizes; delete inactive; delete loaded model unloads first then removes file; **Clear all** chat history wipes history + empty active chat  
15. **Rehydrate:** Load model → home briefly → return → pill still shows model (no full reload)  
16. **S19p:** Qwen 0.8B short default prompt; Gemma/Phi coherent if force-sanitize path runs; custom system prompt persists; Reset restores policy defaults; Settings shows family blurb  
17. **S20:** Qwen Auto — short “hi” no forced CoT; complex may think; On/Off force; non-Qwen still chats  
18. **S21:** Load model → View Logs INFO Acceleration; quick panel selected row shows CPU/GPU/NPU  
19. **S22:** Stages → Recent runs bottom (5 + View more); trend when ≥4 runs  
20. **Quick selector:** Tab bar fixed; sticky Browse models; sticky Clear persona with red person icon  

Also run `IMPROVEMENT_PLAN.md` §7 core smoke after rebuild.

### Key files (touched this arc)

| Area | Paths |
|------|--------|
| Download | `src/api/model.ts` |
| HF auth | `src/services/hfTokenService.ts`, `src/screens/HfTokenScreen.tsx` |
| RAM fit | `src/services/ramFitService.ts`, `ModelCard` props `ramFit` (+ memo compare `ramFit`) |
| Load CTAs | `src/utils/loadFailureAlert.ts`, `userFacingErrors.ts` |
| Disk | `src/utils/diskPreflight.ts` |
| Storage (S19) | `src/utils/modelStorageHelpers.ts`, `src/services/modelStorageService.ts`, `src/screens/StorageScreen.tsx` (models + clear chats), Settings tile, App page `storage` + `onChatHistoryCleared` |
| Onboarding | `src/services/onboardingService.ts`, `src/screens/OnboardingScreen.tsx`, `App.tsx` gate |
| Chat history | `src/services/chatHistoryService.ts`, `chatHistoryHelpers.ts`; search in `HistoryDrawer` |
| Context UI | `src/utils/contextFullness.ts`, `ContextFullnessBanner.tsx`, `ContextFullnessRing.tsx` |
| Trim notice (S15) | `contextTrim.ts` (`applyConversationTrim`), `aiChatService.nativeCompletion`, `useAIChat.showTrimNotice`, `MessageList` |
| Persist flush (S16) | `src/utils/chatPersistAppState.ts`, `useAIChat` AppState + persist queue |
| Keep-awake (S17) | `src/services/keepAwakeService.ts`, `useAIChat` generation lifecycle; dep in `package.json` |
| Export MD (S18) | `src/utils/chatMarkdownExport.ts`, HistoryDrawer Export, ConversationScreen `Share` |
| Rehydrate | `src/utils/modelSelectionRehydrate.ts`, `App.tsx` AppState restore |
| Chat extract | `HistoryDrawer.tsx`, `ChatComposer.tsx`, `MessageList.tsx`, `StaggerFadeIn.tsx` |
| **Policy (S19p)** | `modelPolicy.ts`, `modelFamily.ts`, `familyTemplates.ts`, `promptDefaults.ts`, `modelSettingsService.ts`, `ggufSanitizeService.ts` (v5), `llamaProvider.ts`, `aiChatService.ts`, `completionParams.ts`, `ModelSettingsScreen.tsx` |
| **Thinking (S20)** | `modelSettingsService.thinkingMode`, `promptHeuristics.resolveThinkingModeForTurn`, `completionParams.buildCompletionParams`, `ModelSettingsScreen` segment |
| **Accel (S21)** | `utils/accelChipDisplay.ts`, `llamaProvider` log after load, Conversation quick-panel selected-row label |
| **Stages trends (S22)** | `performanceTracking` (`buildUsageHistory`, `computeUsageTrend`), StagesScreen Recent runs |
| **Quick selector polish** | ConversationScreen BottomSheet: `selectorChrome*`, sticky Browse models / Clear persona |
| **Edit (S26)** | `chatEditHelpers.buildMessagesAfterUserEdit`, `useAIChat.editUserAndRegenerate`, MessageList pencil / TextInput |
| **S27 entry** | `documentParsingService` |
| **S24 (deferred)** | `personaService.ts` / `PersonaEditorScreen` — do not implement yet |  
| Tests | `__tests__/inference/*`, `chatEditHelpers`, `accelChipDisplay`, `performanceTracking`, … |

`npm test` → **23 suites / 130 tests** green after S26 (2026-08-05).

### Git / commit state

- **Not committed** — large working tree of uncommitted Sxx work.
- Do **not** commit unless the user asks.
- New dep: `@sayem314/react-native-keep-awake` in `package.json` / lockfiles.

### Do **not** for S27

- Don’t start S28 mmproj vision or S24 persona memory  
- Don’t add vector RAG or embedding stores  
- Honest errors for scanned/unsupported PDFs; size caps only  
- Keep `useNativeCompletion: true`; don’t touch Conversation `selectedGGUF` effect deps  
- Dual unload still: `releaseAllLlama()` + `llamaProvider.unloadModel()`  

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
trimConversation|applyConversationTrim|contextTrim|aiChatService.nativeCompletion
contextFullness|ContextFullnessBanner|ContextFullnessRing
shouldFlushChatPersist|keepAwake|activateGeneratingKeepAwake
buildChatMarkdown|listStoredGgufModels|StorageScreen
resolveEnableThinking|buildCompletionParams|enable_thinking|ModelSettings
shouldRehydrateSelectionFromProvider|modelSelectionRehydrate
Persona|buildPersonaSystemPrompt|@personas|PersonaEditorScreen
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
| Keep-awake | **`@sayem314/react-native-keep-awake@1`** (S17 ✅) | expo-keep-awake (not Expo app) |
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

**Done:** `react-native-device-info` + `src/services/ramFitService.ts` (local device-RAM buckets → Fits / Tight / Won’t fit); collapsed **color dot** (left of size chip, ~10px); expanded **color tag** (dot + label); tap either → `explainRamFit` alert.  
**UI:** Theme `success` / `warning` / `error`; no text chip on collapsed row.  
**Memo:** `ModelCard` custom `React.memo` compare **must** include `ramFit` fields — total RAM loads async after first paint.  
**Requires full native rebuild.**

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

### S15 — Trim notice (safe) ✅

**Trace:** `trimConversation` in `src/services/inference/contextTrim.ts`; product path `aiChatService.nativeCompletion`; dead/legacy path also in `llamaService` (left alone).  
**Done:** `applyConversationTrim` wraps unchanged algorithm + `droppedCount`; live `nativeCompletion` now trims (was missing) and returns `trimmedMessageCount`; `useAIChat.showTrimNotice` → MessageList one-liner (`textSecondary` 13 px). Clears on new chat / history switch.  
**Don’t (still):** Change trim budgets; don’t do S16.  
**UI:** `styles.trimNotice`; no accent spam; one job.

### S16 — AppState flush (safe) ✅

**Done:** `shouldFlushChatPersistOnTransition` (flush once on leave-`active`); `useAIChat` serializes `persistMessages` (no duplicate chat rows on concurrent flush); streaming patch flush + save; skips temp mode / empty chats; save failures → `logError`. No model unload.  
**Don’t (still):** Background unload (deferred).

### S17 — Keep-awake while generating (safe) ✅

**Done:** `@sayem314/react-native-keep-awake@1.4` (RN 0.78-compatible); `keepAwakeService` uses `TurboModuleRegistry.get` + cache (no-op until rebuild); `useAIChat` activates on `beginGeneration`, deactivates on stop / completion finally / abort / unmount.  
**Don’t (still):** Background unload (deferred).  
**Requires:** full native rebuild.

### S18 — Export Markdown (safe) ✅

**Done:** `buildChatMarkdown` / `isExportableMessage` (pure + Jest); HistoryDrawer long-press **Export** (share-outline); Conversation uses live messages when exporting the open chat, else `getChat`; RN `Share.share` — local only, no confirm.  
**Don’t (still):** Cloud accounts / hubs.

### S19 — Storage manager (safe–medium) ✅

**Done:** `modelStorageHelpers` + `modelStorageService` (final `.gguf` only); Settings → **Storage** tile → `StorageScreen` (sizes, free space, delete with confirm/`error` CTA); active model dual-unloads before unlink.  
**Chat data:** separate **Chat history** section — conversation count + **Clear all** (confirm); `chatHistoryService.clearAllChats()`; App `onChatHistoryCleared={handleNewChat}` so in-memory open chat resets.  
**Don’t (still):** Silent delete; load `.partial`; don’t clear models when clearing chats (or vice versa).

### S20 — Thinking mode (safe–medium) — **DONE 2026-08-04**

**Done:** Per-model `thinkingMode: 'auto'|'on'|'off'` (default auto) in `modelSettingsService`; pure `resolveThinkingModeForTurn` applies only for `jinja_enable`; `buildCompletionParams` wires it; Model Settings segmented Auto/On/Off; Jest Auto identity + On/Off overrides.  
**Don’t reopen:** thinkStreamParser; dual family tables; S21.

### S21 — Accel status (safe) — **DONE 2026-08-04** (+ UI polish)

**Done:** After model load, INFO log via `formatAccelLogDisplay` + `logError('Acceleration', …, 'INFO')` into View Logs. Selected model row in chat quick panel shows monochrome CPU/GPU/NPU (tap selected row → detail). **No** top-chrome accel chip (user preference).  
**Don’t reopen:** quant allowlist, second GPU detector.

### S22 — Stages trends (medium, thin) — **DONE 2026-08-04** (+ UI polish)

**Done:** `buildUsageHistory` + `computeUsageTrend` on existing usage log; Stages **Recent runs** at **bottom** of scroll; default **5** rows + **View more** expand; chronological sparklines.  
**Don’t reopen:** new analytics SDK; network upload.

### S23 — Family blurb (safe) — **DONE with S19p**

**Done:** `policyRecommendedBlurb(resolveModelPolicy(fileName))` under System Prompt on Model Settings.  
**Don’t:** Duplicate a second recommended-copy system.

### S24 — Persona memory notes (safe) — **DEFERRED**

**Status:** Wider memory system needs planning. **Do not implement** until user reopens.  
**Trace (when unblocked):** `Persona` / `buildPersonaSystemPrompt` / `PersonaEditorScreen`.  
**Likely constraints later:** empty notes must leave prompt identical; no RAG/cloud-by-default without design.

### S25 — Temp chat polish — **REMOVED**

**Removed 2026-08-05:** existing temp-mode UX is sufficient. Toggle active state fixed to solid `primary` (white in dark) + `primaryText` icon. Do not re-add a polish step.

### S26 — Edit → regenerate (safe) — **DONE 2026-08-05**

**Done:** `buildMessagesAfterUserEdit` pure helper; `editUserAndRegenerate` on `useAIChat`; MessageList pencil → inline `TextInput` in user bubble (save/cancel); earlier turns kept, later turns dropped, completion re-runs. Composer untouched.  
**Don’t reopen:** S24, composer-staging the edited text, S27.

### S27 — Harden documents (safe–medium) — **NEXT**

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
