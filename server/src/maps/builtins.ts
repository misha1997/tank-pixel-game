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

function buildCoopDefenseMap(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 24, y: 26 };

  // Concrete walls (indestructible) - borders and obstacles
  // Top wall
  for (let x = 5; x < 45; x++) {
    if (x < 20 || x > 29) walls.push({ x, y: 3 });
  }

  // Side walls
  for (let y = 3; y < 15; y++) {
    walls.push({ x: 5, y });
    walls.push({ x: 44, y });
  }

  // Central obstacle (concrete)
  for (let x = 20; x <= 29; x++) {
    walls.push({ x, y: 10 });
  }
  for (let y = 8; y <= 12; y++) {
    walls.push({ x: 22, y });
    walls.push({ x: 27, y });
  }

  // Side obstacles (concrete)
  for (let y = 6; y < 10; y++) {
    walls.push({ x: 10, y });
    walls.push({ x: 39, y });
  }

  // Brick walls (destructible) - base protection
  // Top protection line
  for (let x = base.x - 2; x <= base.x + 4; x++) {
    bricks.push({ x, y: base.y - 2 });
  }

  // Side protection walls
  for (let y = base.y - 2; y <= base.y + 2; y++) {
    bricks.push({ x: base.x - 2, y });
    bricks.push({ x: base.x + 4, y });
  }

  // Additional brick obstacles on map
  // Left flank
  for (let y = 15; y < 20; y++) {
    bricks.push({ x: 8, y });
    bricks.push({ x: 12, y });
  }

  // Right flank
  for (let y = 15; y < 20; y++) {
    bricks.push({ x: 37, y });
    bricks.push({ x: 41, y });
  }

  // Central obstacles
  for (let x = 18; x <= 31; x += 2) {
    bricks.push({ x, y: 15 });
  }

  const enemySpawnPoints: MapCell[] = [
    { x: 10, y: 4 },
    { x: 39, y: 4 },
    { x: 12, y: 13 },
    { x: 37, y: 13 },
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
