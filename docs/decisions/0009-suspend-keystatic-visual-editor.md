# 9. Suspend Keystatic Visual Editor (Files-Only Content Editing)

- **Status:** Approved
- **Deciders:** Sam, Gen
- **Date:** 2026-09-19

## Context and Problem Statement

ADR 0002 adopted Keystatic in local mode as a visual editor writing directly
to `src/content/*` files. In practice, solo content editing happens faster in
VS Code, while Keystatic imposed recurring costs:

1. **Dual-schema drift** — every content field must be declared twice: once in
   `src/content.config.ts` (real Zod validation) and once in
   `keystatic.config.ts` (UI only). Drift surfaced as red
   `Key on object value ... is not allowed` banners: Experience missed `type`
   and `url`; Projects missed `chessPiece`, `category`, `keyTakeaway`, and
   `chessRoleReason`; Experiments missed `summary`, `objectives`, and
   `keyTakeaway`. Each content schema change required two edits to stay openable
   in the UI.
2. **Cloudflare workerd conflict in dev** — the `@astrojs/cloudflare` adapter
   forced `/keystatic/*` through the workerd runner, which lacks the `module`
   global Keystatic's Node-dependent UI needs (`module is not defined` via
   `workers/runner-worker`). Worked around with a `CF_DEV=1` opt-in gate in
   `astro.config.ts`, but the gate exists only to serve the editor.
3. **No asset story** — `storage: { kind: "local" }` has no upload pipeline, so
   project images under `public/images/projects/*` must be committed via git
   regardless. The "visual CMS" workflow breaks at the asset step.

## Decision Outcome

**Suspend** the Keystatic visual editor. Content editing is files-only via
`src/content/*`, validated by Zod at build time:

| Content               | Edit here                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Projects              | `src/content/projects/*.md`                                                                            |
| Blog posts            | `src/content/posts/*.md`                                                                               |
| Experience timeline   | `src/content/experience/*.yaml`                                                                        |
| Skills                | `src/content/skills/*.yaml`                                                                            |
| Achievements          | `src/content/achievements/*.yaml`                                                                      |
| Research              | `src/content/research/*.md`                                                                            |
| Lab experiments       | `src/content/experiments/*.md`                                                                         |
| About page            | `src/content/pages/about.json`                                                                         |
| Site name/email/links | `src/content/data/site.json` (array-wrapped, keep the `[{ "id": ... }]` shape for the `file()` loader) |
| Navigation            | `src/content/data/navigation.json` (array-wrapped, same note)                                          |
| Project images        | `public/images/projects/<slug>/`, committed via git                                                    |

## Preserved for Revival (Not Deleted)

- `keystatic.config.ts` — kept as-is, including the Experience `type`/`url`
  parity fix, so it is fresher if revived.
- `.keystatic/data/` — singleton mirrors, untouched.
- `@keystatic/astro` / `@keystatic/core` in `package.json` + `pnpm-lock.yaml` —
  left installed so revival is one uncomment (cost: lockfile weight only; the
  integration no longer loads, so there is zero runtime cost).
- `syncSingletonsPlugin()` was removed from `astro.config.ts` on 2026-09-19
  (CI fix: its startup file-writes plus `fs.watch` watchers stalled
  Playwright's `astro dev` webServer boot on ubuntu-latest). Nothing reads
  `.keystatic/data/` while the editor is suspended, so the mirrors there may
  drift — re-sync them from `src/content/data/*.json` (strip the `id` key) if
  Keystatic is ever revived.
- The adapter gate in `astro.config.ts` is hybrid: default `astro dev` runs
  adapterless (Node); `CF_DEV=1` emulates workerd for KV/D1 testing;
  `astro build` / `astro preview` always apply the adapter via argv detection
  so SSR API routes deploy to Workers.

## Revival Conditions

Re-enable when any of these become true: a non-technical editor joins, editing
from the deployed site (GitHub-mode storage) becomes wanted, or schema churn
slows enough that dual-schema maintenance is cheap.

## Revival Steps

1. Uncomment the `keystatic()` integration line in `astro.config.ts` (see the
   `ADR 0009` comment there) and restore the singleton sync (see the removed
   `syncSingletonsPlugin()` in git history, or re-sync `.keystatic/data/`
   one-shot from `src/content/data/*.json` minus the `id` key).
2. Run a schema-parity audit: every field in `src/content.config.ts` must exist
   in `keystatic.config.ts` (Projects chess fields, Experiments
   `summary`/`objectives`/`keyTakeaway`, and Pages `moves[]`/`facts[]` are known
   gaps as of this writing).
3. Decide on storage: keep `kind: "local"` for local-only editing, or switch to
   GitHub mode per Thinkmill Discussion #1513 for on-site editing on Workers
   (requires `wrangler secret` env management + OAuth callback URL).
4. Decide on an asset pipeline: Keystatic local mode cannot upload to
   `public/`; either accept git-committed images or add upload handling.

## Consequences

- **Positive**: One schema source of truth (`content.config.ts`); no workerd
  crash surface in default dev; no silent UI-only staleness.
- **Negative**: No form UI for content; `/keystatic` 404s in dev (expected);
  `@keystatic/*` deps still fetched on install until a full removal (if ever).
- **Neutral**: No production impact — the integration was already excluded from
  production builds.
