---
title: "ID Photo Studio"
status: "active"
warning: "In-browser AI background removal downloads a one-time model (~40MB, browser-cached). Photos are processed on-device and never uploaded in v1."
technologies:
  - "React 19 Island"
  - "Canvas"
  - "ONNX/WASM"
  - "Cloudflare Workers"
demoLinks:
  - label: "Open ID Photo Tool"
    url: "https://samananias.is-a.dev/crop"
  - label: "Remove Only Page"
    url: "https://samananias.is-a.dev/remove-background"
---

## Overview

Free ID-photo tool: upload a portrait, remove the background locally in the
browser, crop to Philippine ID presets (2x2 at 600x600px, 1x1 at 300x300px),
pick a background, and download a print-ready file.

## Privacy Model

Heavy ML stays on-device via `@imgly/background-removal-js` (AGPL-3.0). The
Workers backend serves canonical preset config, records metadata-only usage
telemetry, and reserves a `501` stub for a future paid fallback — it never
receives image bytes.

## Backend Contract

- `GET /api/crop/config` — canonical presets, backgrounds, export caps.
- `POST /api/crop/usage` — metadata-only `{ event, preset, ms }` telemetry.
- `POST /api/crop/remove` — `501` with `fallback: client` until a paid
  fallback is enabled.
