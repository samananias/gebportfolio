---
title: "Color Scheme & Theme Tokens Sandbox"
summary: "What does it take to keep a design system's colors bound to semantic roles — no hardcoded hex in markup, no tailwind.config.js — and prove it live?"
objectives:
  - "Demonstrate the three-layer token pipeline: raw palette, semantic roles, Tailwind theme bindings."
  - "Verify fluid type scales with clamp() across viewport widths."
  - "Prove the CSS-first approach needs no tailwind.config.js to stay in sync."
keyTakeaway: "A CSS-first token chain keeps every color bound to a semantic role — markup never needs a hardcoded hex."
status: "active"
warning: "This sandbox references real-time CSS custom property changes. Overriding native browser parameters can result in unexpected color mapping behavior."
technologies:
  - "CSS Variables"
  - "Tailwind CSS v4"
  - "Fluid Typography"
demoLinks:
  - label: "Design System Page"
    url: "/design-system"
---

## Introduction

This experiment maps our portfolio design token structure dynamically. We demonstrate how raw palette values are translated into semantic roles and bounded natively within **Tailwind CSS v4** without any JavaScript configurations.

## The Three-Layer Design Tokens Architecture

1. **Raw Palette**: Declared at the `:root` levels of `src/styles/tokens.css` (e.g., `--palette-ink: #261e1a`).
2. **Semantic Tokens**: Contextual mappings like `--color-bg-raw` and `--color-text-raw` which adapt dynamically when the `.dark` class is attached to the document.
3. **Tailwind Theme Binding**: Exposing standard properties like `bg-bg`, `text-text-muted`, and `border-border-custom` within `src/styles/global.css` using Tailwind's native `@theme` directives.

## Variable Reference Map

Below is a breakdown of our color role structure:

| Semantic Class | Light Value | Dark Value | Rationale                                                       |
| :------------- | :---------- | :--------- | :-------------------------------------------------------------- |
| `bg-bg`        | `#f8f7f5`   | `#261e1a`  | Off-white avoids sterile screens; warm dark ink provides depth. |
| `bg-surface`   | `#ffffff`   | `#342d2a`  | Lifted charcoal cards provide visual separation.                |
| `text-text`    | `#261e1a`   | `#e2efff`  | Strong contrast tinted with pale strategic blue.                |
| `text-primary` | `#4b648a`   | `#84a1cc`  | Strategic blue action anchor highlight.                         |

## Fluid Typography Clamp Verification

Our fluid scale maps typographic sizes dynamically across viewport sizes using CSS `clamp()` functions:

- **H1 Scale**: `clamp(2.5rem, 1.77rem + 3.26vw, 4rem)` (scales smoothly from `40px` on mobile up to `64px` on desktop widths).
- **Body Scale**: `clamp(1rem, 0.95rem + 0.2vw, 1.125rem)` (scales from `16px` up to `18px`).
