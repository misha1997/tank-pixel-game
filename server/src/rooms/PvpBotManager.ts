import { BULLET_COOLDOWN, INVULNERABILITY_TIME } from '@tank/shared';
import type { PlayerState, TankFacing } from '@tank/shared';
import type { RoomState } from './state.js';
import { randomInteger } from '../utils/random.js';
import type { BulletManager } from './BulletManager.js';
import type { PlayerManager } from './PlayerManager.js';
import type { BotAI } from './BotAI.js';
import { getDifficultyProfile, randomInRange, type ConcreteDifficulty } from './difficulty.js';

const FACINGS: TankFacing[] = ['top', 'left', 'right', 'bottom'];

export class PvpBotManager {
  constructor(
    private readonly state: RoomState,
    private readonly bullets: BulletManager,
    private readonly players: PlayerManager,
    private readonly ai: BotAI,
  ) {}

  addPvPBots(count: number, difficulty: ConcreteDifficulty = 'normal'): void {
    for (let i = 0; i < count; i++) {
      this.addBot(difficulty);
    }
  }

  addBot(difficulty: ConcreteDifficulty = 'normal'): void {
    const { state } = this;
    const profile = getDifficultyProfile(difficulty);
    const botId = 'bot_' + Math.random().toString(36).substring(2, 11);
    const spawnPos = this.players.getSafeSpawnPosition();

    state.players[botId] = {
      name: 'Bot',
      color: '#000000',
      status: true,
      isBot: true,
      x: spawnPos.x,
      y: spawnPos.y,
      position: FACINGS[randomInteger(4)],
      bullets: {},
      score: 0,
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
      aggressionLevel: randomInRange(profile.aggressionRange),
      dodgeChance: profile.dodgeChance,
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
        this.botAI(botId);
      } else {
        clearInterval(state.botIntervals[botId]);
        delete state.botIntervals[botId];

        setTimeout(() => {
          if (state.players[botId]) {
            this.players.restartPlayer(botId);
            if (state.botMemory[botId]) {
              state.botMemory[botId].lastPositions = [];
              state.botMemory[botId].stuckCounter = 0;
              state.botMemory[botId].dangerZones = [];
              state.botMemory[botId].lastCollisionAvoidance = 0;
            }
          }
        }, 3000);
      }
    }, profile.updateInterval);
  }

  // Simple bot AI for PvP mode
  private botAI(botId: string): void {
    const { state } = this;
    const bot = state.players[botId];
    const memory = state.botMemory[botId];
    if (!bot || !bot.status) return;

    const now = Date.now();

    if (Math.random() < (memory?.dodgeChance ?? 0.6)) {
      const dodgeMove = this.ai.shouldDodgeBullet(bot);
      if (dodgeMove && now - (memory?.lastDodge || 0) > 300) {
        this.ai.tryMove(botId, dodgeMove.dx, dodgeMove.dy, dodgeMove.pos);
        if (memory) memory.lastDodge = now;
        return;
      }
    }

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
      moved = this.ai.tryMove(botId, dx, 0, dx > 0 ? 'left' : 'right');
    } else if (dy !== 0) {
      moved = this.ai.tryMove(botId, 0, dy, dy > 0 ? 'bottom' : 'top');
    }

    if (!moved) {
      const move = this.ai.getRandomValidMove(bot);
      if (move) {
        this.ai.tryMove(botId, move.dx, move.dy, move.pos);
      }
    }

    const shootDir = this.ai.canShootTarget(bot, target);
    if (shootDir && now - bot.lastShot > BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
      bot.position = shootDir;
      bot.lastShot = now;
      this.bullets.createBullet(botId);
    }
  }
}
