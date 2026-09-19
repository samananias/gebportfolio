import type { APIRoute } from "astro";
// @ts-expect-error cloudflare:workers virtual module resolved during Cloudflare Workers runtime
import { env as cfEnv } from "cloudflare:workers";
import { validatePresetId } from "../../../lib/crop/validation";

export const prerender = false;

/** Maximum metadata-only usage events accepted per IP per rolling window. */
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

const USAGE_EVENTS = ["removal_succeeded", "exported"] as const;
type UsageEvent = (typeof USAGE_EVENTS)[number];

interface MinimalKV {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

function getBinding<T>(name: string): T | null {
  const sources: unknown[] = [];
  try {
    if (typeof cfEnv !== "undefined") {
      sources.push(cfEnv);
    }
  } catch {
    // cloudflare:workers env unavailable during local dev
  }
  sources.push(globalThis);

  for (const source of sources) {
    const value = (source as Record<string, unknown>)?.[name] as T | undefined;
    if (value) {
      return value;
    }
  }
  return null;
}

function jsonError(error: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonOk(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
    },
  });
}

async function isRateLimited(kv: MinimalKV | null, ip: string): Promise<boolean> {
  if (!kv || !ip) return false;

  const key = `crop:rl:${ip}`;
  try {
    const count = Number(await kv.get(key, "json")) || 0;
    if (count >= RATE_LIMIT_MAX) {
      return true;
    }
    await kv.put(key, String(count + 1), {
      expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
    });
  } catch {
    // Rate limiting is best-effort; never block telemetry on KV failure
  }
  return false;
}

/**
 * Metadata-only usage telemetry for the ID Photo Studio.
 *
 * Accepts `{ event, preset, ms }` — never image bytes. Photos stay on the
 * visitor's device (see ADR 0008); this route only counts honest portfolio
 * metrics ("used N times") with best-effort KV archival.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const event = typeof body.event === "string" ? body.event : "";
    if (!(USAGE_EVENTS as readonly string[]).includes(event)) {
      return jsonError("A valid usage event is required.");
    }
    const usageEvent = event as UsageEvent;

    const preset = validatePresetId(body.preset);
    if (!preset) {
      return jsonError("A valid photo size is required.");
    }

    const ms = Number(body.ms);
    if (!Number.isFinite(ms) || ms < 0 || ms > 600_000) {
      return jsonError("A valid processing time is required.");
    }

    const kv = getBinding<MinimalKV>("CHAT_KV");
    const ip = request.headers.get("cf-connecting-ip") ?? "";
    // Rate limiting is production-only: local dev/E2E shares one miniflare IP,
    // so the per-IP bucket would block legitimate testing for an hour.
    if (import.meta.env.PROD && (await isRateLimited(kv, ip))) {
      return jsonError("Too many usage events sent recently. Please try again later.", 429);
    }

    if (kv) {
      try {
        const id = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
        await kv.put(
          `crop:usage:${id}`,
          JSON.stringify({ event: usageEvent, preset, ms, timestamp: Date.now() })
        );
      } catch {
        // Telemetry archival is best-effort
      }
    }

    return jsonOk();
  } catch {
    return jsonError("Failed to record usage.", 500);
  }
};
