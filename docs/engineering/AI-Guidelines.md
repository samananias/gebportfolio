# AI Guidelines

<callout icon="♞">**Status:** Active · **Owner:** Gen · **Last Reviewed:** 2026-07-18</callout>

Directives for AI agents collaborating on this codebase.

## Mandatory Preflight

1.  Read `README.md`, `AGENTS.md`, [Handbook](../../Portfolio%20Architecture%20&%20Engineering%20Handbook%202e6dfc6171c0423a8fc61d2f398ece49.md), and [Content & Writing Style Guide](ContentStyleGuide.md).
2.  Search for existing components and patterns.
3.  Propose plans for significant changes before writing code.

## Restrictions

- Do not restructure the project directory.
- Do not introduce redundant dependencies.
- Preserve existing code formatting and types.
- Always execute terminal commands via `cmd /c` on Windows (e.g. `cmd /c "npx pnpm run format"`) to prevent PowerShell `.ps1` execution errors.
- **Git Bash exception:** when the active terminal is Git Bash, run commands directly (`npx pnpm run format`) — never use `cmd /c` or `cmd //c` there.
- Do not use system text emojis in UI components or code; use theme-aware `<DoodleIcon>` vector SVGs (`DoodleIcon.astro` / `DoodleIcon.tsx`) instead (see [DoodleIconSystem.md](../design/DoodleIconSystem.md)).
- Never leak secrets or personal identifying info in logs, prompts, or commits.
