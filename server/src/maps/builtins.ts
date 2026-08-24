import type { GameMode, MapCell, MapDefinition } from '@tank/shared';

// ---------------------------------------------------------------------------
// Small geometry helpers — all layouts stay within x[8..92] y[6..55] so the
// derived play area (see MapGenerator.computeMapBounds) keeps a margin inside
// the 100x60 grid. Lanes between structures are kept >= 6 cells wide so 3x3
// tanks never wedge, and every layout stays BFS-connected for bot pathing.
// ---------------------------------------------------------------------------

function rect(list: MapCell[], x1: number, y1: number, x2: number, y2: number): void {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) list.push({ x, y });
  }
}

function hline(list: MapCell[], x1: number, x2: number, y: number): void {
  rect(list, Math.min(x1, x2), y, Math.max(x1, x2), y);
}

function vline(list: MapCell[], x: number, y1: number, y2: number): void {
  rect(list, x, Math.min(y1, y2), x, Math.max(y1, y2));
}

function unique(list: MapCell[]): MapCell[] {
  const seen = new Set<string>();
  const out: MapCell[] = [];
  for (const cell of list) {
    const k = `${cell.x},${cell.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cell);
  }
  return out;
}

// ---------------------------------------------------------------------------
// PVP MAPS
// ---------------------------------------------------------------------------

// A giant plus-shaped monolith in the middle, corner bunkers, edge pockets.
// Forces fights around the cross arms with four quadrant rotations.
function buildColosseum(): MapDefinition {
  const walls: MapCell[] = [];

  // Central plus: vertical and horizontal bars
  rect(walls, 48, 18, 52, 42);
  rect(walls, 38, 28, 62, 32);

  // Corner bunkers (L-shapes)
  hline(walls, 12, 24, 12); vline(walls, 12, 12, 24);
  hline(walls, 76, 88, 12); vline(walls, 88, 12, 24);
  hline(walls, 12, 24, 48); vline(walls, 12, 36, 48);
  hline(walls, 76, 88, 48); vline(walls, 88, 36, 48);

  // Edge pocket pillars
  rect(walls, 30, 6, 34, 8);
  rect(walls, 66, 6, 70, 8);
  rect(walls, 30, 52, 34, 54);
  rect(walls, 66, 52, 70, 54);

  return { walls, bricks: [] };
}

// Scattered oversized tetromino pieces (I/O/T/S/L/J/Z) as chunky 2-thick
// cover. No long sightlines survive; constant piece-to-piece repositioning.
function buildTetrominoYard(): MapDefinition {
  const walls: MapCell[] = [];

  rect(walls, 14, 14, 24, 15);            // I (horizontal)
  rect(walls, 76, 44, 77, 54);            // I (vertical)
  rect(walls, 30, 10, 35, 15);            // O
  rect(walls, 62, 12, 67, 13);            // S
  rect(walls, 67, 14, 72, 15);
  rect(walls, 12, 30, 17, 31);            // L
  rect(walls, 12, 32, 13, 37);
  rect(walls, 83, 22, 88, 23);            // J
  rect(walls, 87, 24, 88, 29);
  rect(walls, 24, 44, 29, 45);            // Z
  rect(walls, 19, 46, 24, 47);
  rect(walls, 78, 30, 83, 31);            // S (mirrored)

  // T pieces (stem + bar)
  rect(walls, 44, 8, 58, 9);
  rect(walls, 50, 10, 52, 15);
  rect(walls, 42, 48, 56, 49);
  rect(walls, 48, 42, 50, 47);

  rect(walls, 64, 36, 74, 37);            // I (horizontal)
  rect(walls, 38, 28, 43, 33);            // O

  return { walls, bricks: [] };
}

// Five horizontal walls with staggered gaps form a serpentine flow; every
// gap is covered by a stub so crossing lanes is always contested.
function buildSerpentCorridors(): MapDefinition {
  const walls: MapCell[] = [];

  hline(walls, 12, 43, 14); hline(walls, 57, 88, 14);   // gap mid
  hline(walls, 10, 13, 22); hline(walls, 27, 88, 22);   // gap left
  hline(walls, 10, 71, 30); hline(walls, 85, 88, 30);   // gap right
  hline(walls, 10, 29, 38); hline(walls, 43, 88, 38);   // gap mid-left
  hline(walls, 10, 57, 46); hline(walls, 71, 88, 46);   // gap mid-right

  // Gap-cover stubs
  rect(walls, 48, 8, 52, 13);
  rect(walls, 20, 24, 24, 29);
  rect(walls, 76, 32, 80, 37);
  rect(walls, 40, 40, 44, 45);
  rect(walls, 64, 48, 68, 53);

  return { walls, bricks: [] };
}

// Mirrored forts on the flanks (one door each, pillar inside), contested
// pillar trio down the middle. Classic attack/defend symmetry.
function buildTwinFortresses(): MapDefinition {
  const walls: MapCell[] = [];

  // Left fortress (doors: top x16..20, right wall y27..35)
  hline(walls, 10, 15, 18); hline(walls, 21, 28, 18);
  hline(walls, 10, 28, 44);
  vline(walls, 10, 19, 43);
  vline(walls, 28, 19, 26); vline(walls, 28, 36, 43);
  rect(walls, 17, 29, 21, 33);

  // Right fortress (mirror)
  hline(walls, 72, 79, 18); hline(walls, 85, 90, 18);
  hline(walls, 72, 90, 44);
  vline(walls, 90, 19, 43);
  vline(walls, 72, 19, 26); vline(walls, 72, 36, 43);
  rect(walls, 79, 29, 83, 33);

  // Middle pillars
  rect(walls, 47, 12, 53, 16);
  rect(walls, 48, 27, 52, 33);
  rect(walls, 47, 42, 53, 46);

  return { walls, bricks: [] };
}

// Chunky islands in open water: no corridors at all, just brawling cover
// scattered for rotational fights.
function buildArchipelago(): MapDefinition {
  const walls: MapCell[] = [];

  rect(walls, 16, 10, 22, 13);
  rect(walls, 34, 16, 42, 19);
  rect(walls, 56, 10, 64, 14);
  rect(walls, 78, 16, 84, 19);
  rect(walls, 10, 30, 16, 34);
  rect(walls, 46, 27, 54, 31);
  rect(walls, 84, 30, 90, 34);
  rect(walls, 16, 46, 22, 50);
  rect(walls, 36, 42, 44, 45);
  rect(walls, 58, 44, 66, 48);
  rect(walls, 78, 42, 84, 45);

  return { walls, bricks: [] };
}

// Three concentric broken squares; each gap rotated 90° from the last, so
// pushing inward means orbiting the ring under fire.
function buildBrokenRings(): MapDefinition {
  const walls: MapCell[] = [];

  // Outer ring, gap top-middle
  hline(walls, 14, 45, 8); hline(walls, 55, 86, 8);
  hline(walls, 14, 86, 52);
  vline(walls, 14, 9, 51);
  vline(walls, 86, 9, 51);

  // Middle ring, gap right-middle
  hline(walls, 24, 76, 17);
  hline(walls, 24, 76, 43);
  vline(walls, 24, 18, 42);
  vline(walls, 76, 18, 25); vline(walls, 76, 35, 42);

  // Inner ring, gap bottom-middle
  hline(walls, 34, 66, 26);
  vline(walls, 34, 27, 33);
  vline(walls, 66, 27, 33);
  hline(walls, 34, 45, 34); hline(walls, 55, 66, 34);

  return { walls, bricks: [] };
}

// Even checkerboard of solid pillars: endless waist-high cover, no dead
// zones — pure positioning duel.
function buildPillarFields(): MapDefinition {
  const walls: MapCell[] = [];

  for (let iy = 0; iy <= 4; iy++) {
    for (let ix = 0; ix <= 6; ix++) {
      if ((ix + iy) % 2 !== 0) continue;
      const x = 14 + ix * 11;
      const y = 10 + iy * 9;
      rect(walls, x, y, x + 3, y + 2);
    }
  }

  return { walls, bricks: [] };
}

// Three parallel diagonal slashes with offset gaps — long grazing angles,
// almost no orthogonal cover.
function buildDiagonalSlash(): MapDefinition {
  const walls: MapCell[] = [];
  const gapsByBand: [number, number][][] = [
    [[40, 48]],
    [[24, 32], [64, 72]],
    [[48, 56]],
  ];

  for (let band = 0; band < 3; band++) {
    const oy = 4 + band * 12;
    for (let x = 14; x <= 86; x++) {
      const y = oy + Math.floor(((x - 14) * 2) / 5);
      if (gapsByBand[band].some(([a, b]) => x >= a && x <= b)) continue;
      walls.push({ x, y });
      walls.push({ x, y: y + 1 });
    }
  }

  return { walls, bricks: [] };
}

// Six-room close-quarters bunker: cross of dividers with offset doorways
// and a pillar in every room. Brutal ambush geometry.
function buildWarRooms(): MapDefinition {
  const walls: MapCell[] = [];

  // Vertical dividers with center doorways
  vline(walls, 33, 10, 25); vline(walls, 33, 35, 50);
  vline(walls, 66, 10, 25); vline(walls, 66, 35, 50);

  // Horizontal divider, doors at x24..33, x46..54, x66
  hline(walls, 12, 23, 30);
  hline(walls, 34, 45, 30);
  hline(walls, 55, 65, 30);
  hline(walls, 67, 88, 30);

  // Room pillars
  rect(walls, 18, 16, 22, 20);
  rect(walls, 46, 14, 54, 18);
  rect(walls, 78, 16, 82, 20);
  rect(walls, 18, 40, 22, 44);
  rect(walls, 46, 42, 54, 46);
  rect(walls, 78, 40, 82, 44);

  return { walls, bricks: [] };
}

// ---------------------------------------------------------------------------
// CO-OP MAPS
// ---------------------------------------------------------------------------

// A choke band splits the field: two narrow gates plus guarded flanks, and
// the base sits in a brick ring at the south. Successor to the classic funnel.
function buildCoopCrossfire(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 48, y: 52 };

  // Choke band with two gates
  hline(walls, 10, 30, 24);
  hline(walls, 36, 62, 24);
  hline(walls, 68, 88, 24);

  // Approach fins above the band
  rect(walls, 24, 12, 26, 20);
  rect(walls, 72, 12, 74, 20);
  rect(walls, 48, 10, 50, 16);

  // Flank curtains (destructible shortcut or long way around)
  vline(bricks, 14, 30, 42);
  vline(bricks, 84, 30, 42);

  // Base ring (strong north face)
  hline(bricks, 42, 57, 47);
  vline(bricks, 41, 47, 55);
  vline(bricks, 58, 47, 55);

  const enemySpawnPoints: MapCell[] = [
    { x: 16, y: 8 },
    { x: 44, y: 8 },
    { x: 80, y: 8 },
    { x: 10, y: 18 },
    { x: 88, y: 18 },
  ];

  return { walls, bricks, base, enemySpawnPoints };
}

// Tall hedge walls with staggered gaps; several hedge segments and the whole
// mid-line are destructible bricks, so defenders reshape the maze mid-wave.
function buildCoopHedgeMaze(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 12, y: 52 };

  // Hedges (alternating gap layouts; middle sections are bricks, see below)
  vline(walls, 24, 8, 13); vline(walls, 24, 47, 52);
  vline(walls, 40, 8, 25); vline(walls, 40, 35, 52);
  vline(walls, 56, 8, 13); vline(walls, 56, 47, 52);
  vline(walls, 72, 8, 25); vline(walls, 72, 35, 52);
  vline(walls, 88, 8, 13); vline(walls, 88, 47, 52);

  // Destructible hedge sections + mid-line lattice
  vline(bricks, 24, 23, 37);
  vline(bricks, 56, 23, 37);
  hline(bricks, 25, 39, 30);
  hline(bricks, 41, 55, 30);
  hline(bricks, 57, 71, 30);

  // Base nook
  hline(bricks, 8, 18, 49);
  vline(bricks, 8, 50, 55);
  vline(bricks, 18, 50, 55);

  const enemySpawnPoints: MapCell[] = [
    { x: 14, y: 8 },
    { x: 32, y: 8 },
    { x: 48, y: 8 },
    { x: 64, y: 8 },
    { x: 80, y: 8 },
  ];

  return { walls, bricks, base, enemySpawnPoints };
}

// The base hides inside a walled fort whose three gates are made of bricks —
// enemies must breach the walls while defenders shoot from the battlements.
function buildCoopFortressSiege(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 48, y: 46 };

  // Fort ring: open north gate, breachable brick gates on both flanks
  hline(walls, 36, 44, 34); hline(walls, 54, 62, 34);
  hline(walls, 36, 62, 54);
  vline(walls, 36, 35, 41); vline(walls, 36, 47, 53);
  vline(bricks, 36, 42, 46);
  vline(walls, 62, 35, 41); vline(walls, 62, 47, 53);
  vline(bricks, 62, 42, 46);

  // Outer rocks
  rect(walls, 18, 12, 24, 16);
  rect(walls, 72, 12, 78, 16);
  rect(walls, 44, 8, 54, 11);
  rect(walls, 12, 26, 16, 30);
  rect(walls, 84, 26, 88, 30);
  rect(walls, 24, 40, 28, 44);
  rect(walls, 72, 40, 76, 44);

  const enemySpawnPoints: MapCell[] = [
    { x: 16, y: 8 },
    { x: 36, y: 8 },
    { x: 62, y: 8 },
    { x: 10, y: 34 },
    { x: 90, y: 34 },
    { x: 10, y: 50 },
    { x: 88, y: 50 },
  ];

  return { walls, bricks, base, enemySpawnPoints };
}

// An impassable river wall splits north (enemy territory) from south (base),
// crossed by two bridges whose banks are lined with destructible brick cover.
function buildCoopTwinBridges(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 48, y: 52 };

  // River wall with two bridge openings
  for (let x = 6; x <= 94; x++) {
    if ((x >= 22 && x <= 28) || (x >= 72 && x <= 78)) continue;
    for (let y = 26; y <= 29; y++) walls.push({ x, y });
  }

  // Bridge bank cover (flanking each bridgehead)
  hline(bricks, 16, 20, 23); hline(bricks, 30, 34, 23);
  hline(bricks, 66, 70, 23); hline(bricks, 80, 84, 23);
  hline(bricks, 16, 20, 31); hline(bricks, 30, 34, 31);
  hline(bricks, 66, 70, 31); hline(bricks, 80, 84, 31);

  // North-field rocks
  rect(walls, 12, 12, 16, 15);
  rect(walls, 44, 10, 52, 14);
  rect(walls, 84, 12, 88, 15);
  rect(walls, 32, 18, 36, 20);
  rect(walls, 64, 18, 68, 20);

  const enemySpawnPoints: MapCell[] = [
    { x: 10, y: 8 },
    { x: 28, y: 10 },
    { x: 48, y: 6 },
    { x: 68, y: 8 },
    { x: 88, y: 8 },
    { x: 48, y: 20 },
  ];

  return { walls, bricks, base, enemySpawnPoints };
}

// Concentric broken rings around a central base; entries rotate around the
// compass so attackers always cross someone's firing lane. Loose brick
// shields guard the core from every direction.
function buildCoopSwirl(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 48, y: 30 };

  // Outer ring, gap top-middle
  hline(walls, 14, 44, 10); hline(walls, 54, 84, 10);
  hline(walls, 14, 84, 50);
  vline(walls, 14, 11, 49);
  vline(walls, 84, 11, 49);

  // Inner ring, gaps on east and west
  hline(walls, 26, 72, 18);
  hline(walls, 26, 72, 42);
  vline(walls, 26, 19, 26); vline(walls, 26, 34, 41);
  vline(walls, 72, 19, 26); vline(walls, 72, 34, 41);

  // Core brick cross-guard
  hline(bricks, 44, 54, 25);
  hline(bricks, 44, 54, 37);
  vline(bricks, 41, 29, 33);
  vline(bricks, 57, 29, 33);

  // Annulus cover hedges
  rect(bricks, 38, 22, 44, 23);
  rect(bricks, 54, 22, 60, 23);
  rect(bricks, 38, 37, 42, 38);
  rect(bricks, 56, 37, 60, 38);

  const enemySpawnPoints: MapCell[] = [
    { x: 10, y: 8 },
    { x: 88, y: 8 },
    { x: 10, y: 52 },
    { x: 88, y: 52 },
    { x: 8, y: 30 },
    { x: 92, y: 30 },
  ];

  return { walls, bricks, base, enemySpawnPoints };
}

// Scatter of hollow outposts across an open field; the base squats in its
// own south-facing compound behind a gated brick fence.
function buildCoopOutposts(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 48, y: 50 };

  // North-west outpost (door bottom-middle)
  hline(walls, 20, 32, 10);
  hline(walls, 20, 23, 18); hline(walls, 29, 32, 18);
  vline(walls, 20, 11, 17);
  vline(walls, 32, 11, 17);
  rect(bricks, 24, 13, 27, 14);

  // North-east outpost (mirror)
  hline(walls, 68, 80, 10);
  hline(walls, 68, 71, 18); hline(walls, 77, 80, 18);
  vline(walls, 68, 11, 17);
  vline(walls, 80, 11, 17);
  rect(bricks, 72, 13, 75, 14);

  // Side ruins
  rect(walls, 10, 28, 14, 31); vline(walls, 10, 32, 36);
  rect(walls, 86, 28, 90, 31); vline(walls, 90, 32, 36);

  // Mid-field pillars
  rect(walls, 30, 32, 34, 35);
  rect(walls, 66, 32, 70, 35);
  rect(walls, 48, 24, 52, 27);

  // Base compound: walls south/east/west, gated brick fence north
  vline(walls, 42, 45, 53);
  vline(walls, 56, 45, 53);
  hline(walls, 42, 56, 54);
  hline(bricks, 42, 46, 44);
  hline(bricks, 52, 56, 44);

  const enemySpawnPoints: MapCell[] = [
    { x: 26, y: 6 },
    { x: 74, y: 6 },
    { x: 48, y: 12 },
    { x: 10, y: 20 },
    { x: 90, y: 20 },
    { x: 16, y: 44 },
    { x: 82, y: 44 },
  ];

  return { walls, bricks, base, enemySpawnPoints };
}

// A west-to-east kill corridor: alternating top/bottom fins force a zigzag
// under fire, brick teeth split the safe band, and the base cowers behind
// brick braces on the far right.
function buildCoopGauntlet(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 88, y: 30 };

  // Top fins
  vline(walls, 20, 8, 24);
  vline(walls, 36, 8, 24);
  vline(walls, 52, 8, 24);
  vline(walls, 68, 8, 24);

  // Bottom fins
  vline(walls, 28, 36, 52);
  vline(walls, 44, 36, 52);
  vline(walls, 60, 36, 52);
  vline(walls, 76, 36, 52);

  // Teeth in the safe band
  rect(bricks, 30, 28, 32, 32);
  rect(bricks, 62, 28, 64, 32);

  // Base braces
  vline(bricks, 84, 24, 28);
  vline(bricks, 84, 32, 36);

  const enemySpawnPoints: MapCell[] = [
    { x: 16, y: 8 },
    { x: 10, y: 12 },
    { x: 10, y: 30 },
    { x: 10, y: 48 },
    { x: 16, y: 52 },
    { x: 40, y: 52 },
  ];

  return { walls, bricks, base, enemySpawnPoints };
}

// Wide-open quarry pit dotted with asymmetric rock clusters and a couple of
// low brick fences — nothing seals, everything exposes. Pure wave shooting.
function buildCoopQuarry(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 48, y: 50 };

  // Rock clusters
  rect(walls, 14, 10, 18, 13);
  rect(walls, 30, 8, 35, 11);
  rect(walls, 50, 10, 54, 12);
  rect(walls, 70, 8, 75, 11);
  rect(walls, 86, 12, 90, 15);
  rect(walls, 10, 24, 14, 28);
  rect(walls, 26, 20, 30, 24);
  rect(walls, 62, 20, 66, 24);
  rect(walls, 82, 24, 86, 28);
  rect(walls, 18, 36, 23, 40);
  rect(walls, 38, 32, 42, 35);
  rect(walls, 56, 34, 60, 37);
  rect(walls, 74, 38, 78, 41);
  rect(walls, 30, 46, 34, 49);
  rect(walls, 66, 46, 70, 49);

  // Low fences
  vline(bricks, 44, 18, 24);
  vline(bricks, 56, 18, 24);
  hline(bricks, 40, 45, 42);
  hline(bricks, 53, 58, 42);

  const enemySpawnPoints: MapCell[] = [
    { x: 22, y: 8 },
    { x: 42, y: 8 },
    { x: 58, y: 8 },
    { x: 78, y: 8 },
    { x: 8, y: 34 },
    { x: 92, y: 34 },
    { x: 8, y: 52 },
    { x: 92, y: 52 },
  ];

  return { walls, bricks, base, enemySpawnPoints };
}

// Layered redoubt: a sealed brick box (north gate only) inside a brick wall
// with bolted wall corners, behind an outer wall line with two gaps.
function buildCoopRedoubt(): MapDefinition {
  const walls: MapCell[] = [];
  const bricks: MapCell[] = [];
  const base = { x: 48, y: 48 };

  // Outer wall line, gaps at x40..44 and x54..58
  hline(walls, 24, 39, 26);
  hline(walls, 45, 53, 26);
  hline(walls, 59, 72, 26);
  vline(walls, 24, 27, 34);
  vline(walls, 72, 27, 34);
  vline(walls, 24, 44, 52);
  vline(walls, 72, 44, 52);

  // Second layer: bolted corners + brick curtain
  rect(walls, 34, 36, 36, 38);
  rect(walls, 62, 36, 64, 38);
  hline(bricks, 37, 61, 36);
  vline(bricks, 34, 39, 48);
  vline(bricks, 64, 39, 48);

  // Inner redoubt: sealed brick box, north gate only
  hline(bricks, 42, 46, 42);
  hline(bricks, 52, 56, 42);
  vline(bricks, 42, 43, 55);
  vline(bricks, 56, 43, 55);
  hline(bricks, 43, 55, 55);

  // Mid-field debris
  rect(bricks, 30, 16, 34, 18);
  rect(bricks, 64, 16, 68, 18);

  const enemySpawnPoints: MapCell[] = [
    { x: 14, y: 10 },
    { x: 48, y: 8 },
    { x: 84, y: 10 },
    { x: 10, y: 40 },
    { x: 88, y: 40 },
    { x: 16, y: 54 },
    { x: 82, y: 54 },
  ];

  return { walls, bricks, base, enemySpawnPoints };
}

// ---------------------------------------------------------------------------

export interface BuiltinMap {
  id: string;
  name: string;
  mode: GameMode;
  definition: MapDefinition;
}

export const BUILTIN_MAPS: BuiltinMap[] = [
  { id: 'builtin-pvp-colosseum', name: 'Colosseum', mode: 'pvp', definition: buildColosseum() },
  { id: 'builtin-pvp-tetromino-yard', name: 'Tetromino Yard', mode: 'pvp', definition: buildTetrominoYard() },
  { id: 'builtin-pvp-serpent-corridors', name: 'Serpent Corridors', mode: 'pvp', definition: buildSerpentCorridors() },
  { id: 'builtin-pvp-twin-fortresses', name: 'Twin Fortresses', mode: 'pvp', definition: buildTwinFortresses() },
  { id: 'builtin-pvp-archipelago', name: 'Archipelago', mode: 'pvp', definition: buildArchipelago() },
  { id: 'builtin-pvp-broken-rings', name: 'Broken Rings', mode: 'pvp', definition: buildBrokenRings() },
  { id: 'builtin-pvp-pillar-fields', name: 'Pillar Fields', mode: 'pvp', definition: buildPillarFields() },
  { id: 'builtin-pvp-diagonal-slash', name: 'Diagonal Slash', mode: 'pvp', definition: buildDiagonalSlash() },
  { id: 'builtin-pvp-war-rooms', name: 'War Rooms', mode: 'pvp', definition: buildWarRooms() },

  { id: 'builtin-coop-crossfire', name: 'Crossfire Junction', mode: 'coop', definition: buildCoopCrossfire() },
  { id: 'builtin-coop-hedge-maze', name: 'Hedge Maze', mode: 'coop', definition: buildCoopHedgeMaze() },
  { id: 'builtin-coop-fortress-siege', name: 'Fortress Siege', mode: 'coop', definition: buildCoopFortressSiege() },
  { id: 'builtin-coop-twin-bridges', name: 'Twin Bridges', mode: 'coop', definition: buildCoopTwinBridges() },
  { id: 'builtin-coop-swirl', name: 'The Swirl', mode: 'coop', definition: buildCoopSwirl() },
  { id: 'builtin-coop-outposts', name: 'Outposts', mode: 'coop', definition: buildCoopOutposts() },
  { id: 'builtin-coop-gauntlet', name: 'The Gauntlet', mode: 'coop', definition: buildCoopGauntlet() },
  { id: 'builtin-coop-quarry', name: 'Quarry', mode: 'coop', definition: buildCoopQuarry() },
  { id: 'builtin-coop-redoubt', name: 'Redoubt', mode: 'coop', definition: buildCoopRedoubt() },
];

export function getBuiltinMap(id: string): BuiltinMap | undefined {
  return BUILTIN_MAPS.find((map) => map.id === id);
}

// Overlapping primitives (cross intersections, L-corner shares) are fine to
// write but ship clean: one cell, one entry.
for (const map of BUILTIN_MAPS) {
  map.definition.walls = unique(map.definition.walls);
  map.definition.bricks = unique(map.definition.bricks);
}

export function defaultBuiltinMapFor(mode: GameMode): BuiltinMap {
  const map = BUILTIN_MAPS.find((m) => m.mode === mode);
  if (!map) throw new Error(`No builtin map for mode ${mode}`);
  return map;
}
