const { v4: uuidv4 } = require('uuid');
const state = require('../config/state');
const constants = require('../config/constants');
const helpers = require('../utils/helpers');
const mapModule = require('./map');
const playerModule = require('./player');
const botModule = require('../ai/bot');

let io;

function init(socketIo) {
  io = socketIo;
}

// Start coop wave
function startCoopWave() {
  state.enemiesToSpawn = 5 + state.coopWave * 2;
  state.totalEnemiesInWave = state.enemiesToSpawn;

  if (state.waveSpawnInterval) {
    clearInterval(state.waveSpawnInterval);
  }

  state.waveSpawnInterval = setInterval(() => {
    if (state.gameState !== 'playing' || state.enemiesToSpawn <= 0 || state.coopBotCount >= constants.MAX_COOP_BOTS) {
      if (state.enemiesToSpawn <= 0 && state.coopBotCount === 0) {
        state.coopWave++;
        setTimeout(() => startCoopWave(), 5000);
      }
      return;
    }

    spawnCoopEnemy();
    state.enemiesToSpawn--;
  }, 3000);
}

// Spawn coop enemy
function spawnCoopEnemy() {
  const spawnPoints = [
    { x: 10, y: 4 },
    { x: 39, y: 4 },
    { x: 12, y: 13 },
    { x: 37, y: 13 }
  ];

  let spawn = null;
  for (const point of spawnPoints) {
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
    let attempts = 0;
    while (attempts < 20) {
      const x = 5 + helpers.randomInteger(40);
      const y = 3 + helpers.randomInteger(12);

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

  const botId = 'coop_bot_' + uuidv4();

  state.players[botId] = {
    name: 'Enemy Tank',
    color: '#c20000',
    status: true,
    isBot: true,
    isCoopEnemy: true,
    x: spawn.x,
    y: spawn.y,
    position: 'bottom',
    bullets: {},
    rating: 0,
    lastShot: 0,
    invulnerableUntil: Date.now() + 1000,
    exploding: false,
    explosionEndTime: 0,
    respawnShootingCooldown: Date.now() + 1500,
    health: 1
  };

  state.coopBotCount++;

  state.botMemory[botId] = {
    lastPositions: [],
    stuckCounter: 0,
    lastDodge: 0,
    lastMemoryUpdate: 0,
    aggressionLevel: 0.8,
    dangerZones: [],
    lastCollisionAvoidance: 0,
    target: 'base'
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
      botModule.coopEnemyAI(botId);
    } else {
      clearInterval(state.botIntervals[botId]);
      delete state.botIntervals[botId];
      delete state.botMemory[botId];
      delete state.players[botId];
      state.coopBotCount--;
      state.enemiesKilled++;
      checkCoopVictory();
    }
  }, constants.BOT_UPDATE_INTERVAL);
}

// Check coop victory
function checkCoopVictory() {
  if (state.enemiesToSpawn === 0 && state.coopBotCount === 0 && state.gameState === 'playing') {
    io.sockets.emit('wave complete', { wave: state.coopWave });
  }
}

// Check coop defeat
function checkCoopDefeat() {
  if (state.base.health <= 0 && state.gameState === 'playing') {
    state.gameState = 'defeat';
    io.sockets.emit('game over', { reason: 'base destroyed', wave: state.coopWave, kills: state.enemiesKilled });

    if (state.waveSpawnInterval) {
      clearInterval(state.waveSpawnInterval);
      state.waveSpawnInterval = null;
    }
  }
}

// Reset game
function resetGame() {
  state.gameState = 'waiting';
  state.coopWave = 1;
  state.enemiesToSpawn = 0;
  state.enemiesKilled = 0;
  state.coopBotCount = 0;

  if (state.waveSpawnInterval) {
    clearInterval(state.waveSpawnInterval);
    state.waveSpawnInterval = null;
  }

  // Clear all bots
  for (const playerId in state.players) {
    if (state.players[playerId].isBot) {
      if (state.botIntervals[playerId]) {
        clearInterval(state.botIntervals[playerId]);
        delete state.botIntervals[playerId];
      }
      delete state.botMemory[playerId];
      delete state.players[playerId];
    }
  }

  // Clear bullets
  for (const bulletId in state.bulletIntervals) {
    clearInterval(state.bulletIntervals[bulletId]);
    delete state.bulletIntervals[bulletId];
  }
  state.activeBullets.clear();

  state.base.health = 1;
  state.bricks.length = 0;
}

module.exports = {
  init,
  startCoopWave,
  spawnCoopEnemy,
  checkCoopVictory,
  checkCoopDefeat,
  resetGame,
};
