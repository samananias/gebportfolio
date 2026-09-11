# 8. ID Photo Studio: Client-Side Removal with Thin Workers Backend

- **Status:** Proposed
- **Deciders:** Sam, Gen
- **Date:** 2026-09-10

## Context and Problem Statement

The portfolio needs an ID-photo tool (background removal plus 2x2 and 1x1
cropping) served at `samananias.is-a.dev/crop`. That domain is a free
`is-a.dev` subdomain resolving as a plain CNAME to `gebportfolio.pages.dev`,
so a path route costs zero DNS changes (see
[ADR 0007](0007-deliver-contact-via-brevo-transactional-api.md) for the
domain constraint analysis).

The stack is Astro v7 with the `@astrojs/cloudflare` SSR adapter (see
`astro.config.ts` and [TechStack](../architecture/TechStack.md)). Cloudflare
Workers free-plan limits (small bundle size, tight CPU time and memory caps)
rule out bundling a ~40MB ONNX segmentation model for server-side inference.
The `sharp` package already in `devDependencies` can resize and crop, but it
cannot segment a person from a background.

## Decision Options

1. **Separate repo plus hosted API**: register a second `is-a.dev` subdomain,
   host a second app, proxy to a paid inference provider (Remove.bg,
   Replicate, Hugging Face Inference). Rejected: extra maintenance, CORS
   surface, API-key management, per-image cost, and ID photos leaving the
   visitor's device.
2. **Server-side inference on Workers**: bundle an ONNX segmentation model
   into the Worker and accept image uploads. Rejected: impossible within
   bundle, CPU, and memory limits; storing ID photos in KV, D1, or R2 would
   create PII liability for zero benefit.
3. **Client-side removal with thin backend (selected)**: run
   `@imgly/background-removal-js` (WASM plus ONNX, browser-cached model,
   AGPL-3.0) and `<canvas>` cropping inside a React island with
   `client:visible` (per
   [ADR 0006](0006-use-react-only-for-interactive-islands.md)). Workers API
   routes serve the canonical preset config, validate metadata, and
   rate-limit. No image bytes ever touch the server.

## Decision Outcome

Build in the same `gebportfolio` repo: `src/pages/crop.astro` for the
memorable URL, `src/lib/crop/*` for canonical presets and pure validators,
`src/pages/api/crop/*` for config, metadata-only usage telemetry, and a
`501` contract stub for a future paid fallback. List the tool in the Lab via
`src/content/experiments/id-photo-studio.md` with a demo link to `/crop`.
No `wrangler.jsonc` changes and no new secrets in v1.

## Consequences

- **Positive**: Zero hosting cost, zero DNS changes, strong privacy story
  ("photos never leave your browser in v1"), and the full Definition of Done
  (format, lint, check, build, E2E, a11y) stays in one repo.
- **Negative**: AGPL-3.0 license notice required for the removal library;
  first load fetches a large model (~40MB, browser-cached afterwards);
  in-browser segmentation quality is below Python `rembg` with ISNet —
  accepted for v1, with the `POST /api/crop/remove` stub reserving the seam
  for a paid fallback later.
