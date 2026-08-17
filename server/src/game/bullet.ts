import type { Server } from 'socket.io';
import { BULLET_SPEED, bulletDirections, positionPiece, size } from '@tank/shared';
import type { BulletState, ClientToServerEvents, ServerToClientEvents, TankFacing } from '@tank/shared';
import { state } from '../config/state.js';
import * as helpers from '../utils/helpers.js';
import { boomAnimate } from './player.js';
import { checkCoopDefeat } from './coop.js';

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

export function init(socketIo: Server<ClientToServerEvents, ServerToClientEvents>): void {
  io = socketIo;
}

export function createBullet(playerId: string): void {
  const player = state.players[playerId];
  if (!player || !player.status) return;

  const bulletConfig = bulletDirections[player.position as keyof typeof bulletDirections];
  if (!bulletConfig) return;

  const bulletX = player.x + bulletConfig.offsetX;
  const bulletY = player.y + bulletConfig.offsetY;

  if (bulletX < 0 || bulletX >= size.col || bulletY < 0 || bulletY >= size.row) {
    return;
  }

  for (const wall of state.walls) {
    if (wall.x === bulletX && wall.y === bulletY) {
      return;
    }
  }

  const bullet = helpers.getBulletFromPool();
  bullet.position = player.position;
  bullet.x = bulletX;
  bullet.y = bulletY;
  bullet.direction = bulletConfig.dir;
  bullet.dx = bulletConfig.dx;
  bullet.dy = bulletConfig.dy;
  bullet.ownerId = playerId;

  state.activeBullets.set(bullet.id as string, bullet);

  if (!player.bullets) player.bullets = {};
  player.bullets[bullet.id as string] = bullet;

  const bulletId = bullet.id as string;

  state.bulletIntervals[bulletId] = setInterval(() => {
    if (!bullet.active || !state.players[playerId]) {
      helpers.returnBulletToPool(bulletId);
      return;
    }

    const nextX = bullet.x + bullet.dx;
    const nextY = bullet.y + bullet.dy;

    for (const wall of state.walls) {
      if (wall.x === nextX && wall.y === nextY) {
        helpers.returnBulletToPool(bulletId);
        delete player.bullets[bulletId];
        return;
      }
    }

    bullet.x = nextX;
    bullet.y = nextY;

    if (checkBulletHit(bullet, playerId)) {
      helpers.returnBulletToPool(bulletId);
      if (state.players[playerId] && state.players[playerId].bullets) {
        delete state.players[playerId].bullets[bulletId];
      }
    }
  }, BULLET_SPEED);
}

export function checkBulletHit(bullet: BulletState, shooterId: string): boolean {
  if (bullet.x < 0 || bullet.x >= size.col || bullet.y < 0 || bullet.y >= size.row) {
    return true;
  }

  for (const wall of state.walls) {
    if (wall.x === bullet.x && wall.y === bullet.y) {
      return true;
    }
  }

  if (state.gameMode === 'coop') {
    for (const brick of state.bricks) {
      if (brick.x === bullet.x && brick.y === bullet.y && brick.health > 0) {
        brick.health--;
        if (brick.health <= 0) {
          io?.sockets.emit('brick destroyed', { x: brick.x, y: brick.y });
        }
        return true;
      }
    }

    if (
      state.base.x <= bullet.x && bullet.x < state.base.x + 3 &&
      state.base.y <= bullet.y && bullet.y < state.base.y + 3
    ) {
      state.base.health--;
      io?.sockets.emit('base hit', { health: state.base.health });
      checkCoopDefeat();
      return true;
    }
  }

  const now = Date.now();

  for (const playerId in state.players) {
    if (playerId === shooterId) continue;

    const target = state.players[playerId];
    if (!target.status) continue;

    if (target.invulnerableUntil && now < target.invulnerableUntil) continue;
    if (target.exploding && now < target.explosionEndTime) continue;

    const piece = positionPiece[target.position];
    if (!piece) continue;

    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (piece[y][x] === 1) {
          const cellX = target.x + x;
          const cellY = target.y + y;

          if (bullet.x === cellX && bullet.y === cellY) {
            if (target.position !== 'boomOne' && target.position !== 'boomTwo') {
              state.players[shooterId].score++;
              boomAnimate(playerId);
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

export function checkBulletCollisions(): void {
  const bulletsToRemove: string[] = [];
  const bulletPositions = new Map<string, string>();

  for (const [bulletId, bullet] of state.activeBullets) {
    const posKey = `${bullet.x},${bullet.y}`;
    if (bulletPositions.has(posKey)) {
      bulletsToRemove.push(bulletId);
      bulletsToRemove.push(bulletPositions.get(posKey) as string);
    } else {
      bulletPositions.set(posKey, bulletId);
    }
  }

  for (const bulletId of bulletsToRemove) {
    if (state.activeBullets.has(bulletId)) {
      const bullet = state.activeBullets.get(bulletId);
      if (bullet && bullet.ownerId && state.players[bullet.ownerId]) {
        delete state.players[bullet.ownerId].bullets[bulletId];
      }
      helpers.returnBulletToPool(bulletId);
      if (bullet) io?.sockets.emit('explosion', { x: bullet.x, y: bullet.y });
    }
  }
}

export function checkWallCollision(newX: number, newY: number, position: TankFacing): boolean {
  const playerPiece = positionPiece[position];
  if (!playerPiece) return false;

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (playerPiece[y][x] === 1) {
        const checkX = newX + x;
        const checkY = newY + y;

        if (checkX < 0 || checkX >= size.col || checkY < 0 || checkY >= size.row) {
          return true;
        }

        for (const wall of state.walls) {
          if (wall.x === checkX && wall.y === checkY) {
            return true;
          }
        }

        if (state.gameMode === 'coop') {
          for (const brick of state.bricks) {
            if (brick.x === checkX && brick.y === checkY && brick.health > 0) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}
