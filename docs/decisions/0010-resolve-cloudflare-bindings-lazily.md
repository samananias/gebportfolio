# 10. Resolve Cloudflare Bindings Lazily via `cloudflare:workers` (With Soft Fallback)

- **Status:** Approved
- **Deciders:** Sam, Gen
- **Date:** 2026-09-19

## Context and Problem Statement

SSR API routes and the chess storage module need Cloudflare bindings (KV
`CHAT_KV` and `SESSION`, D1 `DB`, the `BREVO_API_KEY` secret). Two approaches
were tried and both failed one runtime:

1. **Static top-level import** (the original code):

   ```ts
   import { env as cfEnv } from "cloudflare:workers";
   ```

   That virtual module only resolves under the workerd runtime. Once default
   `astro dev` became adapterless Node (ADR 0009's `CF_DEV` gate), every
   adapterless boot crashed on file load — `Cannot find module
'cloudflare:workers'` — and CI's Playwright webServer never became
   reachable. The `try/catch` guards around `cfEnv` never ran because the
   crash happens at import time, before any function body executes.

2. **Read bindings from `Astro.locals` only** (an intermediate fix): this
   restored adapterless dev/CI, but silently broke production. In Astro v7
   the `@astrojs/cloudflare` adapter no longer maps Workers `env` bindings
   onto `locals` (the `locals.runtime.env` bridge was removed in Astro v6),
   so every `locals.CHAT_KV` / `locals.DB` lookup was `undefined` and chat
   history plus D1 chess persistence degraded to the per-isolate memory
   fallback — invisible locally, broken across visitors and deploys.

## Decision Outcome

**Resolve bindings through a lazy, cached `cloudflare:workers` import in a
single helper, `src/lib/bindings.ts`, with `locals`/`globalThis` retained as
test override seams and the existing in-memory fallbacks as the final tier.**

`getWorkersEnv()` dynamically imports the virtual module inside a `try/catch`
on first use, caches the result, and fails soft to `null` outside workerd:

- Under workerd (production Workers, or local `CF_DEV=1` emulation) the
  import resolves and the real `env` — carrying every binding declared in
  `wrangler.jsonc` plus dashboard secrets — is returned.
- Under adapterless Node (local dev, CI webServer) the import throws and is
  caught: `null`, so consumers fall back without crashing.

Per-file getters (all now `async`, all fail soft):

- `src/pages/api/chat/messages.ts` — `getKVNamespace(locals)` reads
  `locals.CHAT_KV`, then `globalThis.CHAT_KV`, then `env.CHAT_KV`; else
  `null` (in-memory chat buffer).
- `src/lib/chess/storage.ts` — `getD1Database(locals)` reads `locals.DB`,
  then `globalThis.DB`, then `env.DB`; else `undefined` (in-memory chess
  provider). All four chess routes (`state`, `move`, `reset`, `archive`)
  await it.
- `src/pages/api/contact.ts` and `src/pages/api/crop/usage.ts` — shared
  async `getBinding<K extends keyof App.Locals>(name, locals)` reading
  `locals?.[name]` → `globalThis[name]` → `env[name]` for `CHAT_KV` and
  `BREVO_API_KEY`.

## Consequences

- **Positive**: Adapterless `astro dev` (local + CI webServer) loads API
  modules without crashing — verified: `/api/chat/messages`,
  `/api/chess/state`, and `/api/crop/config` return `200` under plain Node
  with zero `Cannot find module` lines in the dev log.
- **Positive**: Production bindings are functional again. Workerd resolves
  the dynamic import natively, and the build keeps `cloudflare:workers`
  external in the esbuild `_worker.js` bundling step (see the `build` script
  in `package.json`), so the identical code path reaches real KV/D1.
- **Positive (typed contract)**: `src/env.d.ts` declares `App.Locals` with
  `CHAT_KV`, `SESSION`, `DB`, and `BREVO_API_KEY` as optional minimal-shape
  bindings. The `locals`/`globalThis` legs are compile-checked through it
  (`keyof App.Locals` in `getBinding`), so a misspelled override name fails
  `astro check`. The `env` leg is keyed by the literal `wrangler.jsonc`
  names, which the getters spell out once each.
- **Negative**: The first binding lookup per isolate pays one dynamic-import
  resolution (cached thereafter in module scope). The import must stay
  lazy — hoisting it back to module top-level reintroduces the CI crash.
- **Negative**: `Astro.locals` is no longer a binding source in production
  under Astro v7; it survives purely as a test/override seam. Any _new_
  binding must be declared in `wrangler.jsonc` and spelled into the getter
  that consumes it (add it to `App.Locals` in `src/env.d.ts` if it should
  also be override-able).
