# 0013 Quota Consumption & Verification Boundaries Hardening Specification

<callout icon="♞">**Status:** Approved · **Owner:** Sam & Antigravity · **Date:** 2026-10-12</callout>

---

## 1. Goal & Context

### 1.1 Context & Budget Constraints

The portfolio operates strictly within Cloudflare and Brevo **$0 / free-tier quotas**:

- **Cloudflare Workers:** 100,000 requests/day, 10 ms CPU time/request.
- **Cloudflare KV (`CHAT_KV`):** 1,000 writes/day, 100,000 reads/day, 1 GB storage.
- **Cloudflare D1 (`DB`):** 50,000 writes/day, 100,000 reads/day, 5 GB storage.
- **Brevo Transactional Email:** 300 emails/day.

Because this application runs on a third-party delegated domain (`samananias.is-a.dev`), Cloudflare Zone WAF and Bot Fight Mode are unavailable at the dashboard zone level. All anti-abuse, rate limiting, and quota enforcement mechanisms must execute directly at the application boundary within Worker routes using platform primitives.

### 1.2 Forensic Audit Findings (F1 – F6)

A bounded security and quota-abuse audit (commit `b9aa4d3`, 2026-10-12) confirmed six verified vulnerabilities and design weaknesses:

| ID     | Finding                                                                         | Code Location                                                                                                                                                                           | Root Cause                                                                                                                                                                                              | Verified Impact                                                                                                                       |
| :----- | :------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------ |
| **F1** | Leaky burst rate limiting on Contact route                                      | [`src/pages/api/contact.ts`](../../src/pages/api/contact.ts#L148-L164)                                                                                                                  | Non-atomic KV read-then-write (`get` followed by `put`). KV is eventually consistent and edge-cached per-colo up to 60s without `cacheTtl`.                                                             | Burst submissions pass before KV updates propagate, violating the 3 req/hr limit and consuming Brevo emails.                          |
| **F2** | No site-wide cap on `/api/contact`; unmetered Brevo quota consumption           | [`src/pages/api/contact.ts`](../../src/pages/api/contact.ts#L212-L218)                                                                                                                  | Only per-IP rate limiting exists. No global rate limit or daily email budget counter.                                                                                                                   | A distributed flood (multiple IPs) burns Brevo's 300/day quota, forcing all legitimate users into `HTTP 502`. Drains KV write quotas. |
| **F3** | Unbounded live scraping on `/api/github/contributions.json`                     | [`src/pages/api/github/contributions.json.ts`](../../src/pages/api/github/contributions.json.ts#L11-L82), [`GitHubChessGrid.tsx`](../../src/components/islands/GitHubChessGrid.tsx#L86) | Client fetches route on every homepage mount. Worker fetches GitHub HTML, regex-parses ~400 KB, and lacks Edge Cache API caching. `Cache-Control` header does not cache Worker responses automatically. | 100k/day Worker executions burn; risk of Worker CPU-time timeouts; upstream GitHub scraping rate limits.                              |
| **F4** | Single environment variable `PLAYWRIGHT_E2E=1` grants total verification bypass | [`src/lib/turnstile.ts`](../../src/lib/turnstile.ts#L82-L86), [`src/lib/rateLimit.ts`](../../src/lib/rateLimit.ts#L58)                                                                  | Dev/test bypass evaluates `process.env.PLAYWRIGHT_E2E === "1"` without verifying if the request host is local. Forged `preview-test-pass` accepted.                                                     | Latent total bypass: if configured or leaked in production, attackers can bypass Turnstile, chat passes, and origin checks.           |
| **F5** | Architectural misconception: `isOriginAllowed()` stops automated scripts        | [`docs/decisions/0011-anti-bot-rate-limiting-and-game-protection.md`](../decisions/0011-anti-bot-rate-limiting-and-game-protection.md#L40)                                              | ADR 0011 states origin checks "drop off-site automated cURL / Python scripts". In reality, HTTP scripts forge `Origin` and `Referer` headers trivially.                                                 | Documentation inaccuracy leading to misplaced trust in origin validation against non-browser bots.                                    |
| **F6** | Unbounded storage growth on shared `CHAT_KV` namespace                          | [`src/pages/api/contact.ts`](../../src/pages/api/contact.ts#L131-L146)                                                                                                                  | Contact submissions archived to `contact:inbox:<id>` without `expirationTtl`.                                                                                                                           | Permanent storage accumulation competing with chat storage against the 1 GB KV ceiling.                                               |

### 1.3 Target Objectives

1. **Two-Tier Edge Caching for Contributions (Fixes F3):** Combine an in-memory isolate cache (60s) with Cloudflare Cache API (`caches.default`, 3600s) and an IP rate limiter (30 req/min) so repeated visits incur zero GitHub upstream fetches and minimal Worker CPU.
2. **Exact Atomic Rate Limiting & Global Caps via D1 (Fixes F1, F2):** Replace non-atomic KV counter with serialized D1 SQL statements returning `count` and `window_start`. Enforce per-IP (3/hr), global hourly (12/hr), and daily Brevo email budget (200/day) caps.
3. **Emergency Contact Kill Switch (Fixes F2):** Support `CONTACT_LOCKED=1` to return `HTTP 503` immediately during spam attacks, mirroring `CHAT_LOCKED`.
4. **Localhost Isolation for All Bypass Paths (Fixes F4):** Restrict all test/development bypasses (`PLAYWRIGHT_E2E=1`, dummy Turnstile tokens, mock preview chat passes) strictly to local hosts (`localhost` and `127.0.0.1`).
5. **Hygiene & Documentation Accuracy (Fixes F5, F6):** Set a 90-day TTL on contact KV archives, update ADR 0011 with an inline correction, and document decisions in ADR 0013.
6. **Hot Read Path Rate Limiting (P2):** Add in-memory edge rate limiting (~60 req/min per IP) on `/api/chat/messages` and `/api/chess/state`.

---

## 2. User Experience & Design Impact

- **Zero Visual Regression:** No changes to UI components, typography, layout, or client styling.
- **Deterministic Visitor Delivery:** When Brevo's daily email budget is reached, messages continue to be safely archived to D1/KV while returning an honest, polite `HTTP 502` guidance message inviting the visitor to email directly.
- **Faster Homepage Latency:** Caching `/api/github/contributions.json` drops response latency from ~1,000 ms (live scraping) to <10 ms (edge cache hit).

---

## 3. Architecture & Component Strategy

### 3.1 Contributions Route Multi-Tier Caching ([`src/pages/api/github/contributions.json.ts`](../../src/pages/api/github/contributions.json.ts))

The contributions endpoint will incorporate two cache tiers and an in-memory IP rate limiter:

```
Incoming Request
      │
      ▼
┌───────────────────────────────┐
│ 1. IP Rate Limiter (Edge)     │ ──[≥ 30 req/min]──> HTTP 429 Too Many Requests
│ checkRateLimit(forceEnforce)  │
└───────────────────────────────┘
      │ [Allowed]
      ▼
┌───────────────────────────────┐
│ 2. Isolate Memory Cache       │ ──[Hit (< 60s)]────> Return JSON (X-Cache: HIT-MEMORY)
└───────────────────────────────┘
      │ [Miss]
      ▼
┌───────────────────────────────┐
│ 3. Cloudflare Cache API       │ ──[Hit (< 3600s)]──> Return JSON (X-Cache: HIT-EDGE)
│ caches.default.match(request) │
└───────────────────────────────┘
      │ [Miss]
      ▼
┌───────────────────────────────┐
│ 4. Live Fetch & Regex Parse   │
│ Upstream github.com           │
└───────────────────────────────┘
      │
      ▼
┌───────────────────────────────┐
│ Populate Memory + Edge Cache  │ ──> Return JSON (X-Cache: MISS)
└───────────────────────────────┘
```

#### Cache Implementation Rules

- **Edge Cache Stream Handling:** `caches.default.put(request, response.clone())` must clone the response stream prior to caching because Cloudflare's Cache API consumes the body.
- **Node Dev Guard:** When running `astro dev` under Node.js, `typeof caches === "undefined"` or `caches?.default === undefined`. The implementation must safely bypass the Cache API and rely on the in-memory isolate cache.
- **Observability Header:** Return `X-Cache: HIT-MEMORY | HIT-EDGE | MISS` on all responses.
- **Data Freshness Timestamp:** `updatedAt` reflects the timestamp when the cache entry was generated, not the request arrival time.

---

### 3.2 Atomic Rate Limiting & Quota Buckets via D1 (`src/lib/dbThrottle.ts`)

#### Database Schema (`migrations/0002_add_throttle_buckets.sql`)

```sql
-- Migration: 0002_add_throttle_buckets.sql
-- Atomic rolling-window counters for quota protection.
CREATE TABLE IF NOT EXISTS throttle (
  bucket       TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,  -- unix seconds
  count        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_throttle_window ON throttle(window_start);
```

#### Atomic Upsert Statement

To ensure race-free increments across concurrent Worker isolates, counters are updated in a single serialized SQL statement:

```sql
INSERT INTO throttle (bucket, window_start, count) VALUES (?1, ?2, 1)
ON CONFLICT(bucket) DO UPDATE SET
  count        = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
  window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
RETURNING count, window_start;
```

> [!IMPORTANT]
> **Returning `window_start` is Mandatory:** The query must return both `count` and `window_start`. This allows `consume()` to compute the exact `retryAfterSec` header:
> $$\text{retryAfterSec} = \max(1, (\text{window\_start} + \text{windowSeconds}) - \text{nowSec})$$

#### Function Interface

```typescript
export interface ThrottleResult {
  allowed: boolean;
  count: number;
  retryAfterSec: number;
}

export async function consumeThrottle(
  db: D1DatabaseBinding | undefined | null,
  bucket: string,
  max: number,
  windowSeconds: number
): Promise<ThrottleResult>;
```

- When `db` is unavailable (local dev without D1), `consumeThrottle` returns `{ allowed: true, count: 1, retryAfterSec: 0 }` to keep test suites deterministic.
- Stale rows (`window_start < now - 172800`) are periodically purged via a cheap sweeper executing at most once per hour per isolate.

---

### 3.3 Contact Route Multi-Layer Shield ([`src/pages/api/contact.ts`](../../src/pages/api/contact.ts))

The contact submission pipeline enforces defenses in strict order:

```
1. Invisible Honeypot ('website' populated) ──> Silent HTTP 200 (Drops bot)
2. Payload Validation (name, email, message length) ──> HTTP 400
3. Turnstile Verification (Siteverify + Host check) ──> HTTP 403
4. Emergency Kill Switch (CONTACT_LOCKED=1) ──> HTTP 503 + Retry-After: 300
5. Atomic Per-IP Throttle (contact:ip:<ip>, 3/3600s) ──> HTTP 429 + Retry-After
6. Atomic Global Hourly Throttle (contact:global:hour, 12/3600s) ──> HTTP 429 + Retry-After
7. Daily Email Budget Check (contact:email:day, 200/86400s):
   ├─ Exhausted ──> Archive with delivered: false ──> HTTP 502 (honest recovery message)
   └─ Available ──> Attempt Brevo API delivery:
                    ├─ Success ──> Archive with delivered: true ──> HTTP 200
                    └─ Failure ──> Archive with delivered: false ──> HTTP 502
```

#### Archive TTL

In `archiveToInbox()`, pass `expirationTtl: 7776000` (90 days) on `kv.put()` to prevent unbounded storage expansion on `CHAT_KV`.

---

### 3.4 Localhost Isolation for Test Bypasses ([`src/lib/turnstile.ts`](../../src/lib/turnstile.ts), [`src/lib/rateLimit.ts`](../../src/lib/rateLimit.ts))

To eliminate latent security bypasses if `PLAYWRIGHT_E2E=1` is ever configured on production environments:

1. **Local Host Guard Helper:**
   ```typescript
   export function isLocalRequestHost(host: string | null | undefined): boolean {
     if (!host) return false;
     const clean = host.toLowerCase().split(":")[0].trim();
     return clean === "localhost" || clean === "127.0.0.1";
   }
   ```
2. **Turnstile Siteverify Bypass:**
   In `verifyTurnstileToken`:
   ```typescript
   const isLocal = isLocalRequestHost(options.requestHostname);
   if ((!import.meta.env?.PROD || process.env.PLAYWRIGHT_E2E === "1") && isLocal) {
     if (!secret || token === "dummy-test-token") {
       return { success: true };
     }
   }
   ```
3. **Session Pass Signatures:**
   In `verifyChatPassDetailed`: `preview-test-pass` and `dev-test-pass` signatures are honored **only if** `isLocalRequestHost(requestHost)` evaluates to `true`.
4. **Origin Validation:**
   In `isOriginAllowed()`: `PLAYWRIGHT_E2E` bypass requires `isLocalRequestHost(hostHeader)`.

---

### 3.5 Hot Read Route Guards ([`src/pages/api/chat/messages.ts`](../../src/pages/api/chat/messages.ts), [`src/pages/api/chess/state.ts`](../../src/pages/api/chess/state.ts))

- Add in-memory edge rate limiting:
  `checkRateLimit({ key: 'chat:messages:' + clientIp, maxRequests: 60, windowMs: 60_000, forceEnforce: true })`
- Retain existing 3-second isolate cache in `messages.ts`.
- Ensure `/api/chess/state` passes `forceEnforce: true` to prevent unthrottled poller loops during testing.

---

## 4. Dependencies & Constraints

- **Zero New Dependencies:** Strictly use platform primitives (`caches.default`, Cloudflare D1, in-memory `Map`).
- **No Remote Migrations in Automated Runs:** Migration file `0002_add_throttle_buckets.sql` will be committed; local tests apply via `--local`. Remote deployment requires the owner to execute `npx wrangler d1 migrations apply DB --remote`.
- **Zero Production Load Testing:** Verification tests run locally or against preview deployments using official Cloudflare test keys (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`).

---

## 5. Verification Plan

### Automated Test Gates

1. `cmd /c "npx pnpm run lint && npx pnpm run check"`
2. Unit tests for `consumeThrottle()`:
   - Window rollover resets count to 1.
   - Concurrent calls increment count atomically.
   - Blocks when count exceeds max; computes accurate `retryAfterSec`.
3. Unit tests for `isLocalRequestHost()`:
   - Accepts `localhost`, `127.0.0.1`, `localhost:4321`.
   - Rejects `samananias.is-a.dev`, `gebportfolio.pages.dev`, `attacker.com`.
4. E2E tests in [`tests/e2e/turnstile-security.spec.ts`](../../tests/e2e/turnstile-security.spec.ts):
   - `dummy-test-token` accepted on `localhost`, rejected when host is `samananias.is-a.dev`.
   - Forged `preview-test-pass` rejected on production hostnames.
5. Quality suite:
   ```bash
   cmd /c "npx pnpm run format && npx pnpm run lint && npx pnpm run check && npx pnpm run build && npx pnpm run test:e2e && npx pnpm run test:a11y"
   ```
