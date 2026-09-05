# OFLN

Offline LLM chat for Android and iOS. Download a GGUF model once, then run inference on-device via [llama.cpp](https://github.com/ggerganov/llama.cpp) through [`llama.rn`](https://github.com/mybigday/llama.rn). No account and no cloud LLM for replies.

**In the app:** Settings → About for tips · Settings → Storage for backup.

**Privacy:** [`docs/PRIVACY.md`](./docs/PRIVACY.md) — what stays local, when Hugging Face is contacted, tokens, and backups.

**UI/UX:** [`DESIGN.md`](./DESIGN.md) · **Device smoke (maintainers):** [`docs/DEVICE_SMOKE.md`](./docs/DEVICE_SMOKE.md)

## Features

- Browse / download GGUF models from Hugging Face (optional token for gated repos)
- Curated **Start here** shelf (Q4_0 phone-friendly picks) plus full HF browse / local import
- Download progress with percent and speed/ETA when measurable; resumable pause/resume
- Import local GGUF files; per-model settings (temperature, context, GPU layers)
- Streaming chat with optional reasoning/`<think>` parsing; calm per-turn tok/s
- Personas, temporary chats, pin/rename history
- **Perspective** debates: multiple on-device speakers (personas and/or models) take turns on a topic
- Image / PDF attachments (OCR / text extraction; multimodal when supported)
- Light / dark theme
- Performance (Stages) metrics from on-device usage logs — private, not a leaderboard
- Backup & restore: chats JSON or full profile ZIP (models re-download via catalog; secrets never exported)

## Requirements

| Requirement | Notes |
|-------------|--------|
| Node.js ≥ 18 | |
| JDK 17+ (prefer 21) | Android builds (Gradle 8.12). Prefer Android Studio’s bundled JBR and set `JAVA_HOME` |
| Android Studio / SDK | Android |
| Xcode + CocoaPods | iOS (macOS) |
| New Architecture | Required by current `llama.rn`. Already enabled in `android/gradle.properties` and `ios/Podfile` |

## Setup

```bash
git clone <repository-url>
cd ofln
npm install
```

**iOS (macOS):**

```bash
cd ios
bundle install
bundle exec pod install
cd ..
```

**Run:**

```bash
npm start          # Metro
npm run android    # Android device/emulator
npm run ios        # iOS simulator/device
```

No cloud LLM API keys are required. Hugging Face tokens (optional) are stored in Keychain and used only for `huggingface.co` downloads. See [`docs/PRIVACY.md`](./docs/PRIVACY.md).

## Privacy (short)

| Leaves device? | What |
|----------------|------|
| Only when you download/browse models | Hugging Face |
| Stays local | Chats, personas, Stages metrics |
| Never in backups | HF tokens, GGUF files |

Inference does not use an OFLN cloud API. There is no account system.

## Architecture (short)

```
HF URL / local GGUF
        │
        ▼
RNFS DocumentDirectoryPath/*.gguf
        │
        └─ Conversation / model select ──► llamaProvider.prepare
                                                    │
User message (+ optional OCR)                       ▼
        │                              nativeContext.completion (stream)
        ▼
useAIChat.handleSubmit (useNativeCompletion: true)
        │
        ▼
UI + chat history + usage_log.json
```

| Concern | Location |
|---------|----------|
| Product model load/unload | `src/providers/llamaProvider.ts` |
| Chat / streaming | `src/hooks/useAIChat.ts` → `src/services/aiChatService.ts` |
| File existence helpers | `src/services/llamaService.ts` (`checkFileExists`) |
| Downloads | `src/api/model.ts` |
| Curated starters | `src/services/starterModels.ts` |
| Backup / restore | `src/services/backupService.ts`, `src/utils/backupSchema.ts` |
| Design tokens / motion | `DESIGN.md`, `src/utils/animationConfig.ts` |

Screens live under `src/screens/`; shared UI under `src/components/`; durable storage uses AsyncStorage / op-sqlite / DocumentDirectory as appropriate.

### Inference notes

- Default chat path: native `completion()` streaming (not the alternate Vercel `streamText` path)
- Android acceleration (OpenCL / Hexagon) is gated by device capability and an allowlist of quants (`Q4_0`, `Q6_K`); emulators force CPU
- Leaving conversation unloads via `releaseAllLlama()` + `llamaProvider.unloadModel()`

## Backup & restore

**UI:** Settings → Storage

| Action | Output |
|--------|--------|
| Export chats | `ofln-chats-*.json` |
| Export full backup | `ofln-backup-*.zip` |
| Import | Merge or replace |

Full backups include chats, personas, perspective presets, settings, and model catalog — not GGUF files or HF tokens. Models re-download on restore.

Schema: `src/utils/backupSchema.ts` · tests in `__tests__/backupSchema.test.ts`

## Development scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Metro bundler (`-- --reset-cache` if needed) |
| `npm run android` / `npm run ios` | Build & run |
| `npm test` | Jest |
| `npm run lint` | ESLint |
| `npm run android:clean` | `gradlew clean` |
| `npm run android:build-release` | Release APK |
| `npm run android:install-release` | Install release APK |
| `npm run android:uninstall` | `adb uninstall com.ofln` |
| `npm run android:clean-emulator` | Trim caches + uninstall (storage relief) |
| `npm run android:check-storage` | `adb shell df -h` |

**Release APK (Windows example):**

```bash
cd android
.\gradlew.bat clean
.\gradlew.bat assembleRelease
cd ..
powershell -ExecutionPolicy Bypass -File .\scripts\extract-release-apk.ps1
```

Gradle output: `android/app/build/outputs/apk/release/ofln-release.apk`.  
The extract script copies it to `releaseAPK/ofln_{date}.apk` (same-day rebuilds get a time suffix so older builds are kept).

**iOS:** `cd ios && bundle exec pod install` after native dependency changes.

## Testing

```bash
npm test
npm test -- --coverage
```

Unit tests live under `__tests__/` (schema, inference helpers, storage helpers, speech, backup, etc.). Prefer pure helpers that do not require native modules.

### Manual smoke checklist

Quick pass (also see [`docs/DEVICE_SMOKE.md`](./docs/DEVICE_SMOKE.md) after native rebuilds):

- [ ] Stages: swipe model pill; Settings theme + Thinking toggles persist
- [ ] Download / pause / resume / discard a model (note speed/ETA when shown)
- [ ] Load model, send a chat turn, stop generation; tok/s appears calmly on assistant row
- [ ] History persist across restart; pin / rename
- [ ] Local GGUF import
- [ ] Backup export → import (merge) on a clean data path
- [ ] Temporary mode; attachments (image/PDF) on a small model
- [ ] After native rebuild: Keychain HF token, TTS Speak, STT mic

## Troubleshooting

**Metro:** `npm start -- --reset-cache`; reinstall `node_modules` if needed.

**Android build:** `cd android && ./gradlew clean`; confirm `JAVA_HOME` points at JDK 17+/JBR 21. IDE warnings about old Gradle wrappers under `node_modules` are unrelated — the app build uses the root Android Gradle 8.12 project (see `.vscode/settings.json`).

**INSTALL_FAILED_INSUFFICIENT_STORAGE:** `npm run android:clean-emulator`, or wipe/increase AVD internal storage (16GB recommended).

**iOS build:** `pod install`, clean build folder in Xcode, verify deployment target.

**Model won’t load:** Confirm final `*.gguf` (not `.partial`), free RAM, try lower `n_ctx` / `n_gpu_layers`, check Diagnostics / logs.

**Downloads fail:** Network, free disk, optional HF token for gated repos.

## Contributing

- Prefer focused PRs; match existing TypeScript / React Native patterns.
- Visual or interaction changes: follow [`DESIGN.md`](./DESIGN.md) and keep it current.
- New user-durable data: update backup export/import, schema/tests, and the Backup section above.
- Read [`docs/PRIVACY.md`](./docs/PRIVACY.md) before claiming offline / zero-network behavior.

## License

MIT — see [`LICENSE`](./LICENSE).
