# Portfolio (peaceful-proxima)

Personal portfolio built with Astro (SSR on Cloudflare Workers), React 19 islands, Tailwind CSS v4, and pnpm.

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
- never use absolute local paths (`file:///...`) in markdown — use relative links (`check-links` validates in CI)
- never create `tailwind.config.js` or `tailwind.config.mjs` — Tailwind v4 is CSS-first in `src/styles/global.css` via `@theme`
- never add dependencies without explicit approval
- update `docs/Changelog.md` and relevant docs under `docs/` before completing changes

## Style deltas (only where this repo differs from defaults)

- UI components: Write as static `.astro` files. Use React islands only for interactive components with client state.
- Content layer: Declare schemas in `src/content.config.ts` using `glob()` or `file()`. Never use legacy `type: 'content'`. Singletons in `src/content/data/` must stay single-item arrays with an `id` field.
- Colors: Use semantic CSS variables mapped in `src/styles/tokens.css` and bound in `src/styles/global.css`. Never hardcode hex colors in markup.

## Read when

- `docs/design/DoodleIconSystem.md` — before creating or editing UI icons/SVGs
- `docs/engineering/ContentStyleGuide.md` — before writing or modifying copy
- `docs/engineering/AI-Project-Context.md` — before architectural changes or stack updates
- `docs/engineering/CodingStandards.md` — before adding backend or stateful logic
