const { BULLET_POOL_SIZE } = require('../config/constants');
const state = require('../config/state');

// Random integer from 0 to max-1
function randomInteger(max) {
  return Math.floor(Math.random() * max);
}

// Check if position has a wall
function hasWallAt(x, y) {
  for (const wall of state.walls) {
    if (wall.x === x && wall.y === y) {
      return true;
    }
  }
  return false;
}

// Check if position has a brick
function hasBrickAt(x, y) {
  for (const brick of state.bricks) {
    if (brick.x === x && brick.y === y && brick.health > 0) {
      return true;
    }
  }
  return false;
}

// Initialize bullet pool
function initializeBulletPool() {
  for (let i = 0; i < BULLET_POOL_SIZE; i++) {
    state.bulletPool.push({
      id: null,
      position: null,
      x: 0,
      y: 0,
      direction: null,
      dx: 0,
      dy: 0,
      ownerId: null,
      active: false
    });
  }
}

// Get bullet from pool
function getBulletFromPool() {
  for (const bullet of state.bulletPool) {
    if (!bullet.active) {
      bullet.active = true;
      bullet.id = `bullet_${++state.bulletIdCounter}`;
      return bullet;
    }
  }
  // If pool is empty, create new bullet
  const bullet = {
    id: `bullet_${++state.bulletIdCounter}`,
    position: null,
    x: 0,
    y: 0,
    direction: null,
    dx: 0,
    dy: 0,
    ownerId: null,
    active: true
  };
  state.bulletPool.push(bullet);
  return bullet;
}

// Return bullet to pool
function returnBulletToPool(bulletId) {
  const bullet = state.activeBullets.get(bulletId);
  if (bullet) {
    bullet.active = false;
    bullet.ownerId = null;
    state.activeBullets.delete(bulletId);

    // Clear interval
    if (state.bulletIntervals[bulletId]) {
      clearInterval(state.bulletIntervals[bulletId]);
      delete state.bulletIntervals[bulletId];
    }
  }
}

// Generate empty playfield
function generatePlayField() {
  const { size } = require('../config/constants');
  for (let row = 0; row < size.row; row++) {
    state.playField[row] = new Array(size.col).fill(0);
  }
}

// Check line of sight to base
function hasLineOfSightToBase(fromX, fromY, direction) {
  const { bulletDirections } = require('../config/constants');
  const bulletConfig = bulletDirections[direction === 'bottom' ? 'top' : direction === 'top' ? 'bottom' : direction === 'left' ? 'right' : 'left'];
  if (!bulletConfig) return false;

  let checkX = fromX;
  let checkY = fromY;

  for (let i = 0; i < 20; i++) {
    checkX += bulletConfig.dx;
    checkY += bulletConfig.dy;

    // Reached base
    if (state.base.x <= checkX && checkX < state.base.x + 3 &&
        state.base.y <= checkY && checkY < state.base.y + 3) {
      return true;
    }

    // Check walls
    for (const wall of state.walls) {
      if (wall.x === checkX && wall.y === checkY) {
        return false;
      }
    }
  }

  return false;
}

module.exports = {
  randomInteger,
  hasWallAt,
  hasBrickAt,
  initializeBulletPool,
  getBulletFromPool,
  returnBulletToPool,
  generatePlayField,
  hasLineOfSightToBase,
};
