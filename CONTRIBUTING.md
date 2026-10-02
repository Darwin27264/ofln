# Contributing to ofln

Thanks for your interest in improving **ofln**! ofln is an open-source passion project built to bring local, private AI to mobile devices. Contributions of all kinds—bug reports, fixes, performance improvements, and documentation—are warmly welcomed.

## Development Setup

1. **Install dependencies:**
   ```bash
   git clone https://github.com/Darwin27264/ofln.git
   cd ofln
   npm install
   cp android/gradle.properties.example android/gradle.properties
   ```
2. **Start Metro & Run:**
   - Metro: `npm start`
   - Android: `npm run android` (requires JDK 17+, Android SDK, and a running device/emulator)
   - iOS: `cd ios && pod install && cd .. && npm run ios` (macOS with Xcode)

## Code Style & Guidelines

- **TypeScript & React Native:** Follow existing patterns; keep components modular and types explicit.
- **Design System:** Review [`DESIGN.md`](./DESIGN.md) before making visual changes.
- **Privacy First:** Never introduce network dependencies for local inference. Read [`docs/PRIVACY.md`](./docs/PRIVACY.md).
- **Quality Checks:** Run `npm run typecheck`, `npm run lint:ci`, and `npm test` before opening a pull request.

## Submitting PRs & Licensing

- Open a pull request with a concise description of your changes.
- **No CLA:** There is no Contributor License Agreement. By submitting a PR, you agree that your contributions are licensed under the project's [GNU General Public License v3.0](./LICENSE).
