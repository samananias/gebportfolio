# Portfolio Architecture & Engineering Handbook

<callout icon="♞">**Status:** Official source of truth · **Version:** 1.0.0 · **Last reviewed:** 2026-07-18 · **Owner:** Gen

This handbook governs architecture, content, design, delivery, and AI-assisted development. When implementation and this document disagree, either fix the implementation or record and approve an architecture decision before updating this handbook.</callout>

## How to use this handbook

- Read **Vision**, **Non-negotiables**, **Folder Architecture**, and **AI Collaboration Guide** before changing the project.
- Prefer the simplest solution that satisfies a demonstrated requirement.
- Treat versions below as capability recommendations, not permanent pins. Pin dependencies in the lockfile and upgrade deliberately.
- Record durable architectural changes as ADRs in `docs/decisions/`.
- Review this handbook quarterly and after every major release.

---

## 1. Project vision

### Mission

Build a fast, elegant, content-first personal portfolio that demonstrates judgment—not just output. It should make work easy to discover, understand, and trust while remaining inexpensive to operate and straightforward for a developer or AI agent to extend years later.

### Overall philosophy

1. **Content is data, presentation is code.** Biographical text, projects, posts, achievements, experience, skills, links, and SEO copy belong in validated content files or a CMS—not inside components.
2. **Static by default, dynamic by exception.** Pre-render public content. Add server execution only when a feature genuinely requires it.
3. **Progressive enhancement.** The core experience must work with minimal JavaScript; interactivity enriches rather than unlocks content.
4. **Boring foundations, expressive surface.** Architecture should be predictable. Visual personality should live in tokens, typography, composition, and restrained motion.
5. **One canonical implementation.** Avoid parallel component systems, duplicate schemas, multiple styling strategies, or overlapping utilities.
6. **Accessibility and performance are requirements.** They are acceptance criteria, not later polish.
7. **Reversible decisions first.** Prefer portable content, standards-based APIs, and replaceable providers.

### Long-term goals

- Support hundreds of projects, posts, notes, achievements, and experiments without redesigning the foundation.
- Let the owner edit nearly all public content in a visual CMS or plain text files.
- Maintain excellent Core Web Vitals and WCAG 2.2 AA conformance.
- Preserve content history in Git and make migrations scriptable.
- Support future search, newsletter, multilingual content, private drafts, comments, authentication, and interactive experiments without forcing them into the initial build.
- Keep onboarding under one hour for a capable developer or AI agent.

### Design principles

- **Strategic clarity:** every screen has one primary purpose and action.
- **Precision:** consistent alignment, rhythm, type scales, states, and metadata.
- **Quiet confidence:** strong contrast and hierarchy; no decorative noise or exaggerated claims.
- **Evidence over adjectives:** explain constraints, decisions, role, process, and measurable outcomes.
- **Subtle chess influence:** use balanced light/dark fields, disciplined grids, measured diagonals, and tactical reveal—not literal boards or pieces.
- **Responsive by composition:** adapt hierarchy and density, not merely dimensions.

### Development principles

- TypeScript strict mode; schema-validate every external boundary.
- Server/static components first; hydrate only interactive islands.
- Co-locate feature-specific code; centralize only genuine primitives.
- Composition over configuration-heavy “universal” components.
- No dependency without a documented problem, owner, and exit path.
- Tests should protect behavior and contracts, not implementation details.
- Optimize from measurements, not intuition.

### Non-negotiables: what must not change casually

- Content and presentation remain separated.
- Public content remains portable and stored in open, versionable formats.
- Semantic design tokens are the only source of visual values.
- Accessibility baseline is WCAG 2.2 AA.
- TypeScript strict mode, automated checks, and reviewed dependency updates remain enabled.
- URLs for published content are stable; removals use redirects.
- The source of truth, ADRs, schemas, and changelog stay synchronized with architecture.
- The default page ships minimal client JavaScript.
- Secrets never enter source control, content files, browser bundles, logs, or AI prompts.

### Allowed to evolve

Framework major versions, hosting providers, CMS UI, analytics provider, animation implementation, component internals, fonts, route additions, database/backend choices, and build tooling may evolve through an ADR and migration plan. Brand tokens may evolve while preserving semantic roles and accessible contrast.

---

## 2. Recommended technology stack

### Architecture decision summary

**Recommended baseline:** Astro + TypeScript + Tailwind CSS + Astro Content Collections + Keystatic + selectively hydrated React islands. Deploy static output to Cloudflare Workers/Pages; add server features only when required.

Astro is designed for content-driven sites and sends no client JavaScript unless a component opts into hydration. Its content collections provide typed schemas, and its image components generate responsive optimized assets. Keystatic adds a CMS interface while keeping Markdown/YAML/JSON in the repository. [Astro](https://astro.build/) · [Astro images](https://docs.astro.build/en/guides/images/) · [Keystatic with Astro](https://docs.astro.build/en/guides/cms/keystatic/)

### Technology decisions

| Area                 | Recommendation and why                                                                                                                                                                                                           | Pros                                                                                                                  | Costs / cons                                                                                                                       | Alternatives and when to choose them                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend             | **Astro, current stable major**, with strict TypeScript. Best match for a mostly static, SEO-heavy portfolio with optional islands.                                                                                              | Minimal JS; excellent content routing; framework-agnostic islands; SSG/SSR flexibility; strong image/content tooling. | Smaller hiring pool than React-only stacks; cross-framework freedom can create inconsistency; some integrations trail Next.js.     | **Next.js** for an app-like authenticated product; **Nuxt** if Vue is the team standard; **SvelteKit** for highly interactive bespoke UI.                                        |
| Interactive UI       | **React only for islands** that need state, complex motion, forms, or browser APIs.                                                                                                                                              | Mature ecosystem; easy testing; isolates complexity.                                                                  | Two component syntaxes; over-hydration risk.                                                                                       | Use Astro components/CSS when no client state exists; choose one alternative renderer only through ADR.                                                                          |
| Styling              | **Tailwind CSS with CSS-first semantic tokens** in `src/styles/tokens.css`; component variants via `class-variance-authority` only when variants are real.                                                                       | Fast iteration; constrained vocabulary; dead-code elimination; theme values available as CSS variables.               | Long class lists; misuse creates copy/paste styling; upgrades may change conventions.                                              | CSS Modules for teams preferring local styles; vanilla-extract for compile-time typed CSS; plain CSS for a smaller project. Do not mix systems per feature.                      |
| Animation            | **CSS transitions/keyframes first; Motion for React only for orchestrated islands.**                                                                                                                                             | Small default cost; Motion handles gestures/layout/reduced motion well.                                               | Motion adds JS and React hydration; animation can harm usability.                                                                  | Web Animations API for isolated imperative cases; GSAP only for a justified, animation-led experience.                                                                           |
| Component library    | **No full visual library initially.** Build project-owned primitives; optionally use unstyled Radix primitives for difficult accessible widgets.                                                                                 | Distinctive design; low dependency surface; full token control.                                                       | More initial accessibility/design work.                                                                                            | shadcn/ui as a source of owned code when many controls appear; Ark UI or React Aria for complex application widgets. Never install a library for buttons/cards alone.            |
| CMS                  | **Keystatic, GitHub storage**, with local mode for development. Content remains in Git.                                                                                                                                          | Visual editor; typed schema; Markdown/YAML/JSON; reviewable history; no content database; AI-readable.                | Git-based publishing workflow; repository access required; weaker editorial workflows/scheduling/localization than enterprise CMS. | **Sanity** when editorial collaboration, live preview, localization, and scheduling become primary; **Storyblok** for visual editing; **Decap CMS** for a simpler open Git CMS.  |
| Markdown             | **MDX or Markdoc only for long-form body content; YAML frontmatter validated by Astro schemas.** Prefer plain Markdown unless embedded components are needed.                                                                    | Portable, diffable, durable, fast, AI-friendly.                                                                       | Rich layouts can tempt unsafe arbitrary components; media handling needs conventions.                                              | Markdoc for tightly controlled nodes; MDX for trusted developer-authored interactive posts. Never allow arbitrary CMS-authored JavaScript.                                       |
| Database             | **None at launch.** Static content does not justify operational state.                                                                                                                                                           | Zero migrations, runtime, credentials, or outages.                                                                    | Cannot support user-specific or frequently changing data.                                                                          | Add managed Postgres (Neon/Supabase) with Drizzle only for concrete features such as accounts, saved items, or comments. Cloudflare D1 is reasonable for edge-local simple data. |
| Backend              | **None at launch; provider APIs or small Astro server endpoints/Cloudflare Workers when needed.**                                                                                                                                | Minimal attack surface and cost.                                                                                      | Third-party dependency for forms/email; split debugging.                                                                           | A dedicated service only after domain logic, queues, or multiple clients justify it.                                                                                             |
| Authentication       | **Deferred.** If needed, use Better Auth or the hosting platform’s compatible managed identity solution behind server-rendered routes.                                                                                           | Avoids premature security surface; future solution remains replaceable.                                               | Later integration work.                                                                                                            | Clerk for fastest managed UX; Auth0 for enterprise federation; Supabase Auth when already using Supabase. Never build passwords/session crypto directly.                         |
| Images               | **Astro `<Image>`/`<Picture>` for local assets; explicit width/height, `srcset`, AVIF/WebP, descriptive alt text.** Store originals near content or in `src/assets`; public passthrough only when transformation is unnecessary. | Build-time optimization; no layout shift; responsive formats.                                                         | Build time and repository growth for large libraries.                                                                              | Cloudinary/ImageKit when transformations, remote uploads, or large media libraries justify a DAM.                                                                                |
| SEO                  | **Astro metadata component + sitemap + robots + canonical URLs + Open Graph/Twitter + JSON-LD + RSS.** Generate metadata from schemas.                                                                                           | Consistency, crawlability, rich sharing, automation.                                                                  | Structured data requires maintenance and validation.                                                                               | `astro-seo` is optional; native components keep ownership clearer.                                                                                                               |
| Deployment           | **GitHub Actions for checks; Cloudflare Workers static assets for production and preview deploys.**                                                                                                                              | Global edge, static speed, easy future server functions; Cloudflare recommends Workers for new Astro projects.        | Platform runtime differences; vendor-specific bindings if overused.                                                                | Vercel for excellent previews and Next.js alignment; Netlify for mature forms/editor workflows; static object hosting for maximum simplicity.                                    |
| Hosting              | **Cloudflare DNS/CDN + Workers deployment**, with a portable static build.                                                                                                                                                       | Fast global delivery, TLS, caching, security, low operational cost.                                                   | Dashboard and edge-runtime learning curve.                                                                                         | Keep deployment adapter isolated so moving hosts requires no content rewrite.                                                                                                    |
| Analytics            | **Cloudflare Web Analytics initially**, loaded with consent/privacy policy appropriate to jurisdiction.                                                                                                                          | Lightweight, privacy-oriented, infrastructure-aligned.                                                                | Less product/event depth than dedicated analytics.                                                                                 | Plausible or Fathom for simple product analytics; PostHog when funnels, experiments, and events become important; GA4 only for a demonstrated marketing requirement.             |
| Monitoring           | **Cloudflare observability + Sentry for runtime errors only when dynamic JS/server routes exist; Lighthouse CI for lab regressions.**                                                                                            | Covers field errors and performance budgets without excessive tooling.                                                | Sentry adds SDK/configuration; synthetic scores fluctuate.                                                                         | Checkly for uptime/API probes; SpeedCurve for advanced performance governance.                                                                                                   |
| Unit/component tests | **Vitest + Testing Library** for utilities, schemas, and interactive components.                                                                                                                                                 | Fast, Vite-native, behavior-oriented.                                                                                 | Browser differences need E2E coverage.                                                                                             | Node test runner for low-dependency utilities.                                                                                                                                   |
| E2E/accessibility    | **Playwright + `@axe-core/playwright`** for critical routes, keyboard flows, forms, theme, and automated accessibility checks. Manual screen-reader and keyboard checks remain required.                                         | Real browsers; reliable traces; visual and a11y support.                                                              | Slower CI; snapshots require discipline.                                                                                           | Cypress if the team already standardizes on it. [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)                                            |
| Linting              | **ESLint flat config** with TypeScript, Astro, accessibility, and import-boundary rules.                                                                                                                                         | Catches correctness and architecture drift.                                                                           | Config maintenance; overlapping formatting rules if misconfigured.                                                                 | Biome can replace ESLint/Prettier after confirming Astro/plugin coverage.                                                                                                        |
| Formatting           | **Prettier + Astro and Tailwind plugins.**                                                                                                                                                                                       | Deterministic, ubiquitous, editor-friendly.                                                                           | Another tool and occasional opinion conflicts.                                                                                     | Biome when one-tool speed outweighs ecosystem breadth.                                                                                                                           |
| CI/CD                | **GitHub Actions:** install, typecheck, lint, format-check, unit, build, E2E/a11y, Lighthouse budget; deploy previews before production.                                                                                         | Reproducible quality gate; familiar audit trail.                                                                      | CI minutes and maintenance.                                                                                                        | Native host pipelines for deploy only; keep quality scripts runnable locally.                                                                                                    |
| Package manager      | **pnpm with Corepack and a committed lockfile.**                                                                                                                                                                                 | Fast, disk-efficient, strict dependency layout, workspace-ready.                                                      | Some scripts assume npm; contributors need Corepack/pnpm.                                                                          | npm for maximum universality; Bun only after compatibility is proven.                                                                                                            |
| Dependency updates   | **Renovate**, grouped monthly for non-security updates and immediate security PRs.                                                                                                                                               | Controlled upgrades, changelogs, automerge for safe patches.                                                          | Bot noise without grouping.                                                                                                        | Dependabot for simpler GitHub-native operation.                                                                                                                                  |

### Version policy

- Pin the runtime and package manager in `package.json`; commit `pnpm-lock.yaml`.
- Use exact versions for fragile build tooling; allow compatible ranges only when lockfile protection is sufficient.
- Upgrade patches automatically after green CI; minors monthly; majors in dedicated PRs with migration notes.
- Support current and previous major evergreen browsers unless analytics justify a different matrix.

---

## 3. Content management strategy

### Comparison

| Approach        | Advantages                                                                     | Disadvantages                                                                   | Maintenance  | AI friendliness                             | Scale / performance                                                         |
| --------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------ | ------------------------------------------- | --------------------------------------------------------------------------- |
| Markdown        | Human-readable, diffable, portable, ideal for long-form prose.                 | Weak for deeply structured data; frontmatter conventions matter.                | Low.         | Excellent.                                  | Excellent static performance; hundreds/thousands of entries are practical.  |
| JSON            | Strict, universally parseable, good for machine-generated structured data.     | No comments; noisy prose diffs; awkward manual editing.                         | Low.         | Excellent structurally.                     | Excellent at build time; split files to avoid giant blobs.                  |
| YAML            | Concise structured configuration and frontmatter.                              | Indentation and implicit type pitfalls; poor for long prose.                    | Low–medium.  | Good with schemas.                          | Excellent at build time.                                                    |
| Headless CMS    | Best editor UX, APIs, previews, workflows, scheduling, localization.           | Vendor cost/lock-in, network/build dependency, schema duplication risk.         | Medium–high. | Good via APIs, less transparent than files. | Excellent when cached; requires invalidation and outage planning.           |
| Local CMS       | Friendly UI over local files; no hosted dependency.                            | Editing requires local environment; unsuitable for nontechnical remote editing. | Low.         | Excellent.                                  | Same as file-based content.                                                 |
| Database-driven | Real-time queries, user state, relationships, high write volume.               | Runtime, migrations, backups, security, caching, admin UI.                      | High.        | Medium; schema/context must be exposed.     | High scale potential but unnecessary latency/complexity for static content. |
| Git-based CMS   | Visual editing plus portable files, review history, rollback, preview deploys. | GitHub/auth workflow; large media and concurrent editorial work can be awkward. | Low–medium.  | Excellent.                                  | Excellent static output; rebuild required after publish.                    |

### Decision: Git-based hybrid

Use **Keystatic over schema-validated Markdown/MDX and YAML/JSON**:

- Markdown/MDX: blog, research, project case studies, experiment notes, long About/resume sections.
- YAML/JSON generated by Keystatic: navigation, social links, homepage composition, skills taxonomy, site settings, reusable calls to action.
- Image files: colocated with entries when ownership is local; use a DAM only after repository size or editorial uploads become a problem.
- Database: prohibited for editorial content until a measured requirement demands runtime writes.

### Canonical content collections

| Collection/singleton   | Required fields                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `site` singleton       | name, title template, description, canonical URL, locale, social links, default image, contact settings       |
| `navigation` singleton | ordered links, labels, visibility, external flag                                                              |
| `projects`             | title, slug, summary, role, dates, status, featured, stack refs, tags, hero image, links, outcomes, body, SEO |
| `posts`                | title, slug, excerpt, published/updated dates, draft, tags, cover, body, SEO                                  |
| `experience`           | organization, role, start/end, location, summary, achievements, skills, order                                 |
| `skills`               | name, category, proficiency evidence, years optional, icon key, order                                         |
| `achievements`         | title, issuer, date, evidence URL, description, featured                                                      |
| `research`             | title, abstract, status, date, collaborators, publication/DOI links, body                                     |
| `experiments`          | title, slug, status, warning, technologies, demo/source links, body                                           |
| `pages`                | controlled editable copy for About, Contact, and landing-page sections                                        |

### Content rules

- Slugs are lowercase kebab-case and immutable after publication unless a redirect is added.
- Every collection has a single schema in `src/content.config.ts`; CMS fields mirror it.
- Draft entries never appear in production, feeds, sitemap, search index, or related content.
- Dates use ISO 8601. Store timezone when time matters.
- All images require alt text; decorative images use an explicit empty alt.
- Content references use stable IDs/slugs, never duplicated display strings.
- Validate links, duplicate slugs, required SEO fields, and orphaned assets in CI.
- Keep presentation instructions out of content. Allow only approved rich-content components.

### Migration trigger to a hosted CMS

Consider Sanity or another headless CMS only when two or more are true: multiple nontechnical editors, scheduled publishing, localization workflows, simultaneous editing, asset-library scale, or content updates that cannot wait for builds. Export/migration scripts and URL compatibility are mandatory.

---

## 4. Project folder architecture

```
portfolio/
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
├── docs/
│   ├── README.md
│   ├── Architecture.md
│   ├── TechStack.md
│   ├── DesignSystem.md
│   ├── FolderStructure.md
│   ├── CodingStandards.md
│   ├── Components.md
│   ├── ContentManagement.md
│   ├── Deployment.md
│   ├── AI-Guidelines.md
│   ├── Roadmap.md
│   ├── Changelog.md
│   ├── Troubleshooting.md
│   └── decisions/
├── public/
│   ├── favicon/
│   ├── fonts/                 # only self-hosted static fonts
│   ├── robots.txt
│   └── static/                # passthrough files only
├── scripts/
│   ├── validate-content.ts
│   ├── check-links.ts
│   └── generate-assets.ts
├── src/
│   ├── assets/                # processed images/SVGs imported by code
│   ├── components/
│   │   ├── primitives/        # Button, Link, Container, Stack, Icon
│   │   ├── content/           # Prose, CodeBlock, Figure, metadata views
│   │   ├── navigation/        # Header, Nav, Footer, Breadcrumbs
│   │   ├── feedback/          # Alert, EmptyState, ErrorBoundary
│   │   └── forms/             # Field, Input, Textarea, FormStatus
│   ├── config/                # typed runtime/build configuration
│   ├── content/
│   │   ├── projects/
│   │   ├── posts/
│   │   ├── research/
│   │   ├── experiments/
│   │   └── data/              # structured records/singletons
│   ├── features/
│   │   ├── projects/
│   │   ├── blog/
│   │   ├── search/
│   │   └── contact/
│   ├── layouts/               # BaseLayout, ArticleLayout, CaseStudyLayout
│   ├── lib/                   # provider/framework adapters and core helpers
│   ├── pages/                 # route entry points only
│   ├── sections/              # page-level compositions: Hero, FeaturedWork
│   ├── services/              # email, analytics, search; interface-first adapters
│   ├── styles/                # tokens, global, prose, utilities
│   ├── types/                 # shared domain types only
│   ├── utils/                 # pure generic functions
│   └── content.config.ts      # canonical content schemas
├── tests/
│   ├── e2e/
│   ├── accessibility/
│   ├── fixtures/
│   └── visual/
├── astro.config.ts
├── eslint.config.js
├── keystatic.config.ts
├── package.json
├── playwright.config.ts
├── tsconfig.json
└── vitest.config.ts
```

### Folder responsibilities

- `pages/`: URLs and route-level data orchestration. No reusable business UI.
- `layouts/`: document shell, metadata slots, and common page structure.
- `sections/`: large compositions reused across pages; consume normalized props.
- `components/primitives/`: domain-agnostic accessible building blocks.
- `features/`: cohesive domain modules. Each may contain `components`, `lib`, `types`, and tests; code stays private unless exported through `index.ts`.
- `content/`: editable portfolio records; no UI code.
- `config/`: validated environment/site settings, never secrets committed to Git.
- `services/`: side-effectful boundaries and provider adapters.
- `lib/`: integration glue, content queries, SEO builders, date/image helpers tied to project behavior.
- `utils/`: small pure functions with no framework or domain dependency.
- `assets/`: imported build-pipeline assets; `public/` is only for files that must preserve paths.
- `styles/`: global reset, semantic tokens, prose rules. Component-specific styles stay with the component if needed.
- `types/`: only truly shared types; infer types from schemas whenever possible.
- `constants/`: do not create by default. Put a constant near its owner; create this folder only for genuinely cross-cutting immutable values.
- `data/`: use `content/data/`; do not create a second competing data source.
- `hooks/`: place hooks inside their feature. Create a root hooks folder only after at least three cross-feature hooks exist.
- `tests/`: cross-route E2E/a11y/visual tests; unit tests are colocated as `*.test.ts`.
- `scripts/`: repeatable maintenance automation, with dry-run support for destructive operations.
- `docs/`: human and AI operating knowledge, not generated API output.

### Naming and imports

- Files/components: `PascalCase.astro` or `PascalCase.tsx`; hooks `useThing.ts`; utilities `camelCase.ts`; content and routes `kebab-case`.
- Types/interfaces: `PascalCase`; constants: `UPPER_SNAKE_CASE` only for immutable global constants; booleans begin `is/has/can/should`.
- Use `@/` aliases for cross-feature imports and relative imports within the same module.
- Import order: platform/framework, third-party, project alias, relative, type-only, styles.
- Features may import primitives, config, lib, services, and types. Primitives must never import features. Content must never import UI.
- Avoid barrel exports globally. A feature may expose a deliberate public API through one `index.ts`.
- One primary component per file. Keep tiny private subcomponents beside their owner.
- Split a file when responsibilities diverge, not when it crosses an arbitrary line count.

---

## 5. Design system

### Token architecture

Use three layers: **raw palette → semantic tokens → component tokens**. Components may reference only semantic/component tokens, never raw hex values. Define tokens once as CSS custom properties and expose them through Tailwind theme variables.

### Typography

- **Display/headings:** `Manrope` variable or a similarly precise geometric sans, self-hosted. Fallback: `Inter, ui-sans-serif, system-ui`.
- **Body/UI:** `Inter` variable, self-hosted; prioritize legibility and broad language support.
- **Code/technical metadata:** `JetBrains Mono`, loaded only on pages that use it.
- Fluid scale using `clamp()`:
  - Display: 48–80px / 0.98–1.05 line-height / -0.03em.
  - H1: 40–64px; H2: 32–48px; H3: 24–32px; H4: 20–24px.
  - Body large: 18–20px; body: 16–18px; small: 14px; caption: 12px.
- Body line length: 60–75 characters; article measure approximately 68ch.
- Never use font weight alone to communicate state.

### Spacing

Base unit: 4px. Tokens: `0, 1(4), 2(8), 3(12), 4(16), 5(20), 6(24), 8(32), 10(40), 12(48), 16(64), 20(80), 24(96), 32(128)`. Use 8px rhythm for layout and 4px increments for compact controls. Section spacing is fluid: 64–128px.

### Grid and containers

- 4 columns on small screens, 8 on tablets, 12 on desktop.
- Max content width: 1200px; wide media: 1440px; prose: 68ch.
- Gutters: 16px mobile, 24px tablet, 32px desktop.
- Use asymmetric spans to imply strategy, but preserve alignment and reading order.
- A faint two-tone field or alternating surface may suggest a board; never render a literal checkerboard behind content.

### Radius, borders, and shadows

- Radius: `sm 4`, `md 8`, `lg 12`, `xl 20`, `pill 9999` px.
- Buttons/inputs: 8px; cards: 12px; feature surfaces: 20px.
- Borders: 1px semantic border; 2px focus ring with 2px offset.
- Shadows are cool-neutral and restrained: `sm` for controls, `md` for hover/elevation, `lg` only for dialogs. Dark mode relies more on borders and tonal surfaces than large shadows.

### Motion

- Durations: instant 0ms, fast 120ms, normal 200ms, deliberate 320ms, reveal 480ms maximum.
- Easing: standard `cubic-bezier(.2,0,0,1)`; enter `cubic-bezier(0,0,.2,1)`; exit `cubic-bezier(.4,0,1,1)`.
- Animate only opacity and transform when possible. Never use `transition: all`.
- Hover movement: 1–3px maximum. Avoid continuous motion, scroll hijacking, cursor replacement, and decorative parallax.
- Honor `prefers-reduced-motion`; remove transforms/parallax/autoplay and retain instant state changes. [Motion accessibility](https://motion.dev/docs/react-accessibility)

### Icons

Use one library—Lucide—at 16, 20, or 24px, with consistent stroke width. Every icon button has an accessible name. Decorative icons are hidden from assistive technology. Brand icons may use Simple Icons or official SVGs; do not distort logos.

### Buttons

- Variants: `primary`, `secondary`, `ghost`, `destructive`, `text`.
- Sizes: `sm` 36px, `md` 44px, `lg` 48px minimum height.
- States: default, hover, active, focus-visible, disabled, loading.
- Preserve label width during loading and expose status text. Use links for navigation and buttons for actions.

### Cards

Use a shared structural primitive with slots for media, eyebrow, title, summary, metadata, actions. Domain cards compose it rather than adding every domain prop to one mega-component. Entire-card links must preserve valid semantics and visible focus. Hover enhancements cannot hide required information.

### Accessibility baseline

- WCAG 2.2 AA; text contrast ≥4.5:1, large text ≥3:1, UI boundaries/focus ≥3:1.
- Semantic landmarks and one logical H1 per page.
- Full keyboard support, visible focus, skip link, logical tab/DOM order.
- Touch targets at least 44×44 CSS px where practical.
- Forms have persistent labels, instructions, field-level errors, summary, and live status.
- Dialogs trap/restore focus and close with Escape; no content-only tooltips on touch.
- Test zoom at 200%, reflow at 320 CSS px, Windows High Contrast, reduced motion, keyboard, and at least one screen reader/browser pair.

### Breakpoints

Content-led defaults: `sm 480`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536` px. Mobile-first. Add a breakpoint only when content visibly fails, not for a device brand.

### Dark mode

- Modes: `light`, `dark`, `system`; system is default until the visitor explicitly chooses.
- Set theme before paint with a tiny inline script; persist preference in local storage.
- Theme semantic tokens, not individual components.
- Use `color-scheme`, theme-color metadata, and accessible syntax highlighting in both modes.
- Dark surfaces are not pure black; reduce shadow and avoid overly bright white text.

---

## 6. Theme: strategic modernism

### Raw palette roles

| Source color | Role                            | Rationale                                                             |
| ------------ | ------------------------------- | --------------------------------------------------------------------- |
| `#261e1a`    | Ink / deep background           | Warm near-black communicates authority and avoids sterile pure black. |
| `#4b648a`    | Strategic blue / primary action | Calm, intelligent, trustworthy; strongest interactive identity.       |
| `#d0dff4`    | Pale blue / light field         | Clear, optimistic counterweight; suitable for quiet highlights.       |
| `#574f50`    | Warm slate / secondary ink      | Adds human warmth and editorial sophistication.                       |
| `#9497a0`    | Steel / muted content           | Neutral bridge for metadata, dividers, and disabled states.           |

The five supplied colors are brand anchors, not a complete accessible system. Generate tested tints/shades for states and semantic feedback. Green, amber, and red may be added solely for success, warning, and error; do not force brand blue to communicate every meaning.

### Light semantic tokens

- `background`: warm off-white `#f8f7f5`.
- `surface`: `#ffffff`; `surface-subtle`: light tint derived from `#d0dff4`.
- `text`: `#261e1a`; `text-muted`: a darkened derivative of `#574f50` (do not use `#9497a0` for normal small text on white without contrast verification).
- `primary`: `#4b648a`; `primary-hover`: darker blue; `primary-active`: darkest blue.
- `accent`: `#d0dff4` for highlights, selected backgrounds, and visual fields—not primary text.
- `border`: a light mixed derivative of `#9497a0`.
- `focus`: saturated blue derivative with sufficient 3:1 contrast.

### Dark semantic tokens

- `background`: `#261e1a`.
- `surface`: lifted warm charcoal derived from `#574f50` and `#261e1a`.
- `surface-subtle`: cool charcoal with a trace of `#4b648a`.
- `text`: near-white tinted with `#d0dff4`; `text-muted`: light steel derivative.
- `primary`: a lightened `#d0dff4`/`#4b648a` blue; dark label text.
- `accent`: restrained steel blue.
- `border`: translucent/light derivative of `#9497a0`.

### States

- Hover: change tone and border; optional 1–2px lift. Never rely on opacity alone.
- Active: darker/denser tone and no lift; clearly distinct from hover.
- Selected: subtle accent field + strong border/icon/text.
- Disabled: muted foreground and surface, no shadow, `not-allowed` only for controls; preserve readable contrast and expose `disabled`/`aria-disabled` correctly.
- Success: deep accessible green; warning: amber/brown; error: deep red; info: strategic blue. Pair every color with icon/text.

### Visual motifs

- Use alternating light/dark editorial fields, 12-column tactical layouts, fine rules, coordinate-like metadata labels, and occasional clipped corners/diagonal separators.
- Use chess vocabulary only in internal naming if useful; public copy should remain natural.
- Prohibited: chess-piece mascots, board backgrounds, move notation as decoration, gamified loading, or novelty cursors.

---

## 7. Website architecture

### Global information architecture

Primary navigation: **Work, About, Writing, Experience, Contact**. Secondary/overflow: **Research, Experiments, Resume**. Skills appear as evidence throughout and may have an index page if content is substantial.

| Page                       | Purpose and core components                                                                                                                              | Data source                                          | Scale strategy                                                                      | SEO                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Home `/`                   | Positioning, selected work, credibility, latest writing, concise experience, CTA. `Hero`, `FeaturedProjects`, `ProofStrip`, `LatestPosts`, `ContactCTA`. | Site singleton + featured collection queries.        | Curated slots reference entries; never duplicate project copy.                      | Person/WebSite JSON-LD, strong title/description, canonical, share image.                            |
| About `/about`             | Narrative, principles, capabilities, current focus, personal context.                                                                                    | Editable page + skills/achievements refs.            | Section schema supports reorder/visibility; keep one coherent story.                | Person JSON-LD; descriptive query intent; image alt/caption.                                         |
| Projects `/projects`       | Searchable/filterable evidence of work.                                                                                                                  | Projects collection.                                 | Build-time tags; paginate after ~24 items; optional client island for filters.      | CollectionPage/BreadcrumbList; index canonical filter-free page; avoid indexing thin query variants. |
| Project `/projects/[slug]` | Case study: context, constraints, role, process, decisions, outcomes, gallery, related work.                                                             | Project entry.                                       | Template slots and approved rich blocks; stable slug/redirects.                     | Article/CreativeWork JSON-LD, per-entry OG image, dates, canonical.                                  |
| Experience `/experience`   | Career timeline with impact and responsibilities.                                                                                                        | Experience collection.                               | Ordered records; organization pages only if enough depth.                           | ProfilePage; semantic dates/headings; avoid repetitive keyword stuffing.                             |
| Skills `/skills`           | Capability map backed by evidence.                                                                                                                       | Skills + project relationships.                      | Taxonomy categories and evidence links; no arbitrary percentage bars.               | ItemList; descriptive explanations and related projects.                                             |
| Blog `/blog`               | Writing index, tags, RSS, featured/latest.                                                                                                               | Posts collection.                                    | Pagination, tag routes, optional static search index.                               | Blog JSON-LD, RSS autodiscovery, canonical pagination, noindex empty tags.                           |
| Post `/blog/[slug]`        | Readable article with TOC, author/date, code, references, related posts.                                                                                 | Post entry.                                          | MDX/Markdoc approved components; reading-time derived at build.                     | BlogPosting JSON-LD, OG, canonical, updated date, sitemap/RSS.                                       |
| Research `/research`       | Formal notes, publications, investigations, references.                                                                                                  | Research collection.                                 | Filter status/topic/year; DOI/citation fields.                                      | ScholarlyArticle where accurate; citation metadata; never overclaim publication status.              |
| Contact `/contact`         | Low-friction contact channels and optional form.                                                                                                         | Page singleton + environment-configured endpoint.    | Provider adapter; spam protection added only when needed.                           | ContactPage; protect email from unnecessary exposure; clear response expectations.                   |
| Experiments `/experiments` | Prototypes and technical explorations with caveats.                                                                                                      | Experiments collection.                              | Sandboxed embeds or separate subdomains for heavy demos.                            | `noindex` unfinished experiments; unique metadata for stable public work.                            |
| Resume `/resume`           | Accessible HTML resume and explicit PDF download.                                                                                                        | Experience/skills/education/achievement collections. | Generate PDF from canonical data where reliable; never maintain conflicting copies. | ProfilePage; HTML indexable; PDF linked with stable filename.                                        |
| 404                        | Recover with search/navigation and featured destinations.                                                                                                | Site config + recent/featured queries.               | No CMS dependency needed.                                                           | Correct 404 status, `noindex`, no redirect to home.                                                  |

### Cross-cutting architecture

- Generate sitemap, RSS, social images, and static search index at build time.
- Use breadcrumbs for nested content and preserve stable URLs.
- Related content is deterministic by tags/relationships; avoid opaque recommendation services.
- Contact form uses honeypot, rate limit, server-side validation, CSRF protection where applicable, and privacy disclosure.
- Experiments that significantly increase JS or security risk deploy independently and link back to the portfolio.

---

## 8. Component architecture

### Component contract

Every public component must have: a single responsibility, typed props, semantic markup, documented variants, keyboard/focus behavior when interactive, theme/reduced-motion support, and tests proportional to risk. Accept `class`/`className` only when controlled composition requires it; do not expose internal DOM details casually.

### Layers

1. **Primitives:** Button, Link, Icon, Container, Stack, Cluster, Grid, Surface, Text, Heading.
2. **Patterns:** Card, BadgeList, Metadata, Pagination, FilterBar, Timeline, Dialog, FormField.
3. **Domain components:** ProjectCard, PostCard, SkillEvidence, ExperienceItem.
4. **Sections:** Hero, FeaturedWork, LatestWriting, ExperiencePreview.
5. **Pages:** route-specific assembly and data loading.

Dependencies flow downward only. A ProjectCard can compose Card and Metadata; Card cannot know about projects.

### Key guidelines

- **Button:** render a button for actions and an anchor for navigation; variant/size/loading/icon slots; no polymorphism that permits invalid semantics.
- **Card:** structural slots, not dozens of booleans. Domain wrappers map data to slots.
- **Hero:** accept semantic content and action slots; visual variants are tokenized. No route/data fetching inside.
- **Navbar:** data-driven links; server-rendered; only mobile disclosure and theme control hydrate. Correct current-page state and focus handling.
- **Footer:** site config, navigation, social links, copyright; no duplicated hardcoded links.
- **Timeline:** semantic ordered list; visual line decorative; dates remain readable without CSS.
- **Project/Post/Skill cards:** accept normalized view models, not raw CMS entries. Show consistent metadata and explicit link purpose.
- **Modal/Dialog:** use native `<dialog>` where requirements permit or a proven accessible primitive; focus trap/restore, Escape, labelled title, scroll lock, no essential route content.
- **Forms:** schema shared between client enhancement and server validation; progressive enhancement; explicit success/failure; never log private message content.
- **Animation:** wrap reusable reveal/transition behavior; default to no animation until visible; do not hydrate a whole page for entrance effects.
- **Icons:** central Icon adapter maps approved names to one library and prevents arbitrary bundled imports.

### State management

- URL state for filters, search, sort, pagination, and shareable views.
- Local component state for disclosure, dialog, and ephemeral UI.
- Server/content state at build/request boundaries.
- Context only for stable cross-tree concerns such as theme.
- Do not add a global state library until multiple islands require synchronized mutable state; prefer nanostores for Astro if that threshold is reached.

---

## 9. Development rules

### Code and architecture

- Search existing code and docs before creating files or dependencies.
- New domain behavior belongs in a feature; reusable UI begins at the lowest honest layer.
- No circular dependencies, deep imports into feature internals, or catch-all `common/` folders.
- TypeScript: `strict`, no unqualified `any`, prefer `unknown` plus narrowing, discriminated unions for states, exhaustive checks, and schema-derived types.
- Components remain pure where possible. Side effects live in lifecycle boundaries/services.
- Hooks must begin `use`, represent reusable stateful behavior, and never hide unrelated side effects.
- Avoid premature memoization and abstraction. Duplicate twice with clarity; abstract when a stable third use reveals the shared contract.

### Styling

- Use semantic tokens; no raw hex, arbitrary spacing, or unexplained z-index in components.
- Mobile-first; avoid fixed heights for text containers.
- Use logical properties where appropriate and verify long text/localization.
- Component variants use a documented finite API; avoid dynamic class construction Tailwind cannot detect.

### Accessibility and performance

- Accessibility acceptance criteria accompany every interactive feature.
- Performance budgets on a representative mobile profile:
  - LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at the 75th percentile.
  - Initial JS target ≤75KB compressed on content pages; route exceptions require an ADR/budget note.
  - Avoid third-party scripts on the critical path.
- Prefer static HTML, native controls, CSS, responsive images, font subsetting, and lazy noncritical media.
- Measure bundles and field data before optimization; document intentional budget exceptions.

### Error handling and security

- Model expected failures explicitly; show actionable, nontechnical user messages.
- Log structured context without secrets or personal data. Error boundaries protect interactive islands.
- Validate CMS, environment, URL parameters, form payloads, and external API responses.
- Escape/sanitize untrusted rich text; allowlist embed origins and rich-content components.
- Use security headers: CSP, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, and frame restrictions.
- Secrets live in local/host environment stores; commit `.env.example` with names only.

### Documentation

- Public APIs and non-obvious tradeoffs receive concise comments; do not narrate obvious code.
- Every architectural change updates the relevant doc, ADR, and changelog in the same PR.
- README contains only quick start and links; canonical detail lives in `/docs`.

### Git workflow

- Conventional Commits: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`, `revert`.
- Branches: `feat/short-description`, `fix/issue-description`, `docs/topic`, `chore/topic`.
- Keep commits focused and buildable; never mix formatting with behavior changes.
- Use trunk-based development with short-lived branches and squash merge unless commit history has independent value.
- Semantic Versioning: patch for fixes/content/tooling with no contract change; minor for backward-compatible features; major for breaking architecture/content contracts. Public site releases may begin `0.x` until the architecture stabilizes.

### Pull request and review checklist

- Problem and scope are clear; screenshots for visual changes.
- Existing component/content patterns were reused.
- Types, lint, format, tests, build, links, a11y, and budgets pass.
- Keyboard, responsive, light/dark, loading, empty, and error states were checked where relevant.
- No secret, personal data, duplicate content, orphaned asset, or unnecessary dependency.
- Docs/ADR/changelog updated.
- Rollback or migration path stated for high-risk changes.

---

## 10. AI collaboration guide

### Mandatory preflight for every AI agent

1. Read root `README.md`, `AGENTS.md`, this source of truth, relevant `/docs`, and the nearest feature README.
2. Restate the requested outcome and identify affected layers/files.
3. Search for existing components, schemas, utilities, services, tests, and naming patterns.
4. Propose a short plan before any major, cross-cutting, destructive, dependency, schema, or architecture change.
5. Keep the smallest possible diff and preserve unrelated code/content.

### Hard rules

- Never restructure the project unless explicitly requested and approved.
- Never create a second architecture, styling system, content source, state pattern, or utility that overlaps an existing one.
- Reuse existing components before creating new ones; extend only when the existing abstraction remains coherent.
- Follow dependency boundaries and naming conventions before creating files.
- Keep components modular, but avoid speculative abstractions and “god” components.
- Do not add packages until native/platform/existing solutions have been evaluated. State the need, cost, security posture, and exit path.
- Explain architectural decisions before implementation; write an ADR for durable changes.
- Update schemas, tests, docs, examples, changelog, and migrations in the same change.
- Preserve public URLs, content history, accessibility, design tokens, and performance budgets.
- Keep imports clean and use the feature’s public API.
- Do not weaken TypeScript, linting, tests, security, or accessibility to make a build pass.
- Never invent APIs, environment variables, CMS fields, file paths, or library capabilities. Inspect definitions and official docs.
- Never expose secrets, personal data, unpublished content, or private analytics in code, logs, screenshots, or prompts.

### Context-loss prevention

- Maintain `docs/AI-Guidelines.md` as the concise operational contract and root `AGENTS.md` as a map, not a duplicate handbook.
- For multi-step changes, create/update a scoped plan containing goal, assumptions, decisions, touched files, verification, and unresolved questions.
- End each major change with a handoff note: what changed, why, tests run, migrations, risks, and next explicit step.
- Use TODOs only with an issue/reference and reason; no vague `TODO: improve` comments.
- Prefer small PRs. If a task exceeds one reviewable concern, split it before implementation.
- Cite the existing component/pattern being followed in the PR description.
- Do not silently “clean up” nearby code. Put unrelated improvements in separate tasks.
- When requirements conflict with this handbook, stop and surface the conflict; do not choose a new convention silently.

### Required AI verification loop

`inspect → plan → implement minimally → format/typecheck/lint → targeted tests → build → a11y/performance checks when relevant → review diff → update docs`.

AI output is untrusted until checks pass and a human reviews high-impact changes involving security, privacy, dependencies, data migration, accessibility, publishing, or architecture.

---

## 11. Documentation strategy

### `/docs` contents

| Document                  | Purpose and update trigger                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`               | Documentation index, authority order, owners, and review dates. Update when docs move.                                          |
| `Architecture.md`         | System boundaries, data flow, rendering model, diagrams, invariants. Update on cross-cutting changes.                           |
| `TechStack.md`            | Adopted dependencies, versions/policy, rationale, alternatives, deprecation status. Update on package/provider changes.         |
| `DesignSystem.md`         | Tokens, typography, color, states, motion, responsive and accessibility rules. Update on visual contract changes.               |
| `FolderStructure.md`      | Directory map, dependency boundaries, naming, examples. Update when boundaries change.                                          |
| `CodingStandards.md`      | TypeScript, components, state, errors, security, testing, Git/review rules. Update when engineering policy changes.             |
| `Components.md`           | Component inventory, ownership, props/variants, status, examples, accessibility contract. Update with public components.        |
| `ContentManagement.md`    | Collections, schemas, editorial workflow, asset rules, previews, publishing, migrations. Update with content model/CMS changes. |
| `Deployment.md`           | Environments, CI gates, hosting, DNS, variables, rollback, incident/release procedure. Update with delivery changes.            |
| `AI-Guidelines.md`        | Concise AI preflight, prohibited actions, verification and handoff template. Update when AI workflow fails or evolves.          |
| `Roadmap.md`              | Now/next/later phases, dependencies, acceptance criteria, status. Review monthly.                                               |
| `Changelog.md`            | Human-readable notable releases using Keep a Changelog categories. Update each release.                                         |
| `Troubleshooting.md`      | Symptom → cause → diagnosis → resolution for recurring issues. Update after non-obvious incidents.                              |
| `decisions/README.md`     | ADR index and status meanings.                                                                                                  |
| `decisions/NNNN-title.md` | One durable decision: context, options, decision, consequences, migration, status, date. Never rewrite history; supersede it.   |

### Authority order

1. Approved ADR for the specific decision.
2. This handbook / split canonical docs.
3. Content and TypeScript schemas.
4. Tests and configuration.
5. Implementation patterns.
6. Comments and historical PR discussion.

When splitting this handbook into files, preserve one canonical home (`docs/README.md`) and link rather than copy. Duplicate policy text causes drift.

### Document metadata template

Each canonical document begins with: title, status, owner, last reviewed, next review, scope, related ADRs. Examples must be tested or labeled conceptual. Use Mermaid diagrams only when they improve understanding and remain synchronized.

---

## 12. Phased roadmap

| Phase                            | Goals and deliverables                                                                                                                                              | Dependencies                           | Priority         | Complexity    | Later improvements                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------- | ------------- | ---------------------------------------------------------------------- |
| 0. Discovery & content inventory | Define audiences, success metrics, voice, route map, content inventory, references, privacy requirements, and 3–5 representative case studies.                      | None.                                  | P0               | Medium        | User interviews, analytics baseline.                                   |
| 1. Foundation                    | Initialize Astro/TS/pnpm; tokens; base layout; lint/format/typecheck; CI; docs; content schemas; preview deployment; security headers.                              | Phase 0 decisions.                     | P0               | Medium        | Monorepo only if experiments later justify it.                         |
| 2. Design system                 | Build typography, color/theme, layout primitives, buttons, links, cards, forms, navigation; Storybook only if component volume warrants it; accessibility fixtures. | Tokens and content examples.           | P0               | High          | Visual regression matrix, Figma token sync.                            |
| 3. Content platform              | Configure Keystatic; projects/posts/experience/skills/site schemas; draft/preview workflow; image and link validation; seed content.                                | Stable schemas and GitHub app/storage. | P0               | High          | Scheduled publishing, localization, DAM.                               |
| 4. MVP pages                     | Home, About, Projects index/detail, Experience, Contact, Resume HTML, 404; metadata, sitemap, robots, social images.                                                | Phases 1–3.                            | P0               | High          | Advanced filters, generated PDF.                                       |
| 5. Publishing                    | Blog and Research indexes/details, tags, RSS, code blocks, TOC, related content, static search.                                                                     | Content platform and article design.   | P1               | Medium–high   | Newsletter, citations export, full-text service.                       |
| 6. Experiments & polish          | Experiments directory, isolated demos, refined motion, dark mode, responsive and browser QA, content migration.                                                     | Stable MVP and budgets.                | P1               | Medium        | Separate experiment subdomains/sandbox.                                |
| 7. Quality & launch              | Playwright/axe suite, manual a11y review, Lighthouse budgets, monitoring, analytics, redirects, legal/privacy, backups, launch checklist.                           | Production content and domain access.  | P0 before launch | High          | External accessibility/security audit.                                 |
| 8. Continuous evolution          | Monthly dependency/content review, quarterly handbook and performance review, annual design audit; publish roadmap/changelog.                                       | Operational ownership.                 | Ongoing          | Low recurring | Auth, comments, localization, hosted CMS, database only from evidence. |

### Phase acceptance gates

- A phase is complete only when deliverables, tests, documentation, and rollback/migration notes are complete.
- P0 blocks launch; P1 follows launch or runs in parallel only when it does not threaten P0 quality.
- Estimated complexity: Low (<2 focused days), Medium (2–5), High (1–3 weeks), subject to content readiness and experience.

### Success metrics

- 100% of routine content changes require no component/source edit.
- Zero critical accessibility violations in automated checks; manual WCAG review completed before launch.
- Core Web Vitals in the “good” range at p75 where field data exists.
- No content schema bypasses or duplicate published slugs.
- New contributor/AI agent can locate the correct extension point in under 15 minutes.
- Architecture changes always include an ADR and synchronized documentation.

---

## Appendix A: environment model

- **Local:** local Keystatic storage, draft visibility, mocked providers.
- **Preview:** per-PR deployment, GitHub-backed content, robots noindex, test providers, restricted secrets.
- **Production:** protected branch, approved deployment, production secrets, public indexing.
- Validate environment variables at startup/build; browser-exposed variables use an explicit public prefix.
- Content publishing is a Git change that triggers preview, checks, approval, then production deploy.

## Appendix B: definition of done

A change is done when scope is satisfied; implementation follows boundaries; content is editable where appropriate; types and schemas pass; relevant states exist; keyboard/screen-reader/reduced-motion/theme/responsive behavior is verified; performance budgets remain valid; tests and build pass; docs and ADR/changelog are current; and the final diff contains no unrelated changes.

## Appendix C: initial ADRs to create

1. `0001-adopt-astro-content-first-architecture.md`
2. `0002-adopt-git-based-content-with-keystatic.md`
3. `0003-use-semantic-design-tokens-and-tailwind.md`
4. `0004-deploy-portable-static-output-to-cloudflare.md`
5. `0005-defer-database-backend-and-authentication.md`
6. `0006-use-react-only-for-interactive-islands.md`

## References

- [Astro: content-driven web framework](https://astro.build/)
- [Astro content collections](https://docs.astro.build/en/guides/content-collections/)
- [Astro image optimization](https://docs.astro.build/en/guides/images/)
- [Keystatic](https://keystatic.com/)
- [Tailwind theme variables](https://tailwindcss.com/docs/theme)
- [Tailwind dark mode](https://tailwindcss.com/docs/dark-mode)
- [Motion reduced-motion guidance](https://motion.dev/docs/react-use-reduced-motion)
- [Cloudflare Astro deployment](https://docs.astro.build/en/guides/deploy/cloudflare/)
- [Cloudflare Web Analytics](https://developers.cloudflare.com/pages/how-to/web-analytics/)
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
