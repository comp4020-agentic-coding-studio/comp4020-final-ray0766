import { cloneDesign, STARTERS } from '../assets/claude-geometry/ship/design.ts';
import type { ShipDesign } from '../assets/claude-geometry/ship/design.ts';
export interface SavedShip { design: ShipDesign; version: number }
export const defaultShip = (): SavedShip => ({ design: cloneDesign(STARTERS[0]), version: 0 });
