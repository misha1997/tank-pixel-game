import { positionPiece, size } from '@tank/shared';
import type { ArenaLayout, BaseState, BrickState, GameStateSnapshot, PlayerState, WallState } from '@tank/shared';

// Pixel size pinned to the original prototype (D:\ProjectNode\tank-pixel-game,
// static/view.js) — a fixed 22px cell, not scaled to fit the container. The
// camera (see render()) is what keeps a bigger arena playable at this size.
const CELL_SIZE = 22;
const CELL_PADDING = 2;
const INNER_CELL_OFFSET = 4;
const INNER_CELL_SIZE = 12;

// The three nested squares below are cellSize-2 / 16 / 12 wide — 2px
// smaller than the cell on each layer — but every fillRect used to start
// flush at the cell's own (0,0), so that 2px only ever showed up on the
// right/bottom edge. Anchoring xPos/yPos here instead centers the whole
// stack, splitting that gap evenly on all four sides.
const CELL_MARGIN = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default class View {
  private element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private backgroundCanvas: HTMLCanvasElement;
  private backgroundContext: CanvasRenderingContext2D;

  private width = 0;
  private height = 0;
  private devicePixelRatio = 1;

  private readonly cellSize = CELL_SIZE;
  private readonly cellPadding = CELL_PADDING;
  private readonly innerCellSize = INNER_CELL_SIZE;
  private readonly innerCellOffset = INNER_CELL_OFFSET;
  private readonly uiFontSize = CELL_SIZE;

  private readonly colors = {
    filled: 'rgba(0, 0, 0)',
    empty: 'rgba(0, 0, 0, 0.2)',
    background: '#9aa680',
    invulnerable: 'rgba(255, 215, 0)',
  };

  constructor(element: HTMLElement) {
    this.element = element;

    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d')!;
    this.context.font = `${this.uiFontSize}px DS-Digital-Italic`;

    this.backgroundCanvas = document.createElement('canvas');
    this.backgroundContext = this.backgroundCanvas.getContext('2d')!;
    this.updateBackground();

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.element.appendChild(this.canvas);
  }

  resize(): void {
    // The canvas backing store is sized in *physical* pixels (CSS size ×
    // devicePixelRatio); without this, a non-100% OS display scale (125%,
    // 150%, ...) forces the browser to stretch our buffer by a fractional
    // factor, so cell edges round to different physical pixels and look
    // uneven. this.width/this.height stay in logical/CSS pixels — every
    // other method's math (camera, cell positions) is unaffected — and
    // render() applies the matching ctx.scale() once per frame.
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.width = this.element.clientWidth;
    this.height = this.element.clientHeight;
    this.canvas.width = Math.round(this.width * this.devicePixelRatio);
    this.canvas.height = Math.round(this.height * this.devicePixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  private updateBackground(): void {
    this.backgroundCanvas.width = size.col * this.cellSize;
    this.backgroundCanvas.height = size.row * this.cellSize;
    this.drawBackground();
  }

  private drawBackground(): void {
    this.backgroundContext.fillStyle = this.colors.background;
    this.backgroundContext.fillRect(0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height);

    for (let y = 0; y < size.row; y++) {
      for (let x = 0; x < size.col; x++) {
        this.renderEmptyCell(x, y, this.backgroundContext);
      }
    }
  }

  private renderEmptyCell(x: number, y: number, ctx: CanvasRenderingContext2D): void {
    const xPos = x * this.cellSize + CELL_MARGIN;
    const yPos = y * this.cellSize + CELL_MARGIN;

    ctx.fillStyle = this.colors.empty;
    ctx.fillRect(xPos, yPos, this.cellSize - 2, this.cellSize - 2);

    ctx.fillStyle = this.colors.background;
    ctx.fillRect(
      xPos + this.cellPadding,
      yPos + this.cellPadding,
      this.cellSize - 2 * this.cellPadding - 2,
      this.cellSize - 2 * this.cellPadding - 2,
    );

    ctx.fillStyle = this.colors.empty;
    ctx.fillRect(xPos + this.innerCellOffset, yPos + this.innerCellOffset, this.innerCellSize, this.innerCellSize);
  }

  render(data: GameStateSnapshot, arena: ArenaLayout | null, myPlayerId: string | null): void {
    const mapWidth = size.col * this.cellSize;
    const mapHeight = size.row * this.cellSize;

    const me = myPlayerId ? data.players[myPlayerId] : undefined;
    const centerX = me ? (me.x + 1.5) * this.cellSize : mapWidth / 2;
    const centerY = me ? (me.y + 1.5) * this.cellSize : mapHeight / 2;

    // Rounded to a whole pixel — a fractional translate() would blur every
    // crisp 1px cell border via anti-aliasing instead of landing on exact
    // pixel boundaries like the original's untranslated grid did.
    const cameraX = Math.round(clamp(centerX - this.width / 2, 0, Math.max(0, mapWidth - this.width)));
    const cameraY = Math.round(clamp(centerY - this.height / 2, 0, Math.max(0, mapHeight - this.height)));

    // Reset to the DPR scale (see resize()) before every frame — everything
    // below keeps drawing in logical/CSS pixel coordinates on top of it.
    this.context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);

    // Letterboxing fallback for maps smaller than the viewport.
    this.context.fillStyle = this.colors.background;
    this.context.fillRect(0, 0, this.width, this.height);

    this.context.save();
    this.context.translate(-cameraX, -cameraY);

    this.context.drawImage(this.backgroundCanvas, 0, 0);

    this.renderWalls(arena?.walls);

    if (arena?.bricks) {
      this.renderBricks(arena.bricks);
    }

    if (data.base) {
      this.renderBase(data.base);
    }

    this.renderTanksAndBullets(data.players, data.bulletCells);

    this.context.restore();
  }

  private renderWalls(walls: WallState[] | undefined): void {
    if (!walls) return;

    this.context.fillStyle = '#654321';

    for (const wall of walls) {
      this.renderWallCell(wall.x, wall.y);
    }
  }

  private renderWallCell(x: number, y: number): void {
    const xPos = x * this.cellSize + CELL_MARGIN;
    const yPos = y * this.cellSize + CELL_MARGIN;

    this.context.fillStyle = '#4a2c17';
    this.context.fillRect(xPos, yPos, this.cellSize - 2, this.cellSize - 2);

    this.context.fillStyle = '#654321';
    this.context.fillRect(
      xPos + this.cellPadding,
      yPos + this.cellPadding,
      this.cellSize - 2 * this.cellPadding - 2,
      this.cellSize - 2 * this.cellPadding - 2,
    );

    this.context.fillStyle = '#8b4513';
    this.context.fillRect(xPos + this.innerCellOffset, yPos + this.innerCellOffset, this.innerCellSize, this.innerCellSize);
  }

  private renderBricks(bricks: BrickState[]): void {
    for (const brick of bricks) {
      if (brick.health > 0) {
        this.renderBrickCell(brick.x, brick.y);
      }
    }
  }

  private renderBrickCell(x: number, y: number): void {
    const xPos = x * this.cellSize + CELL_MARGIN;
    const yPos = y * this.cellSize + CELL_MARGIN;

    this.context.fillStyle = '#cc6633';
    this.context.fillRect(xPos, yPos, this.cellSize - 2, this.cellSize - 2);

    this.context.fillStyle = '#aa4422';
    this.context.fillRect(xPos + 2, yPos + 2, this.cellSize - 6, this.cellSize - 6);

    this.context.fillStyle = '#cc6633';
    this.context.fillRect(xPos + this.cellSize / 2 - 1, yPos + 4, 2, this.cellSize - 10);
    this.context.fillRect(xPos + 4, yPos + this.cellSize / 2 - 1, this.cellSize - 10, 2);
  }

  private renderBase(base: BaseState): void {
    if (!base || base.health <= 0) return;

    const baseX = base.x * this.cellSize + CELL_MARGIN;
    const baseY = base.y * this.cellSize + CELL_MARGIN;
    const baseSize = this.cellSize * 3;

    this.context.fillStyle = '#666666';
    this.context.fillRect(baseX, baseY, baseSize - 2, baseSize - 2);

    this.context.fillStyle = '#ffffff';
    this.context.fillRect(baseX + 4, baseY + 4, baseSize - 10, baseSize - 10);

    this.context.fillStyle = '#c20000';
    this.context.font = `${this.cellSize}px DS-Digital-Italic`;
    this.context.fillText('E', baseX + this.cellSize / 2, baseY + this.cellSize * 2);
  }

  // Client-side equivalent of the old server-stamped playField matrix:
  // each live player's 3x3 piece is stamped locally, then bullet cells paint
  // over everything, so bullets win the cell they occupy.
  //
  // Color ownership deliberately mirrors the previous renderer, quirks
  // included: a stamped cell takes the color/invulnerability flicker of the
  // FIRST player (in key order) whose whole 3x3 box covers the cell — which
  // during invulnerable pass-through overlaps may not be the player whose
  // piece actually filled it.
  private renderTanksAndBullets(
    players: GameStateSnapshot['players'],
    bulletCells: GameStateSnapshot['bulletCells'],
  ): void {
    const now = Date.now();
    const stampedCells = new Set<number>();

    for (const playerId in players) {
      const player = players[playerId];
      if (!player || !player.status) continue;

      const piece = positionPiece[player.position];
      if (!piece) continue;

      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          if (piece[y][x] !== 1) continue;

          const cellX = player.x + x;
          const cellY = player.y + y;
          if (cellX < 0 || cellX >= size.col || cellY < 0 || cellY >= size.row) continue;

          stampedCells.add(cellY * size.col + cellX);
        }
      }
    }

    for (const key of stampedCells) {
      const x = key % size.col;
      const y = (key - x) / size.col;

      let isInvulnerable = false;
      let playerColor: string | null = null;
      for (const playerId in players) {
        const player = players[playerId];
        if (player && player.status) {
          if (x >= player.x && x < player.x + 3 && y >= player.y && y < player.y + 3) {
            playerColor = player.color;

            if (player.invulnerableUntil && now < player.invulnerableUntil) {
              isInvulnerable = true;
            }
            break;
          }
        }
      }

      this.renderFilledCell(x, y, isInvulnerable, now, playerColor);
    }

    for (const cell of bulletCells) {
      this.renderFilledCell(cell.x, cell.y, false, now, null);
    }
  }

  private renderFilledCell(
    x: number,
    y: number,
    isInvulnerable = false,
    now = Date.now(),
    playerColor: string | null = null,
  ): void {
    const xPos = x * this.cellSize + CELL_MARGIN;
    const yPos = y * this.cellSize + CELL_MARGIN;

    let fillStyle = playerColor || this.colors.filled;

    if (isInvulnerable && Math.floor(now / 200) % 2 === 0) {
      fillStyle = this.colors.invulnerable;
    }

    this.context.fillStyle = fillStyle;
    this.context.fillRect(xPos, yPos, this.cellSize - 2, this.cellSize - 2);

    this.context.fillStyle = this.colors.background;
    this.context.fillRect(
      xPos + this.cellPadding,
      yPos + this.cellPadding,
      this.cellSize - 2 * this.cellPadding - 2,
      this.cellSize - 2 * this.cellPadding - 2,
    );

    this.context.fillStyle = fillStyle;
    this.context.fillRect(xPos + this.innerCellOffset, yPos + this.innerCellOffset, this.innerCellSize, this.innerCellSize);
  }
}
