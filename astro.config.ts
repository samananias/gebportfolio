import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
// Suspended per ADR 0009 — uncomment with the keystatic() line below on revival.
// import keystatic from "@keystatic/astro";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
//
// Note: The Cloudflare adapter is explicit-opt-in for `astro dev` (default
// runs adapterless Node). Set `CF_DEV=1` to emulate the Cloudflare workerd
// runtime for KV/D1 testing (Git Bash: `CF_DEV=1 pnpm dev`, cmd:
// `set CF_DEV=1&& pnpm dev`). `astro build` / `astro preview` always apply
// the adapter via argv detection so SSR API routes (`prerender: false`)
// deploy to Workers. Env-flag (not argv) gating for dev keeps CI's Playwright
// webServer boot deterministic under `pnpm exec` shims.
const useCloudflareAdapter =
  process.env.CF_DEV === "1" || process.argv.includes("build") || process.argv.includes("preview");

export default defineConfig({
  ...(useCloudflareAdapter
    ? {
        adapter: cloudflare({
          imageService: "passthrough",
        }),
      }
    : {}),
  markdown: {
    // Bind Shiki's syntax colors to the design tokens instead of a baked
    // palette (github-dark's comment tokens fail WCAG AA). Token values live
    // in src/styles/global.css under the `--astro-code-*` variables.
    shikiConfig: {
      theme: "css-variables",
    },
  },
  integrations: [
    react(),
    // Suspended per ADR 0009: Keystatic visual editor is unwired (files-only
    // content editing via src/content/*). keystatic.config.ts, .keystatic/data/,
    // and @keystatic/* deps are preserved for a one-uncomment revival.
    // ...(process.env.NODE_ENV === "production" ? [] : [keystatic()]),
  ],
  devToolbar: {
    // Playwright's webServer boots `astro dev`; the toolbar's fixed overlay
    // intercepts pointer events in E2E runs, so it is disabled under the
    // PLAYWRIGHT_E2E gate set in playwright.config.ts. Regular dev keeps it.
    enabled: process.env.PLAYWRIGHT_E2E !== "1",
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
