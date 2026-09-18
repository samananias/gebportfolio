# Lab Ledger & Entry Records Specification

<callout icon="♞">**Status:** In Progress · **Owner:** Sam · **Date:** 2026-09-15</callout>

Retrofit specification for the Lab at `/experiments`. The card grid became a
bound field ledger of numbered rows, and every entry now renders from one
shared record blueprint (summary lede, objectives panel, key-takeaway seal,
filed links, prev/next traversal).

The implementation shipped in commit `0fb68c9` (_feat(lab): redesign ledger
index and entry records_). This document is the written record for the ledger
accession model that commit introduced, plus the verification still owed to it.

Related work: [Woodcut Visual Theme](../design/WoodcutTheme.md), [Doodle Icon
System](../design/DoodleIconSystem.md), [ADR 0003 — semantic design tokens and
Tailwind](../decisions/0003-use-semantic-design-tokens-and-tailwind.md), [ADR
0006 — React only for interactive
islands](../decisions/0006-use-react-only-for-interactive-islands.md), and the
[Content & Writing Style Guide](../engineering/ContentStyleGuide.md).

---

## 1. Goal & Context

The Lab listing was a responsive card grid. Entries had no identity: no
number, no shared state language, and no consistent reading order. Two
problems followed from that:

- **Unstable identity.** A row could only be referred to by title, so a row
  and its record had no shared handle. Adding or re-sorting entries made rows
  appear to shift position, which reads like renumbering to a returning
  visitor.
- **List/detail drift.** State was expressed as loose badge text on the list
  and again on the record, so the two surfaces drifted whenever one changed.

The goal, taken from the Lab critique (finding **P1**: stable accession IDs),
is an engraver's field ledger — ruled entries, state stamps, apparatus tags —
numbered from the content slug so that adding an entry never renumbers the
existing rows, with one record blueprint reused by every entry.

---

## 2. What Shipped

- `src/pages/experiments/index.astro` — rewritten as the field ledger
  (masthead, counts, filters, ruled rows, empty state).
- `src/pages/experiments/[slug].astro` — rewritten as the entry record
  blueprint.
- `src/lib/lab/accession.ts`, `order.ts`, `stamps.ts`, `links.ts` — shared
  helpers so a row and its record can never disagree on number, order, stamp,
  or link behaviour.
- `src/content.config.ts` — experiments schema gained optional `summary` and
  `keyTakeaway`, defaulted `objectives`, and a `demoLinks[].url` rule that
  accepts root-relative paths.
- `src/content/experiments/*.md` — the three entries gained the new frontmatter
  fields and moved internal demo links to root-relative paths.

No new dependencies, no new components, and no React island: the filter
behaviour stays a page-level inline script, consistent with [ADR
0006](../decisions/0006-use-react-only-for-interactive-islands.md).

---

## 3. The Ledger Model

### 3.1 Accession numbers — `formatEntryNumber(id)`

Every entry is addressed as `EXP.xx`, derived from the content slug:

1. Start `hash = 0`.
2. For each character: `hash = (hash * 31 + charCodeAt(i)) % 100`.
3. Return `` `EXP.${String(hash).padStart(2, "0")}` `` (e.g. `EXP.07`).

Guarantees this buys the design:

- **Agreement.** Both the ledger row and the record masthead call the same
  helper with the same slug, so they always print the same number.
- **Stability.** The number depends only on the slug, so inserting, removing,
  or re-sorting entries never changes another entry's number, and re-titling
  an entry (which changes the _filename_ only if the slug is renamed) leaves
  the number alone.
- **Presentation only.** The accession is never a URL, a database key, or a
  sort key, so its brittleness is bounded by decoration purposes.

Known limitation: the modulus gives only 100 buckets, so the function is
stable but not _uniqueness-guaranteed_. Two slugs can hash to the same
accession. With three entries there is no collision today; see section 10.

### 3.2 Ledger order — `sortExperimentsLedger(experiments)`

- Sort key: `active` → `completed` → `abandoned` (`0`, `1`, `2`), title as
  tiebreak via `localeCompare`.
- Non-mutating: returns `[...experiments].sort(...)`, so the input collection
  array is untouched.
- Lives in its own module because `getStaticPaths` is evaluated outside a
  component's frontmatter scope and cannot see page-level constants.
- One function feeds three surfaces: the row order, the rule order, and each
  record's `prev`/`next` props.

### 3.3 State stamps — `getLabStampClass(status)`

One function owns the stamp treatment so the list and the record cannot drift:

| Status      | Stamp treatment                            | Copy shown  |
| ----------- | ------------------------------------------ | ----------- |
| `active`    | solid ink border, `text-text`              | `active`    |
| `completed` | solid border, `text-primary` (scarce blue) | `completed` |
| `abandoned` | dashed `border-border-custom`, muted text  | `shelved`   |

The stamp carries the state word in text as well as colour, so state never
depends on hue alone. `abandoned` is the schema value; `shelved` is the
displayed word on both surfaces.

### 3.4 Filed links — `isExternalLabLink` / `externalLinkAttrs`

- `isExternalLabLink(href)` is `/^https?:\/\//i.test(href)`.
- `externalLinkAttrs(href)` returns
  `{ target: "_blank", rel: "noopener noreferrer" }` for off-site links and
  `{}` for everything else, spread onto the anchor or `LinkButton`.
- Root-relative paths (`/crop`, `/remove-background`, `/design-system`) are
  internal: they resolve against whatever host serves the page, so the same
  content works on localhost, a preview deploy, and production. The schema
  enforces this — `demoLinks[].url` must be an absolute `http(s)` URL or start
  with `/`.

---

## 4. Ledger Index Blueprint (`/experiments`)

1. **Masthead** — queen woodcut (`ChessIcons`) in a bordered square with corner
   tick marks and the `4px 4px 0 var(--color-ink)` press shadow (decorative,
   `aria-hidden`); eyebrow `Lab — Field ledger`; `h1` "The Laboratory"; a
   one-paragraph lead; then a count row (total, active, completed, shelved)
   where each count is prefixed by an `sr-only` qualifier and paired with a
   `DoodleIcon`. Closes with a `var(--stroke-hatch)` hairline rule.
2. **Filter bench** — two `role="group"` blocks:
   - _State_: All states, Active, Completed, Shelved.
   - _Apparatus_: All apparatus, then every unique `technologies` value
     (collected through a `Set`, sorted alphabetically). Rendered only when at
     least one technology exists.
   - Buttons carry `aria-pressed`; the active pill uses `bg-primary text-bg`
     and inactive pills use `bg-surface border-border-custom text-text-muted`.
     The class swap happens in the inline script, which mirrors the two class
     strings authored in markup.
3. **Live result count** — `<p id="experiments-count" role="status"
aria-live="polite">` reading "Showing X of Y entries" (singular "entry" at
   one), updated after every filter application.
4. **Ledger rows** — an `<ol>` of `<li
data-experiment-card data-status data-technologies>`; the two data
   attributes are the filter contract. At `lg` each row is a three-column grid
   (`5.5rem 1fr auto`):
   - accession number above the state stamp;
   - title link to the record, then a description line resolved in order
     `summary` → `warning` (with caution icon) → a neutral "Filed prototype —
     open the entry for method, apparatus, and links." fallback, then
     apparatus chips;
   - "Open entry" link plus each filed link as a small mono capsule with a
     dotted underline and `min-h-[24px]` (touch target).
5. **Empty state** — hidden `<p id="experiments-empty" role="status"
aria-live="polite">` holding a hand-written note ("no rows match that cut"),
   a plain-language explanation, and a "Reset ledger filters" button that
   restores `all`/`all` and re-applies the filters.
6. **Footer** — "Filed under Lab · N entries", then a chessboard divider.

---

## 5. Entry Record Blueprint (`/experiments/[slug]`)

`getStaticPaths` renders one record per experiment in ledger order and passes
`prev`/`next` from that same order.

1. **Back link** — "Back to field ledger" to `/experiments`.
2. **Entry masthead** — flask icon + "Lab entry", the `EXP.xx` accession, the
   state stamp; `h1` title; the `summary` as an italic display-size lede; the
   apparatus chip list (`aria-label="Apparatus"`); `var(--stroke-hatch)`
   hairline.
3. **Caution slip** — rendered only when `warning` exists, labelled "Caveats
   and disclaimer" for assistive technology.
4. **Record grid** — `lg:grid-cols-4`: a three-column main area plus a
   one-column aside. Reading order is explicit, because it differs by
   breakpoint:

   | Order (mobile) | Order (`lg`)    | Block                                        |
   | -------------- | --------------- | -------------------------------------------- |
   | 1              | — (`lg:hidden`) | "On this page" `<details>` TOC               |
   | 2              | 3               | Article prose (`prose-custom`, `max-w-none`) |
   | 3              | 2               | Objectives panel                             |
   | 4              | 4               | Key-takeaway seal                            |
   | 5              | 5               | Filed links band                             |

   So on small screens the objectives follow the article, while on desktop
   they read _above_ it as a framing panel.

   - **Mobile TOC**: `<details>`/`<summary>` labelled "On this page"
     (`list-none`, webkit marker hidden) listing every heading of depth 2–4
     and, when a takeaway exists, a "Bottom line" link to `#lab-takeaway`.
   - **Objectives panel**: "What this entry set out to test", each item
     prefixed by a zero-padded mono index (`01`, `02`, ...).
   - **Key-takeaway seal**: `id="lab-takeaway"`, corner tick marks, eyebrow
     "Bottom line · key takeaway", and the `keyTakeaway` as an italic display
     line. This is the record's conclusion and the target of the TOC anchor.
   - **Filed links band**: heading "Filed links", helper line "The live tool or
     source backing this entry.", then one `LinkButton` per demo link with
     `externalLinkAttrs` applied.
   - **Desktop TOC**: sticky (`top-8`), left-ruled aside with `#toc-nav`,
     indent `(depth - 2) * 8px` per heading.

5. **Traversal** — previous/next cards rendered as a hairline-seamed grid
   (`gap-px` on a border-coloured background), hidden placeholders keeping the
   two-up alignment on `sm+`, each labelled "Previous entry" / "Next entry".
6. **Footer** — "End of entry · return to the ledger".
7. **Scroll highlighting** — an inline `IntersectionObserver` watches
   `.prose-custom h2`, `.prose-custom h3`, and `#lab-takeaway`, and toggles
   `toc-link-active` on the matching `#toc-nav` link. The takeaway is observed
   too, so the "Bottom line" link activates when the reader reaches the seal.

---

## 6. Content Schema & Authoring

The experiments collection (`src/content.config.ts`) gained three fields and one
rule. Authoring happens directly in frontmatter under
`src/content/experiments/`.

| Field          | Type                                   | Required | Role on the page                                                   |
| -------------- | -------------------------------------- | -------- | ------------------------------------------------------------------ |
| `title`        | `string`                               | yes      | Row title link and record `h1`; also the Keystatic slug field.     |
| `status`       | `active` \| `completed` \| `abandoned` | yes      | Ledger order, state stamp, and the State filter facets.            |
| `summary`      | `string` (optional)                    | no       | Row description and record lede; also the record meta description. |
| `objectives`   | `string[]` (default `[]`)              | no       | "What this entry set out to test" panel.                           |
| `keyTakeaway`  | `string` (optional)                    | no       | Bottom-line seal plus the `#lab-takeaway` TOC anchor.              |
| `warning`      | `string` (optional)                    | no       | Caution slip on the record; used as the row description fallback.  |
| `technologies` | `string[]` (default `[]`)              | no       | Apparatus chips on both surfaces; the Apparatus filter facets.     |
| `demoLinks[]`  | `{ label: string; url: string }`       | no       | Filed links band and the row's filed links.                        |

`demoLinks[].url` changed from `z.string().url()` to a refinement: an absolute
`http(s)` URL **or** a root-relative path starting with `/`. External links open
off-site; root-relative links navigate in the same tab and stay correct on
every host.

When `summary` is absent, the record falls back to
`Lab experiment: ${title}` for its meta description.

---

## 7. Accessibility Requirements

- **Filters** are `<button type="button">` elements with `aria-pressed`, grouped
  by `role="group"` and labelled "Filter by state" / "Filter by apparatus" —
  never anchors, so they are not mistaken for navigation.
- **Live regions** — the result count and the empty state are both
  `role="status" aria-live="polite"`, so filtering announces its outcome
  without moving focus.
- **Abbreviated counts** are prefixed with `sr-only` qualifiers ("Total ledger
  entries: ") so the visible "3 entries" still reads unambiguously.
- **Labelled regions** — "Table of contents", "Entry contents", "Experiment
  links", "More ledger entries", "Apparatus", "Caveats and disclaimer".
- **Disclosure** — the mobile TOC is a native `<details>`; only the default
  marker is hidden, so keyboard operation is unchanged.
- **Focus visibility** — every interactive element carries
  `focus-visible:ring-2` with `ring-focus`/`ring-offset-bg`.
- **State is never colour-only** — the stamp prints the word next to the tone.
- **No emoji glyphs** — all UI iconography is `<DoodleIcon>` / `ChessIcons`
  vectors, per the icon rule in [AGENTS.md](../../AGENTS.md).
- **Readable without JavaScript** — the ledger is statically rendered; with
  script disabled every row, stamp, and link is present, and only the filter
  behaviours and live counts are lost.

---

## 8. Design Tokens & Constraints

- Semantic roles only: `primary`, `primary-hover`, `bg`, `surface`,
  `surface-subtle`, `text`, `text-muted`, `border-custom`, plus the
  `--stroke-hatch` rule height and the `--color-ink` press shadow. No hex
  literals appear in either page; the one arbitrary value in use is
  `shadow-[2px_2px_0_var(--color-text)]`, which still resolves to a token.
- Type voice: `text-micro|caption|small|body|body-large|h1|h4` with
  `font-mono` for ledger metadata, `font-display` for ledes and seals,
  `font-heading` for row titles, and `font-hand` for the hand-written empty
  state.
- No new dependencies, no `tailwind.config.js`, and no theme rules outside the
  `@theme` block in `src/styles/global.css` (see [ADR
  0003](../decisions/0003-use-semantic-design-tokens-and-tailwind.md)).
- Both routes remain prerendered; nothing here touches Workers, KV, or the
  chat/chess islands.

---

## 9. Verification Plan & Status

### In place today

- `/experiments` is audited by the axe suite (`tests/accessibility/a11y.spec.ts`
  route list), so the ledger index is covered by `pnpm run test:a11y`.

### Verified for this document

This retrofit changed Markdown only, so the gates actually run against it were
`format`, `lint`, `check` (0 errors; `check-links` SUCCESS across 49 files), and
`build` (server build plus the bundled `dist/client/_worker.js`). No code,
schema, or dependency changed, so nothing in the shipped pages could be
retyped by these edits.

### Owed to the feature

The redesign shipped as code only, so `test:e2e` and `test:a11y` have not been
run against the feature revision — and the Lab has no dedicated e2e spec: the
suite in `tests/e2e` currently covers chat, chess, contact, core-mindset
carousel, crop, search, theme, navigation, and background removal. Re-run the
ordered gate when the Lab routes are next changed.

### Proposed e2e coverage (when a Lab spec is added)

- [ ] Ledger rows render in ledger order, and the `EXP.xx` accessions of
      existing entries are unchanged after a new entry is added.
- [ ] State and apparatus filters hide non-matching rows, flip `aria-pressed`,
      and update the live "Showing X of Y entries" count.
- [ ] A combination with no matches reveals the empty state on both axes, and
      "Reset ledger filters" restores every row.
- [ ] A record renders the summary lede, objectives panel, and takeaway seal,
      with prev/next following ledger order.
- [ ] A root-relative filed link (e.g. `/crop`) resolves on the serving host
      rather than 404-ing.
- [ ] The "Bottom line" TOC link targets `#lab-takeaway`.

### Manual checks

- Light and dark mode inspection of both surfaces at 390 px and 1440 px.
- Keyboard-only traversal of the filter bench, the disclosure TOC, and the
  prev/next cards.

### Done criteria

All boxes above green, no new dependencies, no `wrangler.jsonc` diff, and the
accession of a pre-existing entry provably unchanged after adding a new one.

---

## 10. Known Limitations & Follow-ups

1. **Accessions are stable, not unique.** The 100-bucket modulus can collide;
   no collision exists across the three entries filed today. If the Lab grows,
   widen the modulus or add an assertion that accessions are unique per
   collection. Not changed here — this document is descriptive.
2. **Keystatic parity gap.** The experiments schema in `keystatic.config.ts`
   still exposes only `title`, `status`, `warning`, `technologies`, `demoLinks`,
   and the body — the new `summary`, `objectives`, and `keyTakeaway` fields
   cannot be authored through the CMS yet, only by editing frontmatter. Mirror
   the schema fields the next time the CMS is touched.
3. **Pill class strings live twice.** The filter script rebuilds the active and
   inactive pill classes as literals, duplicating the strings authored in
   markup. Any change to the pill visual language must land in both places.
4. **`docs/architecture/ContentManagement.md`** describes the experiments
   collection in a single line; extend it the next time the collection changes
   (this retrofit deliberately stayed out of that document).

---

## 11. Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-15 | Retrofit specification written to record the shipped ledger redesign (`0fb68c9`): accession model, ledger order, stamp language, filed-link rules, index and record blueprints, schema additions, accessibility contract, and the verification gate still owed. Docs only — no code, schema, or dependency changes. |
