import React, { useState, useEffect, useRef, useMemo } from "react";
import { Chess, type Square } from "chess.js";
import { ChessBoard3D } from "./ChessBoard3D";
import { PromotionModal } from "./PromotionModal";
import { type PublicGameState } from "./GameDetailsModal";
import { showToast } from "../feedback/Toast";
import { chessAudio } from "../../lib/chess/audio";
import blunderRaw from "../../assets/chess-icons/blunder.svg?raw";
import { PIECE_RAWS } from "./ChessPiece";
import { DoodleIcon } from "../ui/DoodleIcon";

export interface ChessWidgetProps {
  displayName?: string;
  is3D?: boolean;
  onGameStateChange?: (state: PublicGameState | null) => void;
}

export const ChessWidget: React.FC<ChessWidgetProps> = React.memo(
  ({ is3D = true, onGameStateChange }) => {
    const [gameState, setGameState] = useState<PublicGameState | null>(null);
    const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
    const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
    const [pendingPromotion, setPendingPromotion] = useState<{
      from: string;
      to: string;
    } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const onGameStateChangeRef = useRef(onGameStateChange);
    useEffect(() => {
      onGameStateChangeRef.current = onGameStateChange;
    }, [onGameStateChange]);

    const prevVersionRef = useRef<number | null>(null);
    const isGameOverRef = useRef(false);

    useEffect(() => {
      isGameOverRef.current = !!gameState?.outcome;
    }, [gameState?.outcome]);

    // Fetch current live game state from server
    const fetchState = async () => {
      try {
        const headers: Record<string, string> = {};
        if (prevVersionRef.current !== null) {
          headers["If-None-Match"] = `W/"chess-v${prevVersionRef.current}"`;
        }
        const res = await fetch("/api/chess/state", { headers });
        if (res.status === 304) {
          // Board state unchanged; preserve existing state without re-rendering
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as PublicGameState;
          setGameState((prev) => {
            if (prev && prev.version === data.version && prev.fen === data.fen) {
              return prev;
            }
            return data;
          });
          if (prevVersionRef.current !== data.version) {
            prevVersionRef.current = data.version;
            onGameStateChangeRef.current?.(data);
          }
        }
      } catch {
        // Silent error during polling
      } finally {
        setIsLoading(false);
      }
    };

    useEffect(() => {
      fetchState();

      let timer: NodeJS.Timeout | null = null;
      let isSubscribed = true;

      const schedulePoll = () => {
        if (!isSubscribed) return;
        if (timer) clearTimeout(timer);
        // Back off to 30 seconds when match has finished (waiting for reset), 5 seconds during active game
        const delay = isGameOverRef.current ? 30000 : 5000;
        timer = setTimeout(async () => {
          if (!document.hidden && isSubscribed) {
            await fetchState();
          }
          if (isSubscribed) {
            schedulePoll();
          }
        }, delay);
      };

      const handleVisibilityChange = () => {
        if (document.hidden) {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        } else {
          fetchState();
          schedulePoll();
        }
      };

      if (!document.hidden) {
        schedulePoll();
      }

      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        isSubscribed = false;
        if (timer) clearTimeout(timer);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }, []);

    // Parse FEN string with chess.js for legal move generation & check detection (memoized)
    const chess = useMemo(() => {
      return gameState ? new Chess(gameState.fen) : null;
    }, [gameState?.fen]);

    const board = useMemo(() => {
      return chess ? chess.board() : [];
    }, [chess]);

    if (isLoading || !gameState || !chess) {
      return (
        <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-6 text-center">
          <div className="bg-primary/10 border-primary/20 text-primary mb-3 flex size-12 animate-pulse items-center justify-center rounded-full border text-2xl">
            ♞
          </div>
          <p className="text-text-muted font-mono text-xs">Loading 3D Chess Board...</p>
        </div>
      );
    }

    // Check detection & king square targeting
    const isCheck = chess.inCheck();
    const sideInCheck = chess.turn(); // 'w' or 'b'
    let checkSquare: string | null = null;

    if (isCheck) {
      board.forEach((row) => {
        row.forEach((cell) => {
          if (cell && cell.type === "k" && cell.color === sideInCheck) {
            checkSquare = cell.square;
          }
        });
      });
    }

    const handleSquareClick = (
      squareName: string,
      cell: { type: string; color: string } | null
    ) => {
      if (gameState.outcome || isSubmitting) return;

      // If clicking on an existing selection or target square
      if (selectedSquare) {
        if (selectedSquare === squareName) {
          setSelectedSquare(null);
          setPossibleMoves([]);
          return;
        }

        // Check if squareName is a valid destination for selected piece
        const validMoves = chess.moves({ square: selectedSquare as Square, verbose: true });
        const targetMoves = validMoves.filter((m) => m.to === squareName);

        if (targetMoves.length > 0) {
          // Check if any move requires promotion
          const requiresPromotion = targetMoves.some((m) => m.promotion);
          if (requiresPromotion) {
            setPendingPromotion({ from: selectedSquare, to: squareName });
            return;
          }

          // Submit move
          executeMove(targetMoves[0].san);
          setSelectedSquare(null);
          setPossibleMoves([]);
          return;
        }
      }

      // If selecting a piece of player's assigned team
      if (cell && cell.color === (gameState.yourSide === "white" ? "w" : "b")) {
        setSelectedSquare(squareName);
        const moves = chess.moves({ square: squareName as Square, verbose: true });
        setPossibleMoves(moves.map((m) => m.to));
      } else {
        setSelectedSquare(null);
        setPossibleMoves([]);
      }
    };

    const handlePromotionSelect = (piece: "q" | "n" | "r" | "b") => {
      if (!pendingPromotion) return;

      const tempChess = new Chess(gameState.fen);
      const moveResult = tempChess.move({
        from: pendingPromotion.from as Square,
        to: pendingPromotion.to as Square,
        promotion: piece,
      });

      if (moveResult) {
        executeMove(moveResult.san);
      }

      setPendingPromotion(null);
      setSelectedSquare(null);
      setPossibleMoves([]);
    };

    const handlePromotionCancel = () => {
      setPendingPromotion(null);
    };

    const executeMove = async (sanMove: string) => {
      setIsSubmitting(true);

      try {
        const activePass =
          typeof window !== "undefined" ? sessionStorage.getItem("portfolio_chat_pass_v1") : null;
        const res = await fetch("/api/chess/move", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(activePass ? { "x-chat-pass": activePass } : {}),
          },
          body: JSON.stringify({
            move: sanMove,
            version: gameState.version,
          }),
        });

        const data = await res.json();

        if (res.ok && data.ok) {
          setGameState(data.state);
          onGameStateChangeRef.current?.(data.state);

          // Test if move resulted in Checkmate, Check, Promotion or normal move for audio response
          const newChess = new Chess(data.state.fen);
          if (data.state.outcome?.type === "checkmate" || newChess.isCheckmate()) {
            chessAudio.playCheckmate();
            showToast("CHECKMATE!");
          } else if (newChess.inCheck()) {
            chessAudio.playCheck();
            showToast("CHECK!");
          } else if (sanMove.includes("=")) {
            chessAudio.playPromotion();
            showToast("PAWN PROMOTED!");
          } else {
            chessAudio.playMove();
          }
        } else {
          if (data.requireTurnstile) {
            window.dispatchEvent(new CustomEvent("portfolio-chat-require-pass"));
            showToast("Session pass expired. Please verify to continue playing.");
          } else if (data.reason === "superseded") {
            showToast("A teammate moved first!");
            if (data.publicView) {
              setGameState(data.publicView);
              onGameStateChangeRef.current?.(data.publicView);
            }
          } else if (data.reason === "not_your_side") {
            showToast("It's not your team's turn right now.");
          } else if (data.reason === "illegal_move") {
            showToast("Illegal move for this position.");
          } else if (data.reason === "rate_limited") {
            showToast("Slow down! Please wait a moment between moves.");
          } else {
            showToast(`Rejected: ${data.error || data.reason}`);
          }
        }
      } catch {
        showToast("Failed to connect to game server.");
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleResetMatch = async () => {
      setIsSubmitting(true);
      try {
        const pass =
          typeof window !== "undefined"
            ? window.sessionStorage.getItem("portfolio_chat_pass_v1") || ""
            : "";
        const res = await fetch("/api/chess/reset", {
          method: "POST",
          headers: pass ? { "x-chat-pass": pass } : {},
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          setGameState(data.state);
          onGameStateChangeRef.current?.(data.state);
          setSelectedSquare(null);
          setPossibleMoves([]);
          setPendingPromotion(null);
          showToast(`New Match Started! You are Team ${data.state.yourSide.toUpperCase()}`);
        } else if (data.requireTurnstile) {
          showToast("Verification pass required to reset. Please solve Turnstile in Live Chat.");
        } else {
          showToast(`Reset failed: ${data.error || data.reason}`);
        }
      } catch {
        showToast("Failed to connect to game server.");
      } finally {
        setIsSubmitting(false);
      }
    };

    const isGameOver = !!gameState.outcome || chess.isGameOver();
    const winner =
      gameState.outcome?.winner ||
      (chess.isCheckmate() ? (chess.turn() === "w" ? "black" : "white") : null);

    const checkedTeamName = sideInCheck === "w" ? "White" : "Black";
    const isYourKingInCheck =
      isCheck && (gameState.yourSide === "white" ? sideInCheck === "w" : sideInCheck === "b");

    return (
      <div className="flex h-full w-full flex-col items-center justify-center space-y-2">
        {/* Checkmate Victory Plaque or King in Check Alert Banner */}
        {isGameOver ? (
          <div
            role="alert"
            aria-live="assertive"
            className="border-border-custom bg-surface animate-in fade-in zoom-in-95 border-structural relative z-20 flex w-full max-w-[340px] flex-col items-center rounded-md p-3.5 text-center shadow-[3px_3px_0_var(--color-ink)] transition-all sm:max-w-[360px]"
          >
            {/* Monastic Eyebrow */}
            <div className="text-text-muted mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.14em] uppercase">
              <span className="bg-primary inline-block size-1.5 rounded-full" />
              <span>01 · Terminal Verdict · {winner ? "Checkmate" : "Drawn Game"}</span>
              <span className="bg-primary inline-block size-1.5 rounded-full" />
            </div>

            {/* Hand-carved Woodcut Standee Vector */}
            <div className="my-1 flex items-center justify-center">
              {winner ? (
                <div
                  className="text-text size-14 drop-shadow-none [&>svg]:size-full [&>svg]:object-contain"
                  dangerouslySetInnerHTML={{
                    __html: winner === "white" ? PIECE_RAWS.K : PIECE_RAWS.k,
                  }}
                  aria-hidden="true"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <div
                    className="text-text size-11 [&>svg]:size-full [&>svg]:object-contain"
                    dangerouslySetInnerHTML={{ __html: PIECE_RAWS.K }}
                    aria-hidden="true"
                  />
                  <span className="text-text-muted font-mono text-xs">vs</span>
                  <div
                    className="text-text size-11 [&>svg]:size-full [&>svg]:object-contain"
                    dangerouslySetInnerHTML={{ __html: PIECE_RAWS.k }}
                    aria-hidden="true"
                  />
                </div>
              )}
            </div>

            {/* Display Headline in Fraunces serif */}
            <h3 className="font-display text-text text-base font-bold tracking-tight sm:text-lg">
              {winner
                ? `Team ${winner === "white" ? "White" : "Black"} Claims Victory`
                : "Drawn Game — Stalemate"}
            </h3>

            {/* Subtext description in Inter */}
            <p className="text-text-muted mt-0.5 max-w-[280px] font-sans text-xs leading-normal">
              {winner
                ? "The opposing king has no legal escapes. The match concludes by decisive checkmate."
                : "Neither side has sufficient material or legal moves. The board rests in balance."}
            </p>

            {/* Woodcut Tactile Action Button */}
            <div className="mt-3 w-full">
              <button
                type="button"
                onClick={handleResetMatch}
                disabled={isSubmitting}
                className="bg-primary border-border-custom hover:bg-primary-hover focus-visible:ring-focus border-structural flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 font-mono text-xs font-bold tracking-wider text-white uppercase shadow-[2px_2px_0_var(--color-ink)] transition-all hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[3px_3px_0_var(--color-ink)] focus-visible:ring-2 focus-visible:outline-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-50"
              >
                <DoodleIcon name="arrows/arrow-circle-down" className="size-3.5 rotate-180" />
                <span>{isSubmitting ? "Resetting Board..." : "Start New Match"}</span>
              </button>
            </div>
          </div>
        ) : (
          isCheck && (
            <div
              role="alert"
              className={`border-border-custom bg-surface animate-in fade-in border-structural flex items-center gap-2 rounded-md px-3 py-1.5 font-mono text-xs font-bold shadow-[2px_2px_0_var(--color-ink)] ${
                isYourKingInCheck ? "text-primary" : "text-text"
              }`}
            >
              <span
                className="text-primary inline-flex size-4 shrink-0 items-center justify-center [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: blunderRaw }}
              />
              <span className="tracking-wider uppercase">
                {isYourKingInCheck
                  ? "Alert · Your King is in Check!"
                  : `Alert · ${checkedTeamName} King is in Check!`}
              </span>
            </div>
          )
        )}

        {/* Pure 3D / 2D Chess Board (Direct touch-interactive canvas without parent click interceptor) */}
        <div className="flex w-full flex-1 items-center justify-center">
          <ChessBoard3D
            board={board}
            yourSide={gameState.yourSide}
            selectedSquare={selectedSquare}
            possibleMoves={possibleMoves}
            checkSquare={checkSquare}
            is3D={is3D}
            isSubmitting={isSubmitting}
            isGameOver={!!gameState.outcome}
            onSquareClick={handleSquareClick}
          />
        </div>

        {/* Promotion Selector Overlay */}
        {pendingPromotion && (
          <PromotionModal
            color={gameState.yourSide === "white" ? "w" : "b"}
            onSelect={handlePromotionSelect}
            onCancel={handlePromotionCancel}
          />
        )}
      </div>
    );
  }
);
