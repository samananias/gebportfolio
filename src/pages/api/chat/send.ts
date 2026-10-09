import type { APIRoute } from "astro";
import { addChatMessageGuarded, type ChatMessage } from "./messages";
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
  verifyChatPassDetailed,
  issueChatPass,
  getCookie,
} from "../../../lib/turnstile";

export const prerender = false;

const MAX_MESSAGE_LENGTH = 280;

function sanitizeText(input: string): string {
  if (!input) return "";
  return input
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // 1. Origin / Referer validation
    if (!isOriginAllowed(request)) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden origin." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (await isChatLocked()) {
      return new Response(JSON.stringify({ ok: false, error: "Chat is temporarily paused." }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Retry-After": "300" },
      });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { sender, avatar, text, website, _hp } = body;

    // 2. Honeypot trap: silently accept bot submissions without writing to storage
    if (website || _hp) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Sender and text presence check
    if (
      !sender ||
      typeof sender !== "string" ||
      !text ||
      typeof text !== "string" ||
      text.trim().length === 0
    ) {
      return new Response(JSON.stringify({ ok: false, error: "Sender and text are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. Server-side sender filtering against impersonation / bot scripts
    if (isReservedSender(sender)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Sender name is reserved or invalid (must be 3-20 characters without bot tokens).",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const clientIp = getClientIp(request);
    const turnstileSecret = await getTurnstileSecret(locals);

    // 5. 15-Minute Human Chat Pass & Turnstile Bot Verification
    const providedPass =
      (typeof body.chatPass === "string" && body.chatPass.trim()) ||
      request.headers.get("x-chat-pass") ||
      getCookie(request, "chat_pass");

    const turnstileToken =
      typeof body["cf-turnstile-response"] === "string" ? body["cf-turnstile-response"].trim() : "";

    const requestedName = sender.trim();
    let activePass: string | null = null;

    if (providedPass) {
      const info = await verifyChatPassDetailed(providedPass, clientIp, turnstileSecret);
      if (info.valid) {
        if (info.name !== requestedName) {
          return new Response(
            JSON.stringify({
              ok: false,
              requireTurnstile: true,
              error: "Session identity mismatch.",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        activePass = providedPass;
      } else {
        // Provided pass is invalid, expired, or forged
        if (!turnstileToken) {
          return new Response(
            JSON.stringify({
              ok: false,
              requireTurnstile: true,
              error: "Invalid or forged session pass.",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }
    } else if (!turnstileToken) {
      // Neither a pass nor a Turnstile token was provided: reject unauthenticated requests
      return new Response(
        JSON.stringify({
          ok: false,
          requireTurnstile: true,
          error: "Authentication required. Please verify with Turnstile or provide a valid pass.",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!activePass) {
      const requestHost = request.headers.get("host") || new URL(request.url).host;

      // Pass is absent or expired: require Turnstile challenge token
      const turnstileResult = await verifyTurnstileToken({
        token: turnstileToken,
        secret: turnstileSecret,
        clientIp,
        expectedAction: "chat",
        requestHostname: requestHost,
      });

      if (!turnstileResult.success) {
        return new Response(
          JSON.stringify({
            ok: false,
            requireTurnstile: true,
            error:
              turnstileResult.error || "Security verification required. Please verify to chat.",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Turnstile verified successfully! Issue fresh 15-minute pass
      activePass = await issueChatPass(clientIp, turnstileSecret, undefined, requestedName);
    }

    // 6. Rate limiting: 5 messages per 60s, 3s minimum cooldown per IP
    const rateCheck = checkRateLimit({
      key: `chat:${clientIp}`,
      maxRequests: 5,
      windowMs: 60_000,
      cooldownMs: 3_000,
    });

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Too many messages sent. Please wait a moment before sending another message.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 3000) / 1000)),
          },
        }
      );
    }

    const nameCheck = checkRateLimit({
      key: `chat:name:${requestedName.toLowerCase()}`,
      maxRequests: 5,
      windowMs: 60_000,
      cooldownMs: 3_000,
    });
    if (!nameCheck.allowed) {
      return new Response(
        JSON.stringify({ ok: false, error: "Too many messages sent. Please slow down." }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "3" } }
      );
    }

    const cleanText = sanitizeText(text);
    const newMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sender: sanitizeText(sender).slice(0, 20),
      avatar: (typeof avatar === "string" && avatar) || "knight",
      text: cleanText,
      timestamp: Date.now(),
    };

    const { history: updatedHistory } = await addChatMessageGuarded(locals, newMessage);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
    };

    if (activePass) {
      headers["Set-Cookie"] =
        `chat_pass=${activePass}; Path=/; Max-Age=900; SameSite=Lax; Secure; HttpOnly`;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: newMessage,
        history: updatedHistory,
        chatPass: activePass,
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Failed to process chat message." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
