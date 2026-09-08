## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Terminal & Command Execution

When executing terminal commands on Windows, always wrap commands with `cmd /c` (e.g. `cmd /c "npx pnpm run format"`) to bypass PowerShell script execution policy restrictions (`.ps1` disabled), unless another terminal is explicitly required.

**Git Bash exception:** MSYS2 auto-converts `/`-prefixed arguments into Windows paths, so `cmd /c` loses its `/c` switch and silently opens an interactive cmd session (which exits with code 0 without running anything). In Git Bash, use `cmd //c` instead (e.g. `cmd //c "npx pnpm run format"`), or prefix the command with `MSYS_NO_PATHCONV=1`. If a wrapped command produces no output at all, suspect this mangling before trusting the exit code.

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
