import type { Server } from 'socket.io';
import { GAME_UPDATE_INTERVAL, INVULNERABILITY_TIME } from '@tank/shared';
import type { ClientToServerEvents, GameMode, GameStateSnapshot, ServerToClientEvents, TankFacing } from '@tank/shared';
import { createInitialRoomState, resetPlayField, type RoomState } from './state.js';
import { MapGenerator } from './MapGenerator.js';
import { BulletManager } from './BulletManager.js';
import { PlayerManager } from './PlayerManager.js';
import { BotAI } from './BotAI.js';
import { CoopManager } from './CoopManager.js';
import { PvpBotManager } from './PvpBotManager.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

export class GameRoom {
  readonly state: RoomState;
  readonly map: MapGenerator;
  readonly bullets: BulletManager;
  readonly players: PlayerManager;
  readonly ai: BotAI;
  readonly coop: CoopManager;
  readonly pvpBots: PvpBotManager;

  private coopStarted = false;
  private tickInterval: NodeJS.Timeout;

  constructor(
    readonly id: string,
    readonly mode: GameMode,
    private readonly io: TypedServer,
  ) {
    this.state = createInitialRoomState(mode);
    this.map = new MapGenerator(this.state);
    this.bullets = new BulletManager(this.state, io, id, () => this.players, () => this.coop);
    this.players = new PlayerManager(this.state, io, id, this.bullets);
    this.ai = new BotAI(this.state, this.bullets);
    this.coop = new CoopManager(this.state, io, id, this.ai);
    this.pvpBots = new PvpBotManager(this.state, this.bullets, this.players, this.ai);

    resetPlayField(this.state.playField);

    if (mode === 'coop') {
      this.map.generateCoopMap();
    } else {
      this.map.generatePvPMap();
      this.pvpBots.addPvPBots(3);
    }

    this.tickInterval = setInterval(() => this.tick(), GAME_UPDATE_INTERVAL);
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

    if (this.mode === 'coop' && !this.coopStarted) {
      this.coopStarted = true;
      this.coop.startCoopWave();
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
