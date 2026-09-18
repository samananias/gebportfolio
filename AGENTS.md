## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Terminal & Command Execution

Always use Git Bash on Windows to run CLI commands directly (e.g. `npx pnpm run format`). Do NOT use `cmd /c` or `cmd //c` inside Git Bash, as it mangles `/`-prefixed args and can silently open an interactive session.

If Git Bash cannot be used (e.g. when executing inside PowerShell where `.ps1` execution is disabled), fall back to wrapping commands with `cmd /c` (e.g. `cmd /c "npx pnpm run format"`).

## Definition of Done

Before considering a task completed, run the full verification suite in order (run directly in Git Bash, or wrap with `cmd /c "<command>"` if falling back to cmd):

1. `npx pnpm run format` — formats the codebase with Prettier.
2. `npx pnpm run lint` — checks syntax and rules with ESLint.
3. `npx pnpm run check` — runs Astro compiler typechecks and documentation link validation.
4. `npx pnpm run build` — verifies the production build compiles successfully.
5. `npx pnpm run test:e2e` — runs Playwright E2E tests (Playwright auto-starts the app).
6. `npx pnpm run test:a11y` — runs axe-core accessibility audits (Playwright auto-starts the app).

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
