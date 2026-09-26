import { GAME } from '../constants';

export type FootprintId = keyof typeof GAME.footprints.pieces extends never
  ? never
  : 'largeRect' | 'largeTri' | 'mediumRect' | 'longLine' | 'shortLine';

export interface FootprintPlacement {
  readonly key: string;
  readonly footprintId: FootprintId;
  readonly instance: number;
  readonly boardX: number;
  readonly boardZ: number;
  readonly rotationDegrees: 0 | 90 | 180 | 270;
}

export const BOARD_INCH_TO_WORLD = GAME.scale.inchesPerBoardInch / 12;

export const boardInchesToWorld = (inches: number): number =>
  inches * BOARD_INCH_TO_WORLD;

// Rotational symmetry and center-heavy ruins keep traversal balanced. Line
// placements leave clearance around neighboring footprints.
export const BATTLEFIELD_LAYOUT: readonly FootprintPlacement[] = [
  { key: 'large-rect-a', footprintId: 'largeRect', instance: 0, boardX: 0, boardZ: 10, rotationDegrees: 90 },
  { key: 'large-rect-b', footprintId: 'largeRect', instance: 1, boardX: 0, boardZ: -10, rotationDegrees: 270 },
  { key: 'large-rect-c', footprintId: 'largeRect', instance: 2, boardX: -14, boardZ: 22, rotationDegrees: 0 },
  { key: 'large-rect-d', footprintId: 'largeRect', instance: 3, boardX: 14, boardZ: -22, rotationDegrees: 180 },
  { key: 'large-poly-a', footprintId: 'largeTri', instance: 0, boardX: 13, boardZ: 8, rotationDegrees: 180 },
  { key: 'large-poly-b', footprintId: 'largeTri', instance: 1, boardX: -13, boardZ: -8, rotationDegrees: 0 },
  { key: 'medium-a', footprintId: 'mediumRect', instance: 0, boardX: -16, boardZ: 6, rotationDegrees: 90 },
  { key: 'medium-b', footprintId: 'mediumRect', instance: 1, boardX: 16, boardZ: -6, rotationDegrees: 270 },
  { key: 'medium-c', footprintId: 'mediumRect', instance: 2, boardX: 16, boardZ: 18, rotationDegrees: 0 },
  { key: 'medium-d', footprintId: 'mediumRect', instance: 3, boardX: -16, boardZ: -18, rotationDegrees: 180 },
  { key: 'long-line-a', footprintId: 'longLine', instance: 0, boardX: 8, boardZ: 27, rotationDegrees: 0 },
  { key: 'long-line-b', footprintId: 'longLine', instance: 1, boardX: -8, boardZ: -27, rotationDegrees: 180 },
  { key: 'short-line-a', footprintId: 'shortLine', instance: 0, boardX: -20, boardZ: 0, rotationDegrees: 90 },
  { key: 'short-line-b', footprintId: 'shortLine', instance: 1, boardX: 20, boardZ: 0, rotationDegrees: 270 },
  { key: 'short-line-c', footprintId: 'shortLine', instance: 2, boardX: -5, boardZ: 16, rotationDegrees: 0 },
  { key: 'short-line-d', footprintId: 'shortLine', instance: 3, boardX: 5, boardZ: -16, rotationDegrees: 180 },
] as const;

export function getFootprintSpec(id: FootprintId) {
  const spec = GAME.footprints.pieces.find((piece) => piece.id === id);
  if (!spec) throw new Error(`Unknown footprint id: ${id}`);
  return spec;
}
