# AI Project Context Bootstrap Prompt

Copy and paste the entire block below into the very first prompt of any new AI chat session to ensure the agent aligns with the codebase conventions and constraints:

```markdown
### AI Project Context

You are working on a high-performance personal portfolio project.

- **Handbook & Guidelines**: Follow the conventions in `/Portfolio Architecture & Engineering Handbook *.md`, `/docs/engineering/AI-Guidelines.md`, `/docs/engineering/ContentStyleGuide.md`, and `/docs/plans/`.
- **Core Tech Stack**: Astro v7.1.1 (`@astrojs/cloudflare` SSR adapter) + React 19 + `turn-arbiter` (Chess Engine) + Cloudflare KV (Chat State) + TypeScript (strict) + Tailwind CSS v4 (CSS-first config) + pnpm.
- **Theme & Style**: Styled via semantic CSS variables mapped in `/src/styles/tokens.css` and bound to Tailwind in `/src/styles/global.css`. Hex colors must never be hardcoded in markup.
- **Content Layer (Astro v5)**: Collection schemas are declared in `/src/content.config.ts` using loaders (`glob` for directories, `file` for JSON singletons). Singletons inside `/src/content/data/` are array-wrapped with `id` keys to ensure file-loader compatibility.
- **Rules of Engagement**:
  1. No new dependencies without explicit permission.
  2. Write UI components as `.astro` static files. Use React components only for interactive islands requiring client-side state.
  3. Configure design system rules strictly inside the `@theme` directive in `/src/styles/global.css` (never create `tailwind.config.js`).
  4. Always use Git Bash on Windows to run CLI commands directly (`npx pnpm run format`). If Git Bash cannot be used (e.g. executing in PowerShell), fall back to `cmd /c` (e.g., `cmd /c "npx pnpm run format"`) to bypass PowerShell execution policy restrictions. Never use `cmd /c` inside Git Bash.
  5. Always run the full verification suite in order before considering a task completed (directly in Git Bash, or via `cmd /c` fallback): `npx pnpm run format` (Prettier write), `npx pnpm run lint` (ESLint), `npx pnpm run check` (typecheck + doc link validation), `npx pnpm run build` (build compiler), and `npx pnpm run test:e2e` / `npx pnpm run test:a11y` (E2E & accessibility tests; Playwright auto-starts the app).
  6. Do not use system text emojis in UI components or code; use theme-aware `<DoodleIcon>` vector SVGs (`DoodleIcon.astro` / `DoodleIcon.tsx`) instead (see `/docs/design/DoodleIconSystem.md`).
- **Read First**: `/docs/README.md`, `/docs/engineering/AI-Guidelines.md`, `/docs/engineering/ContentStyleGuide.md`, `/docs/engineering/CodingStandards.md`, `/docs/plans/README.md`.
```
