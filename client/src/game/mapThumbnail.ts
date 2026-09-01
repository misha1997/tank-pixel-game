import type { MapDefinition } from '@tank/shared';

// Deterministic tint per map id, so a map keeps the same background tone
// across renders/reloads even before its layout is drawn on top.
function tintFor(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return [`hsl(${hue}, 22%, 26%)`, `hsl(${hue}, 22%, 32%)`];
}

function computeBounds(def: MapDefinition): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const points = [
    ...def.walls,
    ...def.bricks,
    ...(def.base ? [def.base] : []),
    ...(def.enemySpawnPoints ?? []),
  ];
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = 2;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

// Renders a small canvas preview of a map's actual wall/brick/base layout,
// backed by a deterministic tinted checkerboard (the look new_template's map
// cards use as a placeholder) so untinted empty areas still read as "map art"
// rather than a blank box.
export function renderMapThumbnail(
  canvas: HTMLCanvasElement,
  mapId: string,
  def: MapDefinition,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const [t1, t2] = tintFor(mapId);

  const checker = 6;
  for (let y = 0; y < height; y += checker) {
    for (let x = 0; x < width; x += checker) {
      ctx.fillStyle = (Math.floor(x / checker) + Math.floor(y / checker)) % 2 === 0 ? t1 : t2;
      ctx.fillRect(x, y, checker, checker);
    }
  }

  const bounds = computeBounds(def);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(width / spanX, height / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const cell = Math.max(1, scale);

  const plot = (x: number, y: number, color: string, size = cell) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      offsetX + (x - bounds.minX) * scale,
      offsetY + (y - bounds.minY) * scale,
      size,
      size,
    );
  };

  for (const wall of def.walls) plot(wall.x, wall.y, '#b45a2a');
  for (const brick of def.bricks) plot(brick.x, brick.y, '#cc6633');
  if (def.base) plot(def.base.x, def.base.y, '#ffffff', cell * 3);
}
