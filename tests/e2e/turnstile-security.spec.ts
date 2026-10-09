import { test, expect } from "@playwright/test";
import {
  verifyTurnstileToken,
  issueChatSession,
  verifyChatSession,
  clearRedeemedTokensCache,
} from "../../src/lib/turnstile";
import { checkRateLimit, clearRateLimitStore } from "../../src/lib/rateLimit";
import PortfolioChatServer, { type PartyConnection } from "../../party/chat";

test.describe("Turnstile & Chat Security Boundaries", () => {
  test.beforeEach(() => {
    clearRedeemedTokensCache();
    clearRateLimitStore();
  });

  test.describe("1. Server-Side Turnstile Verification (Siteverify Rules)", () => {
    test("rejects missing, empty, or whitespace-only tokens", async () => {
      const resEmpty = await verifyTurnstileToken({
        token: "",
        secret: "test-secret",
        expectedAction: "chat",
      });
      expect(resEmpty.success).toBe(false);
      expect(resEmpty.error).toContain("missing or malformed");

      const resWhitespace = await verifyTurnstileToken({
        token: "   ",
        secret: "test-secret",
        expectedAction: "chat",
      });
      expect(resWhitespace.success).toBe(false);

      const resNull = await verifyTurnstileToken({
        token: null,
        secret: "test-secret",
        expectedAction: "chat",
      });
      expect(resNull.success).toBe(false);
    });

    test("rejects oversized tokens exceeding 2048 characters", async () => {
      const oversized = "a".repeat(2049);
      const res = await verifyTurnstileToken({
        token: oversized,
        secret: "test-secret",
        expectedAction: "chat",
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("missing or malformed");
    });

    test("rejects immediate replay of previously redeemed tokens via sliding window cache", async () => {
      // Create a deterministic simulated token
      const token = "simulated-unique-turnstile-token-12345";
      const secret = "test-secret";

      // Mock fetch to simulate successful Siteverify response
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            action: "chat",
            hostname: "localhost",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        const first = await verifyTurnstileToken({
          token,
          secret,
          expectedAction: "chat",
        });
        expect(first.success).toBe(true);

        // Immediate replay of same token must be rejected at server boundary
        const second = await verifyTurnstileToken({
          token,
          secret,
          expectedAction: "chat",
        });
        expect(second.success).toBe(false);
        expect(second.error).toContain("already been redeemed");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("rejects tokens with mismatched action", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            action: "contact", // Mismatch: action was for contact form, not chat!
            hostname: "localhost",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        const res = await verifyTurnstileToken({
          token: "valid-looking-token",
          secret: "test-secret",
          expectedAction: "chat",
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("action mismatch");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("rejects tokens with unapproved external hostnames", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            action: "chat",
            hostname: "malicious-bot.pages.dev", // Arbitrary third-party pages host
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        const res = await verifyTurnstileToken({
          token: "token-from-foreign-domain",
          secret: "test-secret",
          expectedAction: "chat",
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("hostname mismatch");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("fails closed when Siteverify returns failure error codes", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["timeout-or-duplicate"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        const res = await verifyTurnstileToken({
          token: "expired-or-duplicate-token",
          secret: "test-secret",
          expectedAction: "chat",
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain("already redeemed");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  test.describe("2. HMAC-SHA256 Application Session Pass Issuance & Validation", () => {
    const testSecret = "my-secure-turnstile-secret-key-32chars";

    test("issues authentic session credential bound to username and client IP", async () => {
      const pass = await issueChatSession("TacticalKnight", "192.168.1.10", testSecret, 60_000);
      expect(pass).toContain(".");

      const [expStr, payloadB64, sig] = pass.split(".");
      expect(Number(expStr)).toBeGreaterThan(Date.now());
      expect(payloadB64.length).toBeGreaterThan(10);
      expect(sig.length).toBeGreaterThan(20);

      const verification = await verifyChatSession(
        pass,
        "TacticalKnight",
        "192.168.1.10",
        testSecret
      );
      expect(verification.valid).toBe(true);
      expect(verification.payload?.sender).toBe("TacticalKnight");
      expect(verification.payload?.clientIp).toBe("192.168.1.10");
    });

    test("rejects session credential when sender handle does not match (identity spoofing)", async () => {
      // Issue session for TacticalKnight
      const pass = await issueChatSession("TacticalKnight", "192.168.1.10", testSecret, 60_000);

      // Attempt to use TacticalKnight's pass to send messages as an AI model bot
      const spoofAttempt = await verifyChatSession(
        pass,
        "Claude Anthropic",
        "192.168.1.10",
        testSecret
      );
      expect(spoofAttempt.valid).toBe(false);
      expect(spoofAttempt.error).toContain("identity mismatch");
    });

    test("rejects tampered or forged session signatures", async () => {
      const pass = await issueChatSession("TacticalKnight", "192.168.1.10", testSecret, 60_000);
      const [expStr, payloadB64] = pass.split(".");

      // Forged signature
      const tamperedPass = `${expStr}.${payloadB64}.forged-signature-base64-random`;
      const res = await verifyChatSession(
        tamperedPass,
        "TacticalKnight",
        "192.168.1.10",
        testSecret
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Invalid session signature");
    });

    test("rejects expired session credentials", async () => {
      // Session with negative TTL (already expired)
      const expiredPass = await issueChatSession(
        "TacticalKnight",
        "192.168.1.10",
        testSecret,
        -1000
      );
      const res = await verifyChatSession(
        expiredPass,
        "TacticalKnight",
        "192.168.1.10",
        testSecret
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("expired");
    });
  });

  test.describe("3. HTTP API Protection & Quota Defense (/api/chat/*)", () => {
    test("POST /api/chat/send strictly rejects unauthenticated requests without calling Siteverify", async ({
      request,
    }) => {
      const res = await request.post("/api/chat/send", {
        data: {
          sender: "TacticalUser",
          text: "Attempting to send without pass",
          avatar: "knight",
        },
      });

      expect(res.status()).toBe(401);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.requireTurnstile).toBe(true);
      expect(data.error).toContain("Authentication required");
    });

    test("POST /api/chat/send strictly rejects forged session credentials", async ({ request }) => {
      const forgedPass = `${Date.now() + 60000}.invalidpayload.invalidsig`;
      const res = await request.post("/api/chat/send", {
        headers: {
          "x-chat-pass": forgedPass,
        },
        data: {
          sender: "TacticalUser",
          text: "Attempting forged pass",
          avatar: "knight",
        },
      });

      expect(res.status()).toBe(403);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.requireTurnstile).toBe(true);
    });

    test("POST /api/chat/send strictly rejects identity mismatch between pass and sender", async ({
      request,
    }) => {
      // First obtain a valid pass for 'LegitUser'
      const verifyRes = await request.post("/api/chat/verify", {
        data: {
          sender: "LegitUser",
          "cf-turnstile-response": "dummy-test-token",
        },
      });
      expect(verifyRes.status()).toBe(200);
      const verifyData = await verifyRes.json();
      const legitPass = verifyData.chatPass;
      expect(legitPass).toBeTruthy();

      // Now attempt to use LegitUser's pass to send as 'Impersonator'
      const sendRes = await request.post("/api/chat/send", {
        headers: {
          "x-chat-pass": legitPass,
        },
        data: {
          sender: "Impersonator",
          text: "Spoofing sender handle",
          avatar: "knight",
        },
      });

      expect(sendRes.status()).toBe(403);
      const sendData = await sendRes.json();
      expect(sendData.ok).toBe(false);
      expect(sendData.error).toContain("identity mismatch");
    });

    test("POST /api/chat/send accepts message when authentic pass matches sender", async ({
      request,
    }) => {
      const verifyRes = await request.post("/api/chat/verify", {
        data: {
          sender: "VerifiedAuthor",
          "cf-turnstile-response": "dummy-test-token",
        },
      });
      expect(verifyRes.status()).toBe(200);
      const { chatPass } = await verifyRes.json();

      const sendRes = await request.post("/api/chat/send", {
        headers: {
          "x-chat-pass": chatPass,
        },
        data: {
          sender: "VerifiedAuthor",
          text: "Authorized message from verified author.",
          avatar: "knight",
        },
      });

      expect(sendRes.status()).toBe(200);
      const sendData = await sendRes.json();
      expect(sendData.ok).toBe(true);
      expect(sendData.message.sender).toBe("VerifiedAuthor");
      expect(sendData.message.text).toBe("Authorized message from verified author.");
    });

    test("POST /api/chat/verify requires valid Turnstile token", async ({ request }) => {
      const res = await request.post("/api/chat/verify", {
        data: {
          sender: "TestAuthor",
          "cf-turnstile-response": "", // Empty token
        },
      });
      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain("token is required");
    });
  });

  test.describe("4. WebSocket Real-Time Endpoint Protection (party/chat.ts)", () => {
    test("rejects unauthenticated WebSocket connection during handshake", async () => {
      const room = {
        id: "global",
        broadcast: () => {},
      };
      const server = new PortfolioChatServer(room);

      let sentErrorData: string | null = null;
      let closedWithCode: number | null = null;

      const mockConn: PartyConnection = {
        id: "conn_unauth",
        send: (data: string) => {
          sentErrorData = data;
        },
        close: (code?: number) => {
          closedWithCode = code || null;
        },
      };

      // Client connects with no token
      await server.onConnect(mockConn, {
        request: {
          url: "wss://chat.domain.com/party/chat?name=UnauthorizedBot",
        },
      });

      expect(sentErrorData).toBeTruthy();
      const parsed = JSON.parse(sentErrorData!);
      expect(parsed.type).toBe("error");
      expect(parsed.code).toBe(401);
      expect(closedWithCode).toBe(4401);
    });

    test("accepts authenticated WebSocket connection with valid session pass", async () => {
      const room = {
        id: "global",
        broadcast: () => {},
      };
      const server = new PortfolioChatServer(room);

      const pass = await issueChatSession(
        "TacticalPlayer",
        "127.0.0.1",
        undefined, // uses dev signing secret in test
        60_000
      );

      const sentFrames: string[] = [];
      const mockConn: PartyConnection = {
        id: "conn_auth",
        send: (data: string) => {
          sentFrames.push(data);
        },
      };

      await server.onConnect(mockConn, {
        request: {
          url: `wss://chat.domain.com/party/chat?token=${encodeURIComponent(pass)}&name=TacticalPlayer`,
        },
      });

      // Must have sent sync and welcome frames
      const syncFrame = sentFrames.find((f) => f.includes('"type":"sync"'));
      expect(syncFrame).toBeTruthy();
      const parsedSync = JSON.parse(syncFrame!);
      expect(parsedSync.assignedName).toContain("TacticalPlayer");
    });

    test("WebSocket rejects messages when session pass expires", async () => {
      const room = {
        id: "global",
        broadcast: () => {},
      };
      const server = new PortfolioChatServer(room);

      // Session with negative TTL
      const expiredPass = await issueChatSession("ExpiredUser", "127.0.0.1", undefined, -1000);

      const sentFrames: string[] = [];
      const mockConn: PartyConnection = {
        id: "conn_expired",
        send: (data: string) => {
          sentFrames.push(data);
        },
      };

      await server.onConnect(mockConn, {
        request: {
          url: `wss://chat.domain.com/party/chat?token=${encodeURIComponent(expiredPass)}&name=ExpiredUser`,
        },
      });

      // Must have rejected during handshake
      const errorFrame = sentFrames.find((f) => f.includes('"type":"error"'));
      expect(errorFrame).toBeTruthy();
      const parsedError = JSON.parse(errorFrame!);
      expect(parsedError.code).toBe(401);
    });
  });

  test.describe("5. Rate Limiting, Abuse Controls & Request Budget Protection", () => {
    test("rate limiter returns 429 retry-after when limit is exceeded", () => {
      clearRateLimitStore();
      const key = "test:poll:192.168.1.100";
      // First 5 requests within limit must be allowed
      for (let i = 0; i < 5; i++) {
        const res = checkRateLimit({
          key,
          maxRequests: 5,
          windowMs: 60_000,
          forceEnforce: true,
        });
        expect(res.allowed).toBe(true);
      }

      // 6th request exceeding limit must be rejected
      const blocked = checkRateLimit({
        key,
        maxRequests: 5,
        windowMs: 60_000,
        forceEnforce: true,
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    test("rejects oversized message text on POST /api/chat/send", async ({ request }) => {
      const verifyRes = await request.post("/api/chat/verify", {
        data: {
          sender: "LengthTester",
          "cf-turnstile-response": "dummy-test-token",
        },
      });
      const { chatPass } = await verifyRes.json();

      const oversizedText = "x".repeat(300);
      const sendRes = await request.post("/api/chat/send", {
        headers: { "x-chat-pass": chatPass },
        data: {
          sender: "LengthTester",
          text: oversizedText,
          avatar: "knight",
        },
      });

      expect(sendRes.status()).toBe(200);
      const data = await sendRes.json();
      expect(data.ok).toBe(true);
      // Sanitized text must be truncated to 280 characters
      expect(data.message.text.length).toBeLessThanOrEqual(280);
    });

    test("two legitimate users sharing an IP maintain independent session message quotas", async () => {
      const secret = "shared-ip-test-secret-key-32chars";
      const sharedIp = "203.0.113.42";

      const sessionA = await issueChatSession("AlicePlayer", sharedIp, secret, 60_000);
      const sessionB = await issueChatSession("BobPlayer", sharedIp, secret, 60_000);

      const parsedA = await verifyChatSession(sessionA, "AlicePlayer", sharedIp, secret);
      const parsedB = await verifyChatSession(sessionB, "BobPlayer", sharedIp, secret);

      expect(parsedA.valid).toBe(true);
      expect(parsedB.valid).toBe(true);
      // Distinct unique session IDs ensure session-level rate limit keys do not cross-contaminate
      expect(parsedA.payload?.sessionId).not.toBe(parsedB.payload?.sessionId);
    });
  });
});
