import type { Server } from 'socket.io';
import {
  BULLET_COOLDOWN,
  BULLET_POOL_SIZE,
  BULLET_SPEED,
  RAPID_FIRE_COOLDOWN,
  SPREAD_COOLDOWN_MULTIPLIER,
  bulletDirections,
  positionPiece,
  size,
} from '@tank/shared';
import type {
  BulletDirectionConfig,
  BulletState,
  ClientToServerEvents,
  PlayerState,
  ServerToClientEvents,
  TankFacing,
} from '@tank/shared';
import type { RoomState } from './state.js';
import { cellKey } from './state.js';
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
    private readonly notifyKill: (shooterName: string, targetName: string) => void,
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

    // Authoritative rate-limit — mirrors what bots already self-impose, but
    // for humans this used to be enforced client-side only (trivially
    // bypassable by any client that doesn't go through our own UI). Bots
    // must NOT also set player.lastShot before calling this — this is the
    // sole owner of that field, or every bot shot self-rejects (see the
    // rapid-fire regression this fixed).
    const now = Date.now();
    if (now < player.respawnShootingCooldown) return;
    const weapon = player.weapon ?? 'cannon';
    const baseCooldown =
      player.rapidFireUntil && now < player.rapidFireUntil ? RAPID_FIRE_COOLDOWN : BULLET_COOLDOWN;
    const cooldown = weapon === 'spread' ? baseCooldown * SPREAD_COOLDOWN_MULTIPLIER : baseCooldown;
    if (now - player.lastShot < cooldown) return;

    const bulletConfig = bulletDirections[player.position as keyof typeof bulletDirections];
    if (!bulletConfig) return;

    player.lastShot = now;

    if (weapon === 'spread') {
      // Three parallel bullets, offset along the axis perpendicular to
      // travel — dx===0 means travel is vertical, so the perpendicular
      // spread is along x, and vice versa.
      const perpX = bulletConfig.dx === 0 ? 1 : 0;
      const perpY = bulletConfig.dy === 0 ? 1 : 0;
      for (const spread of [-1, 0, 1]) {
        this.spawnBullet(playerId, player, bulletConfig, spread * perpX, spread * perpY);
      }
    } else {
      this.spawnBullet(playerId, player, bulletConfig, 0, 0);
    }
  }

  private spawnBullet(
    playerId: string,
    player: PlayerState,
    bulletConfig: BulletDirectionConfig,
    extraOffsetX: number,
    extraOffsetY: number,
  ): void {
    const { state } = this;
    const bulletX = player.x + bulletConfig.offsetX + extraOffsetX;
    const bulletY = player.y + bulletConfig.offsetY + extraOffsetY;

    if (bulletX < 0 || bulletX >= size.col || bulletY < 0 || bulletY >= size.row) {
      return;
    }

    if (state.wallCells.has(cellKey(bulletX, bulletY))) {
      return;
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

      if (state.wallCells.has(cellKey(nextX, nextY))) {
        this.returnBulletToPool(bulletId);
        delete player.bullets[bulletId];
        return;
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

    if (state.wallCells.has(cellKey(bullet.x, bullet.y))) {
      return true;
    }

    if (state.gameMode === 'coop') {
      const brick = state.brickCells.get(cellKey(bullet.x, bullet.y));
      if (brick) {
        brick.health--;
        if (brick.health <= 0) {
          state.brickCells.delete(cellKey(brick.x, brick.y));
          this.io.to(this.roomId).emit('brick destroyed', { x: brick.x, y: brick.y });
        }
        return true;
      }

      if (
        state.base.x <= bullet.x &&
        bullet.x < state.base.x + 3 &&
        state.base.y <= bullet.y &&
        bullet.y < state.base.y + 3
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
                this.notifyKill(state.players[shooterId].name, target.name);
                this.io.to(playerId).emit('killed by', shooterId);
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

          if (state.wallCells.has(cellKey(checkX, checkY))) {
            return true;
          }

          if (state.gameMode === 'coop' && state.brickCells.has(cellKey(checkX, checkY))) {
            return true;
          }
        }
      }
    }

    return false;
  }
}
