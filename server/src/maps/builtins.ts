import type { GameMode, MapCell, MapDefinition } from '@tank/shared';

function buildPvpArenaMap(): MapDefinition {
  const walls: MapCell[] = [];

  // Wall 1: Vertical wall on left
  for (let y = 8; y < 22; y++) {
    walls.push({ x: 15, y });
  }

  // Wall 2: Horizontal wall on top
  for (let x = 20; x < 35; x++) {
    walls.push({ x, y: 10 });
  }

  // Wall 3: Vertical wall on right
  for (let y = 5; y < 18; y++) {
    walls.push({ x: 35, y });
  }

  // Wall 4: Short horizontal wall at bottom
  for (let x = 8; x < 15; x++) {
    walls.push({ x, y: 20 });
  }

  // Wall 5: L-shaped wall
  for (let x = 40; x < 45; x++) {
    walls.push({ x, y: 20 });
  }
  for (let y = 20; y < 25; y++) {
    walls.push({ x: 40, y });
  }

  return { walls, bricks: [] };
}

// Same layout as the original 50x30-era map, uniformly scaled 2x to match
// the current 100x60 arena (shared/src/constants.ts `size`) — otherwise the
// whole defense funnel sat balled up in one corner of the much bigger grid.
function buildCoopDefenseMap(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 48, y: 52 };

  // Concrete walls (indestructible) - borders and obstacles
  // Top wall
  for (let x = 10; x < 90; x++) {
    if (x < 40 || x > 58) walls.push({ x, y: 6 });
  }

  // Side walls
  for (let y = 6; y < 30; y++) {
    walls.push({ x: 10, y });
    walls.push({ x: 88, y });
  }

  // Central obstacle (concrete)
  for (let x = 40; x <= 58; x++) {
    walls.push({ x, y: 20 });
  }
  for (let y = 16; y <= 24; y++) {
    walls.push({ x: 44, y });
    walls.push({ x: 54, y });
  }

  // Side obstacles (concrete)
  for (let y = 12; y < 20; y++) {
    walls.push({ x: 20, y });
    walls.push({ x: 78, y });
  }

  // Brick walls (destructible) - base protection
  // Top protection line
  for (let x = base.x - 4; x <= base.x + 8; x++) {
    bricks.push({ x, y: base.y - 4 });
  }

  // Side protection walls
  for (let y = base.y - 4; y <= base.y + 4; y++) {
    bricks.push({ x: base.x - 4, y });
    bricks.push({ x: base.x + 8, y });
  }

  // Additional brick obstacles on map
  // Left flank
  for (let y = 30; y < 40; y++) {
    bricks.push({ x: 16, y });
    bricks.push({ x: 24, y });
  }

  // Right flank
  for (let y = 30; y < 40; y++) {
    bricks.push({ x: 74, y });
    bricks.push({ x: 82, y });
  }

  // Central obstacles
  for (let x = 36; x <= 62; x += 4) {
    bricks.push({ x, y: 30 });
  }

  const enemySpawnPoints: MapCell[] = [
    { x: 20, y: 8 },
    { x: 78, y: 8 },
    { x: 24, y: 26 },
    { x: 74, y: 26 },
  ];

  return { walls, bricks, base, enemySpawnPoints };
}

export interface BuiltinMap {
  id: string;
  name: string;
  mode: GameMode;
  definition: MapDefinition;
}

export const BUILTIN_MAPS: BuiltinMap[] = [
  { id: 'builtin-pvp-arena', name: 'Classic Arena', mode: 'pvp', definition: buildPvpArenaMap() },
  { id: 'builtin-coop-defense', name: 'Classic Defense', mode: 'coop', definition: buildCoopDefenseMap() },
];

export function getBuiltinMap(id: string): BuiltinMap | undefined {
  return BUILTIN_MAPS.find((map) => map.id === id);
}

export function defaultBuiltinMapFor(mode: GameMode): BuiltinMap {
  const map = BUILTIN_MAPS.find((m) => m.mode === mode);
  if (!map) throw new Error(`No builtin map for mode ${mode}`);
  return map;
}
