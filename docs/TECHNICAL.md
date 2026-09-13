# ofln — technical notes

Maintainer-oriented detail. Product overview and setup live in [`README.md`](../README.md).

Copyright © 2026 Darwin Chen / Evolvyn AI · License: [GPLv3](../LICENSE) · Brand: [TRADEMARK.md](../TRADEMARK.md)

## Architecture

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
| Load-time perf / KV quant | `src/services/inferencePerfParams.ts` (`cache_type_k/v` → llama.cpp `type_k`/`type_v`) |
| RAM fit chips + load preflight | `src/services/ramFitService.ts` |
| Safe Mode boot recovery | `src/services/safeBootService.ts` |
| Thermal status + token yield | `src/services/thermalService.ts` + native `ThermalStatus` module |
| OCR (ML Kit, before LLM) | `src/services/ocrService.ts`, `documentParsingService.ts` |
| File existence helpers | `src/services/llamaService.ts` |
| Downloads | `src/api/model.ts` |
| Curated starters | `src/services/starterModels.ts` |
| Backup / restore | `src/services/backupService.ts`, `src/utils/backupSchema.ts` |
| Design tokens / motion | `DESIGN.md`, `src/utils/animationConfig.ts` |

Screens: `src/screens/`. Shared UI: `src/components/`. Durable storage: AsyncStorage / op-sqlite / DocumentDirectory.

### Inference notes

- Default chat path: native `completion()` streaming (not the alternate Vercel `streamText` path).
- Android acceleration (OpenCL / Hexagon) is gated by device capability and an allowlist of quants (`Q4_0`, `Q6_K`); emulators force CPU.
- Real-device loads set KV cache quant via `cache_type_k` / `cache_type_v` (`q8_0` by default; `q4_0` when total RAM ≤ 6GB; stripped on bare-param retry).
- Load clamps `n_ctx` to the largest ladder size (512…8192) that fits in available RAM, then refuses when `availableRAM ≤ modelSize + expectedKV + 500MB`.
- Leaving conversation unloads via `releaseAllLlama()` + `llamaProvider.unloadModel()`.
- Token streaming yields 5–10ms when native thermal status is high/critical.

### Safe Mode

On launch, `@ofln/boot_in_progress` is set. After ~5s of continuous foreground stability it is cleared. If the next launch finds the flag still set (prior crash during boot/load), the app offers Safe Mode: clear active model selection and suppress auto-load (GGUF files are not deleted).

Separately, `@ofln/model_load_in_progress` is set immediately before native `prepare` / `initLlama` and cleared after warm-up succeeds (or on JS failure). An uncleared load flag on the next launch means a likely native crash/OOM during the previous load — Safe Mode is offered and autoload is suppressed even if the boot flag had already been cleared.

### OCR / peak RAM

Image/PDF text extraction runs via on-device ML Kit **before** prompting text-only models. When available RAM is tight and a model is loaded, the LLM is unloaded for OCR, then restored.

## Android 16KB page size

Configured in `android/app/build.gradle`:

- `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` (NDK 16KB-aware cmake; do not put `-Wl,*` in `cppFlags`)
- `packaging.jniLibs.useLegacyPackaging = false` (uncompressed, page-aligned `.so` packaging)
- Avoid `-DCMAKE_*_LINKER_FLAGS=...` overrides — they replace flags and can strip RN defaults

Prebuilt `llama.rn` `.so` alignment still depends on upstream artifacts. Verify release APKs with:

```bash
zipalign -c -P 16 -v 4 app-release.apk
```

(or Google’s current 16KB alignment check script for your SDK tools version).

## Release APK (Windows example)

```bash
cd android
.\gradlew.bat clean
.\gradlew.bat assembleRelease
cd ..
powershell -ExecutionPolicy Bypass -File .\scripts\extract-release-apk.ps1
```

Gradle output: `android/app/build/outputs/apk/release/ofln-release.apk`.  
The extract script copies it to `releaseAPK/ofln_{date}.apk`.

**Signing:** copy `android/gradle.properties.example` → `android/gradle.properties` and fill upload keystore placeholders locally. Never commit real passwords. If passwords ever appeared in git history, rotate them before a public release.

**iOS:** `cd ios && bundle exec pod install` after native dependency changes.

## CI

GitHub Actions (`.github/workflows/ci.yml`): TypeScript (`npm run typecheck` — fails on launch-critical path errors; `npm run typecheck:full` reports the full project), ESLint on launch services (`npm run lint:ci`; full `npm run lint` still has pre-existing debt), Jest, Android `assembleDebug`, iOS Simulator `xcodebuild` with signing disabled.

Full-project `tsc --noEmit` still reports pre-existing strictness debt outside the launch paths; clearing it is follow-up work.

## Troubleshooting

**Metro:** `npm start -- --reset-cache`; reinstall `node_modules` if needed.

**Android build:** `cd android && ./gradlew clean`; confirm `JAVA_HOME` points at JDK 17+/JBR 21. IDE warnings about old Gradle wrappers under `node_modules` are unrelated — the app build uses the root Android Gradle 8.12 project.

**INSTALL_FAILED_INSUFFICIENT_STORAGE:** `npm run android:clean-emulator`, or wipe/increase AVD internal storage (16GB recommended).

**iOS build:** `pod install`, clean build folder in Xcode, verify deployment target.

**Model won’t load:** Confirm final `*.gguf` (not `.partial`), free RAM, try lower `n_ctx` / `n_gpu_layers`, check Diagnostics / logs / Safe Mode.

**Downloads fail:** Network, free disk, optional HF token for gated repos.

## Extra scripts

| Script | Purpose |
|--------|---------|
| `npm run android:clean` | `gradlew clean` |
| `npm run android:install-release` | Install release APK |
| `npm run android:uninstall` | `adb uninstall com.ofln` |
| `npm run android:clean-emulator` | Trim caches + uninstall |
| `npm run android:check-storage` | `adb shell df -h` |
