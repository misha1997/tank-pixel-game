import type { GameMode, MapDefinition } from '@tank/shared';
import type { RoomState } from './state.js';

const DEFAULT_BASE = { x: 24, y: 26 };

export class MapGenerator {
  constructor(private readonly state: RoomState) {}

  applyMap(definition: MapDefinition, mode: GameMode): void {
    const { state } = this;

    state.walls = definition.walls.map((cell) => ({ x: cell.x, y: cell.y, type: 'wall' as const }));
    state.bricks = definition.bricks.map((cell) => ({ x: cell.x, y: cell.y, type: 'brick' as const, health: 1 }));

    if (mode === 'coop') {
      const base = definition.base ?? DEFAULT_BASE;
      state.base = { x: base.x, y: base.y, type: 'base', health: 1 };
      state.enemySpawnPoints = definition.enemySpawnPoints ?? [];
      state.gameState = 'playing';
      state.coopWave = 1;
      state.enemiesKilled = 0;
    }
  }
}
