# Security

**Do not file public GitHub issues for vulnerabilities.**

## Report

Use GitHub’s private advisory form:

**https://github.com/Darwin27264/ofln/security/advisories/new**

Include a description, affected version / commit, and steps to reproduce. We will acknowledge reports and fix before any public disclosure.

If private reporting is not available yet, email the maintainer through GitHub (`Darwin27264`) rather than opening an issue.

## Scope

In scope (examples):

- Remote or local code execution, unexpected network exfiltration of chats / tokens
- Backup or Keychain handling that writes Hugging Face tokens or other secrets to export files
- Path traversal or integrity bypass on model download / GGUF import
- Supply-chain issues in release artifacts published by this project

Out of scope:

- Issues that require a malicious GGUF the user chose to load, unless ofln fails to apply documented sanitization
- User-configured Source Monitor URLs (those requests are intentional)
- The committed `android/app/debug.keystore` (public Android debug cert; not used for Play / release signing)
- Missing iOS App Store signing / bundle-id setup

## Signing keys (maintainers)

Release signing lives only in **gitignored** local files:

- `android/gradle.properties` — copy from `android/gradle.properties.example`
- `android/app/*.keystore` / `*.jks` except `debug.keystore`

Never commit passwords or upload keystores. Git history was checked before the public release; upload-keystore secrets were not found in commits.

## Supported versions

`main` is the supported line. Please test against the latest commit before reporting.
