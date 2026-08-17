import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'socket.io';
import { GAME_UPDATE_INTERVAL, INVULNERABILITY_TIME } from '@tank/shared';
import type {
  BotDifficulty,
  ChatMessage,
  ClientToServerEvents,
  GameMode,
  GameStateSnapshot,
  MapDefinition,
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
import { resolveConcreteDifficulty, type ConcreteDifficulty } from './difficulty.js';
import { settlePvpDeparture } from '../matches/settle.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const MAX_ROOM_PLAYERS = 8;
const DEFAULT_BOT_FILL_TARGET = 3;
const CHAT_RATE_LIMIT_MS = 800;
const CHAT_MAX_LENGTH = 200;
const CHAT_HISTORY_LIMIT = 50;

export interface GameRoomOptions {
  id: string;
  code: string;
  name: string;
  mode: GameMode;
  visibility: RoomVisibility;
  hostSocketId: string | null;
  isDefault: boolean;
  map: MapDefinition;
  mapName: string;
  botDifficulty?: BotDifficulty;
  botFillTarget?: number;
}

export class GameRoom {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly mode: GameMode;
  readonly visibility: RoomVisibility;
  readonly hostSocketId: string | null;
  readonly isDefault: boolean;
  readonly requestedDifficulty: BotDifficulty;
  readonly botFillTarget: number;
  readonly mapName: string;

  readonly state: RoomState;
  readonly map: MapGenerator;
  readonly bullets: BulletManager;
  readonly players: PlayerManager;
  readonly ai: BotAI;
  readonly coop: CoopManager;
  readonly pvpBots: PvpBotManager;

  status: RoomStatus = 'waiting';
  private readonly tickInterval: NodeJS.Timeout;
  private readonly chatHistory: ChatMessage[] = [];
  private readonly lastChatAt = new Map<string, number>();
  private matchStartedAt = 0;

  constructor(options: GameRoomOptions, private readonly io: TypedServer) {
    this.id = options.id;
    this.code = options.code;
    this.name = options.name;
    this.mode = options.mode;
    this.visibility = options.visibility;
    this.hostSocketId = options.hostSocketId;
    this.isDefault = options.isDefault;
    this.requestedDifficulty = options.botDifficulty ?? 'normal';
    this.botFillTarget = Math.max(0, Math.min(MAX_ROOM_PLAYERS, options.botFillTarget ?? DEFAULT_BOT_FILL_TARGET));
    this.mapName = options.mapName;

    this.state = createInitialRoomState(this.mode);
    this.map = new MapGenerator(this.state);
    this.bullets = new BulletManager(this.state, io, this.id, () => this.players, () => this.coop, (shooter, target) =>
      this.broadcastSystemMessage(`${shooter} eliminated ${target}`),
    );
    this.players = new PlayerManager(this.state, io, this.id, this.bullets);
    this.ai = new BotAI(this.state, this.bullets);
    this.coop = new CoopManager(
      this.state,
      io,
      this.id,
      this.ai,
      () => this.resolveCurrentDifficulty(),
      this.mapName,
      () => this.getMatchDurationSec(),
    );
    this.pvpBots = new PvpBotManager(this.state, this.bullets, this.players, this.ai);

    resetPlayField(this.state.playField);
    this.map.applyMap(options.map, this.mode);

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
    this.matchStartedAt = Date.now();

    if (this.mode === 'coop') {
      this.coop.startCoopWave();
    } else {
      this.maintainBotFill();
    }
  }

  addPlayer(socketId: string, name: string, color: string, rating?: number, userId?: string): void {
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
      rating,
      userId,
    };

    this.broadcastSystemMessage(`${name} joined the battle`);

    if (socketId === this.hostSocketId && this.status === 'waiting') {
      this.startMatch();
    } else if (this.mode === 'pvp' && this.status === 'playing') {
      this.maintainBotFill();
    }
  }

  removePlayer(socketId: string): void {
    const player = this.state.players[socketId];
    if (!player) return;

    if (this.mode === 'pvp' && this.status === 'playing' && !player.isBot && player.userId && typeof player.rating === 'number') {
      const others = Object.values(this.state.players).filter(
        (p) => p !== player && !p.isBot && typeof p.rating === 'number',
      );
      const opponentAvgRating =
        others.length > 0 ? others.reduce((sum, p) => sum + (p.rating as number), 0) / others.length : null;
      const opponentAvgScore = others.length > 0 ? others.reduce((sum, p) => sum + p.score, 0) / others.length : 0;

      void settlePvpDeparture({
        userId: player.userId,
        ratingBefore: player.rating,
        score: player.score,
        opponentAvgScore,
        opponentAvgRating,
        mapName: this.mapName,
        durationSec: this.getMatchDurationSec(),
      });
    }

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

    if (this.mode === 'pvp' && this.status === 'playing' && !player.isBot) {
      this.maintainBotFill();
    }
  }

  // "Adaptive" bots are re-tuned to whatever the room's current human roster
  // looks like — this is intentionally recomputed on every spawn, not cached,
  // so it keeps tracking the room as players come and go.
  resolveCurrentDifficulty(): ConcreteDifficulty {
    const ratings = Object.values(this.state.players)
      .filter((p) => !p.isBot && typeof p.rating === 'number')
      .map((p) => p.rating as number);
    const avg = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;
    return resolveConcreteDifficulty(this.requestedDifficulty, avg);
  }

  private maintainBotFill(): void {
    if (this.mode !== 'pvp') return;

    const players = Object.entries(this.state.players);
    const humanCount = players.filter(([, p]) => !p.isBot).length;
    const botIds = players.filter(([, p]) => p.isBot).map(([id]) => id);
    const total = humanCount + botIds.length;

    if (total < this.botFillTarget) {
      const difficulty = this.resolveCurrentDifficulty();
      for (let i = 0; i < this.botFillTarget - total; i++) {
        this.pvpBots.addBot(difficulty);
      }
    } else if (total > this.botFillTarget && botIds.length > 0) {
      const toRemove = Math.min(botIds.length, total - this.botFillTarget);
      for (const botId of botIds.slice(0, toRemove)) {
        this.removePlayer(botId);
      }
    }
  }

  kick(requestingSocketId: string, targetSocketId: string): boolean {
    if (!this.hostSocketId || requestingSocketId !== this.hostSocketId) return false;
    const target = this.state.players[targetSocketId];
    if (!target) return false;

    this.removePlayer(targetSocketId);
    this.io.to(targetSocketId).emit('room:kicked');
    this.broadcastSystemMessage(`${target.name} was removed by the host`);
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

  getMatchDurationSec(): number {
    return this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0;
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

  sendChat(socketId: string, text: string): void {
    const player = this.state.players[socketId];
    if (!player || player.isBot) return;

    const now = Date.now();
    const last = this.lastChatAt.get(socketId) ?? 0;
    if (now - last < CHAT_RATE_LIMIT_MS) return;

    const trimmed = text.trim().slice(0, CHAT_MAX_LENGTH);
    if (!trimmed) return;

    this.lastChatAt.set(socketId, now);
    this.broadcastChat({ id: uuidv4(), authorName: player.name, text: trimmed, timestamp: now });
  }

  broadcastSystemMessage(text: string): void {
    this.broadcastChat({ id: uuidv4(), authorName: null, text, timestamp: Date.now(), system: true });
  }

  getChatHistory(): ChatMessage[] {
    return this.chatHistory;
  }

  private broadcastChat(message: ChatMessage): void {
    this.chatHistory.push(message);
    if (this.chatHistory.length > CHAT_HISTORY_LIMIT) this.chatHistory.shift();
    this.io.to(this.id).emit('chat:message', message);
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
