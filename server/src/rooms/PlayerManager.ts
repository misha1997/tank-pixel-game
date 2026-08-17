import type { Server } from 'socket.io';
import { COLLISION_CHECK_DISTANCE, INVULNERABILITY_TIME, positionPiece, size } from '@tank/shared';
import type { ClientToServerEvents, PlayerState, ServerToClientEvents, TankFacing } from '@tank/shared';
import type { RoomState } from './state.js';
import { randomInteger } from '../utils/random.js';
import type { BulletManager } from './BulletManager.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const FACINGS: TankFacing[] = ['top', 'left', 'right', 'bottom'];

export class PlayerManager {
  constructor(
    private readonly state: RoomState,
    private readonly io: TypedServer,
    private readonly roomId: string,
    private readonly bullets: BulletManager,
  ) {}

  getSafeSpawnPosition(): { x: number; y: number } {
    const { state } = this;
    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      const x = randomInteger(size.col - 3);
      const y = randomInteger(size.row - 3);

      let inWall = false;
      for (const pos of FACINGS) {
        if (this.bullets.checkWallCollision(x, y, pos)) {
          inWall = true;
          break;
        }
      }
      if (inWall) {
        attempts++;
        continue;
      }

      let isSafe = true;
      for (const playerId in state.players) {
        const player = state.players[playerId];
        if (player.status && Math.abs(player.x - x) < 5 && Math.abs(player.y - y) < 5) {
          isSafe = false;
          break;
        }
      }

      if (isSafe) {
        return { x, y };
      }
      attempts++;
    }

    return { x: randomInteger(size.col - 3), y: randomInteger(size.row - 3) };
  }

  movePlayer(playerId: string, dx: number, dy: number, position: TankFacing): void {
    const { state } = this;
    const player = state.players[playerId];
    if (!player || !player.status) return;

    const now = Date.now();
    if (player.exploding && now < player.explosionEndTime) {
      return;
    }

    const newX = player.x + dx;
    const newY = player.y + dy;

    if (newX < 0 || newX >= size.col - 3 || newY < 0 || newY >= size.row - 3) return;

    if (this.bullets.checkWallCollision(newX, newY, position)) {
      return;
    }

    const collidedPlayer = this.checkPlayerCollision(player, newX, newY, position);
    if (collidedPlayer) {
      const collided = state.players[collidedPlayer];
      if (collided) {
        this.boomAnimate(playerId);
        this.boomAnimate(collidedPlayer);
        this.io.to(this.roomId).emit('collision explosion', {
          x: (player.x + collided.x) / 2,
          y: (player.y + collided.y) / 2,
        });
      }
    } else {
      player.x = newX;
      player.y = newY;
      player.position = position;
    }
  }

  checkPlayerCollision(player: PlayerState, newX: number, newY: number, newPosition: TankFacing): string | null {
    const { state } = this;
    const playerPiece = positionPiece[newPosition];
    if (!playerPiece) return null;

    const now = Date.now();

    if (player.exploding && now < player.explosionEndTime) return null;

    for (const playerId in state.players) {
      const otherPlayer = state.players[playerId];
      if (otherPlayer === player || !otherPlayer.status) continue;

      if (state.gameMode === 'coop' && !player.isBot && !otherPlayer.isBot) continue;

      if (otherPlayer.exploding && now < otherPlayer.explosionEndTime) continue;

      const playerInvulnerable = player.invulnerableUntil && now < player.invulnerableUntil;
      const otherInvulnerable = otherPlayer.invulnerableUntil && now < otherPlayer.invulnerableUntil;

      if (playerInvulnerable || otherInvulnerable) continue;

      const distance = Math.abs(newX - otherPlayer.x) + Math.abs(newY - otherPlayer.y);
      if (distance > COLLISION_CHECK_DISTANCE) continue;

      if (this.checkDetailedCollision(playerPiece, newX, newY, otherPlayer)) {
        return playerId;
      }
    }
    return null;
  }

  checkDetailedCollision(playerPiece: number[][], newX: number, newY: number, otherPlayer: PlayerState): boolean {
    const otherPiece = positionPiece[otherPlayer.position];
    if (!otherPiece) return false;

    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (playerPiece[y][x] !== 1) continue;

        const checkX = newX + x;
        const checkY = newY + y;

        const startX = Math.max(0, checkX - otherPlayer.x);
        const endX = Math.min(3, checkX - otherPlayer.x + 1);
        const startY = Math.max(0, checkY - otherPlayer.y);
        const endY = Math.min(3, checkY - otherPlayer.y + 1);

        for (let oy = startY; oy < endY; oy++) {
          for (let ox = startX; ox < endX; ox++) {
            if (otherPiece[oy][ox] === 1) {
              const otherX = otherPlayer.x + ox;
              const otherY = otherPlayer.y + oy;
              if (checkX === otherX && checkY === otherY) {
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  boomAnimate(playerId: string): void {
    const { state } = this;
    const player = state.players[playerId];
    if (!player || !player.status) return;

    const now = Date.now();
    const explosionDuration = 600;

    player.exploding = true;
    player.explosionEndTime = now + explosionDuration;

    this.io.to(this.roomId).emit('user dead sound');

    player.position = 'boomOne';
    setTimeout(() => {
      if (state.players[playerId]) state.players[playerId].position = 'boomTwo';
    }, 200);
    setTimeout(() => {
      if (state.players[playerId]) state.players[playerId].position = 'boomOne';
    }, 400);
    setTimeout(() => {
      if (state.players[playerId]) {
        state.players[playerId].status = false;
        state.players[playerId].exploding = false;
        this.io.to(this.roomId).emit('user dead', playerId);
      }
    }, explosionDuration);
  }

  restartPlayer(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    const spawnPos = this.getSafeSpawnPosition();

    player.status = true;
    player.x = spawnPos.x;
    player.y = spawnPos.y;
    player.position = FACINGS[randomInteger(4)];
    player.bullets = {};
    player.lastShot = 0;
    player.invulnerableUntil = Date.now() + INVULNERABILITY_TIME;
    player.exploding = false;
    player.explosionEndTime = 0;
    player.respawnShootingCooldown = Date.now() + 2000;

    if (!player.isBot) {
      player.score = 0;
    }
  }

  applyPlayerToField(player: PlayerState): void {
    const { state } = this;
    const piece = positionPiece[player.position];
    if (!piece) return;

    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (piece[y][x] === 1 && player.status) {
          const posX = player.x + x;
          const posY = player.y + y;

          if (posX >= 0 && posX < size.col && posY >= 0 && posY < size.row) {
            state.playField[posY][posX] = 1;
          }
        }
      }
    }
  }
}
