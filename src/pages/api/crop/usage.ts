import type { APIRoute } from "astro";
import { validatePresetId } from "../../../lib/crop/validation";
import { isOriginAllowed, getClientIp, checkRateLimit } from "../../../lib/rateLimit";

export const prerender = false;

/** Maximum metadata-only usage events accepted per IP per rolling window. */
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

const USAGE_EVENTS = ["removal_succeeded", "exported"] as const;

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

/**
 * Metadata-only usage telemetry for the ID Photo Studio.
 *
 * Accepts `{ event, preset, ms }` — never image bytes. Photos stay on the
 * visitor's device (see ADR 0008). Zero KV writes performed ($0 cost, protects
 * CHAT_KV write quota).
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Origin verification to reject untrusted external callers
    if (!isOriginAllowed(request)) {
      return jsonError("Forbidden origin.", 403);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const event = typeof body.event === "string" ? body.event : "";
    if (!(USAGE_EVENTS as readonly string[]).includes(event)) {
      return jsonError("A valid usage event is required.");
    }

    const preset = validatePresetId(body.preset);
    if (!preset) {
      return jsonError("A valid photo size is required.");
    }

    const ms = Number(body.ms);
    if (!Number.isFinite(ms) || ms < 0 || ms > 600_000) {
      return jsonError("A valid processing time is required.");
    }

    // 2. In-memory rate limiting (0 KV reads, 0 KV writes)
    const ip = getClientIp(request);
    if (import.meta.env.PROD) {
      const rateCheck = checkRateLimit({
        key: `crop:usage:${ip}`,
        maxRequests: RATE_LIMIT_MAX,
        windowMs: RATE_LIMIT_WINDOW_SECONDS * 1000,
      });

      if (!rateCheck.allowed) {
        return jsonError("Too many usage events sent recently. Please try again later.", 429);
      }
    }

    // 3. Telemetry metrics are best-effort; zero writes to Cloudflare KV.
    // Prevents exhausting the account's 1,000 daily KV write quota on CHAT_KV.
    return jsonOk();
  } catch {
    return jsonError("Failed to record usage.", 500);
  }
};
