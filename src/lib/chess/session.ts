import { getWorkersEnv } from "../bindings";

const COOKIE_NAME = "chess_session";

export interface SessionData {
  sessionId: string;
  side: "white" | "black";
}

const encoder = new TextEncoder();

/**
 * Dynamically resolves the session HMAC secret from runtime bindings,
 * locals, or TURNSTILE_SECRET fallback, failing closed in production.
 */
export async function getSessionSecret(locals?: App.Locals): Promise<string | null> {
  if (locals?.CHESS_SESSION_SECRET) {
    return locals.CHESS_SESSION_SECRET;
  }
  const env = await getWorkersEnv();
  if (env?.CHESS_SESSION_SECRET) {
    return env.CHESS_SESSION_SECRET as string;
  }
  if (locals?.TURNSTILE_SECRET) {
    return locals.TURNSTILE_SECRET;
  }
  if (env?.TURNSTILE_SECRET) {
    return env.TURNSTILE_SECRET as string;
  }
  // Allow fallback secret in local dev or automated Playwright test suites
  if (!import.meta.env.PROD || process.env.PLAYWRIGHT_E2E === "1") {
    return process.env.CHESS_SESSION_SECRET || "turn-arbiter-local-dev-secret-key-32bytes";
  }
  return null;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Sign session payload (sessionId + side) using Web Crypto HMAC-SHA256.
 */
export async function signSession(
  sessionId: string,
  side: "white" | "black",
  locals?: App.Locals | string
): Promise<string> {
  const secret = typeof locals === "string" ? locals : await getSessionSecret(locals);
  if (!secret) {
    throw new Error("Chess session secret is not configured.");
  }
  const payload = `${sessionId}:${side}`;
  const key = await getHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hexSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${payload}.${hexSignature}`;
}

/**
 * Verify signed session cookie value using Web Crypto.
 * Returns SessionData if valid, null if invalid, tampered, or secret unconfigured.
 */
export async function verifySession(
  cookieValue: string | undefined | null,
  locals?: App.Locals | string
): Promise<SessionData | null> {
  if (!cookieValue) return null;

  const lastDotIndex = cookieValue.lastIndexOf(".");
  if (lastDotIndex === -1) return null;

  const payload = cookieValue.substring(0, lastDotIndex);
  const signature = cookieValue.substring(lastDotIndex + 1);

  const parts = payload.split(":");
  if (parts.length !== 2) return null;

  const [sessionId, side] = parts;
  if (side !== "white" && side !== "black") return null;

  const secret = typeof locals === "string" ? locals : await getSessionSecret(locals);
  if (!secret) return null;

  const key = await getHmacKey(secret);
  const expectedBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedHex = Array.from(new Uint8Array(expectedBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (signature !== expectedHex) return null;

  return { sessionId, side };
}

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export { COOKIE_NAME };
