import type { APIRoute } from "astro";
// @ts-expect-error cloudflare:workers virtual module resolved during Cloudflare Workers runtime
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

/** Limits enforced server-side regardless of client-side constraints. */
const LIMITS = {
  name: 100,
  email: 254,
  message: 5000,
} as const;

/** Maximum contact submissions allowed per IP per rolling window. */
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

/**
 * Verified Brevo sender address. Brevo's free tier requires no domain
 * authentication — the individual sender is verified by email confirmation,
 * so this must stay a mailbox the author can confirm (see ADR 0007).
 */
const INBOX_ADDRESS = "samananiascases@gmail.com";
const SENDER_NAME = "Portfolio contact form";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

interface MinimalKV {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface ContactPayload {
  name: string;
  email: string;
  message: string;
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

function sanitizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

/**
 * Sends the message through Brevo's transactional email API. The verified
 * sender address is the author's own inbox; the visitor rides in Reply-To.
 */
async function deliverViaBrevo(apiKey: string, payload: ContactPayload): Promise<boolean> {
  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: INBOX_ADDRESS },
        to: [{ name: "Sam Ananias Cases", email: INBOX_ADDRESS }],
        replyTo: { name: payload.name, email: payload.email },
        subject: `[Portfolio] ${payload.name}`,
        textContent: `Name: ${payload.name}\r\nEmail: ${payload.email}\r\n\r\n${payload.message}\r\n`,
      }),
    });

    if (response.ok) {
      return true;
    }

    // Log enough to diagnose (status + short body) without leaking the API key
    const detail = await response.text().catch(() => "");
    console.error(
      `Contact delivery failed: Brevo responded HTTP ${response.status}. ${detail.slice(0, 200)}`
    );
    return false;
  } catch (error) {
    console.error("Contact delivery failed: Brevo request error.", error);
    return false;
  }
}

/** Best-effort KV archive so a message is never silently lost. */
async function archiveToInbox(
  kv: MinimalKV | null,
  payload: ContactPayload,
  delivered: boolean
): Promise<void> {
  if (!kv) return;
  try {
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    await kv.put(
      `contact:inbox:${id}`,
      JSON.stringify({ ...payload, timestamp: Date.now(), delivered })
    );
  } catch {
    // Archival is best-effort alongside primary email delivery
  }
}

async function isRateLimited(kv: MinimalKV | null, ip: string): Promise<boolean> {
  if (!kv || !ip) return false;

  const key = `contact:rl:${ip}`;
  try {
    const count = Number(await kv.get(key, "json")) || 0;
    if (count >= RATE_LIMIT_MAX) {
      return true;
    }
    await kv.put(key, String(count + 1), {
      expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
    });
  } catch {
    // Rate limiting is best-effort; never block a legitimate submit on KV failure
  }
  return false;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Honeypot: bots filling the invisible "website" field are silently accepted
    if (sanitizeText(body.website)) {
      return jsonOk();
    }

    const payload: ContactPayload = {
      name: sanitizeText(body.name).slice(0, LIMITS.name),
      email: sanitizeText(body.email).slice(0, LIMITS.email),
      message: sanitizeText(body.message).slice(0, LIMITS.message),
    };

    if (!payload.name) {
      return jsonError("Your name is required.");
    }
    if (!isValidEmail(payload.email)) {
      return jsonError("A valid email address is required.");
    }
    if (!payload.message) {
      return jsonError("A message is required.");
    }

    const kv = getBinding<MinimalKV>("CHAT_KV");
    const ip = request.headers.get("cf-connecting-ip") ?? "";
    // Rate limiting is production-only: local dev/E2E shares one miniflare IP,
    // so the per-IP bucket would block legitimate testing for an hour.
    if (import.meta.env.PROD && (await isRateLimited(kv, ip))) {
      return jsonError("Too many messages sent recently. Please try again later.", 429);
    }

    const apiKey = getBinding<string>("BREVO_API_KEY");
    const delivered = apiKey ? await deliverViaBrevo(apiKey, payload) : false;

    if (!delivered) {
      // Archive so the message is never silently lost
      await archiveToInbox(kv, payload, false);

      if (apiKey) {
        // Brevo was configured but rejected or errored: be honest, offer recovery
        return jsonError(
          "The message could not be delivered right now. Please email me directly instead.",
          502
        );
      }
      if (import.meta.env.PROD) {
        console.error("Contact delivery skipped: BREVO_API_KEY is not configured.");
        return jsonError(
          "The message could not be delivered right now. Please email me directly instead.",
          502
        );
      }
      // Local dev/E2E without Brevo configured: accept the submission so
      // form flows stay testable; no email is actually expected here.
      return jsonOk();
    }

    await archiveToInbox(kv, payload, true);
    return jsonOk();
  } catch {
    return jsonError("Failed to process your message.", 500);
  }
};
