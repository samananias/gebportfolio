# Content Management

<callout icon="♞">**Status:** Active · **Owner:** Gen · **Last Reviewed:** 2026-07-18</callout>

Details of the content layer, collections schemas, and Keystatic rules.

## Content Collections

Defined in `src/content.config.ts`:

- `site`: Global configuration.
- `navigation`: Link configurations.
- `projects`: Markdown-based case studies.
- `posts`: Blog posts.
- `experience`: Career timeline entries.
- `skills`: Competency evidence and category taxonomy.
- `achievements`: Certifications and awards.
- `research`: Formal publications and abstract.
- `experiments`: Lab work and warnings.
- `pages`: Static page contents and structured page singletons.

### `pages` collection — page singletons

The `pages` collection (loader: `glob` over `src/content/pages/*.json`) supports two complementary field families on a single page record, letting a page evolve without breaking existing callers:

- **`sections[]` (legacy / consumer-safe)** — array of `{ id, heading?, content, order? }` used by surfaces like the homepage `<AboutSummary />` that pull stable, narrative-agnostic cards. Kept around for backward compatibility.
- **`moves[]` (score-sheet ledger, used by `/about`)** — array of `{ id, notation, piece?, heading, dateRange?, lead?, body[] }` describing a chess-notation sequence. `piece` is restricted to `king | queen | rook | bishop | knight | pawn` so the ledger's visual vocabulary stays inside the chess token system.
- **`facts[]` (sidebar quick-reference)** — array of `{ label, value }` rendered by `<FactsIndex />` as the stamped index card.

The About page reads from `src/content/pages/about.json`. The same shape (sections + moves + facts, all optional) is available to any future page that wants a narrative ledger layout.

## Content Formatting

- Slugs: Lowercase, kebab-case, immutable once published.
- Drafts: Hidden from feeds, index, sitemap.
- Validation: Enforced at build-time using Zod and CI validation scripts.
