# OFLN Improvement Plan

**Last updated:** 2026-08-14  
**Audience:** maintainers and contributors  
**Stack:** React Native 0.78.1 · New Architecture · `llama.rn` 0.12.6 · UI via `createStyles` + [`DESIGN.md`](../DESIGN.md)

Companion implementation notes (symbols, invariants, smoke rules): [`AGENT_IMPLEMENTATION_GUIDE.md`](./AGENT_IMPLEMENTATION_GUIDE.md). Prefer the codebase over either doc when they disagree.

---

## Product thesis

> **OFLN is the calm, honest offline reasoning companion.**

Run GGUF models fully on-device with clear hardware feedback, durable local history, and a restrained UI. Compete on trust and clarity—not on marketplace size, social leaderboards, or feature checklists.

| Invest | Avoid cloning |
|--------|----------------|
| Calm craft (`DESIGN.md`) | Badge dashboards, accent spam |
| Honest fit / accel / context UX | Public tok/s leaderboards |
| Reasoning quality (think UX, family policy) | Raw dump UIs |
| Local Stages analytics | Cloud rank / Glicko |
| Private by default (temp chat, local backup) | Accounts, hubs, telemetry |
| Local personas | Persona marketplaces |

---

## 1. Current state (2026-08-14)

OFLN is a working offline LLM chat app for Android and iOS. Phases 0–3 of the original execution queue are **code-complete**; Phase 4 voice and backup are shipped. Remaining Phase 4 items are optional vision and optional remote client.

### Shipped capabilities

| Area | What exists |
|------|-------------|
| Models | HF browse/download (optional Keychain token), local GGUF import, resumable downloads, size verify, disk preflight, RAM-fit chips |
| Inference | Native `completion()` streaming via `llamaProvider` / `useAIChat`; think/`<think>` parsing; Thinking Auto/On/Off; ModelRuntimePolicy (family templates + defaults) |
| Acceleration | Android OpenCL / Hexagon gated by capability + quant allowlist (`Q4_0`, `Q6_K`); accel status in logs / model quick panel |
| Chat UX | Streaming, edit→regenerate, pin/rename history, temporary chats, Markdown export |
| History | op-sqlite behind service API, drawer search, AppState flush persist |
| Context honesty | Fullness banner/ring, trim notice |
| Attachments | Image OCR + PDF text extract (caps + honest refusals); **not** true mmproj vision yet |
| Voice | OS TTS (`react-native-tts`) + platform STT (`@dev-amirzubair/react-native-voice`) |
| Personas | Local library + editor (no memory notes yet) |
| Storage | Model delete, clear chats, full backup/restore (JSON chats or ZIP profile; models re-download; secrets never exported) |
| Insight | Stages trends from local `usage_log` |
| Onboarding | First-run flow with skip |
| Design | Light/dark, Poppins, frosted chrome, motion tokens |

### Engineering invariants (do not break)

- Live chat path: `useNativeCompletion: true` → `aiChatService.nativeCompletion`
- Conversation auto-load effect deps: **`[selectedGGUF]` only**
- Dual unload when leaving conversation: `releaseAllLlama()` + `llamaProvider.unloadModel()`
- Never load `.partial` GGUF files
- Prefer extend existing services (`chatHistoryService`, `llamaProvider`, `src/api/model.ts`) over parallel stacks
- UI: `ThemeContext` + `createStyles` / `DESIGN.md` — no second design system

### Open / verification debt

- Device smoke checklist documented (`docs/DEVICE_SMOKE.md`); **physical execution** still owed after native rebuild for Keychain, device-info, op-sqlite, keep-awake, TTS, Voice
- Unit tests: prefer pure helpers (Jest); keep native llama out of unit tests
- Large working tree historically uncommitted until maintainers ask
- Diagnostics export (P0 #3) still open

---

## 2. Completed / no longer relevant

The S01–S32 atomic queue largely landed. Do **not** re-open these as new work unless regressions appear.

| Item | Status |
|------|--------|
| Load unification, inference unit tests, user-facing errors | Done |
| Conversation extracts (HistoryDrawer, ChatComposer, MessageList) | Done |
| Disk preflight, resume download, size verify, HF token | Done |
| RAM fit, load-failure CTAs, onboarding | Done |
| SQLite history, drawer search, context banner, trim notice, AppState flush | Done |
| Keep-awake while generating, Markdown export, storage manager | Done |
| ModelRuntimePolicy + family blurbs | Done |
| Thinking mode, accel status, Stages trends | Done |
| Edit→regenerate, document pipeline + chat PDF attach | Done |
| System TTS, platform STT, backup/restore | Done |
| Temp-chat polish as a project | **Removed** — current UI sufficient |
| Dead-helper / comment-polish cleanup as plan items | **Obsolete** — addressed in stabilize arc |
| Dual chat load path / “unify provider” as open work | **Closed** |

**Still deferred by design (not forgotten):** persona memory notes (needs a small design before code); neural TTS/STT; full tool/agent loop; background model unload; biometric lock; live n_ctx reload sheet; thermal nag UI; in-chat message find; scanned-PDF OCR as a product claim; PalsHub-style marketplace.

---

## 3. Competitive landscape (category peers)

Category: on-device / offline / local LLM mobile chat (GGUF or compiled mobile runtimes). Research snapshot: mid‑2026.

### Peer map

| App | Positioning | Strengths vs OFLN | Notes |
|-----|--------------|-------------------|--------|
| **PocketPal AI** | Default “any GGUF” app (RN + `llama.rn`) | Distribution, HF UX polish, PalsHub, neural TTS catalogs, device benchmarks / optional community leaderboard, large OSS presence | Closest technical peer; same engine family |
| **MLC Chat** | Speed via MLC-LLM / AOT | Higher tok/s on flagship GPU paths; curated models | Narrower model choice; less “any GGUF” |
| **Private LLM** (iOS) | Paid curated privacy | Polished store product, OmniQuant angle, Shortcuts | Monetized; not full HF free-for-all |
| **LM Playground** | Android power user | KleidiAI/OpenMP, download ETA/notifications, optional tools, vision/RAG claims, background generation | High feature density |
| **Maid** | Privacy / F-Droid friendly | Local + remote providers, chat import/export, auditable | Android-focused |
| **ChatterUI** | Characters / roleplay | Character Card v2, remote APIs, instruct control | Different primary job |
| **Layla** | Beginner Play Store funnel | Fast first chat, curated small models | Less power-user depth |
| **OfflineLLM** | Hard privacy | Zero INTERNET permission story, biometric, Vulkan offload | Credibility wedge for paranoid users |
| **Google AI Edge Gallery** / system Nano / Apple FM | OEM / demo path | Built-in models, no GGUF hunting | Not a general GGUF client |

### Dimensions that matter to users

1. **Model discovery** — HF browse, gated tokens, curated starters, quant guidance, RAM fit  
2. **Performance** — tok/s, GPU/NPU offload, memory discipline, battery honesty  
3. **Chat UX** — history/search, personas, multimodal, voice, documents  
4. **Privacy credibility** — offline-after-download, no accounts, clear network uses (HF only)  
5. **Trust & polish** — MIT/OSS, backups, native feel, crash/diagnostics honesty  
6. **Monetization pressure** — free OSS (PocketPal/Maid) vs IAP curated (Private LLM) vs hub premium pals; OFLN stays free/MIT unless product strategy changes

### Where OFLN already differentiates

- **Honesty stack:** RAM-fit chips, context fullness, accel status, load-failure CTAs, policy blurbs  
- **Stages:** private local performance insight without a social leaderboard  
- **Calm UI:** deliberate monochrome craft vs marketplace/dashboard density  
- **ModelRuntimePolicy:** multi-family chat quality without a prompt DB  
- **Backup completeness:** chats + personas + settings + catalog re-download (secrets excluded)  
- **Voice without RAM fight:** OS TTS/STT instead of ONNX engines competing with the GGUF

### Gaps vs category leaders (prioritized)

| Gap | Impact | Effort | Notes |
|-----|--------|--------|-------|
| Store / OSS distribution + privacy page | High for acquisition | Low–Med | Trust table stakes vs PocketPal/Maid |
| Broader / clearer accel + visible tok/s | High | Med | Peers win “feels fast”; OFLN has accel gating but limited quants |
| Curated “start here” models + download ETA/speed | High for first session | Low–Med | Layla/LM Playground win first-run confidence |
| True vision (mmproj) | Med–High | Hard | Peers advertise vision; OFLN is OCR-honest today |
| Opt-in remote OpenAI-compatible client | Med | Med | Maid/ChatterUI cover hybrid users |
| Background generation / notification | Med (Android) | Med–Hard | LM Playground differentiator; race-prone |
| Neural TTS catalogs | Low for OFLN thesis | High + RAM cost | Explicitly avoid as default |
| Persona marketplace | Low for OFLN thesis | High | Avoid PalsHub clone |
| Zero-network / biometric lock | Niche high | Med | Credibility for privacy maximalists; after core polish |
| Document RAG / tool agents | Tempting | High / quality risk | Defer; thin caps + OCR already cover light doc jobs |

---

## 4. Near-term improvements (next 1–2 months)

Ordered by **impact ÷ effort** for OFLN as it exists today. Ship surgically; one risky native change at a time.

### P0 — Trust & release readiness

1. **Device smoke after native rebuild** — **Docs done** ([`DEVICE_SMOKE.md`](./DEVICE_SMOKE.md) + README checklist). Physical-device execution still owed by maintainers (cannot invent results).  
2. **Public-facing trust docs** — **Done** ([`PRIVACY.md`](./PRIVACY.md) + README Privacy short table). Network story traced to HF browse/download + optional Keychain token; no OFLN cloud inference.  
3. **Diagnostics export** — Share sanitized logs / crash crumbs for support without raw prompt dumps by default. *(Still open.)*

### P1 — First-session competitiveness

4. **Curated starter shelf** — **Done** (`src/services/starterModels.ts`; Models UI “Start here” + shelf hints; onboarding candidates derived from same catalog).  
5. **Download progress honesty** — **Done** (speed/ETA via `downloadProgressFormat` + `onProgress` detail in `src/api/model.ts`; ModelCard / onboarding surfaces). Resume + size verify unchanged.  
6. **Surface tok/s more calmly** — **Done** (chat uses `tok/s` via `formatTokensPerSecondLabel`; Stages note clarifies private metrics + accel allowlist; accel alert uses `detailMessage`).

### P2 — Capability parity (selective)

7. **S28 — Optional mmproj vision** — One curated GGUF+mmproj pair; wire `projectorPath`; OCR remains fallback. Device-only; read `llama.rn` 0.12.6 API first.  
8. **S31 — Opt-in remote OpenAI-compatible client** — Base URL + Keychain key; loud privacy banner; local remains default.  
9. **Accel breadth** — Revisit quant allowlist / capability messaging when `llama.rn` / device matrix allows safer OpenCL/Hexagon coverage; never silent magic. *(Messaging clearer in this pass; allowlist still Q4_0 / Q6_K.)*

### P3 — Thin quality wedges (only if dogfood asks)

10. **HF bookmarks / recent models** — Low effort retention.  
11. **Persona memory notes (ex-S24)** — Short per-persona notes injected into system prompt; design scope first (no vector memory).  
12. **Storage path flexibility** — Optional SAF / external model location for multi-GB files (Android pressure).

---

## 5. Medium-term (3–6 months)

Only after P0–P2 dogfood. Prefer depth on thesis over parity.

| Theme | Candidate work | Guardrails |
|-------|----------------|------------|
| Performance | Track upstream `llama.rn` / llama.cpp mobile wins (KleidiAI-class kernels if exposed); per-model GPU layer presets with honest fallback | No second inference engine beside the active GGUF |
| Multimodal | Expand vision beyond one curated pair; keep OCR path | Isolated PRs; budget RAM |
| Chat durability | Optional encrypted-at-rest settings; export formats users request | Backup schema versioning already required |
| Hybrid use | Remote client polish (streaming parity, model list) | Never make remote the default |
| Accessibility | Dynamic type, reduce-motion respect, TalkBack/VoiceOver pass | Match `DESIGN.md` |
| Release engineering | CI lint/test, signed release checklist, iPad/tablet layout pass | Don’t block product on perfect CI |

---

## 6. Competitive differentiators (lean into these)

1. **Honest phone companion** — Fit, context, accel, and failure CTAs as first-class product, not Advanced Settings trivia.  
2. **Stages as private insight** — Local trends from real usage; never a public rank chase.  
3. **Calm craft** — One job per screen; soft motion; monochrome-first (`DESIGN.md`).  
4. **Reasoning control** — Thinking mode + family policy so multi-model chat stays coherent.  
5. **Voice without competing for RAM** — OS TTS/STT while the GGUF owns memory.  
6. **Portable private profile** — Backup/restore that re-hydrates catalog without exporting secrets.  
7. **MIT + auditable offline story** — Same license class as leading OSS peers; clearer than closed “Private ChatGPT” clones.

---

## 7. Risks and non-goals

### Risks

- **RAM contention** — Neural TTS/STT or a second ONNX runtime beside a 3B–4B GGUF regresses load success on mid-range phones.  
- **Vision scope creep** — mmproj + downloads + multimodal completion is race-prone; OCR honesty is better than half-broken vision.  
- **Background unload / generation** — Easy to corrupt completion or leak VRAM; defer until explicitly designed.  
- **Marketplace distraction** — PalsHub-style hubs shift OFLN away from calm local craft.  
- **Doc drift** — This plan and the agent guide can lag the tree; source of truth is code + README features.

### Non-goals (explicit)

- Persona / Pal marketplace or in-app checkout  
- Public benchmark leaderboards  
- Neural TTS/STT catalogs as default  
- Full tool/agent OS or always-on RAG vector DB  
- Cloning PocketPal Paper UI or MLC’s curated-only model strategy wholesale  
- Accounts / cloud sync as a required path  
- Claiming “pixel vision” or “fully offline including model browse” while HF download still needs network

### Complexity reminders (kept from prior audits)

| Topic | Guidance |
|-------|----------|
| Resume downloads | Partial files + rename; never activate mismatch |
| Context UX | Meter + New chat; defer live n_ctx reload sheet |
| Background unload | Deferred — races with completion |
| Tool loop | Deferred — optional calculate-only experiment later if ever |
| Biometric lock | After core trust polish; separate step |
| Conversation splits | Already extracted; avoid bulk re-architecture |

---

## 8. Working agreements

- Prefer **extend over rewrite**; surgical diffs.  
- Touching download / load / `useAIChat`: smoke chat → stop → unload/load another model.  
- New durable user data: wire **backup export + import** + schema/tests + README backup table in the same change.  
- Visual changes: follow and update [`DESIGN.md`](../DESIGN.md).  
- Do not commit unless maintainers ask.

### Smoke checklist (minimum)

Full post-rebuild pass: [`DEVICE_SMOKE.md`](./DEVICE_SMOKE.md). Minimum:

1. Launch → conversation  
2. Select/download model → chat  
3. Send → stream → Stop  
4. Regenerate / edit→regenerate  
5. Settings round-trip  
6. Unload → load another model  
7. Kill/reopen → history  
8. Theme + CustomAlert  
9. When relevant: TTS Speak, STT mic, PDF/image attach, backup import merge  
10. Stages model-pill swipe  

---

## 9. Success criteria

1. Mid-range user completes download + first reply in one sitting with clear fit guidance.  
2. Failures are actionable; chats survive kill; backups restore without leaking secrets.  
3. User can tell whether GPU/NPU path is active, whether context is tight, and why a model fits.  
4. Reasoning feels controlled; UI stays calm.  
5. Rich enough (search, export, docs, OS voice, optional vision/remote) **without** a marketplace.  
6. Side-by-side with category leaders: “OFLN is calmer and clearer about my phone.”

---

## 10. Sources

- Category guides and app comparisons (PocketPal, MLC Chat, Private LLM, LM Playground, Maid, ChatterUI, Layla, OfflineLLM, OEM galleries), mid‑2026  
- PocketPal / Maid / ChatterUI public READMEs and positioning  
- OFLN assets: `README.md`, `DESIGN.md`, inference + accel + backup services, Stages  
- Competitors inform **jobs**, not blueprints
