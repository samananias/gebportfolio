import React, { useState, useEffect, useMemo } from "react";
import type { Square, PieceSymbol, Color } from "chess.js";
import { ChessPiece } from "./ChessPiece";
import { CAMERA, PIECE_STYLES, projectPiece } from "./sceneConfig";
import { chessAudio } from "../../lib/chess/audio";

interface CellPiece {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

interface ChessBoard3DProps {
  board: (CellPiece | null)[][];
  yourSide?: "white" | "black";
  selectedSquare: string | null;
  possibleMoves: string[];
  checkSquare?: string | null;
  is3D: boolean;
  isSubmitting: boolean;
  isGameOver: boolean;
  onSquareClick: (square: string, cell: CellPiece | null) => void;
}

const DEFAULT_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const DEFAULT_RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

interface PieceSceneObject {
  id: string;
  square: Square;
  type: PieceSymbol;
  color: Color;
  x: number; // Column index 0..7
  y: number; // Row index 0..7
}

export const ChessBoard3D: React.FC<ChessBoard3DProps> = React.memo(
  ({
    board,
    yourSide = "white",
    selectedSquare,
    possibleMoves,
    checkSquare,
    is3D,
    isSubmitting,
    isGameOver,
    onSquareClick,
  }) => {
    const [prefersReduced, setPrefersReduced] = useState(false);
    const [hoveredSquare, setHoveredSquare] = useState<string | null>(null);

    useEffect(() => {
      if (typeof window !== "undefined") {
        const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        setPrefersReduced(mediaQuery.matches);
        const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
      }
    }, []);

    const use3D = is3D && !prefersReduced;
    const isBlackView = yourSide === "black";

    const displayFiles = isBlackView ? [...DEFAULT_FILES].reverse() : DEFAULT_FILES;
    const displayRanks = isBlackView ? [...DEFAULT_RANKS].reverse() : DEFAULT_RANKS;

    // Memoize board orientation matrix oriented to player's assigned team seat
    const displayBoard = useMemo(() => {
      return isBlackView
        ? board
            .slice()
            .reverse()
            .map((row) => row.slice().reverse())
        : board;
    }, [board, isBlackView]);

    const lastTouchTimeRef = React.useRef(0);

    const handleCellClick = (squareName: string, cell: CellPiece | null) => {
      if (isSubmitting || isGameOver) return;
      chessAudio.playClick();
      onSquareClick(squareName, cell);
    };

    const handleCellPointerDown = (
      squareName: string,
      cell: CellPiece | null,
      e: React.PointerEvent
    ) => {
      if (e.pointerType === "touch") {
        lastTouchTimeRef.current = Date.now();
        handleCellClick(squareName, cell);
      }
    };

    const handleCellButtonClick = (squareName: string, cell: CellPiece | null) => {
      if (Date.now() - lastTouchTimeRef.current < 500) {
        return;
      }
      handleCellClick(squareName, cell);
    };

    // Memoize active chess pieces for independent Piece Renderer Layer
    const pieceObjects = useMemo(() => {
      const objects: PieceSceneObject[] = [];
      displayBoard.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cell) {
            objects.push({
              id: `${cell.square}-${cell.type}-${cell.color}`,
              square: cell.square,
              type: cell.type,
              color: cell.color,
              x: cIdx,
              y: rIdx,
            });
          }
        });
      });

      // Dynamic Screen-Space Depth Sorting by screen Y row index
      objects.sort((a, b) => {
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });

      return objects;
    }, [displayBoard]);

    const activeSquare = hoveredSquare || selectedSquare;
    let activeBadgeLabel: string | null = null;
    if (activeSquare) {
      const activeObj = pieceObjects.find((p) => p.square === activeSquare);
      if (activeObj) {
        const rawName = PIECE_STYLES[activeObj.type.toLowerCase()]?.name ?? activeObj.type;
        const pieceName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
        const colorName = activeObj.color === "w" ? "White" : "Black";
        activeBadgeLabel = `${colorName} ${pieceName} on ${activeSquare}`;
      }
    }

    return (
      <div className="relative mx-auto flex w-full max-w-[390px] touch-manipulation flex-col items-center justify-center p-2 select-none">
        {/* Active Piece Identification QoL Pill Badge */}
        {activeBadgeLabel && (
          <div className="bg-surface/90 border-border text-text animate-in fade-in zoom-in-95 pointer-events-none absolute -top-3 z-40 rounded-full border px-3 py-0.5 font-mono text-[11px] font-bold tracking-wide shadow-xs backdrop-blur-xs transition-opacity duration-200">
            {activeBadgeLabel}
          </div>
        )}

        {/* Ground Soft Radial Shadow for Desk Placement Realism */}
        {use3D && (
          <div
            className="pointer-events-none absolute bottom-4 h-16 w-[90%] rounded-full bg-black/40 blur-xl transition-opacity duration-500"
            style={{ transform: "scaleY(0.4)" }}
          />
        )}

        {/* 4-Layer Chess Stage Viewport Container */}
        <div
          className="w-full transition-transform duration-500 ease-out"
          style={{
            perspective: use3D ? `${CAMERA.perspective}px` : "none",
            perspectiveOrigin: use3D ? CAMERA.origin : "50% 50%",
          }}
        >
          {/* Letterpress 3D Stage Slab — physical wooden block extrusion */}
          <div
            className={`relative w-full rounded-sm border-[3px] border-[color:var(--chess-ink,#2a2320)] bg-[color:var(--chess-paper,#f2e8d5)] p-1.5 transition-transform duration-500 ease-out sm:p-2 ${
              use3D ? "board-3d-slab" : "board-2d-flat"
            }`}
            style={{
              transformStyle: "preserve-3d",
              transform: use3D ? `rotateX(${CAMERA.boardTilt}deg)` : "rotateX(0deg)",
              willChange: "transform",
            }}
          >
            {/* Stage Surface (Contains Layer 1: Board Grid & Layer 3: Piece Renderer) */}
            <div
              className="relative aspect-square w-full flex-1 border border-[color:var(--chess-ink,#2a2320)]"
              style={{ transformStyle: "preserve-3d", touchAction: "none" }}
            >
              {/* LAYER 1: Dumb 8x8 Board Surface Grid */}
              <div className="grid h-full w-full grid-cols-8 grid-rows-8">
                {displayBoard.map((row, rIdx) =>
                  row.map((cell, cIdx) => {
                    const file = displayFiles[cIdx];
                    const rank = displayRanks[rIdx];
                    const squareName = `${file}${rank}`;
                    const isDark = (rIdx + cIdx) % 2 === 1;

                    const isSelected = selectedSquare === squareName;
                    const isPossible = possibleMoves.includes(squareName);
                    const isCheckSquare = checkSquare === squareName;
                    const isDisabled = isSubmitting || isGameOver;

                    const rawPieceName = cell
                      ? (PIECE_STYLES[cell.type.toLowerCase()]?.name ?? cell.type)
                      : "";
                    const pieceName = rawPieceName
                      ? rawPieceName.charAt(0).toUpperCase() + rawPieceName.slice(1)
                      : "";

                    const ariaLabelText = cell
                      ? `${cell.color === "w" ? "White" : "Black"} ${pieceName} on ${squareName}`
                      : `Empty square ${squareName}`;

                    return (
                      <button
                        key={squareName}
                        type="button"
                        onClick={() => handleCellButtonClick(squareName, cell)}
                        onPointerDown={(e) => handleCellPointerDown(squareName, cell, e)}
                        onPointerEnter={(e) => {
                          if (e.pointerType === "touch") return;
                          setHoveredSquare(squareName);
                        }}
                        onPointerLeave={(e) => {
                          if (e.pointerType === "touch") return;
                          setHoveredSquare((prev) => (prev === squareName ? null : prev));
                        }}
                        aria-disabled={isDisabled}
                        aria-label={ariaLabelText}
                        className={`pointer-events-auto relative flex touch-manipulation items-center justify-center transition-colors duration-150 ${
                          isDark ? "woodcut-square-dark" : "woodcut-square-light"
                        } ${
                          isCheckSquare
                            ? "z-30 animate-pulse bg-rose-500/35 outline outline-[3px] -outline-offset-[3px] outline-rose-600"
                            : isSelected
                              ? "z-30 outline outline-[3px] -outline-offset-[3px] outline-[color:var(--chess-ink,#2a2320)]"
                              : isPossible
                                ? "z-40"
                                : ""
                        } ${isDisabled ? "cursor-not-allowed opacity-90" : "cursor-pointer"}`}
                        title={squareName}
                      >
                        {/* Corner rank coordinate label */}
                        {cIdx === 0 && (
                          <span className="pointer-events-none absolute top-[2px] left-[3px] font-mono text-[8px] font-bold text-[color:var(--chess-ink,#2a2320)] opacity-60 select-none">
                            {rank}
                          </span>
                        )}

                        {/* Corner file coordinate label */}
                        {rIdx === 7 && (
                          <span className="pointer-events-none absolute right-[3px] bottom-[2px] font-mono text-[8px] font-bold text-[color:var(--chess-ink,#2a2320)] opacity-60 select-none">
                            {file}
                          </span>
                        )}

                        {/* King Check Indicator Ring */}
                        {isCheckSquare && (
                          <span className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                            <span className="size-[84%] animate-ping rounded-full border-[3px] border-rose-600 bg-rose-500/30 opacity-90" />
                          </span>
                        )}

                        {/* LAYER 2: Ink Ring Destination Markers */}
                        {isPossible && (
                          <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                            <span
                              className={
                                cell
                                  ? "size-[80%] rounded-full border-[3px] border-[color:var(--chess-ink,#2a2320)] opacity-45"
                                  : "size-[26%] rounded-full border-[2.5px] border-[color:var(--chess-ink,#2a2320)] opacity-40"
                              }
                            />
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* LAYER 3: Independent Standee Piece Renderer Layer */}
              <div
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ transformStyle: "preserve-3d" }}
              >
                {pieceObjects.map((p) => {
                  const isSelected = selectedSquare === p.square;
                  // Centralized Projection System converts coordinates into screen position, depth & tilt
                  const projection = projectPiece(p.x, p.y, p.type, isSelected, CAMERA);

                  return (
                    <div
                      key={p.id}
                      data-piece-square={p.square}
                      className="pointer-events-none absolute h-[12.5%] w-[12.5%] transition-transform duration-300 ease-out select-none"
                      style={{
                        left: projection.left,
                        top: projection.top,
                        zIndex: isSelected ? 120 : projection.zIndex,
                        transformStyle: "preserve-3d",
                        transform: `scale(${projection.scale})`,
                        transformOrigin: "bottom center",
                        willChange: "transform",
                      }}
                    >
                      <ChessPiece
                        id={p.id}
                        type={p.type}
                        color={p.color}
                        height={projection.height}
                        transform={projection.transform}
                        isSelected={isSelected}
                        is3D={use3D}
                        depthFactor={projection.depthFactor}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
