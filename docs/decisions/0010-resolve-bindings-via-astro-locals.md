# 10. Resolve Cloudflare Bindings via Astro.locals (No `cloudflare:workers` Import)

- **Status:** Approved
- **Deciders:** Sam, Gen
- **Date:** 2026-09-19

## Context and Problem Statement

SSR API routes and the chess storage module read Cloudflare bindings (KV
`CHAT_KV`, D1 `DB`, `BREVO_API_KEY`) through a static top-level import:

```ts
import { env as cfEnv } from "cloudflare:workers";
```

That virtual module only resolves under the workerd runtime. Once default
`astro dev` became adapterless Node (ADR 0009's `CF_DEV` gate), every adapterless
boot crashed on file load — `Cannot find module 'cloudflare:workers'` from
`src/pages/api/chat/messages.ts`, `src/lib/chess/storage.ts` (plus latent
crashes in `src/pages/api/contact.ts` and `src/pages/api/crop/usage.ts`) —
and CI's Playwright webServer never became reachable (timeout after polling
`http://127.0.0.1:4321`). The `try/catch` guards around `cfEnv` never ran
because the crash happens at import time, before any function body executes.

## Decision Outcome

**Resolve bindings via `Astro.locals` (injected by the `@astrojs/cloudflare`
adapter on real Workers), with a `globalThis` test override and the existing
in-memory fallbacks.** No `cloudflare:workers` import anywhere in `src/`:

- `src/pages/api/chat/messages.ts` — `getKVNamespace(locals)` reads
  `locals.CHAT_KV`, then `globalThis.CHAT_KV`, else `null` (in-memory chat
  buffer).
- `src/pages/api/contact.ts` — `getBinding(name, locals)` reads
  `locals[name]`, then `globalThis[name]`; the `POST` handler destructures
  `locals` and passes it through for `CHAT_KV` and `BREVO_API_KEY`.
- `src/pages/api/crop/usage.ts` — same `getBinding(name, locals)` shape; the
  `POST` handler destructures `locals` and passes it through for `CHAT_KV`.
- `src/lib/chess/storage.ts` — `getD1Database(locals)` reads `locals.DB`,
  then `globalThis.DB`, else `undefined` (in-memory chess provider).

## Consequences

- **Positive**: Adapterless `astro dev` (local + CI webServer) loads API
  modules without crashing; `GET /api/chat/messages`, `/api/chess/state`,
  and `/api/crop/config` return `200` locally via fallbacks.
- **Positive**: Production Workers behavior is unchanged — the adapter injects
  the same bindings into `locals`, which was always the second lookup.
- **Positive (typed contract)**: `src/env.d.ts` declares `App.Locals` with
  `CHAT_KV`, `SESSION`, `DB`, and `BREVO_API_KEY` as optional minimal-shape
  bindings, and every getter reads through it (`locals?.CHAT_KV`, `locals?.DB`,
  or `keyof App.Locals` in `getBinding`). A misspelled binding name is now a
  compile-time error in `astro check` instead of a silent runtime degrade to
  the in-memory fallback. Tests overriding via `globalThis` are unaffected.
- **Negative**: Code can no longer reach the raw workers `env` object
  directly; any future binding must flow through `locals` (the documented
  Astro path) and be added to `App.Locals` in `src/env.d.ts` (matching its
  `wrangler.jsonc` declaration) to stay compile-checked.
