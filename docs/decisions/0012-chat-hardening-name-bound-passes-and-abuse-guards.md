# 12. Chat Hardening: Name-Bound Passes, Spam Drop Guards, and Kill Switch

- **Status:** Approved
- **Deciders:** Sam, Antigravity
- **Date:** 2026-10-09

## Context and Problem Statement

Following the initial rate limiting and Turnstile integration (ADR 0011), persistent bot attacks continued to stress Cloudflare KV write quotas (1,000 writes/day free tier) and Siteverify subrequests:

1. **Identity Spoofing**: Once a single Turnstile challenge was solved, bots reused the resulting two-part session pass (`<exp>.<sig>`) to dispatch chat messages under alternating AI personas (`Claude Anthropic`, `Mistral Anthropic`, `Phi Anthropic`).
2. **Wildcard Origin and Preview Tolerances**: Permissive `.pages.dev` and `.workers.dev` wildcard host checks in `isOriginAllowed` and `verifyTurnstileToken` created potential verification bypass vectors.
3. **Repetitive Duplicate Floods**: Repeated text spam was written directly to Cloudflare KV before room-level caps took effect.
4. **KV Read Ingestion from Client Polling**: Uncached 5-second polling across numerous concurrent visitors rapidly depleted KV read limits (100,000 reads/day).
5. **No Emergency Circuit Breaker**: The system lacked an operational mechanism to instantly pause chat ingestion without requiring a redeployment during active floods.

## Decision Outcome

**Deploy comprehensive live chat hardening across token authentication, edge abuse guards, and operational controls:**

1. **Name-Bound Three-Part Application Pass (`src/lib/turnstile.ts`):**
   - Format: `<exp>.<nameHex>.<signature>`.
   - The HMAC-SHA256 signature binds the client IP, chosen display name, and expiration timestamp: `${clientIp}:${name}:${exp}`.
   - Posting under a different display name requires solving a fresh Turnstile challenge.
   - `verifyChatPassDetailed` validates authenticity and returns the authorized display name.
   - Fail-closed secret handling outside dev/test; no passes can be minted or validated without `TURNSTILE_SECRET`.

2. **Strict Hostname and Origin Restraint:**
   - Stripped generic `.pages.dev` and `.workers.dev` wildcards from `src/lib/rateLimit.ts` and `src/lib/turnstile.ts`.
   - Allowed hosts restricted strictly to `samananias.is-a.dev`, `gebportfolio.pages.dev`, `gebportfolio.workers.dev`, and `.gebportfolio.pages.dev`.

3. **Multi-Factor Abuse and Duplicate Drop Guards (`src/pages/api/chat/messages.ts`):**
   - Global Room Limit: Max 15 messages / minute across all senders. Excess messages are dropped.
   - Same-Sender Duplicate Drop: Identical normalized text within 60 seconds is dropped.
   - Cross-Sender Duplicate Flood Filter: Identical normalized text (>= 12 characters) within 10 minutes across different senders is dropped.
   - Silent Drop Semantics: Dropped messages return an acceptance response so bot scripts cannot detect heuristics, while incurring zero Cloudflare KV writes.

4. **Isolate Read Cache (`src/pages/api/chat/messages.ts`):**
   - Added an in-memory 3-second cache (`HISTORY_CACHE_TTL_MS = 3000`) for `GET /api/chat/messages` to coalesce polling reads and protect KV read quotas.

5. **Per-Name Rate Limiting (`src/pages/api/chat/send.ts`):**
   - Implemented a 5-message / 60-second limit with a 3-second cooldown per normalized handle (`chat:name:<handle>`).

6. **WebSocket Handshake Authentication (`party/chat.ts`):**
   - Enforces cryptographic three-part session pass verification (`verifyChatPassDetailed`) during the WebSocket `onConnect` handshake before admitting clients to the room.
   - Connections with missing, forged, expired, or handle-mismatched credentials are sent an error frame (`code: 401`) and closed (`code: 4401`).
   - Frame processing in `onMessage` validates that the active session has not expired (`Date.now() <= state.expiresAt`), terminating expired connections with code 4403.

7. **Sliding-Window Replay Defense (`src/lib/turnstile.ts`):**
   - Implemented a 10-minute in-memory sliding window cache (`redeemedTurnstileTokens`) to prevent immediate reuse or replay of redeemed Turnstile tokens across requests.

8. **Strict HTTP API Boundary Defense (`src/pages/api/chat/*`):**
   - `POST /api/chat/send` strictly rejects unauthenticated requests (missing pass and token) with HTTP 401 (`requireTurnstile: true`), and rejects forged passes or identity mismatches with HTTP 403, without invoking Cloudflare Siteverify subrequests.
   - `POST /api/chat/verify` enforces non-empty token presence, returning HTTP 400 if missing.

9. **Emergency Kill Switch (`CHAT_LOCKED`):**
   - Added `isChatLocked()` checking the `CHAT_LOCKED` environment variable.
   - Setting `CHAT_LOCKED=1` in Cloudflare Variables and Secrets immediately returns HTTP 503 (`Retry-After: 300`) on `/api/chat/send` and `/api/chat/verify`, preventing resource consumption during active floods.

## Consequences

- **Positive:** Cryptographically binds chat identities to Turnstile solves; drops spam floods with zero KV write costs; slashes KV polling reads via 3-second caching; provides instant flood mitigation via `CHAT_LOCKED=1`.
- **Negative:** Legitimate users wishing to change their display name must solve a fresh Turnstile challenge.
