# Add automatic retry with exponential backoff for interrupted GGUF downloads

**Labels:** `good first issue`, `enhancement`, `network`, `downloads`  
**Difficulty:** Intermediate  

---

### Description

Quantized GGUF model files range from 500 MB to over 4 GB in size. On mobile cellular connections or patchy Wi-Fi networks, socket timeouts or connection resets can interrupt downloads midway.

While `ofln` supports manual pause and resume (using HTTP `Range` headers), an unexpected connection error currently displays a failure toast rather than automatically retrying.

We want to add a light, automatic retry loop with exponential backoff (e.g., 3 retries spaced at 1s, 2s, 4s) for transient network disconnects before failing.

### Expected Behavior

- If a download chunk or connection fails with a recoverable network error (e.g. timeout, connection reset, ECONNRESET):
  - The download enters a brief `Retrying in Xs (attempt N/3)...` state.
  - After the backoff interval, the download automatically resumes from the existing byte offset (`bytesWritten`).
  - If the connection succeeds, downloading resumes normally without user intervention.
  - If all 3 retry attempts fail, the download transitions to `Paused` (preserving downloaded bytes on disk) and prompts the user to retry when connectivity improves.
- User-initiated cancellation or pause must NOT trigger auto-retry.

### Code Pointers

- Model download API and handlers: [`src/api/model.ts`](../../src/api/model.ts)
- Model selection screen download controller: [`src/screens/ModelSelectionScreen.tsx`](../../src/screens/ModelSelectionScreen.tsx)
- Existing download helpers: [`src/utils/downloadProgressFormat.ts`](../../src/utils/downloadProgressFormat.ts) and [`__tests__/downloadHelpers.test.ts`](../../__tests__/downloadHelpers.test.ts)

### Definition of Done

1. Transient network drop triggers up to 3 automatic resume attempts with increasing backoff intervals.
2. Download resumes from the last byte written rather than re-downloading from scratch.
3. User cancellation immediately halts the loop and cleans up.
4. Unit tests are added in `__tests__/downloadHelpers.test.ts` to test the retry backoff calculation.
5. All automated checks pass (`npm run typecheck`, `npm run lint:ci`, `npm test`).
