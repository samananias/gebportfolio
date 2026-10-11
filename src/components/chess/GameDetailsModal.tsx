import React, { useState, useEffect } from "react";
import { DoodleIcon } from "../ui/DoodleIcon";
import { showToast } from "../feedback/Toast";

export interface PublicGameState {
  version: number;
  fen: string;
  sideToMove: "white" | "black";
  yourSide: "white" | "black";
  canMoveNow: boolean;
  recentMoves: string[];
  contributorCount: number;
  allTimeContributors?: number;
  lastMoveAt: string;
  outcome: { type: string; winner?: "white" | "black" } | null;
}

interface ArchivedGameRecord {
  id: number;
  pgn: string;
  outcome: string;
  contributors: number;
  endedAt: string;
}

interface GameDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameState: PublicGameState | null;
  displayName: string;
}

export const GameDetailsModal: React.FC<GameDetailsModalProps> = ({
  isOpen,
  onClose,
  gameState,
  displayName,
}) => {
  const [archivedGames, setArchivedGames] = useState<ArchivedGameRecord[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/chess/archive")
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && Array.isArray(data.archives)) {
            setArchivedGames(data.archives);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen || !gameState) return null;

  const isYourTurn = gameState.yourSide === gameState.sideToMove;
  const isGameOver = !!gameState.outcome;

  const handleCopyPGN = (pgn: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(pgn);
      showToast("PGN copied to clipboard!");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      {/* Click backdrop to close */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div className="border-border-custom bg-bg/95 relative z-10 w-full max-w-md rounded-2xl border p-5 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <header className="border-border-custom/60 mb-4 flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div>
              <h3 className="font-display text-text text-base font-bold">Game Details & History</h3>
              <p className="text-text-muted font-mono text-[11px]">
                Crowd Chess Match v{gameState.version}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close game details"
            className="text-text-muted hover:text-text flex cursor-pointer items-center justify-center rounded-full p-1 text-lg leading-none transition-colors"
          >
            <DoodleIcon name="cross" className="size-4" />
          </button>
        </header>

        {/* Details Grid */}
        <div className="custom-scrollbar max-h-[75vh] space-y-4 overflow-y-auto pr-1 font-sans text-xs">
          {/* Victory Header Alert if game finished */}
          {isGameOver && (
            <div className="border-border-custom bg-surface-subtle border-structural flex flex-col items-center rounded-md p-3 text-center shadow-[2px_2px_0_var(--color-ink)]">
              <span className="text-text-muted font-mono text-[10px] font-bold tracking-[0.14em] uppercase">
                01 · Terminal Verdict
              </span>
              <h4 className="font-display text-text mt-0.5 text-sm font-bold sm:text-base">
                {gameState.outcome?.winner
                  ? `Team ${gameState.outcome.winner === "white" ? "White" : "Black"} Wins by Checkmate`
                  : `Game Drawn — ${gameState.outcome?.type.toUpperCase() || "FINISHED"}`}
              </h4>
            </div>
          )}

          {/* Team Assignment & Side */}
          <div className="border-border-custom/70 bg-surface-subtle/80 space-y-2 rounded-xl border p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-text-muted font-mono text-[11px]">Your Assigned Team:</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold uppercase ${
                  gameState.yourSide === "white"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                    : "border-stone-500/30 bg-stone-500/10 text-stone-700 dark:text-stone-300"
                }`}
              >
                <span
                  className={`size-2 rounded-full ${
                    gameState.yourSide === "white"
                      ? "bg-amber-400"
                      : "bg-stone-800 dark:bg-stone-200"
                  }`}
                />
                Team {gameState.yourSide}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted font-mono text-[11px]">Playing Handle:</span>
              <span className="text-text font-mono text-xs font-bold">{displayName}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted font-mono text-[11px]">
                Current Match Contributors:
              </span>
              <span className="text-text font-mono text-xs font-bold">
                {gameState.contributorCount} visitors
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted font-mono text-[11px]">
                All-Time Total Visitors:
              </span>
              <span className="text-primary font-mono text-xs font-bold">
                {gameState.allTimeContributors ?? gameState.contributorCount} visitors
              </span>
            </div>
          </div>

          {/* Match Turn Status */}
          <div className="border-border-custom/70 bg-surface-subtle/80 space-y-2 rounded-xl border p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-text-muted font-mono text-[11px]">Current Turn:</span>
              <span
                className={`font-mono text-xs font-bold ${
                  isYourTurn
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {isYourTurn
                  ? "★ YOUR TEAM TO MOVE"
                  : `Waiting for ${gameState.sideToMove.toUpperCase()}...`}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted font-mono text-[11px]">Board Version:</span>
              <span className="text-text font-mono text-xs">v{gameState.version}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted font-mono text-[11px]">Last Move Timestamp:</span>
              <span className="text-text-muted font-mono text-[11px]">
                {new Date(gameState.lastMoveAt).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Move Log History */}
          <div className="space-y-1.5">
            <div className="text-text-muted flex items-center justify-between font-mono text-[11px]">
              <span>Current Move History:</span>
              <span>{gameState.recentMoves.length} moves recorded</span>
            </div>

            <div className="custom-scrollbar border-border-custom/70 bg-surface text-text max-h-32 overflow-y-auto rounded-xl border p-3 font-mono text-xs leading-relaxed">
              {gameState.recentMoves.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {gameState.recentMoves.map((m, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="text-text-muted w-6 text-[10px]">{idx + 1}.</span>
                      <span className="text-primary font-bold">{m}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-text-muted py-2 text-center italic">
                  No moves recorded yet. Board is at starting position.
                </div>
              )}
            </div>
          </div>

          {/* Archived Finished Games Section */}
          {archivedGames.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="text-text-muted flex items-center justify-between font-mono text-[11px]">
                <span>Archived Completed Matches:</span>
                <span>{archivedGames.length} saved</span>
              </div>

              <div className="custom-scrollbar max-h-36 space-y-2 overflow-y-auto pr-1">
                {archivedGames.map((game) => (
                  <div
                    key={game.id}
                    className="border-border-custom/70 bg-surface-subtle/60 flex items-center justify-between rounded-lg border p-2 font-mono text-[11px]"
                  >
                    <div>
                      <div className="text-text font-bold uppercase">
                        Match #{game.id} · {game.outcome}
                      </div>
                      <div className="text-text-muted text-[10px]">
                        {game.contributors} contributors ·{" "}
                        {new Date(game.endedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyPGN(game.pgn)}
                      className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/30 cursor-pointer rounded border px-2 py-1 font-mono text-[10px] font-bold transition-colors"
                    >
                      Copy PGN
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FEN String */}
          <div className="space-y-1">
            <span className="text-text-muted font-mono text-[10px]">FEN Position Key:</span>
            <div className="border-border-custom/40 bg-surface-subtle text-text-muted truncate rounded border p-1.5 font-mono text-[10px] select-all">
              {gameState.fen}
            </div>
          </div>
        </div>

        {/* Footer Button */}
        <footer className="border-border-custom/60 mt-4 border-t pt-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="bg-primary cursor-pointer rounded-xl px-4 py-2 font-mono text-xs font-semibold text-white hover:opacity-90 active:scale-[0.98]"
          >
            Back to Chess Board
          </button>
        </footer>
      </div>
    </div>
  );
};
