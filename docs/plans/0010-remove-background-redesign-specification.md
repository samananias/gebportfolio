# Remove Background Page Redesign — Crop Studio Parity

<callout icon="♞">**Status:** Implemented · **Owner:** Sam · **Date:** 2026-09-18</callout>

Redesigns `/remove-background` to share the exact composition, state language,
and evidence lane that `/crop` shipped in
[0009 Crop Page Redesign](0009-crop-page-redesign-specification.md): one page,
two modes (**Studio** fast path and opt-in **How it works** evidence lane),
a progressive bench of stamped stages, and consent-first removal with abort.
The removal-only semantics from
[0007 Image Editing Improvements](0007-image-editing-improvements.md) are
inherited unchanged: no frame, no face guide, no preset radios, no zoom, no
crop canvas. What changes is the composition, the state language, and the
accessibility of the tool itself.

Related work (read before implementing):
[0006 ID Photo Studio Specification](0006-id-photo-studio-specification.md),
[0007 Image Editing Improvements](0007-image-editing-improvements.md) and its
[roadmap 0007.1](0007.1-image-editing-roadmap.md),
[0009 Crop Page Redesign Specification](0009-crop-page-redesign-specification.md)
and its [roadmap 0009.1](0009.1-crop-page-redesign-roadmap.md),
[0008 Lab Ledger & Entry Records Specification](0008-lab-ledger-specification.md)
(the stamp and ruled-ledger vocabulary this design extends).

---

## 0. How to extend this document

Each change lives in its own `Feature N` block under section 4 with matching
acceptance criteria in section 9. To add a change:

1. Append `### Feature N — <name>` under section 4 using the same
   sub-headings as the existing features.
2. Add the matching `AC N` rows under section 9.
3. Update the Change Log at the bottom.

## 1. Objective

The Background Remover is the sibling of the ID Photo Studio and shares its
pipeline (`src/lib/crop/removal.ts`), its guards (`EXPORT`), and its model
(`REMOVAL_MODEL`), but until now it shipped a flatter, older composition: a
static three-section island, no consent gate for the first ~40 MB model
download, no abort for an in-flight run, no phase-aware loading copy, and no
evidence lane for the evaluators who read the page as portfolio proof. The
result is a sibling that looks and feels like a different product.

The objective: make `/remove-background` the same product as `/crop` in
composition and behavior — page shell, tabs, bench spine, stamps, intake
funnel, consent gate, progress honesty, and evidence lane — while keeping the
tool strictly removal-only.

## 2. Current Behavior

`src/pages/remove-background.astro` renders a default-width container with a
header, a chessboard divider, and the `RemoveStudio` island
(`src/components/islands/RemoveStudio.tsx`). The island renders three always
visible sections: `01 · Source photo` (file input only), `02 · Compare`
(original beside result), and `03 · Remove & export` (removal button,
progress percent, prepare/download steps). Known gaps:

- No **Back to Lab** entry (the Lab pattern on every sibling bench page).
- No consent gate: clicking "Remove background" starts the ~40 MB model
  download without disclosure or confirmation on first run.
- No abort: an in-flight removal run cannot be cancelled, and a stale run's
  late result is not discarded when a new photo is chosen.
- Loading is a bare `Model N%` count: it shows download percentages during
  inference too, and it never names the phase.
- No intake beyond the file input: no drag-and-drop, no clipboard paste, no
  camera capture.
- No "How it works" evidence lane; the privacy story is one caption aside.
- The container is `default` width while the crop bench uses `wide`.

## 3. Expected Behavior

`/remove-background` adopts the `/crop` shell: wide container, back
navigation, Lab badge header, chessboard divider, a conforming tablist
(**Studio** / **How it works**, deep-linkable via `?mode=`, persisted in
`localStorage`, stacking without JavaScript), and a bench that rests on
exactly one expanded stage while the others stay as stamped rows. The bench
stages are:

1. `01 · Source photo` — choose, drag, paste, or shoot a photo; guards run
   inline; the source stage stamps itself `choose` → `loaded`.
2. `02 · Remove the background` — side-by-side compare over the shared
   checkerboard definition; consent-first model download with confirm/cancel;
   phase-aware progress (real per-file percent, indeterminate inference);
   cancellation; non-fatal failure recovery; **Start over** returns the bench
   to intake in place.
3. `03 · Download the cutout` — one action hands the transparent PNG to the
   browser; the collapsed row keeps a re-download affordance; the stage
   stamps `saved` after a successful download; **Another photo** clears the
   result in place so one more removal never needs a page reload.

The "How it works" lane carries four stamped, static articles built from the
same constants the tool imports (`EXPORT`, `REMOVAL_MODEL`): the upload
guards, the transparency contract, the on-device privacy model, and pointers
to the Lab note and the sibling tool.

## 4. Feature Requirements

### Feature 1 — Two-mode surface (Studio / How it works)

The page renders one tablist with two tabs — `Studio` (default) and
`How it works` — as page-level static markup with a small inline script
(selection without navigation, roving tabindex, Arrow/Home/End keys,
`?mode=` deep link, `localStorage` persistence under a distinct
`remove-mode` key, silent fallback on invalid values). Without JavaScript
both panels stack and the tablist is hidden via `noscript`.

#### AC 1.1 — `Studio` is the default and `?mode=record` deep-links

Visiting `/remove-background` shows the Studio panel; visiting with
`?mode=record` shows the evidence lane; an invalid `?mode` value falls back
silently to the stored or default mode.

#### AC 1.2 — Keyboard-complete tablist

Arrow Left/Right/Home/End move selection and focus; `aria-selected`,
`aria-controls`, and `tabindex` stay conforming; the tablist carries an
accessible label.

### Feature 2 — Bench spine (progressive disclosure + state stamps)

The island is an exclusive accordion of three plates — `source`, `remove`,
`download` — each with an ordinal row (`01 ·`), a state stamp from the shared
stamp treatment, a collapsed summary line, and a hidden-until-expanded
panel. Exactly one plate is open at a time; toggling never closes the bench
to zero plates. Stage state derives from the pipeline:

- `source`: `choose` (waiting) → `loaded` (done).
- `remove`: `waiting for a photo` (locked) → `remove` (current) →
  `removing` (current) → `cut out` (done).
- `download`: `waiting for a photo` (locked) → `download` (current) →
  `saved` (done).

#### AC 2.1 — One plate open, stamped rows everywhere else

After a photo loads the bench rests on the remove plate; the source row
collapses to its summary line; no state exists in which every plate is
collapsed.

### Feature 3 — Intake funnel (drop, paste, camera)

All intake paths funnel through one `handleFile`: the file input
(`#remove-file`), drag-and-drop onto the source plate, clipboard paste while
the source plate is expanded, and a camera capture input on supporting
devices. Validation is synchronous first (type, size) so bad files fail
instantly, then again after decode (dimensions), with the alert rendered
inside the source stage, expanded so it is seen. A re-entrant intake while a
photo is decoding is ignored, not queued.

#### AC 3.1 — Same file twice still fires

The input's value resets after every change so choosing the same file again
re-runs the funnel.

### Feature 4 — Consent-first removal with abort and run tokens

Clicking "Remove background" with a photo loaded: if the model is already
cached on this device (the shared `crop-model-consent` flag — both tools
download the same model, so one cache flag is the honest state), removal
starts immediately; otherwise the run enters a consent stage that discloses
the model name, license, runtime, and approximate download size, and requires
an explicit confirm before any bytes stream. Confirm starts the run; "Not
now" returns to the ready stage. A live run can be cancelled with a token
bump that discards its late result. Every run reports its phase: a real
per-file percent while model files stream, an indeterminate indicator and
explicit copy while inference runs — no invented percentages.

#### AC 4.1 — Consent blocks the first run

With a cold cache, the first removal shows the disclosure and downloads
nothing until confirmed; the consent copy names the model, license, runtime,
and size from `REMOVAL_MODEL`.

#### AC 4.2 — Failure is non-fatal and stage-local

A failed run returns the bench to ready, renders the alert inside the remove
plate, keeps the original photo usable, and leaves download locked.

### Feature 5 — One-action download with a resting affordance

The download plate's action prepares the transparent PNG from the cutout and
hands it to the browser in one action (matching the crop export behavior).
The visible affordance stays for a deliberate re-download; the collapsed
download row mirrors it so it stays reachable without reopening the plate.
After a successful download the stage stamps `saved` and the summary names
the result dimensions.

#### AC 5.1 — Download requires a cutout

The download action stays disabled until a removal has succeeded; preparing
a download never flattens the alpha channel.

### Feature 6 — Evidence lane built from shipped constants

The "How it works" panel renders four static articles in the ruled-ledger
vocabulary: the upload guards (from `EXPORT`), the transparency contract
(PNG alpha preserved, nothing flattened), the on-device privacy model (from
`REMOVAL_MODEL`), and where the evidence lives (Lab note + sibling tool).
No numbers appear that are not read from a constant the tool itself imports.

#### AC 6.1 — No invented numbers

Every quantity in the evidence lane traces to `EXPORT` or `REMOVAL_MODEL`.

### Feature 7 — Start over without a page reload

Doing a second removal must never require a page reload. The bench rests on
stage 02 after a load, so the reset lives **inside the plate that is actually
expanded**, mirroring the crop frame-stage control added by spec 0009
Feature 9:

- `02 · Remove the background` carries a full-width secondary **Start over**
  whenever a photo is loaded (`canWork`). It calls the existing `resetAll`
  path, so the photo, cutout, progress, error, and any prepared download
  clear, the file input re-arms, and the bench returns to stage 01.
- `03 · Download the cutout` carries a full-width secondary **Another photo**
  under the same `canWork` gate, so the save moment doubles as the "one more"
  moment.

Photo-dependent state only: the model-consent flag and the mode choice
persist, exactly as on `/crop`.

Collision is impossible by construction: the bench is an exclusive accordion,
so only one plate's panel is in the accessibility tree at a time and only one
reset control is ever reachable.

#### AC 7.1 — Reset is reachable from the resting plate

After a load the bench rests on stage 02 and **Start over** is visible there
without re-expanding stage 01. Clicking it returns the bench to intake
(`Cleared. Choose a photo to remove its background.`, empty state restored,
downstream plates locked again) and the same file can be loaded again
immediately — no reload, no re-navigation.

#### AC 7.2 — Another photo is reachable from the download plate

While a photo is loaded, expanding `03 · Download the cutout` reveals
**Another photo**, which runs the same `resetAll` path.

### Feature 7 — Start over without a page reload

Doing a second removal must never require a page reload. The bench rests on
stage 02 after a load, so the reset lives **inside the plate that is actually
expanded**, mirroring the crop frame-stage control added by spec 0009
Feature 9:

- `02 · Remove the background` carries a full-width secondary **Start over**
  whenever a photo is loaded (`canWork`). It calls the existing `resetAll`
  path, so the photo, cutout, progress, error, and any prepared download
  clear, the file input re-arms, and the bench returns to stage 01.
- `03 · Download the cutout` carries a full-width secondary **Another photo**
  under the same `canWork` gate, so the save moment doubles as the "one more"
  moment.

Photo-dependent state only: the model-consent flag and the mode choice
persist, exactly as on `/crop`.

Collision is impossible by construction: the bench is an exclusive accordion,
so only one plate's panel is in the accessibility tree at a time and only one
reset control is ever reachable.

#### AC 7.1 — Reset is reachable from the resting plate

After a load the bench rests on stage 02 and **Start over** is visible there
without re-expanding stage 01. Clicking it returns the bench to intake
(`Cleared. Choose a photo to remove its background.`, empty state restored,
downstream plates locked again) and the same file can be loaded again
immediately — no reload, no re-navigation.

#### AC 7.2 — Another photo is reachable from the download plate

While a photo is loaded, expanding `03 · Download the cutout` reveals
**Another photo**, which runs the same `resetAll` path.

## 5. UI/UX Considerations

- **Container**: `wide` (matching `/crop`) so the two sibling benches share
  the same measure and rhythm.
- **Design language**: the woodcut manuscript world unchanged — linework
  first, corner-dot plate decoration, hard-offset press interaction,
  Strategic Blue kept scarce, the shared stamp treatment, JetBrains Mono for
  ordinals and metadata. No new tokens; no hardcoded hex.
- **Motion**: the shared `animate-reveal` panel reveal with
  `motion-reduce:animate-none`; no other motion.
- **Copy**: honest, plain, same voice as `/crop`; the consent copy is the
  crop consent copy with the portrait-specific sentence removed.
- **Dark mode**: inherits via semantic tokens only.

## 6. Technical Considerations

- New folder `src/components/remove/` mirrors `src/components/crop/`:
  `types.ts`, `constants.ts`, `StageHeader.tsx`, `SourceStage.tsx`,
  `RemoveStage.tsx`, `DownloadStage.tsx`. The stamp treatment
  (`getCropStampClass`) is imported from `src/lib/crop/stamps.ts` — it is
  generic despite its name; renaming it is out of scope.
- `RemovalProgressPanel` is reused from `src/components/crop/` unchanged —
  it is tool-agnostic.
- `readModelConsent` / `writeModelConsent` are reused from
  `src/components/crop/constants.ts`. Both tools use the same on-device
  model, so the shared cache flag is the truthful state; it is not renamed.
- Telemetry stays exactly as shipped in `RemoveStudio`: one
  `removal_succeeded` event, metadata only. The event set is not widened.
- No new dependencies, no new endpoints, no schema changes.
- `src/pages/remove-background.astro` keeps the `title`, `description`, and
  `<h1>` ("Remove Background") so navigation, metadata, and tests stay
  stable.

## 7. Edge Cases & Risks

- **Same model, shared consent flag**: a visitor who confirmed the download
  in `/crop` skips the gate here (and vice versa) — intended and honest.
- **Transparent PNG sources**: the compare grid shows the original over the
  checkerboard, so a transparent source is visibly transparent.
- **Abort semantics**: the model library exposes no abort signal; cancel
  means the run token discards whatever the run later produces.
- **Large photos**: `fitWithinCap` downscales above the 4000 px cap before
  removal, exactly as in `/crop`.
- **localStorage unavailable**: consent and mode reads are try/catch
  guarded; a throwing store loses the memory, never the pipeline.
- **Risk — E2E drift**: the old contract ("02 · Compare", "03 · Remove &
  export", two-step prepare/download) is replaced; the E2E suite is updated
  in the same change (see section 8).

## 8. Implementation Plan

| Phase | Scope                                                                                 |
| ----- | ------------------------------------------------------------------------------------- |
| 1     | `src/components/remove/` types, constants, StageHeader, three stage plates            |
| 2     | `RemoveStudio` bench rebuild (state machine, intake funnel, consent, abort, download) |
| 3     | Page shell rebuild (back nav, tabs, evidence lane, wide container)                    |
| 4     | E2E suite update to the new DOM contract                                              |
| 5     | Full verification suite + visual inspection + documentation                           |

## 9. Acceptance Criteria

- **AC 1** — Two-mode surface with deep link, persistence, keyboard support,
  and no-JS stacking (Feature 1).
- **AC 2** — Bench spine: one open plate, stamped rows, state language per
  stage (Feature 2).
- **AC 3** — Intake funnel: file, drop, paste, camera; instant inline
  validation; same-file-twice works (Feature 3).
- **AC 4** — Consent-first removal, cancellation, honest phases, non-fatal
  failure (Feature 4).
- **AC 5** — One-action download, re-download affordance, alpha preserved
  (Feature 5).
- **AC 6** — Evidence lane with zero invented numbers (Feature 6).
- **AC 7** — Start over from stage 02 and Another photo from stage 03 clear
  photo-dependent state and return to intake without a page reload
  (Feature 7).
- **AC 8** — Full verification suite green: `format`, `lint`, `check`,
  `build`, `test:e2e`, `test:a11y`.

## Change Log

| Date       | Version | Description                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-18 | 1.0.0   | Initial specification, status In Progress                                                                                                                                                                                                                                                                                        |
| 2026-09-18 | 1.1.0   | Implemented: bench components in `src/components/remove/`, island and shell rebuild, E2E contract update, full suite and accessibility gates green. Status promoted to `Implemented`.                                                                                                                                            |
| 2026-09-19 | 1.2.0   | Feature 7 added: **Start over** on stage 02 and **Another photo** on stage 03 wire the bench back to intake over the existing `resetAll` path — photo-dependent state clears, model consent and mode choice persist, no reload (mirrors spec 0009 Feature 9). New E2E coverage for both reset paths; AC 7 added under section 9. |
