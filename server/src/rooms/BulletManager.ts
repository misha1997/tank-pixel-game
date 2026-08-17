import type { Server } from 'socket.io';
import { BULLET_POOL_SIZE, BULLET_SPEED, bulletDirections, positionPiece, size } from '@tank/shared';
import type { BulletState, ClientToServerEvents, ServerToClientEvents, TankFacing } from '@tank/shared';
import type { RoomState } from './state.js';
import type { PlayerManager } from './PlayerManager.js';
import type { CoopManager } from './CoopManager.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

export class BulletManager {
  constructor(
    private readonly state: RoomState,
    private readonly io: TypedServer,
    private readonly roomId: string,
    private readonly getPlayers: () => PlayerManager,
    private readonly getCoop: () => CoopManager,
  ) {
    this.initializePool();
  }

  private initializePool(): void {
    for (let i = 0; i < BULLET_POOL_SIZE; i++) {
      this.state.bulletPool.push({
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

  private getBulletFromPool(): BulletState {
    for (const bullet of this.state.bulletPool) {
      if (!bullet.active) {
        bullet.active = true;
        bullet.id = `bullet_${++this.state.bulletIdCounter}`;
        return bullet;
      }
    }
    const bullet: BulletState = {
      id: `bullet_${++this.state.bulletIdCounter}`,
      position: null,
      x: 0,
      y: 0,
      direction: null,
      dx: 0,
      dy: 0,
      ownerId: null,
      active: true,
    };
    this.state.bulletPool.push(bullet);
    return bullet;
  }

  returnBulletToPool(bulletId: string): void {
    const bullet = this.state.activeBullets.get(bulletId);
    if (bullet) {
      bullet.active = false;
      bullet.ownerId = null;
      this.state.activeBullets.delete(bulletId);

      if (this.state.bulletIntervals[bulletId]) {
        clearInterval(this.state.bulletIntervals[bulletId]);
        delete this.state.bulletIntervals[bulletId];
      }
    }
  }

  createBullet(playerId: string): void {
    const { state } = this;
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

    const bullet = this.getBulletFromPool();
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
        this.returnBulletToPool(bulletId);
        return;
      }

      const nextX = bullet.x + bullet.dx;
      const nextY = bullet.y + bullet.dy;

      for (const wall of state.walls) {
        if (wall.x === nextX && wall.y === nextY) {
          this.returnBulletToPool(bulletId);
          delete player.bullets[bulletId];
          return;
        }
      }

      bullet.x = nextX;
      bullet.y = nextY;

      if (this.checkBulletHit(bullet, playerId)) {
        this.returnBulletToPool(bulletId);
        if (state.players[playerId] && state.players[playerId].bullets) {
          delete state.players[playerId].bullets[bulletId];
        }
      }
    }, BULLET_SPEED);
  }

  checkBulletHit(bullet: BulletState, shooterId: string): boolean {
    const { state } = this;

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
            this.io.to(this.roomId).emit('brick destroyed', { x: brick.x, y: brick.y });
          }
          return true;
        }
      }

      if (
        state.base.x <= bullet.x && bullet.x < state.base.x + 3 &&
        state.base.y <= bullet.y && bullet.y < state.base.y + 3
      ) {
        state.base.health--;
        this.io.to(this.roomId).emit('base hit', { health: state.base.health });
        this.getCoop().checkCoopDefeat();
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
                this.getPlayers().boomAnimate(playerId);
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  }

  checkBulletCollisions(): void {
    const { state } = this;
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
        this.returnBulletToPool(bulletId);
        if (bullet) this.io.to(this.roomId).emit('explosion', { x: bullet.x, y: bullet.y });
      }
    }
  }

  checkWallCollision(newX: number, newY: number, position: TankFacing): boolean {
    const { state } = this;
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
}
