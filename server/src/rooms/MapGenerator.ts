import { size } from '@tank/shared';
import type { GameMode, MapCell, MapDefinition } from '@tank/shared';
import type { MapBounds, RoomState } from './state.js';
import { rebuildBlockedCellSets } from './state.js';

const DEFAULT_BASE = { x: 48, y: 52 };

// Cells beyond a map's own footprint kept on either side, so the play area
// isn't drawn flush against the walls/bricks that define it.
const MAP_BOUNDS_PADDING = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Derives the map's actual footprint from its layout, so coop respawns and
// enemy spawning stay confined to wherever the map was actually built —
// rather than the full arena grid, which is sized for the largest maps and
// dwarfs most hand-built or generated ones.
function computeMapBounds(definition: MapDefinition, base: MapCell): MapBounds {
  const points: MapCell[] = [...definition.walls, ...definition.bricks, base, ...(definition.enemySpawnPoints ?? [])];

  const maxX = size.col - 3;
  const maxY = size.row - 3;
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX, maxY };
  }

  let minPX = Infinity;
  let minPY = Infinity;
  let maxPX = -Infinity;
  let maxPY = -Infinity;
  for (const point of points) {
    minPX = Math.min(minPX, point.x);
    minPY = Math.min(minPY, point.y);
    maxPX = Math.max(maxPX, point.x);
    maxPY = Math.max(maxPY, point.y);
  }

  return {
    minX: clamp(minPX - MAP_BOUNDS_PADDING, 0, maxX),
    minY: clamp(minPY - MAP_BOUNDS_PADDING, 0, maxY),
    maxX: clamp(maxPX + MAP_BOUNDS_PADDING, 0, maxX),
    maxY: clamp(maxPY + MAP_BOUNDS_PADDING, 0, maxY),
  };
}

export class MapGenerator {
  constructor(private readonly state: RoomState) {}

  applyMap(definition: MapDefinition, mode: GameMode): void {
    const { state } = this;

    state.walls = definition.walls.map((cell) => ({ x: cell.x, y: cell.y, type: 'wall' as const }));
    state.bricks = definition.bricks.map((cell) => ({ x: cell.x, y: cell.y, type: 'brick' as const, health: 1 }));
    rebuildBlockedCellSets(state);

    if (mode === 'coop') {
      const base = definition.base ?? DEFAULT_BASE;
      state.base = { x: base.x, y: base.y, type: 'base', health: 1 };
      state.enemySpawnPoints = definition.enemySpawnPoints ?? [];
      state.mapBounds = computeMapBounds(definition, base);
      state.gameState = 'playing';
      state.coopWave = 1;
      state.enemiesKilled = 0;
    } else {
      state.mapBounds = null;
    }
  }
}
