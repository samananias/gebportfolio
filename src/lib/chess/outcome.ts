import { Chess } from "chess.js";
import type { Outcome } from "turn-arbiter";

/**
 * Evaluates whether a chess position or move sequence has reached a terminal outcome
 * (checkmate, stalemate, repetition, fifty-move rule, or insufficient material).
 */
export function getChessOutcome(fen: string, history?: string[]): Outcome | null {
  try {
    const chess = new Chess();
    if (history && history.length > 0) {
      for (const move of history) {
        chess.move(move);
      }
    } else {
      chess.load(fen);
    }

    if (chess.isCheckmate()) {
      const winner = chess.turn() === "w" ? "black" : "white";
      return { kind: "win", winner, by: "checkmate" };
    }

    if (chess.isStalemate()) {
      return { kind: "draw", by: "stalemate" };
    }

    if (chess.isThreefoldRepetition()) {
      return { kind: "draw", by: "repetition" };
    }

    if (chess.isDrawByFiftyMoves()) {
      return { kind: "draw", by: "fifty-move" };
    }

    if (chess.isInsufficientMaterial()) {
      return { kind: "draw", by: "insufficient-material" };
    }

    return null;
  } catch {
    // Fallback: directly evaluate FEN if history replay fails
    try {
      const fallbackChess = new Chess(fen);
      if (fallbackChess.isCheckmate()) {
        const winner = fallbackChess.turn() === "w" ? "black" : "white";
        return { kind: "win", winner, by: "checkmate" };
      }
      if (fallbackChess.isStalemate()) {
        return { kind: "draw", by: "stalemate" };
      }
      if (fallbackChess.isInsufficientMaterial()) {
        return { kind: "draw", by: "insufficient-material" };
      }
      return null;
    } catch {
      return null;
    }
  }
}
