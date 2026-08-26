# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Changed **Core Mindset Carousel Pawn Travelator Anchoring** (`src/components/sections/CoreMindsetCarousel.tsx`, `tests/e2e/core-mindset-carousel.spec.ts`):
  - Replaced the pawn's viewport-center float behavior with a **moving-sidewalk model**: during scroll scrubbing, the 3D Pawn now rides 1:1 with its owned card instead of mirroring the smoothed track position and staying pinned near viewport center.
  - Added **card ownership with hysteresis hand-off** (`PAWN_ANCHOR_HYSTERESIS = 0.55`): ownership transfers to the neighboring card only after the scrubbed position drifts past the midpoint plus hysteresis, preventing flicker near midpoints while resting between slides.
  - Added **eased walk transition** (`PAWN_WALK_EASE = 6`, slower than the track's smoothing factor of 8): when ownership hands off, the pawn visibly walks across to its new card counter to the track motion.
  - Kept `prefers-reduced-motion` bypass: reduced-motion users get an instant snap to the nearest card with no walk animation, and the single-hop-per-gesture settle behavior remains unchanged.
  - Added Playwright E2E test verifying the pawn rests anchored to its nearest card when scrolling stops exactly between two slides (progress `0.375` → position `1.5`), asserting hysteresis keeps ownership on the earlier card.

- Fixed **Core Mindset Carousel Track Styling, Viewport Bounds & Touch Swipe E2E Tests** (`src/components/sections/CoreMindsetCarousel.tsx`, `tests/e2e/core-mindset-carousel.spec.ts`, `.gitignore`):
  - Switched carousel container overflow styling from `overflow-hidden` to `overflow-clip` to avoid unintended scroll container creation while preserving clean card boundary clipping.
  - Added `gap-6` inter-card spacing to the slide track container to maintain consistent visual separation across slide transitions.
  - Added Playwright E2E tests verifying active card horizontal containment within viewport boundaries on later slides and verifying horizontal touch swipe gesture navigation on mobile devices.
  - Added `.kilo/` workspace settings directory to `.gitignore`.

- Added **Chess Checkmate, Pawn Promotion & Contributor Tracking System** ([0004.3 Roadmap](plans/0004.3-chess-checkmate-and-promotion-roadmap.md), [0004.2 Specification](plans/0004.2-chess-checkmate-and-pawn-promotion-plan.md)):
  - Implemented **Interactive Pawn Promotion Modal** ([PromotionModal.tsx](../src/components/chess/PromotionModal.tsx)): In-board Woodcut popover dialog prompting players to select Queen, Knight, Rook, or Bishop when promoting pawns to rank 8/1.
  - Implemented **Finished Game Archival & Reset API** ([reset.ts](../src/pages/api/chess/reset.ts), [archive.ts](../src/pages/api/chess/archive.ts)): `POST /api/chess/reset` archives finished matches into D1/memory, resets match board position to initial FEN, resets match contributor counts, and re-assigns team cookies.
  - Added **Checkmate Victory Banner & Piece Identification QoL Labels** ([ChessWidget.tsx](../src/components/chess/ChessWidget.tsx), [ChessBoard3D.tsx](../src/components/chess/ChessBoard3D.tsx)): Displays victory header upon checkmate with a "Start New Match" button, alongside floating piece name label pill badges (`White Knight on g1`) on hover/tap.
  - Enhanced **Game Details & History Modal** ([GameDetailsModal.tsx](../src/components/chess/GameDetailsModal.tsx)): Displays both **Current Match Contributors** and persistent **All-Time Total Visitors**, alongside archived completed match records with one-click "Copy PGN" export buttons.
  - Added **Web Audio Synthesizers** ([audio.ts](../src/lib/chess/audio.ts)): Synthesized C-major victory fanfare (`playCheckmate()`) and upward arpeggio flourish (`playPromotion()`).

- Fixed **Mobile Chess Board Touch Selection Bug** (`src/components/chess/ChessBoard3D.tsx`, `tests/e2e/chess.spec.ts`):
  - Removed duplicate `onPointerDown` event listener on chess square buttons that caused immediate double-triggering of piece clicks on touch devices, fixing the bug where selected pieces and legal move indicators briefly appeared and vanished on mobile.
  - Added Playwright E2E test suite (`tests/e2e/chess.spec.ts`) validating 3D/2D chess board square rendering and piece selection persistence across device viewports.

- Fixed **Playwright E2E (`test:e2e`) & Accessibility (`test:a11y`) Test Suite Execution & Hydration** (`playwright.config.ts`, `src/components/sections/CoreMindsetCarousel.tsx`, `src/components/chat/ChatWidget.tsx`, `src/layouts/BaseLayout.astro`, `tests/e2e/chat.spec.ts`, `tests/e2e/chess.spec.ts`, `tests/e2e/core-mindset-carousel.spec.ts`, `tests/e2e/navigation.spec.ts`, `tests/accessibility/a11y.spec.ts`):
  - Configured Playwright `webServer` (`playwright.config.ts`) to execute `astro dev` with `ASTRO_DEV_BACKGROUND: "1"` and stable worker allocation (`workers: 2`), eliminating Vite cache invalidation contention and SSR hook errors during parallel test runs.
  - Resolved `chat.spec.ts` race conditions by eliminating redundant `page.reload()` in `beforeEach`, utilizing `page.addInitScript()` for deterministic localStorage initialization, and ensuring `window.__portfolio_chat_requested` is tracked alongside `open-portfolio-chat` event dispatching.
  - Updated `chess.spec.ts` piece selection test to dynamically query `/api/chess/state` for the player's assigned team (`yourSide`), dynamically asserting against the player's own White or Black pawn with `expect().toPass()`.
  - Upgraded `CoreMindsetCarousel.tsx` pagination indicators with WCAG-compliant `min-h-[44px] min-w-[44px]` touch targets, added `pointer-events-none` to the decorative horizontal track line, and extended `scrollLockoutUntilRef` to 4000ms to prevent programmatic slide transitions from being overwritten by delayed scrolljacking events in WebKit and Chromium.
  - Added pre-hydration click listener tracking (`window.__portfolio_chat_requested`) in `ChatWidget.tsx` and `BaseLayout.astro`, preventing missing modal open event triggers prior to React hydration.
  - Updated `core-mindset-carousel.spec.ts` test setup with `toBeVisible({ timeout: 15_000 })` to accommodate 3D WebGL bundle hydration on 2-core Linux CI virtual machines.
  - Safeguarded `THREE.WebGLRenderer` initialization in `ThreePawnCanvas.tsx` with a `try / catch` context fallback, preventing headless Linux Firefox React component unmounting when WebGL hardware rasterization is unavailable in CI environments.
  - Added `waitUntil: "domcontentloaded"` and `waitForLoadState("load")` in `a11y.spec.ts`, achieving 100% clean WCAG 2.2 AA accessibility audit passes across 8 core routes in all 5 target environments (40/40 tests passed, 100/100 E2E tests passed).

- Fixed **Core Mindset Carousel & E2E Navigation Tests** (`src/components/sections/CoreMindsetCarousel.tsx`, `src/components/sections/CoreMindset.astro`, `tests/e2e/navigation.spec.ts`):
  - Fixed `ReferenceError: isMobile is not defined` in `tests/e2e/navigation.spec.ts` by adding `isMobile` to the test fixture destructuring parameters.
  - Added explicit `onKeyDown={(e) => handleKeyDown(e, i)}` handlers to pagination tab buttons in `CoreMindsetCarousel.tsx`, fixing Firefox keyboard arrow navigation (`ArrowRight` / `ArrowLeft`).
  - Switched `CoreMindsetCarousel` island directive from `client:visible` to `client:load` in `CoreMindset.astro`, ensuring event handlers hydrate immediately on page load.

## [1.2.0] - 2026-08-09

- Fixed **GitHub Actions CI Workflow & Build Scripts** (`.github/workflows/ci.yml`, `astro.config.ts`, `package.json`):
  - Removed explicit `version: 11` parameter from `pnpm/action-setup@v4` steps in `.github/workflows/ci.yml`, resolving pnpm version mismatch error with `packageManager` in `package.json`.
  - Removed deprecated and invalid `mode: "advanced"` property from `cloudflare()` adapter configuration in `astro.config.ts`, resolving TypeScript error with `@astrojs/cloudflare` v14+.
  - Added `esbuild` to `devDependencies` in `package.json` so Cloudflare Pages CI build containers can execute the worker bundling script (`esbuild dist/server/entry.mjs ...`).

- Added **Release & Versioning Workflow Specification** (`docs/engineering/ReleaseWorkflow.md`, `docs/README.md`):
  - Documented the multi-branch Git strategy (`bug-fixes` / feature branch → `main`), step-by-step version tagging flow (`package.json`, `Changelog.md`, Git tags), dynamic sidebar footer versioning, and Cloudflare auto-deployment pipeline.

- Refined **Dynamic Sidebar Footer Version Binding** (`src/layouts/BaseLayout.astro`, `package.json`):
  - Wired the desktop sidebar footer version string (`v{pkg.version}`) dynamically to `package.json`, ensuring the UI footer automatically stays synced with project releases.

- Refined **Chess Widget Alert Banner Vector SVG Icons** (`src/components/chess/ChessWidget.tsx`):
  - Replaced system text warning emojis (`⚠️`) in the King in Check alert banner with `src/assets/chess-icons/blunder.svg` vector SVG artwork, enforcing the repository's strict Emoji & UI Icon Rule.

- Refined **Interactive Avatar Mobile Badge Layout** (`src/components/primitives/InteractiveAvatar.astro`):
  - Added `whitespace-nowrap` and responsive font size tracking (`text-[9px] md:text-[10px]`) to the `Hover for Photo` pill badge, preventing text from breaking into two stacked lines on small mobile screens.

- Implemented **Production Live GitHub Contributions Edge API & Rebuild Cron** (`src/pages/api/github/contributions.json.ts`, `src/components/islands/GitHubChessGrid.tsx`, `.github/workflows/ci.yml`):
  - Created a Cloudflare Edge Serverless API route (`/api/github/contributions.json`) that proxies and parses live GitHub contributions with a 1-hour CDN cache (`max-age=3600`), updating production contribution activity hourly without GitHub rate-limiting or CORS issues.
  - Updated client component `GitHubChessGrid.tsx` to fetch from `/api/github/contributions.json` on client mount, automatically re-hydrating the grid with live commits.
  - Added a daily 12:00 AM UTC cron trigger (`0 0 * * *`) in `.github/workflows/ci.yml` to trigger automated daily builds.

- Adapted **GitHub Contributions Grid Mobile Responsiveness** (`src/components/islands/GitHubChessGrid.tsx`):
  - Implemented zero-horizontal-scroll mobile grid mode (<640px) that renders the most recent 20 weeks (~5 months) of contribution activity to fit 100% inside mobile phone screen widths without horizontal scrollbars.
  - Added an interactive mobile view toggle (`[Fits Screen]` vs `[Full Year]`) allowing mobile users to switch between zero-scroll recent activity and full 52-week horizontal scroll view on demand.
  - Refactored header username link and bottom legend layout for small screen viewports.

- Adapted **Section 02 Mobile Responsiveness, Horizontal Overflow & Touch Swiping** (`src/components/sections/CoreMindset.astro`, `src/components/sections/CoreMindsetCarousel.tsx`):
  - Fixed horizontal page overflow (`overflow-x-clip`) preventing mobile devices from swiping the entire webpage sideways.
  - Scoped 200vh sticky scrolljacking exclusively to desktop viewports (`md:min-h-[200vh] md:sticky md:top-0`), restoring smooth, un-trapped vertical scrolling on mobile touch screens (<768px).
  - Added native horizontal touch swipe gestures (`onTouchStart`/`onTouchEnd`) to allow intuitive card sliding on mobile phones.
  - Adjusted mobile slide width (`88%`), card padding (`p-5`), and 3D Pawn top-right corner offset (`3.0rem`) to prevent card text squeezing and badge overlaps.

- Polished **Section 02 Interaction Design & Focus States** (`src/components/sections/CoreMindsetCarousel.tsx`):
  - Added explicit focus ring styles (`focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2`) to pagination tab buttons.
  - Finalized optical alignment across 3D Turned-Wood Pawn header slot, responsive slide track, and keyboard navigation.

- Clarified **Section 02 H2 Heading Typography** (`src/components/sections/CoreMindset.astro`):
  - Removed duplicate `02.` numerical prefix from H2 heading text (`Core Mindset & Principles`), leaving ordinal tracking exclusively in the uppercase manuscript eyebrow (`02 · Opening Principles`).

- Hardened **Section 02 Accessibility & Motion Sensitivity** (`src/components/sections/CoreMindsetCarousel.tsx`, `src/components/sections/ThreePawnCanvas.tsx`):
  - Bound `prefers-reduced-motion` media queries across the carousel and 3D canvas: disables scale transforms, track sliding transitions, and 3D hop physics arcs for motion-sensitive users.
  - Enhanced keyboard focusability on slide cards (`tabIndex={0}`) with 2px blue focus rings (`focus-visible:ring-2 focus-visible:ring-focus`) and Enter / Space navigation support.

- Optimized **3D Pawn WebGL Render Loop Performance** (`src/components/sections/ThreePawnCanvas.tsx`):
  - Wrapped Three.js 60 FPS animation loop with an `IntersectionObserver` (`threshold: 0.05`) to pause `requestAnimationFrame` when Section 02 is off-screen.
  - Automatically resumes render loop when scrolling back into viewport, eliminating background GPU/CPU overhead.

- Adapted **Home Page Section 02 Carousel Mobile Viewports & Touch Targets** (`src/components/sections/CoreMindsetCarousel.tsx`):
  - Implemented responsive slide width scaling: 85% width on mobile viewports (<768px) with peek preview card margins, and 42% width on desktop screens (≥768px).
  - Dynamically adjusted WebGL 3D Pawn horizontal offset calculation based on mobile vs desktop slide width.
  - Enlarged touch target tap area on square pagination tab buttons to `44×44px` minimum using invisible pseudo-element bounds (`before:absolute before:-inset-3.5`) for WCAG 2.2 AA touch compliance.
  - Added keyboard focusability (`tabIndex={isActive ? 0 : -1}`) and keydown handlers (Enter / Space) to slide cards.

- Refined **Global Search Index & Removed Sample Placeholder Content** (`src/content/posts/`, `src/content/research/`, `src/pages/search.json.ts`, `src/pages/search.astro`, `tests/e2e/search.spec.ts`):
  - Removed sample placeholder posts (`raft-consensus-simulation.md`, `welcome-to-astro.md`) and sample research (`distributed-indexing-telemetry.md`) while preserving Content Layer schemas and route infrastructure for future real content.
  - Updated `search.json.ts` response headers to `Cache-Control: no-cache, no-store, must-revalidate` and added cache-busting `fetch("/search.json?t=" + Date.now(), { cache: "no-store" })` to prevent browsers from displaying stale cached search results.
  - Updated search input placeholder keywords to active project tags (`Type keywords (e.g. BITS, Architecture, Systems) to filter...`).
  - Updated search header description, page title, and status indicator text (`Type to search case studies and projects...`).
  - Replaced `@lucide/astro` Search icon with theme-aware `<DoodleIcon name="interface/search" />`.

- Redesigned & Refined **Home Page Section 02 Core Mindset & Principles** (`src/components/sections/CoreMindset.astro`, `src/components/sections/CoreMindsetCarousel.tsx`, `src/components/sections/ThreePawnCanvas.tsx`):
  - Fixed 3D Pawn top clipping during movement jump arcs by switching slides viewport to `overflow-visible`, expanding container dimensions (`h-24 md:h-28`), and optimizing Three.js camera vertical headroom.
  - Implemented realistic player move physics for `<ThreePawnCanvas />`: anticipation crouch, upward 3D arc hop, movement pitch tilt (leaning in direction of travel), and landing impact squash upon settling into the active card.
  - Added a 135° Back-Right Directional Cast Shadow plane behind the turned-wood 3D Pawn, with dynamic opacity falloff and height diffusion.
  - Aligned the 3D Pawn strictly INSIDE the active card's top header slot, moving in lockstep with the track container.
  - Converted Section 02 into a sticky scroll-driven section (`min-h-[220vh]` with `sticky top-0`) where vertical scrolling scrubs horizontally through cards before proceeding to Section 03.
  - Removed left/right arrow buttons and implemented connected-track square pagination (`size-4 rounded-xs bg-primary` on a horizontal line track) matching the user reference layout.

- Enhanced **Shared 3D Chess Board** (`src/components/chess/ChessBoard3D.tsx`, `src/components/chess/ChessWidget.tsx`, `src/lib/chess/audio.ts`):
  - Fixed mobile 3D piece touch interactions by adding `touch-manipulation`, pointer event bindings, and removing wrapper click interceptors.
  - Implemented 0ms latency Web Audio API synthesizer (`playClick()`, `playMove()`, `playCheck()`) for tactile wood contact pops, move thuds, and check alert chimes.
  - Added King in Check visual indicators: pulsing red check ring on the target King square, a `CHECK!` toast, and an animated alert banner (`⚠️ YOUR KING IS IN CHECK!`).

- Fixed **Live Chat Typing Latency & Desktop Performance** (`src/components/chat/ChatBox.tsx`, `src/components/chess/ChessWidget.tsx`, `src/components/chess/ChessBoard3D.tsx`):
  - Extracted `<ChatInputForm>` and `<MessageList>` into memoized components, completely isolating input typing state from the parent `ChatBox` modal.
  - Wrapped `ChessWidget` and `ChessBoard3D` in `React.memo` with stable callback refs (`onGameStateChangeRef`), preventing WebGL / 3D Canvas re-renders during keystrokes for instantaneous 60fps typing.

- Polished **Home Page Featured Case Studies Section** (`src/components/sections/FeaturedProjects.astro`):
  - Added app-icon / logo thumbnail containers (`size-14 md:size-16 rounded-2xl overflow-hidden`) to the left of each featured project title (hand-sketched `AvegaLogo` for BITS Timekeeping, `Logo` for Portfolio Architecture).
  - Configured dynamic grid layout (`grid-cols-2` when 2 projects present; `grid-cols-3` when 3 projects present) to maintain balanced spacing and future scalability.
  - Simplified card content to a clean 1-sentence description, removing outcome bullet points.
  - Redesigned tech stack badges into alternating chess board square tiles (`bg-surface text-text` vs `bg-text text-bg` with 1.5px ink border and hard press shadow).

- Refined **Home Page Background & Trajectory Section** (`src/components/sections/AboutSummary.astro`):
  - Dynamically aligned Biography, Philosophy, and Career Move Highlights directly with `src/content/pages/about.json`.
  - Removed redundant Quick Reference Index sidebar from the Home page layout.
  - Balanced Biography & Philosophy (7 cols) with mini Score Sheet Ledger Excerpt (5 cols) featuring Move 2 (Avega Shipping IT Internship), Move 4 (Active Repertoire), `Gochi Hand` signature block, and chess file coordinate strip (`a`–`h`).

- Enhanced **Work Page Project Photo Peek Preview for Mobile & Desktop** (`src/pages/projects/index.astro`):
  - Removed `hidden lg:block` desktop-only CSS restriction from `.peek-window` elements, enabling full screenshot photo previews across all screen sizes (mobile, tablet, desktop).
  - Added tap/click toggle interaction so mobile and touch users can tap project cards/thumbnails to toggle full screenshot photo previews on and off.
  - Added close button (`<DoodleIcon name="cross" />`) to preview window headers and added global click-outside dismissal.

- Removed **Lab & Learning Explorations Section on Home Page** (`src/pages/index.astro`, `src/components/sections/LabExplorations.astro`, `src/components/sections/AboutSummary.astro`, `src/components/sections/GitHubActivity.astro`, `src/components/sections/ContactCTA.astro`):
  - Removed Section 04 (`LabExplorations`) from the Home page (`/`) while research & lab content remains under construction/unreleased.
  - Re-indexed subsequent section numbers across Home page components: Background & Trajectory (`04`), GitHub Contributions (`05`), and Contact & Collaboration (`06`).
  - Removed unused `src/components/sections/LabExplorations.astro` component file.

- Migrated **Live Chat Transport from PartyKit WebSockets to HTTP Polling + Cloudflare KV** (`src/pages/api/chat/messages.ts`, `src/pages/api/chat/send.ts`, `src/components/chat/useChatSocket.ts`, `src/components/chat/ChatBox.tsx`, `src/components/chat/ChatWidget.tsx`):
  - Replaced WebSocket transport with HTTP polling at 3-second intervals after PartyKit's shared `partykit.dev` zone exceeded Cloudflare's 10,000 custom domain limit, making `npx partykit deploy` unavailable.
  - Chat API routes (`/api/chat/messages`, `/api/chat/send`) now read and write from Cloudflare KV (`CHAT_KV` binding) for cross-isolate shared state in production, with an in-memory fallback for local development.
  - Refactored `useChatSocket.ts` from a WebSocket-based hook to a pure HTTP polling hook; removed reconnection logic, typing signals, and presence tracking.
  - Removed `partyHost` prop from `ChatWidget` and `ChatBox` components.
  - Removed typing indicator UI and live presence counter from the chat interface (not feasible without persistent connections).
  - Connection status indicator now shows "Live" when polling is active instead of WebSocket-specific states.

- Created **Hand-Sketched Vector Logo Component & Sketched Thumbnail Skill** (`.agents/skills/sketched-thumbnail-generator/SKILL.md`, `src/components/ui/AvegaLogo.astro`, `public/images/avega-logo.svg`, `src/assets/logos/avega-logo.svg`):
  - Authored the `/sketched-thumbnail-generator` agent skill specifying SVG filter definitions (`#wobble`, `#wobble2`), crayon noise texturing (`#crayonRed`, `#crayonBlue`, `#crayonWhite`), double-pass inked stroke outlines, 100% transparent canvas backgrounds, and borderless container workflows.
  - Built the `AvegaLogo.astro` hand-sketched vector logo component with separate A and V monogram letterform shapes, scaled for full-bleed edge-to-edge app-icon badges.

- Polished **Work Page App-Icon Layout & Interactive Hover Peek Preview Animation** (`src/pages/projects/index.astro`, `src/components/ui/AvegaLogo.astro`):
  - Redesigned project thumbnail presentation into edge-to-edge rounded square app-icon badges (`rounded-2xl flex size-16 md:size-20 overflow-hidden`) placed on the left side of featured cards.
  - Implemented an interactive cursor-swipe hover peek preview window (`.peek-window`) displaying full, uncropped project screenshots (`/images/projects/bits/dashboard.png`, `/images/projects/portfolio-architecture.png`) with smooth spring transitions and 3D parallax cursor tracking (`translate3d` + subtle rotation).
  - Removed bottom-right engraved woodcut chess piece watermarks from card footers for a clean, modern card aesthetic.

- Implemented **Chess Evaluation Scrollbar** (`src/components/navigation/EvalBarScroll.astro`, `src/styles/global.css`, `src/layouts/BaseLayout.astro`):
  - Converted native browser scrollbar into a sleek, full-height right-edge Chess Evaluation Bar on desktop viewports (`fixed right-0 top-0 bottom-0`).
  - Removed text labels and floating badges (`+0.0`, `#M`) for a minimal, pure dual-tone visual bar.
  - Configured scroll-driven fill dynamics: starts 100% White in light mode at top, receding to Black as user scrolls down to 100%; automatically inverts in dark mode.
  - Enabled interactive click and drag-to-scroll navigation.

- Refined **About Page Content & Career Move Ledger** (`src/content/pages/about.json`, `src/pages/about.astro`):
  - Commented out `<CredentialsFootnote />` section in `src/pages/about.astro` until official certifications are acquired.
  - Broadened "Current focus" in `about.json` from specific web development to `Practical software systems, network infrastructure, documented decisions`.
  - Removed framework-specific assumptions (e.g. Astro defaults) across move entries, broadening Sam's narrative to apply across versatile technical roles (software, networking, and hardware systems).
  - Clarified chess-notation score sheet terminology across page headers and closing annotations to explicitly read `Career move ledger · six moves`.

- Paused **Research, Writing, and Lab Sections** behind a unified `<UnderConstruction />` placeholder component (`src/components/UnderConstruction.astro`, `src/pages/research/index.astro`, `src/pages/posts/index.astro`, `src/pages/experiments/index.astro`; originals preserved at `src/content/_archive/*-index.astro`):
  - Authored a single reusable stub with chess-piece section markers (knight for Research, bishop for Writing, rook for Lab), engraved structural border square with corner stamps, and hard-offset press shadow `4px 4px 0 var(--color-ink)`.
  - Composed Fraunces display heading, italic Fraunces lead sentence, Inter body copy, and a Gochi Hand catchphrase (`pieces still on the back rank`) rotated −1°, following the empty-state voice in `docs/engineering/ContentStyleGuide.md` §12.11.
  - Configured eyebrow (`Section · Paused`), ETA note, primary `Back to home` CTA, and a contextual secondary CTA per page (case studies, about, etc.).
  - Added a closing hatch-rule ornament (`Pinned for future work` micro-stamp) and full dark-mode pairing via the `ChessIcons variant="woodcut"` token-aware rendering.
  - Moved the prior `index.astro` content out of the routing tree to `src/content/_archive/` to keep sources recoverable without exposing a duplicate route.
  - Reverted `.qoder/skills/impeccable` discovery from ESLint by moving that library out of scope via the existing flat-config `ignores` list.

- Polished **Work / Projects Index & Case Study Detail Pages** (`src/pages/projects/index.astro`, `src/pages/projects/[slug].astro`, `src/styles/tokens.css`):
  - Replaced every system text emoji (♔, ♛, ✓, →, ←) with theme-aware vector icons: DoodleIcons (`interface/checklist`, `interface/target`, `interface/search`, `interface/suitcase`, `interface/calendar`, `e-commerce/tag`, `interface/link`, `interface/tick`, `arrows/arrow-left`, `arrows/arrow-right`, `arrows/arrow-ne`) and `<ChessIcons piece="…">` for the strategic-role badges.
  - Swapped the serif-glyph watermarks on featured cards for real `<ChessIcons variant="woodcut">` SVGs that auto-invert in dark mode (the previous font glyphs rendered identically in both modes).
  - Rebuilt the category filter as an accessible roledex: `role="tablist"` / `role="tab"` / `aria-selected` synchronization, structural `border-[var(--stroke-structural)]` on the toolbar surface, and removal of the soft shadow that broke the press-metaphor contract.
  - Added a real `<label>` ("Search the archive") to the project search input, switched to `type="search"` + `autocomplete="off"`, and wired focus back to the input on filter reset.
  - Rebuilt the empty state with a woodcut pawn icon, Gochi Hand headline (`No moves match that line.`), `role="status"` + `aria-live="polite"`, and a keyboard-reachable reset button.
  - Promoted section subheads from Fraunces H3 to H2 so the document outline reads H1 → H2 → H3 cleanly, restoring the Engraver Reserve Rule.
  - Detail page (`[slug].astro`): replaced `@lucide/astro` icons with DoodleIcons, replaced `✓` characters in Key Project Outcomes with `<DoodleIcon name="interface/tick">`, tightened prose measure to 68ch (`max-w-[68ch]`), upgraded the Key Takeaway callout from `border-l-2` to structural stroke token, added `aria-label="Case study pagination"` and an engraved `DividerChessboard` separator before Next/Previous navigation.
  - Added the missing semantic color alias `--color-ink: var(--color-text-raw);` to `src/styles/tokens.css`. Nine components across home, about, projects, and the new MoveEntry referenced `var(--color-ink)` but the token did not exist — silently producing zero-offset no-style box-shadows. The alias fixes the silent bug in one place.

- Fixed **React Hook SSR Desynchronization on Vite Dev Reloads** (`src/layouts/BaseLayout.astro`):
  - Updated `<ChatWidget client:load />` to `<ChatWidget client:only="react" />` to render the interactive live chat widget exclusively on the client.
  - Eliminated SSR React dispatcher errors (`TypeError: Cannot read properties of null (reading 'useState')`) triggered during Vite's automatic dependency re-optimizations.

- Reshaped **About Page as a Chess-Notation Score Sheet** (`src/pages/about.astro`, `src/components/sections/about/AboutHero.astro`, `src/components/sections/about/MoveLedger.astro`, `src/components/sections/about/MoveEntry.astro`, `src/components/sections/about/FactsIndex.astro`, `src/components/sections/about/CredentialsFootnote.astro`, `src/content/pages/about.json`, `src/content.config.ts`):
  - Replaced the previous biography + skills grid + achievements grid architecture with a vertical chess-notation ledger. Six move entries (`1. Opening position` → `6. Endgame letter`) carry Fraunces headings, italic Fraunces lead paragraphs, JetBrains Mono date ranges, and Inter body paragraphs constricted to a 68ch measure.
  - Built `<MoveEntry />` with alternating inked/outline chess squares (pawn → rook → knight → bishop → queen → king) rendered via `ChessIcons.astro`, each anchored to a 1.3px hatch vertical rule with a hard-offset press shadow (`2px 2px 0 var(--color-ink)`) on hover.
  - Authored `<AboutHero />` hero section pairing the name in Fraunces H1 with the Gochi Hand catchphrase (`think in systems, document the moves`), a stamped location/headline badge in `bg-surface-subtle`, and a framed `<InteractiveAvatar />` with manuscript caption.
  - Authored `<FactsIndex />` sticky sidebar index card in `bg-surface-subtle` with dashed-row quick-reference facts, a Gochi Hand signature block, and a micro "Score sheet · v1.0" stamp.
  - Authored `<CredentialsFootnote />` replacing achievements cards with log-line entries separated by thin ink dividers — date in mono, title in Fraunces, issuer + verify link right-aligned. Certifications demoted from hero content to supporting marginalia.
  - Extended `pages` collection Zod schema in `src/content.config.ts` with optional `moves[]` (id, notation, piece, heading, dateRange, lead, body) and `facts[]` (label, value) for ledger-driven authoring; placeholder copy shipped in `src/content/pages/about.json` preserved the existing `sections[]` array for backward compatibility with the homepage's `<AboutSummary />`.
  - Codified content-layer ESLint hygiene by adding `.qoder/`, `.agents/`, `.github/skills/`, `party/`, and `public/` to the flat-config `ignores` list — silencing 6,845 pre-existing errors that originated outside the source tree.

- Completed **Experience Page Redesign & Interactive 3D WebGL King Companion** (`src/pages/experience.astro`, `src/components/experience/ExperienceTimeline.tsx`, `src/components/experience/Scroll3DKingCanvas.tsx`, `src/content/experience/`, `src/content/skills/`, `src/content.config.ts`, `docs/plans/0005-experience-page-specification.md`):
  - Built `<ExperienceTimeline />` React island featuring interactive category filter pills (`All Roles`, `Internship`, `Academic`, `Full-Time`, `Contract`, `Project Lead`, `Leadership`) with entry count badges and reset filter controls.
  - Implemented technology tag cross-filtering: clicking any applied technology tag (`TypeScript`, `Docker`, `PostgreSQL`, `WordPress`, `2D Animation & Design`, `Microsoft Office`) cross-filters the timeline to isolate matching roles.
  - Applied glossy frosted glassmorphism styling (`bg-surface/65 backdrop-blur-md relative z-10 dark:border-white/10 shadow-md hover:shadow-lg`) to timeline milestone cards, allowing the turned-wood 3D King moving at `z-0` to be silhouetted behind cards while preserving 100% text legibility.
  - Replaced temporary corporate placeholder data with Sam's 100% authentic, real-world experience history:
    - `avega-shipping-it-intern.yaml`: _Avega Bros. Integrated Shipping Corp_ (`IT Systems & Hardware Intern`) featuring the live biometric timekeeping system (BITS) at `https://bits.abas.ph`.
    - `ctu-danao-creative-web-design.yaml`: _Cebu Technological University - Danao Campus_ (`TESDA Scholar — Creative Web Design NC III`).
    - `arcelo-high-school-immersion.yaml`: _Arcelo Memorial National High School_ (`Senior High Work Immersion Student`).
  - Registered matching skills in `src/content/skills/`: `docker.yaml`, `postgres.yaml`, `nodejs.yaml`, `wordpress.yaml`, `javascript.yaml`, `html-css.yaml`, `microsoft-office.yaml`, and `animation.yaml`.
  - Refined `<Scroll3DKingCanvas />` 3D companion with top-down elevated tabletop camera perspective ($\sim 50^\circ$ pitch angle), procedural turned-wood grain texture, gold rim lighting (`#d4af37`), feathered soft radial contact shadow plane (`createShadowTexture()`), 4-phase physical hop state machine, interactive drag & drop with strict navigation sidebar clamping (`minX = 0.2`), and `z-0` background placement.
  - Fixed timeline node circle alignment (`-left-[24px] md:-left-[32px] -translate-x-1/2`), centering the icon circle pixel-perfectly over the vertical left timeline border line on both mobile and desktop viewports.
  - Created copy-pasteable authoring template `src/content/experience/_template.yaml.example` and updated [0005-experience-page-specification.md](plans/0005-experience-page-specification.md) to **v1.4.0** (`Implemented Specification`).

- Implemented **3D WebGL King Piece Scroll Companion** (`src/components/experience/Scroll3DKingCanvas.tsx`, `src/pages/experience.astro`, `package.json`, `pnpm-lock.yaml`, `docs/plans/0005-experience-page-specification.md`):
  - Created `<Scroll3DKingCanvas />` React island rendering a true 3D King mesh (procedural lathe-profile body, crown bowl, and 3D cross atop a dark chess tile) via Three.js.
  - Positioned canvas fixed near the right-hand scrollbar (`fixed top-1/2 right-3 -translate-y-1/2 z-40`) with a low-angle upward camera perspective (`camera.lookAt(0, 0.95, 0)`).
  - Implemented smooth scroll-driven 3D chess movements: the King executes 3D hops (`translateZ` lift-off, forward tilt, and shadow compression) while rotating 360° over the page scroll duration.
  - Installed `three` and `@types/three` dependencies and mounted component on `/experience`.

- Refactored **Mobile Live Chat Navigation Transition & Z-Index Layering** (`src/layouts/BaseLayout.astro`, `src/components/chat/ChatBox.tsx`, and `src/components/feedback/Toast.tsx`):
  - Updated mobile navigation drawer script in `BaseLayout.astro` to execute a smooth 200ms closing transition when tapping "Live Chat", invoking `open-portfolio-chat` event upon completion to open the chat modal without manual drawer exit.
  - Increased `ChatBox.tsx` modal container z-index from `z-50` to `z-[70]`, ensuring the Live Chat modal and onboarding dialogs surface above navigation bars (`z-50`) and mobile overlays (`z-[60]`).
  - Adjusted global `ToastContainer` position in `Toast.tsx` to `top-16 right-4 sm:top-6 sm:right-6` on mobile viewports so turn notifications float cleanly below header controls without overlapping the close button.
  - Removed redundant low-opacity `♞ Crowd Chess` text and secondary `X` button header from mobile `ChatBox.tsx` panel view.

- Established **Experience Page Architecture, Schema & Content Strategy Specification** (`docs/plans/0005-experience-page-specification.md`, `src/content.config.ts`, `src/content/experience/`, `src/pages/experience.astro`, and `docs/plans/README.md`):
  - Authored comprehensive specification `0005-experience-page-specification.md` defining content rules, CAR (Context, Action, Result) impact formula, non-invented corporate title invariants, and explicit 7-type role categorization taxonomy (`fulltime`, `contract`, `internship`, `freelance`, `academic`, `project`, `leadership`).
  - Extended Astro v5 Content Layer `experience` schema in `src/content.config.ts` with `type` enum validator and optional `url` property.
  - Removed outdated placeholder corporate data (`Google - Lead Systems Engineer`, `Netflix - Senior Developer`) and replaced with authentic initial entries (`bits-timekeeping-lead.yaml`, `bsit-computer-technology.yaml`, `software-development-contractor.yaml`).
  - Redesigned `src/pages/experience.astro` timeline to render category badge pills and theme-aware `<DoodleIcon>` vector SVGs (`briefcase`, `calendar`, `location`, `check`).

- Integrated **Doodle SVG Icon System** (`src/assets/icons/doodle/`, `src/components/ui/DoodleIcon.astro`, `src/components/ui/DoodleIcon.tsx`, `src/components/sections/ContactCTA.astro`, `src/components/sections/AboutSummary.astro`, `src/layouts/BaseLayout.astro`, `src/components/chat/ChatBox.tsx`, `docs/design/DoodleIconSystem.md`):
  - Organized and migrated 177+ hand-drawn vector doodle SVG icons into `src/assets/icons/doodle/` across 15 UI categories.
  - Built `<DoodleIcon.astro>` and `<DoodleIcon.tsx>` components with dynamic `currentColor` stroke/fill binding for seamless Light and Dark Mode ink inversion.
  - Replaced text emojis (`✉`, camera emojis, unicode `✕`) and `@lucide/astro` dependencies across site headers, contact cards, focus area lists, and chat controls with theme-aligned Doodle SVGs.
  - Documented the icon system architecture and component usage in `docs/design/DoodleIconSystem.md`, updated design and engineering guides (`docs/README.md`, `docs/design/SVGRules.md`, `docs/design/DesignSystem.md`, `docs/engineering/ContentStyleGuide.md`), and updated AI Agent rules (`.agents/AGENTS.md`, `AGENTS.md`, `docs/engineering/AI-Guidelines.md`, `docs/engineering/AI-Project-Context.md`) to strictly mandate custom `<DoodleIcon>` vector SVGs over system text emojis.

- Redesigned **Shared Chess Board UI & Global Anti-Spam Toast System** (`src/components/chess/ChessWidget.tsx`, `src/components/chess/ChessBoard3D.tsx`, `src/components/feedback/Toast.tsx`, `src/components/chat/ChatBox.tsx`, `src/lib/chess/storage.ts`, `src/styles/global.css`, `astro.config.ts`, `tests/e2e/chat.spec.ts`, `tests/e2e/navigation.spec.ts`, and `docs/plans/0004-anonymous-shared-chess-game-specification.md`):
  - Updated Playwright E2E test suite (`tests/e2e/chat.spec.ts` & `tests/e2e/navigation.spec.ts`) with updated input placeholders (`"say something..."`), onboarding title assertions, static route trailing slash normalization, and navigation timeouts.
  - Fixed TypeScript diagnostic hints in `astro.config.ts` (`_eventType`) and `ChatBox.tsx` (`React.SyntheticEvent`), reducing diagnostic noise for clean CLI feedback.
  - Fixed ESLint `@typescript-eslint/no-unused-vars` lint check in `ChessWidget.tsx` by cleaning up unused destructured prop parameters.
  - Fixed Cloudflare Workers edge environment compatibility in `src/lib/chess/storage.ts` by removing Node.js `node:fs` imports.
  - Created `.custom-scrollbar` CSS utility class in `global.css` (ultra-thin 5px thumb, transparent track, smooth hover accent color) and applied it across `ChatBox.tsx` message feeds and `GameDetailsModal.tsx` lists to replace bulky native browser scrollbars.
  - Added physical 3D wooden block slab extrusion (`.board-3d-slab`) and ground placement radial shadow to `ChessBoard3D.tsx`, giving the chess stage realistic physical block thickness and volumetric depth in 3D perspective mode.
  - Removed container background card, outer borders, shadows, header bar, and the move accepted notification banner from `ChessWidget.tsx`, making the 3D/2D chess board sit cleanly and framelessly in the interface.
  - Built a global, accessible Toast Notification System (`Toast.tsx`) positioned at the **top-right** of the viewport, featuring `inaccuracy.svg` as the notification icon, styled with design system tokens and backdrop blur.
  - Implemented anti-spam duplicate message suppression: if a toast with the exact same text is currently active/visible, duplicate triggers are ignored until the current toast vanishes.
  - Added turn indicator toasts when clicking/pressing anywhere on the chess board (e.g., _"Your Turn to move!"_ or _"Opponent's Turn..."_).
  - Integrated **3D View** camera perspective toggle and a borderless **Details** button (rendered as the `mistake.svg` icon without border or text description) directly into the Chatbox header control toolbar.
- Fixed **Double Scrollbar & Background Page Scrolling** (`src/components/chat/ChatBox.tsx`). Added body scroll lock (`document.body.style.overflow = "hidden"`) when the chat modal opens, restoring original overflow on close.
- Fixed **Nav Bar Icon Redundancy & Hover Cursor** (`src/layouts/BaseLayout.astro` and `src/components/chat/ChatWidget.tsx`). Removed extra `♞` text character and knight SVG from the navigation bar item and added `cursor-pointer` to all chat trigger buttons.
- Fixed **Mobile Responsiveness & Layout Squishing** (`src/components/chat/ChatBox.tsx`). Refactored header layout with responsive flex wrappers, truncated user handle badges, compact input paddings (`pr-12 sm:pr-14`), and optimized mobile modal heights (`h-[92vh] sm:h-[88vh]`).
- Fixed **WebSocket Connection Lifecycle Stability & Non-Blocking Typing** (`src/components/chat/useChatSocket.ts` and `src/components/chat/ChatBox.tsx`). Refactored `useChatSocket` to connect once on mount using a stable `displayNameRef`, preventing connection teardowns during typing or display name edits. Removed input field disabling in `ChatBox.tsx` and added optimistic local message delivery so typing and sending are 100% smooth and uninterrupted.

### Added

- Implemented **Production 3D Chess Stage & Projection Engine Architecture** ([sceneConfig.ts](../src/components/chess/sceneConfig.ts), [ChessBoard3D.tsx](../src/components/chess/ChessBoard3D.tsx), [ChessPiece.tsx](../src/components/chess/ChessPiece.tsx), [GameDetailsModal.tsx](../src/components/chess/GameDetailsModal.tsx), [ChessWidget.tsx](../src/components/chess/ChessWidget.tsx), and [global.css](../src/styles/global.css)):
  - Built centralized `projectPiece(x, y, type, isSelected, camera)` Projection System in `sceneConfig.ts` converting board coordinates (`x`, `y`) into screen position (`left`, `top`), depth (`zIndex`), height (`height`), and tilt (`rotateX(-46deg)`).
  - Streamlined 4-layer Stage Hierarchy (`Board Surface` -> `Highlights Layer` -> `Piece Renderer Layer` -> `UI Overlay`).
  - Centralized virtual camera geometry (`CAMERA.perspective = 1400`, `boardTilt = 58°`, `pieceTilt = -46°`) and decoupled visual style config (`PIECE_STYLES`).
  - Decoupled 8x8 Board Surface Grid from the Piece Overlay Layer: board squares are 100% agnostic of piece children.
  - Dynamic Screen-Space Depth Sorting (`pieces.sort((a,b) => a.y - b.y)`): foreground pieces physically overlap background rows naturally without DOM clipping.
  - Streamlined 4-layer Standee structure (`Shadow` -> `Base` -> `Thickness` -> `SVG Artwork`).
  - Added `.woodcut-square-dark` cross-hatching utility (`repeating-linear-gradient(45deg, var(--ink) 0 1.5px, transparent 1.5px 6px)`), letterpress frame, Lichess corner coordinates, and ink move rings.

- Implemented **Phase 0–Phase 5 of Shared Anonymous Chess Game (`@samananias/turn-arbiter`)** (`src/components/chess/ChessWidget.tsx`, `src/components/chat/ChatBox.tsx`, `src/lib/chess/storage.ts`, `src/lib/chess/session.ts`, `src/pages/api/chess/state.ts`, and `src/pages/api/chess/move.ts`):
  - Integrated local package `@samananias/turn-arbiter` (`file:../turn-arbiter`) and `chess.js` (`^1.4.0`).
  - Gated chess side assignment behind username onboarding ("Enter Handle to Play Chess & Chat"). Passive site visitors receive no chess cookies or team assignment.
  - Implemented Cloudflare D1 SQL Compare-and-Swap (CAS) atomic storage engine (`UPDATE game SET ... WHERE id = 1 AND version = ?`) with memory storage fallback.
  - Created Web Crypto API HMAC-SHA256 session cookie signing/verification (`chess_session`) for side assignment.
  - Built Astro API endpoints `/api/chess/state` (`GET`) and `/api/chess/move` (`POST`).
  - Implemented interactive 8x8 React chess board widget (`ChessWidget.tsx`) using piece vector SVGs from `src/assets/chess/`, legal move highlighting, turn state indicator, team assignment status, and move collision feedback.
  - Expanded Chat Modal (`ChatBox.tsx`) into a dual-panel split container (`max-w-5xl`) rendering real-time chat on the left panel and the shared crowd chess game on the right panel.

- Added **Anonymous Shared Chess Game Architecture & Specification** in [0004-anonymous-shared-chess-game-specification.md](plans/0004-anonymous-shared-chess-game-specification.md) and **Implementation Roadmap & Checkpoints** in [0004.1-anonymous-shared-chess-game-implementation-roadmap.md](plans/0004.1-anonymous-shared-chess-game-implementation-roadmap.md) detailing `@samananias/turn-arbiter` integration, D1 CAS storage engine, signed session cookie auth, and Astro API endpoints.
- Implemented **Mandatory Username Onboarding & Immutable Single-Session Identity** (`src/components/chat/useChatSocket.ts`, `src/components/chat/ChatBox.tsx`, and `tests/e2e/chat.spec.ts`). Removed automatic default display name generation, requiring users to pick a 3–20 character handle on first visit before accessing the chat. Handle is persisted in `localStorage` and cannot be modified in-session.

- Implemented **Phase 4 & Phase 5: Layout & Navigation Integration, Audio Polish & E2E Tests** (`src/components/chat/ChatWidget.tsx`, `src/layouts/BaseLayout.astro`, and `tests/e2e/chat.spec.ts`). Mounted `ChatWidget` island (`client:idle`) with floating bottom-right trigger, custom event listener (`open-portfolio-chat`), Web Audio woodblock click feedback, `aria-live="polite"` live announcements, and Playwright E2E test suite.
- Implemented **Phase 3: Fullscreen Blurred Backdrop UI & Woodcut Component Setup** (`src/components/chat/ChatBox.tsx`) introducing the fullscreen modal overlay with frosted glass background blur (`backdrop-blur-md bg-bg/85 dark:bg-bg/90`), woodcut framing, chess avatar badges (♞, ♜, ♝, ♟, ♔, ♛), live user counter badge, auto-scrolling feed, error banners, 280-character limit indicator, and inline display name editing.
- Implemented **Phase 2: Client State, WebSocket Hook & Display Name Management** (`src/components/chat/useChatSocket.ts`) introducing the React custom hook with exponential backoff auto-reconnection, page visibility reconnection handlers, hidden internal UUID session tokens, local storage display name persistence, and typing indicator timeout handlers.
- Implemented **Phase 1: Real-Time Edge Engine Setup** (`party/chat.ts` and `partykit.json`) introducing the PartyKit server handler, configurable in-memory 50-message ring buffer (`MAX_CHAT_HISTORY = 50`), HTML escaping XSS protection, token bucket rate limiting (3 msgs / 5s), system join/leave event emitter, and conditional discriminator engine.
- Added **Anonymous Real-Time Chatbox Architecture & Design Specification** in `docs/plans/0003-anonymous-realtime-chatbox-specification.md` and **Implementation Roadmap & Checkpoints** in `docs/plans/0003.1-anonymous-realtime-chatbox-implementation-roadmap.md` detailing phased execution, PartyKit edge engine, fullscreen blurred backdrop UI, and verification gates.
- Official **Content & Writing Style Guide** in `docs/engineering/ContentStyleGuide.md` establishing author positioning, voice, tone boundaries, surface copy standards, authenticity criteria, and AI collaboration rules (renamed from `docs/still-noname.md`).
- Updated `docs/README.md`, `docs/engineering/AI-Guidelines.md`, and `docs/engineering/AI-Project-Context.md` to reference `ContentStyleGuide.md`.
- Rebuilt Work Index Page (`src/pages/projects/index.astro`) and Case Study Detail Template (`src/pages/projects/[slug].astro`) following `work-page-visual.html` and [0002-work-page-specification.md](plans/0002-work-page-specification.md).
- Restructured featured showcase into a 2-column grid featuring the author's 2 signature projects: **BITS (Biometrics Integrated Timekeeping System)** (`bits-timekeeping.md` - ♔ Signature System) and **Portfolio Architecture & Content System** (`portfolio-architecture.md` - ♛ Technical Powerhouse).
- Integrated real project screenshots (`/images/projects/bits/dashboard.png`, `devices.png`, and `/images/projects/portfolio-architecture.png`) into frontmatter, markdown narratives, and card preview banners with `grayscale contrast-105 group-hover:grayscale-0` hover transitions.
- Added clean font chess character background watermarks (`♔`, `♛`, `♞`) matching `work-page-visual.html` (`font-serif text-[145px] rotate-[-7deg]`).
- Placed **Legacy Personal Web Portfolio** (`legacy-portfolio.md`) into the **All Projects Archive** list below (`featured: false`).
- Removed 3 fake dummy project files (`cloud-scheduler.md`, `distributed-logging.md`, `edge-telemetry-agent.md`).
- Omitted `1st`, `2nd`, `3rd` ranking numbers from all project badges and eyebrows.
- Streamlined featured card design by removing Key Decision blockquotes and Tech Stack tag pills, focusing on clean image banners, bold titles, and concise 1-sentence summaries.
- Updated Work Page Information Architecture Specification ([0002-work-page-specification.md](plans/0002-work-page-specification.md)) and Implementation Roadmap ([0002.1-work-page-implementation-roadmap.md](plans/0002.1-work-page-implementation-roadmap.md)).

### Changed

- Refreshed all Home Page (`/`) section copy and action button labels to strictly conform to `ContentStyleGuide.md` (sentence case CTAs, grounded early-career graduate positioning, fixed `02. Core Mindset & Principles` section heading). Updated `site.json`, `about.json`, all 7 section components in `src/components/sections/`, and `docs/plans/0001-home-page-specification.md`.

## [1.0.0] - 2026-07-25

### Added

- Dedicated `docs/plans/` directory with `README.md` index and `0000-template.md` feature plan template for technical design specs and RFC proposals.
- Implemented **Phase 7: Background Trajectory, Contact CTA & Page Assembly** on the Home page (`/`):
  - Created `src/components/sections/AboutSummary.astro` rendering background biography, engineering philosophy, and focus areas from `src/content/pages/about.json`.
  - Created `src/components/sections/ContactCTA.astro` rendering conversion CTA finish with direct email button, GitHub profile link, and contact route from `src/content/data/site.json`.
  - Injected `Person` and `WebSite` JSON-LD structured data into `<head>` in `src/layouts/BaseLayout.astro`.
  - Assembled all 7 top-to-bottom sections on `src/pages/index.astro` strictly following `docs/plans/0001-home-page-specification.md`.
  - Fixed site-wide section boundary alignment by bounding colored sections (`bg-surface-subtle/50`) with top and bottom `DividerChessboard` primitives for 0px top/bottom background bleed.
  - Refactored `src/components/sections/GitHubActivity.astro` to use trimmed eyebrow (`06 · GITHUB CONTRIBUTIONS`) and direct grid transition.
  - Refactored `src/components/sections/ContactCTA.astro` with standalone email pill and responsive button stacking (`flex-col sm:flex-row`).
  - Updated `docs/plans/0001-home-page-specification.md` with Section 6 & 7 specs and Section Background Alternating Pattern & Divider Boundary rules.
- Added explicit Windows CLI command execution rule requiring `cmd /c` (e.g. `cmd /c "npx pnpm run format"`) across `AGENTS.md`, `.agents/AGENTS.md`, `docs/AI-Guidelines.md`, and `docs/AI-Project-Context.md` to bypass PowerShell script execution restrictions.
- Reorganized `docs/` repository documentation into structured subdirectories (`docs/architecture/`, `docs/design/`, `docs/engineering/`), updating all relative markdown links and maintaining 100% link portability.
- Created official Home Page Information Architecture & Content Strategy specification in `docs/plans/0001-home-page-specification.md`.
- Created 7-phase Home Page Implementation Roadmap & Verification Checkpoints document in `docs/plans/0002-home-page-implementation-roadmap.md`.
- Implemented **Phase 2: Hero Section & Interactive Avatar** on the Home page (`/`):
  - Created `src/components/primitives/InteractiveAvatar.astro` featuring a 16-tile staggered chessboard `clip-path` wipe animation that reveals the portrait photo on hover/focus.
  - Created `src/components/sections/Hero.astro` consuming authentic data from `src/content/data/site.json` (Display name, headline, location, and CTA links).
  - Integrated `sharp` dev dependency for high-efficiency image optimization (reducing portrait image footprint from 1.4 MB to 10 kB webp).
  - Extended Astro v5 Content Collection schema for `site` in `src/content.config.ts` with optional `headline` and `location` fields.
- Implemented **Phase 3: Strategy Before Code Section** on the Home page (`/`):
  - Created `src/components/sections/CoreMindset.astro` with 5 chess-inspired layered principle cards (_Strategy Before Code_, _Context Over Memory_, _AI as a Partner, Not a Crutch_, _Evidence Over Assumptions_, _Continuous Refinement_).
  - Integrated zero-jargon conversational copy emphasizing human engineering values, documentation context, and responsible AI collaboration.
- Implemented **Phase 4: Featured Case Studies Section** on the Home page (`/`):
  - Created `src/components/sections/FeaturedProjects.astro` querying Astro v5 `projects` content collection (`featured: true`, hard cap of 3).
  - Rendered project cards with structural stroke borders, hard offset shadows, outcome bullet points, tech stack tags, and case study links.
- Implemented **Phase 5: Lab & Learning Explorations Section** on the Home page (`/`):
  - Created `src/components/sections/LabExplorations.astro` querying Astro v5 `posts` collection (hard cap of 3).
  - Rendered research note cards with date eyebrows, non-technical excerpts, topic badges, and deep-dive links.
- Implemented **Phase 6: Interactive GitHub Contributions & Chess Playfield** on the Home page (`/`):
  - Built React Island `src/components/islands/GitHubChessGrid.tsx` rendering a 52-week activity heatmap with live GitHub contribution fetching (`488 contributions in the last year`).
  - Added chronological day-by-day contribution array sorting to fix 7-day jump artifacts and ensure seamless left-to-right daily progression.
  - Centered calendar grid layout horizontally, streamlined UI chrome by removing month and weekday labels, and integrated ♔ King piece easter egg on peak activity days.
  - Created `src/components/sections/GitHubActivity.astro` server-side pre-rendering live data with `client:visible` hydration, top/bottom borders (`border-t border-b border-ink/10`), and `DividerChessboard` pattern.
  - Relocated `<GitHubActivity />` section to the bottom of `/src/pages/index.astro` directly after Recent Work History.

## [0.9.0] - 2026-07-21

### Added

- Woodcut & engraving visual theme specification and phased roadmap in `docs/WoodcutTheme.md` and `docs/WoodcutThemeRoadmap.md`.
- True-black dark mode palette (ground `#000000`, surface `#0d0d0f`, text `#f0f4ff`, primary `#8fb0dc`) in `src/styles/tokens.css`.
- Engraving stroke-weight tokens (`--stroke-structural` 2.5px, `--stroke-detail` 1.5px, `--stroke-hatch` 1.3px, `--stroke-fine` 1px) in `src/styles/tokens.css`.
- Classical typography voices — Fraunces Variable (display, WONK) and Gochi Hand (decorative scrawl) via `@fontsource-variable/fraunces` and `@fontsource/gochi-hand`.
- Engraved section divider primitives `DividerChessboard.astro` and `DividerKnight.astro` in `src/components/primitives/`.
- Chess piece icon component `ChessIcons.astro` in `src/components/navigation/`.
- Fixed left-sidebar navigation (desktop) with a full-screen overlay menu, focus trap, and scroll lock (mobile) in `src/layouts/BaseLayout.astro`.
- Themed 404 page featuring a knocked-over knight engraving at `src/pages/404.astro`.
- Mode-aware `.chess-grid` repeating chessboard background texture utility in `src/styles/global.css`.
- Dedicated SVG & image asset rules specification in `docs/SVGRules.md` establishing tight cropping standards, engraving stroke-weight hierarchy, and dark-mode high-contrast binding patterns.
- Integrated complete set of 12 hand-drawn woodcut chess piece SVGs (king, queen, rook, bishop, knight, pawn in black and white styles) inside `src/assets/chess/`.
- Replaced legacy navigation glyphs in `src/components/navigation/ChessIcons.astro` and `src/layouts/BaseLayout.astro` with custom theme-adaptive SVGs (black SVGs in Light Mode, white SVGs in Dark Mode) and updated active navigation indicator to the Pawn SVG.
- Completed Phase A of Sidebar Refinement (`docs/SidebarRefinement.md`): restored `Home` (`/`) route with King piece (♔), implemented stroke-only 12px Knight SVG active indicator (`src/assets/chess-nav/knight.svg`), added 44px min-height touch targets, and configured explicit `focus-visible` focus rings.
- Completed Phases C & D of Sidebar Refinement (`docs/SidebarRefinement.md`): added `tracking-wide` letter spacing on navigation links, 1px horizontal icon hover shift micro-interactions (`group-hover:translate-x-px`), and `active:scale-[0.92]` press feedback on the theme toggle button. Finalized Checkpoint 1.
- Completed Phase B of Sidebar Refinement (`docs/SidebarRefinement.md`): created 24×24 simplified stroke-only piece SVGs in `src/assets/chess-nav/`, refactored `ChessIcons.astro` to single-render using `currentColor` auto-inversion, and resized icons to 15px (desktop) and 18px (mobile). Finalized Checkpoint 2.
- Completed Phase E of Sidebar Refinement (`docs/SidebarRefinement.md`): added 10px uppercase mono group labels (`WORK`, `WRITING`, `META`), integrated `DividerChessboard.astro` for the primary group divider strip, and configured `@custom-variant short` (`max-height: 768px`) for responsive label visibility. Finalized Checkpoint 3.
- Completed Phase F of Sidebar Refinement (`docs/SidebarRefinement.md`): created hand-drawn Sun/Moon SVGs in `src/assets/theme-icons/`, updated `ThemeToggle.astro` button to 44px (`h-11 w-11`), and added a 40px knight watermark at 20% opacity above the sidebar footer divider. Finalized Checkpoint 4.
- Completed Phase G of Sidebar Refinement (`docs/SidebarRefinement.md`): tokenized hardcoded `#0d0d0f` dark-mode colors in `Logo.astro` with `var(--color-surface-raw, #0d0d0f)`. Finalized Checkpoint 5.
- Completed Phase H of Sidebar Refinement (`docs/SidebarRefinement.md`): implemented 200ms `mobile-menu-out` exit animation, per-link 30ms staggered entry delays (`--i`), and `prefers-reduced-motion` animation fallbacks in `BaseLayout.astro` and `global.css`. Finalized Checkpoint 6.
- Isolated desktop sidebar vertical scrolling to the primary navigation section (`Home` → `Lab`), pinning the logo header, utility links (`About`, `Contact`, `Search`), theme toggle, and footer permanently in fixed position.

### Fixed

- Fixed Lighthouse CI GitHub Actions workflow step by creating `lighthouserc.json` configuration file (`staticDistDir: ./dist`, `budgetFile: ./lighthouse-budget.json`) and configuring `treosh/lighthouse-ci-action@v12` with `configPath`, resolving `No URLs provided to collect` CI failure.
- Added `@variant dark (&:where(.dark, .dark *));` class selector strategy to `src/styles/global.css` for Tailwind CSS v4, fixing `dark:hidden` and `dark:flex` Sun/Moon icon swapping when toggling dark mode via JavaScript.
- Updated `.chess-grid` CSS variable mixing in `src/styles/global.css` to use `var(--color-border-raw)` for clear grid visibility in both dark and light mode.
- Enhanced Dark Mode background texture in `src/styles/global.css` with an optical 3D depth effect using `filter: blur(0.75px)`, 4-stop radial `mask-image` dual vignette decay, and dark surface card ambient elevation shadows (`box-shadow`), allowing foreground UI elements to float cleanly above a soft, distant background environment.
- Cropped SVG `viewBox` in `src/components/primitives/Logo.astro`, `public/favicon.svg`, and `src/assets/brand/logo.svg` to focus directly on the goat knight head and horns (`120 40 400 360`), making the logo prominent, bold, and readable at small sizes (favicons and topbar headers).

- Updated active navigation link indicator in `src/layouts/BaseLayout.astro` to use `src/assets/chess-icons/correct.svg` instead of `knight.svg`.
- Redesigned `king.svg` and `knight.svg` in `src/assets/chess-nav/` for improved clarity at 15px render size.
- Created 10 chess move evaluation annotation badges in `src/assets/chess-icons/` (`brilliant`, `great`, `best`, `good`, `correct`, `book`, `inaccuracy`, `mistake`, `blunder`, `miss`).
- Restyled `.prose-custom blockquote` with an engraved double-rule border and ♛ queen watermark.
- Replaced the hero text gradient with a solid `text-primary` emphasis and added a Gochi Hand catchphrase (no-gradient rule, WoodcutTheme.md §1.1).
- Updated navigation and theme E2E specs for the sidebar/overlay DOM and the multi-instance theme toggle.

## [0.8.0] - 2026-07-21

### Added

- Optimized theme-aware vector logo asset file in `src/assets/brand/logo.svg`.
- Reusable primitive Astro logo component in `src/components/primitives/Logo.astro` supporting CSS theme-aware fills and stroke colors.
- Custom prefers-color-scheme responsive favicon in `public/favicon.svg` using the goat head chess knight vector paths.

### Changed

- Integrated the dynamic logo in the global header next to the site title in `src/layouts/BaseLayout.astro`.
- Cleaned up temporary files (`goat_head_chess_knight.svg` and `goat_head_chess_knight.png`) from the root directory.
- Migrated deprecated `z` imports from `astro:content` to `astro/zod` in `src/content.config.ts`.
- Migrated deprecated Lucide icons (`CheckCircle2` -> `CircleCheck`, `AlertTriangle` -> `TriangleAlert`) in experience and experiments layout pages.

## [0.7.0] - 2026-07-20

### Added

- Playwright automated browser testing configurations in `playwright.config.ts`.
- Navigation E2E testing specs in `tests/e2e/navigation.spec.ts`.
- Light/dark theme toggler and localStorage sync E2E specs in `tests/e2e/theme.spec.ts`.
- Dynamic client search filtering E2E specs in `tests/e2e/search.spec.ts`.
- Automated Axe accessibility audits across all major site routes in `tests/accessibility/a11y.spec.ts`.
- Performance metrics budgets specification in `lighthouse-budget.json`.
- Cloudflare Pages URL redirects mapping config in `public/_redirects`.

### Changed

- Expanded package config in `package.json` to include `@playwright/test`, `@axe-core/playwright`, and defined test run script tasks.

## [0.6.0] - 2026-07-20

### Added

- Lab/Experiments listing page at `src/pages/experiments/index.astro` (with dynamic status and technology filtering).
- Dynamic detail page for experiments at `src/pages/experiments/[slug].astro` (with warnings, demo links, and scroll-highlighted Table of Contents).
- Seed experiments content files at `src/content/experiments/css-grid-chess.md` and `src/content/experiments/color-scheme-sandbox.md`.

### Changed

- Integrated `ThemeToggle` into `src/layouts/BaseLayout.astro` global header for flash-free theme switching.
- Appended "Lab" navigation link pointing to `/experiments` inside `src/content/data/navigation.json`.

## [0.5.0] - 2026-07-19

### Added

- Blog writing index directory at `src/pages/posts/index.astro`.
- Blog dynamic detail page at `src/pages/posts/[slug].astro` (with Table of Contents sidebar scroll-highlights).
- Research index directory page at `src/pages/research/index.astro`.
- Research detailed publication sheet page at `src/pages/research/[slug].astro`.
- Search query lookup UI page at `src/pages/search.astro`.
- Static Search JSON database compilation endpoint at `src/pages/search.json.ts`.
- Dynamic RSS XML compilation feed endpoint at `src/pages/rss.xml.ts`.
- Table of Contents link animations helper classes (`.toc-link`, `.toc-link-active`) in `src/styles/global.css`.
- Seed posts and research entries for Welcome to Astro, Raft Simulation, and IEEE Telemetry Ingestion.

### Changed

- Fixed trailing newline conflicts in Vite `syncSingletonsPlugin` in `astro.config.ts`.
- Removed unused imports (`Download`, `Grid`, `Card`) inside research components to pass ESLint tests.

## [0.4.0] - 2026-07-19

### Added

- Main portfolio route page at `src/pages/index.astro`.
- About credentials page at `src/pages/about.astro`.
- Project cases index page at `src/pages/projects/index.astro` (with client-side vanilla filter tabs).
- Project dynamic detailed page at `src/pages/projects/[slug].astro`.
- Professional timeline history page at `src/pages/experience.astro`.
- Forms-validated submittal contact page at `src/pages/contact.astro`.
- Seed markdown, json, and yaml content layer assets for about, projects, skills, experience, and achievements collections.
- Node.js environment types (`@types/node`) as devDependency.
- Custom prose class typography styles (`.prose-custom`) in `src/styles/global.css`.

### Changed

- Migrated design system showcase to `src/pages/design-system.astro` to preserve style previews.
- Modified `src/layouts/BaseLayout.astro` to render site settings dynamically, manage SEO fallbacks, and highlight active header tabs.
- Removed prohibited `@ts-nocheck` comments in `astro.config.ts`.
- Removed explicit `any` bindings on `about.astro`'s icons.

## [0.3.0] - 2026-07-19

### Added

- Keystatic CMS integration (`@keystatic/core`, `@keystatic/astro`, `@astrojs/react`, `react`, `react-dom`).
- Schema configurations for all 10 collections/singletons in `keystatic.config.ts`.
- Custom Vite plugin `syncSingletonsPlugin` in `astro.config.ts` to solve the JSON array format mismatch for site and navigation singletons.
- Ignore rules for Keystatic local database folder in `.gitignore`.

## [0.2.0] - 2026-07-18

### Added

- Fontsource variable fonts integration (`Inter Variable`, `Manrope Variable`, `JetBrains Mono`).
- Official `@lucide/astro` SVG icon library configuration.
- Layout primitives: `Container.astro` (width bounds) and `Grid.astro` (responsive shorthand parser).
- Interactive controls: `Button.astro` and `LinkButton.astro` with loading overlays and accessibility sizing compliance.
- Content compositions: `Card.astro` (composable slots and semantic full-card clickable overlays) and `ThemeToggle.astro` (flash-free theme toggler).
- Main design showcase page (`index.astro` kitchen sink layout).

## [0.1.0] - 2026-07-18

### Added

- Astro v7 + TypeScript setup.
- Tailwind CSS v4 design token integrations (`tokens.css`, `global.css`).
- ESLint and Prettier flat rules.
- Content Layers schemas in `content.config.ts`.
- GitHub Actions CI workflow config.
- Architectural design decisions registry and docs folders.
