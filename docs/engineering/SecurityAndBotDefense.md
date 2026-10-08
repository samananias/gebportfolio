# Security & Anti-Bot Defense Architecture

This document describes the threat model, application-layer defenses, and operational procedures implemented to safeguard public interactive endpoints (live chat, collaborative chess, and contact correspondence) against automated bot spam, denial-of-service, and storage quota exhaustion.

---

## 1. Threat Model & Incident Context

### Attack Vectors

1. **Unthrottled Chat Ingestion**:
   Automated bots dispatched high-frequency HTTP `POST` requests to `/api/chat/send` with rotating sender identities (e.g. `Claude Anthropic`, `Mistral Anthropic`, `Phi Anthropic`).
   - _Impact_: Overwrote legitimate chat history in Cloudflare KV (`CHAT_KV`) and risked burning the 1,000 writes/day free KV tier quota.
   - _Threat Level_: Nuisance/defacement and resource exhaustion. No data breach occurred because the portfolio stores no private user data or credentials.

2. **Mid-Game Reset Flooding**:
   Automated scripts repeatedly invoked `POST /api/chess/reset`.
   - _Impact_: Forcibly cleared active communal games and triggered unnecessary Cloudflare D1 writes.

3. **Move Spamming**:
   Fast multi-session script bots submitting moves in milliseconds without natural turn pacing.

### Environmental Constraints

The portfolio is served via a delegated community subdomain (`samananias.is-a.dev`). Because the root domain zone is managed externally, **Cloudflare Zone WAF and Bot Fight Mode are unavailable** in the account dashboard. Security controls must be enforced within the Worker application layer.

---

## 2. Multi-Layer Security Architecture

### Layer 1: In-Memory Edge Rate Limiting (`src/lib/rateLimit.ts`)

Rate limiting runs at the edge isolate before reaching Cloudflare KV or D1 persistence. This shields external storage quotas from brute-force floods at zero cost:

| Endpoint                | Max Ingestion           | Cooldown Window            | Action on Violation       |
| :---------------------- | :---------------------- | :------------------------- | :------------------------ |
| `POST /api/chat/send`   | 5 messages / 60s per IP | 3.0s minimum between posts | HTTP 429 (`Retry-After`)  |
| `POST /api/chess/move`  | 12 moves / 60s per IP   | 2.5s minimum between moves | HTTP 429 (`rate_limited`) |
| `POST /api/chess/reset` | 2 resets / 60s per IP   | 5.0s minimum cooldown      | HTTP 429 (`rate_limited`) |

Rate limits are enforced in production (`import.meta.env.PROD`) and bypassed in development/E2E test runs to prevent test flakiness.

### Layer 2: Game-Over-Only Reset Protection (`src/pages/api/chess/reset.ts`)

The chess engine evaluates whether the current board state has concluded before permitting a match reset:

- If `outcome` is `null` (match is actively in progress), the endpoint rejects the request with HTTP 400 (`reason: "game_in_progress"`).
- Resets are only accepted once the match concludes via checkmate, stalemate, or draw.

### Layer 3: Server-Side Sender Sanitization (`src/lib/rateLimit.ts`)

Incoming chat sender handles are filtered on the server:

- Length constrained to 3–20 characters.
- Blacklisted tokens: `admin`, `system`, `mod`, `moderator`, `owner`, `bot`, `crawler`, and AI model brands (`anthropic`, `claude`, `openai`, `gpt`, `gemini`, `palm`, `phi`, `mistral`, `deepseek`, `llama`).

### Layer 4: Origin & Referer Verification

Mutating endpoints verify request origins against authorized hostnames (`samananias.is-a.dev`, `gebportfolio.pages.dev`, `gebportfolio.workers.dev`) and browser `Sec-Fetch-Site` headers. External scripts sending raw cURL requests without matching origin headers are rejected with HTTP 403.

### Layer 5: Honeypot Detection

Endpoints monitor hidden trap attributes (`website`, `_hp`). Automated bots that fill these fields are silently accepted with HTTP 200 without writing records to storage.

---

---

## 3. Cloudflare Turnstile Verification (`src/lib/turnstile.ts`)

Cloudflare Turnstile bot deterrence is integrated end-to-end across both public write surfaces following the [Turnstile Spin existing-widget specification](https://developers.cloudflare.com/turnstile/spin/prompt.md):

1. **Active Configuration**:
   - Site Key: `0x4AAAAAAFRF21R_W1pBeMMF`
   - Secret Binding: `TURNSTILE_SECRET` (configured via Cloudflare Dashboard Secrets or `wrangler secret put TURNSTILE_SECRET` on Worker `gebportfolio`).
   - Approved Hostnames: `samananias.is-a.dev`, `gebportfolio.pages.dev`, `gebportfolio.workers.dev` in production; `localhost` and `127.0.0.1` permitted exclusively in local/dev test environments.

2. **Protected Surfaces**:
   - **Contact Form** (`/contact` & `POST /api/contact`):
     - Action: `contact`.
     - Container rendered in `src/pages/contact.astro` with `class="cf-turnstile"`, `data-sitekey`, and `data-action="contact"`.
     - Token lifecycle: single-use token sent in `cf-turnstile-response`; reset upon delivery error or "Compose another".
     - Handler contract: "gate, don't replace" — `POST /api/contact` verifies token against `https://challenges.cloudflare.com/turnstile/v0/siteverify` before calling Brevo delivery.
   - **Live Arena & Chat Modal Gate** (`ChatBox`, `POST /api/chat/verify`, `POST /api/chat/send`, & `POST /api/chess/move`):
     - Action: `chat` / `live`.
     - **Modal Entry Gate Architecture**: Rather than embedding CAPTCHA widgets inside the chatbox input bar, Turnstile verification is presented when opening the live modal:
       1. _First-time onboarding_: The user chooses their handle and solves the Turnstile challenge on the onboarding screen before entering.
       2. _Returning visitors & pass renewal_: When returning or upon 15-minute pass expiry, a centered "Verify to Enter Arena" gate screen appears.
     - **Unified 15-Minute Arena Pass**: Verifying via `POST /api/chat/verify` issues an HMAC-SHA256 signed `chat_pass` (stored in `sessionStorage` and `chat_pass` cookie) bound to client IP and an unforgeable 15-minute expiration timestamp (`issueChatPass()`).
     - **Protects Both Chat & Chess**:
       - _Live Chat_: Sending messages checks the active pass. The chat input bar remains completely clean without embedded iframes.
       - _Shared Chess_: Making moves (`POST /api/chess/move`) attaches the `x-chat-pass` header and validates the active session pass. Bot moves without an active pass are rejected with HTTP 403 `requireTurnstile: true`.
     - **Auto-Renewal & Expiry Handling**: When the pass expires after 15 minutes, both chess moves and chat actions trigger the re-verification gate to obtain a fresh pass seamlessly.
     - **Preview Host Tolerance**: Detects preview deployments (`*.pages.dev`, `*.workers.dev`). If `TURNSTILE_SECRET` has not yet been mirrored into Cloudflare Pages Preview variables, permits verification for testing while logging configuration guidance.

3. **Validation & Dev Bypassing**:
   - In development and Playwright E2E suites (`!import.meta.env.PROD || process.env.PLAYWRIGHT_E2E === "1"`), requests without secret or with dummy tokens succeed to prevent CI flakiness and maintain zero-latency development workflows.
   - In production, missing secrets or invalid tokens are strictly blocked at the boundary. Preview hostnames (`*.pages.dev`, `*.workers.dev`) are granted preview tolerance if the secret is not yet configured.

---

## 4. Operational Maintenance

### Purging Defaced Messages from Cloudflare KV

To clear spam messages and re-seed the default welcome announcement:

```bash
npx wrangler kv key delete --binding CHAT_KV "chat:global"
```

The application will recreate the clean welcome message on the subsequent visitor fetch.
