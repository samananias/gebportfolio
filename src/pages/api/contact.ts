import type { APIRoute } from "astro";
import { getWorkersEnv } from "../../lib/bindings";
import { verifyTurnstileToken, getTurnstileSecret } from "../../lib/turnstile";
import { consumeThrottle } from "../../lib/dbThrottle";

export const prerender = false;

/** Limits enforced server-side regardless of client-side constraints. */
const LIMITS = {
  name: 100,
  email: 254,
  message: 5000,
} as const;

/** Rate limits and quota budgets enforced via atomic D1 throttle buckets. */
const THROTTLE_LIMITS = {
  ipMax: 3,
  ipWindowSeconds: 3600, // 3 per hour per IP
  globalHourMaxDefault: 12,
  globalHourWindowSeconds: 3600, // 12 per hour site-wide
  emailDailyBudgetDefault: 200,
  emailDailyWindowSeconds: 86400, // 200 per day Brevo budget (free tier = 300)
} as const;

/** 90-day retention for contact inbox messages stored in KV. */
const ARCHIVE_TTL_SECONDS = 90 * 86400;

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

async function getBinding<K extends keyof App.Locals>(
  name: K,
  locals?: App.Locals
): Promise<NonNullable<App.Locals[K]> | null> {
  const cfEnv = await getWorkersEnv();
  const value = (locals?.[name] ||
    (globalThis as unknown as Record<string, unknown>)?.[name] ||
    cfEnv?.[name]) as NonNullable<App.Locals[K]> | undefined;
  if (value) {
    return value;
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

/** Best-effort KV archive so a message is never silently lost (with 90-day retention). */
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
      JSON.stringify({ ...payload, timestamp: Date.now(), delivered }),
      { expirationTtl: ARCHIVE_TTL_SECONDS }
    );
  } catch {
    // Archival is best-effort alongside primary email delivery
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
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

    const ip = request.headers.get("cf-connecting-ip") ?? "";
    const requestHost = request.headers.get("host") || new URL(request.url).host;

    // Turnstile bot verification (gate, don't replace)
    const turnstileSecret = await getTurnstileSecret(locals);
    const turnstileResult = await verifyTurnstileToken({
      token: body["cf-turnstile-response"],
      secret: turnstileSecret,
      clientIp: ip,
      expectedAction: "contact",
      requestHostname: requestHost,
    });

    if (!turnstileResult.success) {
      return jsonError(
        turnstileResult.error || "Security verification failed. Please try again.",
        403
      );
    }

    // Emergency kill switch: CONTACT_LOCKED=1 in Cloudflare dashboard
    const cfEnv = await getWorkersEnv();
    const contactLocked =
      cfEnv?.CONTACT_LOCKED ??
      (typeof process !== "undefined" ? process.env?.CONTACT_LOCKED : undefined);
    if (contactLocked === "1" || contactLocked === "true") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "The contact form is temporarily unavailable. Please try again later.",
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "300",
          },
        }
      );
    }

    const db = await getBinding("DB", locals);

    // Rate limiting is production-only (or when D1 is available in test):
    // local adapterless dev shares one IP, so D1 rate limits are skipped when db is null.
    if ((import.meta.env.PROD || process.env.TEST_D1_RATE_LIMIT === "1") && db) {
      // 1. Per-IP rolling window throttle (3 / 3600s)
      const ipBucket = `contact:ip:${ip || "unknown"}`;
      const ipThrottle = await consumeThrottle(
        db,
        ipBucket,
        THROTTLE_LIMITS.ipMax,
        THROTTLE_LIMITS.ipWindowSeconds
      );

      if (!ipThrottle.allowed) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Too many messages sent recently. Please try again later.",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(ipThrottle.retryAfterSec || 3600),
            },
          }
        );
      }

      // 2. Global hourly rate limit (12 / 3600s, overridable via CONTACT_HOURLY_MAX)
      const hourlyMax =
        cfEnv?.CONTACT_HOURLY_MAX !== undefined
          ? Number(cfEnv.CONTACT_HOURLY_MAX)
          : process.env.CONTACT_HOURLY_MAX !== undefined
            ? Number(process.env.CONTACT_HOURLY_MAX)
            : THROTTLE_LIMITS.globalHourMaxDefault;

      const globalHourThrottle = await consumeThrottle(
        db,
        "contact:global:hour",
        hourlyMax,
        THROTTLE_LIMITS.globalHourWindowSeconds
      );

      if (!globalHourThrottle.allowed) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "High message volume right now. Please try again later.",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(globalHourThrottle.retryAfterSec || 3600),
            },
          }
        );
      }
    }

    const kv = await getBinding("CHAT_KV", locals);
    const apiKey = await getBinding("BREVO_API_KEY", locals);

    // 3. Daily transactional email budget check before calling Brevo
    if ((import.meta.env.PROD || process.env.TEST_D1_RATE_LIMIT === "1") && db && apiKey) {
      const configuredBudget =
        cfEnv?.CONTACT_DAILY_EMAIL_BUDGET !== undefined
          ? Number(cfEnv.CONTACT_DAILY_EMAIL_BUDGET)
          : process.env.CONTACT_DAILY_EMAIL_BUDGET !== undefined
            ? Number(process.env.CONTACT_DAILY_EMAIL_BUDGET)
            : THROTTLE_LIMITS.emailDailyBudgetDefault;

      const emailThrottle = await consumeThrottle(
        db,
        "contact:email:day",
        configuredBudget,
        THROTTLE_LIMITS.emailDailyWindowSeconds
      );

      if (!emailThrottle.allowed) {
        // Budget exhausted: skip Brevo delivery, archive with delivered: false, return honest 502
        await archiveToInbox(kv, payload, false);
        console.warn(
          `[Contact Budget Exhausted]: Daily email budget of ${configuredBudget} reached. Skipping Brevo delivery.`
        );
        return jsonError(
          "The message could not be delivered right now. Please email me directly instead.",
          502
        );
      }
    }

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
