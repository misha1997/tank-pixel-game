const state = require('../config/state');
const constants = require('../config/constants');
const helpers = require('../utils/helpers');
const bulletModule = require('./bullet');

let io;

function init(socketIo) {
  io = socketIo;
}

// Get safe spawn position
function getSafeSpawnPosition() {
  let attempts = 0;
  const maxAttempts = 50;
  const positions = ['top', 'left', 'right', 'bottom'];

  while (attempts < maxAttempts) {
    const x = helpers.randomInteger(constants.size.col - 3);
    const y = helpers.randomInteger(constants.size.row - 3);

    let isSafe = true;

    // Check position not in wall (check all rotations)
    let inWall = false;
    for (const pos of positions) {
      if (bulletModule.checkWallCollision(x, y, pos)) {
        inWall = true;
        break;
      }
    }
    if (inWall) {
      attempts++;
      continue;
    }

    // Check distance from other players
    for (const playerId in state.players) {
      const player = state.players[playerId];
      if (player.status && Math.abs(player.x - x) < 5 && Math.abs(player.y - y) < 5) {
        isSafe = false;
        break;
      }
    }

    if (isSafe) {
      return { x, y };
    }
    attempts++;
  }

  return { x: helpers.randomInteger(constants.size.col - 3), y: helpers.randomInteger(constants.size.row - 3) };
}

// Move player
function movePlayer(playerId, dx, dy, position) {
  const player = state.players[playerId];
  if (!player || !player.status) return;

  // Check if player is exploding
  const now = Date.now();
  if (player.exploding && now < player.explosionEndTime) {
    return;
  }

  const newX = player.x + dx;
  const newY = player.y + dy;

  if (newX < 0 || newX >= constants.size.col - 3 || newY < 0 || newY >= constants.size.row - 3) return;

  // Check wall collision
  if (bulletModule.checkWallCollision(newX, newY, position)) {
    return;
  }

  const collidedPlayer = checkPlayerCollision(player, newX, newY, position);
  if (collidedPlayer) {
    const collided = state.players[collidedPlayer];
    if (collided) {
      boomAnimate(playerId);
      boomAnimate(collidedPlayer);
      io.sockets.emit('collision explosion', {
        x: (player.x + collided.x) / 2,
        y: (player.y + collided.y) / 2
      });
    }
  } else {
    player.x = newX;
    player.y = newY;
    player.position = position;
  }
}

// Check player collision
function checkPlayerCollision(player, newX, newY, newPosition) {
  const playerPiece = constants.positionPiece[newPosition];
  if (!playerPiece) return null;

  const now = Date.now();

  // Skip if player is exploding
  if (player.exploding && now < player.explosionEndTime) return null;

  // Quick distance check for all players
  for (const playerId in state.players) {
    const otherPlayer = state.players[playerId];
    if (otherPlayer === player || !otherPlayer.status) continue;

    // In coop mode players don't collide with each other (only with enemies)
    if (state.gameMode === 'coop' && !player.isBot && !otherPlayer.isBot) continue;

    // Skip exploding players
    if (otherPlayer.exploding && now < otherPlayer.explosionEndTime) continue;

    const playerInvulnerable = player.invulnerableUntil && now < player.invulnerableUntil;
    const otherInvulnerable = otherPlayer.invulnerableUntil && now < otherPlayer.invulnerableUntil;

    if (playerInvulnerable || otherInvulnerable) continue;

    // Quick distance check
    const distance = Math.abs(newX - otherPlayer.x) + Math.abs(newY - otherPlayer.y);
    if (distance > constants.COLLISION_CHECK_DISTANCE) continue;

    // Detailed check for close players
    if (checkDetailedCollision(playerPiece, newX, newY, otherPlayer)) {
      return playerId;
    }
  }
  return null;
}

// Detailed collision check
function checkDetailedCollision(playerPiece, newX, newY, otherPlayer) {
  const otherPiece = constants.positionPiece[otherPlayer.position];
  if (!otherPiece) return false;

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (playerPiece[y][x] !== 1) continue;

      const checkX = newX + x;
      const checkY = newY + y;

      const startX = Math.max(0, checkX - otherPlayer.x);
      const endX = Math.min(3, checkX - otherPlayer.x + 1);
      const startY = Math.max(0, checkY - otherPlayer.y);
      const endY = Math.min(3, checkY - otherPlayer.y + 1);

      for (let oy = startY; oy < endY; oy++) {
        for (let ox = startX; ox < endX; ox++) {
          if (otherPiece[oy][ox] === 1) {
            const otherX = otherPlayer.x + ox;
            const otherY = otherPlayer.y + oy;
            if (checkX === otherX && checkY === otherY) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

// Death animation
function boomAnimate(playerId) {
  const player = state.players[playerId];
  if (!player || !player.status) return;

  const now = Date.now();
  const explosionDuration = 600;

  player.exploding = true;
  player.explosionEndTime = now + explosionDuration;

  io.sockets.emit('user dead sound');

  player.position = 'boomOne';
  setTimeout(() => {
    if (state.players[playerId]) state.players[playerId].position = 'boomTwo';
  }, 200);
  setTimeout(() => {
    if (state.players[playerId]) state.players[playerId].position = 'boomOne';
  }, 400);
  setTimeout(() => {
    if (state.players[playerId]) {
      state.players[playerId].status = false;
      state.players[playerId].exploding = false;
      io.sockets.emit('user dead', playerId);
    }
  }, explosionDuration);
}

// Restart player with invulnerability
function restartPlayer(playerId) {
  const player = state.players[playerId];
  if (!player) return;

  const positions = ['top', 'left', 'right', 'bottom'];
  const spawnPos = getSafeSpawnPosition();

  player.status = true;
  player.x = spawnPos.x;
  player.y = spawnPos.y;
  player.position = positions[helpers.randomInteger(4)];
  player.bullets = {};
  player.lastShot = 0;
  player.invulnerableUntil = Date.now() + constants.INVULNERABILITY_TIME;
  player.exploding = false;
  player.explosionEndTime = 0;
  player.respawnShootingCooldown = Date.now() + 2000;

  if (!player.isBot) {
    player.rating = 0;
  }
}

// Apply player to playfield
function applyPlayerToField(player) {
  const piece = constants.positionPiece[player.position];
  if (!piece) return;

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (piece[y][x] === 1 && player.status) {
        const posX = player.x + x;
        const posY = player.y + y;

        if (posX >= 0 && posX < constants.size.col && posY >= 0 && posY < constants.size.row) {
          state.playField[posY][posX] = 1;
        }
      }
    }
  }
}

// Check brick collision
function checkBrickCollision(newX, newY, position) {
  const playerPiece = constants.positionPiece[position];
  if (!playerPiece) return false;

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (playerPiece[y][x] === 1) {
        const checkX = newX + x;
        const checkY = newY + y;

        for (const brick of state.bricks) {
          if (brick.x === checkX && brick.y === checkY && brick.health > 0) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

module.exports = {
  init,
  getSafeSpawnPosition,
  movePlayer,
  checkPlayerCollision,
  checkDetailedCollision,
  boomAnimate,
  restartPlayer,
  applyPlayerToField,
  checkBrickCollision,
};
