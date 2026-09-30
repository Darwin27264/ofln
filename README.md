# ofln™

Offline LLM chat for Android and iOS by **Evolvyn AI** (Darwin Chen). Download a GGUF model once, then run inference on-device via [llama.cpp](https://github.com/ggerganov/llama.cpp) through [`llama.rn`](https://github.com/mybigday/llama.rn). No account and no cloud LLM for replies.

**In the app:** Settings → About for tips · Settings → Storage for backup.

| Doc | Purpose |
|-----|---------|
| [`docs/PRIVACY.md`](./docs/PRIVACY.md) | What stays local, Hugging Face, tokens, backups |
| [`SECURITY.md`](./SECURITY.md) | Vulnerability reporting; Android signing files stay local |
| [`docs/TECHNICAL.md`](./docs/TECHNICAL.md) | Architecture, build/release, CI, Android 16KB, inference notes |
| [`DESIGN.md`](./DESIGN.md) | UI system |
| [`docs/DEVICE_SMOKE.md`](./docs/DEVICE_SMOKE.md) | Maintainer device smoke checklist |
| [`TRADEMARK.md`](./TRADEMARK.md) | Brand / fork rebranding policy |

## Features

- Browse / download GGUF models from Hugging Face (optional token for gated repos)
- Curated **Start here** shelf (Q4_0 phone-friendly picks) with SHA-256 integrity verification plus full HF browse / local import
- Download progress with percent and speed/ETA when measurable; resumable pause/resume
- Import local GGUF files; per-model settings (temperature, context, GPU layers)
- Streaming chat with optional reasoning/`<think>` parsing; calm per-turn tok/s
- Personas, temporary chats, pin/rename history
- **Tasks** (Settings): scheduled **LLM prompts** or **Source Monitor** (fetch URL + analyze) — results stay local
- **Perspective** debates: multiple on-device speakers take turns on a topic
- Image / PDF attachments (on-device OCR / text extraction; multimodal when supported)
- Light / dark theme
- Performance (Stages) metrics from on-device usage logs — private, not a leaderboard
- Backup & restore: chats JSON or full profile ZIP (models re-download via catalog; secrets never exported)
- Safe Mode recovery if a previous launch crashed during model load

## Requirements

| Requirement | Notes |
|-------------|--------|
| Node.js ≥ 18 | |
| JDK 17+ (prefer 21) | Android builds (Gradle 8.12). Prefer Android Studio’s bundled JBR and set `JAVA_HOME` |
| Android Studio / SDK | Android |
| Xcode + CocoaPods | iOS (macOS) |
| New Architecture | Required by current `llama.rn` (enabled in project configs) |

## Setup

```bash
git clone https://github.com/Darwin27264/ofln.git
cd ofln
cp android/gradle.properties.example android/gradle.properties
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

Copy `.env.example` only if you add local tooling variables — the app runtime does not read a `.env` for inference.

## Privacy (short)

| Leaves device? | What |
|----------------|------|
| Only when you download/browse models | Hugging Face |
| Stays local | Chats, personas, Tasks results, Stages metrics |
| Never in backups | HF tokens, GGUF files |

Inference does not use an ofln cloud API. There is no account system.

## Backup & restore

**UI:** Settings → Storage

| Action | Output |
|--------|--------|
| Export chats | `ofln-chats-*.json` |
| Export full backup | `ofln-backup-*.zip` |
| Import | Merge or replace |

Full backups include chats, personas, perspective presets, tasks / recent runs, settings, and model catalog — not GGUF files or HF tokens. Models re-download on restore.

## Development scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Metro bundler |
| `npm run android` / `npm run ios` | Build & run |
| `npm test` | Jest unit test suite |
| `npm run lint:ci` | ESLint (launch-critical paths) |
| `npm run typecheck` | Launch-critical path typecheck |
| `npm run typecheck:full` | Full-project `tsc --noEmit` |
| `npm run android:build-release` | Build release APK (`assembleRelease`) |
| `npm run android:extract-release` | Copy release APK into `releaseAPK/ofln_{date}.apk` |

Direct Windows build & extract commands:
```powershell
# Build release APK:
cd android; .\gradlew.bat assembleRelease; cd ..

# Extract to releaseAPK/:
powershell -ExecutionPolicy Bypass -File .\scripts\extract-release-apk.ps1
```

More build/release detail: [`docs/TECHNICAL.md`](./docs/TECHNICAL.md).

## Testing

```bash
npm run typecheck
npm run lint:ci
npm test
```

Unit tests live under `__tests__/`. Prefer pure helpers that do not require native modules. Manual smoke: [`docs/DEVICE_SMOKE.md`](./docs/DEVICE_SMOKE.md).

## Contributing

- Prefer focused PRs; match existing TypeScript / React Native patterns.
- Visual or interaction changes: follow [`DESIGN.md`](./DESIGN.md) and keep it current.
- New user-durable data: update backup export/import, schema/tests, and the Backup section above.
- Read [`docs/PRIVACY.md`](./docs/PRIVACY.md) before claiming offline / zero-network behavior.

## License

GNU General Public License v3.0 — see [`LICENSE`](./LICENSE).

Copyright © 2026 Darwin Chen / Evolvyn AI.

Third-party libraries (including llama.cpp / llama.rn) retain their upstream licenses; GPLv3 applies to this project’s combined distribution terms.

## Trademark

**ofln™** and related branding are trademarks of Evolvyn AI. The GPLv3 license does **not** grant trademark rights. Forks that redistribute modified binaries must rebrand. See [`TRADEMARK.md`](./TRADEMARK.md).

## Security

Report vulnerabilities privately — see [`SECURITY.md`](./SECURITY.md).

Android release signing stays in gitignored `android/gradle.properties` (template: `android/gradle.properties.example`). Do not commit upload keystores or passwords.
