# Tech Stack

<callout icon="♞">**Status:** Active · **Owner:** Gen · **Last Reviewed:** 2026-07-21</callout>

The core technology dependencies, choices, and alternatives.

## Adopted Stack

- **Framework**: Astro (v7.1.1) - Excellent content routing and performance.
- **Styling**: Tailwind CSS (v4) - CSS-first theme configuration via `@theme`.
- **Fonts**: Fontsource (`Inter Variable`, `Manrope Variable`, `Fraunces Variable`, `JetBrains Mono`, `Gochi Hand`) — three-voice type system detailed in [DesignSystem.md](../design/DesignSystem.md).
- **Icons**: `@lucide/astro` (v1.24.0) - SVG icon library.
- **Editor/CMS**: Keystatic (Local/Git mode) - Visual editor without database overhead.
- **Chat State**: Cloudflare KV - Cross-isolate shared message storage for the live chat feature (`CHAT_KV`, HTTP polling).
- **Database**: Cloudflare D1 (`DB`) - Serverless SQLite database for the anonymous shared chess game feature (`9100d65e-3df5-4256-9c14-3f93831c04fa`).
- **Contact Delivery**: Cloudflare Email Routing (`CONTACT_EMAIL` `send_email` binding) - Serverless contact form delivery routed directly to a verified destination inbox, with KV inbox archival (`contact:inbox:*`) and per-IP rate limiting. No third-party form services.
- **Language**: TypeScript (strict mode).
- **Package Manager**: pnpm.
- **Linting/Formatting**: ESLint + Prettier.
- **Testing**: Playwright (`@playwright/test` v1.50+) & Axe Core (`@axe-core/playwright` v4.10+) for automated accessibility audits.
- **CI/CD**: GitHub Actions.
- **Hosting**: Cloudflare Pages.

## Version Policy

- Lock dependencies in `pnpm-lock.yaml`.
- Upgrade minor versions monthly.
- Apply patches automatically on successful CI.
