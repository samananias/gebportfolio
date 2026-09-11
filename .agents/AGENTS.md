## Developer Rules & Invariants

Always follow these rules strictly before and during any edits to this repository:

### 1. Documentation Portability & Integrity

- **Prohibited Link Format**: Do **not** use absolute local paths (e.g. `file:///c:/Users/...`) inside repository markdown files.
- **Permitted Link Format**: Use relative markdown links (e.g. `[Design System](DesignSystem.md)` or `[global.css](../src/styles/global.css)`).
- **Broken Link Guard**: Any document edits must be validated by running `npx pnpm run check-links`. The build/check process will fail on broken relative links.

### 2. Definition of Done for Changes

- Every change must:
  1. Update the corresponding markdown file inside `docs/` if there are architectural, structural, or component deviations.
  2. Add an entry to `docs/Changelog.md` detailing the changes.
  3. Keep `docs/AI-Project-Context.md` updated if the core tech stack, folder structure, or constraints change.

### 3. Astro v5 Content Layer Rules

- All content collections must use the new Content Layer loader structure in `src/content.config.ts` (e.g. `loader: glob(...)` or `loader: file(...)`). Do **not** use legacy `type: 'content'` configurations.
- Singleton config files inside `src/content/data/` (like `site.json` and `navigation.json`) are wrapped in single-item arrays with an `id` field for compatibility with the built-in `file` loader. Maintain this structure.

### 4. Tailwind CSS v4 Rules

- Tailwind v4 is fully CSS-first. All utility configuration, theme variable mapping, and custom style extensions must be written inside `src/styles/global.css` using the `@theme` directive.
- Do **not** create a `tailwind.config.js` or `tailwind.config.mjs`.

### 5. Verification Command Sequence (Definition of Done)

Before claiming a task is done, you must run the full verification suite in order:

1. `cmd /c "npx pnpm run format"` (formats the codebase using Prettier; CI enforces this via `npx pnpm run format:check`).
2. `cmd /c "npx pnpm run lint"` (checks syntax with ESLint).
3. `cmd /c "npx pnpm run check"` (runs Astro compiler typechecks and documentation link validation).
4. `cmd /c "npx pnpm run build"` (verifies the project compiles successfully).
5. `cmd /c "npx pnpm run test:e2e"` (runs Playwright E2E tests; Playwright auto-starts the app via its `webServer` config).
6. `cmd /c "npx pnpm run test:a11y"` (runs axe-core accessibility audits; Playwright auto-starts the app via its `webServer` config).

CI enforces this same sequence plus a Lighthouse performance budget check on every push and pull request.

### 6. Terminal & Command Execution Rule

- Always wrap CLI commands on Windows with `cmd /c` (e.g. `cmd /c "npx pnpm run format"`) to bypass PowerShell script execution policy restrictions (`.ps1` disabled), unless another terminal is explicitly requested.
- **Git Bash exception:** when the active terminal is Git Bash, do NOT use `cmd /c` or `cmd //c` — run commands directly (e.g. `npx pnpm run format`). The `cmd` wrapper is PowerShell-only.

### 7. Emoji & UI Icon Rule

- **Prohibited**: Do **not** use system text emojis (e.g. `✉`, 📷, 📹, ✕, 🚀) in UI components, layout templates, or client code.
- **Permitted**: Use theme-aware `<DoodleIcon>` vector SVGs (`DoodleIcon.astro` or `DoodleIcon.tsx`) or custom `currentColor` SVGs. Refer to `docs/design/DoodleIconSystem.md` for guidelines.
