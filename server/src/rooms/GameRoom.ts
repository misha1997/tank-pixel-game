import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'socket.io';
import { GAME_UPDATE_INTERVAL, INVULNERABILITY_TIME, size } from '@tank/shared';
import type {
  ArenaLayout,
  BotDifficulty,
  ChatMessage,
  ClientToServerEvents,
  GameMode,
  GameStateSnapshot,
  MapCell,
  MapDefinition,
  PlayerSnapshot,
  RoomPlayerInfo,
  RoomStatus,
  RoomSummary,
  RoomVisibility,
  ServerToClientEvents,
  TankFacing,
} from '@tank/shared';
import { createInitialRoomState, type RoomState } from './state.js';
import { MapGenerator } from './MapGenerator.js';
import { BulletManager } from './BulletManager.js';
import { PlayerManager } from './PlayerManager.js';
import { BotAI } from './BotAI.js';
import { CoopManager } from './CoopManager.js';
import { PvpBotManager } from './PvpBotManager.js';
import { resolveConcreteDifficulty, type ConcreteDifficulty } from './difficulty.js';
import { settlePvpDeparture } from '../matches/settle.js';
import { resolveMap } from '../maps/resolve.js';
import { prisma } from '../db/prisma.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const MAX_ROOM_PLAYERS = 8;
const DEFAULT_BOT_FILL_TARGET = 3;
const VALID_BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard', 'adaptive'];
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
  mapId: string;
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
  requestedDifficulty: BotDifficulty;
  botFillTarget: number;
  mapName: string;
  currentMapId: string;

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

  constructor(
    options: GameRoomOptions,
    private readonly io: TypedServer,
  ) {
    this.id = options.id;
    this.code = options.code;
    this.name = options.name;
    this.mode = options.mode;
    this.visibility = options.visibility;
    this.hostSocketId = options.hostSocketId;
    this.isDefault = options.isDefault;
    this.requestedDifficulty = options.botDifficulty ?? 'normal';
    this.botFillTarget = Math.max(
      0,
      Math.min(MAX_ROOM_PLAYERS, options.botFillTarget ?? DEFAULT_BOT_FILL_TARGET),
    );
    this.mapName = options.mapName;
    this.currentMapId = options.mapId;

    this.state = createInitialRoomState(this.mode);
    this.map = new MapGenerator(this.state);
    this.bullets = new BulletManager(
      this.state,
      io,
      this.id,
      () => this.players,
      () => this.coop,
      (shooter, target) => this.broadcastSystemMessage(`${shooter} eliminated ${target}`),
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
    const spawnPos = this.players.getSafeSpawnPosition();

    this.state.players[socketId] = {
      name,
      color,
      status: true,
      isBot: false,
      x: spawnPos.x,
      y: spawnPos.y,
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

    if (
      this.mode === 'pvp' &&
      this.status === 'playing' &&
      !player.isBot &&
      player.userId &&
      typeof player.rating === 'number'
    ) {
      const others = Object.values(this.state.players).filter(
        (p) => p !== player && !p.isBot && typeof p.rating === 'number',
      );
      const opponentAvgRating =
        others.length > 0
          ? others.reduce((sum, p) => sum + (p.rating as number), 0) / others.length
          : null;
      const opponentAvgScore =
        others.length > 0 ? others.reduce((sum, p) => sum + p.score, 0) / others.length : 0;

      // Unguarded, this would be an unhandled promise rejection on any DB
      // hiccup — which crashes the whole process, not just this request.
      settlePvpDeparture({
        userId: player.userId,
        ratingBefore: player.rating,
        score: player.score,
        opponentAvgScore,
        opponentAvgRating,
        mapName: this.mapName,
        durationSec: this.getMatchDurationSec(),
      }).catch((err) => console.error('Failed to settle PvP departure', err));
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

  // Host-triggered rematch: tears down the current round (bots, bullets,
  // board) and starts a fresh one with new map/bot settings. Human players
  // stay connected and simply respawn — see client/src/settingsModal.ts.
  async reconfigure(
    requesterSocketId: string,
    settings: { mapId?: string; botDifficulty?: BotDifficulty; botFillTarget?: number },
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!this.hostSocketId || requesterSocketId !== this.hostSocketId) {
      return { ok: false, error: 'Only the host can change room settings.' };
    }

    // Validate before touching any state — an unknown difficulty would make
    // getDifficultyProfile() return undefined and throw inside bot spawning,
    // wedging PvP rooms half-reconfigured or looping in coop wave spawns.
    if (
      settings.botDifficulty !== undefined &&
      !VALID_BOT_DIFFICULTIES.includes(settings.botDifficulty)
    ) {
      return { ok: false, error: 'Invalid bot difficulty.' };
    }

    const resolved = await resolveMap(this.mode, settings.mapId ?? this.currentMapId);
    const { state } = this;

    for (const [socketId, player] of Object.entries(state.players)) {
      if (!player.isBot) continue;
      if (player.bullets) {
        for (const bulletId in player.bullets) this.bullets.returnBulletToPool(bulletId);
      }
      if (state.botIntervals[socketId]) {
        clearInterval(state.botIntervals[socketId]);
        delete state.botIntervals[socketId];
      }
      delete state.players[socketId];
      delete state.botMemory[socketId];
    }
    state.coopBotCount = 0;
    if (state.waveSpawnInterval) {
      clearInterval(state.waveSpawnInterval);
      state.waveSpawnInterval = null;
    }

    this.map.applyMap(resolved.definition, this.mode);

    this.mapName = resolved.name;
    this.currentMapId = resolved.id;
    if (settings.botDifficulty) this.requestedDifficulty = settings.botDifficulty;
    if (typeof settings.botFillTarget === 'number') {
      this.botFillTarget = Math.max(0, Math.min(MAX_ROOM_PLAYERS, settings.botFillTarget));
    }

    // Symmetry with the bot teardown above: drop human players' in-flight
    // bullets so respawns start from a clean field.
    for (const player of Object.values(state.players)) {
      for (const bulletId in player.bullets ?? {}) {
        this.bullets.returnBulletToPool(bulletId);
      }
    }

    for (const socketId of Object.keys(state.players)) {
      this.players.restartPlayer(socketId);
    }

    this.matchStartedAt = Date.now();
    this.coop.setMapName(this.mapName);

    if (this.status === 'playing') {
      if (this.mode === 'coop') {
        this.coop.startCoopWave();
      } else {
        this.maintainBotFill();
      }
    } else {
      // Host reconfigured before spawning themselves: formally start the
      // match so bots/enemies don't run inside a zero-player waiting room.
      this.startMatch();
    }

    // New map layout — everyone (players and spectators) needs the fresh
    // static arena.
    this.broadcastArena();

    this.broadcastSystemMessage('Host started a new match with updated settings.');
    return { ok: true };
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

  // Static match layout for the wire: walls never change mid-match, and the
  // brick list is "alive as of right now" — later destructions stream via the
  // 'brick destroyed' event, which clients apply to their copy of this array.
  getArenaLayout(): ArenaLayout {
    const { state } = this;
    return {
      walls: state.walls.map((wall) => ({ x: wall.x, y: wall.y, type: 'wall' as const })),
      bricks:
        state.gameMode === 'coop'
          ? state.bricks
              .filter((brick) => brick.health > 0)
              .map((brick) => ({
                x: brick.x,
                y: brick.y,
                type: 'brick' as const,
                health: brick.health,
              }))
          : [],
    };
  }

  broadcastArena(): void {
    this.io.to(this.id).emit('arena', this.getArenaLayout());
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
      mapId: this.currentMapId,
      botDifficulty: this.requestedDifficulty,
      botFillTarget: this.botFillTarget,
    };
  }

  roster(): RoomPlayerInfo[] {
    return Object.entries(this.state.players)
      .filter(([, player]) => !player.isBot)
      .map(([socketId, player]) => ({
        socketId,
        name: player.name,
        isHost: socketId === this.hostSocketId,
      }));
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
    this.broadcastChat(
      { id: uuidv4(), authorName: player.name, text: trimmed, timestamp: now },
      player.userId,
    );
  }

  broadcastSystemMessage(text: string): void {
    this.broadcastChat({
      id: uuidv4(),
      authorName: null,
      text,
      timestamp: Date.now(),
      system: true,
    });
  }

  getChatHistory(): ChatMessage[] {
    return this.chatHistory;
  }

  private broadcastChat(message: ChatMessage, authorId?: string): void {
    this.chatHistory.push(message);
    if (this.chatHistory.length > CHAT_HISTORY_LIMIT) this.chatHistory.shift();
    this.io.to(this.id).emit('chat:message', message);

    // Fire-and-forget: a DB hiccup must not take down live chat, and an
    // unhandled rejection here would crash the whole process.
    prisma.chatMessage
      .create({
        data: {
          roomId: this.id,
          authorId: authorId ?? null,
          authorName: message.authorName,
          text: message.text,
          system: !!message.system,
        },
      })
      .catch((err) => console.error('Failed to persist chat message', err));
  }

  destroy(): void {
    clearInterval(this.tickInterval);
    if (this.state.waveSpawnInterval) clearInterval(this.state.waveSpawnInterval);
    for (const id in this.state.botIntervals) clearInterval(this.state.botIntervals[id]);
    for (const id in this.state.bulletIntervals) clearInterval(this.state.bulletIntervals[id]);
  }

  private tick(): void {
    const { state } = this;

    if (this.playerCount() === 0) return;

    // Bullet cells are collected BEFORE checkBulletCollisions() so a snapshot
    // still shows bullets that annihilate each other this tick — the old
    // playField matrix had the same one-tick visibility, and the death
    // animation depends on it.
    const bulletCells: MapCell[] = [];
    for (const playerId in state.players) {
      const player = state.players[playerId];
      if (!player?.bullets) continue;
      for (const bulletId in player.bullets) {
        const bullet = player.bullets[bulletId];
        if (
          bullet &&
          bullet.x >= 0 &&
          bullet.x < size.col &&
          bullet.y >= 0 &&
          bullet.y < size.row
        ) {
          bulletCells.push({ x: bullet.x, y: bullet.y });
        }
      }
    }

    if (state.activeBullets.size > 0) {
      this.bullets.checkBulletCollisions();
    }

    const players: Record<string, PlayerSnapshot> = {};
    for (const playerId in state.players) {
      const player = state.players[playerId];
      if (!player) continue;
      players[playerId] = {
        name: player.name,
        color: player.color,
        status: player.status,
        isBot: player.isBot,
        isCoopEnemy: player.isCoopEnemy,
        x: player.x,
        y: player.y,
        position: player.position,
        score: player.score,
        invulnerableUntil: player.invulnerableUntil,
        exploding: player.exploding,
        explosionEndTime: player.explosionEndTime,
        respawnShootingCooldown: player.respawnShootingCooldown,
        lives: player.lives,
      };
    }

    const snapshot: GameStateSnapshot = {
      players,
      bulletCells,
      gameMode: state.gameMode,
      gameState: state.gameState,
    };

    if (state.gameMode === 'coop') {
      snapshot.base = state.base;
      snapshot.wave = state.coopWave;
      snapshot.enemiesRemaining = state.enemiesToSpawn;
      snapshot.enemiesKilled = state.enemiesKilled;
    }

    this.io.to(this.id).emit('state', snapshot);
  }
}
