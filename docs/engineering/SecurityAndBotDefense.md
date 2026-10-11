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

4. **Session Cookie Forgery & Side Arbitrage**:
   Crafted `chess_session` cookies signed with legacy static keys allowing scripts to bypass team assignment and control both White and Black turns.

5. **Unauthenticated Reset Flooding**:
   Automated reset calls triggering unverified Cloudflare D1 writes upon match completion.

6. **Unvalidated Chat Avatar Payload Bloat**:
   High-byte string submissions in unconstrained parameters risking Cloudflare KV 25 MB value cap exhaustion.

7. **Ungated KV Write Firehose on Telemetry (`POST /api/crop/usage`)**:
   Unauthenticated POST requests performing 2 KV writes per call on `CHAT_KV` with zero Turnstile and zero origin check, burning the entire 1,000 writes/day free KV quota in 500 requests and knocking out Live Chat.

See [0011 Security Hardening Specification](../plans/0011-live-chat-and-chess-security-hardening-specification.md) and [0011.1 Implementation Roadmap](../plans/0011.1-live-chat-and-chess-security-hardening-roadmap.md) for remediation milestones.

### Environmental Constraints

The portfolio is served via a delegated community subdomain (`samananias.is-a.dev`). Because the root domain zone is managed externally, **Cloudflare Zone WAF and Bot Fight Mode are unavailable** in the account dashboard. Security controls must be enforced within the Worker application layer.

---

## 2. Multi-Layer Security Architecture

### Layer 1: In-Memory Edge Rate Limiting (`src/lib/rateLimit.ts`)

Rate limiting runs at the edge isolate before reaching Cloudflare KV or D1 persistence. This shields external storage quotas from brute-force floods at zero cost:

| Endpoint                | Max Ingestion             | Cooldown Window            | Action on Violation       |
| :---------------------- | :------------------------ | :------------------------- | :------------------------ |
| `POST /api/chat/send`   | 5 messages / 60s per IP   | 3.0s minimum between posts | HTTP 429 (`Retry-After`)  |
| `POST /api/chat/send`   | 5 messages / 60s per name | 3.0s minimum between posts | HTTP 429 (`Retry-After`)  |
| `POST /api/chess/move`  | 12 moves / 60s per IP     | 2.5s minimum between moves | HTTP 429 (`rate_limited`) |
| `POST /api/chess/reset` | 2 resets / 60s per IP     | 5.0s minimum cooldown      | HTTP 429 (`rate_limited`) |

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

Mutating endpoints verify request origins against authorized hostnames (`samananias.is-a.dev`, `gebportfolio.pages.dev`, `gebportfolio.workers.dev`, `.gebportfolio.pages.dev`) and browser `Sec-Fetch-Site` headers. External scripts sending raw cURL requests without matching origin headers are rejected with HTTP 403. Wildcard `.pages.dev` and `.workers.dev` host matching is explicitly restricted.

### Layer 5: Honeypot Detection

Endpoints monitor hidden trap attributes (`website`, `_hp`). Automated bots that fill these fields are silently accepted with HTTP 200 without writing records to storage.

### Layer 6: Abuse & Duplicate-Text Drop Rules (`src/pages/api/chat/messages.ts`)

To protect Cloudflare KV write quotas from rapid automated spam, `addChatMessageGuarded` applies multi-factor drop rules prior to committing any message to `CHAT_KV`:

1. **Global Room Threshold**: When recent messages across the entire room exceed 15 messages / minute, incoming messages are silently dropped (0 KV writes).
2. **Same-Sender Duplicate Prevention**: If a sender submits identical normalized text within 60 seconds, the duplicate is silently dropped.
3. **Cross-Sender Duplicate Flood Filter**: If messages matching identical normalized text (>= 12 characters) appear within 10 minutes across different senders, the message is silently dropped.
4. **Silent Acceptance Semantics**: Dropped messages return an acceptance response to the client so bot scripts cannot detect filtering heuristics or calibrate timing to evade detection.

### Layer 7: Short-Lived Isolate Read Cache (`src/pages/api/chat/messages.ts` & `/api/chess/*`)

To protect Cloudflare KV read quotas (100,000 reads/day) and D1 row read quotas from high-frequency client polling:

- `GET /api/chat/messages` implements an in-memory 3-second isolate cache (`HISTORY_CACHE_TTL_MS = 3000`). Concurrent polling requests within the window are served directly from cache memory, evicting only on fresh posts.
- `GET /api/chess/archive` and `GET /api/chess/state` implement in-memory 2-second isolate caches to collapse rapid multi-user read bursts before querying Cloudflare D1.

### Layer 8: Client Lifecycle & Tab-Visibility Guards (`ChessWidget.tsx`)

To prevent idle background tabs from consuming daily Worker request quotas:

- Polling in `ChessWidget.tsx` attaches a `visibilitychange` listener and halts network traffic whenever `document.hidden === true`.
- Normal steady-state polling interval is extended to 5.0 seconds (40% baseline reduction).

### Layer 9: HTTP ETag / 304 Not Modified Caching (`src/pages/api/chess/state.ts`)

Unchanged game states return lightweight HTTP 304 responses:

- `GET /api/chess/state` computes a weak ETag based on `game.version` (`W/"chess-v${version}"`).
- If the incoming client header `If-None-Match` matches, the Worker returns **HTTP 304 Not Modified** with an empty body, bypassing D1 read queries and chess arbiter CPU execution entirely.

### Layer 10: Emergency Kill Switch (`CHAT_LOCKED`)

During persistent bot floods or automated DDoS attacks, chat can be paused immediately without code deployments by setting environment variable `CHAT_LOCKED=1` in Cloudflare Variables and Secrets. When set, both `POST /api/chat/send` and `POST /api/chat/verify` return HTTP 503 (`Retry-After: 300`) with zero KV or Siteverify consumption.

### Layer 11: Telemetry Isolation & Zero-KV-Write Policy (`/api/crop/usage`)

To protect the shared 1,000 writes/day free KV quota from non-critical metric consumption:

- `POST /api/crop/usage` enforces `isOriginAllowed(request)` and immediately rejects untrusted cross-origin and raw cURL callers with HTTP 403.
- Rate limiting is decoupled from Cloudflare KV: `crop:rl:${ip}` counters run purely in-memory via `checkRateLimit` ($0 cost, 0 KV reads, 0 KV writes).
- Per-event telemetry archival to `CHAT_KV` is eliminated to ensure non-essential metric bursts never exhaust write quotas required by Live Chat or Contact inbox delivery.

---

## 3. Cloudflare Turnstile Verification (`src/lib/turnstile.ts`)

Cloudflare Turnstile bot deterrence is integrated end-to-end across public write surfaces following the [Turnstile Spin existing-widget specification](https://developers.cloudflare.com/turnstile/spin/prompt.md):

1. **Active Configuration**:
   - Site Key: `0x4AAAAAAFRF21R_W1pBeMMF`
   - Secret Binding: `TURNSTILE_SECRET` (configured via Cloudflare Dashboard Secrets or `wrangler secret put TURNSTILE_SECRET` on Worker `gebportfolio`).
   - Approved Hostnames: `samananias.is-a.dev`, `gebportfolio.pages.dev`, `gebportfolio.workers.dev`, and `.gebportfolio.pages.dev` in production; `localhost` and `127.0.0.1` permitted exclusively in local/dev test environments.
   - **Fail-Closed Secret Handling**: In production outside dev/test, missing `TURNSTILE_SECRET` fails closed immediately with HTTP 403. Auto-success on preview wildcard domains has been removed.

2. **Protected Surfaces**:
   - **Contact Form** (`/contact` & `POST /api/contact`):
     - Action: `contact`.
     - Container rendered in `src/pages/contact.astro` with `class="cf-turnstile"`, `data-sitekey`, and `data-action="contact"`.
     - Token lifecycle: single-use token sent in `cf-turnstile-response`; reset upon delivery error or "Compose another".
     - Handler contract: "gate, don't replace" — `POST /api/contact` verifies token against `https://challenges.cloudflare.com/turnstile/v0/siteverify` before calling Brevo delivery.
   - **Live Arena & Chat Modal Gate** (`ChatBox`, `POST /api/chat/verify`, `POST /api/chat/send`, & `POST /api/chess/move`):
     - Action: `chat` / `live`.
     - **Name-Bound Three-Part Arena Pass**: Verifying via `POST /api/chat/verify` issues an HMAC-SHA256 signed `chat_pass` formatted as `<exp>.<nameHex>.<signature>`. The pass cryptographically binds the client IP, the user's validated display name, and the 15-minute expiration timestamp (`issueChatPass()`).
     - **Identity Locking**: A single Turnstile solve is cryptographically bound to one display name. Attempting to post under a different name requires solving a fresh Turnstile challenge.
     - **Verification**: `verifyChatPassDetailed` validates the three-part format and matches the pass name to the sender. `verifyChatPass` provides boolean validation for callers that do not require name checks (e.g., chess moves).
     - **Protects Both Chat & Chess**:
       - _Live Chat_: Sending messages requires an authentic pass matching the sender name.
       - _Shared Chess_: Making moves (`POST /api/chess/move`) validates the active pass via `verifyChatPass`.
     - **Auto-Renewal & Expiry Handling**: When the pass expires after 15 minutes, the re-verification gate appears to obtain a fresh pass seamlessly.

3. **Validation & Dev Bypassing**:
   - In development and Playwright E2E suites (`!import.meta.env.PROD || process.env.PLAYWRIGHT_E2E === "1"`), requests without secret or with dummy tokens succeed to prevent CI flakiness and maintain zero-latency development workflows.
   - In production, missing secrets or invalid tokens are strictly blocked at the boundary.

---

## 4. Operational Maintenance

### Purging Defaced Messages from Cloudflare KV

To clear spam messages and re-seed the default welcome announcement:

```bash
npx wrangler kv key delete --binding CHAT_KV "chat:global"
```

The application will recreate the clean welcome message on the subsequent visitor fetch.
