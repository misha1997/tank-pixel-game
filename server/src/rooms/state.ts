import type {
  BaseState,
  BrickState,
  BulletState,
  GameMode,
  MapCell,
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
  dodgeChance?: number;
  dangerZones?: unknown[];
  lastCollisionAvoidance?: number;
  attackTargetPos?: 'left' | 'right' | 'top';
  targetPlayer?: string;
  lastMove?: { dx: number; dy: number; pos: string };
  lastTarget?: { x: number; y: number };
  target?: string;

  // Cached BFS route (see BotAI.findPath/planPursuit) so bots don't re-plan
  // a full pathfind every single AI tick — only when the goal drifts, the
  // route runs out, or it goes stale.
  path?: { x: number; y: number }[];
  pathGoalX?: number;
  pathGoalY?: number;
  pathComputedAt?: number;
}

// Per-room mutable game data. One instance per GameRoom — this is what used to be
// the process-wide singleton in config/state.js before the multi-room rework.
export interface RoomState {
  players: Record<string, PlayerState>;
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

  walls: WallState[];
  enemySpawnPoints: MapCell[];

  // O(1) occupancy mirrors of `walls` and `bricks` (health > 0), keyed by
  // cellKey(). Rebuilt in rebuildBlockedCellSets whenever a map is applied;
  // brick entries must be deleted as bricks are destroyed (BulletManager).
  wallCells: Set<string>;
  brickCells: Map<string, BrickState>;

  // Bounding box of the current map's actual layout (walls/bricks/base/spawn
  // points), padded a few cells. The arena grid (shared `size`) is much
  // bigger than any hand-built map, so without this, coop respawns and the
  // enemy-spawn fallback would scatter across mostly-empty grid far from the
  // map's real play area instead of staying on it. Null outside coop.
  mapBounds: MapBounds | null;
}

export interface MapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function createInitialRoomState(mode: GameMode): RoomState {
  return {
    players: {},
    bulletIntervals: {},
    botIntervals: {},
    botMemory: {},

    gameMode: mode,
    gameState: 'waiting',

    bricks: [],
    base: { x: 48, y: 52, type: 'base', health: 1 },
    coopWave: 1,
    enemiesToSpawn: 0,
    enemiesKilled: 0,
    totalEnemiesInWave: 0,
    waveSpawnInterval: null,
    coopBotCount: 0,

    bulletPool: [],
    activeBullets: new Map(),
    bulletIdCounter: 0,

    walls: [],
    enemySpawnPoints: [],
    mapBounds: null,

    wallCells: new Set(),
    brickCells: new Map(),
  };
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function rebuildBlockedCellSets(state: RoomState): void {
  state.wallCells.clear();
  for (const wall of state.walls) state.wallCells.add(cellKey(wall.x, wall.y));

  state.brickCells.clear();
  for (const brick of state.bricks) {
    if (brick.health > 0) state.brickCells.set(cellKey(brick.x, brick.y), brick);
  }
}
