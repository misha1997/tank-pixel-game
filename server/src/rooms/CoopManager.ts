import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'socket.io';
import { MAX_COOP_BOTS } from '@tank/shared';
import type { ClientToServerEvents, ServerToClientEvents } from '@tank/shared';
import type { RoomState } from './state.js';
import { randomInteger } from '../utils/random.js';
import type { BotAI } from './BotAI.js';
import { applyWaveScaling, getDifficultyProfile, randomInRange, type ConcreteDifficulty } from './difficulty.js';
import { settleCoopDefeat } from '../matches/settle.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

export class CoopManager {
  constructor(
    private readonly state: RoomState,
    private readonly io: TypedServer,
    private readonly roomId: string,
    private readonly ai: BotAI,
    private readonly getDifficulty: () => ConcreteDifficulty,
    private readonly mapName: string,
    private readonly getDurationSec: () => number,
  ) {}

  startCoopWave(): void {
    const { state } = this;
    state.enemiesToSpawn = 5 + state.coopWave * 2;
    state.totalEnemiesInWave = state.enemiesToSpawn;

    if (state.waveSpawnInterval) {
      clearInterval(state.waveSpawnInterval);
    }

    state.waveSpawnInterval = setInterval(() => {
      if (state.gameState !== 'playing' || state.enemiesToSpawn <= 0 || state.coopBotCount >= MAX_COOP_BOTS) {
        if (state.enemiesToSpawn <= 0 && state.coopBotCount === 0) {
          state.coopWave++;
          setTimeout(() => this.startCoopWave(), 5000);
        }
        return;
      }

      this.spawnCoopEnemy();
      state.enemiesToSpawn--;
    }, 3000);
  }

  spawnCoopEnemy(): void {
    const { state } = this;

    let spawn: { x: number; y: number } | null = null;
    for (const point of state.enemySpawnPoints) {
      let inWall = false;
      for (const wall of state.walls) {
        if (Math.abs(wall.x - point.x) <= 2 && Math.abs(wall.y - point.y) <= 2) {
          inWall = true;
          break;
        }
      }

      let occupied = false;
      for (const playerId in state.players) {
        const player = state.players[playerId];
        if (player.status && Math.abs(player.x - point.x) < 3 && Math.abs(player.y - point.y) < 3) {
          occupied = true;
          break;
        }
      }

      if (!inWall && !occupied) {
        spawn = point;
        break;
      }
    }

    if (!spawn) {
      const bounds = state.mapBounds;
      const minX = bounds?.minX ?? 5;
      const minY = bounds?.minY ?? 3;
      const spanX = bounds ? bounds.maxX - bounds.minX + 1 : 40;
      const spanY = bounds ? bounds.maxY - bounds.minY + 1 : 12;

      let attempts = 0;
      while (attempts < 20) {
        const x = minX + randomInteger(spanX);
        const y = minY + randomInteger(spanY);

        let valid = true;
        for (const wall of state.walls) {
          if (Math.abs(wall.x - x) <= 2 && Math.abs(wall.y - y) <= 2) {
            valid = false;
            break;
          }
        }

        for (const playerId in state.players) {
          const player = state.players[playerId];
          if (player.status && Math.abs(player.x - x) < 3 && Math.abs(player.y - y) < 3) {
            valid = false;
            break;
          }
        }

        if (valid) {
          spawn = { x, y };
          break;
        }
        attempts++;
      }
    }

    if (!spawn) {
      console.log('No valid spawn point found for coop enemy');
      return;
    }

    const profile = applyWaveScaling(getDifficultyProfile(this.getDifficulty()), state.coopWave);
    const botId = 'coop_bot_' + uuidv4();

    state.players[botId] = {
      name: 'Enemy Tank',
      color: '#000000',
      status: true,
      isBot: true,
      isCoopEnemy: true,
      x: spawn.x,
      y: spawn.y,
      position: 'bottom',
      bullets: {},
      score: 0,
      lastShot: 0,
      invulnerableUntil: Date.now() + 1000,
      exploding: false,
      explosionEndTime: 0,
      respawnShootingCooldown: Date.now() + 1500,
      health: 1,
    };

    state.coopBotCount++;

    state.botMemory[botId] = {
      lastPositions: [],
      stuckCounter: 0,
      lastDodge: 0,
      lastMemoryUpdate: 0,
      aggressionLevel: randomInRange(profile.aggressionRange),
      dodgeChance: profile.dodgeChance,
      dangerZones: [],
      lastCollisionAvoidance: 0,
      target: 'base',
    };

    state.botIntervals[botId] = setInterval(() => {
      if (!state.players[botId]) {
        clearInterval(state.botIntervals[botId]);
        delete state.botIntervals[botId];
        delete state.botMemory[botId];
        state.coopBotCount--;
        return;
      }

      if (state.players[botId].status) {
        this.ai.coopEnemyAI(botId);
      } else {
        clearInterval(state.botIntervals[botId]);
        delete state.botIntervals[botId];
        delete state.botMemory[botId];
        delete state.players[botId];
        state.coopBotCount--;
        state.enemiesKilled++;
        this.checkCoopVictory();
      }
    }, profile.updateInterval);
  }

  checkCoopVictory(): void {
    const { state } = this;
    if (state.enemiesToSpawn === 0 && state.coopBotCount === 0 && state.gameState === 'playing') {
      this.io.to(this.roomId).emit('wave complete', { wave: state.coopWave });
    }
  }

  checkCoopDefeat(): void {
    const { state } = this;
    if (state.base.health <= 0 && state.gameState === 'playing') {
      state.gameState = 'defeat';
      this.io.to(this.roomId).emit('game over', {
        reason: 'base destroyed',
        wave: state.coopWave,
        kills: state.enemiesKilled,
      });

      if (state.waveSpawnInterval) {
        clearInterval(state.waveSpawnInterval);
        state.waveSpawnInterval = null;
      }

      const participants = Object.values(state.players)
        .filter((p) => !p.isBot && p.userId && typeof p.rating === 'number')
        .map((p) => ({ userId: p.userId as string, ratingBefore: p.rating as number, score: p.score }));

      void settleCoopDefeat({
        mapName: this.mapName,
        durationSec: this.getDurationSec(),
        wave: state.coopWave,
        participants,
      });
    }
  }
}
