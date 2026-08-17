import { BOT_UPDATE_INTERVAL, BULLET_COOLDOWN, INVULNERABILITY_TIME } from '@tank/shared';
import type { PlayerState, TankFacing } from '@tank/shared';
import { state } from '../config/state.js';
import * as helpers from '../utils/helpers.js';
import { createBullet } from '../game/bullet.js';
import { getSafeSpawnPosition, restartPlayer } from '../game/player.js';
import { canShootTarget, getRandomValidMove, tryMove } from '../ai/bot.js';

const FACINGS: TankFacing[] = ['top', 'left', 'right', 'bottom'];

export function addPvPBots(count = 3): void {
  for (let i = 0; i < count; i++) {
    addBot();
  }
}

export function addBot(): void {
  const botId = 'bot_' + Math.random().toString(36).substring(2, 11);
  const spawnPos = getSafeSpawnPosition();

  state.players[botId] = {
    name: 'Bot',
    color: '#000000',
    status: true,
    isBot: true,
    x: spawnPos.x,
    y: spawnPos.y,
    position: FACINGS[helpers.randomInteger(4)],
    bullets: {},
    rating: 0,
    lastShot: 0,
    invulnerableUntil: Date.now() + INVULNERABILITY_TIME,
    exploding: false,
    explosionEndTime: 0,
    respawnShootingCooldown: Date.now() + 2000,
  };

  state.botMemory[botId] = {
    lastPositions: [],
    stuckCounter: 0,
    lastDodge: 0,
    lastMemoryUpdate: 0,
    aggressionLevel: 0.5 + Math.random() * 0.3,
    dangerZones: [],
    lastCollisionAvoidance: 0,
  };

  state.botIntervals[botId] = setInterval(() => {
    if (!state.players[botId]) {
      clearInterval(state.botIntervals[botId]);
      delete state.botIntervals[botId];
      delete state.botMemory[botId];
      return;
    }

    if (state.players[botId].status) {
      botAI(botId);
    } else {
      clearInterval(state.botIntervals[botId]);
      delete state.botIntervals[botId];

      setTimeout(() => {
        if (state.players[botId]) {
          restartPlayer(botId);
          if (state.botMemory[botId]) {
            state.botMemory[botId].lastPositions = [];
            state.botMemory[botId].stuckCounter = 0;
            state.botMemory[botId].dangerZones = [];
            state.botMemory[botId].lastCollisionAvoidance = 0;
          }
        }
      }, 3000);
    }
  }, BOT_UPDATE_INTERVAL);
}

// Simple bot AI for PvP mode
function botAI(botId: string): void {
  const bot = state.players[botId];
  if (!bot || !bot.status) return;

  const now = Date.now();

  let target: PlayerState | null = null;
  let minDist = Infinity;

  for (const playerId in state.players) {
    if (playerId === botId) continue;
    const player = state.players[playerId];
    if (!player || !player.status || player.isCoopEnemy) continue;

    const dist = Math.abs(bot.x - player.x) + Math.abs(bot.y - player.y);
    if (dist < minDist) {
      minDist = dist;
      target = player;
    }
  }

  if (!target) return;

  const dx = Math.sign(target.x - bot.x);
  const dy = Math.sign(target.y - bot.y);

  let moved = false;
  if (Math.abs(dx) > Math.abs(dy) && dx !== 0) {
    moved = tryMove(botId, dx, 0, dx > 0 ? 'left' : 'right');
  } else if (dy !== 0) {
    moved = tryMove(botId, 0, dy, dy > 0 ? 'bottom' : 'top');
  }

  if (!moved) {
    const move = getRandomValidMove(bot);
    if (move) {
      tryMove(botId, move.dx, move.dy, move.pos);
    }
  }

  const shootDir = canShootTarget(bot, target);
  if (shootDir && now - bot.lastShot > BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
    bot.position = shootDir;
    bot.lastShot = now;
    createBullet(botId);
  }
}
