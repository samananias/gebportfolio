import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import keystatic from "@keystatic/astro";
import cloudflare from "@astrojs/cloudflare";
import fs from "fs";
import path from "path";

// Paths for singleton sync
const ROOT = process.cwd();
const SITE_SRC = path.join(ROOT, "src/content/data/site.json");
const NAV_SRC = path.join(ROOT, "src/content/data/navigation.json");
const KEYSTATIC_DIR = path.join(ROOT, ".keystatic/data");
const SITE_KS = path.join(KEYSTATIC_DIR, "site.json");
const NAV_KS = path.join(KEYSTATIC_DIR, "navigation.json");

/**
 * Vite plugin that synchronizes Keystatic singletons (objects)
 * with Astro Content Collections loaders (arrays).
 */
function syncSingletonsPlugin() {
  let isWriting = false;

  const wrapAndWrite = (srcPath: string, ksPath: string, id: string) => {
    try {
      if (!fs.existsSync(ksPath)) return;
      const dataStr = fs.readFileSync(ksPath, "utf-8");
      if (!dataStr.trim()) return;
      const obj = JSON.parse(dataStr);
      const wrapped = [{ id, ...obj }];
      isWriting = true;
      fs.writeFileSync(srcPath, JSON.stringify(wrapped, null, 2) + "\n");
      setTimeout(() => {
        isWriting = false;
      }, 200);
    } catch (e) {
      console.error(`[SyncPlugin] Error wrapping ${path.basename(ksPath)}:`, e);
    }
  };

  const syncSrcToKeystatic = () => {
    if (!fs.existsSync(KEYSTATIC_DIR)) {
      fs.mkdirSync(KEYSTATIC_DIR, { recursive: true });
    }

    if (fs.existsSync(SITE_SRC)) {
      try {
        const dataStr = fs.readFileSync(SITE_SRC, "utf-8");
        if (dataStr.trim()) {
          const arr = JSON.parse(dataStr);
          if (Array.isArray(arr) && arr.length > 0) {
            const obj = { ...arr[0] };
            delete obj.id;
            fs.writeFileSync(SITE_KS, JSON.stringify(obj, null, 2) + "\n");
          }
        }
      } catch (e) {
        console.error("[SyncPlugin] Error syncing site.json to Keystatic:", e);
      }
    }

    if (fs.existsSync(NAV_SRC)) {
      try {
        const dataStr = fs.readFileSync(NAV_SRC, "utf-8");
        if (dataStr.trim()) {
          const arr = JSON.parse(dataStr);
          if (Array.isArray(arr) && arr.length > 0) {
            const obj = { ...arr[0] };
            delete obj.id;
            fs.writeFileSync(NAV_KS, JSON.stringify(obj, null, 2) + "\n");
          }
        }
      } catch (e) {
        console.error("[SyncPlugin] Error syncing navigation.json to Keystatic:", e);
      }
    }
  };

  return {
    name: "sync-singletons-plugin",
    configResolved() {
      // Sync on startup (dev and build)
      syncSrcToKeystatic();
    },
    configureServer() {
      if (!fs.existsSync(KEYSTATIC_DIR)) {
        fs.mkdirSync(KEYSTATIC_DIR, { recursive: true });
      }

      // Watch Keystatic writes
      fs.watch(KEYSTATIC_DIR, (_eventType, filename) => {
        if (isWriting) return;
        if (filename === "site.json") {
          wrapAndWrite(SITE_SRC, SITE_KS, "site-config");
        } else if (filename === "navigation.json") {
          wrapAndWrite(NAV_SRC, NAV_KS, "navigation-config");
        }
      });

      // Watch developer/git edits in src/content/data
      const srcDir = path.dirname(SITE_SRC);
      if (fs.existsSync(srcDir)) {
        fs.watch(srcDir, (_eventType, filename) => {
          if (isWriting) return;
          if (filename === "site.json" || filename === "navigation.json") {
            syncSrcToKeystatic();
          }
        });
      }
    },
  };
}

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    imageService: "passthrough",
  }),
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
    // Only include Keystatic integration in development/preview builds
    ...(process.env.NODE_ENV === "production" ? [] : [keystatic()]),
  ],
  devToolbar: {
    // Playwright's webServer boots `astro dev`; the toolbar's fixed overlay
    // intercepts pointer events in E2E runs, so it is disabled under the
    // PLAYWRIGHT_E2E gate set in playwright.config.ts. Regular dev keeps it.
    enabled: process.env.PLAYWRIGHT_E2E !== "1",
  },
  vite: {
    plugins: [tailwindcss(), syncSingletonsPlugin()],
  },
});
