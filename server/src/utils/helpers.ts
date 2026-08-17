import { BULLET_POOL_SIZE, bulletDirections, size } from '@tank/shared';
import type { BulletState } from '@tank/shared';
import { state } from '../config/state.js';

export function randomInteger(max: number): number {
  return Math.floor(Math.random() * max);
}

export function hasWallAt(x: number, y: number): boolean {
  for (const wall of state.walls) {
    if (wall.x === x && wall.y === y) {
      return true;
    }
  }
  return false;
}

export function hasBrickAt(x: number, y: number): boolean {
  for (const brick of state.bricks) {
    if (brick.x === x && brick.y === y && brick.health > 0) {
      return true;
    }
  }
  return false;
}

export function initializeBulletPool(): void {
  for (let i = 0; i < BULLET_POOL_SIZE; i++) {
    state.bulletPool.push({
      id: null,
      position: null,
      x: 0,
      y: 0,
      direction: null,
      dx: 0,
      dy: 0,
      ownerId: null,
      active: false,
    });
  }
}

export function getBulletFromPool(): BulletState {
  for (const bullet of state.bulletPool) {
    if (!bullet.active) {
      bullet.active = true;
      bullet.id = `bullet_${++state.bulletIdCounter}`;
      return bullet;
    }
  }
  // If pool is empty, create new bullet
  const bullet: BulletState = {
    id: `bullet_${++state.bulletIdCounter}`,
    position: null,
    x: 0,
    y: 0,
    direction: null,
    dx: 0,
    dy: 0,
    ownerId: null,
    active: true,
  };
  state.bulletPool.push(bullet);
  return bullet;
}

export function returnBulletToPool(bulletId: string): void {
  const bullet = state.activeBullets.get(bulletId);
  if (bullet) {
    bullet.active = false;
    bullet.ownerId = null;
    state.activeBullets.delete(bulletId);

    if (state.bulletIntervals[bulletId]) {
      clearInterval(state.bulletIntervals[bulletId]);
      delete state.bulletIntervals[bulletId];
    }
  }
}

export function generatePlayField(): void {
  for (let row = 0; row < size.row; row++) {
    state.playField[row] = new Array(size.col).fill(0);
  }
}

export function hasLineOfSightToBase(fromX: number, fromY: number, direction: string): boolean {
  const opposite: Record<string, keyof typeof bulletDirections> = {
    bottom: 'top',
    top: 'bottom',
    left: 'right',
    right: 'left',
  };
  const bulletConfig = bulletDirections[opposite[direction]];
  if (!bulletConfig) return false;

  let checkX = fromX;
  let checkY = fromY;

  for (let i = 0; i < 20; i++) {
    checkX += bulletConfig.dx;
    checkY += bulletConfig.dy;

    if (
      state.base.x <= checkX && checkX < state.base.x + 3 &&
      state.base.y <= checkY && checkY < state.base.y + 3
    ) {
      return true;
    }

    for (const wall of state.walls) {
      if (wall.x === checkX && wall.y === checkY) {
        return false;
      }
    }
  }

  return false;
}
