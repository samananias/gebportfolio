import { getWorkersEnv } from "./bindings";

export * from "./turnstileConstants";

export interface VerifyTurnstileOptions {
  token: unknown;
  secret: string | null | undefined;
  clientIp?: string;
  expectedAction: string;
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
 * Resolves the TURNSTILE_SECRET from Workers environment, Astro locals, or process.env.
 */
export async function getTurnstileSecret(locals?: App.Locals): Promise<string | null> {
  const cfEnv = await getWorkersEnv();
  const secret = (locals?.TURNSTILE_SECRET ||
    (globalThis as unknown as Record<string, unknown>)?.TURNSTILE_SECRET ||
    cfEnv?.TURNSTILE_SECRET ||
    (typeof process !== "undefined" ? process.env?.TURNSTILE_SECRET : undefined)) as
    string | undefined;
  return secret?.trim() || null;
}

/**
 * Validates a Turnstile cf-turnstile-response token server-side via siteverify.
 */
export async function verifyTurnstileToken(
  options: VerifyTurnstileOptions
): Promise<VerifyTurnstileResult> {
  const { token, secret, clientIp, expectedAction } = options;

  // In test/local environments, permit requests if no secret is configured or during Playwright runs
  if (!import.meta.env.PROD || process.env.PLAYWRIGHT_E2E === "1") {
    if (!secret || token === "dummy-test-token" || !token) {
      return { success: true };
    }
  }

  // Token shape validation (1 to 2048 non-whitespace characters)
  if (typeof token !== "string" || token.trim().length === 0 || token.length > 2048) {
    return {
      success: false,
      error: "Security verification token is missing or malformed.",
    };
  }

  // If in production and secret is not configured, log error and block
  if (!secret) {
    console.error("[Turnstile Error]: TURNSTILE_SECRET is not configured in Workers environment.");
    return {
      success: false,
      error: "Security verification service is temporarily unavailable.",
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

    if (result.action && result.action !== expectedAction) {
      console.warn(`[Turnstile Action Mismatch]: expected ${expectedAction}, got ${result.action}`);
      return {
        success: false,
        error: "Verification action mismatch.",
      };
    }

    const isProd = import.meta.env.PROD && process.env.PLAYWRIGHT_E2E !== "1";
    const allowed = isProd ? PROD_ALLOWED_HOSTNAMES : DEV_ALLOWED_HOSTNAMES;

    if (result.hostname && !allowed.has(result.hostname)) {
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
