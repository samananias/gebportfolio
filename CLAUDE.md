# Portfolio (peaceful-proxima)

Personal portfolio for Sam Ananias Cases built with Astro (SSR on Cloudflare Workers), React 19 islands, Tailwind CSS v4, and pnpm.

## Commands

- dev: `astro dev --background` (manage with `astro dev stop|status|logs`)
- test: `npx pnpm run test:e2e` and `npx pnpm run test:a11y` # single test: `npx pnpm playwright test <path>`
- verify (run in order before done):
  1. `npx pnpm run format`
  2. `npx pnpm run lint`
  3. `npx pnpm run check`
  4. `npx pnpm run build`
  5. `npx pnpm run test:e2e`
  6. `npx pnpm run test:a11y`
- terminal (Windows): Use Git Bash directly. If executing in PowerShell, wrap commands with `cmd /c "<command>"`. Never use `cmd /c` inside Git Bash.

## Boundaries

- never use system text emojis in UI or code — use `<DoodleIcon>` SVGs (`DoodleIcon.astro` or `DoodleIcon.tsx`)
- never use CSS gradients (linear, radial, conic) — violates woodcut ink-on-paper identity (sole exception: `.chess-grid` in `src/styles/global.css`)
- never use blurred drop shadows on interactive elements — use zero-blur hard offsets on hover (3px card / 2px button) and translate into shadow on active
- never use `rounded-full` on buttons or cards — reserve pill radius for tags/chips/badges only (cards: 4px `rounded-sm`, buttons: 8px `rounded-md`)
- never fabricate testimonials, metrics, companies, or case study data — every claim must trace to real verified evidence (BITS, Avega Bros, CTU Danao)
- never create `tailwind.config.js` or `tailwind.config.mjs` — Tailwind v4 is CSS-first in `src/styles/global.css` via `@theme`
- never use absolute local paths (`file:///...`) in markdown — use relative links (`check-links` validates in CI)
- never add dependencies without explicit approval
- update `docs/Changelog.md` and relevant docs under `docs/` before completing changes

## Style deltas (only where this repo differs from defaults)

- UI components: Write as static `.astro` files. Use React islands only for interactive components with client state.
- Design identity: Woodcut manuscript aesthetic — linework-first with 2.5px structural borders (`border-structural`), warm paper in light mode (`#f8f7f5`), true black in dark mode (`#000000`). Flat at rest.
- Colors: Strategic Blue is the sole accent (≤15% surface area). Use semantic CSS variables mapped in `src/styles/tokens.css` and bound in `src/styles/global.css` — never hardcode hex colors in markup.
- Typography: Fraunces (`WONK=1`) for Display/H1/H2 only; Manrope for H3/H4; Inter for body (~68ch measure); JetBrains Mono uppercase for eyebrows/badges/labels; Gochi Hand capped to empty states (≤10 words).
- Content layer: Declare schemas in `src/content.config.ts` using `glob()` or `file()`. Never use legacy `type: 'content'`. Singletons in `src/content/data/` must stay single-item arrays with an `id` field.
- Product audience: Dual-track for technical evaluators (architectural ownership, test suites) and business decision-makers (reliability, delivered outcomes); prioritize discipline over volume.

## Read when

- `DESIGN.md` — before creating or modifying UI components, layouts, typography, shadows, or color schemes
- `PRODUCT.md` — before writing copy, structuring pages, proposing features, or planning case studies
- `docs/design/DoodleIconSystem.md` — before creating or editing UI icons/SVGs
- `docs/design/WoodcutTheme.md` — before complex woodcut illustrations, textures, or theme refinements
- `docs/engineering/ContentStyleGuide.md` — before writing or modifying copy
- `docs/engineering/AI-Project-Context.md` — before architectural changes or stack updates
- `docs/engineering/CodingStandards.md` — before adding backend or stateful logic
