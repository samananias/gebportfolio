# 13. Harden Quota Consumption and Verification Boundaries

- **Status:** Approved
- **Deciders:** Sam, Antigravity
- **Date:** 2026-10-12

## Context and Problem Statement

Following an external security and quota-abuse review (commit `b9aa4d3`, 2026-10-12), multiple architectural vectors were identified that risked exhausting the portfolio's $0 / free-tier operating budgets (Cloudflare Workers, KV writes, D1 writes, and Brevo transactional emails):

1. **Unbounded Contributions Route (F3):** `GET /api/github/contributions.json` executed live web-scraping on `github.com` and regex-parsed ~400 KB of HTML on every request. It was called on every homepage visit by `src/components/islands/GitHubChessGrid.tsx`. Because Worker responses with `Cache-Control` are not automatically cached at the Cloudflare edge without the Cache API, this created an easy avenue to burn the 100,000 requests/day Workers limit and trigger Worker CPU timeouts.
2. **Leaky Burst Rate Limiter on Contact Form (F1):** `isRateLimited` on `/api/contact` used non-atomic KV `get` followed by `put`. Because Workers KV is eventually consistent and edge-cached per-colo up to 60s, burst submissions could sail past the 3 messages/hour limit before writes propagated.
3. **No Site-Wide Cap on Contact Submissions (F2):** The contact route only enforced per-IP limits. Distributed senders (proxies, botnets) could easily burn Brevo's 300 free daily emails, exhausting the mailbox quota and degrading the site for legitimate visitors.
4. **Permissive E2E Test Bypass Condition (F4):** Setting `PLAYWRIGHT_E2E=1` bypassed Turnstile verification and origin checks globally without verifying if the server was executing on localhost.
5. **Origin Verification Script Misconception (F5):** ADR 0011 claimed origin checks drop automated scripts. In reality, non-browser clients (cURL, Python) can forge `Origin` headers arbitrarily.
6. **Unbounded Contact KV Inbox Growth (F6):** Contact messages archived to `contact:inbox:<id>` lacked an `expirationTtl`, accumulating indefinitely on the shared `CHAT_KV` namespace.

## Decision Outcome

**Implement platform-level quota bounding, atomic D1 counters, and strict localhost isolation:**

1. **Two-Tier Edge Caching for Contributions (`src/pages/api/github/contributions.json.ts`, `src/lib/edgeCache.ts`):**
   - Layer 1: In-memory isolate cache (60 seconds TTL) coalesces requests arriving at the same Worker isolate.
   - Layer 2: Cloudflare Cache API (`caches.default`, 3600 seconds TTL) caches responses across the Cloudflare edge PoP network.
   - Observability: Diagnostic `X-Cache` response header (`HIT-MEMORY` | `HIT-EDGE` | `MISS`).
   - Edge rate limit: Max 30 requests/minute per IP (`checkRateLimit`) returning HTTP 429 with `Retry-After`.

2. **Atomic Rolling-Window Rate Limiting via D1 (`migrations/0002_add_throttle_buckets.sql`, `src/lib/dbThrottle.ts`):**
   - Schema: Dedicated `throttle(bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)` table.
   - Atomic upsert statement:
     ```sql
     INSERT INTO throttle (bucket, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(bucket) DO UPDATE SET
       count        = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
     RETURNING count, window_start;
     ```
   - Returning `window_start` enables deterministic calculation of exact `Retry-After` seconds.
   - Background sweeper purges expired buckets older than 2 days.

3. **Contact Route Quota and Email Budget Guards (`src/pages/api/contact.ts`):**
   - Per-IP Limit: D1 bucket `contact:ip:<ip>`, capped at 3 submissions / 3600 seconds.
   - Global Hourly Limit: D1 bucket `contact:global:hour`, default 12 submissions / 3600 seconds (configurable via `CONTACT_HOURLY_MAX`).
   - Daily Transactional Email Budget: D1 bucket `contact:email:day`, default 200 submissions / 86400 seconds (configurable via `CONTACT_DAILY_EMAIL_BUDGET`).
   - Honest Degradation: When the daily Brevo budget is reached, submissions are safely archived with `delivered: false`, Brevo is skipped, and visitors receive HTTP 502 with direct email guidance.
   - Kill Switch: `CONTACT_LOCKED=1` immediately rejects submissions with HTTP 503 (`Retry-After: 300`).

4. **Strict Localhost Isolation for Test Bypasses (`src/lib/turnstile.ts`, `src/lib/rateLimit.ts`):**
   - Introduced `isLocalRequestHost(host)` requiring hostnames to strictly match `localhost` or `127.0.0.1`.
   - `PLAYWRIGHT_E2E=1`, `dummy-test-token`, and `preview-test-pass` signatures are honored only when the request hostname is local.
   - Threaded `requestHost` from `contact.ts`, `chess/move.ts`, `chess/reset.ts`, and `chat/send.ts`.

5. **KV Archive Retention Hygiene (`src/pages/api/contact.ts`):**
   - Applied `expirationTtl: 7776000` (90 days) on all `contact:inbox:<id>` entries.

6. **ADR 0011 Clarification (`docs/decisions/0011-anti-bot-rate-limiting-and-game-protection.md`):**
   - Annotated that origin verification is CSRF protection for browsers, while Turnstile and rate limiting serve as true anti-bot boundaries.

7. **Hot Read Path Rate Limiting (`src/pages/api/chat/messages.ts`, `src/pages/api/chess/state.ts`):**
   - Added in-memory edge rate limiting (~60 req/min per IP) to prevent unthrottled poller loops.

## Consequences

- **Positive:** Bounded free-tier quota consumption ($0 budget maintained); atomic race-free rate limiting on contact form; protects Brevo daily email limits; eliminates latent production bypass risks; speeds up homepage contributions load from ~1000ms to <10ms.
- **Negative:** Additional D1 query per contact form submission (well within 50,000 writes/day limit).
- **Operational Steps Required on Deploy:**
  1. Apply D1 migration remotely: `npx wrangler d1 migrations apply DB --remote`
  2. Confirm in Cloudflare Dashboard (Variables and Secrets) that `PLAYWRIGHT_E2E` is **not** set.
  3. (Optional) Configure Brevo 80% usage email alerts.
