// Single source of truth for the 3D Chess Stage Virtual Camera
export const CAMERA = {
  perspective: 1200,
  boardTilt: 48,
  pieceTilt: -42,
  origin: "50% 50%",
} as const;

// Visual style configuration decoupling piece visuals from game logic
export const PIECE_STYLES: Record<string, { height: string; name: string }> = {
  p: { height: "100%", name: "pawn" },
  n: { height: "106%", name: "knight" },
  b: { height: "110%", name: "bishop" },
  r: { height: "112%", name: "rook" },
  q: { height: "118%", name: "queen" },
  k: { height: "122%", name: "king" },
};

export interface ProjectedPieceStyle {
  left: string;
  top: string;
  zIndex: number;
  height: string;
  transform: string;
  /** 0.0 (back row) → 1.0 (front row) — used by ChessPiece for depth-based shadow modulation */
  depthFactor: number;
  /** Subtle scale applied to the piece container — front rows slightly larger */
  scale: number;
}

/**
 * Centralized Projection System: converts board coordinates (x, y) into screen-space
 * position, depth, height, tilt geometry, depth factor, and perspective-aware scale.
 *
 * Y-coordinate mapping uses a gentle power curve to compress back rows, producing
 * natural perspective overlap without manual offsets.
 */
export function projectPiece(
  x: number, // Column index 0..7
  y: number, // Row index 0..7
  type: string,
  isSelected: boolean,
  camera: typeof CAMERA = CAMERA
): ProjectedPieceStyle {
  const styleConfig = PIECE_STYLES[type.toLowerCase()] ?? { height: "130%", name: type };
  const zIndex = isSelected ? 120 : (y + 1) * 10;

  // Normalized depth: 0 = back row, 1 = front row
  const depthFactor = y / 7;

  // Perspective-aware Y compression: gentle power curve pushes back rows closer together.
  // Linear mapping: (y / 8) * 100%. With the curve, back rows (small y) compress ~3-5%.
  const normalizedY = y / 8;
  const compressedY = Math.pow(normalizedY, 0.92) * 100;

  // Depth-based scale: front rows at 100%, back rows at ~94%
  const scale = 0.94 + depthFactor * 0.06;

  return {
    left: `${(x / 8) * 100}%`,
    top: `${compressedY}%`,
    zIndex,
    height: styleConfig.height,
    transform: `rotateX(${camera.pieceTilt}deg)`,
    depthFactor,
    scale,
  };
}
