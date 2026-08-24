# Device smoke checklist

**Audience:** maintainers  
**When:** after a **native rebuild** (new native deps, `llama.rn`, Keychain, Voice, TTS, op-sqlite, keep-awake, device-info, etc.), before calling a release “verified.”

This checklist is **manual**. Do not invent pass/fail results in docs or PRs — record what you actually ran on a physical device or emulator.

Minimum from the improvement plan is also mirrored in [`README.md`](../README.md). This file is the fuller post-rebuild pass.

---

## Before you start

1. Clean rebuild when native code or native deps changed:
   - Android: `cd android && ./gradlew clean` then `npm run android`
   - iOS: `pod install`, clean build folder, run from Xcode or `npm run ios`
2. Prefer one **small Q4_0** starter (e.g. Qwen3.5 0.8B) for speed; use a mid-size model only when testing RAM/accel.
3. Note device: model, OS version, physical vs emulator.

---

## Core chat & models

- [ ] Cold launch → lands on conversation or onboarding as expected
- [ ] **Start here** shelf visible; download a starter → progress shows % and (when measurable) speed/ETA
- [ ] Pause download → partial kept → Resume → completes → size verify → loads (not `.partial`)
- [ ] Discard paused download → partial gone
- [ ] Send message → stream tokens → **Stop** cancels cleanly
- [ ] Edit user message → regenerate; Copy / Speak (TTS) on assistant row
- [ ] Mic (STT) → text into composer; stops on Send / Stop / Speak
- [ ] Unload / switch model → second model loads; first does not leave a stuck context
- [ ] Kill app → reopen → history present; pin / rename still correct

---

## Stages & Settings

- [ ] **Stages:** open Performance; swipe model pill left/right (and arrows); charts/history update for the selected model
- [ ] Stages accel block: Available vs On/CPU matches expectation for this device + quant
- [ ] **Settings:** theme light/dark round-trip; Thinking Auto/On/Off; other toggles persist after leave/reopen
- [ ] Model settings: change temperature / `n_ctx` / `n_gpu_layers` → save → reload model → values stick
- [ ] CustomAlert / confirmations render above chrome (no invisible modals)

---

## Storage, backup, attachments

- [ ] Storage: list/delete model; clear chats (confirm)
- [ ] Backup export chats JSON → import merge on a clean or second path
- [ ] Full ZIP backup → restore; models re-download from catalog; **HF token not** in ZIP
- [ ] Attach image (OCR) and PDF on a small model; honest refusal if over caps

---

## Native / trust surfaces (post-rebuild)

- [ ] HF token screen: save / clear token in Keychain; gated download behaves with/without token
- [ ] Diagnostics: acceleration check runs; logs viewable
- [ ] Keep-awake: screen stays awake while generating, releases after
- [ ] Temporary chat mode works; does not pollute durable history unexpectedly

---

## Accel honesty (Android physical device)

- [ ] Q4_0 or Q6_K on capable Snapdragon: model quick panel / Stages show GPU or NPU when offload is active
- [ ] Non-allowlisted quant: CPU path with clear Off reason (not a silent “fast” claim)
- [ ] Emulator: CPU only (no fake GPU success)

---

## Sign-off

| Field | Value |
|-------|--------|
| Date | |
| Device | |
| Build | debug / release |
| Native rebuild? | yes / no |
| Notes / failures | |

Pass criteria: core chat path + history + one download pause/resume + Settings theme + Stages swipe without crash. Voice/backup/attachments as relevant to the change under test.
