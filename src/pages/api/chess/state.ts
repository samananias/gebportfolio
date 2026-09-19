import type { APIRoute } from "astro";
import { createArbiter } from "turn-arbiter";
import { chessRules } from "turn-arbiter/chess";
import {
  memoryStorageProvider,
  createD1StorageProvider,
  getD1Database,
  INITIAL_FEN,
} from "../../../lib/chess/storage";
import {
  verifySession,
  signSession,
  generateSessionId,
  COOKIE_NAME,
} from "../../../lib/chess/session";

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  try {
    // Determine storage provider (D1 if available via Cloudflare runtime, otherwise Memory Fallback)
    const envDB = await getD1Database();
    const storage = envDB ? createD1StorageProvider(envDB) : memoryStorageProvider;

    // Load live game from database or initialize default
    let game = await storage.getGame();
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

    // Verify existing session cookie
    const existingCookie = cookies.get(COOKIE_NAME)?.value;
    let session = await verifySession(existingCookie);

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
        outcome: null,
      },
    });

    let newCookieValue: string | null = null;

    // If no valid session, assign side and sign cookie
    if (!session) {
      const sessionId = generateSessionId();
      const assignment = arbiter.assign({ sessionId });
      session = { sessionId, side: assignment.side };
      newCookieValue = await signSession(sessionId, assignment.side);

      // Set signed HTTP-only cookie
      cookies.set(COOKIE_NAME, newCookieValue, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }

    // Generate sanitized public view for browser
    const view = arbiter.publicView({ historyLimit: 10 });
    const payload = {
      ...view,
      yourSide: session.side,
      canMoveNow: view.sideToMove === session.side,
      recentMoves: view.history,
      contributorCount: view.contributors,
      allTimeContributors: game.allTimeContributors || 0,
      fen: String(view.position),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
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
