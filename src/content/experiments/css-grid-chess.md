---
title: "CSS Grid Chess Layout Motif"
summary: "Can a chessboard read as structure alone — an 8x8 alternating field — without rendering a single chess piece?"
objectives:
  - "Build an 8x8 alternating motif that scales at a perfect 1:1 ratio on any screen."
  - "Drive square contrast from semantic surface tokens instead of hardcoded colors."
  - "Keep every interaction adaptive to keyboard focus and reduced-motion preferences."
keyTakeaway: "Chess-inspired structure can be carried by semantic field contrast and disciplined tokens — no literal board rendering required."
status: "completed"
warning: "This is a layout experiment to test responsive aspect-ratio grid overlays and alternating field states. It does not support playable chess logic or stateful game persistence."
technologies:
  - "CSS Grid"
  - "Tailwind CSS v4"
  - "Astro"
demoLinks:
  - label: "View Source"
    url: "https://github.com/samananias/gebportfolio"
---

## Overview

This experiment explores the integration of chess-inspired design motifs within a modern web layout using **Tailwind CSS v4** and **CSS Grid**. Following our handbook's design principle of _Quiet Confidence_, we aim to present structure using a subtle alternating field motif rather than literal representations of chess boards.

## Key Concepts

- **Responsive Aspect Ratios**: Creating components that scale proportionally while maintaining a perfect $1:1$ ratio on any screen size.
- **Semantic Field Contrasts**: Leveraging color system tokens like `--color-surface` and `--color-surface-subtle` rather than hardcoding light and dark squares.
- **Reduced Motion Safety**: Implementing interaction states that transition instantly when system accessibility preferences demand it.

## Technical Implementation

```css
/* Styling an 8x8 alternating grid motif using CSS Grid and semantic variables */
.chess-grid-motif {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  aspect-ratio: 1 / 1;
}

.chess-grid-cell {
  @apply duration-fast transition-colors;
}

/* Alternate cell background using Tailwind v4 surface color tokens */
.chess-grid-cell:nth-child(odd) {
  background-color: var(--color-surface);
}

.chess-grid-cell:nth-child(even) {
  background-color: var(--color-surface-subtle);
}
```

## Accessibility Verification

1. **Contrast Check**: Both alternating grid shades satisfy a minimum contrast ratio of `3:1` against adjacent boundary lines.
2. **Keyboard Traversal**: The interactive demo uses logical indices to enable screen-reader focus outline tracking.
3. **Motion Adaptive**: Hover states transition within `120ms` standard easing and scale down instantly to zero-delay transitions when `prefers-reduced-motion` is active.
