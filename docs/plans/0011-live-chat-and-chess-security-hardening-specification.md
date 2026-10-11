# 0011 Live Chat & Collaborative Chess Security Hardening Specification

<callout icon="doodle/misc/trophy">**Status:** Approved · **Owner:** Sam · **Date:** 2026-10-09</callout>

This specification outlines the architectural remediation, request quota preservation, and defense-in-depth controls required to eliminate security vulnerabilities, request exhaustion, and Cloudflare KV write burnout across the **Live Chat**, **Collaborative Chess Engine**, and **Image Processing Telemetry** endpoints.

---

## 1. Goal & Context

A targeted security bounty audit and architectural traffic analysis of the interactive surfaces (`/api/chat/*`, `/api/chess/*`, and `/api/crop/*`) revealed three systemic issues:

1. **The KV Write Firehose & Cross-Domain Blast Radius**: A single unauthenticated telemetry endpoint (`POST /api/crop/usage`) consumes 2 KV writes per call on `CHAT_KV` with zero gates. Because Cloudflare KV's free tier permits only **1,000 writes/day**, just 500 requests exhaust the account's entire KV write quota, instantly crashing Live Chat and Contact form deliveries.
2. **Volumetric Request Quota Hemorrhage on Read Paths**: `ChessWidget.tsx` polls `/api/chess/state` every 3 seconds unconditionally (even in hidden background tabs), generating ~9,600 requests per 8-hour session per visitor. Just 10 idle background tabs consume 96% of Cloudflare's 100,000 daily Worker invocation limit on static board states alone.
3. **Write-Path Authentication Loopholes**: In collaborative chess, a static HMAC fallback secret in `session.ts` permits session cookie forgery (allowing a single script to play both sides of the board), while `/api/chess/move` fails open when secrets are unset, and `/api/chess/reset` lacks human pass verification.

---

## 2. Threat Model & Traffic Hemorrhage Diagnosis

### 2.1 The KV Write Firehose on `POST /api/crop/usage` (`SEC-09`, `SEC-10`)

1. **Two KV Writes Per Unauthenticated Request**:
   In [`src/pages/api/crop/usage.ts`](../../src/pages/api/crop/usage.ts), every single HTTP POST triggers:
   - Line 67: `await kv.put(key, String(count + 1))` (Rate-limit counter) $\rightarrow$ **KV Write #1**
   - Line 114: `await kv.put(\`crop:usage:\${id}\`, ...)` (Telemetry record) $\rightarrow$ **KV Write #2**
2. **Zero Protective Barriers**:
   Unlike chat and contact, `/api/crop/usage` has:
   - ❌ **Zero Turnstile verification**
   - ❌ **Zero Origin / Referer check** (`isOriginAllowed` is not called)
   - ❌ **Zero Honeypot detection**
   - ❌ **Zero In-Memory rate limiting / cooldown**
3. **Catastrophic Quota Math**:
   Cloudflare KV Free Tier permits **1,000 writes per 24-hour rolling window**:
   $$\frac{1,000\text{ max daily KV writes}}{2\text{ KV writes per request}} = \mathbf{500\text{ requests}}$$
   A single automated script sending 500 requests (or a distributed bot rotating IPs) exhausts 100% of the account's KV write allowance in under 5 seconds.
4. **Shared Blast Radius (`CHAT_KV`)**:
   In [`wrangler.jsonc`](../../wrangler.jsonc), only one primary KV namespace is configured: `CHAT_KV`.
   Both `POST /api/crop/usage` and `POST /api/contact` bind to `CHAT_KV`. Once the 1,000-write quota is burned by crop telemetry:
   - `addChatMessageGuarded` throws `KV put quota exceeded (HTTP 429)` $\rightarrow$ **Live Chat is completely offline**.
   - `archiveToInbox` fails $\rightarrow$ **Contact form delivery throws errors**.
5. **Anti-Pattern: KV for Rate Limiting**:
   Cloudflare KV is eventually consistent with propagation delays up to 60 seconds. Doing a non-atomic `get` followed by `put` causes counter lag during floods, letting requests pass while burning write quotas on every attempt.

---

### 2.2 The Baseline Request Bleed (`SEC-07`, `SEC-08`)

1. **Unconditional Polling in `ChessWidget.tsx`**:
   [`src/components/chess/ChessWidget.tsx`](../../src/components/chess/ChessWidget.tsx) mounts `setInterval(fetchState, 3000)`. It runs continuously with **zero tab-visibility guard, zero modal-open check, and zero in-view check**.
   - **Math**: $\frac{8 \times 3600\text{ s}}{3\text{ s}} = 9,600\text{ requests}$ per 8-hour background session per visitor.
   - **Impact**: Just **10 idle background tabs** burn **~96,000 requests/day** (96% of the 100,000 daily Worker limit) with zero active play.
2. **Heavy D1 Read & Engine Instantiation Overhead**:
   Every hit to `GET /api/chess/state` queries Cloudflare D1 (`SELECT * FROM game WHERE id = 1`), parses JSON columns, instantiates `createArbiter`, validates chess rules, and returns `Cache-Control: no-cache, no-store`.
3. **Missing ETag / Conditional HTTP Headers**:
   Between moves, board positions do not change. Neither client nor server evaluates ETags to short-circuit unchanged games into instant `304 Not Modified` responses.

---

### 2.3 Security Bounty Vulnerability Findings

| ID         | Finding                                   | Severity   | Component                              | Root Cause                                                                                                                                                                                                      |
| :--------- | :---------------------------------------- | :--------- | :------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SEC-01** | Broken Session Auth & Side Tampering      | **High**   | `src/lib/chess/session.ts`             | `SESSION_SECRET` defaults to public string `"turn-arbiter-local-dev-secret-key-32bytes"` on Cloudflare Workers because `process.env` is not bound. Attackers can forge cookies to control both White and Black. |
| **SEC-02** | Fail-Open Bot Defense on Chess Moves      | **Medium** | `src/pages/api/chess/move.ts`          | `if (turnstileSecret && !isPassValid)` skips checks if `turnstileSecret` is undefined or fails to resolve, failing open.                                                                                        |
| **SEC-03** | Missing Turnstile Pass on Reset           | **Medium** | `src/pages/api/chess/reset.ts`         | Reset endpoint allows unauthenticated resets upon match conclusion with no `chat_pass` or Turnstile check.                                                                                                      |
| **SEC-04** | Unrestricted KV Payload via `avatar`      | **Medium** | `src/pages/api/chat/send.ts`           | `avatar` parameter is not constrained or whitelisted before persistence in Cloudflare KV key `chat:global` (25 MB limit).                                                                                       |
| **SEC-05** | Chat Room Silencing Denial of Service     | **Low**    | `src/pages/api/chat/messages.ts`       | Global 15 msg/min rule silently drops all room messages while returning HTTP 200, enabling a single fast poster to mute the whole room.                                                                         |
| **SEC-06** | Uncached D1 Database Reads                | **Low**    | `src/pages/api/chess/archive.ts`       | SQL queries run uncached on every GET request with `no-store` headers.                                                                                                                                          |
| **SEC-07** | Background Polling Drain                  | **Medium** | `src/components/chess/ChessWidget.tsx` | Unconditional 3s interval without `document.hidden` check burns Worker limits.                                                                                                                                  |
| **SEC-08** | Unconditional Full State Rebuild          | **Low**    | `src/pages/api/chess/state.ts`         | No ETag / 304 support for static chess positions.                                                                                                                                                               |
| **SEC-09** | Ungated 2-Write KV Sink on Crop Telemetry | **High**   | `src/pages/api/crop/usage.ts`          | 2 KV writes per unauthenticated call on `CHAT_KV`; 500 requests exhausts daily KV quota.                                                                                                                        |
| **SEC-10** | Shared KV Namespace Blast Radius          | **Medium** | `CHAT_KV` Architecture                 | Telemetry, contact, and live chat share one KV binding, enabling telemetry floods to crash chat.                                                                                                                |

---

### 2.4 Environmental & Platform Constraints

1. **Delegated Subdomain Constraint (`is-a.dev`)**:
   The portfolio is deployed to `samananias.is-a.dev`. Because the root zone is owned by `is-a.dev`, Cloudflare Zone WAF, Bot Fight Mode, and edge Rate Limiting Rules cannot be enabled in the dashboard. All defenses must run inside the Worker application layer.
2. **Free-Tier Compatibility (Zero Cost)**:
   The project must stay within Cloudflare Workers Free Tier (100,000 req/day, 1,000 KV writes/day, 5M D1 rows read/day).
   - **Durable Objects are excluded**: Cloudflare Durable Objects require the Workers Paid plan ($5/month minimum). We achieve equivalent quota protection and rate limiting using client lifecycle guards, in-memory edge limiters, and HTTP 304 ETags at $0 cost.

---

## 3. Technical Specifications by Feature

### Feature 1: Dynamic Worker Secret Resolution for Chess Session Signing (`SEC-01`)

#### Problem

In [`src/lib/chess/session.ts`](../../src/lib/chess/session.ts), `SESSION_SECRET` evaluates statically from `process.env.CHESS_SESSION_SECRET`. On Cloudflare Workers runtime, `process.env` does not contain dashboard secrets. It consistently defaults to `"turn-arbiter-local-dev-secret-key-32bytes"`, allowing remote clients to forge valid signatures for any `sessionId` and arbitrarily switch between `"white"` and `"black"`.

#### Solution

1. Add `CHESS_SESSION_SECRET?: string` declaration to `App.Locals` in [`src/env.d.ts`](../../src/env.d.ts).
2. Implement dynamic secret resolution via `getSessionSecret(locals?: App.Locals): Promise<string | null>` using `getWorkersEnv()`, `locals`, with fallback to `TURNSTILE_SECRET`.
3. In production (`import.meta.env.PROD && process.env.PLAYWRIGHT_E2E !== "1"`), fail closed: if no secret can be resolved, reject session verification and throw on signing.
4. Pass `locals` from API routes (`state.ts`, `move.ts`, `reset.ts`) to `verifySession()` and `signSession()`.

---

### Feature 2: Fail-Closed Turnstile Bot Gate on Chess Moves (`SEC-02`)

#### Problem

In [`src/pages/api/chess/move.ts`](../../src/pages/api/chess/move.ts), `if (turnstileSecret && !isPassValid && process.env.PLAYWRIGHT_E2E !== "1")` skips validation if `turnstileSecret` is undefined or fails to resolve, failing open.

#### Solution

Refactor gate to fail closed outside development/E2E test environments:

```ts
const isDevOrTest = !import.meta.env.PROD || process.env.PLAYWRIGHT_E2E === "1";

if (!isDevOrTest) {
  if (!turnstileSecret) {
    return new Response(
      JSON.stringify({
        ok: false,
        reason: "verification_unconfigured",
        error: "Security verification service is temporarily unavailable.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!isPassValid) {
    return new Response(
      JSON.stringify({
        ok: false,
        reason: "pass_required",
        requireTurnstile: true,
        error: "Verification pass required to make chess moves. Please verify in Live Chat.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
}
```

---

### Feature 3: Mandatory Human Pass Verification on Match Reset (`SEC-03`)

#### Problem

[`src/pages/api/chess/reset.ts`](../../src/pages/api/chess/reset.ts) validates session cookies and terminal game outcome, but never validates `chat_pass`. Scripts can trigger automatic D1 archive writes and board resets without solving Turnstile.

#### Solution

1. Import `verifyChatPass`, `getTurnstileSecret`, and `getCookie` into `src/pages/api/chess/reset.ts`.
2. Extract pass from header `x-chat-pass` or cookie `chat_pass`.
3. Require an authentic unexpired pass prior to executing match resets outside dev/test environments.
4. Update [`src/components/chess/ChessWidget.tsx`](../../src/components/chess/ChessWidget.tsx) in `handleResetMatch()` to forward `x-chat-pass` from `sessionStorage` and trigger re-verification if expired.

---

### Feature 4: Input Whitelisting & Size Bounds on Chat Avatar (`SEC-04`)

#### Problem

In [`src/pages/api/chat/send.ts`](../../src/pages/api/chat/send.ts), `avatar` is read without validation: `(typeof avatar === "string" && avatar) || "knight"`. A client can supply multi-megabyte strings in `avatar`, which are stored in the 50-message array in Cloudflare KV key `chat:global` (25 MB limit).

#### Solution

Enforce an explicit avatar whitelist matching UI chess symbols:

```ts
const ALLOWED_AVATARS = new Set(["knight", "rook", "bishop", "pawn", "king", "queen"]);

const safeAvatar =
  typeof avatar === "string" && ALLOWED_AVATARS.has(avatar.trim().toLowerCase())
    ? avatar.trim().toLowerCase()
    : "knight";
```

---

### Feature 5: Fair Rate Limiting & Denial-of-Service Mitigation (`SEC-05`)

#### Problem

In [`src/pages/api/chat/messages.ts`](../../src/pages/api/chat/messages.ts), `GLOBAL_MAX_PER_MINUTE = 15` silently drops all messages room-wide once 15 messages occur in a 60-second window. A single active participant or small burst mutes everyone else without warning.

#### Solution

1. Increase global room threshold from 15 to 45 messages / minute to accommodate active conversations between multiple visitors.
2. Rely primarily on per-IP rate limiting (5 msgs / 60s per IP with 3s cooldown) to throttle automated bots individually without punishing other participants.

---

### Feature 6: Isolate Caching & Quota Shielding for D1 Read Endpoints (`SEC-06`)

#### Problem

[`src/pages/api/chess/archive.ts`](../../src/pages/api/chess/archive.ts) and [`src/pages/api/chess/state.ts`](../../src/pages/api/chess/state.ts) invoke D1 SQL queries on every incoming GET request with `no-store` headers.

#### Solution

1. Implement a short-lived in-memory isolate cache (`ARCHIVE_CACHE_TTL_MS = 2000`) in `src/pages/api/chess/archive.ts`.
2. Clear isolate cache on successful game reset or game checkmate completion.
3. Add in-memory edge rate limiting on `/api/chess/archive` (30 requests / 60s per IP).

---

### Feature 7: Frontend Chess Polling Optimization & Background Tab Guard (`SEC-07`)

#### Problem

[`src/components/chess/ChessWidget.tsx`](../../src/components/chess/ChessWidget.tsx) polls `/api/chess/state` every 3 seconds indefinitely, even when the browser tab is hidden in the background or minimized.

#### Solution

1. Add `visibilitychange` listener: pause polling whenever `document.hidden === true`, and trigger an immediate fetch when returning to the tab.
2. Increase polling interval from 3,000ms to **5,000ms** (a 40% reduction in baseline requests during active play).
3. Tear down intervals cleanly on unmount.

---

### Feature 8: HTTP ETag / 304 Not Modified Optimization on Game State (`SEC-08`)

#### Problem

Between moves, the chess game state does not change. Every 5-second poll still reads D1, runs arbiter validation, serializes JSON, and returns a full payload.

#### Solution

1. In `src/pages/api/chess/state.ts`, compute a weak ETag based on the game version: `W/"chess-v${game.version}"`.
2. Check incoming `request.headers.get("if-none-match")`.
3. If client possesses current version (`clientEtag === etag`):
   - Return **HTTP 304 Not Modified** immediately with an empty body.
   - Skip arbiter creation, JSON serialization, and cookie signing.
4. Maintain a 2-second in-memory isolate cache for `game` state so rapid consecutive polls share the same memory read.
5. In `ChessWidget.tsx`, handle HTTP 304 by retaining current state without unnecessary re-renders.

---

### Feature 9: KV Write Shielding on `/api/crop/usage` (`SEC-09`)

#### Problem

[`src/pages/api/crop/usage.ts`](../../src/pages/api/crop/usage.ts) performs 2 KV writes per call on `CHAT_KV` with zero origin checking, zero Turnstile, and zero in-memory throttling. 500 requests completely exhaust the daily 1,000-write quota.

#### Solution

1. **Immediate Origin Check**: Import and invoke `isOriginAllowed(request)`. Reject non-whitelisted cross-origin or cURL calls with HTTP 403 before touching any storage or runtime bindings (costs 0 KV ops).
2. **Move Rate Limiting Off KV**: Delete `crop:rl:${ip}` KV reads and writes completely. Replace `isRateLimited(kv, ip)` with edge isolate in-memory `checkRateLimit({ key: \`crop:rl:\${ip}\`, maxRequests: 30, windowMs: 3600_000 })` ($0 cost, 0 KV reads, 0 KV writes).
3. **Eliminate Per-Event Telemetry KV Writes**: Remove `await kv.put(\`crop:usage:\${id}\`, ...)`. Telemetry metrics are best-effort counters; they must not consume the scarce 1,000 writes/day quota reserved for user-facing Live Chat persistence.

---

### Feature 10: Namespace Isolation & Failure Decoupling (`SEC-10`)

#### Problem

Crop telemetry, contact inbox archiving, and live chat messages share a single Cloudflare KV binding (`CHAT_KV`). Any unexpected spike or exhaustion in telemetry breaks chat message submission.

#### Solution

1. Telemetry endpoints are strictly forbidden from writing to `CHAT_KV`.
2. Core Live Chat retains exclusive write priority on `CHAT_KV` (`chat:global`).
3. Wrap all non-essential KV operations in defensive try/catch blocks that fail open gracefully without breaking primary application features.

---

## 4. Prioritized Execution Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ Tier 1: Quota Bleed & Write Firehose Defense (Immediate · Zero Cost)   │
│ • Feature 9: Eliminate KV writes & add origin check in crop/usage.ts   │
│ • Feature 7: document.hidden check & 5s interval in ChessWidget.tsx   │
│ • Feature 8: ETag / 304 Not Modified in GET /api/chess/state           │
│ • Feature 6: 2s isolate caching on GET /api/chess/archive              │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Tier 2: Write-Path Security Hardening (Immediate · Zero Cost)          │
│ • Feature 1: Dynamic Worker session secret in src/lib/chess/session.ts │
│ • Feature 2: Fail-closed Turnstile gate in POST /api/chess/move        │
│ • Feature 3: Mandatory chat_pass gate in POST /api/chess/reset         │
│ • Feature 4: Avatar whitelist in POST /api/chat/send                   │
│ • Feature 5: Relax global chat limit to 45 msg/min in messages.ts      │
│ • Feature 10: Isolate CHAT_KV writes strictly for chat persistence    │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Tier 3: Future Infrastructure Lever (Optional Account Milestone)       │
│ • Acquire personal apex domain (e.g. samananias.dev)                   │
│ • Enable Cloudflare Free Zone WAF, Bot Fight Mode & Edge Rate Limits   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Acceptance Criteria

| ID        | Criteria                                                                                                                     |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **AC-01** | `POST /api/crop/usage` performs exactly **0 Cloudflare KV writes** under all conditions.                                     |
| **AC-02** | `POST /api/crop/usage` rejects external untrusted origins with HTTP 403 via `isOriginAllowed`.                               |
| **AC-03** | `ChessWidget.tsx` halts all network polling when `document.hidden === true`.                                                 |
| **AC-04** | `GET /api/chess/state` returns HTTP 304 Not Modified with empty body when `If-None-Match` matches the active game version.   |
| **AC-05** | Forged `chess_session` cookies signed with legacy static keys are rejected with HTTP 401 in production.                      |
| **AC-06** | `POST /api/chess/move` returns HTTP 403 or 503 if `turnstileSecret` is missing or `chat_pass` is invalid in production.      |
| **AC-07** | `POST /api/chess/reset` returns HTTP 403 when invoked without an authentic `chat_pass` in production.                        |
| **AC-08** | `POST /api/chat/send` strictly accepts only whitelisted chess avatars (`knight`, `rook`, `bishop`, `pawn`, `king`, `queen`). |
| **AC-09** | `GET /api/chess/archive` caches responses for 2 seconds and enforces rate limiting of 30 req/min per IP.                     |
| **AC-10** | All automated tests (`format`, `lint`, `check`, `build`, `test:e2e`) pass with zero regressions.                             |

---

## 6. Verification Plan

### Automated Verification

```bash
npx pnpm run format
npx pnpm run lint
npx pnpm run check
npx pnpm run build
npx pnpm run test:e2e
```

### Manual Verification

1. **Crop Telemetry Zero-Write Test**: Invoke `POST /api/crop/usage` with valid payload; verify response is 200 OK and zero KV puts are executed.
2. **Background Tab Verification**: Open chess game in browser, switch tabs, inspect network console to verify polling stops completely.
3. **ETag 304 Verification**: Inspect network requests to `/api/chess/state` while board is idle; confirm requests return `304 Not Modified` with ~0ms transfer size.
4. **Session Cookie Forgery Test**: Attempt submitting a move using a handmade cookie signed with `"turn-arbiter-local-dev-secret-key-32bytes"`; verify server rejection.
5. **Reset Pass Gate Test**: Call `POST /api/chess/reset` without header `x-chat-pass`; confirm HTTP 403.
