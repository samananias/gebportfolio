import type { APIRoute } from "astro";
import { addChatMessage, type ChatMessage } from "./messages";
import {
  getClientIp,
  isOriginAllowed,
  isReservedSender,
  checkRateLimit,
} from "../../../lib/rateLimit";
import {
  verifyTurnstileToken,
  getTurnstileSecret,
  verifyChatPass,
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
      (typeof body.chatPass === "string" && body.chatPass) ||
      request.headers.get("x-chat-pass") ||
      getCookie(request, "chat_pass");

    let isPassValid = false;
    if (providedPass) {
      isPassValid = await verifyChatPass(providedPass, clientIp, turnstileSecret);
    }

    let activePass = isPassValid ? providedPass : null;

    if (!isPassValid) {
      // Pass is absent or expired: require Turnstile challenge token
      const turnstileResult = await verifyTurnstileToken({
        token: body["cf-turnstile-response"],
        secret: turnstileSecret,
        clientIp,
        expectedAction: "chat",
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
      activePass = await issueChatPass(clientIp, turnstileSecret);
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

    const cleanText = sanitizeText(text);
    const newMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sender: sanitizeText(sender).slice(0, 20),
      avatar: (typeof avatar === "string" && avatar) || "knight",
      text: cleanText,
      timestamp: Date.now(),
    };

    const updatedHistory = await addChatMessage(locals, newMessage);

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
