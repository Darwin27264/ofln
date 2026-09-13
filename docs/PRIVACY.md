# Privacy & network

**Audience:** open-source users and auditors  
**Source of truth:** this doc should match the code. If they disagree, trust the code and update this file.

OFLN is designed as a **local-first** chat app: after a model file is on the device, **inference does not call a cloud LLM API**. There are no OFLN accounts, no analytics SDK, and no training of models on your chats.

---

## What stays on the device

| Data | Where | Notes |
|------|--------|--------|
| Chat history | Local SQLite / app storage | Not uploaded by OFLN |
| Personas, settings, Stages usage log | Local storage | Stages metrics are personal / on-device only |
| Source Monitor tasks and run results | Local storage | Task definitions + fetched/analysis text; included in full backups (capped) |
| GGUF model weights | App documents (or local import path) | Large files; never included in backups |
| Hugging Face token (optional) | OS Keychain / Keystore | Never written into backup ZIP/JSON |
| Temporary chats | Local until discarded | Same privacy as normal chats while active |

**Backups** (Settings → Storage) write files on your phone (JSON chats or a ZIP profile). You choose where to share or save them via the system share sheet. Secrets and GGUF binaries are **not** exported. See README → Backup & restore.

OFLN does **not** train models on your conversations and does **not** send prompts to an OFLN backend (there isn’t one).

---

## When the network is used

Network access is for **model discovery and download**, **user-configured Source Monitor URLs**, and whatever your **OS** does for speech — not for cloud chat completion.

| Action | Host / channel | What is sent |
|--------|----------------|--------------|
| Browse / search models | `huggingface.co` API (`/api/models`, `/api/models/{id}`) | HTTP GET; optional `Authorization: Bearer` if you saved an HF token |
| Download a GGUF | `huggingface.co/.../resolve/...` (or the URL you pasted) | File bytes to device storage; resumable partials stay local |
| Custom HF URL fetch | Same — metadata then download | Same as above |
| Optional HF token | Stored in Keychain; attached **only** for `huggingface.co` hosts | Token never sent to non-HF URLs by OFLN’s auth helper |
| Backup re-download after restore | Catalogued download URLs (typically HF) | Same download path as a normal model pull |
| Source Monitor / LLM prompt tasks (Settings → Tasks) | **URL you configure** (Source Monitor only) | Periodic GET for Source Monitor; **LLM prompt** tasks stay on-device (no fetch). Results stored locally |

**Inference / chat:** runs via on-device `llama.rn` / llama.cpp. No OFLN cloud completion endpoint.

**Attachments:** image OCR and PDF text extraction run on-device; extracted text is injected into the local prompt. True mmproj vision is not the default path today.

**Voice:** system TTS and platform STT. OFLN does not ship a cloud speech API. Depending on **OS settings and vendor**, speech recognition may use on-device or vendor network services — that is outside OFLN’s process. Disable network STT in system settings if you need offline-only dictation.

**Share / export:** Markdown export and backups use the OS share sheet; destinations you pick are under your control.

---

## What does *not* leave the device (via OFLN)

- Chat prompts and completions (no OFLN telemetry or LLM proxy)
- Stages / tok/s history (local `usage_log` only — not a public leaderboard)
- Personas and settings (unless **you** export a backup and upload it somewhere)
- HF token (Keychain only; excluded from backups)

---

## Honest limits

- **Browsing and downloading models requires network** (usually Hugging Face). Claiming “zero Internet permission” would be inaccurate while HF download remains a product feature.
- **Source Monitor tasks contact URLs you choose** on a schedule (or when you tap Run now). Disable or delete tasks if you want no extra network beyond model downloads.
- **Gated Hugging Face repos** need a token you provide; OFLN only uses it for HF hosts.
- **Third-party model hosts:** if you paste a non-HF URL, the download client fetches that URL. Prefer trusted sources.
- **OS services** (STT, TTS, share targets, system updates, background fetch) have their own privacy policies. iOS may defer long on-device analysis until the app is open again.

---

## Related

- Feature overview and backup table: [`README.md`](../README.md)
- Maintainer device smoke after native rebuild: [`DEVICE_SMOKE.md`](./DEVICE_SMOKE.md)
- Architecture and technical notes: [`TECHNICAL.md`](./TECHNICAL.md)
