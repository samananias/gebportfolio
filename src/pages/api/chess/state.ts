import type { APIRoute } from "astro";
import { createArbiter } from "turn-arbiter";
import { chessRules } from "turn-arbiter/chess";
import {
  memoryStorageProvider,
  createD1StorageProvider,
  getD1Database,
  INITIAL_FEN,
  type StoredGameState,
} from "../../../lib/chess/storage";
import {
  verifySession,
  signSession,
  generateSessionId,
  COOKIE_NAME,
} from "../../../lib/chess/session";
import { getChessOutcome } from "../../../lib/chess/outcome";
import { getClientIp, isOriginAllowed, checkRateLimit } from "../../../lib/rateLimit";

export const prerender = false;

/** Retained for API compatibility; isolate caching is removed to guarantee cross-isolate multiplayer consistency */
export function invalidateStateCache(): void {}

export const GET: APIRoute = async ({ request, cookies, locals }) => {
  try {
    // 1. Origin verification
    if (!isOriginAllowed(request)) {
      return new Response(JSON.stringify({ error: "Forbidden origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Edge rate limiting: max 60 requests per 60s per IP (supports multiple players on same Wi-Fi)
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit({
      key: `chess:state:${clientIp}`,
      maxRequests: 60,
      windowMs: 60_000,
    });

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please slow down." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 2000) / 1000)),
          },
        }
      );
    }

    // 3. Determine storage provider and fetch single authoritative game row from D1
    const envDB = await getD1Database(locals);
    const storage = envDB ? createD1StorageProvider(envDB) : memoryStorageProvider;

    let game: StoredGameState | null = await storage.getGame();
    if (!game) {
      game = {
        version: 0,
        fen: INITIAL_FEN,
        history: [],
        positionKeys: [INITIAL_FEN.split(" ")[0]],
        contributors: 0,
        seenSessions: [],
        allTimeContributors: 0,
        lastMoveAt: new Date().toISOString(),
      };
      await storage.saveGame(0, game);
    }

    // 4. Verify existing session cookie with dynamic runtime secrets
    const existingCookie = cookies.get(COOKIE_NAME)?.value;
    let session = await verifySession(existingCookie, locals);

    // 5. Evaluate HTTP 304 Not Modified if client holds current game version
    const etag = `W/"chess-v${game.version}"`;
    const clientEtag = request.headers.get("if-none-match");

    if (session && clientEtag && clientEtag === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "no-cache",
        },
      });
    }

    // Compute live outcome if checkmate or draw has occurred
    const outcome = getChessOutcome(game.fen, game.history);

    // Initialize arbiter engine
    const arbiter = createArbiter({
      rules: chessRules,
      now: Date.now(),
      state: {
        schemaVersion: 1,
        version: game.version,
        position: game.fen,
        sideToMove: (game.fen.split(" ")[1] === "b" ? "black" : "white") as "white" | "black",
        history: game.history,
        positionKeys: game.positionKeys,
        seenSessions: game.seenSessions || [],
        contributors: game.contributors,
        startedAt: game.lastMoveAt,
        lastMoveAt: game.lastMoveAt,
        outcome,
      },
    });

    let newCookieValue: string | null = null;

    // If no valid session, assign side and sign cookie
    if (!session) {
      const sessionId = generateSessionId();
      const assignment = arbiter.assign({ sessionId });
      session = { sessionId, side: assignment.side };
      newCookieValue = await signSession(sessionId, assignment.side, locals);

      // Set signed HTTP-only cookie
      const isSecure = import.meta.env.PROD && process.env.PLAYWRIGHT_E2E !== "1";
      cookies.set(COOKIE_NAME, newCookieValue, {
        path: "/",
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }

    // Generate sanitized public view for browser
    const view = arbiter.publicView({ historyLimit: 10 });
    const payload = {
      ...view,
      yourSide: session.side,
      canMoveNow: !outcome && view.sideToMove === session.side,
      recentMoves: view.history,
      contributorCount: view.contributors,
      allTimeContributors: game.allTimeContributors || 0,
      fen: String(view.position),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ETag: etag,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[API /api/chess/state Error]:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch chess state" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
