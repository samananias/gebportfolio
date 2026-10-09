import type { APIRoute } from "astro";
import {
  getClientIp,
  isOriginAllowed,
  isReservedSender,
  checkRateLimit,
  isChatLocked,
} from "../../../lib/rateLimit";
import {
  verifyTurnstileToken,
  getTurnstileSecret,
  issueChatPass,
  CHAT_PASS_TTL_MS,
} from "../../../lib/turnstile";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // 1. Origin verification
    if (!isOriginAllowed(request)) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden origin." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (await isChatLocked()) {
      return new Response(JSON.stringify({ ok: false, error: "Chat is temporarily paused." }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Retry-After": "300" },
      });
    }

    const token = body["cf-turnstile-response"] || body.token;
    const senderName = typeof body.sender === "string" ? body.sender.trim() : "";
    if (!senderName || isReservedSender(senderName)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Display name is reserved or invalid (3-20 characters).",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const clientIp = getClientIp(request);
    const turnstileSecret = await getTurnstileSecret(locals);

    // 2. Rate limiting verification attempts (max 10 attempts / 60s per IP)
    const rateCheck = checkRateLimit({
      key: `turnstile:verify:${clientIp}`,
      maxRequests: 10,
      windowMs: 60_000,
      cooldownMs: 1_000,
    });

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Too many verification attempts. Please wait a moment.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 1000) / 1000)),
          },
        }
      );
    }

    const requestHost = request.headers.get("host") || new URL(request.url).host;

    // 3. Verify Turnstile token
    const result = await verifyTurnstileToken({
      token,
      secret: turnstileSecret,
      clientIp,
      expectedAction: "chat",
      requestHostname: requestHost,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: result.error || "Verification failed. Please try again.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 4. Issue 15-minute human pass
    const pass = await issueChatPass(clientIp, turnstileSecret, CHAT_PASS_TTL_MS, senderName);
    const expiresAt = Date.now() + CHAT_PASS_TTL_MS;

    const isProd = import.meta.env.PROD && process.env.PLAYWRIGHT_E2E !== "1";
    const cookieHeader = `chat_pass=${encodeURIComponent(pass)}; Path=/; Max-Age=900; SameSite=Lax${
      isProd ? "; Secure" : ""
    }`;

    return new Response(
      JSON.stringify({
        ok: true,
        chatPass: pass,
        expiresAt,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookieHeader,
        },
      }
    );
  } catch (err) {
    console.error("[Chat Verify Route Error]:", err);
    return new Response(JSON.stringify({ ok: false, error: "Internal server error." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
