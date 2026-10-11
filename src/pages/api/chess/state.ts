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

export const prerender = false;

interface CachedStateEntry {
  game: StoredGameState;
  cachedAt: number;
}

let cachedGameState: CachedStateEntry | null = null;
const STATE_CACHE_TTL_MS = 2000;

/** Clears the in-memory state cache when a move or reset occurs */
export function invalidateStateCache(): void {
  cachedGameState = null;
}

export const GET: APIRoute = async ({ request, cookies, locals }) => {
  try {
    const now = Date.now();
    let game: StoredGameState | null = null;

    if (cachedGameState && now - cachedGameState.cachedAt < STATE_CACHE_TTL_MS) {
      game = cachedGameState.game;
    } else {
      // Determine storage provider (D1 if available via Cloudflare runtime, otherwise Memory Fallback)
      const envDB = await getD1Database();
      const storage = envDB ? createD1StorageProvider(envDB) : memoryStorageProvider;

      game = await storage.getGame();
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
      cachedGameState = { game, cachedAt: now };
    }

    // Verify existing session cookie with dynamic runtime secrets
    const existingCookie = cookies.get(COOKIE_NAME)?.value;
    let session = await verifySession(existingCookie, locals);

    // Evaluate HTTP 304 Not Modified if client holds current game version
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
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Cloudflare-CDN-Cache-Control": "no-store",
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
