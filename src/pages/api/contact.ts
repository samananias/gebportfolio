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

const DESTINATION_ADDRESS = "samananiascases@gmail.com";
const DEFAULT_SENDER_ADDRESS = "contact@samananias.is-a.dev";

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

/** Builds an RFC 5322 plain-text message body for the Email Workers binding. */
function buildRawMime(payload: ContactPayload, senderAddress: string): string {
  const escapeHeader = (value: string) => value.replace(/[\r\n]+/g, " ");
  return [
    `From: ${escapeHeader(payload.name)} <${senderAddress}>`,
    `To: ${DESTINATION_ADDRESS}`,
    `Reply-To: ${escapeHeader(payload.name)} <${escapeHeader(payload.email)}>`,
    `Subject: [Portfolio] ${escapeHeader(payload.name)}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    "",
    payload.message,
    "",
  ].join("\r\n");
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

async function deliverEmail(raw: string, senderAddress: string): Promise<boolean> {
  try {
    const sender = getBinding<{ send(message: unknown): Promise<void> }>("CONTACT_EMAIL");
    if (!sender?.send) {
      return false;
    }

    // cloudflare:email is only resolvable inside the Workers runtime
    const emailModule = (await import(/* @vite-ignore */ "cloudflare:email" as string)) as {
      EmailMessage: new (from: string, to: string, raw: string) => unknown;
    };

    const email = new emailModule.EmailMessage(senderAddress, DESTINATION_ADDRESS, raw);
    await sender.send(email);
    return true;
  } catch {
    return false;
  }
}

async function persistToInbox(kv: MinimalKV | null, payload: ContactPayload): Promise<void> {
  if (!kv) return;
  try {
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    await kv.put(
      `contact:inbox:${id}`,
      JSON.stringify({ ...payload, timestamp: Date.now(), delivered: true })
    );
  } catch {
    // Inbox persistence is best-effort alongside primary email delivery
  }
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
    if (await isRateLimited(kv, ip)) {
      return jsonError("Too many messages sent recently. Please try again later.", 429);
    }

    const senderAddress = getBinding<string>("CONTACT_SENDER_EMAIL") || DEFAULT_SENDER_ADDRESS;
    const rawMime = buildRawMime(payload, senderAddress);
    const delivered = await deliverEmail(rawMime, senderAddress);

    if (!delivered) {
      // No email binding (local dev or delivery failure): archive instead of losing the message
      if (kv) {
        try {
          const id = `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
          await kv.put(
            `contact:inbox:${id}`,
            JSON.stringify({ ...payload, timestamp: Date.now(), delivered })
          );
        } catch {
          // fall through — client still receives success only if archived
          return jsonError(
            "The message could not be delivered right now. Please email me directly instead.",
            503
          );
        }
        return jsonOk();
      }
      return jsonOk();
    }

    await persistToInbox(kv, payload);
    return jsonOk();
  } catch {
    return jsonError("Failed to process your message.", 500);
  }
};
