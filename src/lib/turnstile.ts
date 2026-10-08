import { getWorkersEnv } from "./bindings";

export * from "./turnstileConstants";

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
 * Checks if a hostname belongs to a Cloudflare Pages or Workers preview deployment.
 */
export function isPreviewHostname(hostname?: string): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase().split(":")[0];
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.endsWith(".pages.dev") && host !== "gebportfolio.pages.dev") return true;
  if (host.endsWith(".workers.dev") && host !== "gebportfolio.workers.dev") return true;
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

/**
 * Validates a Turnstile cf-turnstile-response token server-side via siteverify.
 */
export async function verifyTurnstileToken(
  options: VerifyTurnstileOptions
): Promise<VerifyTurnstileResult> {
  const { token, secret, clientIp, expectedAction, requestHostname } = options;

  // In test/local environments, permit requests if no secret is configured or during Playwright runs
  if (!import.meta.env.PROD || process.env.PLAYWRIGHT_E2E === "1") {
    if (!secret || token === "dummy-test-token" || !token) {
      return { success: true };
    }
  }

  // Preview environment tolerance: if secret is not yet configured in Cloudflare Pages Preview variables
  if (!secret) {
    if (isPreviewHostname(requestHostname)) {
      console.warn(
        `[Turnstile Preview Notice]: TURNSTILE_SECRET is not configured for preview host '${requestHostname}'. Permitting verification for preview evaluation.`
      );
      return { success: true };
    }

    console.error(
      "[Turnstile Error]: TURNSTILE_SECRET is not configured. Add it in Cloudflare Dashboard > Workers & Pages > gebportfolio > Settings > Variables and Secrets."
    );
    return {
      success: false,
      error:
        "Security verification service is not configured. Please ensure TURNSTILE_SECRET is set in Cloudflare Variables and Secrets.",
    };
  }

  // Token shape validation (1 to 2048 non-whitespace characters)
  if (typeof token !== "string" || token.trim().length === 0 || token.length > 2048) {
    return {
      success: false,
      error: "Security verification token is missing or malformed.",
    };
  }

  try {
    const formData = new URLSearchParams({
      secret,
      response: token.trim(),
    });

    if (clientIp) {
      formData.append("remoteip", clientIp);
    }

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[Turnstile siteverify HTTP Error]: ${response.status}`);
      return { success: false, error: "Verification server failed." };
    }

    const result = (await response.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
      "error-codes"?: string[];
    };

    if (!result.success) {
      console.warn("[Turnstile Validation Failed]:", result["error-codes"]);
      return {
        success: false,
        error: "Bot verification failed. Please try again.",
      };
    }

    const isActionMatch =
      !result.action ||
      result.action === expectedAction ||
      ((expectedAction === "chat" || expectedAction === "live") &&
        (result.action === "chat" || result.action === "live"));

    if (!isActionMatch) {
      console.warn(`[Turnstile Action Mismatch]: expected ${expectedAction}, got ${result.action}`);
      return {
        success: false,
        error: "Verification action mismatch.",
      };
    }

    const isProd = import.meta.env.PROD && process.env.PLAYWRIGHT_E2E !== "1";
    const allowed = isProd ? PROD_ALLOWED_HOSTNAMES : DEV_ALLOWED_HOSTNAMES;

    const isHostnameAllowed =
      result.hostname &&
      (allowed.has(result.hostname) ||
        result.hostname.endsWith(".gebportfolio.pages.dev") ||
        result.hostname.endsWith(".pages.dev") ||
        result.hostname.endsWith(".workers.dev"));

    if (!isHostnameAllowed) {
      console.warn(`[Turnstile Hostname Mismatch]: untrusted host ${result.hostname}`);
      return {
        success: false,
        error: "Verification hostname mismatch.",
      };
    }

    return { success: true };
  } catch (err) {
    console.error("[Turnstile Network Error]:", err);
    return {
      success: false,
      error: "Verification challenge could not be reached.",
    };
  }
}

/**
 * 15-Minute Human Chat Pass lifetime in milliseconds.
 */
export const CHAT_PASS_TTL_MS = 15 * 60 * 1000;

/**
 * Extracts a cookie value by name from incoming Request headers.
 */
export function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Issues an HMAC-SHA256 signed chat pass bound to client IP and expiration time.
 */
export async function issueChatPass(
  clientIp: string,
  secret: string | null | undefined,
  ttlMs = CHAT_PASS_TTL_MS
): Promise<string> {
  const exp = Date.now() + ttlMs;
  const data = `${clientIp || "unknown"}:${exp}`;

  // If in dev/test/preview without real secret, produce a recognizable test token
  if (!secret) {
    return `${exp}.preview-test-pass`;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${exp}.${sigBase64}`;
}

/**
 * Verifies that a chat pass is unexpired, authentic, and bound to the client's IP.
 */
export async function verifyChatPass(
  pass: unknown,
  clientIp: string,
  secret: string | null | undefined
): Promise<boolean> {
  if (typeof pass !== "string" || !pass.includes(".")) {
    return false;
  }

  const [expStr, sigBase64] = pass.split(".");
  const exp = Number(expStr);

  if (!exp || Number.isNaN(exp) || Date.now() > exp) {
    return false; // Expired
  }

  // In test/local/preview environments, permit dev or preview test pass
  if (!import.meta.env.PROD || process.env.PLAYWRIGHT_E2E === "1" || !secret) {
    if (!secret || sigBase64 === "dev-test-pass" || sigBase64 === "preview-test-pass") {
      return true;
    }
  }

  if (!secret) {
    return false;
  }

  const data = `${clientIp || "unknown"}:${exp}`;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const base64Standard = sigBase64.replace(/-/g, "+").replace(/_/g, "/");
    const rawSig = Uint8Array.from(atob(base64Standard), (c) => c.charCodeAt(0));

    return await crypto.subtle.verify("HMAC", key, rawSig, new TextEncoder().encode(data));
  } catch {
    return false;
  }
}
