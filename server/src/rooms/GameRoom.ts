import type { Server } from 'socket.io';
import { GAME_UPDATE_INTERVAL, INVULNERABILITY_TIME } from '@tank/shared';
import type {
  ClientToServerEvents,
  GameMode,
  GameStateSnapshot,
  RoomPlayerInfo,
  RoomStatus,
  RoomSummary,
  RoomVisibility,
  ServerToClientEvents,
  TankFacing,
} from '@tank/shared';
import { createInitialRoomState, resetPlayField, type RoomState } from './state.js';
import { MapGenerator } from './MapGenerator.js';
import { BulletManager } from './BulletManager.js';
import { PlayerManager } from './PlayerManager.js';
import { BotAI } from './BotAI.js';
import { CoopManager } from './CoopManager.js';
import { PvpBotManager } from './PvpBotManager.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const MAX_ROOM_PLAYERS = 8;

export interface GameRoomOptions {
  id: string;
  code: string;
  name: string;
  mode: GameMode;
  visibility: RoomVisibility;
  hostSocketId: string | null;
  isDefault: boolean;
}

export class GameRoom {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly mode: GameMode;
  readonly visibility: RoomVisibility;
  readonly hostSocketId: string | null;
  readonly isDefault: boolean;

  readonly state: RoomState;
  readonly map: MapGenerator;
  readonly bullets: BulletManager;
  readonly players: PlayerManager;
  readonly ai: BotAI;
  readonly coop: CoopManager;
  readonly pvpBots: PvpBotManager;

  status: RoomStatus = 'waiting';
  private readonly tickInterval: NodeJS.Timeout;

  constructor(options: GameRoomOptions, private readonly io: TypedServer) {
    this.id = options.id;
    this.code = options.code;
    this.name = options.name;
    this.mode = options.mode;
    this.visibility = options.visibility;
    this.hostSocketId = options.hostSocketId;
    this.isDefault = options.isDefault;

    this.state = createInitialRoomState(this.mode);
    this.map = new MapGenerator(this.state);
    this.bullets = new BulletManager(this.state, io, this.id, () => this.players, () => this.coop);
    this.players = new PlayerManager(this.state, io, this.id, this.bullets);
    this.ai = new BotAI(this.state, this.bullets);
    this.coop = new CoopManager(this.state, io, this.id, this.ai);
    this.pvpBots = new PvpBotManager(this.state, this.bullets, this.players, this.ai);

    resetPlayField(this.state.playField);

    if (this.mode === 'coop') {
      this.map.generateCoopMap();
    } else {
      this.map.generatePvPMap();
    }

    this.tickInterval = setInterval(() => this.tick(), GAME_UPDATE_INTERVAL);

    // Default quick-play rooms have no host to wait for — action starts immediately.
    if (this.isDefault) {
      this.startMatch();
    }
  }

  // Bots start fighting / the coop wave begins only once the match is started —
  // either automatically (default rooms) or when the host joins their own room.
  startMatch(): void {
    if (this.status === 'playing') return;
    this.status = 'playing';

    if (this.mode === 'coop') {
      this.coop.startCoopWave();
    } else {
      this.pvpBots.addPvPBots(3);
    }
  }

  addPlayer(socketId: string, name: string, color: string): void {
    this.state.players[socketId] = {
      name,
      color,
      status: true,
      isBot: false,
      x: 3,
      y: 3,
      position: 'bottom',
      bullets: {},
      score: 0,
      lastShot: 0,
      invulnerableUntil: Date.now() + INVULNERABILITY_TIME,
      exploding: false,
      explosionEndTime: 0,
      respawnShootingCooldown: Date.now() + 2000,
    };

    if (socketId === this.hostSocketId && this.status === 'waiting') {
      this.startMatch();
    }
  }

  removePlayer(socketId: string): void {
    const player = this.state.players[socketId];
    if (!player) return;

    if (player.bullets) {
      for (const bulletId in player.bullets) {
        this.bullets.returnBulletToPool(bulletId);
      }
    }

    if (this.state.botIntervals[socketId]) {
      clearInterval(this.state.botIntervals[socketId]);
      delete this.state.botIntervals[socketId];
    }

    delete this.state.players[socketId];
    delete this.state.botMemory[socketId];
  }

  kick(requestingSocketId: string, targetSocketId: string): boolean {
    if (!this.hostSocketId || requestingSocketId !== this.hostSocketId) return false;
    if (!this.state.players[targetSocketId]) return false;

    this.removePlayer(targetSocketId);
    this.io.to(targetSocketId).emit('room:kicked');
    return true;
  }

  move(socketId: string, dx: number, dy: number, position: TankFacing): void {
    this.players.movePlayer(socketId, dx, dy, position);
  }

  shoot(socketId: string): void {
    this.bullets.createBullet(socketId);
  }

  restart(socketId: string): void {
    if (this.state.players[socketId]) {
      this.players.restartPlayer(socketId);
    }
  }

  playerCount(): number {
    return Object.keys(this.state.players).length;
  }

  humanPlayerCount(): number {
    return Object.values(this.state.players).filter((p) => !p.isBot).length;
  }

  isEmpty(): boolean {
    return this.humanPlayerCount() === 0;
  }

  toSummary(): RoomSummary {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      mode: this.mode,
      visibility: this.visibility,
      status: this.status,
      playerCount: this.humanPlayerCount(),
      maxPlayers: MAX_ROOM_PLAYERS,
    };
  }

  roster(): RoomPlayerInfo[] {
    return Object.entries(this.state.players)
      .filter(([, player]) => !player.isBot)
      .map(([socketId, player]) => ({ socketId, name: player.name, isHost: socketId === this.hostSocketId }));
  }

  destroy(): void {
    clearInterval(this.tickInterval);
    if (this.state.waveSpawnInterval) clearInterval(this.state.waveSpawnInterval);
    for (const id in this.state.botIntervals) clearInterval(this.state.botIntervals[id]);
    for (const id in this.state.bulletIntervals) clearInterval(this.state.bulletIntervals[id]);
  }

  private tick(): void {
    const { state } = this;
    const now = Date.now();

    if (now - state.lastGameUpdate < GAME_UPDATE_INTERVAL) {
      return;
    }
    state.lastGameUpdate = now;

    if (this.playerCount() === 0) return;

    resetPlayField(state.playField);

    for (const playerId in state.players) {
      const player = state.players[playerId];
      if (player && player.status) {
        this.players.applyPlayerToField(player);
      }

      if (player && player.bullets) {
        for (const bulletId in player.bullets) {
          const bullet = player.bullets[bulletId];
          if (
            bullet && bullet.x >= 0 && bullet.x < state.playField[0]?.length &&
            bullet.y >= 0 && bullet.y < state.playField.length
          ) {
            state.playField[bullet.y][bullet.x] = 1;
          }
        }
      }
    }

    if (state.activeBullets.size > 0) {
      this.bullets.checkBulletCollisions();
    }

    const snapshot: GameStateSnapshot = {
      playField: state.playField,
      players: state.players,
      walls: state.walls,
      gameMode: state.gameMode,
      gameState: state.gameState,
    };

    if (state.gameMode === 'coop') {
      snapshot.bricks = state.bricks;
      snapshot.base = state.base;
      snapshot.wave = state.coopWave;
      snapshot.enemiesRemaining = state.enemiesToSpawn;
      snapshot.enemiesKilled = state.enemiesKilled;
    }

    this.io.to(this.id).emit('state', snapshot);
  }
}
