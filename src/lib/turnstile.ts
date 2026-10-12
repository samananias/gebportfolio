import { getWorkersEnv } from "./bindings";

export * from "./turnstileConstants";

/**
 * 15-Minute Human Chat Pass lifetime in milliseconds.
 */
export const CHAT_PASS_TTL_MS = 15 * 60 * 1000;

export interface VerifyTurnstileOptions {
  token: unknown;
  secret: string | null | undefined;
  clientIp?: string;
  expectedAction: string;
  requestHostname?: string;
}

export interface VerifyTurnstileResult {
  success: boolean;
  error?: string;
}

const PROD_ALLOWED_HOSTNAMES = new Set([
  "samananias.is-a.dev",
  "gebportfolio.pages.dev",
  "gebportfolio.workers.dev",
]);

const DEV_ALLOWED_HOSTNAMES = new Set([...PROD_ALLOWED_HOSTNAMES, "localhost", "127.0.0.1"]);

/**
 * Checks whether an incoming request hostname corresponds to a local development machine.
 * Strips port numbers and lowercases before comparison.
 */
export function isLocalRequestHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const clean = host.toLowerCase().split(":")[0].trim();
  return clean === "localhost" || clean === "127.0.0.1";
}

/**
 * Checks if a hostname belongs to a Cloudflare Pages or Workers preview deployment.
 */
export function isPreviewHostname(hostname?: string): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase().split(":")[0];
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host === "gebportfolio.pages.dev" || host.endsWith(".gebportfolio.pages.dev")) return true;
  if (host === "gebportfolio.workers.dev") return true;
  return false;
}

/**
 * Resolves the TURNSTILE_SECRET from Workers environment, Astro locals, or process.env.
 */
export async function getTurnstileSecret(locals?: App.Locals): Promise<string | null> {
  const cfEnv = await getWorkersEnv();
  const secret = (locals?.TURNSTILE_SECRET ||
    (globalThis as unknown as Record<string, unknown>)?.TURNSTILE_SECRET ||
    cfEnv?.TURNSTILE_SECRET ||
    cfEnv?.TURNSTILE_SECRET_KEY ||
    cfEnv?.CF_TURNSTILE_SECRET ||
    cfEnv?.CLOUDFLARE_TURNSTILE_SECRET ||
    (typeof process !== "undefined"
      ? process.env?.TURNSTILE_SECRET || process.env?.TURNSTILE_SECRET_KEY
      : undefined) ||
    (typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env.TURNSTILE_SECRET as string | undefined)
      : undefined)) as string | undefined;
  return secret?.trim() || null;
}

const redeemedTurnstileTokens = new Map<string, number>();
const REPLAY_CACHE_TTL_MS = 10 * 60 * 1000;

export function clearRedeemedTokensCache(): void {
  redeemedTurnstileTokens.clear();
}

/**
 * Determines whether the current environment allows dev/test bypasses.
 * When a hostname is provided, it strictly requires the host to be local.
 */
export function isDevOrTest(host?: string | null): boolean {
  if (import.meta.env?.PROD && process.env.PLAYWRIGHT_E2E !== "1") {
    return false;
  }
  if (host !== undefined && host !== null) {
    return isLocalRequestHost(host);
  }
  return true;
}

/**
 * Validates a Turnstile cf-turnstile-response token server-side via siteverify.
 */
export async function verifyTurnstileToken(
  options: VerifyTurnstileOptions
): Promise<VerifyTurnstileResult> {
  const { token, secret, clientIp, expectedAction, requestHostname } = options;

  // Token shape validation (1 to 2048 non-whitespace characters)
  if (typeof token !== "string" || token.trim().length === 0 || token.length > 2048) {
    return {
      success: false,
      error: "Security verification token is missing or malformed.",
    };
  }

  // In test/local environments, permit requests if no secret is configured or during Playwright runs,
  // strictly requiring the request host to be local (localhost / 127.0.0.1).
  const isLocal =
    requestHostname !== undefined && requestHostname !== null
      ? isLocalRequestHost(requestHostname)
      : !import.meta.env?.PROD;

  if ((!import.meta.env?.PROD || process.env.PLAYWRIGHT_E2E === "1") && isLocal) {
    if (!secret || token === "dummy-test-token") {
      return { success: true };
    }
  }

  // Fail closed: a missing secret never verifies anything outside dev/test.
  if (!secret) {
    console.error(
      "[Turnstile Error]: TURNSTILE_SECRET is not configured. Add it in Cloudflare Dashboard > Workers & Pages > gebportfolio > Settings > Variables and Secrets (for BOTH Production and Preview)."
    );
    return {
      success: false,
      error:
        "Security verification service is not configured. Please ensure TURNSTILE_SECRET is set in Cloudflare Variables and Secrets.",
    };
  }

  const trimmedToken = token.trim();

  // Sliding window replay defense
  const seenAt = redeemedTurnstileTokens.get(trimmedToken);
  if (seenAt && Date.now() - seenAt < REPLAY_CACHE_TTL_MS) {
    return {
      success: false,
      error:
        "Security verification token has already been redeemed. Please solve a fresh challenge.",
    };
  }

  // Call Cloudflare Siteverify API
  try {
    const formData = new URLSearchParams();
    formData.append("secret", secret);
    formData.append("response", trimmedToken);
    if (clientIp) {
      formData.append("remoteip", clientIp);
    }

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!res.ok) {
      return {
        success: false,
        error: "Security verification service unreachable. Please try again.",
      };
    }

    const data = (await res.json()) as {
      success: boolean;
      action?: string;
      cdata?: string;
      hostname?: string;
      "error-codes"?: string[];
    };

    if (!data.success) {
      const errorCodes = data["error-codes"] || [];
      const errorMsg =
        errorCodes.includes("timeout-or-duplicate") || errorCodes.includes("invalid-input-response")
          ? "Security verification token is already redeemed or expired. Please solve a fresh challenge."
          : "Bot verification failed. Please try again.";

      return {
        success: false,
        error: errorMsg,
      };
    }

    // Verify expectedAction
    if (expectedAction && data.action && data.action !== expectedAction) {
      return {
        success: false,
        error: "Verification action mismatch.",
      };
    }

    // Strict hostname verification
    if (data.hostname) {
      const siteverifyHost = data.hostname.toLowerCase();
      const isProd = Boolean(import.meta.env?.PROD) && process.env.PLAYWRIGHT_E2E !== "1";
      const allowed = isProd ? PROD_ALLOWED_HOSTNAMES : DEV_ALLOWED_HOSTNAMES;
      const isAllowed = allowed.has(siteverifyHost) || isPreviewHostname(siteverifyHost);

      if (!isAllowed) {
        return {
          success: false,
          error: "Verification hostname mismatch.",
        };
      }
    }

    // Mark token as redeemed
    redeemedTurnstileTokens.set(trimmedToken, Date.now());

    // Prune stale cache entries
    if (redeemedTurnstileTokens.size > 1000) {
      const now = Date.now();
      for (const [k, v] of redeemedTurnstileTokens.entries()) {
        if (now - v >= REPLAY_CACHE_TTL_MS) {
          redeemedTurnstileTokens.delete(k);
        }
      }
    }

    return { success: true };
  } catch (err) {
    console.error("[Turnstile Verification Exception]:", err);
    return {
      success: false,
      error: "An unexpected error occurred during security verification.",
    };
  }
}

/**
 * Extracts a cookie value by name from incoming Request headers.
 */
export function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function nameToHex(name: string): string {
  return Array.from(new TextEncoder().encode(name))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToName(hex: string): string | null {
  if (!/^[0-9a-f]*$/.test(hex) || hex.length % 2 !== 0 || hex.length > 160) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

/**
 * Issues an HMAC-SHA256 signed chat pass bound to the client IP, the chosen
 * display name, and the expiry. Format: `<exp>.<nameHex>.<signature>`.
 */
export async function issueChatPass(
  clientIp: string,
  secret: string | null | undefined,
  ttlMs = CHAT_PASS_TTL_MS,
  name = "",
  requestHostname?: string | null
): Promise<string> {
  const exp = Date.now() + ttlMs;
  const nameHex = nameToHex(name);

  if (!secret) {
    // Never mint passes without a secret in production or for remote hosts
    if (!isDevOrTest(requestHostname)) throw new Error("TURNSTILE_SECRET is not configured");
    return `${exp}.${nameHex}.preview-test-pass`;
  }

  const key = await hmacKey(secret, "sign");
  const data = `${clientIp || "unknown"}:${name}:${exp}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${exp}.${nameHex}.${sigBase64}`;
}

export interface ChatPassInfo {
  valid: boolean;
  name?: string;
}

/**
 * Verifies a chat pass (unexpired, authentic, bound to this IP) and returns the
 * display name it was issued for. Fails closed when no secret is configured
 * (outside dev/test on local host). Legacy 2-part passes are rejected.
 */
export async function verifyChatPassDetailed(
  pass: unknown,
  clientIp: string,
  secret: string | null | undefined,
  requestHostname?: string | null
): Promise<ChatPassInfo> {
  if (typeof pass !== "string") return { valid: false };
  const parts = pass.split(".");
  if (parts.length !== 3) return { valid: false };

  const [expStr, nameHex, sigBase64] = parts;
  const exp = Number(expStr);
  if (!exp || Number.isNaN(exp) || Date.now() > exp) return { valid: false };

  const name = hexToName(nameHex);
  if (name === null) return { valid: false };

  if (isDevOrTest(requestHostname)) {
    if (!secret || sigBase64 === "dev-test-pass" || sigBase64 === "preview-test-pass") {
      return { valid: true, name };
    }
  }

  if (!secret) return { valid: false };

  try {
    const key = await hmacKey(secret, "verify");
    const base64Standard = sigBase64.replace(/-/g, "+").replace(/_/g, "/");
    const rawSig = Uint8Array.from(atob(base64Standard), (c) => c.charCodeAt(0));
    const data = `${clientIp || "unknown"}:${name}:${exp}`;
    const ok = await crypto.subtle.verify("HMAC", key, rawSig, new TextEncoder().encode(data));
    return ok ? { valid: true, name } : { valid: false };
  } catch {
    return { valid: false };
  }
}

/** Boolean wrapper kept for callers that don't need the name (e.g. chess). */
export async function verifyChatPass(
  pass: unknown,
  clientIp: string,
  secret: string | null | undefined,
  requestHostname?: string | null
): Promise<boolean> {
  return (await verifyChatPassDetailed(pass, clientIp, secret, requestHostname)).valid;
}

export interface ChatSessionResult {
  valid: boolean;
  payload?: {
    sender: string;
    clientIp: string;
    expiresAt: number;
    sessionId: string;
  };
  error?: string;
}

/** Wrapper providing object payload with sender and clientIp metadata. */
export async function issueChatSession(
  name: string,
  clientIp: string,
  secret: string | null | undefined,
  ttlMs = CHAT_PASS_TTL_MS,
  requestHostname?: string | null
): Promise<string> {
  return issueChatPass(clientIp, secret, ttlMs, name, requestHostname);
}

/** Wrapper verifying chat pass and returning session payload. */
export async function verifyChatSession(
  pass: unknown,
  expectedName: string,
  clientIp: string,
  secret: string | null | undefined,
  requestHostname?: string | null
): Promise<ChatSessionResult> {
  if (typeof pass !== "string") {
    return { valid: false, error: "Invalid session credential format" };
  }
  const parts = pass.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Invalid session credential format" };
  }
  const exp = Number(parts[0]);
  if (!exp || Number.isNaN(exp) || Date.now() > exp) {
    return { valid: false, error: "Session credential has expired. Please re-verify." };
  }
  const info = await verifyChatPassDetailed(pass, clientIp, secret, requestHostname);
  if (!info.valid) {
    return { valid: false, error: "Invalid session signature or forged credential." };
  }
  if (info.name !== expectedName) {
    return { valid: false, error: "Session identity mismatch." };
  }
  return {
    valid: true,
    payload: {
      sender: info.name || expectedName,
      clientIp,
      expiresAt: exp,
      sessionId: pass,
    },
  };
}
