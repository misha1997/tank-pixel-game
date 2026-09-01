import type { TankAnimState } from './types.js';

export const BULLET_SPEED = 60;
export const BOT_UPDATE_INTERVAL = 400;
export const GAME_UPDATE_INTERVAL = 100;
export const BULLET_COOLDOWN = 200;
export const BOT_SHOOT_DISTANCE = 15;
export const INVULNERABILITY_TIME = 2000;

export const RAPID_FIRE_COOLDOWN = 80;
export const SHIELD_DURATION = 4000;
export const RAPID_FIRE_DURATION = 6000;
export const POWERUP_SPAWN_INTERVAL = 15000;
export const POWERUP_MAX_ACTIVE = 2;

// Spread fires 3 parallel bullets per shot instead of 1, so it costs more
// cooldown than the primary cannon to keep it a trade-off, not a strict
// upgrade.
export const SPREAD_COOLDOWN_MULTIPLIER = 1.8;

export const COLLISION_CHECK_DISTANCE = 5;
export const BULLET_POOL_SIZE = 100;

// Kept at a 5:3 ratio (matching the original 50x30) so the client minimap's
// fixed-aspect box still maps 1:1 without special-casing — see view.ts.
// The arena is bigger than the viewport now — the client camera (view.ts)
// follows the local player and only ever shows a window onto this grid.
export const size = {
  col: 100,
  row: 60,
};

export const positionPiece: Record<TankAnimState, number[][]> = {
  top: [
    [0, 1, 0],
    [1, 1, 1],
    [1, 0, 1],
  ],
  bottom: [
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 0],
  ],
  left: [
    [1, 1, 0],
    [0, 1, 1],
    [1, 1, 0],
  ],
  right: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 1, 1],
  ],
  boomOne: [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
  ],
  boomTwo: [
    [0, 1, 0],
    [1, 0, 1],
    [0, 1, 0],
  ],
};

export interface BulletDirectionConfig {
  dir: string;
  dx: number;
  dy: number;
  offsetX: number;
  offsetY: number;
}

// position 'left' = tank looks RIGHT (gun on right), shoots right
// position 'right' = tank looks LEFT (gun on left), shoots left
//
// offsetX/offsetY must land one cell *outside* the 3x3 positionPiece body
// in the direction of travel — not on one of the tank's own filled cells.
// A bullet spawned on top of the tank's own muzzle cell would be streamed
// as a bullet cell that tick, painting over the tank's color for a frame
// (bullet cells always win; see GameStateSnapshot in shared/src/types.ts).
export const bulletDirections: Record<'top' | 'bottom' | 'left' | 'right', BulletDirectionConfig> =
  {
    top: { dir: 'up', dx: 0, dy: -1, offsetX: 1, offsetY: -1 },
    bottom: { dir: 'down', dx: 0, dy: 1, offsetX: 1, offsetY: 3 },
    left: { dir: 'right', dx: 1, dy: 0, offsetX: 3, offsetY: 1 },
    right: { dir: 'left', dx: -1, dy: 0, offsetX: -1, offsetY: 1 },
  };

export const MAX_COOP_BOTS = 4;
export const BASE_HEALTH = 1;
