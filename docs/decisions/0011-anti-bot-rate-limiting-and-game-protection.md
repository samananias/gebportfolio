# 11. Anti-Bot Rate Limiting, Origin Verification, and Game Protection

- **Status:** Approved
- **Deciders:** Sam, Antigravity
- **Date:** 2026-10-08

## Context and Problem Statement

The public portfolio features real-time interactive elements: a live crowd-sourced chat room and a shared communal chess board powered by `turn-arbiter` on Cloudflare D1.

Because these endpoints (`/api/chat/send`, `/api/chess/move`, and `/api/chess/reset`) were initially public and unthrottled:

1. Automated bot scripts flooded the chat room with simulated AI roleplay spam, wiping out the 50-message rolling history and burning Cloudflare KV write quotas (1,000 writes/day free tier).
2. Bots repeatedly called `/api/chess/reset` to reset active chess games mid-match, generating superfluous Cloudflare D1 writes and disrupting legitimate players.
3. Rapid automated moves on the chessboard risked exhausting D1 write limits (50,000 writes/day).
4. Because the portfolio is served over a third-party delegated domain (`samananias.is-a.dev`), Cloudflare Zone WAF and Bot Fight Mode are unavailable in the dashboard; defenses must operate at the application level.

## Decision Outcome

**Implement multi-layer application security directly in the Worker API routes:**

1. **In-Memory Isolate Rate Limiting (`src/lib/rateLimit.ts`):**
   - High-performance sliding-window and cooldown rate limiting executed in the edge isolate before reaching KV or D1 storage.
   - `/api/chat/send`: Max 5 messages per 60 seconds per IP, with a minimum 3-second cooldown between consecutive posts.
   - `/api/chess/move`: Max 12 moves per 60 seconds per IP, with a minimum 2.5-second cooldown between consecutive moves.
   - `/api/chess/reset`: Max 2 reset attempts per 60 seconds per IP, with a 5-second cooldown.
   - Throttled in production (`import.meta.env.PROD`); bypassed in local development and Playwright E2E suites to keep testing deterministic.

2. **Game-Over-Only Reset Enforcement (`src/pages/api/chess/reset.ts`):**
   - Evaluates the current game state via `turn-arbiter` rules.
   - Rejects any reset request with HTTP 400 (`reason: "game_in_progress"`) if `outcome` is `null`.
   - Resets are exclusively permitted once a match concludes via checkmate, stalemate, or draw.

3. **Server-Side Sender Blacklist & Impersonation Filters:**
   - Rejects sender handles with reserved words (`admin`, `system`, `mod`, `owner`) or AI model tokens (`anthropic`, `claude`, `gpt`, `openai`, `palm`, `gemini`, `phi`, `mistral`, `bot`).
   - Enforces length requirements (3–20 characters).

4. **Origin & CSRF Header Verification:**
   - Mutating POST routes verify that the `Origin` or `Referer` matches the portfolio domain or `Sec-Fetch-Site` is `same-origin`.
   - Drops off-site automated cURL / Python scripts.

5. **Honeypot Traps:**
   - Checks invisible `website` and `_hp` payload fields. Automated scrapers populating these fields are silently dropped with HTTP 200 without writing to storage.

## Consequences

- **Positive:** Protects Cloudflare KV and D1 free tier limits from rapid depletion; prevents board hijacking mid-game; cleans up automated bot defacement without requiring custom domain WAF infrastructure.
- **Negative:** Fast manual typists face a 3-second cooldown between chat messages.
