import type { RoomState } from './state.js';

export class MapGenerator {
  constructor(private readonly state: RoomState) {}

  generatePvPMap(): void {
    const { state } = this;
    state.walls.length = 0;
    state.bricks.length = 0;

    // Wall 1: Vertical wall on left
    for (let y = 8; y < 22; y++) {
      state.walls.push({ x: 15, y, type: 'wall' });
    }

    // Wall 2: Horizontal wall on top
    for (let x = 20; x < 35; x++) {
      state.walls.push({ x, y: 10, type: 'wall' });
    }

    // Wall 3: Vertical wall on right
    for (let y = 5; y < 18; y++) {
      state.walls.push({ x: 35, y, type: 'wall' });
    }

    // Wall 4: Short horizontal wall at bottom
    for (let x = 8; x < 15; x++) {
      state.walls.push({ x, y: 20, type: 'wall' });
    }

    // Wall 5: L-shaped wall
    for (let x = 40; x < 45; x++) {
      state.walls.push({ x, y: 20, type: 'wall' });
    }
    for (let y = 20; y < 25; y++) {
      state.walls.push({ x: 40, y, type: 'wall' });
    }
  }

  generateCoopMap(): void {
    const { state } = this;
    state.walls.length = 0;
    state.bricks.length = 0;

    // Concrete walls (indestructible) - borders and obstacles
    // Top wall
    for (let x = 5; x < 45; x++) {
      if (x < 20 || x > 29) state.walls.push({ x, y: 3, type: 'wall' });
    }

    // Side walls
    for (let y = 3; y < 15; y++) {
      state.walls.push({ x: 5, y, type: 'wall' });
      state.walls.push({ x: 44, y, type: 'wall' });
    }

    // Central obstacle (concrete)
    for (let x = 20; x <= 29; x++) {
      state.walls.push({ x, y: 10, type: 'wall' });
    }
    for (let y = 8; y <= 12; y++) {
      state.walls.push({ x: 22, y, type: 'wall' });
      state.walls.push({ x: 27, y, type: 'wall' });
    }

    // Side obstacles (concrete)
    for (let y = 6; y < 10; y++) {
      state.walls.push({ x: 10, y, type: 'wall' });
      state.walls.push({ x: 39, y, type: 'wall' });
    }

    // Brick walls (destructible) - base protection
    const baseX = state.base.x;
    const baseY = state.base.y;

    // Top protection line
    for (let x = baseX - 2; x <= baseX + 4; x++) {
      state.bricks.push({ x, y: baseY - 2, type: 'brick', health: 1 });
    }

    // Side protection walls
    for (let y = baseY - 2; y <= baseY + 2; y++) {
      state.bricks.push({ x: baseX - 2, y, type: 'brick', health: 1 });
      state.bricks.push({ x: baseX + 4, y, type: 'brick', health: 1 });
    }

    // Additional brick obstacles on map
    // Left flank
    for (let y = 15; y < 20; y++) {
      state.bricks.push({ x: 8, y, type: 'brick', health: 1 });
      state.bricks.push({ x: 12, y, type: 'brick', health: 1 });
    }

    // Right flank
    for (let y = 15; y < 20; y++) {
      state.bricks.push({ x: 37, y, type: 'brick', health: 1 });
      state.bricks.push({ x: 41, y, type: 'brick', health: 1 });
    }

    // Central obstacles
    for (let x = 18; x <= 31; x += 2) {
      state.bricks.push({ x, y: 15, type: 'brick', health: 1 });
    }

    state.base.health = 1;
    state.gameState = 'playing';
    state.coopWave = 1;
    state.enemiesKilled = 0;
  }
}
