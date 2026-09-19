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

export const POST: APIRoute = async ({ cookies }) => {
  try {
    const existingCookie = cookies.get(COOKIE_NAME)?.value;
    const session = await verifySession(existingCookie);

    if (!session) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const envDB = await getD1Database();
    const storage = envDB ? createD1StorageProvider(envDB) : memoryStorageProvider;

    const game = await storage.getGame();
    if (!game) {
      return new Response(JSON.stringify({ ok: false, reason: "no_active_game" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Archive completed game if it had moves recorded
    if (game.history.length > 0) {
      const pgn = game.history.join(" ");
      const arbiterCheck = createArbiter({
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

      const publicView = arbiterCheck.publicView();
      const outcomeKind = publicView.outcome?.kind || "manual_reset";
      await storage.archiveGame(pgn, outcomeKind, game.contributors);
    }

    // Create fresh game state, resetting match contributors to 0
    const resetState = {
      version: 0,
      fen: INITIAL_FEN,
      history: [],
      positionKeys: [INITIAL_FEN.split(" ")[0]],
      contributors: 0,
      seenSessions: [],
      allTimeContributors: game.allTimeContributors || 0,
      lastMoveAt: new Date().toISOString(),
    };

    // Save reset state with atomic CAS
    await storage.saveGame(game.version, resetState);

    // Re-assign fresh team for the new match
    const newSessionId = generateSessionId();
    const freshArbiter = createArbiter({
      rules: chessRules,
      now: Date.now(),
    });
    const assignment = freshArbiter.assign({ sessionId: newSessionId });
    const newCookieValue = await signSession(newSessionId, assignment.side);

    cookies.set(COOKIE_NAME, newCookieValue, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });

    const view = freshArbiter.publicView({ historyLimit: 10 });
    const payload = {
      ...view,
      yourSide: assignment.side,
      canMoveNow: view.sideToMove === assignment.side,
      recentMoves: view.history,
      contributorCount: view.contributors,
      allTimeContributors: resetState.allTimeContributors,
      fen: String(view.position),
    };

    return new Response(JSON.stringify({ ok: true, state: payload }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[API /api/chess/reset Error]:", error);
    return new Response(JSON.stringify({ ok: false, reason: "server_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
