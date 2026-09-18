# Image Editing Improvements

<callout icon="♞">**Status:** Draft · **Owner:** Sam · **Date:** 2026-09-11</callout>

Improves the image-editing experience for document photos (primarily
Philippine 2x2 and 1x1 ID photos) on `/crop`: a freely movable image under a
fixed crop frame, a face-placement guide overlay, and a dedicated
background-removal page without cropping.

Related work (read before implementing): [0006 ID Photo Studio
Specification](0006-id-photo-studio-specification.md), [0006.1 backend
roadmap](0006.1-id-photo-studio-backend-roadmap.md), and [ADR
0008](../decisions/0008-crop-thin-backend-client-removal.md) (client-side
removal, thin Workers backend, no image bytes on the server).

---

## 0. How to extend this document

Each improvement lives in its own `Feature N` block under section 4 with
matching acceptance checkboxes under section 9. Shared concerns stay in
sections 5-7 so new features reuse them.

To add a feature later:

1. Append `### Feature N — <name>` under section 4 using the same
   sub-bullets (Objective, Expected behavior, Detailed requirements).
2. Append matching acceptance checkboxes under section 9.
3. Add non-goals or follow-ups to section 8 step 5 (parking lot), not inline.
4. Add a row to the Change Log at the bottom. Do not renumber existing
   features.

---

## 1. Objective

Preparing an ID photo is the primary job of `/crop`, and the current editor
makes that job harder than it should be:

- Framing is inverted from what users expect: the photo is fixed and a
  small box moves over it, so placing face, crown, and shoulders precisely
  takes many fiddly drags.
- There is no composition aid: first-time visitors guess at head size and
  shoulder placement for a document photo.
- Removal and cropping are coupled on one page, so a visitor who only wants
  a transparent PNG must walk through crop UI that is irrelevant to them.

This plan fixes those three problems while preserving what works today:
on-device removal, canonical presets from `src/lib/crop/presets.ts`,
metadata-only telemetry, and the 600/300px export contract.

---

## 2. Current Behavior

Implementation: `src/pages/crop.astro` plus the `CropStudio` React island
(`client:visible`); presets, guards, and model metadata come from
`src/lib/crop/presets.ts` and `src/lib/crop/validation.ts`.

- Upload validates JPEG/PNG, 8 MB, 4000 px per side, then downscales
  oversize images and seeds a centered square box in natural image pixels.
- Preview is a square stage letterboxing the whole portrait; a dim layer
  plus white frame marks the box. The box moves via pointer drag and
  keyboard (`Arrow` = 4 px, `Shift+Arrow` = 20 px). Zoom scales image and
  frame together.
- Export samples the box (`drawImage(box to 600/300px)`), fills the chosen
  background, and offers a data-URL download.
- Removal is a lazy `@imgly/background-removal` import on the main thread
  with fetch-only progress; failure is non-fatal and telemetry is
  metadata-only (`POST /api/crop/usage`).

Limitations for this plan: the image never moves (only the box does); no
guide shows correct head size or shoulder position; no removal-only path
exists. Known context (not solved here): preview softness from whole-image
fit versus box-sampled export, and main-thread inference freeze during
`compute:inference`.

---

## 3. Expected Behavior

- On `/crop`, the crop frame stays fixed and the photo moves underneath it
  (drag, touch-drag, keyboard, zoom), with the frame always fully covered:
  no empty gaps, and the export matches the framed view.
- A subtle, toggleable face-placement guide (head oval, shoulder line)
  overlays the frame, adapts to the selected preset, and never appears in
  the exported file.
- A separate removal-only page lets a visitor upload, remove the
  background, compare original versus result, and download a
  transparency-preserving PNG — with no crop frame, guide, or crop
  controls present.

---

## 4. Feature Requirements

### Feature 1 — Freely movable image

- **Objective:** make face, head, and body placement fast and precise by
  panning the photo under a fixed frame instead of chasing a moving box.
- **Expected behavior:** the frame is fixed (centered square); the image
  pans horizontally and vertically via pointer drag, single-finger touch
  drag, and keyboard. Zoom scales **only the image** underneath the
  frame — the frame and face guide never move or resize. (Amended
  2026-09-11: the original wording let zoom scale the shared fit
  transform, which magnified frame and guide together — see the Change
  Log.)
- **Detailed requirements:**
  - Pan state is stored in natural image pixels (image origin offset
    relative to the frame), separate from zoom; drag maps screen delta
    through the shared fit transform (`1 / fitScale`), as today.
  - Coverage invariant: after every pan, zoom, preset switch, or resize,
    the frame must lie fully inside the image bounds — clamp offsets so no
    empty area appears inside the frame.
  - Zoom is a composition control, not a screen magnifier (amended
    2026-09-11): at `zoom = 1` the cover fit holds (the image's shorter
    side spans the frame); `zoom > 1` shrinks the sampled region
    (`sampledSizeForZoom`: side = `minSide / zoom`) so the face can grow
    relative to the guide. Slider range `[1, 4]`; frame center anchored
    on change; re-clamped on every change. Zooming past the source
    resolution is allowed and must surface an honest softness note
    rather than being blocked.
  - Keyboard parity: the canvas keeps `Arrow` = 4 px and `Shift+Arrow` =
    20 px semantics, now moving the image.
  - Pointer and touch share one code path (pointer events plus
    `setPointerCapture`); no mouse-only behavior.
  - Export maps the fixed frame back to source pixels and samples it
    exactly as framed — the existing `drawImage(box to target)` geometry,
    with the box derived from pan offset plus frame size.
  - Reduced-motion users get identical final framing (motion affects only
    transitions, never geometry).

### Feature 2 — Face placement guide

- **Objective:** help visitors size and center head and shoulders correctly
  for a document photo on the first try.
- **Expected behavior:** a subtle overlay inside the frame shows recommended
  head (oval) and shoulder (arc or line) placement; it assists but never
  locks the image.
- **Detailed requirements:**
  - Rendered only in the preview `draw()` path (canvas overlay or
    positioned SVG); the export path must not draw it.
  - Toggleable (default on), with a labelled, keyboard-reachable toggle;
    state need only persist per page session.
  - Proportions adapt to the selected preset (`2x2` vs `1x1`) from the
    canonical preset data — no hardcoded pixel ovals elsewhere.
  - Visual style: hairline strokes in theme tokens, low-contrast, no fill
    that obscures the face; decorative (`aria-hidden`) with a text
    alternative describing the recommended placement nearby.
  - Never intercepts pointer or keyboard events (pointer-transparent).

### Feature 3 — Dedicated background-removal page

- **Objective:** give visitors who only want a transparent-background image
  a focused tool with zero crop concepts.
- **Expected behavior:** a new route (proposed `/remove-background`) with
  upload, remove, compare, download; no crop frame, guide, preset radios,
  zoom, or export-size controls appear on this page.
- **Detailed requirements:**
  - Reuses the existing removal pipeline (lazy `@imgly` import, progress,
    cutout object URL, metadata-only `POST /api/crop/usage`) and the model
    honesty copy (`REMOVAL_MODEL`) — extract shared logic rather than
    duplicating it.
  - Shows original and result side by side (or a before/after toggle) with
    a checkerboard behind the result to communicate transparency.

---

## 5. UI/UX Considerations

- **Layout:** `/crop` keeps its three-step workbench (source, frame,
  export); the frame canvas becomes the pan surface with a visible grab
  affordance, and the guide toggle sits beside the zoom control. The
  removal page is a simpler two-panel layout (original, result) plus one
  primary action.
- **Controls:** reuse existing primitives and token classes
  (`border-structural`, `bg-surface`, `text-text-muted`); no hardcoded hex;
  theme-aware `<DoodleIcon>` SVGs only, never system text emojis (per
  [AI Guidelines](../engineering/AI-Guidelines.md)).
- **Responsive:** single-column flow works at 390 px widths; frame canvas
  stays square via `aspect-ratio`; touch targets meet 44 px minimum;
  `ResizeObserver` keeps the stage crisp on resize.
- **Accessibility (WCAG 2.2 AA):** labelled file input, live status region
  for removal progress and framing announcements, visible focus rings,
  keyboard-operable pan surface, instant motion under
  `prefers-reduced-motion`, and a text alternative for the guide.
- **Copy voice:** follow
  [ContentStyleGuide](../engineering/ContentStyleGuide.md) — clear, honest,
  evidence-driven. Keep the on-device honesty panel on both pages.

---

## 6. Technical Considerations

- **Image model:** source and cutout stay as `HTMLImageElement` refs in
  natural pixels; pan offset plus zoom derive the export box. Keep one
  shared fit transform so preview and export agree.
- **Rendering:** `drawImage` with high smoothing quality for downscale
  paths; guide drawn after the frame in the preview pass only.
- **Removal:** unchanged lazy `@imgly` import on the main thread for v1;
  extract the pipeline into shared logic when the second page lands so
  both pages share progress, object-URL lifecycle, and usage telemetry.
- **Transparency:** cutout is a PNG with alpha; `/crop` composites it over
  the chosen background at export, while the removal page downloads the
  alpha directly. Checkerboard in previews signals transparency.
- **Guards:** `validateFileMeta` (JPEG/PNG, 8 MB, 4000 px) and
  `validateExportOpts` apply on both pages; `/crop` export targets stay
  600 px (`2x2`) and 300 px (`1x1`) from `ID_PRESETS`.
- **Constraints:** no new npm dependencies without explicit permission;
  `.astro` static pages with React islands only for interactive surfaces
  (per [ADR 0006](../decisions/0006-use-react-only-for-interactive-islands.md));
  design tokens via `@theme` in `src/styles/global.css`.

---

## 7. Edge Cases & Risks

- Zoom 1 always covers (the cover fit pins the image's shorter side to
  the frame); pan freedom exists only along the longer side until the
  user zooms in. Export unaffected.
- Very small source (for example the 64 px test asset): upscale-on-export
  accepted (existing behavior); guide still fits.
- Oversize upload (over 8 MB or 4000 px side): blocked with existing
  validator copy before processing.
- Removal failure or model stall: non-fatal, original stays editable, with
  existing failure copy and telemetry.
- Transparent choice on `/crop` plus JPEG format: flatten onto white and
  label it, or restrict format to PNG.
- Touch drag scrolling the page instead of panning: `touch-action: none`
  on the pan surface only.
- Guide misread as a crop requirement: toggle plus helper copy ("Guide
  only — it never exports.").
- Removal page deep-linked without an image: empty state with upload CTA;
  no broken compare panels.
- Object-URL leaks across repeated uploads or removals: revoke on replace
  and unmount.

---

## 8. Implementation Plan

1. **Feature 1 — pan model:** fix the frame, add clamped pan offset plus
   zoom-about-center, update drag, keyboard, and export mapping, extend
   `tests/e2e/crop-studio.spec.ts` (pan changes export bytes).
2. **Feature 2 — guide overlay:** preview-only overlay with preset-aware
   proportions, toggle, and text alternative; assert absence from export
   bytes.
3. **Feature 3 — removal page:** extract shared removal logic, add the new
   route plus Lab entry, add E2E (mock the 40 MB model, assert transparent
   PNG download, assert no crop selectors exist).
4. **Full verification per feature:** `format`, `lint`, `check`
   (typecheck plus `check-links.js`), `build`, `test:e2e`, `test:a11y`.
5. **Parking lot (future Feature N):** non-square passport ratios, worker
   offload for inference, `compute:*` progress surfacing, small-image
   upscale warnings.

---

## 9. Acceptance Criteria

### Feature 1 — Freely movable image

- [ ] Image pans horizontally and vertically via mouse drag, touch drag,
      and keyboard (Arrow 4 px, Shift+Arrow 20 px).
- [ ] No pan, zoom, preset switch, or resize exposes empty area inside the
      frame; export pixels always come from the source image.
- [ ] Exported `2x2` (600 px) and `1x1` (300 px) files reflect the framed
      view at 390 px and desktop widths.
- [ ] Existing upload guards and background choices behave as before.
- [ ] Zoom scales only the image: the frame and guide stay pinned while
      zooming, and increasing zoom changes the exported framing (asserted
      by export-byte diff).
- [ ] Zooming beyond the photo's resolution is allowed; the UI discloses
      the softness with a visible note and this spec documents the limit.
- [ ] Zoom and pan never modify the source image; export samples the
      source at natural coordinates with high smoothing quality.

### Feature 2 — Face placement guide

- [ ] Guide renders by default, adapts to `2x2` vs `1x1`, and toggles off.
- [ ] Guide is pointer-transparent, keyboard-inert, and has a text
      alternative.
- [ ] Exported file contains no guide pixels (guide on versus off yields
      identical output).

### Feature 3 — Dedicated background-removal page

- [ ] Page shows upload, remove, original-versus-result preview, and
      download with no crop frame, guide, preset, zoom, or size controls.
- [ ] Download is a transparency-preserving PNG (alpha intact).
- [ ] Same upload guards and non-fatal failure behavior as `/crop`; no
      image bytes reach Workers (metadata-only telemetry).

---

## Change Log

| Date       | Change                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-11 | Initial draft: Features 1-3 (movable image, face guide, removal page).                                                                                                |
| 2026-09-11 | Amendment (Feature 1): zoom is an image-only composition control — frame and guide pinned, range `[1, 4]`, upscaling allowed with disclosure; quality criteria added. |
