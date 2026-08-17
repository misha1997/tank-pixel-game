import type { TankAnimState } from './types.js';

export const BULLET_SPEED = 100;
export const BOT_UPDATE_INTERVAL = 400;
export const GAME_UPDATE_INTERVAL = 100;
export const BULLET_COOLDOWN = 200;
export const BOT_SHOOT_DISTANCE = 15;
export const INVULNERABILITY_TIME = 2000;

export const MAX_PLAYERS = 20;
export const COLLISION_CHECK_DISTANCE = 5;
export const BULLET_POOL_SIZE = 100;

// Kept at a 5:3 ratio (matching the original 50x30) so the client minimap's
// fixed-aspect box still maps 1:1 without special-casing — see view.ts.
export const size = {
  col: 60,
  row: 36,
};

export const positionPiece: Record<TankAnimState, number[][]> = {
  top: [[0, 1, 0], [1, 1, 1], [1, 0, 1]],
  bottom: [[1, 0, 1], [1, 1, 1], [0, 1, 0]],
  left: [[1, 1, 0], [0, 1, 1], [1, 1, 0]],
  right: [[0, 1, 1], [1, 1, 0], [0, 1, 1]],
  boomOne: [[1, 0, 1], [0, 1, 0], [1, 0, 1]],
  boomTwo: [[0, 1, 0], [1, 0, 1], [0, 1, 0]],
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
export const bulletDirections: Record<'top' | 'bottom' | 'left' | 'right', BulletDirectionConfig> = {
  top: { dir: 'up', dx: 0, dy: -1, offsetX: 1, offsetY: 0 },
  bottom: { dir: 'down', dx: 0, dy: 1, offsetX: 1, offsetY: 2 },
  left: { dir: 'right', dx: 1, dy: 0, offsetX: 3, offsetY: 1 },
  right: { dir: 'left', dx: -1, dy: 0, offsetX: 0, offsetY: 1 },
};

export const MAX_COOP_BOTS = 4;
export const BASE_HEALTH = 1;
