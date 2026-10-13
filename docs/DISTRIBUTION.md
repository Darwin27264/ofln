# App Distribution & Store Preparation Guide

This guide details the distribution readiness of **ofln**, including open-source repositories (IzzyOnDroid and F-Droid), Google Play Store, and Apple TestFlight / App Store.

---

## 1. IzzyOnDroid (Immediate Launch Option)

[IzzyOnDroid](https://apt.izzysoft.de/fdroid/) is an F-Droid-compatible repository that tracks GitHub Releases directly and distributes pre-compiled open-source APKs without requiring the central F-Droid build pipeline.

### Readiness Status: 🟢 **Ready for Submission**

- **License:** GNU General Public License v3.0 (GPL-3.0) — verified.
- **Trackers & Analytics:** None. Exodus Privacy check will report 0 trackers.
- **Pre-built APK:** Available under GitHub Releases (`v1.1` tag: `ofln-release.apk`).
- **Signing:** Release APK is signed.
- **Fastlane Metadata:** Standard structure created in `fastlane/metadata/android/en-US/`:
  - `title.txt`
  - `short_description.txt`
  - `full_description.txt`
  - `images/phoneScreenshots/`
  - `images/icon.png`
  - `changelogs/2.txt`

### Submission Steps for Maintainer:
1. Ensure the `v1.1` GitHub release has the APK attached (`ofln-release.apk`).
2. Open a new inclusion request at [IzzyOnDroid GitLab Issues](https://gitlab.com/IzzyOnDroid/repo/-/issues).
3. Provide the repository link: `https://github.com/Darwin27264/ofln` and license `GPL-3.0`.
4. IzzyOnDroid's automated crawler will index the release and fetch updates automatically.

---

## 2. F-Droid Official Inclusion & Build Flavor Configuration

Official F-Droid builds apps completely from source on their own Debian/Ubuntu build servers, in an isolated network sandbox without internet access during compilation.

### Readiness Status: 🟢 **Resolved (Pure FOSS Flavor Available)**

The previous blocker regarding `@react-native-ml-kit/text-recognition` binary blobs (`com.google.android.gms:play-services-mlkit-text-recognition`) has been **fully resolved** by adding a dedicated `foss` build flavor and autolinking bypass.

### Pure FOSS Build Flavor Architecture
1. **Product Flavors (`android/app/build.gradle`):**
   - `foss`: Pure FOSS build with zero Google Play Services / ML Kit binary blobs. Builds `assembleFossRelease`.
   - `play`: Standard distribution build including Google ML Kit on-device OCR. Builds `assemblePlayRelease`.
2. **Autolinking Bypass (`react-native.config.js` & `android/settings.gradle`):**
   - When building FOSS (`assembleFossRelease`, `npm run android:build-foss`, or `OFLN_BUILD_FOSS=1`), `@react-native-ml-kit/text-recognition` is omitted from Android autolinking (`platforms: { android: null }`).
   - Gradle avoids downloading or packaging any Google binary dependencies.
3. **Runtime Safety (`src/services/ocrService.ts`):**
   - `isOcrSupported()` safely detects module availability at runtime. FOSS builds gracefully skip OCR without runtime crashes.

### Official F-Droid Recipe Metadata Example (`metadata/com.ofln.yml`):
```yaml
Builds:
  - versionName: '1.1'
    versionCode: 2
    commit: v1.1
    subdir: android
    gradle:
      - assembleFossRelease
    ndk: r27c
```

### Dependency Audit Summary

| Item | Status | Policy Assessment | Resolution |
|---|---|---|---|
| **`@react-native-ml-kit/text-recognition`** | 🟢 **Resolved** | Proprietary Google ML Kit binary blobs rejected by F-Droid (`NonFreeComp`). | Omitted in `foss` flavor via autolinking bypass (`assembleFossRelease`). 100% pure FOSS. |
| **Model Downloads** | 🟢 **Compliant** | Users download models from Hugging Face at runtime. | Treated as user-initiated data content (like web browsers). No proprietary weights bundled. |
| **`react-native-voice`** | 🟡 **Permitted** | Uses the system `SpeechRecognizer` service. | Fully functional on de-Googled ROMs with FUTO Voice Input or Vosk installed. |

---

## 3. Google Play Store Submission Steps

To distribute on the Google Play Store:

### Prerequisites:
- Google Play Console Developer Account ($25 one-time registration fee).
- Personal accounts created after November 13, 2023 require **20 testers opted-in for at least 14 days** in a closed testing track before production release.

### Technical Steps:
1. **Build Android App Bundle (`.aab`):**
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Artifact output: `android/app/build/outputs/bundle/release/app-release.aab`.
2. **Release Signing:**
   Ensure `MYAPP_UPLOAD_STORE_FILE` is configured in `android/gradle.properties` (or CI GitHub Secrets).
3. **Store Listing (Google Play Console):**
   - App Name: `ofln - Offline Local AI Chat` (from `fastlane/metadata/android/en-US/title.txt`)
   - Short Description: from `fastlane/metadata/android/en-US/short_description.txt`
   - Full Description: from `fastlane/metadata/android/en-US/full_description.txt`
   - High-Res Icon: 512x512 PNG (32-bit color, max 1024KB)
   - Feature Graphic: 1024x500 JPG/PNG
   - Phone Screenshots: Upload at least 4 screenshots (aspect ratio 16:9 or 9:16)
4. **Data Safety Form Declarations:**
   - **Data Collection:** Select **No** — the app does not collect or share any user data.
   - **Data Transfer:** Select **No** — all user chats and processing remain local on the device.
5. **Privacy Policy:**
   - Provide a public URL to [`docs/PRIVACY.md`](https://github.com/Darwin27264/ofln/blob/main/docs/PRIVACY.md).
6. **Target API Level:**
   - App is currently configured with `targetSdkVersion = 35` (Android 15), meeting Google Play's requirement (API 34+).
7. **16KB Memory Page Support:**
   - App is already configured with `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` and `useLegacyPackaging = false` to satisfy Google Play's 16KB ELF page size requirements for Android 15+.

---

## 4. Apple TestFlight & App Store Steps

To distribute on iOS devices:

### Prerequisites:
- Apple Developer Program membership ($99/year).
- macOS machine running Xcode 15 or 16.

### Technical Steps:
1. **Set Up App Store Connect Record:**
   - Create a new App record in App Store Connect with bundle identifier `com.ofln`.
   - SKU: `com.ofln.mobile`.
2. **iOS Project Signing:**
   - Open `ios/ofln.xcworkspace` in Xcode.
   - Under `Signing & Capabilities`, select your Apple Developer Team and generate Provisioning Profiles.
3. **Build Archive:**
   - In Xcode: `Product → Destination → Any iOS Device (arm64)`.
   - Run `Product → Archive`.
   - Once archived in the Organizer, select **Distribute App → TestFlight & App Store**.
4. **App Privacy Declarations (Privacy Nutrition Labels):**
   - Select **Data Not Collected** — ofln does not track users or collect data across apps and websites.
5. **Export Compliance & Cryptography Declaration:**
   - App uses HTTPS for Hugging Face downloads and standard OS Keychain encryption for token storage.
   - Answer **Yes** to encryption, then declare exemption under Category 5 Part 2 (uses standard operating system cryptographic APIs for transport and secure storage; not designed for proprietary encryption).
6. **TestFlight Beta Testing:**
   - Internal Testing: Available immediately to App Store Connect team members.
   - External Testing: Submit build for standard Beta App Review (usually approved within 24-48 hours) to distribute via public TestFlight link.
