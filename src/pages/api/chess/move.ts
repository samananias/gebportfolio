import type { APIRoute } from "astro";
import { createArbiter } from "turn-arbiter";
import { chessRules } from "turn-arbiter/chess";
import {
  memoryStorageProvider,
  createD1StorageProvider,
  getD1Database,
  INITIAL_FEN,
} from "../../../lib/chess/storage";
import { verifySession, COOKIE_NAME } from "../../../lib/chess/session";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // Verify signed session cookie
    const existingCookie = cookies.get(COOKIE_NAME)?.value;
    const session = await verifySession(existingCookie);

    if (!session) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { move, version } = body;

    if (!move || typeof move !== "string" || typeof version !== "number") {
      return new Response(JSON.stringify({ ok: false, reason: "malformed_request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Determine storage provider
    const envDB = await getD1Database();
    const storage = envDB ? createD1StorageProvider(envDB) : memoryStorageProvider;

    // Load live game from DB
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
    }

    // Initialize arbiter
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

    // Attempt move via turn-arbiter
    const result = arbiter.submit({
      sessionId: session.sessionId,
      side: session.side,
      move,
      version,
    });

    if (!result.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: result.reason,
          publicView: {
            ...arbiter.publicView({ historyLimit: 10 }),
            yourSide: session.side,
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Prepare updated DB state from serialized arbiter result
    const serialized = arbiter.serialize();
    const isNewSession = !(game.seenSessions || []).includes(session.sessionId);
    const nextAllTimeContributors = (game.allTimeContributors || 0) + (isNewSession ? 1 : 0);

    const updatedDbState = {
      version: serialized.version,
      fen: serialized.position,
      history: serialized.history,
      positionKeys: serialized.positionKeys,
      contributors: serialized.contributors,
      seenSessions: serialized.seenSessions,
      allTimeContributors: nextAllTimeContributors,
      lastMoveAt: serialized.lastMoveAt,
    };

    // Execute atomic Compare-and-Swap (CAS) write
    const casResult = await storage.saveGame(game.version, updatedDbState);

    if (!casResult.ok) {
      // CAS failed because a teammate moved in the same second!
      const freshGame = await storage.getGame();
      const freshArbiter = createArbiter({
        rules: chessRules,
        now: Date.now(),
        state: freshGame
          ? {
              schemaVersion: 1,
              version: freshGame.version,
              position: freshGame.fen,
              sideToMove: (freshGame.fen.split(" ")[1] === "b" ? "black" : "white") as
                "white" | "black",
              history: freshGame.history,
              positionKeys: freshGame.positionKeys,
              seenSessions: freshGame.seenSessions || [],
              contributors: freshGame.contributors,
              startedAt: freshGame.lastMoveAt,
              lastMoveAt: freshGame.lastMoveAt,
              outcome: null,
            }
          : undefined,
      });

      return new Response(
        JSON.stringify({
          ok: false,
          reason: "superseded",
          publicView: {
            ...freshArbiter.publicView({ historyLimit: 10 }),
            yourSide: session.side,
            allTimeContributors: freshGame?.allTimeContributors || 0,
          },
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // If game completed (checkmate / draw / stalemate), archive PGN
    if (result.outcome) {
      const pgn = serialized.history.join(" ");
      await storage.archiveGame(pgn, result.outcome.kind, result.state.contributors);
    }

    const publicView = {
      ...arbiter.publicView({ historyLimit: 10 }),
      yourSide: session.side,
      canMoveNow: arbiter.publicView().sideToMove === session.side,
      recentMoves: serialized.history.slice(-10),
      contributorCount: serialized.contributors,
      allTimeContributors: nextAllTimeContributors,
      fen: serialized.position,
    };

    return new Response(JSON.stringify({ ok: true, state: publicView }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[API /api/chess/move Error]:", error);
    return new Response(JSON.stringify({ ok: false, reason: "server_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
