import { size } from '@tank/shared';
import type { BaseState, BrickState, GameStateSnapshot, PlayerState, WallState } from '@tank/shared';

const MIN_CELL_SIZE = 6;
const MAX_CELL_SIZE = 32;

export default class View {
  private element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private backgroundCanvas: HTMLCanvasElement;
  private backgroundContext: CanvasRenderingContext2D;

  private width = 0;
  private height = 0;

  // Recomputed every resize() so the grid fills whatever viewport it's
  // given instead of being anchored at a fixed pixel size — see resize().
  private cellSize = 22;
  private cellPadding = 2;
  private innerCellSize = 12;
  private innerCellOffset = 4;
  private uiFontSize = 22;
  private readonly uiWidth = 300;

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

    this.backgroundCanvas = document.createElement('canvas');
    this.backgroundContext = this.backgroundCanvas.getContext('2d')!;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.element.appendChild(this.canvas);
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    const availableWidth = Math.max(0, this.width - this.uiWidth);
    const rawCellSize = Math.min(availableWidth / size.col, this.height / size.row) || MIN_CELL_SIZE;
    this.cellSize = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, Math.floor(rawCellSize)));
    this.cellPadding = Math.max(1, Math.round(this.cellSize * 0.09));
    this.innerCellOffset = Math.max(2, Math.round(this.cellSize * 0.18));
    this.innerCellSize = Math.max(2, this.cellSize - this.innerCellOffset * 2);
    this.uiFontSize = Math.max(12, this.cellSize);
    this.context.font = `${this.uiFontSize}px DS-Digital-Italic`;

    if (this.backgroundCanvas) {
      this.updateBackground();
    }
  }

  private updateBackground(): void {
    this.backgroundCanvas.width = this.width;
    this.backgroundCanvas.height = this.height;
    this.drawBackground();
  }

  private drawBackground(): void {
    this.backgroundContext.fillStyle = this.colors.background;
    this.backgroundContext.fillRect(0, 0, this.width, this.height);

    for (let y = 0; y < size.row; y++) {
      for (let x = 0; x < size.col; x++) {
        this.renderEmptyCell(x, y, this.backgroundContext);
      }
    }
  }

  private renderEmptyCell(x: number, y: number, ctx: CanvasRenderingContext2D): void {
    const xPos = x * this.cellSize;
    const yPos = y * this.cellSize;

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

  render(data: GameStateSnapshot, myPlayerId: string | null): void {
    this.context.drawImage(this.backgroundCanvas, 0, 0);

    this.renderWalls(data.walls);

    if (data.bricks) {
      this.renderBricks(data.bricks);
    }

    if (data.base) {
      this.renderBase(data.base);
    }

    this.renderPlayField(data.playField, data.players);

    this.renderPlayers(data.players, myPlayerId, data);
  }

  private renderWalls(walls: WallState[] | undefined): void {
    if (!walls) return;

    this.context.fillStyle = '#654321';

    for (const wall of walls) {
      this.renderWallCell(wall.x, wall.y);
    }
  }

  private renderWallCell(x: number, y: number): void {
    const xPos = x * this.cellSize;
    const yPos = y * this.cellSize;

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
    const xPos = x * this.cellSize;
    const yPos = y * this.cellSize;

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

    const baseX = base.x * this.cellSize;
    const baseY = base.y * this.cellSize;
    const baseSize = this.cellSize * 3;

    this.context.fillStyle = '#666666';
    this.context.fillRect(baseX, baseY, baseSize - 2, baseSize - 2);

    this.context.fillStyle = '#ffffff';
    this.context.fillRect(baseX + 4, baseY + 4, baseSize - 10, baseSize - 10);

    this.context.fillStyle = '#c20000';
    this.context.font = `${this.cellSize}px DS-Digital-Italic`;
    this.context.fillText('E', baseX + this.cellSize / 2, baseY + this.cellSize * 2);
  }

  private renderPlayField(playField: number[][], players: Record<string, PlayerState>): void {
    const now = Date.now();

    for (let y = 0; y < playField.length; y++) {
      for (let x = 0; x < playField[y].length; x++) {
        if (playField[y][x] === 1) {
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
      }
    }
  }

  private renderFilledCell(
    x: number,
    y: number,
    isInvulnerable = false,
    now = Date.now(),
    playerColor: string | null = null,
  ): void {
    const xPos = x * this.cellSize;
    const yPos = y * this.cellSize;

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

  private renderPlayers(players: Record<string, PlayerState>, myPlayerId: string | null, data: GameStateSnapshot): void {
    const uiX = this.width - this.uiWidth;
    const baseFont = this.uiFontSize;
    const smallFont = Math.round(baseFont * 0.82);
    const largeFont = Math.round(baseFont * 1.09);
    const lineHeight = Math.round(smallFont * 1.25);

    this.context.fillStyle = 'rgba(154, 166, 128, 0.95)';
    this.context.fillRect(uiX, 0, this.uiWidth, this.height);

    this.context.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    this.context.lineWidth = 2;
    this.context.strokeRect(uiX, 0, this.uiWidth, this.height);

    this.context.font = `${baseFont}px DS-Digital-Italic`;
    this.context.fillStyle = this.colors.empty;

    if (data && data.gameMode === 'coop') {
      this.context.fillStyle = '#c20000';
      this.context.fillText('CO-OP DEFENSE', uiX + 10, lineHeight);

      this.context.fillStyle = this.colors.filled;
      this.context.font = `${smallFont}px DS-Digital-Italic`;
      this.context.fillText(`WAVE: ${data.wave || 1}`, uiX + 10, lineHeight * 2);
      this.context.fillText(`ENEMIES: ${data.enemiesRemaining || 0}`, uiX + 10, lineHeight * 3);
      this.context.fillText(`KILLED: ${data.enemiesKilled || 0}`, uiX + 10, lineHeight * 4);

      if (data.base) {
        const baseHealth = data.base.health > 0 ? 'OK' : 'DESTROYED';
        const baseColor = data.base.health > 0 ? '#00AA00' : '#ff0000';
        this.context.fillStyle = baseColor;
        this.context.fillText(`BASE: ${baseHealth}`, uiX + 10, lineHeight * 5);
      }

      if (data.gameState === 'defeat') {
        this.context.fillStyle = '#ff0000';
        this.context.font = `${largeFont}px DS-Digital-Italic`;
        this.context.fillText('GAME OVER', uiX + 10, lineHeight * 7);
      } else if (data.gameState === 'victory') {
        this.context.fillStyle = '#00AA00';
        this.context.font = `${largeFont}px DS-Digital-Italic`;
        this.context.fillText('VICTORY!', uiX + 10, lineHeight * 7);
      }

      this.context.fillStyle = this.colors.filled;
      this.context.font = `${smallFont}px DS-Digital-Italic`;
      let playerY = lineHeight * 9;
      for (const playerId in players) {
        const player = players[playerId];
        if (player.isBot) continue;

        const isMe = playerId === myPlayerId;
        const prefix = isMe ? '► ' : '';
        const lives = '♥'.repeat(player.lives || 1);
        this.context.fillText(`${prefix}${player.name}: ${lives}`, uiX + 10, playerY);
        playerY += lineHeight;
      }

      return;
    }

    this.context.fillStyle = this.colors.filled;
    let countPlayers = 0;
    let playerPosition = lineHeight;
    const playersArray = Object.entries(players);

    playersArray.sort((a, b) => b[1].score - a[1].score);

    this.context.font = `${smallFont}px DS-Digital-Italic`;
    for (let i = 0; i < playersArray.length; i++) {
      const [playerId, player] = playersArray[i];
      countPlayers++;
      playerPosition += lineHeight;

      const isMe = playerId === myPlayerId;
      const isBot = player.isBot;
      const isDead = !player.status;

      let color = player.color || this.colors.filled;
      if (isDead) {
        color = '#888888';
      }

      this.context.fillStyle = color;

      const prefix = isMe ? '► ' : isBot ? '[B] ' : '';
      const status = isDead ? ' [DEAD]' : '';
      const text = `${i + 1}: ${prefix}${player.name} - ${player.score}${status}`;

      this.context.fillText(text, uiX + 10, playerPosition);
    }

    this.context.font = `${baseFont}px DS-Digital-Italic`;
    this.context.fillStyle = this.colors.filled;
    this.context.fillText('Players: ' + countPlayers, uiX + 10, Math.round(baseFont * 0.9));

    if (countPlayers > 2) {
      this.renderMiniMap(players, myPlayerId, uiX);
    }
  }

  private renderMiniMap(players: Record<string, PlayerState>, myPlayerId: string | null, uiX: number): void {
    const miniMapX = uiX + 20;
    const miniMapY = Math.min(this.height - 220, 400);
    const miniMapHeight = 250;
    const miniMapWidth = 150;
    const scale = miniMapHeight / size.col;

    this.context.fillStyle = 'rgba(0, 0, 0, 0.15)';
    this.context.fillRect(miniMapX, miniMapY, miniMapHeight, miniMapWidth);

    this.context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    this.context.lineWidth = 2;
    this.context.strokeRect(miniMapX, miniMapY, miniMapHeight, miniMapWidth);

    for (const playerId in players) {
      const player = players[playerId];
      if (!player.status) continue;

      const isMe = playerId === myPlayerId;
      const x = miniMapX + player.x * scale;
      const y = miniMapY + player.y * scale;

      this.context.fillStyle = player.color || (isMe ? '#00AA00' : player.isBot ? '#FF4444' : '#4ECDC4');
      this.context.beginPath();
      this.context.arc(x + scale, y + scale, isMe ? 5 : 3, 0, Math.PI * 2);
      this.context.fill();

      let dirX = 0;
      let dirY = 0;
      switch (player.position) {
        case 'top':
          dirY = -8;
          break;
        case 'bottom':
          dirY = 8;
          break;
        case 'left':
          dirX = 8;
          break;
        case 'right':
          dirX = -8;
          break;
      }

      if (dirX || dirY) {
        this.context.strokeStyle = this.context.fillStyle as string;
        this.context.lineWidth = 2;
        this.context.beginPath();
        this.context.moveTo(x + scale, y + scale);
        this.context.lineTo(x + scale + dirX, y + scale + dirY);
        this.context.stroke();
      }
    }

    const smallFont = Math.round(this.uiFontSize * 0.82);
    this.context.fillStyle = this.colors.filled;
    this.context.font = `${smallFont}px DS-Digital-Italic`;
    this.context.fillText('Mini Map', miniMapX, miniMapY - 10);
    this.context.font = `${this.uiFontSize}px DS-Digital-Italic`;
  }
}
