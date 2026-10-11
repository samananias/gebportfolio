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
import { getClientIp, isOriginAllowed, checkRateLimit } from "../../../lib/rateLimit";
import { getTurnstileSecret, verifyChatPass, getCookie } from "../../../lib/turnstile";
import { getChessOutcome } from "../../../lib/chess/outcome";
import { invalidateStateCache } from "./state";
import { invalidateArchiveCache } from "./archive";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  try {
    // 1. Origin verification
    if (!isOriginAllowed(request)) {
      return new Response(JSON.stringify({ ok: false, reason: "forbidden_origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Rate limiting: max 2 reset requests per 60s, 5s cooldown per IP
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit({
      key: `chess:reset:${clientIp}`,
      maxRequests: 2,
      windowMs: 60_000,
      cooldownMs: 5_000,
    });

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "rate_limited",
          error: "Please wait before attempting to reset again.",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3. Human verification pass (15-Minute session pass)
    const turnstileSecret = await getTurnstileSecret(locals);
    const providedPass = request.headers.get("x-chat-pass") || getCookie(request, "chat_pass");

    let isPassValid = false;
    if (providedPass) {
      isPassValid = await verifyChatPass(providedPass, clientIp, turnstileSecret);
    }

    const isDevOrTest = !import.meta.env.PROD || process.env.PLAYWRIGHT_E2E === "1";
    if (!isDevOrTest) {
      if (!turnstileSecret) {
        return new Response(
          JSON.stringify({
            ok: false,
            reason: "verification_unconfigured",
            error: "Security verification service is temporarily unavailable.",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }

      if (!isPassValid) {
        return new Response(
          JSON.stringify({
            ok: false,
            reason: "pass_required",
            requireTurnstile: true,
            error: "Verification pass required to reset match. Please verify in Live Chat.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const existingCookie = cookies.get(COOKIE_NAME)?.value;
    const session = await verifySession(existingCookie, locals);

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
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Evaluate terminal outcome: checkmate, stalemate, repetition, 50-move, or insufficient material
    const outcome = getChessOutcome(game.fen, game.history);

    if (!outcome) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "game_in_progress",
          error: "Cannot reset board while a match is in progress.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Double-check recent archives to prevent duplicate inserts if already archived on final move
    const recentArchives = await storage.getArchivedGames(1);
    const pgn = game.history.join(" ");
    const alreadyArchived = recentArchives.length > 0 && recentArchives[0].pgn === pgn;

    if (!alreadyArchived && pgn.length > 0) {
      await storage.archiveGame(pgn, outcome.kind, game.contributors);
    }

    // Reset game state back to starting position
    const resetState = {
      version: game.version + 1,
      fen: INITIAL_FEN,
      history: [],
      positionKeys: [INITIAL_FEN.split(" ")[0]],
      contributors: 0,
      seenSessions: [],
      allTimeContributors: (game.allTimeContributors || 0) + (game.contributors > 0 ? 1 : 0),
      lastMoveAt: new Date().toISOString(),
    };

    await storage.saveGame(game.version, resetState);

    // Invalidate state and archive caches
    invalidateStateCache();
    invalidateArchiveCache();

    // Re-assign player side for new match
    const freshArbiter = createArbiter({
      rules: chessRules,
      now: Date.now(),
      state: {
        schemaVersion: 1,
        version: resetState.version,
        position: resetState.fen,
        sideToMove: "white",
        history: [],
        positionKeys: resetState.positionKeys,
        seenSessions: [],
        contributors: 0,
        startedAt: resetState.lastMoveAt,
        lastMoveAt: resetState.lastMoveAt,
        outcome: null,
      },
    });

    const newSessionId = generateSessionId();
    const assignment = freshArbiter.assign({ sessionId: newSessionId });
    const newCookieValue = await signSession(newSessionId, assignment.side, locals);

    const isSecure = import.meta.env.PROD && process.env.PLAYWRIGHT_E2E !== "1";
    cookies.set(COOKIE_NAME, newCookieValue, {
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });

    const freshView = freshArbiter.publicView({ historyLimit: 10 });
    const payload = {
      ...freshView,
      yourSide: assignment.side,
      canMoveNow: freshView.sideToMove === assignment.side,
      recentMoves: freshView.history,
      contributorCount: freshView.contributors,
      allTimeContributors: resetState.allTimeContributors,
      fen: String(freshView.position),
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
