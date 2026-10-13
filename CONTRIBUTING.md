# Contributing to ofln

Thank you for your interest in contributing to **ofln**! ofln is an open-source, GPLv3-licensed mobile application that brings private, local LLMs directly to everyday mobile devices.

Contributions of all shapes and sizes—bug reports, documentation fixes, UI polish, native performance optimizations, and feature enhancements—are warmly welcomed.

---

## Getting Started

### Prerequisites

| Tool | Recommended Version | Purpose |
|---|---|---|
| **Node.js** | 18.x or 20.x (LTS) | JavaScript runtime & tooling |
| **npm** | 9.x or 10.x | Dependency management |
| **JDK** | Eclipse Temurin 17 or 21 | Android Gradle build |
| **Android Studio / SDK** | API 35 SDK + NDK `27.1.12297006` | Android compilation |
| **Xcode & CocoaPods** | Xcode 15+ & CocoaPods 1.14+ | iOS compilation (macOS only) |

---

## Building and Running Locally

### Step 1: Clone and install dependencies

```bash
git clone https://github.com/Darwin27264/ofln.git
cd ofln
npm install
```

### Step 2: Configure Android environment

Copy the Gradle properties template to configure your local Android build environment:

```bash
cp android/gradle.properties.example android/gradle.properties
```

*(On Windows PowerShell: `Copy-Item android\gradle.properties.example android\gradle.properties`)*

Ensure your `JAVA_HOME` environment variable points to your JDK 17 or 21 installation (or Android Studio's bundled JBR).

### Step 3: Configure iOS environment (macOS only)

```bash
cd ios
bundle install
bundle exec pod install
cd ..
```

### Step 4: Run the app

1. **Start Metro bundler** in a dedicated terminal:
   ```bash
   npm start
   ```
2. **Launch on your target platform:**
   - **Android:** Connect a physical device with USB debugging enabled (or start an emulator) and run:
     ```bash
     npm run android
     ```
   - **iOS:** Open an iOS simulator and run:
     ```bash
     npm run ios
     ```

---

## Finding Something to Work On

If you are new to the codebase, we have prepared curated, bite-sized tasks with code pointers and test guidance:
- Check out the **Good First Issue drafts** in [`docs/issues/`](./docs/issues/)!
- Browse open GitHub Issues labeled `good first issue` or `help wanted`.

---

## Development & Code Guidelines

- **Privacy & Offline First:** Local inference must never depend on remote APIs or send chat data off-device. Read [`docs/PRIVACY.md`](./docs/PRIVACY.md) before proposing networking changes.
- **Design System:** Follow the monochrome, calm aesthetics and motion guidelines documented in [`DESIGN.md`](./DESIGN.md). Avoid hardcoding colors; use tokens from `src/context/ThemeContext.tsx`.
- **TypeScript:** Keep types explicit and avoid `any`.
- **Unit Tests:** Business logic and pure utility functions live under `__tests__/`. Add or update tests when altering behavior.

---

## Pre-PR Verification

Before submitting a pull request, run all automated checks locally:

```bash
# 1. Check TypeScript types
npm run typecheck

# 2. Run lint on critical services
npm run lint:ci

# 3. Run Jest unit test suite
npm test
```

All three commands must exit cleanly (code 0) without unhandled errors.

---

## Troubleshooting Common Issues

- **Metro Cache Issues:**
  ```bash
  npm start -- --reset-cache
  ```
- **Android Gradle Clean:**
  ```bash
  npm run android:clean
  ```
- **Native llama.cpp / CMake rebuilds:**
  If native binaries fail to link or crash after dependency updates, perform a clean build:
  ```bash
  cd android && ./gradlew clean && cd ..
  ```
- **Android 16KB Page Size:**
  ofln is configured for Android 15+ 16KB ELF page sizes (`-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` and `useLegacyPackaging = false`). Ensure your NDK version matches `27.1.12297006`.

---

## Submitting Pull Requests

1. **Fork the repository** and create a feature branch (`git checkout -b feature/my-improvement`).
2. **Keep PRs focused:** Smaller, single-purpose pull requests are reviewed and merged much faster.
3. **Commit messages:** Write clear, descriptive commit messages (e.g., `fix(chat): smooth download ETA calculation`).
4. **License & CLA:** ofln does not use a Contributor License Agreement (CLA). All contributions are submitted under the terms of the [GNU General Public License v3.0](./LICENSE).
