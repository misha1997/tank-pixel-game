const state = require('../config/state');
const constants = require('../config/constants');
const helpers = require('../utils/helpers');

let io; // Socket.io instance (set via init)

function init(socketIo) {
  io = socketIo;
}

// Create bullet from player
function createBullet(playerId) {
  const player = state.players[playerId];
  if (!player || !player.status) return;

  const bulletConfig = constants.bulletDirections[player.position];
  if (!bulletConfig) return;

  const bulletX = player.x + bulletConfig.offsetX;
  const bulletY = player.y + bulletConfig.offsetY;

  // Check bullet is within field bounds
  if (bulletX < 0 || bulletX >= constants.size.col || bulletY < 0 || bulletY >= constants.size.row) {
    return;
  }

  // Check bullet doesn't spawn in wall
  for (const wall of state.walls) {
    if (wall.x === bulletX && wall.y === bulletY) {
      return;
    }
  }

  const bullet = helpers.getBulletFromPool();
  bullet.position = player.position;
  bullet.x = bulletX;
  bullet.y = bulletY;
  bullet.direction = bulletConfig.dir;
  bullet.dx = bulletConfig.dx;
  bullet.dy = bulletConfig.dy;
  bullet.ownerId = playerId;

  // Add to active bullets
  state.activeBullets.set(bullet.id, bullet);

  // Add to player's bullets for compatibility
  if (!player.bullets) player.bullets = {};
  player.bullets[bullet.id] = bullet;

  state.bulletIntervals[bullet.id] = setInterval(() => {
    if (!bullet.active || !state.players[playerId]) {
      helpers.returnBulletToPool(bullet.id);
      return;
    }

    // Check next position before moving
    const nextX = bullet.x + bullet.dx;
    const nextY = bullet.y + bullet.dy;

    // Check wall collision on path
    for (const wall of state.walls) {
      if (wall.x === nextX && wall.y === nextY) {
        helpers.returnBulletToPool(bullet.id);
        delete player.bullets[bullet.id];
        return;
      }
    }

    bullet.x = nextX;
    bullet.y = nextY;

    if (checkBulletHit(bullet, playerId, bullet.id)) {
      helpers.returnBulletToPool(bullet.id);
      if (state.players[playerId] && state.players[playerId].bullets) {
        delete state.players[playerId].bullets[bullet.id];
      }
    }
  }, constants.BULLET_SPEED);
}

// Check bullet hit
function checkBulletHit(bullet, shooterId, bulletId) {
  if (bullet.x < 0 || bullet.x >= constants.size.col || bullet.y < 0 || bullet.y >= constants.size.row) {
    return true;
  }

  // Check wall collision
  for (const wall of state.walls) {
    if (wall.x === bullet.x && wall.y === bullet.y) {
      return true;
    }
  }

  // Check brick collision (coop mode only)
  if (state.gameMode === 'coop') {
    for (let i = 0; i < state.bricks.length; i++) {
      const brick = state.bricks[i];
      if (brick.x === bullet.x && brick.y === bullet.y && brick.health > 0) {
        brick.health--;
        if (brick.health <= 0) {
          io.sockets.emit('brick destroyed', { x: brick.x, y: brick.y });
        }
        return true;
      }
    }

    // Check base collision
    if (state.base.x <= bullet.x && bullet.x < state.base.x + 3 &&
        state.base.y <= bullet.y && bullet.y < state.base.y + 3) {
      state.base.health--;
      io.sockets.emit('base hit', { health: state.base.health });
      const { checkCoopDefeat } = require('./coop');
      checkCoopDefeat();
      return true;
    }
  }

  const now = Date.now();

  for (const playerId in state.players) {
    if (playerId === shooterId) continue;

    const target = state.players[playerId];
    if (!target.status || !constants.positionPiece[target.position]) continue;

    // Check invulnerability
    if (target.invulnerableUntil && now < target.invulnerableUntil) continue;

    // Check if player is exploding
    if (target.exploding && now < target.explosionEndTime) continue;

    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (constants.positionPiece[target.position][y][x] === 1) {
          const cellX = target.x + x;
          const cellY = target.y + y;

          if (bullet.x === cellX && bullet.y === cellY) {
            if (target.position !== 'boomOne' && target.position !== 'boomTwo') {
              state.players[shooterId].rating++;
              const { boomAnimate } = require('./player');
              boomAnimate(playerId);
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

// Check optimized bullet collisions
function checkBulletCollisions() {
  const bulletsToRemove = [];
  const bulletPositions = new Map();

  // Collect all bullet positions
  for (const [bulletId, bullet] of state.activeBullets) {
    const posKey = `${bullet.x},${bullet.y}`;
    if (bulletPositions.has(posKey)) {
      // Collision found
      bulletsToRemove.push(bulletId);
      bulletsToRemove.push(bulletPositions.get(posKey));
    } else {
      bulletPositions.set(posKey, bulletId);
    }
  }

  // Remove collided bullets
  for (const bulletId of bulletsToRemove) {
    if (state.activeBullets.has(bulletId)) {
      const bullet = state.activeBullets.get(bulletId);
      if (bullet && bullet.ownerId && state.players[bullet.ownerId]) {
        delete state.players[bullet.ownerId].bullets[bulletId];
      }
      helpers.returnBulletToPool(bulletId);
      io.sockets.emit('explosion', { x: bullet.x, y: bullet.y });
    }
  }
}

// Check wall collision for player movement
function checkWallCollision(newX, newY, position) {
  const playerPiece = constants.positionPiece[position];
  if (!playerPiece) return false;

  // Check each tank cell for wall collision
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (playerPiece[y][x] === 1) {
        const checkX = newX + x;
        const checkY = newY + y;

        // Check bounds
        if (checkX < 0 || checkX >= constants.size.col || checkY < 0 || checkY >= constants.size.row) {
          return true;
        }

        // Check walls
        for (const wall of state.walls) {
          if (wall.x === checkX && wall.y === checkY) {
            return true;
          }
        }

        // Check bricks (coop mode)
        if (state.gameMode === 'coop') {
          for (const brick of state.bricks) {
            if (brick.x === checkX && brick.y === checkY && brick.health > 0) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

module.exports = {
  init,
  createBullet,
  checkBulletHit,
  checkBulletCollisions,
  checkWallCollision,
};
