# OFLN Agent Implementation Guide

**Companion to:** [`IMPROVEMENT_PLAN.md`](./IMPROVEMENT_PLAN.md) (atomic steps **S01–S32** + **S19p**)  
**Code map date:** 2026-08-06 · **Last handoff:** 2026-08-06 (**PAUSED** after S29 TTS + S27b; next = S28 optional or S30 STT)  
**Stack:** RN **0.78.1**, New Architecture (bridgeless), `llama.rn` **0.12.6**

The app is **working**. Prefer surgical, clean code. **One Sxx step per session**.

---

## Handoff — session status (2026-08-06) — PAUSED

### Completed (code in working tree — **not committed**)

| Steps | Summary |
|-------|---------|
| **S01–S05** | Unified load; unit tests; errors; HistoryDrawer / ChatComposer / MessageList; disk preflight |
| **S06–S07** | Resumable downloads + size verify before activate |
| **S08** | HF token Keychain; Models → HF token screen |
| **S09** | RAM fit dot (left of size) + tag |
| **S10** | Load-failure CTAs Retry / Models / Lower context |
| **S11** | First-run onboarding |
| **S12–S13** | Chat SQLite + drawer search |
| **S14–S16** | Context banner/ring; trim notice; AppState flush |
| **S17–S19** | Keep-awake; Markdown export; Storage + clear chats |
| **S19p–S23** | ModelRuntimePolicy; Thinking; Accel; Stages trends; policy blurb |
| **S26** | Edit user → regenerate |
| **S27** | Document/OCR **pipeline** harden |
| **S27b** | Chat **PDF attach** + send extract + robustness |
| **S29** | **System TTS** (OS); Speak at trailing right of action row |
| **S32** | Backup/restore |

**S24 deferred** · **S25 removed** · **S28 optional open** · **S30/S31 open**.

### This session arc (2026-08-05 → 2026-08-06)

1. **S27b** closed product gap (S27 parser had no chat PDF entry).  
2. **S27b harden:** re-entrancy, `sanitizeChatDocumentFileName` / `isLikelyPdfMeta`, delayed pending clear, content URI preferredExt pdf.  
3. **S29 TTS** shipped **before optional S28** (live path still OCR-only; mmproj needs deeper work + device).  
4. Speak UI: full-width row; **Copy · Regenerate · tokens/s** left; flex spacer min **24**; **Speak** far right.  
5. User notes: VM TTS pops/robotic **expected**; neural TTS still deferred.  
6. **Paused** for docs + next-agent prompt.

### Critical honesty — documents (S27+S27b)

| Claim | Reality |
|-------|---------|
| Budgets + honest PDF refusals | **Yes** |
| Chat PDF attach | **Yes** — Camera · Gallery · **File (PDF)** |
| Live path | OCR or PDF extract → `textForPrompt` → `nativeCompletion` |

Symbols: `chooseDocument`, `pendingAttachment.kind`, `extractTextFromAttachment`, `buildAttachmentTextForPrompt`, `sendPrepareRef` / `isOcrRunning`.

### Critical honesty — TTS (S29)

| Claim | Reality |
|-------|---------|
| OS TTS only | **Yes** — no neural |
| Safe if unlinked | **Yes** — never `import 'react-native-tts'` default; `NativeModules.TextToSpeech` only |
| Prep | `prepareSpeechText` → stripThink + light markdown + 4k cap |
| Stop on gen/stop | `useAIChat` → `stopSpeaking` |
| UI | Speak **rightmost**; monochrome `colors.text` |
| Native | `react-native-tts@4.1.1` + `patches/react-native-tts+4.1.1.patch`; Manifest `TTS_SERVICE` queries |
| Devices | Mainstream phones work after rebuild+TTS engine; VM quality poorer |

**Do not** add Piper/ONNX neural default (RAM vs GGUF). Optional future only.

### Why not S28 yet

Live chat: `useNativeCompletion: true` → always OCR inject for images. True vision needs mmproj download + `projectorPath` load + multimodal completion + curated pair + **device smoke**. OCR must remain fallback.

### Next step (exactly one)

1. **S28** — mmproj vision (hard, optional, device-only)  
2. **S30** — Platform STT (medium; recommended if continuing voice)  
3. **S31** — Remote client (later)

### Side polish (keep)

Quick selector sticky footers; rehydrate; Personas Add; Models Local; temp solid primary; user long-press Copy/Edit; **assistant: Copy · Regen · tps | … | Speak**.

### Native rebuild

```bash
cd android && ./gradlew clean && cd .. && npm run android
```

Deps needing rebuild include: keychain, device-info, op-sqlite, keep-awake, **react-native-tts**.

### Tests / git

- `npm test` → **27 suites / 161 tests** green (2026-08-06)  
- **Large uncommitted tree** — do **not** commit unless user asks

### Hard invariants (quick)

- `useNativeCompletion: true`  
- Conversation auto-load deps: **`[selectedGGUF]` only**  
- Dual unload: `releaseAllLlama()` + `llamaProvider.unloadModel()`  
- Dual paths: Model GGUF pick vs chat PDF pick share package, different call sites  

### Do not reopen / do not do

S24 · neural TTS · RAG · scanned PDF OCR · `import` default react-native-tts · combine S28+S30 · change selectedGGUF effect deps · commit without ask

### Key paths

| Area | Paths |
|------|--------|
| S27b | `ChatComposer`, `ConversationScreen` (`chooseDocument`), `documentHelpers`, `documentParsingService`, `mediaNormalizeService` |
| S29 | `ttsService.ts`, `speechText.ts`, `MessageList` action row, `useAIChat`, `AndroidManifest.xml`, `patches/react-native-tts+4.1.1.patch` |
| S28 entry | `visionService`, `llamaProvider` projectorPath |
| S30 entry | not installed (`@react-native-voice/voice` proposed) |

**Pass-off user prompt:** see also `IMPROVEMENT_PLAN.md` § **Agent pass-off prompt (2026-08-06)**.

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

**Monoliths:** ConversationScreen ~2.6k Â· ModelSelection ~2.4k — extract carefully if needed.

---

## 3. Libraries (prefer these)

| Need | Use | Avoid |
|------|-----|--------|
| Resume download | **`react-native-blob-util`** (already dep) | New FS stack same PR; Expo-only for this |
| Paths / exists | **`react-native-fs`** | Mixing dest roots |
| HF token | **`react-native-keychain`** | AsyncStorage secrets |
| RAM / disk | **`react-native-device-info`** | Guessing from model name only |
| Chat DB | **`@op-engineering/op-sqlite`** (S12 âœ…) | WatermelonDB; sqlite-storage |
| Keep-awake | **`@sayem314/react-native-keep-awake@1`** (S17 âœ…) | expo-keep-awake (not Expo app) |
| TTS / STT | OS: `react-native-tts`, `@react-native-voice/voice` | Neural ONNX / PocketPal speech engines |
| Tools (deferred) | `expr-eval` if ever | `eval()`, full agent OS |

Add **at most one native module per Sxx**. Rebuild + smoke.

---

## 4. Map Sxx → implementation briefs

### S01 — Unify load (safe) âœ…

**Trace:** `llamaProvider.loadModel`, former `llamaService.loadModel`, Diagnostics `initLlama`.  
**Done:** Confirmed UI callers use provider only; removed unused `llamaService.loadModel`; kept `checkFileExists`. Diagnostics `initLlama` untouched.  
**Don't (still):** Change Diagnostics in same step; don't alter accel gating.  
**UI:** none.

### S02 — Unit tests (safe) âœ…

**Trace:** `buildCompletionParams`, `finalizeVisibleAndThought`, `trimConversation`, `isQuantAllowedForAndroidAccel`.  
**Done:** Jest suites under `__tests__/inference/` lock tiny-Qwen n_predict cap (384), simple-prompt stops, think strip/finalize, trim newest-first, Q4_0/Q6_K allowlist. No native llama in CI.  
**Don't (still):** Native llama in CI.

### S03 — Error copy (safe) âœ…

**Trace:** `formatLoadError`, download/load catches, `CustomAlert`.  
**Done:** `src/utils/userFacingErrors.ts` maps RAM / corrupt / 401 / disk / network → calm title+message; wired ModelSelection, Conversation switch, App load-after-download. `formatLoadError` truncated for logs. No JNI in alerts.  
**UI:** Existing `showAlert`; titles are meaning-first (not bare "Error").  
**CTAs:** S10 âœ… (`showLoadFailureAlert`).

### S04a — Extract HistoryDrawer (careful) âœ…

**Done:** `src/components/HistoryDrawer.tsx` (panel + backdrop + context menu + `ChatHistoryCard`); shared `StaggerFadeIn` for history + model selector. Conversation keeps history state/handlers; props only. No useAIChat / effect-deps / persistence changes.  
**UI:** Same styles (`slideOutPanel`, FrostedGlass); no restyle.

### S04b — Extract Composer (careful) âœ…

**Done:** `src/components/ChatComposer.tsx` — attach menu (restored), pending image preview, input bar, send/stop. Conversation keeps keyboard padding, OCR/send handlers, attach anims; props only. Also restores attach-menu JSX dropped in S04a splice.  
**UI:** Same `createStyles` keys (`bottomContainer`, `inputBar`, â€¦); no restyle.

### S04c — Extract MessageList (careful) âœ…

**Done:** `src/components/MessageList.tsx` — bubbles, thinking toggle, copy/regen, empty greeting/presets; `ThinkingIndicator` moved with it. Conversation keeps scroll/keyboard/useAIChat; props only.  
**UI:** Same `createStyles` keys; no restyle.

### S05 — Disk preflight (safe) âœ…

**Trace:** `App.handleDownloadModel`, ModelSelection download start.  
**Done:** `src/utils/diskPreflight.ts` — free â‰¥ sizeÃ—1.1 + 256MB pad via `RNFS.getFSInfo`; calm alert before download in ModelSelection (curated + quant paths). Unknown size skips check.  
**UI:** CustomAlert; storage-full copy.

### S06 — Resume downloads (medium) âœ…

**Trace:** `src/api/model.ts`, cancel tokens, dest paths.  
**Done:** `react-native-blob-util` → `*.gguf.partial` + AsyncStorage meta; resume via `.chunk` then append/replace (avoids 200-on-Range append corruption); `cancel('pause'|'discard')`; `USE_RESUMABLE_DOWNLOADS` flag; serialize by model; ModelCard pause/resume/discard; App passes `expectedBytes`.  
**Don't:** Load `.partial`; delete dest at start of resume path; mix AI-sdk hub download.  
**UI:** Progress + "Paused"; monochrome progress (`colors.text`).

### S07 — Size verify (safe) âœ…

**Done:** `sizesMatch` + `verifyAndActivate` before rename; mismatch leaves `.partial` + alert (corrupt/incomplete copy).  
**Don't:** Full SHA v1 (too slow).

### S08 — HF token (safe–medium) âœ…

**Done:** `react-native-keychain` + `src/services/hfTokenService.ts`; Models page → **HF token** sub-page (`HfTokenScreen`); Bearer only for `huggingface.co` on API + downloads; 401/403 → Add token CTA. Guards when native module not linked yet.  
**UI:** Models header chip; token form on sub-page (Back → Models). **Requires full native rebuild** (not Metro Reload).

### S09 — RAM fit chips (safe–medium) âœ…

**Done:** `react-native-device-info` + `src/services/ramFitService.ts` (local device-RAM buckets → Fits / Tight / Won't fit); collapsed **color dot** (left of size chip, ~10px); expanded **color tag** (dot + label); tap either → `explainRamFit` alert.  
**UI:** Theme `success` / `warning` / `error`; no text chip on collapsed row.  
**Memo:** `ModelCard` custom `React.memo` compare **must** include `ramFit` fields — total RAM loads async after first paint.  
**Requires full native rebuild.**

### S10 — Load failure CTAs (safe) âœ…

**Done:** `src/utils/loadFailureAlert.ts` — kind-aware CTAs (Retry / Models / Lower context); OOM lowers `n_ctx` one step then retries; wired ModelSelection + Conversation load paths.  
**UI:** CustomAlert; primary = filled; cancel secondary; left-aligned copy.

### S11 — Onboarding (medium) âœ…

**Done:** `PageType` `onboarding`; `OnboardingScreen` 4 steps (Welcome → Private → Get a model → Ready); `@has_completed_onboarding` via `onboardingService`; Skip / Browse models / finish mark complete; Download optional (Continue primary); About → Review onboarding.  
**UI:** `PageFadeIn` remount per step; `settingsTitle`; primary CTA; Skip tertiary. No slide deck.  
**Don't (still):** Second download stack; combine with S12.

### S12 — SQLite (medium) âœ…

**Done:** `@op-engineering/op-sqlite`; `chatHistoryService` same public methods; WAL; transactions on migrate + multi-delete; one-time migrate from `@chat_history` with backup `@chat_history_async_backup` + flag `@chat_history_migrated_v1`; AsyncStorage fallback if native unlinked; pure helpers + Jest.  
**Don't (still):** Change message shape; don't combine with search UI (S13).

### S13 — Drawer search (safe) âœ…

**Done:** Search box in `HistoryDrawer` (frosted drawer, `textTertiary` placeholder); filters title / customTitle / preview / message (+ thought) via `filterChatsBySearchQuery`; `chatHistoryService.searchChats` SQL LIKE on sqlite + JS fallback; clears on drawer close.  
**UI:** Surface search row; empty-state when no matches.

### S14 — Context banner (medium, simplified) âœ…

**Done:** `estimateContextFullness` (~3.5 chars/token vs model `n_ctx`); soft `ContextFullnessBanner` at â‰¥80% (Dismiss + New chat only); `ContextFullnessRing` inside model quick-select pill (right); fade in on first user message / fade out on new chat; tap ring → calm alert. No n_ctx reload sheet.  
**UI:** Banner: `surface` + border; warning icon only. Ring: monochrome track/fill; warning fill when high.

### S15 — Trim notice (safe) âœ…

**Trace:** `trimConversation` in `src/services/inference/contextTrim.ts`; product path `aiChatService.nativeCompletion`; dead/legacy path also in `llamaService` (left alone).  
**Done:** `applyConversationTrim` wraps unchanged algorithm + `droppedCount`; live `nativeCompletion` now trims (was missing) and returns `trimmedMessageCount`; `useAIChat.showTrimNotice` → MessageList one-liner (`textSecondary` 13 px). Clears on new chat / history switch.  
**Don't (still):** Change trim budgets; don't do S16.  
**UI:** `styles.trimNotice`; no accent spam; one job.

### S16 — AppState flush (safe) âœ…

**Done:** `shouldFlushChatPersistOnTransition` (flush once on leave-`active`); `useAIChat` serializes `persistMessages` (no duplicate chat rows on concurrent flush); streaming patch flush + save; skips temp mode / empty chats; save failures → `logError`. No model unload.  
**Don't (still):** Background unload (deferred).

### S17 — Keep-awake while generating (safe) âœ…

**Done:** `@sayem314/react-native-keep-awake@1.4` (RN 0.78-compatible); `keepAwakeService` uses `TurboModuleRegistry.get` + cache (no-op until rebuild); `useAIChat` activates on `beginGeneration`, deactivates on stop / completion finally / abort / unmount.  
**Don't (still):** Background unload (deferred).  
**Requires:** full native rebuild.

### S18 — Export Markdown (safe) âœ…

**Done:** `buildChatMarkdown` / `isExportableMessage` (pure + Jest); HistoryDrawer long-press **Export** (share-outline); Conversation uses live messages when exporting the open chat, else `getChat`; RN `Share.share` — local only, no confirm.  
**Don't (still):** Cloud accounts / hubs.

### S19 — Storage manager (safe–medium) âœ…

**Done:** `modelStorageHelpers` + `modelStorageService` (final `.gguf` only); Settings → **Storage** tile → `StorageScreen` (sizes, free space, delete with confirm/`error` CTA); active model dual-unloads before unlink.  
**Chat data:** separate **Chat history** section — conversation count + **Clear all** (confirm); `chatHistoryService.clearAllChats()`; App `onChatHistoryCleared={handleNewChat}` so in-memory open chat resets.  
**Don't (still):** Silent delete; load `.partial`; don't clear models when clearing chats (or vice versa).

### S20 — Thinking mode (safe–medium) — **DONE 2026-08-04**

**Done:** Per-model `thinkingMode: 'auto'|'on'|'off'` (default auto) in `modelSettingsService`; pure `resolveThinkingModeForTurn` applies only for `jinja_enable`; `buildCompletionParams` wires it; Model Settings segmented Auto/On/Off; Jest Auto identity + On/Off overrides.  
**Don't reopen:** thinkStreamParser; dual family tables; S21.

### S21 — Accel status (safe) — **DONE 2026-08-04** (+ UI polish)

**Done:** After model load, INFO log via `formatAccelLogDisplay` + `logError('Acceleration', â€¦, 'INFO')` into View Logs. Selected model row in chat quick panel shows monochrome CPU/GPU/NPU (tap selected row → detail). **No** top-chrome accel chip (user preference).  
**Don't reopen:** quant allowlist, second GPU detector.

### S22 — Stages trends (medium, thin) — **DONE 2026-08-04** (+ UI polish)

**Done:** `buildUsageHistory` + `computeUsageTrend` on existing usage log; Stages **Recent runs** at **bottom** of scroll; default **5** rows + **View more** expand; chronological sparklines.  
**Don't reopen:** new analytics SDK; network upload.

### S23 — Family blurb (safe) — **DONE with S19p**

**Done:** `policyRecommendedBlurb(resolveModelPolicy(fileName))` under System Prompt on Model Settings.  
**Don't:** Duplicate a second recommended-copy system.

### S24 — Persona memory notes (safe) — **DEFERRED**

**Status:** Wider memory system needs planning. **Do not implement** until user reopens.  
**Trace (when unblocked):** `Persona` / `buildPersonaSystemPrompt` / `PersonaEditorScreen`.  
**Likely constraints later:** empty notes must leave prompt identical; no RAG/cloud-by-default without design.

### S25 — Temp chat polish — **REMOVED**

**Removed 2026-08-05:** existing temp-mode UX is sufficient. Toggle active state fixed to solid `primary` (white in dark) + `primaryText` icon. Do not re-add a polish step.

### S26 — Edit → regenerate (safe) — **DONE 2026-08-05**

**Done:** `buildMessagesAfterUserEdit` pure helper; `editUserAndRegenerate` on `useAIChat`; long-press user bubble → frosted **Copy** / **Edit** menu (same animation as history); edit truncates later turns + regenerates.  
**Don't reopen:** S24, composer-staging the edited text.

### S27 — Harden document pipeline (safe–medium) — **DONE 2026-08-05**

**Done (pipeline only):** `documentHelpers` budgets + refusal copy; PDF cap **4MB**; encrypted/header checks; weak-extract "scanned" refusal; inject budget from `n_ctx`/`n_predict` for **image OCR** in Conversation and `extractTextFromAttachment` when called. No RAG.  
**Product entry:** completed in **S27b**.  
**Don't reopen:** vector DB, full pdfium page raster OCR.

### S27b — Chat document attach (safe–medium) — **DONE 2026-08-05**

**Why:** Completes documents for users after S27 hardened a path with no entry point.  
**Done:**  
1. Third attach item: **File (PDF)** (document picker, PDF types).  
2. Pending PDF preview in composer (document icon + name).  
3. On send: extract with budget from model settings → `buildAttachmentTextForPrompt` → `textForPrompt` + `attachments: [{ type: 'pdf', â€¦ }]` → `handleSubmit` / nativeCompletion.  
4. Honest limitation strings appear in prompt when parse refuses. Images/camera unchanged.  
**Don't reopen:** S28 vision, scanned-page PDF OCR, RAG.

### S32 — Backup / restore (medium) — **DONE 2026-08-05**

**Research notes (industry):** ChatGPT-style versioned JSON in ZIP; 3-2-1 backups; never embed multi-GB GGUFs; re-download models from catalog URLs; SAF Save/Open for scoped storage; no secrets in export.

**Done:**
- Chats-only: `ofln-chats-*.json` (`format: ofln-backup`, `schemaVersion: 1`, `kind: chats`)
- Full: `ofln-backup-*.zip` → `manifest.json` + chats/personas/settings/models/stages
- Models: `@model_catalog_v1` URL registry on successful download; restore queues re-download (max 2 parallel, smallest first, disk preflight)
- Save via `saveDocuments` (user picks folder); import via `pick` + `keepLocalCopy`
- Merge vs replace; CRC-checked ZIP STORE; path-traversal rejects; 48MB cap; attachments stripped; HF token never exported
- UI: Settings → Storage → **Backup & restore**
- Pure tests: `__tests__/backupSchema.test.ts`

**Don't reopen:** Embedding full GGUF binaries in ZIP; exporting Keychain secrets.

### S28 — mmproj vision (hard, optional) — **OPEN**

**Trace:** `visionService`, `llamaProvider` `projectorPath`, live OCR path (Conversation always OCRs images for nativeCompletion today).  
**Do:** Read llama.rn **0.12.6** mmproj API first; one curated GGUF+mmproj pair; load projector when present; only then skip OCR for vision models; keep OCR fallback.  
**Don't:** Combine with S30; claim vision without device smoke.

### S29 — System TTS (medium) — **DONE 2026-08-06**

**Done:** OS TTS (`react-native-tts` + patch); product `ttsService`/`NativeModules` only; `prepareSpeechText`; Speak **rightmost** on assistant action row; stop on gen/Stop.  
**Don't reopen:** neural TTS; import package default.

### S30 — Platform STT (medium) — **recommended next for voice**

**Trace:** `ChatComposer`, permissions.  
**Do:** Verify New Arch fit of `@react-native-voice/voice` (or equivalent) before install; mic text into composer; monochrome mic.  
**Don't:** Combine with S28; neural STT.

### S31 — Remote client (medium)

**Do:** Opt-in base URL + key (keychain); fetch SSE; banner always on.  
**Don't:** Change local default.  
**UI:** Settings section; persistent `warning` banner in chat when remote active.

---

## 5. Deferred (do not implement until queue says so)

| Item | Why deferred |
|------|----------------|
| Background model unload | Races with `stopCompletion` / load |
| Biometric app lock | Extra native + gate complexity |
| Full tool/agent loop | Unreliable on small phone models; high chat-path risk |
| Rolling summary memory | Easy to pollute prompts |
| Context "increase n_ctx + reload" sheet | Needs careful reload UX; banner+new chat enough first |
| Neural TTS / ONNX / Piper as default | RAM fight with GGUF; OS TTS is S29 |
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

## 7. If guide â‰  code

**Trust the code.** Fix the guide in the same PR.

