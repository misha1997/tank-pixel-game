import { size } from '@tank/shared';
import type { GameMode, MapCell, MapDefinition, RoomVisibility } from '@tank/shared';
import { saveMap } from '../../shared/maps.js';
import { navigate } from '../../core/router.js';
import { mountPartial } from '../../core/page.js';
import html from './mapEditor.html?raw';

type Tool = 'wall' | 'brick' | 'base' | 'spawn' | 'erase';

const CELL_SIZE = 16;
const MAX_ENEMY_SPAWNS = 6;
const PAINT_TOOLS: ReadonlySet<Tool> = new Set(['wall', 'brick', 'erase']);

const COLORS: Record<'empty' | 'wall' | 'brick' | 'base' | 'spawn' | 'grid', string> = {
  empty: '#9aa680',
  wall: '#654321',
  brick: '#cc6633',
  base: '#ffffff',
  spawn: '#c20000',
  grid: 'rgba(0, 0, 0, 0.15)',
};

let cells = new Map<string, 'wall' | 'brick'>();
let base: MapCell | null = null;
let enemySpawns: MapCell[] = [];
let mode: GameMode = 'pvp';
let tool: Tool = 'wall';
let zoom = 1;
let painting = false;
let hoverCell: MapCell | null = null;
let wired = false;

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function selectedToggle(group: HTMLElement): string {
  return group.querySelector<HTMLElement>('.selected')?.dataset.value ?? '';
}

function wireToggleGroup(group: HTMLElement, onChange: (value: string) => void): void {
  group.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      onChange(btn.dataset.value ?? '');
    });
  });
}

function updateCoopToolVisibility(): void {
  const toolGroup = document.getElementById('editor-tool') as HTMLElement;
  toolGroup.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    const isCoopOnly =
      btn.dataset.value === 'brick' ||
      btn.dataset.value === 'base' ||
      btn.dataset.value === 'spawn';
    btn.classList.toggle('tool-hidden', isCoopOnly && mode !== 'coop');
  });
  if (mode !== 'coop' && (tool === 'brick' || tool === 'base' || tool === 'spawn')) {
    tool = 'wall';
    toolGroup
      .querySelectorAll('button')
      .forEach((b) => b.classList.toggle('selected', b.dataset.value === 'wall'));
  }
}

function applyZoom(canvas: HTMLCanvasElement): void {
  canvas.style.width = `${canvas.width * zoom}px`;
  canvas.style.height = `${canvas.height * zoom}px`;
}

function updateStats(): void {
  const wallCount = [...cells.values()].filter((t) => t === 'wall').length;
  const brickCount = cells.size - wallCount;

  const statsEl = document.getElementById('editor-stats') as HTMLElement;
  statsEl.textContent =
    mode === 'coop'
      ? `Walls: ${wallCount} · Bricks: ${brickCount} · Spawns: ${enemySpawns.length}/${MAX_ENEMY_SPAWNS}`
      : `Walls: ${wallCount}`;
  statsEl.classList.remove('editor-info--warn');

  if (mode === 'coop' && !base) {
    statsEl.textContent += ' · Base not placed yet';
    statsEl.classList.add('editor-info--warn');
  }
}

function updateCoords(): void {
  const coordsEl = document.getElementById('editor-coords') as HTMLElement;
  coordsEl.textContent = hoverCell ? `x: ${hoverCell.x}, y: ${hoverCell.y}` : '';
}

function render(): void {
  const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = COLORS.empty;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = COLORS.grid;
  for (let x = 0; x <= size.col; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= size.row; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(canvas.width, y * CELL_SIZE);
    ctx.stroke();
  }

  for (const [cellKey, type] of cells) {
    const [x, y] = cellKey.split(',').map(Number);
    ctx.fillStyle = COLORS[type];
    ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }

  if (base) {
    ctx.fillStyle = COLORS.base;
    ctx.fillRect(base.x * CELL_SIZE, base.y * CELL_SIZE, CELL_SIZE * 3, CELL_SIZE * 3);
  }

  for (const spawn of enemySpawns) {
    ctx.fillStyle = COLORS.spawn;
    ctx.beginPath();
    ctx.arc(
      spawn.x * CELL_SIZE + CELL_SIZE / 2,
      spawn.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE / 2 - 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  if (hoverCell) {
    const isBaseTool = tool === 'base';
    const span = isBaseTool ? 3 : 1;
    ctx.strokeStyle = '#f0b429';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      hoverCell.x * CELL_SIZE + 1,
      hoverCell.y * CELL_SIZE + 1,
      CELL_SIZE * span - 2,
      CELL_SIZE * span - 2,
    );
  }

  updateStats();
}

function cellFromEvent(canvas: HTMLCanvasElement, event: MouseEvent): MapCell | null {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * size.col);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * size.row);
  if (x < 0 || x >= size.col || y < 0 || y >= size.row) return null;
  return { x, y };
}

function applyTool(activeTool: Tool, x: number, y: number): void {
  switch (activeTool) {
    case 'wall':
      cells.set(key(x, y), 'wall');
      break;
    case 'brick':
      cells.set(key(x, y), 'brick');
      break;
    case 'erase':
      cells.delete(key(x, y));
      break;
    case 'base':
      base = { x, y };
      break;
    case 'spawn': {
      const existingIndex = enemySpawns.findIndex((p) => p.x === x && p.y === y);
      if (existingIndex >= 0) {
        enemySpawns.splice(existingIndex, 1);
      } else if (enemySpawns.length < MAX_ENEMY_SPAWNS) {
        enemySpawns.push({ x, y });
      }
      break;
    }
  }
}

function resetState(): void {
  cells = new Map();
  base = null;
  enemySpawns = [];
  mode = 'pvp';
  tool = 'wall';
  zoom = 1;
  hoverCell = null;

  (document.getElementById('editor-name') as HTMLInputElement).value = '';

  const modeGroup = document.getElementById('editor-mode') as HTMLElement;
  modeGroup
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('selected', b.dataset.value === 'pvp'));

  const visibilityGroup = document.getElementById('editor-visibility') as HTMLElement;
  visibilityGroup
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('selected', b.dataset.value === 'public'));

  const toolGroup = document.getElementById('editor-tool') as HTMLElement;
  toolGroup
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('selected', b.dataset.value === 'wall'));

  const zoomGroup = document.getElementById('editor-zoom') as HTMLElement;
  zoomGroup
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('selected', b.dataset.value === '1'));

  (document.getElementById('editor-error') as HTMLElement).textContent = '';

  updateCoopToolVisibility();
  updateCoords();
}

function wireOnce(): void {
  const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
  const modeGroup = document.getElementById('editor-mode') as HTMLElement;
  const visibilityGroup = document.getElementById('editor-visibility') as HTMLElement;
  const toolGroup = document.getElementById('editor-tool') as HTMLElement;
  const zoomGroup = document.getElementById('editor-zoom') as HTMLElement;
  const clearBtn = document.getElementById('editor-clear-btn') as HTMLButtonElement;
  const saveBtn = document.getElementById('editor-save-btn') as HTMLButtonElement;
  const backBtn = document.getElementById('editor-back-btn') as HTMLButtonElement;
  const nameInput = document.getElementById('editor-name') as HTMLInputElement;
  const errorBox = document.getElementById('editor-error') as HTMLElement;

  canvas.width = size.col * CELL_SIZE;
  canvas.height = size.row * CELL_SIZE;
  canvas.oncontextmenu = (event) => event.preventDefault();

  wireToggleGroup(modeGroup, (value) => {
    mode = value as GameMode;
    if (mode === 'pvp') {
      base = null;
      enemySpawns = [];
      for (const [cellKey, cellType] of [...cells]) {
        if (cellType === 'brick') cells.delete(cellKey);
      }
    }
    updateCoopToolVisibility();
    render();
  });
  wireToggleGroup(visibilityGroup, () => {});
  wireToggleGroup(toolGroup, (value) => {
    tool = value as Tool;
    render();
  });
  wireToggleGroup(zoomGroup, (value) => {
    zoom = Number(value) || 1;
    applyZoom(canvas);
  });

  canvas.addEventListener('mousedown', (event) => {
    const cell = cellFromEvent(canvas, event);
    if (!cell) return;

    const activeTool: Tool = event.button === 2 ? 'erase' : tool;
    applyTool(activeTool, cell.x, cell.y);
    if (PAINT_TOOLS.has(activeTool)) painting = true;
    render();
  });

  canvas.addEventListener('mousemove', (event) => {
    const cell = cellFromEvent(canvas, event);
    hoverCell = cell;
    updateCoords();

    if (painting && cell) {
      const activeTool: Tool = event.buttons === 2 ? 'erase' : tool;
      if (PAINT_TOOLS.has(activeTool)) {
        applyTool(activeTool, cell.x, cell.y);
      }
    }
    render();
  });

  canvas.addEventListener('mouseleave', () => {
    hoverCell = null;
    updateCoords();
    render();
  });

  window.addEventListener('mouseup', () => {
    painting = false;
  });

  backBtn.addEventListener('click', () => navigate('/'));

  clearBtn.addEventListener('click', () => {
    cells = new Map();
    base = null;
    enemySpawns = [];
    render();
  });

  saveBtn.addEventListener('click', async () => {
    errorBox.textContent = '';
    const name = nameInput.value.trim();
    if (!name) {
      errorBox.textContent = 'Map name is required.';
      return;
    }

    const walls: MapCell[] = [];
    const bricks: MapCell[] = [];
    for (const [cellKey, type] of cells) {
      const [x, y] = cellKey.split(',').map(Number);
      (type === 'wall' ? walls : bricks).push({ x, y });
    }

    const data: MapDefinition = {
      walls,
      bricks,
      base: mode === 'coop' && base ? base : undefined,
      enemySpawnPoints: mode === 'coop' ? enemySpawns : undefined,
    };

    const visibility = (selectedToggle(visibilityGroup) || 'public') as RoomVisibility;

    saveBtn.disabled = true;
    const result = await saveMap({ name, mode, visibility, data });
    saveBtn.disabled = false;

    if (!result.ok) {
      errorBox.textContent = result.error;
      return;
    }

    navigate('/');
  });
}

export function showMapEditor(): void {
  if (!wired) {
    mountPartial(html);
    wireOnce();
    wired = true;
  }

  resetState();
  applyZoom(document.getElementById('editor-canvas') as HTMLCanvasElement);
  document.getElementById('editor-overlay')?.classList.remove('hidden');
  // Hides the global site frame while editing — the canvas gets its own
  // matching frame instead (see .editor-layout .arena-shell in style.css).
  document.body.classList.add('editor-active');
  render();
}

export function hideMapEditor(): void {
  document.getElementById('editor-overlay')?.classList.add('hidden');
  document.body.classList.remove('editor-active');
}
