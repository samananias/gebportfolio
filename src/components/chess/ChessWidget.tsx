import React, { useState, useEffect, useRef } from "react";
import { Chess, type Square } from "chess.js";
import { ChessBoard3D } from "./ChessBoard3D";
import { PromotionModal } from "./PromotionModal";
import { type PublicGameState } from "./GameDetailsModal";
import { showToast } from "../feedback/Toast";
import { chessAudio } from "../../lib/chess/audio";
import blunderRaw from "../../assets/chess-icons/blunder.svg?raw";

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

    // Fetch current live game state from server
    const fetchState = async () => {
      try {
        const res = await fetch("/api/chess/state");
        if (res.ok) {
          const data = (await res.json()) as PublicGameState;
          setGameState(data);
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
      const interval = setInterval(fetchState, 3000);
      return () => clearInterval(interval);
    }, []);

    if (isLoading || !gameState) {
      return (
        <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-6 text-center">
          <div className="bg-primary/10 border-primary/20 text-primary mb-3 flex size-12 animate-pulse items-center justify-center rounded-full border text-2xl">
            ♞
          </div>
          <p className="text-text-muted font-mono text-xs">Loading 3D Chess Board...</p>
        </div>
      );
    }

    // Parse FEN string with chess.js for legal move generation & check detection
    const chess = new Chess(gameState.fen);
    const board = chess.board();

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
        const res = await fetch("/api/chess/reset", { method: "POST" });
        const data = await res.json();
        if (res.ok && data.ok) {
          setGameState(data.state);
          onGameStateChangeRef.current?.(data.state);
          setSelectedSquare(null);
          setPossibleMoves([]);
          setPendingPromotion(null);
          showToast(`New Match Started! You are Team ${data.state.yourSide.toUpperCase()}`);
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
        {/* Checkmate Victory Banner or King in Check Alert Banner */}
        {isGameOver ? (
          <div className="animate-in fade-in zoom-in-95 flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-3 font-mono text-xs font-bold text-emerald-700 shadow-md dark:text-emerald-300">
            <span>
              {winner
                ? `★ GAME OVER - TEAM ${winner.toUpperCase()} WINS BY CHECKMATE!`
                : "★ GAME OVER - DRAW / STALEMATE!"}
            </span>
            <button
              type="button"
              onClick={handleResetMatch}
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary/90 cursor-pointer rounded-lg px-3.5 py-1.5 font-mono text-xs font-semibold text-white shadow-xs transition-transform active:scale-95 disabled:opacity-50"
            >
              Start New Match
            </button>
          </div>
        ) : (
          isCheck && (
            <div
              className={`flex animate-bounce items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-bold shadow-md ${
                isYourKingInCheck
                  ? "border-rose-600 bg-rose-600 text-white"
                  : "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
              }`}
            >
              <span
                className="inline-flex size-4 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: blunderRaw }}
              />
              <span>
                {isYourKingInCheck
                  ? "YOUR KING IS IN CHECK!"
                  : `${checkedTeamName} King is in Check!`}
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
