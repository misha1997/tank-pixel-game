import { BULLET_COOLDOWN, INVULNERABILITY_TIME } from '@tank/shared';
import type { TankFacing } from '@tank/shared';
import type { RoomState } from './state.js';
import { randomInteger } from '../utils/random.js';
import type { BulletManager } from './BulletManager.js';
import type { PlayerManager } from './PlayerManager.js';
import type { BotAI } from './BotAI.js';
import {
  getDifficultyProfile,
  randomInRange,
  type ConcreteDifficulty,
  type DifficultyProfile,
} from './difficulty.js';

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

    this.startBotLoop(botId, profile);
  }

  private startBotLoop(botId: string, profile: DifficultyProfile): void {
    const { state } = this;

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
            const memory = state.botMemory[botId];
            if (memory) {
              memory.lastPositions = [];
              memory.stuckCounter = 0;
              memory.dangerZones = [];
              memory.lastCollisionAvoidance = 0;
              memory.targetPlayer = undefined;
              memory.path = undefined;
              memory.pathGoalX = undefined;
              memory.pathGoalY = undefined;
              memory.pathComputedAt = undefined;
            }
            this.startBotLoop(botId, profile);
          }
        }, 3000);
      }
    }, profile.updateInterval);
  }

  // PvP bot AI: dodge incoming fire, commit to the most useful target (a
  // clear shot beats pure distance, and it sticks with its target instead of
  // flip-flopping), then either take the shot or pathfind — BFS around walls,
  // not a blind beeline — to a spot on the target's row/column that actually
  // has a clear line of fire, all while steering clear of other bots.
  private botAI(botId: string): void {
    const { state } = this;
    const bot = state.players[botId];
    const memory = state.botMemory[botId];
    if (!bot || !bot.status) return;

    const now = Date.now();
    // status stays true for the full boomAnimate() duration (only flips to
    // false once the animation ends) — without this the bot keeps dodging,
    // shooting, and moving while its own death animation is still playing.
    if (bot.exploding && now < bot.explosionEndTime) return;

    const avoidBots = (x: number, y: number) => this.ai.wouldCollideWithAnyBot(botId, x, y);

    if (Math.random() < (memory?.dodgeChance ?? 0.6)) {
      const dodgeMove = this.ai.shouldDodgeBullet(bot, avoidBots);
      if (dodgeMove && now - (memory?.lastDodge || 0) > 300) {
        this.ai.tryMove(botId, dodgeMove.dx, dodgeMove.dy, dodgeMove.pos);
        if (memory) memory.lastDodge = now;
        return;
      }
    }

    const targetInfo = this.ai.findBestPvpTarget(bot, botId, memory?.targetPlayer);
    if (!targetInfo) return;
    const { id: targetId, player: target } = targetInfo;
    if (memory) memory.targetPlayer = targetId;

    const shootDir = this.ai.canShootTarget(bot, target);
    if (shootDir && now - bot.lastShot > BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
      bot.position = shootDir;
      bot.lastShot = now;
      this.bullets.createBullet(botId);
      return;
    }

    if (!memory) return;
    const move =
      this.ai.planPursuit(bot, memory, target, avoidBots) ??
      this.ai.getRandomValidMove(bot, avoidBots);
    if (move) {
      this.ai.tryMove(botId, move.dx, move.dy, move.pos);
    }
  }
}
