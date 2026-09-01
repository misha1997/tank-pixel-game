import type { Server } from 'socket.io';
import {
  POWERUP_MAX_ACTIVE,
  POWERUP_SPAWN_INTERVAL,
  RAPID_FIRE_DURATION,
  SHIELD_DURATION,
  size,
} from '@tank/shared';
import type {
  ClientToServerEvents,
  PlayerState,
  PowerUpState,
  PowerUpType,
  ServerToClientEvents,
} from '@tank/shared';
import type { RoomState } from './state.js';
import { cellKey } from './state.js';
import { randomInteger } from '../utils/random.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const POWERUP_TYPES: readonly PowerUpType[] = ['shield', 'rapidFire'];

export class PowerUpManager {
  private readonly active = new Map<string, PowerUpState>();
  private idCounter = 0;
  private lastSpawnAt = 0;

  constructor(
    private readonly state: RoomState,
    private readonly io: TypedServer,
    private readonly roomId: string,
  ) {}

  tick(): void {
    const now = Date.now();
    if (this.active.size < POWERUP_MAX_ACTIVE && now - this.lastSpawnAt > POWERUP_SPAWN_INTERVAL) {
      this.lastSpawnAt = now;
      this.trySpawn();
    }
    this.checkPickups();
  }

  // Torn down between matches (reconfigure/rematch) so a stale power-up
  // from the previous map doesn't carry over.
  reset(): void {
    this.active.clear();
    this.lastSpawnAt = 0;
  }

  private trySpawn(): void {
    const cell = this.findOpenCell();
    if (!cell) return;

    const type = POWERUP_TYPES[randomInteger(POWERUP_TYPES.length)];
    const powerUp: PowerUpState = { id: `pu_${++this.idCounter}`, type, x: cell.x, y: cell.y };
    this.active.set(powerUp.id, powerUp);
    this.io.to(this.roomId).emit('powerup:spawned', powerUp);
  }

  private findOpenCell(): { x: number; y: number } | null {
    const bounds = this.state.mapBounds;
    const minX = bounds?.minX ?? 0;
    const minY = bounds?.minY ?? 0;
    const spanX = (bounds ? bounds.maxX - bounds.minX : size.col - 3) + 1;
    const spanY = (bounds ? bounds.maxY - bounds.minY : size.row - 3) + 1;

    for (let attempt = 0; attempt < 30; attempt++) {
      const x = minX + randomInteger(spanX);
      const y = minY + randomInteger(spanY);
      if (this.isFootprintFree(x, y)) return { x, y };
    }
    return null;
  }

  private isFootprintFree(x: number, y: number): boolean {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const key = cellKey(x + dx, y + dy);
        if (this.state.wallCells.has(key)) return false;
        if (this.state.brickCells.has(key)) return false;
      }
    }
    for (const powerUp of this.active.values()) {
      if (Math.abs(powerUp.x - x) < 3 && Math.abs(powerUp.y - y) < 3) return false;
    }
    return true;
  }

  private checkPickups(): void {
    for (const [id, powerUp] of this.active) {
      const collector = this.findCollector(powerUp);
      if (!collector) continue;

      this.applyEffect(collector.player, powerUp.type);
      this.active.delete(id);
      this.io
        .to(this.roomId)
        .emit('powerup:collected', { id, type: powerUp.type, playerId: collector.id });
    }
  }

  // Coop attackers never pick up power-ups meant for the defenders; in PvP
  // every player (human or fill-bot) is eligible equally.
  private findCollector(powerUp: PowerUpState): { id: string; player: PlayerState } | null {
    for (const playerId in this.state.players) {
      const player = this.state.players[playerId];
      if (!player.status || player.isCoopEnemy) continue;
      if (
        powerUp.x >= player.x &&
        powerUp.x < player.x + 3 &&
        powerUp.y >= player.y &&
        powerUp.y < player.y + 3
      ) {
        return { id: playerId, player };
      }
    }
    return null;
  }

  private applyEffect(player: PlayerState, type: PowerUpType): void {
    const now = Date.now();
    if (type === 'shield') {
      player.invulnerableUntil = Math.max(player.invulnerableUntil, now) + SHIELD_DURATION;
    } else {
      player.rapidFireUntil = Math.max(player.rapidFireUntil ?? 0, now) + RAPID_FIRE_DURATION;
    }
  }
}
