# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary audiences (dual-track — must be legible to both):**

1. **Technical evaluators** — senior engineers, hiring managers, and technical leads assessing a candidate for a developer or engineering role. They read for architectural judgment, engineering discipline, and code quality evidence.
2. **Business-side decision makers** — startup founders, non-technical clients, and project leads evaluating fit for freelance or contract work. They read for reliability, communication, and shipped outcomes.

**Operating context:** Both audiences visit with limited time and high skepticism. They have seen dozens of portfolios; surface-level projects and hollow claims are immediately recognized and dismissed.

## Product Purpose

A personal engineering portfolio for **Sam Ananias Cases** — a Computer-focused Industrial Technology graduate based in Cebu, Philippines. The portfolio's job is to earn trust from both technical and business evaluators by making Sam's engineering discipline, architectural ownership, and real shipped work immediately and undeniably visible.

Success means a visitor finishes in one session and contacts Sam or passes the portfolio to a hiring panel — not that they click many pages.

## Positioning

**Sam applies AI as a serious engineering partner, not a crutch — he stays the architectural owner while accelerating with AI tooling.**

This is the claim a competing candidate's portfolio cannot truthfully copy without matching Sam's demonstrated practice: specification-first development, ADR-governed architecture, rigorous automated verification suites, and documented decision-making accountability — all at a career stage when most candidates are still writing ad-hoc CRUD.

## Operating Context

- Visitors arrive from GitHub profile links, LinkedIn, job applications, and direct referrals.
- The site is evaluated on desktop and mobile; hiring panels may forward a link to colleagues who open it cold.
- Sam's background spans hardware deployment (ZKTeco biometric CCTV integration), IT infrastructure, and modern frontend/backend web development — an unusually wide and grounded range.
- The portfolio itself is a primary evidence artifact: its architecture, commit hygiene, test coverage, and documentation quality are all on display.

## Capabilities and Constraints

- **Routes and surfaces:** Home, About, Work/Projects (case studies), Experience, Posts/Blog, Search, Contact, Lab/Experiments, anonymous real-time chat, shared chess game (interactive).
- **Tech:** Astro v7.1.1 + React 19 islands + Tailwind CSS v4 (CSS-first) + TypeScript strict + Cloudflare Pages + pnpm + PartyKit (edge chat) + turn-arbiter (chess engine).
- **No new dependencies** without explicit permission.
- **Content is factual only:** no fabricated testimonials, invented benchmarks, placeholder companies, or synthetic case study data. Every claim must be traceable to real evidence.
- **Accessibility:** WCAG AA minimum; automated axe-core audits run on every build.
- **No hardcoded hex colors in markup;** all values flow through CSS token variables.

## Brand Commitments

- **Name:** Sam Ananias Cases (abbreviated "Sam" in conversational copy, full name in formal contexts).
- **Location:** Cebu, Philippines.
- **Woodcut / engraving visual identity is locked.** High-contrast linework-first aesthetic derived from the brand logo. No gradients, no soft shadows, black-on-white / white-on-true-black. This is not a theme to swap.
- **Chess motif is a core identity asset.** Chess pieces, board patterns, and coordinates are the primary decorative vocabulary — icons, dividers, borders, interactive features.
- **DoodleIcon system:** All UI icons are hand-drawn `<DoodleIcon>` vector SVGs. System emojis are prohibited in all UI components and code.
- **Voice:** Confident, precise, and substantive — no filler copy, no marketing superlatives, no invented claims.

## Evidence on Hand

- **Shipped internship:** IT Systems & Hardware Intern at Avega Bros. Integrated Shipping Corp (2025–2026), Tayud, Consolacion, Cebu. Real deliverables: BITS biometric timekeeping system (live at `bits.abas.ph`), CCTV network deployment, fleet inventory process.
- **Shipped projects:** BITS timekeeping system, this portfolio architecture itself, legacy portfolio rebuild.
- **Academic background:** Bachelor of Industrial Technology, Computer major — CTU Danao.
- **Credentials:** Certifications tracked in `/src/content/achievements/`.
- **GitHub:** `https://github.com/SamAnaniasCases`
- **Contact:** `samananiascases@gmail.com` (email and contact form only — Viber/phone deliberately not offered publicly)
- **Absence note:** No published third-party testimonials or press coverage currently exists; future work must not fabricate these.

## Product Principles

1. **Discipline over volume.** Three rigorous, documented case studies outweigh twenty shallow projects. Every surface earns its place by demonstrating a decision made, a trade-off evaluated, or a system verified.
2. **Architectural ownership is the signal.** Sam is not an executor who follows tickets — he is the person who writes the spec, chooses the architecture, and is accountable for the outcome. Every page must make this legible.
3. **Evidence, not assertion.** Every claim is backed by a real artifact: a live URL, a repository, a certificate, a measurable outcome. Nothing is invented.
4. **The portfolio is the proof.** The site's own code quality, documentation, and test coverage are part of the pitch. Visitors who look at the source see the same discipline described in the case studies.
5. **Dual legibility without dumbing down.** Technical depth is preserved for technical readers; business readers get clear outcomes and plain-language summaries without losing the signal that Sam knows what he is doing.

## Accessibility & Inclusion

- WCAG AA minimum enforced via automated axe-core Playwright audits on every build.
- `prefers-reduced-motion` is respected for all transitions and animations.
