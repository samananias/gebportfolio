# ID Photo Studio Specification

<callout icon="♞">**Status:** Draft · **Owner:** Sam · **Date:** 2026-09-10</callout>

---

## 1. Goal & Context

Give visitors a free ID-photo tool at `samananias.is-a.dev/crop`: upload a
portrait, remove the background in-browser, crop to Philippine ID presets
(2x2 and 1x1), pick a background color, and download a print-ready file.

Backend first, frontend later. This spec locks the backend contract (canonical
presets, pure validators, three API routes) so the deferred React island can
code against a stable surface. The removal strategy follows
[ADR 0008](../decisions/0008-crop-thin-backend-client-removal.md): heavy ML
stays in the browser; Workers never see image bytes.

Canonical v1 pixel spec (square, 300 DPI):

| Preset | Inches | Millimetres | Pixels @300DPI |
| ------ | ------ | ----------- | -------------- |
| 2x2    | 2 x 2  | 51 x 51     | 600 x 600      |
| 1x1    | 1 x 1  | 25 x 25     | 300 x 300      |

Rectangular passport variants (e.g. 35 x 45mm) are out of scope for v1 and
may be added as extra preset keys without breaking this contract.

---

## 2. User Experience & Design Impact

Frontend is deferred, but these requirements bind it when built:

- **Desktop & Mobile Behavior**: single-column flow (upload, adjust, export)
  that works at 390px widths; crop box draggable with pointer and keyboard
  nudge support.
- **Accessibility Requirements**: WCAG 2.2 AA; labelled file input, live
  status region for removal progress, visible focus rings, instant motion
  under `prefers-reduced-motion`.
- **Design Tokens / Theme Variables**: semantic tokens only
  (`bg-surface`, `text-text-muted`, `border-border-custom`); no hardcoded
  hex; no system text emojis — theme-aware `<DoodleIcon>` SVGs per
  [AI Guidelines](../engineering/AI-Guidelines.md).
- **Privacy copy**: an honesty panel stating photos are processed on-device,
  the model downloads once (~40MB, cached), and nothing is uploaded in v1.

---

## 3. Proposed Architecture & Component Strategy

### Canonical presets library

Summary of changes: single source of truth for sizes, backgrounds, and
export caps. The frontend must import it, never hardcode pixels.

#### [NEW] `src/lib/crop/presets.ts`

Pure TypeScript, zero runtime dependencies:

- `ID_PRESETS`: `2x2` (600x600) and `1x1` (300x300) with inch, mm, and
  pixel fields.
- `BG_OPTIONS`: `white`, `light-blue`, `transparent`.
- `EXPORT`: `formats: ["image/jpeg", "image/png"]`,
  `maxInputBytes: 8MB`, `maxInputDim: 4000px`.

#### [NEW] `src/lib/crop/validation.ts`

Pure validators, unit-testable without Workers: `validateFileMeta`,
`validatePresetId`, `validateExportOpts`.

### Workers API routes

All routes set `export const prerender = false` and reuse the
`{ ok, error }` JSON shape from `src/pages/api/contact.ts`.

#### [NEW] `src/pages/api/crop/config.ts`

`GET` returns `{ presets, bgOptions, export, model, limits }` imported from
`presets.ts`, with CDN caching mirroring
`src/pages/api/github/contributions.json.ts`
(`Cache-Control: public, max-age=3600, s-maxage=3600,
stale-while-revalidate=86400`).

#### [NEW] `src/pages/api/crop/usage.ts`

`POST` accepts metadata only
(`{ event, preset, ms }` — never image bytes), rate-limits per IP via
`CHAT_KV` in production only (mirroring `contact.ts` so local E2E sharing
one miniflare IP does not flake), archives best-effort to `crop:usage:*`,
and responds with `Cache-Control: no-store` headers.

#### [NEW] `src/pages/api/crop/remove.ts`

`POST` contract stub: accepts `multipart/form-data`, validates via
`validation.ts`, and returns `501`
`{ ok: false, error: "server-removal-not-enabled", fallback: "client" }`.
Reserves the seam for a future paid fallback without a frontend rewrite.

### Lab listing

#### [NEW] `src/content/experiments/id-photo-studio.md`

Collection entry (`status: active`) with warning copy about the one-time
model download, `technologies` list, and a demo link to `/crop`. Does not
revive `src/pages/experiments/index.astro` (still `UnderConstruction`).

### Explicit non-goals

- No image byte storage in KV, D1, or R2.
- No `sharp` in the Workers runtime.
- No `wrangler.jsonc` changes, no new secrets.
- No E2E test that downloads the 40MB model (mock config fetch instead).

---

## 4. Dependencies & Constraints

- One new npm dependency at frontend time only:
  `@imgly/background-removal-js` (AGPL-3.0 — license notice required).
- Backend adds zero dependencies: pure TypeScript plus existing Astro
  `APIRoute` patterns.
- Strict TypeScript; ESLint plus Prettier; Windows commands via `cmd /c`.
- Reference standards in [Coding Standards](../engineering/CodingStandards.md)
  and [Design System](../design/DesignSystem.md).

---

## 5. Verification Plan

### Automated Tests

- `npx pnpm run format`
- `npx pnpm run lint`
- `npx pnpm run check` (includes `node scripts/check-links.js`)
- `npx pnpm run build`
- `npx pnpm run test:e2e` (new `tests/e2e/crop-api.spec.ts`: `GET config`
  returns both presets; `POST remove` returns 501 with `fallback: client`)
- `npx pnpm run test:a11y`

### Manual Verification

- Docs links resolve via `check-links.js`.
- API contract readable enough that the frontend island can be built
  without backend changes.
