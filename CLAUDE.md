## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Terminal & Command Execution

When executing terminal commands on Windows, always wrap commands with `cmd /c` (e.g. `cmd /c "npx pnpm run format"`) to bypass PowerShell script execution policy restrictions (`.ps1` disabled), unless another terminal is explicitly required.

**Git Bash exception:** when the active terminal is Git Bash, do NOT use `cmd /c` or `cmd //c` — run commands directly (e.g. `npx pnpm run format`). The `cmd` wrapper is PowerShell-only; in Git Bash/MSYS2 it mangles `/`-prefixed args and can silently open an interactive session that exits 0 without running anything.

## Definition of Done

Before considering a task completed, run the full verification suite in order:

1. `cmd /c "npx pnpm run format"` — formats the codebase with Prettier.
2. `cmd /c "npx pnpm run lint"` — checks syntax and rules with ESLint.
3. `cmd /c "npx pnpm run check"` — runs Astro compiler typechecks and documentation link validation.
4. `cmd /c "npx pnpm run build"` — verifies the production build compiles successfully.
5. `cmd /c "npx pnpm run test:e2e"` — runs Playwright E2E tests (Playwright auto-starts the app).
6. `cmd /c "npx pnpm run test:a11y"` — runs axe-core accessibility audits (Playwright auto-starts the app).

CI enforces the same gates plus a Lighthouse performance budget check on every push and PR.

## Emoji & UI Icon Rule

Do **not** use system text emojis (e.g. `✉`, 📷, 📹, ✕, 🚀) in UI components, layout templates, or code. Always use theme-aware `<DoodleIcon>` vector SVGs (`DoodleIcon.astro` or `DoodleIcon.tsx`) or custom `currentColor` SVGs. Refer to `docs/design/DoodleIconSystem.md` for guidelines.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
