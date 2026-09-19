/**
 * Cloudflare bindings resolver.
 *
 * Astro v6/v7 removed `Astro.locals.runtime.env` — the only supported way to
 * reach Workers bindings is `import { env } from "cloudflare:workers"`. That
 * virtual module only resolves under workerd, so it can never be a *static*
 * import here (adapterless Node dev/CI crashes at file load, before any
 * try/catch can run — the original bug this module replaces).
 *
 * Instead the import happens lazily inside the request path and any failure
 * (non-workerd runtime) resolves to `null`, letting every consumer fall back
 * to in-memory storage. In production, the build keeps `cloudflare:workers`
 * external (see the esbuild step in package.json) and workerd resolves it
 * natively, so the same code returns the real `env` with KV/D1 bindings.
 */
let cachedEnv: Record<string, unknown> | null | undefined;

export async function getWorkersEnv(): Promise<Record<string, unknown> | null> {
  if (cachedEnv !== undefined) return cachedEnv;
  try {
    // @ts-expect-error virtual module: only resolvable under workerd; any
    // failure (adapterless Node dev/CI) is caught below and resolves null.
    const mod = (await import("cloudflare:workers")) as { env?: Record<string, unknown> };
    cachedEnv = typeof mod?.env === "object" && mod.env !== null ? mod.env : null;
  } catch {
    // Not running under workerd (adapterless Node dev/CI): use fallbacks.
    cachedEnv = null;
  }
  return cachedEnv;
}
