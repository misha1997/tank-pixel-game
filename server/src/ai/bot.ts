import type { Server } from 'socket.io';
import { BULLET_COOLDOWN, bulletDirections, size } from '@tank/shared';
import type { BulletState, ClientToServerEvents, PlayerState, ServerToClientEvents, TankFacing } from '@tank/shared';
import { state } from '../config/state.js';
import type { BotMemory } from '../config/state.js';
import * as helpers from '../utils/helpers.js';
import { createBullet, checkWallCollision } from '../game/bullet.js';

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

export function init(socketIo: Server<ClientToServerEvents, ServerToClientEvents>): void {
  io = socketIo;
}

interface Move {
  dx: number;
  dy: number;
  pos: TankFacing;
}

// Coop enemy AI
export function coopEnemyAI(botId: string): void {
  const bot = state.players[botId];
  const memory = state.botMemory[botId];
  if (!bot || !bot.status || !memory) return;

  const now = Date.now();

  if (!memory.positions) memory.positions = [];
  if (now - (memory.lastPosUpdate || 0) > 500) {
    memory.positions.push({ x: bot.x, y: bot.y, time: now });
    if (memory.positions.length > 5) memory.positions.shift();
    memory.lastPosUpdate = now;
  }

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
    if (
      canShootTarget(bot, playerThreat.player) &&
      now - bot.lastShot > BULLET_COOLDOWN &&
      now > bot.respawnShootingCooldown
    ) {
      bot.position = playerThreat.position;
      bot.lastShot = now;
      createBullet(botId);
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

  if (attackPos.canShoot && attackPos.position) {
    bot.position = attackPos.position;
    if (now - bot.lastShot > BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
      bot.lastShot = now;
      createBullet(botId);
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
  if (now - bot.lastShot > BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
    const obstacle = findBestObstacleToShoot(bot);
    if (obstacle) {
      bot.position = obstacle.position;
      bot.lastShot = now;
      createBullet(botId);
      return;
    }
  }

  // 6. Patrol if nothing to do
  const patrolMove = getPatrolMove(bot);
  if (patrolMove) {
    tryMove(botId, patrolMove.dx, patrolMove.dy, patrolMove.pos);
  }
}

export function isStuck(memory: BotMemory): boolean {
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

export function getRandomValidMove(bot: PlayerState): Move | null {
  const moves: Move[] = [
    { dx: 0, dy: -1, pos: 'top' },
    { dx: 0, dy: 1, pos: 'bottom' },
    { dx: -1, dy: 0, pos: 'left' },
    { dx: 1, dy: 0, pos: 'right' },
  ];
  const shuffled = moves.sort(() => Math.random() - 0.5);
  for (const move of shuffled) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;
    if (
      newX >= 0 && newX < size.col - 3 &&
      newY >= 0 && newY < size.row - 3 &&
      !checkWallCollision(newX, newY, move.pos)
    ) {
      return move;
    }
  }
  return null;
}

export function shouldDodgeBullet(bot: PlayerState): Move | null {
  let threat: BulletState | null = null;
  let minDist = Infinity;

  for (const [, bullet] of state.activeBullets) {
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

  const moves: Move[] = [
    { dx: 1, dy: 0, pos: 'left' },
    { dx: -1, dy: 0, pos: 'right' },
    { dx: 0, dy: 1, pos: 'top' },
    { dx: 0, dy: -1, pos: 'bottom' },
  ];

  for (const move of moves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;
    if (
      newX >= 0 && newX < size.col - 3 &&
      newY >= 0 && newY < size.row - 3 &&
      !checkWallCollision(newX, newY, move.pos) &&
      !wouldBeHit({ x: newX, y: newY }, threat)
    ) {
      return move;
    }
  }
  return null;
}

export function findBestPlayerTarget(
  bot: PlayerState,
): { player: PlayerState; playerId: string; distance: number; position: TankFacing } | null {
  let bestTarget: PlayerState | null = null;
  let bestTargetId: string | null = null;
  let minDistance = Infinity;
  let bestPosition: TankFacing | null = null;

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
        bestTargetId = playerId;
        bestPosition = shootPos;
      }
    }
  }

  return bestTarget && bestTargetId && bestPosition
    ? { player: bestTarget, playerId: bestTargetId, distance: minDistance, position: bestPosition }
    : null;
}

export function canShootTarget(bot: PlayerState, target: PlayerState): TankFacing | null {
  return canShootTargetFrom(bot, target);
}

export function canShootTargetFrom(
  bot: PlayerState,
  target: { x: number; y: number },
): TankFacing | null {
  const directions: TankFacing[] = ['top', 'bottom', 'left', 'right'];
  for (const dir of directions) {
    const bulletConfig = bulletDirections[dir];
    if (!bulletConfig) continue;

    let checkX = bot.x + bulletConfig.offsetX;
    let checkY = bot.y + bulletConfig.offsetY;

    for (let i = 0; i < 15; i++) {
      checkX += bulletConfig.dx;
      checkY += bulletConfig.dy;

      if (
        target.x <= checkX && checkX < target.x + 3 &&
        target.y <= checkY && checkY < target.y + 3
      ) {
        return dir;
      }

      for (const wall of state.walls) {
        if (wall.x === checkX && wall.y === checkY) break;
      }
    }
  }
  return null;
}

export function calculateRetreat(bot: PlayerState, player: PlayerState): Move | null {
  const dx = bot.x - player.x;
  const dy = bot.y - player.y;

  const moves: Move[] = [];
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
    if (
      newX >= 0 && newX < size.col - 3 &&
      newY >= 0 && newY < size.row - 3 &&
      !checkWallCollision(newX, newY, move.pos)
    ) {
      return move;
    }
  }
  return null;
}

export function isCollidingWithOtherBots(bot: PlayerState, botId: string, move: Move): boolean {
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

export function calculateSmartPath(bot: PlayerState, targetX: number, targetY: number): Move | null {
  const dx = Math.sign(targetX - bot.x);
  const dy = Math.sign(targetY - bot.y);

  const moves: Move[] = [];
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
    if (
      newX >= 0 && newX < size.col - 3 &&
      newY >= 0 && newY < size.row - 3 &&
      !checkWallCollision(newX, newY, move.pos)
    ) {
      return move;
    }
  }
  return null;
}

export function findBestObstacleToShoot(bot: PlayerState): { position: TankFacing } | null {
  for (const brick of state.bricks) {
    if (brick.health > 0) {
      const dist = Math.abs(bot.x - brick.x) + Math.abs(bot.y - brick.y);
      if (dist <= 5) {
        const shootPos = canShootTargetFrom(bot, { x: brick.x - 1, y: brick.y - 1 });
        if (shootPos) {
          return { position: shootPos };
        }
      }
    }
  }
  return null;
}

export function getPatrolMove(bot: PlayerState): Move | null {
  return getRandomValidMove(bot);
}

interface AttackPosition {
  canShoot: boolean;
  position?: TankFacing;
  targetX?: number;
  targetY?: number;
  targetDir?: TankFacing;
}

// Find best attack position with bot distribution
export function findBestAttackPosition(bot: PlayerState, botId: string): AttackPosition {
  const baseCenterX = state.base.x + 1;
  const baseCenterY = state.base.y + 1;

  const attackPositions: { x: number; y: number; pos: 'left' | 'right' | 'top'; dir: TankFacing }[] = [
    { x: state.base.x - 4, y: baseCenterY, pos: 'left', dir: 'right' },
    { x: state.base.x + 6, y: baseCenterY, pos: 'right', dir: 'left' },
    { x: baseCenterX, y: state.base.y - 4, pos: 'top', dir: 'bottom' },
  ];

  const positionCounts: Record<'left' | 'right' | 'top', number> = { left: 0, right: 0, top: 0 };
  for (const otherId in state.botMemory) {
    if (otherId === botId) continue;
    const otherMemory = state.botMemory[otherId];
    if (otherMemory && otherMemory.attackTargetPos) {
      positionCounts[otherMemory.attackTargetPos]++;
    }
  }

  const availablePositions = attackPositions
    .filter((pos) => helpers.hasLineOfSightToBase(pos.x, pos.y, pos.dir))
    .map((pos) => ({
      ...pos,
      distance: Math.abs(bot.x - pos.x) + Math.abs(bot.y - pos.y),
      botsTargeting: positionCounts[pos.pos],
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
    const botIndex = parseInt(botId.split('_')[1], 10) || 0;
    const offsetX = (botIndex % 3) - 1;
    const offsetY = Math.floor(botIndex / 3) % 3 - 1;

    return {
      canShoot: false,
      targetX: bestPos.x + offsetX,
      targetY: bestPos.y + offsetY,
      targetDir: bestPos.dir,
    };
  }

  return { canShoot: false, targetX: state.base.x - 3, targetY: baseCenterY };
}

export function isHeadingTowards(bullet: { x: number; y: number; dx: number; dy: number }, bot: PlayerState): boolean {
  const dx = bot.x - bullet.x;
  const dy = bot.y - bullet.y;
  return (
    (bullet.dx !== 0 && Math.sign(dx) === Math.sign(bullet.dx)) ||
    (bullet.dy !== 0 && Math.sign(dy) === Math.sign(bullet.dy))
  );
}

export function wouldBeHit(
  position: { x: number; y: number },
  bullet: { x: number; y: number; dx: number; dy: number },
): boolean {
  const futureX = position.x + bullet.dx;
  const futureY = position.y + bullet.dy;
  return futureX === bullet.x && futureY === bullet.y;
}

export function tryMove(botId: string, dx: number, dy: number, position: TankFacing): boolean {
  const bot = state.players[botId];
  if (!bot) return false;

  const newX = bot.x + dx;
  const newY = bot.y + dy;

  if (newX < 0 || newX >= size.col - 3 || newY < 0 || newY >= size.row - 3) {
    return false;
  }

  if (checkWallCollision(newX, newY, position)) {
    return false;
  }

  bot.x = newX;
  bot.y = newY;
  bot.position = position;
  return true;
}
