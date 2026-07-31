# OFLN Improvement Plan — Path to PocketPal Parity

**Status:** living plan (2026-07-30)  
**Goal:** Reach *product-useful* parity with [PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai) on the features users actually need — without cloning marketplace/TTS mega-features first.  
**Assumption:** 1–2 engineers, part-time capable of ~1 focused phase every 2–4 weeks. Adjust dates, not scope order.

---

## 1. Research: what users actually want

Sources: PocketPal GitHub issues (sorted by reactions), App Store / Play reviews, PocketPal release themes (onboarding, device-rule models, context warnings, tools, TTS, remote OpenAI client), and patterns across competing offline apps (Local LLM, OfflineLLM, Zuza, Prism).

### Tier A — table stakes (users churn without these)

| Need | Evidence | OFLN today |
|------|----------|------------|
| **Downloads that finish** | Play reviews: “couldn’t download a model in a year”; GitHub #304 unstable network / restart-from-0 | Cancel deletes partial file; **no resume** |
| **Right model for my phone** | PocketPal invested in RAM-tier recommendations + onboarding; reviews praise “models that fit” | Curated list exists; **no RAM gate / first-run guide** |
| **HF token for gated models** | PocketPal docs + support threads; gated Gemma / Qwen fail without token | Mostly ungated mirrors; **no token UI** |
| **Stable chat that doesn’t “forget” mid-thread** | Context-full errors → PocketPal #763 banner + recovery | Silent trim via `contextTrim`; **no fullness UX** |
| **Find old chats** | PocketPal #603 message/session search; marketing lists “history with search” | Pin/rename only; **no search** |
| **Privacy + offline that works** | Core store promise across all apps | Strong positioning; keep it |

### Tier B — “feels like a real assistant”

| Need | Evidence | OFLN today |
|------|----------|------------|
| **Images that actually work** | PocketPal #521 (high engagement); vision still confusing for users | OCR fallback; **mmproj path not wired** |
| **Documents / paste large text** | #401 attach docs + RAG-when-full | Partial PDF scrape; fragile |
| **Personas that do something** | Pals + PACT + tools drove a major PocketPal release | Personas exist; **no tools** |
| **Small on-device tools** | Calculator / datetime / HTML render shipped; web search BYOK in progress | None |
| **Edit + regenerate** | PocketPal chat UX baseline | Regenerate exists; **edit user message UX unclear / incomplete** |
| **Speed / accel transparency** | Benchmarks & leaderboard are marketing pillars | Tok/s + Stages; accel diagnostics exist |

### Tier C — power-user differentiators (do after A/B)

| Need | Evidence | Priority for us |
|------|----------|-----------------|
| Connect to **LM Studio / Ollama** (client) | #377 closed as shipped in PocketPal | High value, moderate effort |
| Phone as **local OpenAI server** | #259 (16👍), #407, #574 | Later — security + background hard on mobile |
| **TTS / STT** | Large TTS PRs; STT #797 | Start with **system TTS**, not neural engines |
| Character cards / Tavern | #286 | Niche — defer |
| MCP / LiteRT / F-Droid | #527, #306, #706 | Defer |
| PalsHub marketplace | Product moat for PocketPal | **Do not clone** unless you want a network |

### Explicit non-goals (for this plan)

- Cloning PalsHub / social marketplace  
- Shipping 4 neural TTS engines on day one  
- Community Glicko leaderboard (nice; not retention-critical)  
- Rewriting UI onto React Native Paper  
- Jumping RN 0.78 → 0.82 mid-foundation work  

---

## 2. Strategy: parity by outcomes, not feature checklist

**Outcome definition of “PocketPal level” for OFLN:**

1. A new user on a mid-range Android phone can **pick a safe model, finish the download, and chat offline** in one session.  
2. Multi-turn chats **warn before context dies**, and history is **searchable and durable**.  
3. Attachments (**image + text/PDF**) produce useful answers on at least one curated VL path.  
4. Personas can optionally use **2–3 local tools**.  
5. Power users can optionally point chat at a **home PC OpenAI-compatible server**.

Keep OFLN advantages: reasoning/`<think>` handling, Android OpenCL/HTP quant gating, design system.

---

## 3. Current technical debt that blocks speed

Fix these early or every later feature costs 2×:

| Debt | Why it hurts | Phase |
|------|--------------|-------|
| Dual inference stack (`llamaProvider` + `llamaService`) | Double bugs, double accel logic | **0** |
| `ConversationScreen.tsx` ~3.6k lines | Hard to add context banner / tools / vision UI | **0–1** |
| Chat history = one AsyncStorage JSON blob (max 100) | Search, export, tool steps won’t scale | **2** |
| Downloads delete & restart | Highest-churn store complaint class | **1** |

---

## 4. Phased plan

Each phase has: **goal**, **user stories**, **deliverables**, **file touch list**, **acceptance tests**, **effort**, **exit criteria**.  
Do phases in order. Skip only Tier C items if calendar slips.

---

### Phase 0 — Foundation (1–2 weeks)

**Goal:** One inference path; safer velocity for everything after.

#### User stories
- As a developer, I change load/completion logic in **one** place.  
- As a user, model load/unload behavior does not regress.

#### Deliverables
1. **Single load path**  
   - Conversation + ModelSelection both use `llamaProvider` only.  
   - Delete or shrink `llamaService` to thin re-exports / tests helpers.  
2. **Shared load API**  
   - One `loadModel({ path, settings })` / `unloadModel()` / `getNativeContext()`.  
3. **Smoke tests**  
   - Unit: `buildCompletionParams`, `thinkStreamParser`, quant allowlist, accel config mocks.  
4. **ConversationScreen split (mechanical)** — extract without behavior change:  
   - `ChatMessageList`, `ChatComposer`, `ChatHistoryDrawer`, `ModelLoadBanner`  
   - Keep screen as orchestrator ≤ ~800–1200 lines by end of Phase 1.

#### Primary files
- `src/providers/llamaProvider.ts`  
- `src/services/llamaService.ts`  
- `src/screens/ModelSelectionScreen.tsx`  
- `src/screens/ConversationScreen.tsx` → `src/screens/conversation/*`  
- `__tests__/` or colocated `*.test.ts`

#### Acceptance
- [ ] No production call to `initLlama` outside provider.  
- [ ] Download → open chat → stream → stop → unload works on Android device.  
- [ ] Accel gating (emulator / non-allowlisted quant / HTP|OpenCL) unchanged.  
- [ ] `npm test` covers ≥ completion params + think parser.

#### Effort
~5–8 engineer-days.

#### Exit
Merge when dual-stack is gone and chat smoke-pass is green.

---

### Phase 1 — First-run reliability (2–3 weeks)  ★ highest ROI

**Goal:** Fix the failures that kill App Store / Play trust.

#### User stories
1. If Wi‑Fi drops at 60%, my download **resumes**, not restarts.  
2. The app recommends a model that **fits my RAM**.  
3. I can paste an **HF token** for gated files.  
4. First launch walks me: pick model → download → first chat.  
5. When context is nearly full, I **see a warning** and can start a new chat or raise `n_ctx`.

#### Deliverables

**1.1 Resumable downloads**
- Use HTTP Range / temp `.partial` file (prefer `react-native-blob-util`, already in deps).  
- Persist job metadata: `{ url, dest, bytes, etag? }`.  
- Cancel = pause (keep partial) vs discard (explicit).  
- Retry with backoff on network errors; surface 401/403/429 distinctly.

**1.2 Hugging Face token**
- Settings field; store in Keychain / EncryptedSharedPreferences (not plain AsyncStorage).  
- Attach `Authorization: Bearer` only to `huggingface.co` hosts.  
- Clear error copy when gated without token.

**1.3 Device-aware recommendations**
- Read approximate RAM (`react-native-device-info` or Android `ActivityManager`).  
- Tiers (tunable):  
  - ≤4 GB → ≤1B–2B Q4  
  - 6 GB → ≤3B–4B Q4_0  
  - 8 GB+ → 4B+ / Gemma E2B class  
- Filter curated `POPULAR_MODELS`; show “Fits / Tight / Won’t fit” chip (PocketPal pattern users already understand).

**1.4 Onboarding (minimal, 4 steps)**
1. Privacy one-liner (offline promise)  
2. Pick recommended model  
3. Download with resume UI  
4. Land in Conversation with starter prompt  

Skip forever after `hasCompletedOnboarding`.

**1.5 Context fullness UX**
- After each turn, estimate used tokens (native usage if available, else char heuristic already in `contextTrim`).  
- Banner at ≥80%: meter + “New chat” + “Increase context” sheet (reuse settings ladder).  
- On hard overflow: non-silent alert, not truncated nonsense.

**1.6 Chat search (sessions)**
- Search titles + preview + last message text over local history.  
- Debounced filter in history drawer (still AsyncStorage OK for now).

#### Primary files
- `src/api/model.ts` (rewrite download)  
- `src/services/hfAuthService.ts` (new)  
- `src/services/deviceCapabilityService.ts` (new; RAM tier)  
- `src/screens/OnboardingScreen.tsx` (new)  
- `src/screens/SettingsScreen.tsx`  
- `src/screens/ModelSelectionScreen.tsx`  
- `src/components/ContextFullnessBanner.tsx` (new)  
- `src/services/inference/contextTrim.ts`  
- `App.tsx` (gate onboarding)

#### Acceptance
- [ ] Kill network at ~40% download → resume completes same file (hash/size check).  
- [ ] 401 gated model shows “add HF token” CTA.  
- [ ] Low-RAM device never surfaces a “Won’t fit” model as default.  
- [ ] Fresh install → chat without opening Settings.  
- [ ] Long chat shows fullness banner before quality collapses.

#### Effort
~10–14 engineer-days.

#### Exit
This phase alone is “trust parity” with PocketPal’s core promise. Ship an internal build to real phones.

---

### Phase 2 — Durable chat + real multimodal (2–3 weeks)

**Goal:** History and attachments match what users expect from a matured local chat app.

#### User stories
1. I can keep **hundreds** of chats without the app slowing down.  
2. I can **export** a chat (JSON/Markdown).  
3. Vision models **see** the image (not only OCR) when mmproj is present.  
4. I can attach a **text/Markdown/PDF** and ask questions about it.  
5. Leaving the app **unloads** heavy models (optional) so Android doesn’t kill us.

#### Deliverables

**2.1 Persistence upgrade**
- Migrate chats from single AsyncStorage blob → SQLite (`react-native-quick-sqlite` or `op-sqlite`).  
- Schema: `conversations`, `messages` (id, role, content, thought, metrics, created_at).  
- One-shot migration; keep AsyncStorage settings/personas for now.  
- Message-level search becomes cheap.

**2.2 Export / import**
- Export conversation → `.md` or `.json` share sheet.  
- Import JSON (own format first).

**2.3 Vision path (mmproj)**
- Detect companion `*mmproj*.gguf` next to model or offer download from curated pair.  
- Wire `llamaProvider` projector path (types already have `projectorPath`).  
- Curated Gemma 4 / Qwen-VL entries with **paired** files.  
- Keep OCR as fallback when no projector.

**2.4 Documents**
- Harden `documentParsingService`: txt/md always; PDF text layer with size cap; clear “scanned PDF unsupported”.  
- Chunk + inject into prompt with budget from `n_ctx` (reuse trim).  
- No full RAG index yet — budgeted paste is enough for parity with common use.

**2.5 Lifecycle**
- Optional “Unload model in background” (PocketPal auto offload).  
- Keep-awake during generation only.

**2.6 Storage manager**
- List GGUF sizes, free space, delete unused models safely (confirm if chat referenced).

#### Primary files
- `src/services/chatHistoryService.ts` → repository over SQLite  
- `src/database/*` (new)  
- `src/providers/llamaProvider.ts`  
- `src/services/visionService.ts`  
- `src/api/` or model pairing helpers  
- `src/services/documentParsingService.ts`  
- `App.tsx` / lifecycle hook

#### Acceptance
- [ ] 200+ conversations still open history drawer <300ms on mid device.  
- [ ] Vision smoke: curated VL + mmproj answers about a photo content.  
- [ ] OCR path still works for non-VL models.  
- [ ] Export produces readable Markdown.  
- [ ] Background unload + return reload works without crash.

#### Effort
~12–16 engineer-days.

#### Exit
Attachments + history are no longer “almost”.

---

### Phase 3 — Tools + smarter personas (2–3 weeks)

**Goal:** Match PocketPal’s *useful* agent slice, not the whole PalsHub surface.

#### User stories
1. My persona can use **calculator** and **date/time** when I allow it.  
2. I see tool steps in the assistant turn (not a mysterious blob).  
3. Tools never run without **opt-in** on the persona.

#### Deliverables

**3.1 Minimal tool runtime**
- `TalentRegistry` pattern (keep names local: `tools/`):  
  - `calculate` (`expr-eval`)  
  - `datetime`  
  - Optional: `render_html` behind WebView + CSP (only if you need rich cards)  
- Loop: stream → detect tool call → execute → feed result → continue (cap 3 rounds).  
- Prefer models with reliable tool templates; degrade gracefully (“tools unsupported”).

**3.2 Structured assistant turns**
- Message model: `steps[]` with `content | reasoning | tool_call | tool_result`.  
- UI blocks per step; pending indicator with tool name.

**3.3 Persona capability flags**
- Persona schema: `tools: string[]` whitelist (PocketPal PACT-lite).  
- Editor UI: checkboxes, default **off**.

**3.4 (Optional stretch) BYOK web search**
- Only if Phase 3 lands early: Tavily/Brave key in Keychain, consent gate, offline-first default.  
- Do **not** make network search the default persona.

#### Primary files
- `src/services/tools/*` (new)  
- `src/services/agent/AgentRunner.ts` (new, keep <500 LOC v1)  
- `src/hooks/useAIChat.ts`  
- `src/services/personaService.ts`  
- `src/screens/PersonaEditorScreen.tsx`  
- `src/components/AssistantTurn*.tsx`  
- DB migration for structured messages

#### Acceptance
- [ ] Persona with `calculate` can answer `3819 * 47` accurately via tool.  
- [ ] Persona without tools never emits executable calls.  
- [ ] Stop mid-tool does not corrupt chat state.  
- [ ] Unit tests for registry + runner reducer.

#### Effort
~10–14 engineer-days (without web search); +4 if BYOK search.

#### Exit
Personas feel “assistant-like” offline.

---

### Phase 4 — Voice + remote models (2–3 weeks)

**Goal:** Cover the next band of highly requested PocketPal features with **thin** implementations.

#### User stories
1. I can **listen** to the last reply (accessibility + convenience).  
2. Optional: speak a prompt (STT).  
3. At home, I can chat with a **bigger model on my PC** through the same UI.

#### Deliverables

**4.1 System TTS first**
- `react-native-tts` or platform Speech APIs.  
- Strip `<think>` before speak (you already have parsers).  
- Per-message play button; auto-speak toggle.  
- Gate off on low-RAM if needed.  
- **Defer** Kokoro/ONNX neural TTS (large binary + maintenance).

**4.2 STT (platform)**
- Android SpeechRecognizer / iOS Speech — good enough for Tier B.  
- On-device Whisper later only if quality complaints dominate.

**4.3 Remote OpenAI-compatible **client****
- Settings: base URL + API key + model name.  
- Provider behind same `useAIChat` interface (`local` | `remote`).  
- Streaming `/v1/chat/completions`.  
- Clear banner: “Remote — messages leave this device.”  
- This satisfies #377-class demand without building a phone server.

#### Primary files
- `src/services/tts/systemTts.ts`  
- `src/services/stt/platformStt.ts`  
- `src/providers/remoteOpenAIProvider.ts`  
- `src/hooks/useAIChat.ts`  
- Settings UI

#### Acceptance
- [ ] Play button speaks assistant text without think blocks.  
- [ ] Mic fills composer on Android + iOS.  
- [ ] Remote stream works against LM Studio / llama.cpp server on LAN.  
- [ ] Privacy banner visible whenever remote is selected.

#### Effort
~8–12 engineer-days.

#### Exit
Feature set matches “daily driver” PocketPal for most users.

---

### Phase 5 — Polish, store readiness, optional power features (ongoing)

**Goal:** Ship quality and pick 1–2 differentiators — not feature thrash.

#### Prioritized backlog (pick in order)

| Item | Why | Effort |
|------|-----|--------|
| Edit user message → regenerate from there | Chat UX parity | S |
| Hugging Face bookmarks + download queue | Power HF users | M |
| Formal benchmark screen (pp/tg, mem) + share card | Marketing/trust | M |
| Biometric lock for app open | Privacy segment | S |
| Chat templates / stop strings advanced panel | Power users | S |
| Local OpenAI **server** on phone (LAN only, API key) | #259 demand | L — after client |
| Lightweight “memory” notes injected into system prompt | Cross-chat recall requests | M |
| i18n (EN + 1–2 locales) | Store reach | M |
| RN upgrade 0.78 → newer when llama.rn requires it | Maintenance | L |
| E2E smoke (Detox/Maestro): onboard → download → chat | Regressions | M |

#### Still defer
- PalsHub / accounts / Supabase  
- MCP bridge  
- LiteRT rewrite  
- Tavern character cards (unless roleplay is your niche)

---

## 5. Suggested calendar (realistic)

| Window | Phase | Outcome |
|--------|-------|---------|
| Weeks 1–2 | **0** Foundation | One stack; screen split started |
| Weeks 3–5 | **1** Reliability | Resumable DL, onboarding, HF token, context UX |
| Weeks 6–8 | **2** Durable + multimodal | SQLite, vision mmproj, docs, lifecycle |
| Weeks 9–11 | **3** Tools | calculate/datetime + persona opt-in |
| Weeks 12–14 | **4** Voice + remote client | System TTS/STT + LM Studio |
| Weeks 15+ | **5** Polish | Store, edit-message, benchmarks |

**~3.5 months** calendar time at steady part-time; **~2 months** if full-time focused.

Ship internal TestFlight / Play internal after Phase 1 and again after Phase 3.

---

## 6. Implementation rules (keep the plan executable)

1. **One vertical slice per PR** — e.g. “resume downloads” alone, not “downloads + onboarding + token”.  
2. **No new dual paths** — remote provider is a second *backend*, not a second llama load stack.  
3. **Preserve OFLN edges** — reasoning heuristics, accel allowlist, `DESIGN.md` motion language.  
4. **Measure** — for Phase 1+, log: download success rate, time-to-first-token, OOM/load failures (local only).  
5. **Tests where logic is pure** — params, trim, tool registry, download state machine. Device smoke for native.  
6. **Binary size budget** — reject neural TTS / ONNX until system TTS proves demand.  
7. **Privacy default** — any network feature is opt-in with a visible banner.

---

## 7. Definition of done: “PocketPal level”

You can claim practical parity when **all** are true:

- [ ] Phase 0–1 complete (reliability)  
- [ ] Phase 2 complete (durable history + real vision path)  
- [ ] Phase 3 complete (at least 2 local tools + persona whitelist)  
- [ ] Phase 4 remote **or** TTS shipped (both ideal)  
- [ ] Fresh mid-range Android user study (n≥5): install → first useful reply in &lt;15 minutes without developer help  

Marketplace, neural TTS catalog, and public leaderboards are **above** parity — optional product bets.

---

## 8. Quick reference — do / don’t

| Do first | Don’t do first |
|----------|----------------|
| Resume downloads | PalsHub clone |
| RAM-based model picks | Four TTS engines |
| HF token + gated errors | Phone-as-server |
| Context fullness UX | MCP |
| Kill dual llama stack | RN Paper rewrite |
| SQLite chats | Premature RAG vector DB |
| calculate + datetime tools | Full agent OS |
| System TTS + remote client | LiteRT migration |

---

## 9. Tracking

Copy this checklist into issues or a project board:

- [ ] **P0** Unify `llamaProvider`; retire `llamaService` load path  
- [ ] **P0** Split `ConversationScreen`  
- [ ] **P0** Unit tests: completion params + think parser  
- [ ] **P1** Resumable downloads + 429/401 handling  
- [ ] **P1** HF token (secure storage)  
- [ ] **P1** RAM-tier recommendations  
- [ ] **P1** Onboarding flow  
- [ ] **P1** Context fullness banner + recovery  
- [ ] **P1** Chat session search  
- [ ] **P2** SQLite migration  
- [ ] **P2** Export/import  
- [ ] **P2** mmproj vision wiring + curated pairs  
- [ ] **P2** Document attach budgeted injection  
- [ ] **P2** Background unload + storage manager  
- [ ] **P3** Tool registry + agent loop (≤3 rounds)  
- [ ] **P3** Structured assistant turns UI  
- [ ] **P3** Persona tool whitelist  
- [ ] **P4** System TTS  
- [ ] **P4** Platform STT  
- [ ] **P4** Remote OpenAI-compatible client  
- [ ] **P5** Edit-message regenerate; benchmarks; biometric; i18n as needed  

---

## 10. Sources (research snapshot)

- PocketPal README / architecture (tools, TTS, WatermelonDB, OpenCL/Hexagon, Pals)  
- PocketPal issues: #259 local API, #304 download resume, #377 remote client, #401 docs/RAG, #521 vision, #603 search, #763 context warnings, #797 STT  
- Play/App reviews: download failures, model fit, privacy praise, memory/context pain  
- PocketPal PRs: device-rule model lists, onboarding, talent/tool system, neural TTS (heavy — learn, don’t clone first)

Update this doc when a phase exits: move items to “Done”, note ship date, and adjust Phase 5 picks from real user feedback — not from PocketPal’s changelog alone.
