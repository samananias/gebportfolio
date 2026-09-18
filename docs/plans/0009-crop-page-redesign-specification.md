# Crop Page Redesign — Two-Mode ID Photo Studio

<callout icon="♞">**Status:** In Progress · **Owner:** Sam · **Date:** 2026-09-15</callout>

Redesigns `/crop` as one page with two modes: a fast **Studio** path for
anyone who needs a print-ready Philippine ID photo right now, and an optional
**How it works** path that carries the engineering and privacy evidence the
portfolio evaluators read for. The woodcut world, the export contract, and the
on-device privacy model are inherited unchanged; what changes is the
composition, the state language, and the accessibility of the tool itself.

Related work (read before implementing): [0006 ID Photo Studio
Specification](0006-id-photo-studio-specification.md), [0006.1 backend
roadmap](0006.1-id-photo-studio-backend-roadmap.md), [0007 Image Editing
Improvements](0007-image-editing-improvements.md) and its [roadmap
0007.1](0007.1-image-editing-roadmap.md), [0008 Lab Ledger & Entry Records
Specification](0008-lab-ledger-specification.md) (the stamp and ruled-ledger
vocabulary this design extends), [ADR 0003 — semantic tokens and
Tailwind](../decisions/0003-use-semantic-design-tokens-and-tailwind.md), [ADR
0006 — React only for interactive
islands](../decisions/0006-use-react-only-for-interactive-islands.md), and
[ADR 0008 — thin backend, client-side
removal](../decisions/0008-crop-thin-backend-client-removal.md).

---

## 0. How to extend this document

Each change lives in its own `Feature N` block under section 4 with matching
acceptance checkboxes under section 9. Shared concerns stay in sections 5-7 so
new features reuse them.

To add a feature later:

1. Append `### Feature N — <name>` under section 4 using the same
   sub-bullets (Objective, Expected behavior, Detailed requirements).
2. Append matching acceptance checkboxes under section 9.
3. Add non-goals or follow-ups to section 8 step 6 (parking lot), not inline.
4. Add a row to the Change Log at the bottom. Do not renumber existing
   features.

---

## 1. Objective

The page is `/crop`: the public ID Photo Studio. It already does the hard
part correctly — on-device removal, a fixed frame over a pannable photo, a
preset-aware face guide, and a 300 DPI export contract. Two audiences meet on
it and neither is served well today:

- A **utility visitor** (the typical case: a phone, a deadline, no
  image-editing vocabulary) meets three equally loud panels, two of which do
  nothing until a photo exists, plus an unannounced ~40 MB model download and
  a two-click export.
- A **portfolio evaluator** gets no legible engineering signal from the page
  itself; the privacy model and API contract live one click away on the Lab
  note, so the evidence is not where the artifact is.

This plan fixes the composition, the state language, and the accessibility
defects while preserving what works: the on-device pipeline, the canonical
presets in `src/lib/crop/presets.ts`, metadata-only telemetry, the 600/300 px
export targets, and the woodcut identity.

**Set at plan review (2026-09-15):**

1. **Two-lane, one URL** — a fast Studio path, plus an opt-in "How it works"
   path for the engineering signal.
2. **Two modes via an accessible tablist** — `Studio` / `How it works`, so
   each lane gets full width and neither competes with the other.
3. **Model download requires consent** — the ~40 MB first-run fetch is
   disclosed and confirmed _before_ it starts, and can be aborted.
4. **The dead export-format state becomes a real control** — PNG
   (transparency preserved) versus JPEG (flattened, labelled as such), which
   is what [0007](0007-image-editing-improvements.md) already requires to be
   disclosed.

---

## 2. Current Behavior

Implementation: `src/pages/crop.astro` (route shell) plus the `CropStudio`
React island (`client:visible`) in
`src/components/islands/CropStudio.tsx` (supported by modular subcomponents in `src/components/crop/`); geometry, presets, guards, and the
removal pipeline come from `src/lib/crop/{geometry,presets,validation,removal}.ts`.

- The route renders an eyebrow pill (`Lab · ID Photo Studio`), an `h1`, a
  lead paragraph, a chessboard divider, the island, and a footnote that links
  to the Lab note and `/remove-background`.
- The island renders **three always-expanded sections** — `01 · Source
portrait`, `02 · Frame the face`, `03 · Export print file` — where sections
  02 and 03 are inert until a photo is loaded.
- Stages: `idle → ready → removing → removed`. Upload validates type, size,
  and dimensions through `validateFileMeta`, then downscales past
  4000 px via `fitWithinCap`. Pan is clamped by `clampPanOffset`, zoom by
  `repanForZoom`; export samples `box` at the preset's
  `pixelsAt300Dpi` target.
- A single `role="status"` paragraph doubles as the instruction line and the
  result announcement, and the exported file focus lands back on it.
- Disclosure of the removal model lives in a footer aside on the island.

### Defects this plan must clear

| #   | Defect                                                                                                                                                                                                 | Evidence                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1   | Step headings render **Fraunces below H2** (`font-display` + `text-h4`), which the system reserves for Display/H1/H2.                                                                                  | `CropStudio.tsx:418, 462, 647`; `global.css:40-41`; DESIGN.md "Don't" list                     |
| 2   | The removal preview uses a **hardcoded `repeating-linear-gradient`**; gradients are permitted only in `.chess-grid::before`.                                                                           | `RemoveStudio.tsx:222-225`; DESIGN.md "Don't" list                                             |
| 3   | Errors use **raw palette values plus a semi-transparent wash** (`border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300`); no semantic alert token exists.                                 | `CropStudio.tsx:481`, `RemoveStudio.tsx:261`; `src/styles/tokens.css` has no danger/alert role |
| 4   | The **canvas bypasses theming**: checkerboard `#ffffff`/`#e3e6ec`, frame hairline `rgba(15,12,10,0.55)`, guide `rgba(255,255,255,0.85)` never respond to dark mode.                                    | `CropStudio.tsx:101-108, 141-143, 150`                                                         |
| 5   | **Ordinal eyebrows are unused**: step ordinals are baked into display headings instead of the mono eyebrow treatment the system prescribes.                                                            | `CropStudio.tsx:418-420`; DESIGN.md "Do" list                                                  |
| 6   | **`/crop` is absent from the axe audit**, so the most control-dense page in the site has no automated accessibility coverage.                                                                          | `tests/accessibility/a11y.spec.ts:5-15` audits `/remove-background` but not `/crop`            |
| 7   | The two **radiogroups do not implement the radio keyboard pattern** (no roving tabindex, no arrow keys), and `fieldset`/`legend` plus `aria-label` duplicate the same string.                          | `CropStudio.tsx:553-581, 583-613`                                                              |
| 8   | A **screen-reader user cannot frame a face**: the canvas announces only "drag or use arrow keys", and there is no numeric framing readout, no nudge controls, and no announcement of pan/zoom changes. | `CropStudio.tsx:491-503`                                                                       |
| 9   | The **~40 MB model download is disclosed only after the fact**, in the footer aside, with no confirmation, no estimate, and no abort path.                                                             | `CropStudio.tsx:616-631, 677-683`; `handleRemove` has no cancel                                |
| 10  | Export is **two clicks** ("Export 2x2 photo", then "Download file") and gives no print guidance for the file it produces.                                                                              | `CropStudio.tsx:655-673`                                                                       |
| 11  | Intake is **file-input only**: no drag-and-drop, no paste, and no camera hint for the phone case the tool exists for.                                                                                  | `CropStudio.tsx:425-444`; no `capture=` or `dataTransfer` usage exists anywhere in `src/`      |
| 12  | **First-run density**: three open panels, two inert, plus a disabled export button.                                                                                                                    | `CropStudio.tsx:414-675`                                                                       |
| 13  | The export **format is a dead state** (`useState("image/png")`, no setter), so the JPEG/flatten path is unreachable from the UI.                                                                       | `CropStudio.tsx:52, 377-380`                                                                   |

### Behaviors that are correct and must survive

- Pans via pointer drag, touch drag, and keyboard (Arrow 4 px, Shift+Arrow
  20 px); zoom scales only the image under a fixed frame and re-clamps the
  sample box; the guide never leaks into export bytes; export targets are
  600 px (`2x2`) and 300 px (`1x1`) at 300 DPI; removal fails non-fatally with
  an inline message; telemetry is metadata-only and best-effort.

### Out-of-scope observation (not fixed here)

Both existing `role="tablist"` usages are mislabelled filter/pagination
controls — `src/pages/projects/index.astro:90` and
`src/components/sections/CoreMindsetCarousel.tsx:352` carry `role="tab"`
without `aria-controls`, `role="tabpanel"`, or roving tabindex. The two-mode
switch below is therefore the **first conforming tabs pattern** in the
codebase; the two incumbent usages are parked (section 8, step 6) rather than
changed as a side effect of this work.

---

## 3. Expected Behavior

- `/crop` opens in **Studio** mode: a photograph goes in at the top, a
  print-ready file comes out at the bottom, and only the stage the visitor can
  actually act on is expanded. The other two stages are visible as stamped
  rows so the shape of the job is legible without being a wall of dead
  controls.
- A second mode, **How it works**, holds the privacy model, the preset math,
  the API contract, and the removal-model metadata as stamped field notes —
  no controls, no invented claims, no marketing register.
- Intake accepts a picked file, a dropped file, a pasted image, or the phone
  camera, under the same guards and with the same failure copy as today.
- Removal asks first: the approximate one-time download, its cached nature,
  and the fact that processing is on-device are stated **before** the fetch
  starts, progress is visible, and the operation can be aborted and retried.
- Export is one action to a downloaded file, states the preset, pixel size,
  and DPI before it runs, offers a transparency-preserving PNG or a labelled
  JPEG flatten, and ends with a factual print helper.
- Framing is achievable without sight of the canvas: the sample position is
  readable as numbers, nudging is available as controls, and every change is
  announced.
- Canvas graphics (frame hairline, face guide, transparency checkerboard)
  stay legible in **both** colour modes.
- Everything listed under "Behaviors that are correct and must survive"
  (section 2) behaves identically after the redesign.

---

## 4. Feature Requirements

### Feature 1 — Two-mode surface (Studio / How it works)

- **Objective:** give the utility visitor an uninterrupted path and the
  evaluator a legible evidence lane, without either diluting the other.
- **Expected behavior:** the mode switch sits directly under the page header;
  Studio is the default; switching is instant (no navigation, no reload); the
  chosen mode is deep-linkable and remembered.
- **Detailed requirements:**
  1. Implement the switch in **`src/pages/crop.astro`**, not in the island:
     the record lane is static content, and the switch is small enough for a
     page-level inline script in the style of the Lab ledger filter script
     (`src/pages/experiments/index.astro`). The `CropStudio` island keeps
     owning only the bench, so switching modes never re-mounts the bench and
     the record lane costs no JavaScript.
  2. Conforming tabs contract — this is the first real tabs pattern in the
     codebase, so it is specified in full:
     - `role="tablist"` with `aria-label="ID Photo Studio modes"`.
     - Two `role="tab"` buttons with stable `id`s, `aria-selected`, and
       `aria-controls` pointing at their panels.
     - Panels are `role="tabpanel"` with `aria-labelledby` pointing back and
       `tabindex="0"` so their content is reachable.
     - **Roving tabindex**: the selected tab is `tabindex="0"`, the other
       `tabindex="-1"`.
     - **Arrow keys** move selection (Left/Right, plus Home/End), and
       selection follows focus; `aria-selected` and `hidden` update together.
     - Panels toggle with the `hidden` attribute only, so a keyboard user
       never lands in an invisible panel.
  3. **No-JavaScript fallback:** `hidden` is applied by the script alone, so
     with JS disabled both panels render stacked (Studio first) and every
     fact in the record lane stays readable. The tablist is then presented as
     plain text labels rather than dead controls.
  4. **Deep link + persistence:** `?mode=record` opens How it works
     (`?mode=studio` is the explicit form of the default). The explicit
     parameter wins over the remembered mode; otherwise the last chosen mode
     is restored from `localStorage` under `crop-mode`. Invalid values fall
     back to Studio silently.
  5. Copy: the tabs read `Studio` and `How it works`. The record lane carries
     the ledger's mono eyebrow treatment and states facts only.

### Feature 2 — Studio bench spine (progressive disclosure + state stamps)

- **Objective:** remove the first-run wall of inert controls and give the
  three stages a shared state language that reads as work completed rather
  than panels to decode.
- **Expected behavior:** exactly one stage is expanded at a time. A finished
  stage collapses to one stamped row that can be reopened; a stage whose
  preconditions are unmet is shown as a stamped row stating what it waits for.
- **Detailed requirements:**
  1. Stage rows `01 · Source`, `02 · Frame`, `03 · Export`, each a plate using
     `border-structural` + `border-border-custom` + `bg-surface` + `rounded-sm`,
     separated by `--stroke-hatch` rules, reusing the corner tick marks
     already established by the ledger masthead and the Lab takeaway seal.
  2. Stage state vocabulary — a new `src/lib/crop/stamps.ts`, mirroring
     `src/lib/lab/stamps.ts` so one helper owns the class strings and the two
     surfaces cannot drift:
     - `waiting` — solid ink border, muted text.
     - `current` — solid ink border, `text-text`; the stamp reads the verb
       (`choose`, `frame`, `export`).
     - `done` — `border-primary text-primary`; the stamp reads the outcome
       (`loaded`, `cut out`, `printed`).
     - `locked` — dashed `border-border-custom`, muted text, plus the reason
       ("waiting for a photo").
  3. Typography: step titles are **Manrope** (`font-heading`) at `text-h3` or
     `text-h4`, and the ordinal is a mono eyebrow (`01 ·`) per the design
     system. Fraunces stays on the page `h1` only — this clears defect 1 and
     satisfies defect 5.
  4. Progression: loading a photo expands `02 · Frame` and collapses `01` to
     its `loaded` stamp; a completed removal updates the `02` stamp to
     `cut out`; a successful export marks `03` as `printed` and keeps its
     download affordance visible.
  5. Focus and announcement: expanding a stage never steals focus. The
     existing `role="status"` region announces the change, and the newly
     expanded stage header is focusable so a keyboard user can jump to it
     deliberately.
  6. Motion: reveals reuse the existing short, hard-edged vocabulary (no
     easing theatre) and are fully bypassed under `prefers-reduced-motion`.

### Feature 3 — Studio intake (drop, paste, camera)

- **Objective:** make getting a photo in as close to zero-friction as the
  device allows, because that is the whole first mile of the job.
- **Expected behavior:** a visitor can pick, drop, paste, or shoot the photo,
  and every route produces the identical validated state or the identical
  error message.
- **Detailed requirements:**
  1. The file input keeps its `id="crop-file"`, its
     `accept="image/jpeg,image/png"`, and its label-driven activation — the
     E2E suite drives `#crop-file` directly, so it must remain a real input
     that `setInputFiles()` can target.
  2. **Camera is offered, never forced.** No `capture` attribute is added to
     the gallery control (forcing capture removes the ability to choose an
     existing photo on some mobile browsers, which is exactly wrong for an ID
     photo taken earlier). A secondary `Use camera` input with
     `capture="user"` sits beside it, because an ID portrait is taken facing
     the screen; on desktop it degrades harmlessly to a normal picker.
  3. **Drop zone:** the `01 · Source` plate accepts a dragged file
     (`dragenter`/`dragover`/`dragleave`/`drop`, `preventDefault` on the
     dragover that would otherwise navigate away) while no photo is loaded.
     The drop state is expressed with the press language — structural border
     plus hard-offset shadow — never with a colour wash. Dropping is an
     accelerator, never the only path.
  4. **Paste:** a `paste` listener on the stage accepts an image from the
     clipboard and ignores the event when focus is inside a text field.
  5. **One funnel:** every route calls the same `handleFile(file)` so
     `validateFileMeta`, the synchronous early rejection, `fitWithinCap`, and
     the existing error strings stay identical across paths.
  6. **Error proximity:** alerts render inside the stage that produced them,
     so an upload failure is never reported in a different stage (today it
     appears in `02 · Frame`).
  7. **Busy state:** while a file is being read or downscaled the plate shows
     a pending state and ignores further drops, so two photos can never race.

### Feature 4 — Consent-first removal with abort

- **Objective:** never spend a visitor's data allowance without asking, and
  never trap them inside a fetch they cannot stop.
- **Expected behavior:** the first removal begins only after an explicit
  confirmation that states the download size, the caching behaviour, and the
  on-device privacy guarantee; progress is visible; the operation can be
  aborted without losing the photo or the framing.
- **Detailed requirements:**
  1. The remove action first reveals a consent panel built from
     `REMOVAL_MODEL` (name, license, approximate size) stating: the model
     downloads once and is cached by the browser, the photo is processed on
     this device and never uploaded, and the first run takes longer on a slow
     connection. Actions: `Download model and remove background` (primary)
     and `Not now` (ghost, collapses the panel).
  2. **No code path may start the fetch without that action**, including
     re-runs.
  3. Consent is recorded under `localStorage["crop-model-consent"]` **only
     after a successful first load**, because at that point the browser cache
     has already paid the cost and re-asking would be theatre. A failed load
     leaves the flag unset so the next attempt asks again.
  4. **Abort:** while `stage === "removing"`, the progress row carries an
     `Abort` control. Aborting returns the stage to `ready`, keeps the loaded
     photo and the current framing, announces the cancellation, and leaves the
     removal available to retry.
  5. **Race safety:** aborted or superseded runs are ignored on resolution
     (a monotonic run token), so a late `compute` result can never flip the
     stage into `removed` after the visitor left it.
  6. Progress keeps the existing `Model x%` line, plus the stage stamp
     (`removing`), and the progress text is part of the announced status.
  7. Failure behaviour is unchanged: non-fatal, inline, with the same copy and
     the same retry affordance.

### Feature 5 — Export and print helper

- **Objective:** one action from a framed square to a file on disk, with the
  print step covered, because the file is useless to the visitor if the print
  half is unexplained.
- **Expected behavior:** the export states what it will produce before it
  runs, produces it in one action, offers a transparency-preserving PNG or a
  labelled JPEG flatten, and never offers bytes that no longer match the
  preview.
- **Detailed requirements:**
  1. Keep the download anchor and its exact filename contract — the E2E suite
     reads `a[download="id-photo-2x2.png"]`. The primary control performs the
     export and then triggers that anchor, so the file arrives in one click
     while the anchor remains a real, inspectable link.
  2. State the output before the action:
     `2x2 (PH ID) · 600 × 600 px · 300 DPI`, all read from `ID_PRESETS` and
     `EXPORT.printDpi` — no literal pixel values in the component.
  3. **Format control (decision 4)** — replace the dead `format` state with a
     real choice: `PNG` (transparency preserved) or `JPEG` (background
     flattened). When background is `transparent` and format is `JPEG`, the
     label must say the transparency is being flattened, which is the
     disclosure [0007](0007-image-editing-improvements.md) already requires.
  4. **Stale-export guard:** any composing change (pan, zoom, preset,
     background, format, new photo) invalidates the current export so a
     download can never deliver bytes that do not match what is on screen.
     Today `exportUrl` is only cleared when the source file changes.
  5. **Print helper** — factual only, no invented claims: for `2x2`, state
     that the sheet arrangement of 2×2 in photos on a 4×6 in print is two per
     row; for `1x1`, state the print resolution. A `print sheet` export (one
     sheet image tiling several copies) is out of scope — see the parking lot.
  6. Export focus behaviour is preserved: after an export, focus lands on the
     status region so the outcome is announced.

### Feature 6 — Design-system conformity and a canvas that works in both modes

- **Objective:** clear every documented system violation on the page and stop
  the canvas from being a light-mode island inside a dark page — and, more
  importantly, stop the guide and frame from being invisible over ordinary
  photos.
- **Expected behavior:** the page contains no gradient, no colour wash, no
  raw palette value, and no display font below H2; the frame, the guide, and
  the transparency checkerboard are legible over light and dark photos and in
  light and dark themes.
- **Detailed requirements:**
  1. **Alert styling without a new token.** The error row becomes ink-on-paper
     in the system's own language: `border-structural` in `border-text`,
     `bg-surface-subtle`, `text-text`, the `interface/caution` DoodleIcon, and
     `role="alert"`. This removes the raw `rose-*` palette values and the
     semi-transparent wash (defect 3) using tokens that already exist, so no
     design-system change is required. A semantic `danger` role is a sensible
     future addition but is **not** assumed here — it is parked as requiring
     owner approval (section 8, step 6).
  2. **Two-tone canvas graphics.** Today the frame hairline is
     `rgba(15,12,10,0.55)` and the guide is `rgba(255,255,255,0.85)`; each is
     invisible over photos of matching tone (defect 4). Draw both as a
     contrasting pair — a wider ink halo under a narrower light stroke — so
     legibility never depends on the photo. Verify over a white and a black
     test image.
  3. **Theme-bound canvas colours.** The canvas reads its colours from CSS
     custom properties at draw time (resolving through `getComputedStyle` on
     the stage) instead of literals, so dark mode flips the checkerboard and
     the hairlines. Derive the ink/paper pair from the existing semantic
     tokens; no new hex values enter the component.
  4. **One checkerboard, defined once.** Extract the transparency checkerboard
     into a single token-bound utility in `src/styles/global.css` and use it
     for the canvas and for the `/remove-background` result preview, which
     today inlines a hardcoded `repeating-linear-gradient` (defect 2). This is
     the only touch to the sibling page: no layout, copy, or behaviour change
     there. The utility is documented in the stylesheet beside the existing
     permitted exception.
  5. **Focus visibility on the canvas.** The framing surface is focusable
     (`tabindex="0"`) but carries no focus indication today, which is a
     keyboard trap in plain sight: it must gain the standard
     `focus-visible:ring-2` treatment used by every other control on the site.
  6. **No emoji, no glyph stand-ins.** All ornament remains `DoodleIcon`,
     `ChessIcons`, or chessboard dividers.

### Feature 7 — Accessibility parity for the actual job

- **Objective:** the task is framing a face; "friendly to every user" means
  the framing job must be completable by keyboard and by screen reader, and
  the page must be covered by the automated audit that every other route
  already gets.
- **Expected behavior:** with the mouse, the touchscreen, the keyboard, or a
  screen reader, a visitor can load a photo, frame the face, and export; the
  axe suite reports zero violations on the page in both modes.
- **Detailed requirements:**
  1. **Add `/crop` to the audit.** `tests/accessibility/a11y.spec.ts` gains
     `/crop` — and the record lane is covered by auditing `/crop?mode=record`
     as well. This is the prerequisite for every other claim in this feature.
  2. **Framing readout.** The stage shows the sample box origin and size in
     source pixels, plus the zoom factor, in the mono metadata register. The
     readout is the accessible equivalent of "where is the photo positioned".
  3. **Nudge controls.** Four real buttons (`Nudge up/down/left/right`)
     provide the same operation as arrow keys, at the same step sizes, without
     requiring the visitor to discover a canvas key handler. They are the
     primary accessible framing mechanism; arrow keys remain a power path.
  4. **Drop the `role="application"` claim.** The canvas becomes a labelled
     `role="group"` with `tabindex="0"`, `aria-describedby` pointing at the
     instructions and the readout. `role="application"` suppresses the
     screen-reader virtual buffer for the whole region, which is a heavy price
     for a control that now has real controls beside it.
  5. **Announce changes, don't spam.** Pan/zoom changes announce through the
     live region on a debounce (key release or a short idle), not per frame,
     and the region is separate from the static instruction text so
     instructions are never re-read.
  6. **Native radio semantics.** Replace the `role="radiogroup"` +
     `role="radio"` button pattern (defect 7) with real
     `<input type="radio">` elements inside `fieldset`/`legend`, visually
     hidden and driven by label plates, so arrow-key selection, grouping, and
     form semantics come from the platform. Do not also set `aria-label` on
     the group — `legend` is the name.
  7. **Target sizes.** Primary stage actions are ≥44 px tall; every secondary
     control is ≥32 px and adequately spaced, so WCAG 2.2 AA target-size is
     met with margin, including the `Face guide` switch (32 px today).
  8. **Stable accessible names.** The names the E2E contract pins —
     `Face guide`, `Export 2x2 photo`, and the three step headings — stay
     stable, or the spec file is updated in the same commit. Never rename
     silently.
  9. **Mode switch is keyboard-complete** per Feature 1: one tab stop, arrow
     navigation, no focus loss when panels toggle.

### Feature 8 — How it works (the record lane)

- **Objective:** put the engineering and privacy evidence on the same page as
  the artifact, in the register the rest of the Lab already uses.
- **Expected behavior:** a visitor who wants to know whether this tool can be
  trusted gets four plain, factual blocks — what leaves the device, how the
  file is produced, what the backend does, and what the model is — each
  stamped and sourced.
- **Detailed requirements:**
  1. **Static markup only** — the lane lives in `src/pages/crop.astro` (or a
     static `.astro` component it renders) with no island, so it costs no
     JavaScript and is readable with scripting disabled.
  2. Four blocks, each a plate with a mono eyebrow and a stamp, matching the
     ledger's ruled treatment:
     - `01 · What leaves your device` — image bytes are processed in the
       browser and not uploaded in v1 (the "v1" qualifier from the Lab note is
       preserved, not dropped).
     - `02 · How the file is produced` — canvas sampling of the framed square
       at the preset's 300 DPI pixel size (600 px for `2x2`, 300 px for
       `1x1`), values read from `ID_PRESETS`.
     - `03 · What the backend does` — `GET /api/crop/config` serves canonical
       presets; `POST /api/crop/usage` records metadata only (`{ event,
preset, ms }`); `POST /api/crop/remove` is a reserved `501` stub
       returning `fallback: client`.
     - `04 · The model` — name, license, runtime, and approximate first-load
       size, read from `REMOVAL_MODEL`.
  3. **Sourcing rule:** every number and claim in this lane comes from a
     constant in `src/lib/crop/` or from the already-published
     `/experiments/id-photo-studio` note. Nothing new is asserted; nothing is
     embellished. This is the Content & Writing Style Guide rule applied
     literally.
  4. **No documentation links in UI.** The lane links to
     `/experiments/id-photo-studio` and `/remove-background` only — `docs/`
     is not published, so no citation may point into it.
  5. The lane closes with the existing Lab-note cross-link and the background
     remover cross-link, so the three surfaces stay connected in both
     directions.

---

## 5. UI/UX Considerations

- **Mode switch.** Reuse the treatment already proven by the Lab ledger's
  filter bench (`src/pages/experiments/index.astro`): `rounded-md` plates,
  2.5px structural border, active plate `bg-primary text-bg border-text`,
  inactive plate `bg-surface border-border-custom text-text-muted` with a
  `hover:text-text` transition. No pills (pills belong to chips and tags), no
  tabs-with-underline invention, no icons on the tabs.
- **Page composition** stays single-container: eyebrow → `h1` → lead → mode
  switch → active panel → chessboard divider → cross-links. The record lane
  is one column at a 68ch measure, matching the Ledger entry records.
- **Bench layout** keeps the existing `lg:grid-cols-5` split (plate 3,
  controls 2) because it already reads correctly on desktop; mobile stays one
  column with each primary action directly beneath the control it belongs to.
  No sticky action bars — they would cover the plate.
- **Stage plates** are cards in the system's sense: `bg-surface`, 2.5px
  `border-border-custom`, `rounded-sm`, `p-6`, flat at rest, hard-offset
  shadow only on interaction. Locked plates are dashed and carry the reason
  for the wait in their stamp.
- **The plate (canvas)** is the focal moment: hairline frame, two-tone guide,
  token-bound checkerboard, and the readout beneath it in mono metadata type.
- **Print helper** is a small stamped note inside `03 · Export`, never a modal
  and never a blocking interstitial.
- **Copy register** (Content & Writing Style Guide): tabs read `Studio` and
  `How it works`; stamps read verbs and outcomes (`choose`, `loaded`,
  `cut out`, `printed`, `waiting for a photo`); the consent panel states facts
  in plain language without scare tactics; existing error strings are reused
  verbatim; no superlatives, no "seamless"/"effortless", no invented
  benchmarks; the existing "free tool" framing matches the published Lab note.
- **Dark mode** is a first-class verification target, not an afterthought: the
  plate, the guide, the checkerboard, and the stamps are inspected in both
  modes at desktop and mobile widths.
- **Motion** stays in the existing vocabulary: short reveals, hard edges, no
  bounce, no easing theatre, and `prefers-reduced-motion` bypasses all of it.

---

## 6. Technical Considerations

- **Component boundaries.** `src/pages/crop.astro` owns the header, the mode
  switch, the record lane, and the cross-links (all static). The
  `CropStudio` island keeps owning the bench only, still mounted
  `client:visible`, coordinating modular subcomponents in `src/components/crop/`
  (`SourceStage`, `FrameStage`, `ExportStage`, `StageHeader`, `useCropCanvas`). New: `src/lib/crop/stamps.ts` for the stage vocabulary.
- **State machine.** Extend the island's `Stage` union to
  `idle → ready → consent → removing → removed`, with abort returning to
  `ready`; add a separate `isReading` flag for file probe/downscale so a
  second drop cannot race the first.
- **Abort safety.** `removeBackgroundInBrowser` is not cancellable, so
  correctness comes from a monotonic run token: a resolved promise whose token
  is stale is discarded and never mutates state.
- **Hydration-safe storage.** The island is server-rendered then hydrated
  (`client:visible`), so `localStorage` and `getComputedStyle` reads happen in
  effects, never during render. The mode switch runs page-level after DOM
  parse, so it may read `localStorage` directly, but must handle a throwing
  store (private mode) by falling back to Studio.
- **Canvas theming.** Resolve the ink/paper pair and the checkerboard greys
  from CSS custom properties via `getComputedStyle` on the stage element at
  draw time, and re-draw when the theme changes. The theme is the `dark` class
  on `document.documentElement` (`ThemeToggle.astro`,
  `BaseLayout.astro:147-154`), so a `MutationObserver` on that attribute is
  the change signal; disconnect it on unmount.
- **Checkerboard utility.** Add one plain class in `src/styles/global.css`
  beside the existing custom classes (`.chess-grid`, `.prose-custom`,
  `.toc-link` — this file uses plain CSS classes, not Tailwind `@utility`),
  built from token variables, and use it for both the canvas background and
  the `/remove-background` result preview so the two surfaces share one
  definition.
- **Stale-export invalidation.** An effect keyed on source, box, zoom, preset,
  background, and format clears `exportUrl`, so a pinned download anchor can
  never serve bytes that disagree with the preview.
- **Preserved contracts.** `ID_PRESETS`, `EXPORT`, `REMOVAL_MODEL`,
  `validateFileMeta`, `validateExportOpts`, `clampPanOffset`, `repanForZoom`,
  `initialFrame`, `faceGuideForPreset`, `fitWithinCap`, and
  `removeBackgroundInBrowser` keep their signatures and behaviour. Export
  targets stay 600 px and 300 px at 300 DPI.
- **Telemetry** stays exactly as it is: `POST /api/crop/usage` with
  `{ event, preset, ms }`, fired best-effort on export and on successful
  removal. No new event names are introduced by this plan (an `aborted` event
  would widen the API contract and is parked).
- **No new dependencies.** Everything here is platform APIs (canvas, drag
  events, clipboard, `MutationObserver`, `localStorage`) plus existing code.
- **TypeScript** stays strict: no `any`, no non-null assertions added, new
  helper types exported from `stamps.ts`.

---

## 7. Edge Cases & Risks

- **`client:visible` + a hidden panel (the trap in this plan).** The island
  hydrates on intersection. If a visitor deep-links `?mode=record`, the Studio
  panel starts `hidden`, so the bench may not hydrate until it is shown. The
  observer is expected to fire once the panel is unhidden, but this must be
  verified explicitly; if it does not, the fallback is `client:idle` (never
  `client:load`, which would ship the island eagerly on a page most visitors
  read without using).
- **EXIF-rotated phone photos.** Browsers apply orientation when rendering an
  `<img>`, but the export samples the decoded bitmap. A real portrait with
  EXIF orientation 6 must be verified end to end; if preview and export
  disagree, orientation must be normalized explicitly before drawing.
- **Very large uploads.** The 4000 px cap and `fitWithinCap` downscale stay,
  and the readout must report coordinates in the coordinate space actually
  being sampled so the numbers never lie.
- **Low-memory devices.** The ~40 MB model plus a 4000 px bitmap can fail on
  old phones. Failure stays non-fatal; the export path must remain usable
  without removal (background intact), and the error must say what failed in
  plain language.
- **Offline or flaky connections.** The model fetch fails mid-way; the abort
  control and the retry must both work, and the message must not blame the
  visitor or use technical jargon.
- **Screenshots and non-portraits as input.** A pasted screenshot is a valid
  file; there is no face detection, so the guide is advisory. Copy must never
  imply government compliance ("PH ID compliant") — only the physical size and
  DPI facts are stated.
- **Transparent PNG sources.** Preserve alpha; JPEG export flattens over the
  chosen background and says so.
- **Tiny sources zoomed hard.** The existing "zoomed past the photo's
  resolution" disclosure stays and must keep its wording (E2E pins it).
- **Mode deep link and history.** The switch uses `history.replaceState` so
  the back button is not turned into a mode toggle, while `?mode=` still works
  as an entry point. A throwing storage API falls back to Studio.
- **Touch scrolling on the plate.** The canvas keeps `touch-none` (required so
  dragging frames rather than scrolls). The plate must keep visible margins so
  a visitor always has a lane to scroll the page on a 390 px viewport.
- **Test-contract risks (explicit).** The existing `crop-studio.spec.ts`
  assertions that constrain this design: the three step headings and the
  empty-state string `No portrait yet. Choose a photo first.` must remain
  visible together (so a locked `02` row still renders that line), the
  `Export 2x2 photo` button must remain in the DOM and disabled before a photo
  loads (so locked stages render their primary control disabled), the
  guide toggle must **not** invalidate the export (the test asserts
  byte-identical output when only the guide flips), and `#crop-zoom` plus the
  `data-crop-hydrated` attribute keep their exact ids.
- **New markup, new violations.** Adding `/crop?mode=record` to the axe suite
  may surface violations in the new record lane; fixing them is part of the
  phase, not a follow-up.

---

## 8. Implementation Plan

1. **Docs first (this change):** spec `0009`, roadmap `0009.1`, the surface
   brief at `.impeccable/surfaces/src-pages-crop-astro.md` (a local,
   gitignored design artefact), and the plans index rows. No code.
2. **Phase 1 — safe wins, shippable alone:** add `/crop` to
   `tests/accessibility/a11y.spec.ts`; give the canvas its focus-visible ring;
   move the error row onto existing tokens and drop the `rose-*` palette and
   wash. Verify the full suite; the page is already better with no structural
   change.
3. **Phase 2 — bench spine:** `src/lib/crop/stamps.ts`, progressive disclosure
   across the three stages, Manrope step titles with mono ordinal eyebrows,
   preserving every pinned string and control from section 7.
4. **Phase 3 — intake:** drop zone, paste, secondary camera input, one
   `handleFile` funnel, busy state, error proximity.
5. **Phase 4 — consent and abort:** consent panel from `REMOVAL_MODEL`, run
   token, abort control, consent flag written only after success.
6. **Phase 5 — export:** one-click download behind the pinned anchor, live
   format control with the flattening disclosure, stale-export invalidation
   (guide toggle excluded), print helper.
7. **Phase 6 — canvas:** two-tone frame and guide, token-bound colours read at
   draw time, theme-change redraw, shared checkerboard class in `global.css`
   applied to the canvas and the `/remove-background` preview.
8. **Phase 7 — modes and record lane:** page-level tablist in `crop.astro`
   with the full conforming-tabs contract, deep link, storage fallback,
   no-script stacked panels, and the four sourced record blocks.
9. **Phase 8 — accessibility parity:** numeric readout, nudge buttons,
   `role="group"` canvas with `aria-describedby`, split live region,
   debounced announcements, native radios.
10. **Phase 9 — verification and record:** run the suite per phase, then a
    batched screenshot round (desktop 1440 px and mobile 390 px, light and
    dark, both modes, over white and black test photos), the Impeccable
    detector over the changed files, then update `docs/Changelog.md` and mark
    the roadmap phases verified.
11. **Parking lot (future `Feature N`):** print-sheet export (tile 2×2s on a
    4×6 in sheet); rectangular passport ratios; worker offload for inference;
    `compute:*` progress surfacing; a semantic `danger`/alert token pair
    (**requires owner approval** before it touches `tokens.css` or DESIGN.md);
    fixing the two mislabelled tablists in `projects/index.astro` and
    `CoreMindsetCarousel.tsx`; an `aborted` telemetry event (widens the API
    contract); localization.

---

## 9. Acceptance Criteria

### Feature 1 — Two-mode surface

- [ ] `Studio` is the default mode and switching modes performs no navigation
      and no reload.
- [ ] The tablist is conforming: `aria-selected`, `aria-controls`, roving
      tabindex, Arrow/Home/End selection, `role="tabpanel"` panels with
      `aria-labelledby` and `tabindex="0"`.
- [ ] `?mode=record` opens the record lane; `?mode=studio` is the explicit
      default; an invalid value falls back to Studio silently.
- [ ] With JavaScript disabled both panels render stacked, tabs are not dead
      controls, and every record-lane fact is readable.
- [ ] The mode switch is one tab stop and loses no focus when panels toggle.

### Feature 2 — Studio bench spine

- [ ] Exactly one stage is expanded at any time; the other two render as
      stamped rows.
- [ ] Stage stamps exist for `waiting`, `current`, `done`, and `locked`, and
      `locked` rows state what they are waiting for.
- [ ] Step titles render in Manrope with mono ordinal eyebrows; no Fraunces
      appears below the page `h1`.
- [ ] Loading a photo advances the spine; a completed removal stamps
      `cut out`; a successful export stamps `printed`.
- [ ] Expanding a stage neither steals focus nor loses it; the change is
      announced through the live region.
- [ ] Reveals are bypassed under `prefers-reduced-motion`.

### Feature 3 — Intake

- [ ] A picked, dropped, or pasted image all reach the same validated state
      through one code path.
- [ ] Rejections produce the existing error strings, rendered inside the stage
      that produced them.
- [ ] The gallery control keeps `id="crop-file"`, its `accept` list, and
      label-driven activation; no `capture` attribute is forced on it.
- [ ] A secondary camera control exists and degrades to a file picker on
      desktop.
- [ ] While a file is being read, further drops are ignored and a pending
      state is visible.

### Feature 4 — Consent-first removal with abort

- [ ] The first removal cannot start without the explicit consent action.
- [ ] The consent panel states the approximate download size, the one-time
      cached nature, and the on-device processing guarantee before the fetch.
- [ ] The consent flag is written only after a successful first load, and a
      failed load re-asks.
- [ ] Aborting returns the stage to `ready` with the photo and framing intact
      and the removal available again.
- [ ] A stale run cannot flip the stage after an abort (run-token guard).
- [ ] Removal failure remains non-fatal, inline, and retryable with unchanged
      copy.

### Feature 5 — Export and print helper

- [ ] One action produces the download while `a[download="id-photo-2x2.png"]`
      and `a[download="id-photo-1x1.png"]` remain real anchors with correct
      filenames.
- [ ] The output facts (preset label, pixel size, DPI) are read from
      `ID_PRESETS`/`EXPORT`, never literals.
- [ ] PNG preserves transparency; JPEG flattens it and the UI says so.
- [ ] Any composing change invalidates a previous export, except toggling the
      face guide, which must leave export bytes identical.
- [ ] A factual print helper appears in `03 · Export`.

### Feature 6 — Design-system conformity and canvas

- [ ] No gradient, no semi-transparent colour wash, and no raw palette
      (`rose-*` etc.) value appears in the touched components.
- [ ] Frame and face guide remain legible over a white photo and a black
      photo.
- [ ] The checkerboard and both hairlines follow the active theme without
      hardcoded values in the component.
- [ ] One checkerboard definition serves the canvas and `/remove-background`,
      with no layout or behaviour change on the sibling page.
- [ ] The framing surface shows a visible focus ring.

### Feature 7 — Accessibility parity

- [ ] `/crop` and `/crop?mode=record` are in the axe route list and report
      zero violations in every configured browser.
- [ ] The framing job is completable with the keyboard alone and with a
      screen reader, via the readout and nudge controls, without touching the
      canvas key handler.
- [ ] Pan/zoom changes are announced on a debounce, and instructions are never
      re-read as a live announcement.
- [ ] Preset and background choices are native radios inside
      `fieldset`/`legend` with no duplicated `aria-label`.
- [ ] Primary actions are ≥44 px, secondary controls ≥32 px, and the pinned
      accessible names are unchanged.

### Feature 8 — Record lane

- [ ] The lane renders with JavaScript disabled and ships no island.
- [ ] Every number and claim traces to a constant in `src/lib/crop/` or to the
      published `/experiments/id-photo-studio` note; no compliance is implied.
- [ ] No link points into `docs/`; cross-links to the Lab note and the
      background remover work in both directions.

### Global

- [ ] No new dependencies.
- [ ] No API contract change: `/api/crop/config`, `/api/crop/usage`
      (metadata-only), `/api/crop/remove` (`501`) behave as before.
- [ ] No image bytes are persisted or transmitted anywhere new.
- [ ] Export targets stay 600 px (`2x2`) and 300 px (`1x1`) at 300 DPI.
- [ ] Existing `crop-studio.spec.ts` and `crop-api.spec.ts` pass, with any
      legitimate assertion change made explicitly in the same commit.
- [ ] `format`, `lint`, `check` (0 errors, `check-links` SUCCESS), `build`,
      `test:e2e`, and `test:a11y` all pass.
- [ ] The Lighthouse performance budget is not regressed (the record lane adds
      no JavaScript).

---

## Change Log

| Date       | Change                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-15 | Initial draft: Features 1-8 (two-mode surface, bench spine, intake, consent-first removal, export and print helper, design-system conformity, accessibility parity, record lane) plus parked items in section 8. Decisions 1-4 recorded at the 2026-09-15 plan review. |
