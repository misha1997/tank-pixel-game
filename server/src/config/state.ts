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

// Global, singleton game state — mirrors the original src/config/state.js 1:1.
// This becomes per-room state in Stage 2 (multi-room architecture); kept as a
// single mutable object here so today's game logic ports over unchanged.
export const state = {
  players: {} as Record<string, PlayerState>,
  playField: [] as number[][],
  bulletIntervals: {} as Record<string, NodeJS.Timeout>,
  botIntervals: {} as Record<string, NodeJS.Timeout>,
  botMemory: {} as Record<string, BotMemory>,

  gameMode: 'pvp' as GameMode,
  gameState: 'waiting' as MatchState,

  bricks: [] as BrickState[],
  base: { x: 24, y: 26, type: 'base', health: 1 } as BaseState,
  coopWave: 1,
  enemiesToSpawn: 0,
  enemiesKilled: 0,
  totalEnemiesInWave: 0,
  waveSpawnInterval: null as NodeJS.Timeout | null,
  coopBotCount: 0,

  bulletPool: [] as BulletState[],
  activeBullets: new Map<string, BulletState>(),
  bulletIdCounter: 0,
  lastGameUpdate: 0,

  walls: [] as WallState[],
};

export default state;
