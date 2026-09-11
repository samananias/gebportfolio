# Feature Plans & Design Specifications

<callout icon="♞">**Status:** Active · **Owner:** Gen · **Last Reviewed:** 2026-07-24</callout>

This directory contains technical design plans, feature specifications, and RFC proposals for the personal portfolio codebase.

## Purpose

Plans in this directory serve as durable technical blueprints for significant upcoming features or refactors. They help AI agents and human contributors align on requirements, architecture, component design, and verification steps before writing code.

## Lifecycle & Statuses

Each plan file must specify a status badge in its header:

- `Draft` — Initial specification proposal undergoing design review.
- `Approved` — Reviewed and ready for implementation.
- `In Progress` — Active development underway.
- `Implemented` — Feature complete, verified, and released.
- `Superseded` — Replaced by a newer plan or ADR.

## Authority Order

1. Approved ADRs inside [decisions/](../decisions/README.md)
2. The [Handbook](../../Portfolio%20Architecture%20%26%20Engineering%20Handbook%202e6dfc6171c0423a8fc61d2f398ece49.md)
3. Active Feature Plans inside [plans/](README.md)
4. Content and TypeScript schemas
5. Implementation patterns

## Naming Convention

Name files using sequential feature numbers and short kebab-case titles:

- Major Specifications: `NNNN-feature-name.md` (e.g. `0001-home-page-specification.md`).
- Execution Roadmaps: `NNNN.1-feature-roadmap.md` (e.g. `0001.1-home-page-implementation-roadmap.md`).

For quick iteration, copy the standard template from [0000-template.md](0000-template.md).

## Index of Plans

| ID       | Title                                                                                                                            | Status        | Date       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------- |
| `0000`   | [Standard Feature Plan Template](0000-template.md)                                                                               | `Active`      | 2026-07-24 |
| `0001`   | [Home Page IA & Content Specification](0001-home-page-specification.md)                                                          | `Approved`    | 2026-07-24 |
| `0001.1` | [Home Page Implementation Roadmap & Checkpoints](0001.1-home-page-implementation-roadmap.md)                                     | `Implemented` | 2026-07-24 |
| `0002`   | [Work Page IA & Content Specification](0002-work-page-specification.md)                                                          | `Approved`    | 2026-07-25 |
| `0002.1` | [Work Page Implementation Roadmap & Checkpoints](0002.1-work-page-implementation-roadmap.md)                                     | `Active`      | 2026-07-25 |
| `0003`   | [Anonymous Real-Time Chatbox Architecture & Design Specification](0003-anonymous-realtime-chatbox-specification.md)              | `Approved`    | 2026-07-27 |
| `0003.1` | [Anonymous Real-Time Chatbox Implementation Roadmap & Checkpoints](0003.1-anonymous-realtime-chatbox-implementation-roadmap.md)  | `Implemented` | 2026-07-27 |
| `0004`   | [Anonymous Shared Chess Game Architecture & Specification](0004-anonymous-shared-chess-game-specification.md)                    | `Approved`    | 2026-07-28 |
| `0004.1` | [Anonymous Shared Chess Game Implementation Roadmap & Checkpoints](0004.1-anonymous-shared-chess-game-implementation-roadmap.md) | `Active`      | 2026-07-28 |
| `0004.2` | [Chess Checkmate Handling, Match Reset & Pawn Promotion Specification](0004.2-chess-checkmate-and-pawn-promotion-plan.md)        | `Approved`    | 2026-08-13 |
| `0004.3` | [Chess Checkmate, Pawn Promotion & Contributor Tracking Implementation Roadmap](0004.3-chess-checkmate-and-promotion-roadmap.md) | `Active`      | 2026-08-13 |
| `0005`   | [Experience Page Architecture, Schema & Content Specification](0005-experience-page-specification.md)                            | `Approved`    | 2026-07-31 |
| `0006`   | [ID Photo Studio Specification](0006-id-photo-studio-specification.md)                                                           | `Draft`       | 2026-09-10 |
| `0006.1` | [ID Photo Studio Backend Roadmap & Checkpoints](0006.1-id-photo-studio-backend-roadmap.md)                                       | `Draft`       | 2026-09-10 |
| `0007`   | [Image Editing Improvements](0007-image-editing-improvements.md)                                                                 | `Draft`       | 2026-09-11 |
| `0007.1` | [Image Editing Improvements Roadmap & Checkpoints](0007.1-image-editing-roadmap.md)                                              | `Draft`       | 2026-09-11 |
