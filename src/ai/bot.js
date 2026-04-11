const state = require('../config/state');
const constants = require('../config/constants');
const helpers = require('../utils/helpers');
const bulletModule = require('../game/bullet');
const playerModule = require('../game/player');

let io;

function init(socketIo) {
  io = socketIo;
}

// Coop enemy AI
function coopEnemyAI(botId) {
  const bot = state.players[botId];
  const memory = state.botMemory[botId];
  if (!bot || !bot.status || !memory) return;

  const now = Date.now();

  // Update position memory
  if (!memory.positions) memory.positions = [];
  if (now - (memory.lastPosUpdate || 0) > 500) {
    memory.positions.push({ x: bot.x, y: bot.y, time: now });
    if (memory.positions.length > 5) memory.positions.shift();
    memory.lastPosUpdate = now;
  }

  // Check if stuck
  if (isStuck(memory)) {
    memory.stuckCounter = (memory.stuckCounter || 0) + 1;
    if (memory.stuckCounter > 3) {
      const emergencyMove = getRandomValidMove(bot);
      if (emergencyMove) {
        tryMove(botId, emergencyMove.dx, emergencyMove.dy, emergencyMove.pos);
        memory.stuckCounter = 0;
        return;
      }
    }
  } else {
    memory.stuckCounter = 0;
  }

  // 1. PRIORITY: Dodge player bullets
  const dodgeMove = shouldDodgeBullet(bot);
  if (dodgeMove && now - (memory.lastDodge || 0) > 300) {
    tryMove(botId, dodgeMove.dx, dodgeMove.dy, dodgeMove.pos);
    memory.lastDodge = now;
    return;
  }

  // 2. PRIORITY: Attack players if close and vulnerable
  const playerThreat = findBestPlayerTarget(bot);
  if (playerThreat && playerThreat.distance <= 6) {
    if (canShootTarget(bot, playerThreat.player) &&
        now - bot.lastShot > constants.BULLET_COOLDOWN &&
        now > bot.respawnShootingCooldown) {
      bot.position = playerThreat.position;
      bot.lastShot = now;
      bulletModule.createBullet(botId);
      memory.targetPlayer = playerThreat.playerId;
      return;
    }

    if (playerThreat.distance < 4) {
      const retreat = calculateRetreat(bot, playerThreat.player);
      if (retreat) {
        tryMove(botId, retreat.dx, retreat.dy, retreat.pos);
        return;
      }
    }
  }

  // 3. PRIORITY: Attack base
  const attackPos = findBestAttackPosition(bot, botId);

  if (attackPos.canShoot) {
    bot.position = attackPos.position;
    if (now - bot.lastShot > constants.BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
      bot.lastShot = now;
      bulletModule.createBullet(botId);
    }
    return;
  }

  // 4. Move to attack position
  if (attackPos.targetX !== undefined && attackPos.targetY !== undefined) {
    const move = calculateSmartPath(bot, attackPos.targetX, attackPos.targetY);
    if (move && !isCollidingWithOtherBots(bot, botId, move)) {
      tryMove(botId, move.dx, move.dy, move.pos);
      memory.lastMove = move;
      memory.lastTarget = { x: attackPos.targetX, y: attackPos.targetY };
      return;
    }
  }

  // 5. Destroy obstacles
  if (now - bot.lastShot > constants.BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
    const obstacle = findBestObstacleToShoot(bot);
    if (obstacle) {
      bot.position = obstacle.position;
      bot.lastShot = now;
      bulletModule.createBullet(botId);
      return;
    }
  }

  // 6. Patrol if nothing to do
  const patrolMove = getPatrolMove(bot, memory);
  if (patrolMove) {
    tryMove(botId, patrolMove.dx, patrolMove.dy, patrolMove.pos);
  }
}

// Find player in sight
function findPlayerInSight(bot) {
  const directions = ['top', 'bottom', 'left', 'right'];

  for (const dir of directions) {
    const bulletConfig = constants.bulletDirections[dir];
    if (!bulletConfig) continue;

    let checkX = bot.x + bulletConfig.offsetX;
    let checkY = bot.y + bulletConfig.offsetY;

    for (let i = 0; i < 10; i++) {
      checkX += bulletConfig.dx;
      checkY += bulletConfig.dy;

      for (const playerId in state.players) {
        const player = state.players[playerId];
        if (player && player.status && !player.isBot &&
            checkX >= player.x && checkX < player.x + 3 &&
            checkY >= player.y && checkY < player.y + 3) {
          return { position: dir };
        }
      }

      for (const wall of state.walls) {
        if (wall.x === checkX && wall.y === checkY) break;
      }
    }
  }
  return null;
}

// Check if stuck
function isStuck(memory) {
  if (!memory || !memory.positions || memory.positions.length < 4) return false;
  const recent = memory.positions.slice(-4);
  const first = recent[0];
  for (const pos of recent) {
    if (Math.abs(pos.x - first.x) > 1 || Math.abs(pos.y - first.y) > 1) {
      return false;
    }
  }
  return true;
}

// Get random valid move
function getRandomValidMove(bot) {
  const moves = [
    { dx: 0, dy: -1, pos: 'top' },
    { dx: 0, dy: 1, pos: 'bottom' },
    { dx: -1, dy: 0, pos: 'left' },
    { dx: 1, dy: 0, pos: 'right' }
  ];
  const shuffled = moves.sort(() => Math.random() - 0.5);
  for (const move of shuffled) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;
    if (newX >= 0 && newX < constants.size.col - 3 &&
        newY >= 0 && newY < constants.size.row - 3 &&
        !bulletModule.checkWallCollision(newX, newY, move.pos)) {
      return move;
    }
  }
  return null;
}

// Should dodge bullet
function shouldDodgeBullet(bot) {
  const now = Date.now();
  let threat = null;
  let minDist = Infinity;

  for (const [bulletId, bullet] of state.activeBullets) {
    if (!bullet.active) continue;
    if (bullet.ownerId && state.players[bullet.ownerId]?.isCoopEnemy) continue;

    const dist = Math.abs(bullet.x - bot.x) + Math.abs(bullet.y - bot.y);
    if (dist < minDist && dist < 6) {
      if (isHeadingTowards(bullet, bot)) {
        minDist = dist;
        threat = bullet;
      }
    }
  }

  if (!threat) return null;

  const moves = [
    { dx: 1, dy: 0, pos: 'left' },
    { dx: -1, dy: 0, pos: 'right' },
    { dx: 0, dy: 1, pos: 'top' },
    { dx: 0, dy: -1, pos: 'bottom' }
  ];

  for (const move of moves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;
    if (newX >= 0 && newX < constants.size.col - 3 &&
        newY >= 0 && newY < constants.size.row - 3 &&
        !bulletModule.checkWallCollision(newX, newY, move.pos) &&
        !wouldBeHit({ x: newX, y: newY }, threat)) {
      return move;
    }
  }
  return null;
}

// Find best player target
function findBestPlayerTarget(bot) {
  let bestTarget = null;
  let minDistance = Infinity;
  let bestPosition = null;

  for (const playerId in state.players) {
    const player = state.players[playerId];
    if (!player || !player.status || player.isBot || player.isCoopEnemy) continue;

    const now = Date.now();
    if (player.invulnerableUntil && now < player.invulnerableUntil) continue;
    if (player.exploding && now < player.explosionEndTime) continue;

    const dist = Math.abs(bot.x - player.x) + Math.abs(bot.y - player.y);
    if (dist < minDistance) {
      const shootPos = canShootTargetFrom(bot, player);
      if (shootPos) {
        minDistance = dist;
        bestTarget = player;
        bestPosition = shootPos;
      }
    }
  }

  return bestTarget ? { player: bestTarget, playerId: bestTarget.id || Object.keys(state.players).find(k => state.players[k] === bestTarget), distance: minDistance, position: bestPosition } : null;
}

// Can shoot target
function canShootTarget(bot, target) {
  return canShootTargetFrom(bot, target);
}

// Can shoot target from position
function canShootTargetFrom(bot, target) {
  const directions = ['top', 'bottom', 'left', 'right'];
  for (const dir of directions) {
    const bulletConfig = constants.bulletDirections[dir];
    if (!bulletConfig) continue;

    let checkX = bot.x + bulletConfig.offsetX;
    let checkY = bot.y + bulletConfig.offsetY;

    for (let i = 0; i < 15; i++) {
      checkX += bulletConfig.dx;
      checkY += bulletConfig.dy;

      if (target.x <= checkX && checkX < target.x + 3 &&
          target.y <= checkY && checkY < target.y + 3) {
        return dir;
      }

      for (const wall of state.walls) {
        if (wall.x === checkX && wall.y === checkY) break;
      }
    }
  }
  return null;
}

// Calculate retreat
function calculateRetreat(bot, player) {
  const dx = bot.x - player.x;
  const dy = bot.y - player.y;

  const moves = [];
  if (Math.abs(dx) > Math.abs(dy)) {
    moves.push({ dx: dx > 0 ? 1 : -1, dy: 0, pos: dx > 0 ? 'left' : 'right' });
    moves.push({ dx: 0, dy: dy > 0 ? 1 : -1, pos: dy > 0 ? 'top' : 'bottom' });
  } else {
    moves.push({ dx: 0, dy: dy > 0 ? 1 : -1, pos: dy > 0 ? 'top' : 'bottom' });
    moves.push({ dx: dx > 0 ? 1 : -1, dy: 0, pos: dx > 0 ? 'left' : 'right' });
  }

  for (const move of moves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;
    if (newX >= 0 && newX < constants.size.col - 3 &&
        newY >= 0 && newY < constants.size.row - 3 &&
        !bulletModule.checkWallCollision(newX, newY, move.pos)) {
      return move;
    }
  }
  return null;
}

// Check collision with other bots
function isCollidingWithOtherBots(bot, botId, move) {
  const newX = bot.x + move.dx;
  const newY = bot.y + move.dy;

  for (const otherId in state.players) {
    if (otherId === botId) continue;
    const other = state.players[otherId];
    if (!other || !other.status || !other.isCoopEnemy) continue;

    const dist = Math.abs(newX - other.x) + Math.abs(newY - other.y);
    if (dist < 2) return true;
  }
  return false;
}

// Calculate smart path
function calculateSmartPath(bot, targetX, targetY) {
  const dx = Math.sign(targetX - bot.x);
  const dy = Math.sign(targetY - bot.y);

  const moves = [];
  if (Math.abs(targetX - bot.x) > Math.abs(targetY - bot.y)) {
    if (dx !== 0) moves.push({ dx, dy: 0, pos: dx > 0 ? 'left' : 'right' });
    if (dy !== 0) moves.push({ dx: 0, dy, pos: dy > 0 ? 'bottom' : 'top' });
  } else {
    if (dy !== 0) moves.push({ dx: 0, dy, pos: dy > 0 ? 'bottom' : 'top' });
    if (dx !== 0) moves.push({ dx, dy: 0, pos: dx > 0 ? 'left' : 'right' });
  }

  for (const move of moves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;
    if (newX >= 0 && newX < constants.size.col - 3 &&
        newY >= 0 && newY < constants.size.row - 3 &&
        !bulletModule.checkWallCollision(newX, newY, move.pos)) {
      return move;
    }
  }
  return null;
}

// Find best obstacle to shoot
function findBestObstacleToShoot(bot) {
  for (const brick of state.bricks) {
    if (brick.health > 0) {
      const dist = Math.abs(bot.x - brick.x) + Math.abs(bot.y - brick.y);
      if (dist <= 5) {
        const shootPos = canShootTargetFrom(bot, { x: brick.x - 1, y: brick.y - 1, getHitbox: () => ({ x: brick.x, y: brick.y, w: 1, h: 1 }) });
        if (shootPos) {
          return { position: shootPos };
        }
      }
    }
  }
  return null;
}

// Get patrol move
function getPatrolMove(bot, memory) {
  return getRandomValidMove(bot);
}

// Find best attack position with bot distribution
function findBestAttackPosition(bot, botId) {
  const baseCenterX = state.base.x + 1;
  const baseCenterY = state.base.y + 1;

  const attackPositions = [
    { x: state.base.x - 4, y: baseCenterY, pos: 'left', dir: 'right' },
    { x: state.base.x + 6, y: baseCenterY, pos: 'right', dir: 'left' },
    { x: baseCenterX, y: state.base.y - 4, pos: 'top', dir: 'bottom' }
  ];

  const positionCounts = { left: 0, right: 0, top: 0 };
  for (const otherId in state.botMemory) {
    if (otherId === botId) continue;
    const otherMemory = state.botMemory[otherId];
    if (otherMemory && otherMemory.attackTargetPos) {
      positionCounts[otherMemory.attackTargetPos]++;
    }
  }

  const availablePositions = attackPositions
    .filter(pos => helpers.hasLineOfSightToBase(pos.x, pos.y, pos.dir))
    .map(pos => ({
      ...pos,
      distance: Math.abs(bot.x - pos.x) + Math.abs(bot.y - pos.y),
      botsTargeting: positionCounts[pos.pos]
    }))
    .sort((a, b) => {
      if (a.botsTargeting !== b.botsTargeting) {
        return a.botsTargeting - b.botsTargeting;
      }
      return a.distance - b.distance;
    });

  let bestPos = availablePositions.length > 0 ? availablePositions[0] : null;

  for (const pos of availablePositions) {
    if (Math.abs(bot.x - pos.x) <= 2 && Math.abs(bot.y - pos.y) <= 2) {
      bestPos = pos;
      break;
    }
  }

  if (bestPos && state.botMemory[botId]) {
    state.botMemory[botId].attackTargetPos = bestPos.pos;
  }

  if (bestPos && Math.abs(bot.x - bestPos.x) <= 1 && Math.abs(bot.y - bestPos.y) <= 1) {
    return { canShoot: true, position: bestPos.dir };
  }

  const distToBase = Math.abs(bot.x - baseCenterX) + Math.abs(bot.y - baseCenterY);
  if (distToBase < 4) {
    const retreatX = bot.x < baseCenterX ? bot.x - 2 : bot.x + 2;
    const retreatY = bot.y < baseCenterY ? bot.y - 2 : bot.y + 2;
    return { canShoot: false, targetX: retreatX, targetY: retreatY };
  }

  if (bestPos) {
    const botIndex = parseInt(botId.split('_')[1]) || 0;
    const offsetX = (botIndex % 3) - 1;
    const offsetY = Math.floor(botIndex / 3) % 3 - 1;

    return {
      canShoot: false,
      targetX: bestPos.x + offsetX,
      targetY: bestPos.y + offsetY,
      targetDir: bestPos.dir
    };
  }

  return { canShoot: false, targetX: state.base.x - 3, targetY: baseCenterY };
}

// Is heading towards
function isHeadingTowards(bullet, bot) {
  const dx = bot.x - bullet.x;
  const dy = bot.y - bullet.y;
  return (bullet.dx !== 0 && Math.sign(dx) === Math.sign(bullet.dx)) ||
         (bullet.dy !== 0 && Math.sign(dy) === Math.sign(bullet.dy));
}

// Would be hit
function wouldBeHit(position, bullet) {
  const futureX = position.x + bullet.dx;
  const futureY = position.y + bullet.dy;
  return futureX === bullet.x && futureY === bullet.y;
}

// Try move
function tryMove(botId, dx, dy, position) {
  const bot = state.players[botId];
  if (!bot) return false;

  const newX = bot.x + dx;
  const newY = bot.y + dy;

  if (newX < 0 || newX >= constants.size.col - 3 || newY < 0 || newY >= constants.size.row - 3) {
    return false;
  }

  if (bulletModule.checkWallCollision(newX, newY, position)) {
    return false;
  }

  bot.x = newX;
  bot.y = newY;
  bot.position = position;
  return true;
}

module.exports = {
  init,
  coopEnemyAI,
  findPlayerInSight,
  isStuck,
  getRandomValidMove,
  shouldDodgeBullet,
  findBestPlayerTarget,
  canShootTarget,
  calculateRetreat,
  isCollidingWithOtherBots,
  calculateSmartPath,
  findBestObstacleToShoot,
  getPatrolMove,
  findBestAttackPosition,
  isHeadingTowards,
  wouldBeHit,
  tryMove,
};
