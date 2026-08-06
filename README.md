# OFLN - Offline LLM Mobile Application

A React Native mobile application for running Large Language Models (LLMs) offline on mobile devices. The app enables users to download, manage, and interact with AI models locally without requiring an internet connection after initial setup.

## Design system

**UI/UX source of truth:** [`DESIGN.md`](./DESIGN.md)

That file defines themes, colors, page transitions, animation timings, alerts/overlays, layout patterns, and portable design rules. Agents and contributors working on this repo should read it before changing look-and-feel.

**Keep it current:** if you make a **significant design change** (tokens, motion, overlays, navigation chrome, typography, spacing language, or shared component look), update [`DESIGN.md`](./DESIGN.md) in the same change so the next agent inherits an accurate spec.

**Keep backup current:** if you add **user-durable data** (new AsyncStorage keys, SQLite tables/columns, DocumentDirectory JSON, downloadable assets users expect to keep across devices), update **export + import** per [Backup & restore](#backup--restore) in the same change. Silence is a bug for reinstalls/migrations.

## Table of Contents

- [Design system](#design-system)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Key Features](#key-features)
- [Backup & restore](#backup--restore)
- [Data Flow](#data-flow)
- [Installation & Setup](#installation--setup)
- [Development Commands](#development-commands)
- [Testing](#testing)
- [Performance Optimizations](#performance-optimizations)
- [Special Considerations](#special-considerations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Architecture

### High-Level Overview

OFLN is a **fully on-device** React Native app. There is no cloud inference backend: after GGUF models are downloaded (or imported), chat runs entirely on the phone via **llama.cpp** (`llama.rn`). Network use is limited to HuggingFace browse/download.

```
HF URL / local GGUF
        │
        ▼
RNFS DocumentDirectoryPath/*.gguf
        │
        ├─(download / model switch)──► llamaService.initLlama   [legacy path]
        │
        └─(Conversation open)────────► llamaProvider.prepare    [active chat path]
                                              │
User message (+ optional ML Kit OCR)
        │
        ▼
useAIChat.handleSubmit (useNativeCompletion: true)
        │
        ▼
nativeContext.completion (streaming tokens)
        │
        ▼
UI patches + optional <think> blocks + AsyncStorage chat save + usage_log.json
```

Layering:

- **Screens**: ModelSelection, Conversation, Settings, Storage (backup), Stages, Personas, Diagnostics
- **Providers**: `llamaProvider` — active `@react-native-ai/llama` load/unload for chat
- **Services**: download, settings, chat history, **backup/restore**, acceleration gating, vision/OCR, usage
- **Hooks**: `useAIChat` (chat + streaming), HuggingFace browse, filters
- **Native**: Custom app code is UI/shell only; inference natives ship inside `llama.rn`

### Model load & inference

| Path | Module | When used |
|------|--------|-----------|
| **Product load** | `src/providers/llamaProvider.ts` | App download/select, ModelSelection, Conversation auto-load |
| **Chat** | `useAIChat` → `nativeCompletion` | Streaming with thinking/reasoning params |
| **Helpers** | `src/services/llamaService.ts` | `checkFileExists` only for product UI; Diagnostics uses its own `initLlama` |

Unload on back-to-models: `releaseAllLlama()` + `llamaProvider.unloadModel()`. An alternate Vercel AI SDK `streamText()` path exists in `aiChatService` but is not the default UI path.

### Core Technologies

- **React Native 0.78.1** / **React 19**: Cross-platform UI (New Architecture **required**)
- **TypeScript**: Type safety across app code
- **llama.rn (0.12.6)**: Native llama.cpp bindings (GGUF inference; Gemma 4 / MTP support)
- **@react-native-ai/llama**: Language-model provider used by `llamaProvider`
- **ai (Vercel AI SDK)**: `streamText` orchestration available alongside native completion
- **AsyncStorage / op-sqlite**: Chat history (SQLite when linked), model settings, personas, model download catalog, local-import metadata
- **react-native-fs (RNFS)**: Model download/storage under DocumentDirectory
- **@react-native-documents/picker**: GGUF import, backup save/open (system folder picker)
- **Axios**: HuggingFace catalog/metadata requests
- **@react-native-ml-kit/text-recognition**: On-device OCR for image attachments (vision fallback)
- **react-native-keychain**: HF token (and future secrets) — **never** included in backups

### State Management

The application uses a combination of:

- **React Context API**: Theme and global alert management (ThemeContext, CustomAlertProvider)
- **Local State**: Component-level state with `useState` for UI state
- **Refs**: Values that don't trigger re-renders (animation state, scroll tracking, generation buffers)
- **AsyncStorage / SQLite**: Durable user data (chat history backend, model settings, personas, model catalog, etc.); portable via [Backup & restore](#backup--restore)
- **Provider singleton**: `llamaProvider` holds ready/loading status + native context handle for chat

### Design Principles

The codebase follows these principles:

- **Single Responsibility Principle (SRP)**: Each component/service has one clear purpose
  - Components handle UI rendering and user interactions
  - Services manage business logic and data operations
  - Hooks encapsulate reusable stateful logic
  - Utils provide pure utility functions
- **Don't Repeat Yourself (DRY)**: Shared logic extracted to hooks and utilities
  - Centralized animation configurations
  - Reusable components (ModelCard, BottomSheet, CustomAlert)
  - Common utilities for model name formatting, date parsing
  - Acceleration / quant gating shared by provider and legacy loader
- **Keep It Simple Stupid (KISS)**: Simple, readable code over complex abstractions
- **Performance First**: Optimized for mobile devices with 60fps animations and efficient rendering

### Code Quality

The codebase maintains high code quality through:

- **Documentation**: Key services and complex inference paths have professional comments
- **Type Safety**: TypeScript coverage with shared types in `src/types/ai.ts`
- **Error Handling**: Try-catch with graceful recovery and user feedback
- **Consistent Patterns**: Standardized animations, error handling, and component structure
- **Performance Monitoring**: Tokens/sec and usage logs via `performanceTracking` + Performance screen

## Project Structure

```
src/
├── api/
│   └── model.ts                    # GGUF download via RNFS (progress + cancel)
├── components/                     # Reusable UI (ModelCard, BottomSheet, ProgressBar, …)
├── context/
│   └── ThemeContext.tsx
├── hooks/
│   ├── useAIChat.ts                # Chat hook → native completion / streamText
│   ├── useHuggingFaceModels.ts
│   ├── useKeyboardPadding.ts
│   └── useModelFilter.ts
├── providers/
│   └── llamaProvider.ts            # Active @react-native-ai/llama load/unload
├── screens/
│   ├── ConversationScreen.tsx      # Chat UI + provider load on model select
│   ├── ModelSelectionScreen.tsx    # Browse / download / local import
│   ├── ModelSettingsScreen.tsx
│   ├── DiagnosticsScreen.tsx       # DEV: smoke test + accel device dump
│   ├── InfoScreen.tsx
│   ├── PersonaEditorScreen.tsx
│   ├── PersonasLibraryScreen.tsx
│   ├── SettingsScreen.tsx
│   ├── StorageScreen.tsx           # Models sizes, clear chats, backup/restore (S32)
│   └── StagesScreen.tsx
├── services/
│   ├── accelerationCapabilityService.ts  # OpenCL / Hexagon detection (Android)
│   ├── aiChatService.ts            # streamChat + nativeCompletion orchestration
│   ├── backupService.ts            # Export/import orchestration (S32)
│   ├── chatHistoryService.ts       # SQLite (+ AsyncStorage fallback); importChats
│   ├── deviceEnv.ts                # Emulator heuristic
│   ├── documentParsingService.ts   # Attachments / PDF text extraction
│   ├── inferencePerfParams.ts          # Shared flash_attn / n_batch / KV cache knobs
│   ├── llamaService.ts             # checkFileExists (+ unused legacy stop/completion helpers)
│   ├── localModelService.ts
│   ├── mediaNormalizeService.ts        # Image pick resize, content:// copy, OCR caps
│   ├── modelCatalogService.ts      # Persistent download URLs for backup rehydrate
│   ├── modelDownloadQueue.ts       # Capped parallel re-downloads after import
│   ├── modelInfoService.ts         # Quant detect + Android accel allowlist
│   ├── modelSettingsService.ts     # + exportAllModelSettings / importModelSettingsMap
│   ├── modelStorageService.ts      # List/delete on-device GGUFs
│   ├── ocrService.ts               # ML Kit OCR
│   ├── personaService.ts
│   ├── performanceTracking.ts      # Unified usage metrics / tok/s / Performance screen data
│   ├── usageTracker.ts             # Re-export shim → performanceTracking
│   └── visionService.ts            # Vision model detection / message formatting
├── styles/
│   └── styles.ts
├── types/
│   └── ai.ts                       # Shared chat / provider types
└── utils/
    ├── animationConfig.ts
    ├── backupSchema.ts             # Format magic, schema v1, parse/validate pure helpers
    ├── errorLogger.ts
    ├── modelUtils.ts
    ├── systemBars.ts
    └── zipStore.ts                 # Minimal ZIP STORE (create/extract, CRC)
```

## Key Features

### Model Management

- **Browse Models**: Browse models from HuggingFace with filtering by author and type
- **Download Models**: Download GGUF models optimized for mobile devices
- **Local Models**: Add models from device storage via file picker
- **Model Settings**: Per-model configuration (temperature, context window, GPU layers)
- **Quantization Support**: Support for multiple quantization formats (Q2_K, Q4_K_M, Q5_K_M, etc.); Android accel allowlist is `Q4_0` / `Q6_K`

### Chat Interface

- **Persistent History**: Chat history via `chatHistoryService` (SQLite when linked); exportable in full/chat backups
- **Multiple Conversations**: Manage multiple chat sessions
- **Pin/Unpin**: Pin important conversations for quick access
- **Custom Titles**: Rename conversations with custom titles
- **Real-time Streaming**: Tokens streamed from native `completion()` as they generate
- **Reasoning Models**: Parses `<think>` / reasoning streams for Qwen3, DeepSeek-R1, SmolLM3, QwQ
- **Image / Document Attachments**: Vision models get multimodal formatting; others use ML Kit OCR / text extraction
- **Performance Metrics**: Track tokens per second for each response
- **Temporary Mode**: Conversations that aren't saved to history

### Performance Tracking

- **Tokens Per Second**: Real-time monitoring of generation speed
- **Inference Time**: Track time taken for each inference
- **Performance Levels**: Automatic classification (High/Medium/Low)
- **Usage Logs**: Detailed logs under DocumentDirectory (`usage_log.json`)
- **Visual Analytics**: Charts and graphs in Stages screen

### Theme Support

- **Light/Dark Themes**: System-aware theme switching
- **Persistent Preference**: Theme choice saved across app restarts
- **Smooth Transitions**: Animated theme transitions

### Backup & restore (device transfer)

- **Entry point:** Settings → **Storage** → **Backup & restore**
- **Chats only:** versioned JSON file (`ofln-chats-*.json`)
- **Full backup:** versioned ZIP (`ofln-backup-*.zip`) of chats, personas, settings, model catalog, Stages usage log
- **Models:** GGUF binaries are **not** packed (phone size limits); catalog URLs re-download on import (smallest first, max 2 parallel)
- **Secrets:** HF token stays in Keychain and is **never** exported
- **User picks location:** system Save / Open dialogs (scoped storage–safe)

See [Backup & restore](#backup--restore) for the format, current payload map, and **required checklist when you add new durable app data**.

## Backup & restore

Portable, offline device transfer (chat continuity + optional full profile). Designed like ChatGPT-style exports: versioned JSON, optional ZIP of JSON parts, no multi‑GB model blobs.

### User surface

| Action | Behavior |
|--------|----------|
| Export chat history | Writes `ofln-chats-YYYYMMDD-HHMMSS.json`; system Save dialog |
| Export full backup (ZIP) | Writes `ofln-backup-*.zip`; same Save dialog |
| Import — merge | Upserts by id (import wins on collision); keeps local-only rows |
| Import — replace | Clears replaced domains (chats/personas for full), then loads backup |

Import validates magic + schema, then applies data; full backups queue missing models for re-download.

### File format (schema v1)

Magic fields (every payload):

```json
{
  "format": "ofln-backup",
  "schemaVersion": 1,
  "kind": "chats" | "full",
  "exportedAt": 0,
  "appVersion": "0.1.1"
}
```

| Kind | Container | Contents |
|------|-----------|----------|
| `chats` | Single `.json` | `chats[]` plus magic fields |
| `full` | `.zip` (STORE/no compression) | `manifest.json`, `chats.json`, `personas.json`, `settings.json`, `models.json`, `stages.json` |

Rules:

- Importers accept `schemaVersion` **≤** `BACKUP_SCHEMA_VERSION` in `src/utils/backupSchema.ts`.
- Higher future versions must fail with a clear “update the app” message (already implemented).
- Prefer additive optional fields over renames so older apps keep working.
- Bump `BACKUP_SCHEMA_VERSION` only for **breaking** shape changes; update pure tests in `__tests__/backupSchema.test.ts`.

### What is included today (full backup)

| Domain | Source | ZIP / field | Restore notes |
|--------|--------|-------------|---------------|
| Chats | `chatHistoryService` (SQLite / AsyncStorage fallback) | `chats.json` | `importChats(mode)`; message **attachment URIs stripped** (local paths don’t transfer) |
| Personas | `@personas` via `personaService` | `personas.json` | `replaceAllPersonas` / `mergePersonasImport` |
| Theme | `@app_theme_mode` | `settings.json` → `themeMode` | AsyncStorage + `ThemeContext.setThemeMode` |
| Onboarding flag | `@has_completed_onboarding` | `settings.json` → `onboardingComplete` | Restored as completed when true |
| Per-model settings | `@model_settings_{fileName}` | `settings.json` → `modelSettings` | `exportAllModelSettings` / `importModelSettingsMap` |
| Model catalog | `@model_catalog_v1` + on-device GGUF names/sizes | `models.json` | URLs re-download; names without URLs listed as manual |
| Stages metrics | `DocumentDirectory/usage_log.json` | `stages.json` | Replace or append by mode |

### Explicitly **not** backed up

| Item | Why |
|------|-----|
| HF / API tokens (Keychain) | Secrets must not leave secure storage in a shareable file |
| GGUF model **binaries** | Multi‑GB; re-download via catalog instead |
| `*.gguf.partial` / resume meta | Transient download state |
| In-memory only state | Model loaded in RAM, open draft composer text, UI panels |
| Chat image/PDF **files** | Attachment paths are device-local; text content still exports |

### Code map (extend here, not elsewhere)

| Concern | File(s) |
|---------|---------|
| Orchestration (export/import I/O) | `src/services/backupService.ts` |
| Schema, parse, merge pure helpers | `src/utils/backupSchema.ts` |
| ZIP encode/decode | `src/utils/zipStore.ts` |
| Download URL registry | `src/services/modelCatalogService.ts` (register after successful download in `src/api/model.ts`) |
| Re-download queue | `src/services/modelDownloadQueue.ts` (cap **2**, smallest-first) |
| UI | `src/screens/StorageScreen.tsx` |
| Unit tests | `__tests__/backupSchema.test.ts` |

Product agents: short S32 note also in [`docs/AGENT_IMPLEMENTATION_GUIDE.md`](./docs/AGENT_IMPLEMENTATION_GUIDE.md).

### Agents: checklist when adding durable data

**If you add anything the user would miss after a phone reinstall or migrate, you must wire backup in the same PR (or an immediately following PR). Do not leave silent gaps.**

1. **Decide: user data vs secret vs ephemeral**
   - **User data** (chats, personas, preferences, bookmarks, notes) → include in full backup (and chats-only if it is chat-related).
   - **Secret** (tokens, keys, passwords) → Keychain / secure store only; **never** export; document under “not backed up”.
   - **Ephemeral** (download partials, caches, RAM model state) → leave out.

2. **Add export reader** in `backupService` (`buildFullPayload` / `collectSettings` / dedicated collector). Prefer a service function (`exportFoo()`) rather than raw AsyncStorage keys scattered in the UI.

3. **Add import writer** with **merge** and **replace** behavior (same modes as chats). Reuse existing patterns: chats → `chatHistoryService.importChats`, personas → `replaceAllPersonas` / `mergePersonasImport`.

4. **Schema**
   - Prefer a new optional field under existing JSON parts (`settings.json`, etc.) without bumping schema.
   - New top-level ZIP member (e.g. `bookmarks.json`): add to zip creation **and** `zipBytesToPayload` / `manifest.files`.
   - Breaking change: increment `BACKUP_SCHEMA_VERSION`; keep old readers where practical; extend pure tests.

5. **Sanitize** device-local paths, `content://` URIs, and anything that cannot work on another device. Strip or rewrite on export (see `sanitizeChatForBackup`).

6. **Large binaries** (models, media libraries): store **metadata + re-fetch URLs** (or user prompt to re-add). Register sources like `registerModelSource` when the user first obtains the asset.

7. **Tests**: pure parse/merge/round-trip for new fields in `__tests__/backupSchema.test.ts` (or a sibling test that stays free of native modules).

8. **Docs**: update **this table** and the “not backed up” list in the same change. If the design language changes, still update `DESIGN.md` separately.

9. **Smoke**: Settings → Storage → full export → import merge on a clean install path if you can; at least unit tests for the schema helpers.

**Anti-patterns**

- Writing only to AsyncStorage/Keychain/SQLite without backup hooks.
- Packing multi‑GB files into the ZIP “because it’s simpler”.
- Exporting tokens “for convenience”.
- Bumping schema for cosmetic renames without a compatibility plan.

## Data Flow

### Model Download Flow

1. User selects a curated or HuggingFace search result in ModelSelectionScreen
2. App builds `https://huggingface.co/{repoId}/resolve/main/{file}` and downloads via `src/api/model.ts` (`react-native-blob-util` when `USE_RESUMABLE_DOWNLOADS` is true; legacy `RNFS.downloadFile` otherwise)
3. Destination: `{RNFS.DocumentDirectoryPath}/{fileName}.gguf` (in-progress files are `*.gguf.partial` — never loaded as models). On successful activate, `registerModelSource` records the URL in `@model_catalog_v1` so full backups can re-download the file on another device.
4. Progress updates the UI; pause keeps the partial for resume; discard deletes partial + meta. Optional size verify before rename/activate
5. On success, downloaded models are discovered by listing final `*.gguf` only in DocumentDirectory
6. Local imports copy a picked GGUF into DocumentDirectory; metadata lives in AsyncStorage (`@local_models`)
7. Download/select complete loads via `llamaProvider.loadModel` (same path as Conversation)
8. Gated HF models: Bearer token from Keychain (Models → **HF token**), attached only for `huggingface.co` hosts

**Quantization**: Not converted in-app. Users download GGUF variants (UI prefers mobile-friendly quants). Android GPU/NPU acceleration is allowlisted for **`Q4_0` and `Q6_K` only**.

**Curated popular list** (6 models in `ModelSelectionScreen.POPULAR_MODELS`): Qwen3.5 4B / 2B / 0.8B (Q4_0), Gemma 4 E2B (Q4_0, ungated Unsloth mirror), Phi-4 Mini (Q4_0), SmolLM3 3B (Q4_0). Gemma 4 requires llama.rn ≥ 0.12.5.

**Error Handling**: Network failures, storage full, and missing files are handled with user-facing errors.

### Model Loading Flow

1. User selects a downloaded / imported `.gguf`
2. Per-model settings load from AsyncStorage (`@model_settings_{fileName}`), with defaults if missing
3. Path is validated; previous provider model is unloaded
4. **Sole product path**: `llamaProvider.loadModel` → `@react-native-ai/llama` `languageModel` + `prepare()` → status `ready`; native handle via `getNativeContext()`
5. Android gating (in provider): emulator → CPU; non-allowlisted quant → CPU; else OpenCL/HTP with preferred `devices` and layer caps
6. Leaving conversation: `releaseAllLlama` + `llamaProvider.unloadModel`
7. Diagnostics probes may call `initLlama` separately (not the chat load path)

Defaults (see `modelSettingsService`): `n_ctx` 2048, `n_gpu_layers` 1, `temperature` 0.65, `top_p` 0.90, `top_k` 40, `repeat_penalty` 1.20, `n_predict` 256. On Android, `use_mlock` is forced off and `n_ctx` is capped at 2048 in the provider.

### Chat Flow

1. User sends a message from ConversationScreen (optional image → ML Kit OCR when not a native vision model)
2. `useAIChat.handleSubmit` runs with `useNativeCompletion: true`
3. Ensures `llamaProvider.isReady()`, then `nativeCompletion(nativeContext, …)`
4. Native `context.completion` streams tokens; UI updates via throttled patches
5. Thinking/reasoning content is split out for supported reasoning models; Qwen may set `enable_thinking` only for “complex” prompts
6. Stop uses AbortController and/or `ctx.stopCompletion()`
7. Chat is persisted via `chatHistoryService` (SQLite `ofln_chats.sqlite` when linked; AsyncStorage fallback), max 100 chats. Device transfer: Settings → Storage → Backup.
8. Metrics recorded via `recordCompletionUsage` → `usage_log.json`

**Alternate path**: `streamChat` → Vercel `streamText({ model: llamaProvider.getLanguageModel() })` — available for AI SDK DX, not the default Conversation setting.

### Chat History Flow

1. Conversations are automatically saved when messages change (debounced 500ms)
2. Chat history is loaded when side panel opens
3. Conversations are grouped by month/year for organization
4. Pinned conversations appear at the top
5. Long-press menu allows rename, pin/unpin, and delete operations

**Performance**: History loading is deferred until panel opens, and grouping is memoized for efficiency.

### Vision / Attachments Flow

1. User picks or captures a photo — ImagePicker downscales to max edge **1600px** at JPEG quality **0.75** (`mediaNormalizeService`)
2. On send, Android `content://` URIs are copied to app cache before ML Kit OCR runs
3. OCR text is length-capped (~8k chars) and injected as `textForPrompt` (default chat path)
4. If model name matches known VL patterns **and** an mmproj projector is loaded, multimodal pixels can be used; curated Gemma 4 / similar still OCR-fallback until mmproj download is wired
5. PDFs: only modest text PDFs are scraped (size-capped); scanned PDFs return a clear refusal message instead of risking OOM

### Inference performance (llama.rn 0.12.6)

- `flash_attn_type: 'auto'` — lets llama.cpp pick flash attention when the backend supports it
- `n_batch`: **512** when GPU/NPU layers > 0, else **256** (lower peak RAM on CPU phones)
- Android: KV cache `cache_type_k/v: q8_0` to reduce memory vs f16
- MTP speculative decoding is available in llama.rn but not enabled globally (needs model-embedded MTP / companion draft — opt-in later for Gemma 4 when mtp GGUF is paired)

## Installation & Setup

### Prerequisites

- **Node.js >= 18**: Required for React Native development
- **React Native CLI**: For running and building the app
- **Android Studio**: For Android development (with Android SDK)
- **Xcode**: For iOS development (macOS only, with CocoaPods)
- **JDK 17+ (prefer 21)**: Required for Android builds with Gradle 8.12. Use Android Studio’s bundled JBR and set `JAVA_HOME` to it (e.g. `C:\Program Files\Android\Android Studio\jbr` on Windows). Avoid relying on a newer system JDK on `PATH` alone.
- **New Architecture enabled**: Required by current `llama.rn` (≥0.10). Already set: `android/gradle.properties` (`newArchEnabled=true`) and `ios/Podfile` (`RCT_NEW_ARCH_ENABLED=1`)

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ofln
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **iOS Setup (macOS only)**
   ```bash
   cd ios
   bundle install
   bundle exec pod install
   cd ..
   ```

4. **Start Metro bundler**
   ```bash
   npm start
   # or
   yarn start
   ```

5. **Run on device/emulator**
   ```bash
   # Android
   npm run android
   
   # iOS
   npm run ios
   ```

### Environment Configuration

No environment variables are required. The app uses:
- Default React Native configuration
- AsyncStorage for local persistence
- RNFS DocumentDirectoryPath for model storage (`*.gguf`)
- On-device llama.cpp only for inference (no cloud LLM API)

## Development Commands

### Available Scripts 
 
- `npm start`: Start Metro bundler
- `npm run android`: Build and run on Android device/emulator
- `npm run ios`: Build and run on iOS simulator/device
- `npm test`: Run Jest unit tests
- `npm run lint`: Run ESLint for code quality checks

### Metro Bundler Options

- `npm start -- --reset-cache`: Clear Metro cache and restart (use when experiencing build issues)
- `npm start -- --port 8081`: Start on custom port (if default port is in use)

### Android Specific

- `cd android && ./gradlew clean`: Clean Android build artifacts
- `cd android && ./gradlew assembleDebug`: Build debug APK without installing
- `cd android && ./gradlew installDebug`: Install debug APK on connected device
- `npm run android:clean`: Clean Android build artifacts (convenience script)
- `npm run android:uninstall`: Uninstall app from connected device/emulator
- `npm run android:clean-emulator`: Free up emulator storage (trim caches + uninstall app)
- `npm run android:check-storage`: Check storage usage on connected device/emulator
- `npm run android:install`: Install debug APK without building (faster if already built)

## Build APK
- `cd android`
- `.\gradlew.bat clean`
- `.\gradlew.bat assembleRelease`

### iOS Specific

- `cd ios && pod install`: Reinstall CocoaPods dependencies
- `cd ios && pod update`: Update CocoaPods dependencies to latest versions
- `cd ios && xcodebuild clean`: Clean Xcode build folder

## Testing

### Unit Testing

The project uses Jest. Current coverage is thin (smoke test under `__tests__/`); add colocated `*.test.ts(x)` files as you extend services.

```bash
npm test
```

### Test Coverage

```bash
npm test -- --coverage
```

### Manual Testing Checklist

- [ ] Model download and cancellation
- [ ] Model loading and unloading
- [ ] Chat message sending and receiving
- [ ] Chat history persistence across app restarts
- [ ] Theme switching (light/dark)
- [ ] Model settings configuration and persistence
- [ ] Local model file picker and management
- [ ] Error handling (network failures, file errors)
- [ ] Performance metrics tracking
- [ ] Temporary mode functionality
- [ ] Chat pinning and renaming
- [ ] Model switching during active conversation

## Performance Optimizations

### Rendering Optimizations

- **React.memo**: Multiple components memoized (ModelCard, ThinkingIndicator, ChatHistoryCard)
- **useMemo**: Filtered models list, grouped chat history, and expensive calculations are memoized
- **useCallback**: All event handlers are memoized to prevent child re-renders
- **Lazy Loading**: Models are loaded on-demand, not all at once
- **Optimized Re-renders**: Custom comparison functions in memo() prevent unnecessary updates
- **Refs for Non-Reactive State**: Animation values and scroll tracking use refs to avoid re-renders
- **Virtualization**: Consider using FlatList for long lists (future optimization)

### Animation System

The application uses a centralized animation configuration system for consistency and performance:

- **Configuration Location**: `src/utils/animationConfig.ts` contains all animation settings
- **Native Driver**: All animations use `useNativeDriver: true` for 60fps performance on UI thread
- **Standardized Durations**: 
  - Fast interactions (buttons, toggles): 120ms
  - Standard interactions (panels, menus): 200ms
  - Page transitions: 220-250ms (platform-specific)
  - Complex animations: 300ms
- **Material Design Easing**: Consistent bezier curves for smooth, natural-feeling animations
- **Staggered Animations**: Card animations use capped delays (max 200ms) via `getStaggeredDelay()` utility
- **Single Animation Phase**: Animations only play once on initial mount to prevent lag
- **Animation Cancellation**: Proper cleanup prevents animation conflicts and memory leaks
- **InteractionManager**: Heavy operations deferred until after animations complete

### Animation Optimizations

- **Centralized Configuration**: All animation configs imported from `animationConfig.ts`
- **Consistent Patterns**: Same easing curves and durations across similar interactions
- **Performance Monitoring**: Animations run on UI thread for smooth 60fps performance
- **Memoized Components**: ThinkingIndicator and ChatHistoryCard are memoized to prevent unnecessary re-renders
- **Ref-based State**: Animation values stored in refs to avoid triggering re-renders

### Memory Management

- **Model Context Release**: Previous models are released before loading new ones
- **Cache Management**: Utility functions use caches to avoid repeated operations (quantization, date formatting)
- **Refs for Tracking**: Animation state uses refs to avoid re-renders
- **Debounced Saves**: Chat history saves are debounced (500ms) to reduce write operations

### Network Optimizations

- **Request Cancellation**: Pause keeps `.gguf.partial` for resume; discard deletes partial + meta
- **Progress Tracking**: Efficient progress updates without blocking UI thread
- **Error Recovery**: Network errors keep partials for resume; load failures offer Retry / Models / Lower context
- **Timeout Handling**: HuggingFace API/metadata requests have appropriate timeouts (8-15 seconds)

### Mobile-Specific Optimizations

- **Reduced Animation Windows**: Initial animation phase reduced from 1500ms to 800ms
- **Capped Animation Delays**: Staggered animations capped at 200ms max delay
- **Faster Close Animations**: Panel close animations reduced to 150ms
- **Optimized Spring Physics**: Model selector uses faster spring (friction: 7, tension: 50)

## Architecture Details

### Animation Architecture

The animation system is built on React Native's Animated API with the following architecture:

1. **Centralized Configuration** (`src/utils/animationConfig.ts`):
   - Defines standard durations, easing curves, and animation configs
   - Provides utility functions like `getStaggeredDelay()` for list animations
   - Ensures consistency across all components

2. **Component-Level Animations**:
   - Each component imports animation configs from the centralized file
   - Animation values stored in refs to prevent re-renders
   - Proper cleanup on unmount to prevent memory leaks

3. **Performance Optimizations**:
   - All animations use native driver for UI thread execution
   - Staggered animations capped to prevent long chains
   - Animation cancellation prevents conflicts during rapid interactions

### State Management Architecture

The application uses a hybrid state management approach:

1. **Global State** (React Context):
   - Theme preferences (light/dark mode)
   - Alert system for user notifications

2. **Component State** (useState):
   - UI state (panels open/closed, selections)
   - Form inputs and temporary values

3. **Refs** (useRef):
   - Animation values that don't need to trigger re-renders
   - Scroll position tracking
   - Non-reactive state (e.g., animation phase tracking)

4. **Persistent State**:
   - Chat history (op-sqlite `ofln_chats.sqlite` when native is linked; AsyncStorage fallback)
   - Model settings, personas, theme, model download catalog (`@model_catalog_v1`)
   - Usage metrics (`usage_log.json`)
   - **Portable** via Settings → Storage backup (see [Backup & restore](#backup--restore)); secrets stay in Keychain

### Error Handling Architecture

Comprehensive error handling is implemented throughout:

1. **Service Layer**: All service functions wrap operations in try-catch blocks
2. **User Feedback**: Errors are displayed via toast notifications or alerts
3. **Graceful Degradation**: UI remains functional even when operations fail
4. **Error Recovery**: Failed operations can be retried without app restart
5. **Edge Case Validation**: Input validation and null checks prevent runtime errors

## Special Considerations

### Model File Sizes

- Models can be several GB in size (typically 0.5GB to 8GB)
- Ensure sufficient storage space before downloading
- Consider device storage limitations (especially on older devices)
- Models are stored in app's document directory (persists across updates)
- Large models may take significant time to download (use Wi-Fi)

### Memory Constraints

- Large models may require significant RAM (2GB-8GB depending on model size)
- Context window size (n_ctx) directly affects memory usage
- GPU layers (n_gpu_layers) can help but may not be available on all devices
- Monitor memory usage during inference (especially on lower-end devices)
- `use_mlock` is forced **off** on Android; on iOS the loader may try it when RAM allows
- Android provider caps `n_ctx` at 2048 for stability

### Network Requirements

- Initial model download requires stable internet connection
- Large models may take significant time to download (30 minutes to hours)
- Consider Wi-Fi for large downloads to avoid data charges
- Download progress is tracked but may not be 100% accurate
- Network interruptions keep the partial for resume; pause ≠ discard

### Platform Differences

#### Android

- File system access requires proper permissions (handled automatically)
- Storage location: `RNFS.DocumentDirectoryPath` (app-specific directory)
- Models are accessible after app restart
- Background download limitations may apply
- `android:largeHeap="true"` is set to help with large GGUF loads

**Acceleration (OpenCL / Hexagon NPU)**

GPU/NPU acceleration is handled by llama.rn 0.12.x and gated in app code (`accelerationCapabilityService` + quant allowlist):

- **OpenCL (GPU)**: Qualcomm Adreno 700+ devices. Requires **Q4_0 or Q6_K** quantized models.
- **Hexagon (NPU)**: Qualcomm SM8450+ (Snapdragon 8 Gen 1 or newer) with HTP; app prefers `devices: ['HTP0']` when HTP is present.
- Set GPU Layers (`n_gpu_layers`) > 0 in Model Settings. Emulators and non-allowlisted quants force CPU (`n_gpu_layers = 0`).
- Runtime check uses `getBackendDevicesInfo()`; capable devices may allow up to 99 layers (capped by settings).
- Manifest note: `AndroidManifest.xml` currently does **not** declare `uses-native-library` for `libOpenCL.so` / `libcdsprpc.so` — a comment notes llama.rn can still load them at runtime when present on device.
- **Gemma 4** GGUFs need llama.rn ≥ 0.12.5 (Gemma MTP / gemma4 architecture).

In Diagnostics → **Check acceleration** to dump backend devices (Android).

#### iOS

- File system access is sandboxed (app-specific directory only)
- Storage location: App's document directory
- Models persist across app updates
- Background download limitations apply (downloads pause when app backgrounds)
- App-level acceleration service reports Android-only; Metal/GPU offload (when available) comes from llama.rn/llama.cpp defaults when `n_gpu_layers > 0`

### Error Handling

The application handles various error scenarios with comprehensive edge case coverage:

- **Network Errors**: Download failures are caught and displayed to user with retry options
- **File System Errors**: File operations are wrapped in try-catch blocks with validation
- **Model Loading Errors**: Invalid models are detected and reported with helpful messages
- **Storage Errors**: AsyncStorage failures are handled gracefully with fallbacks
- **Context Errors**: Model context errors are caught and context is cleared
- **Generation Errors**: Streaming errors are caught and user is notified
- **Empty State Validation**: All functions validate inputs before processing
- **Graceful Degradation**: UI remains functional even when operations fail
- **Error Recovery**: Failed operations can be retried without app restart

### Edge Cases

The application handles numerous edge cases to ensure robust operation:

- **Concurrent Downloads**: Only one download at a time is supported (UI prevents multiple)
- **Model Deletion During Use**: Active models cannot be deleted (validation in place)
- **Storage Full**: Download fails gracefully when storage is full (error message shown)
- **Invalid Model Files**: Corrupted files are detected and can be removed
- **App Backgrounding**: Downloads pause when app goes to background (platform limitation)
- **Memory Pressure**: Low memory situations handled with context release
- **Network Interruption**: Mid-fail / pause keeps `.partial` for resume; discard removes it
- **Empty Conversations**: Empty message arrays are validated before processing
- **Missing Context**: Model context validation before all operations
- **Animation Conflicts**: Animation cancellation prevents overlapping animations
- **Keyboard Handling**: Complex keyboard padding calculations for various Android OEMs
- **Scroll State**: Auto-scroll intelligently enables/disables based on user interaction
- **Chat History**: Empty or corrupted history files are handled gracefully
- **Model Settings**: Missing settings fall back to defaults automatically

### Security Considerations

- Models are stored locally on device (no cloud storage of weights)
- Chat history is stored locally (not synced to cloud)
- Inference never leaves the device
- HuggingFace is contacted only for catalog/search and GGUF downloads
- File system access is sandboxed per platform requirements
- OCR uses on-device ML Kit (no cloud vision API)

## Troubleshooting

### Common Issues

#### Metro Bundler Won't Start

- Clear cache: `npm start -- --reset-cache`
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check port 8081 is not in use: `lsof -i :8081`
- Restart Metro bundler

#### Android Build Fails

- Clean build: `cd android && ./gradlew clean`
- Check Android SDK is properly configured in Android Studio
- Verify `JAVA_HOME` points at JDK 17+ (prefer Android Studio JBR 21). The app uses Gradle 8.12 via `android/gradle/wrapper`.
- Check `android/build.gradle` for version conflicts
- Ensure Android emulator/device is connected: `adb devices`

#### Cursor/VS Code: “Could not use Gradle version X and Java version 21”

These come from the **Gradle for Java** extension discovering leftover wrappers inside `node_modules` (e.g. Gradle 4.10 / 5.4 / 7.5). They are unused by the app build—autolinking builds those libraries with the root Gradle 8.12 project.

Workspace settings in `.vscode/settings.json` already exclude `node_modules` and limit nested Gradle discovery to `android/`. If toasts persist: reload the window, or run **Java: Clean Java Language Server Workspace**. Do not upgrade wrappers under `node_modules`.

#### Android Installation Fails: INSTALL_FAILED_INSUFFICIENT_STORAGE

This error occurs when the Android emulator runs out of storage space. Here's how to prevent and fix it:

**Prevention:**
1. **Regularly clean emulator storage**: Run `npm run android:clean-emulator` before installing
2. **Monitor storage**: Use `npm run android:check-storage` to check available space
3. **Increase emulator storage**: When creating a new AVD in Android Studio, set internal storage to at least 8GB (recommended: 16GB)
4. **Uninstall unused apps**: Remove apps you're not testing from the emulator
5. **Wipe emulator periodically**: In Android Studio AVD Manager → Wipe Data (cold boot)

**Quick Fix:**
```bash
# Option 1: Use the convenience script
npm run android:clean-emulator

# Option 2: Manual steps
adb uninstall com.ofln          # Uninstall existing app
adb shell pm trim-caches 500M   # Free up cache space
npm run android                 # Try installing again
```

**If issue persists:**
1. Check storage: `adb shell df -h` - Look for partitions at 100% usage
2. Wipe emulator data: Android Studio → AVD Manager → Wipe Data
3. Create new AVD with larger storage: Settings → Advanced → Internal Storage (set to 16GB+)
4. Uninstall other apps: `adb shell pm list packages` then `adb uninstall <package-name>`

#### iOS Build Fails

- Run `pod install` in `ios` directory
- Clean Xcode build folder: Product > Clean Build Folder (Cmd+Shift+K)
- Check CocoaPods version compatibility
- Verify Xcode command line tools: `xcode-select --print-path`
- Check iOS deployment target matches requirements

#### Models Won't Load

- Verify model file exists and is not corrupted: Check file size matches expected
- Check file permissions: Ensure app has read access
- Ensure sufficient memory available: Close other apps
- Review model settings: Context window size may be too large
- Check GPU layers setting: Try reducing n_gpu_layers if device doesn't support GPU
- Review console logs for specific error messages

#### Downloads Fail

- Check internet connection: Verify Wi-Fi or cellular data is active
- Verify sufficient storage space: Check available storage in device settings
- Check file system permissions: Ensure app has write permissions
- Review error logs: Check console for specific error messages
- Try downloading smaller model first: Verify download functionality
- Check HuggingFace API status: Service may be temporarily unavailable

#### Performance Issues

- Reduce context window size (n_ctx): Lower values use less memory
- Lower GPU layers if available: Try n_gpu_layers: 0 for CPU-only
- Close other apps: Free up memory for model inference
- Use smaller quantization models: Q2_K or Q3_K_M instead of Q4_K_M
- Reduce n_predict: Limit max tokens generated
- Check device temperature: Overheating can throttle performance

#### Chat History Not Saving

- Check AsyncStorage permissions: Should be automatic
- Verify sufficient storage space: AsyncStorage has size limits
- Check console for errors: Storage errors are logged
- Try clearing app data: Reset may resolve corruption issues

#### Animations Lagging

- Check device performance: Lower-end devices may struggle
- Reduce animation complexity: Already optimized, but can disable if needed
- Close other apps: Free up CPU/GPU resources
- Check React Native performance monitor: Use DevMenu > Show Perf Monitor

### Debug Mode

Enable debug logging by checking console output. The app logs:

- Model loading progress and errors
- Download progress and network errors
- Inference metrics (tokens per second, inference time)
- Error details with stack traces
- Performance warnings

### Getting Help

1. Check console logs for error messages (most issues are logged)
2. Review error handling in relevant service files
3. Verify model file integrity (file size, extension)
4. Check device storage and memory availability
5. Review network connectivity for downloads
6. Check React Native and dependency versions for compatibility

### Emulator Storage Management

To prevent storage issues during development:

**Best Practices:**
- Run `npm run android:clean-emulator` before each install if you've been testing for a while
- Monitor storage weekly: `npm run android:check-storage`
- Keep emulator storage usage below 80% to avoid installation failures
- Wipe emulator data monthly or when storage consistently runs low

**Storage Cleanup Commands:**
```bash
# Quick cleanup (recommended before each install)
npm run android:clean-emulator

# Check current storage status
npm run android:check-storage

# Uninstall app only
npm run android:uninstall

# Full emulator reset (via Android Studio)
# AVD Manager → Select emulator → Wipe Data
```

**Creating Emulators with Adequate Storage:**
1. Open Android Studio → AVD Manager
2. Create Virtual Device → Select device → Next
3. Select System Image → Next
4. **Show Advanced Settings** → Set:
   - **Internal Storage**: 16GB (minimum 8GB)
   - **SD Card**: Optional, 1GB+ if needed
5. Finish → Start emulator

### Performance Monitoring

- Use React Native Performance Monitor (DevMenu > Show Perf Monitor)
- Check memory usage in device settings
- Monitor CPU usage during inference
- Review usage_log.json for performance trends
- Use Stages screen to analyze performance metrics

## License

[Add your license information here]

## Contributing

- Prefer focused PRs; match existing TypeScript / React Native patterns.
- For visual or interaction work, follow [`DESIGN.md`](./DESIGN.md).
- **Agents:** after any significant design change (themes/tokens, page transitions, animation durations, popups/overlays, shared layout chrome, typography, or spacing language), update [`DESIGN.md`](./DESIGN.md) in the same change so future agents keep a correct design source of truth.
- **Agents:** after any new **user-durable** data (AsyncStorage key, SQLite table, DocumentDirectory JSON, downloadable asset the user expects to keep), update **export + import** in [`src/services/backupService.ts`](./src/services/backupService.ts) (and schema/tests/docs as needed). Follow the [Backup & restore](#backup--restore) checklist — do not ship persistence without a restore path.
