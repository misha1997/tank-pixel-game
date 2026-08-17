import { size } from '@tank/shared';
import type {
  BaseState,
  BrickState,
  BulletState,
  GameMode,
  MatchState,
  PlayerState,
  WallState,
} from '@tank/shared';

export interface BotMemory {
  lastPositions?: { x: number; y: number }[];
  positions?: { x: number; y: number; time: number }[];
  lastPosUpdate?: number;
  stuckCounter?: number;
  lastDodge?: number;
  lastMemoryUpdate?: number;
  aggressionLevel?: number;
  dangerZones?: unknown[];
  lastCollisionAvoidance?: number;
  attackTargetPos?: 'left' | 'right' | 'top';
  targetPlayer?: string;
  lastMove?: { dx: number; dy: number; pos: string };
  lastTarget?: { x: number; y: number };
  target?: string;
}

// Per-room mutable game data. One instance per GameRoom — this is what used to be
// the process-wide singleton in config/state.js before the multi-room rework.
export interface RoomState {
  players: Record<string, PlayerState>;
  playField: number[][];
  bulletIntervals: Record<string, NodeJS.Timeout>;
  botIntervals: Record<string, NodeJS.Timeout>;
  botMemory: Record<string, BotMemory>;

  gameMode: GameMode;
  gameState: MatchState;

  bricks: BrickState[];
  base: BaseState;
  coopWave: number;
  enemiesToSpawn: number;
  enemiesKilled: number;
  totalEnemiesInWave: number;
  waveSpawnInterval: NodeJS.Timeout | null;
  coopBotCount: number;

  bulletPool: BulletState[];
  activeBullets: Map<string, BulletState>;
  bulletIdCounter: number;
  lastGameUpdate: number;

  walls: WallState[];
}

export function createInitialRoomState(mode: GameMode): RoomState {
  return {
    players: {},
    playField: [],
    bulletIntervals: {},
    botIntervals: {},
    botMemory: {},

    gameMode: mode,
    gameState: 'waiting',

    bricks: [],
    base: { x: 24, y: 26, type: 'base', health: 1 },
    coopWave: 1,
    enemiesToSpawn: 0,
    enemiesKilled: 0,
    totalEnemiesInWave: 0,
    waveSpawnInterval: null,
    coopBotCount: 0,

    bulletPool: [],
    activeBullets: new Map(),
    bulletIdCounter: 0,
    lastGameUpdate: 0,

    walls: [],
  };
}

export function resetPlayField(playField: number[][]): void {
  for (let row = 0; row < size.row; row++) {
    playField[row] = new Array(size.col).fill(0);
  }
}
