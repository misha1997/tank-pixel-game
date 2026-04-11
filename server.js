const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');

// Import modules
const state = require('./src/config/state');
const constants = require('./src/config/constants');
const helpers = require('./src/utils/helpers');
const mapModule = require('./src/game/map');
const bulletModule = require('./src/game/bullet');
const playerModule = require('./src/game/player');
const coopModule = require('./src/game/coop');
const botModule = require('./src/ai/bot');

// Initialize Express
const app = express();
const server = http.Server(app);
const io = socketIO(server);

app.set('port', 5000);
app.use('/static', express.static(__dirname + '/static'));

app.get('/', function (request, response) {
  response.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(5000, function () {
  console.log('Starting server on port 5000');
});

// Initialize modules with io reference
bulletModule.init(io);
playerModule.init(io);
coopModule.init(io);
botModule.init(io);

// Initialize game
helpers.generatePlayField();
helpers.initializeBulletPool();
mapModule.generateWalls();

// PvP bots
const pvpBotIds = [];

function addPvPBots() {
  for (let i = 0; i < 3; i++) {
    addBot();
  }
}

function addBot() {
  const botId = 'bot_' + Math.random().toString(36).substr(2, 9);
  const positions = ['top', 'left', 'right', 'bottom'];
  const spawnPos = playerModule.getSafeSpawnPosition();

  state.players[botId] = {
    name: 'Bot',
    color: '#000000',
    status: true,
    isBot: true,
    x: spawnPos.x,
    y: spawnPos.y,
    position: positions[helpers.randomInteger(4)],
    bullets: {},
    rating: 0,
    lastShot: 0,
    invulnerableUntil: Date.now() + constants.INVULNERABILITY_TIME,
    exploding: false,
    explosionEndTime: 0,
    respawnShootingCooldown: Date.now() + 2000
  };

  pvpBotIds.push(botId);

  state.botMemory[botId] = {
    lastPositions: [],
    stuckCounter: 0,
    lastDodge: 0,
    lastMemoryUpdate: 0,
    aggressionLevel: 0.5 + Math.random() * 0.3,
    dangerZones: [],
    lastCollisionAvoidance: 0
  };

  let respawnTimeout = null;

  state.botIntervals[botId] = setInterval(() => {
    if (!state.players[botId]) {
      clearInterval(state.botIntervals[botId]);
      delete state.botIntervals[botId];
      delete state.botMemory[botId];
      const index = pvpBotIds.indexOf(botId);
      if (index > -1) pvpBotIds.splice(index, 1);
      return;
    }

    if (state.players[botId].status) {
      botAI(botId);
    } else {
      clearInterval(state.botIntervals[botId]);
      delete state.botIntervals[botId];

      respawnTimeout = setTimeout(() => {
        if (state.players[botId]) {
          playerModule.restartPlayer(botId);
          if (state.botMemory[botId]) {
            state.botMemory[botId].lastPositions = [];
            state.botMemory[botId].stuckCounter = 0;
            state.botMemory[botId].dangerZones = [];
            state.botMemory[botId].lastCollisionAvoidance = 0;
          }
        }
        respawnTimeout = null;
      }, 3000);
    }
  }, constants.BOT_UPDATE_INTERVAL);
}

// Simple bot AI for PvP mode
function botAI(botId) {
  const bot = state.players[botId];
  if (!bot || !bot.status) return;

  const now = Date.now();

  // Find nearest player
  let target = null;
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

  // Simple hunt behavior
  const dx = Math.sign(target.x - bot.x);
  const dy = Math.sign(target.y - bot.y);

  let moved = false;
  if (Math.abs(dx) > Math.abs(dy) && dx !== 0) {
    moved = botModule.tryMove(botId, dx, 0, dx > 0 ? 'left' : 'right');
  } else if (dy !== 0) {
    moved = botModule.tryMove(botId, 0, dy, dy > 0 ? 'bottom' : 'top');
  }

  if (!moved) {
    const move = botModule.getRandomValidMove(bot);
    if (move) {
      botModule.tryMove(botId, move.dx, move.dy, move.pos);
    }
  }

  // Shoot if can see target
  const shootDir = botModule.canShootTarget(bot, target);
  if (shootDir && now - bot.lastShot > constants.BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
    bot.position = shootDir;
    bot.lastShot = now;
    bulletModule.createBullet(botId);
  }
}

// Update game state
function updateGameState() {
  const now = Date.now();

  if (now - state.lastGameUpdate < constants.GAME_UPDATE_INTERVAL) {
    return;
  }
  state.lastGameUpdate = now;

  const playerCount = Object.keys(state.players).length;
  if (playerCount === 0) return;

  helpers.generatePlayField();

  for (const playerId in state.players) {
    const player = state.players[playerId];
    if (player && player.status && constants.positionPiece[player.position]) {
      playerModule.applyPlayerToField(player);
    }

    if (player && player.bullets) {
      for (const bulletId in player.bullets) {
        const bullet = player.bullets[bulletId];
        if (bullet && bullet.x >= 0 && bullet.x < constants.size.col &&
            bullet.y >= 0 && bullet.y < constants.size.row) {
          state.playField[bullet.y][bullet.x] = 1;
        }
      }
    }
  }

  if (state.activeBullets.size > 0) {
    bulletModule.checkBulletCollisions();
  }

  const gameStateData = {
    playField: state.playField,
    players: state.players,
    walls: state.walls,
    gameMode: state.gameMode,
    gameState: state.gameState
  };

  if (state.gameMode === 'coop') {
    gameStateData.bricks = state.bricks;
    gameStateData.base = state.base;
    gameStateData.wave = state.coopWave;
    gameStateData.enemiesRemaining = state.enemiesToSpawn;
    gameStateData.enemiesKilled = state.enemiesKilled;
  }

  io.sockets.emit('state', gameStateData);
}

// Start game loop
setInterval(updateGameState, constants.GAME_UPDATE_INTERVAL);

// Add initial PvP bots
addPvPBots();

// Socket connection handling
io.on('connection', function (socket) {
  console.log('Player connected:', socket.id);

  socket.on('new player', function (data) {
    const name = typeof data === 'string' ? data : data.name;
    const color = typeof data === 'object' ? data.color : '#00AA00';
    const mode = typeof data === 'object' ? data.mode : 'pvp';

    console.log('New player:', name, 'Color:', color, 'Mode:', mode);

    // Switch game mode if different
    if (mode !== state.gameMode) {
      state.gameMode = mode;
      coopModule.resetGame();

      if (mode === 'coop') {
        mapModule.generateCoopMap();
        coopModule.startCoopWave();
      } else {
        mapModule.generatePvPMap();
      }
    }

    // Assign player
    state.players[socket.id] = {
      name: name,
      color: color,
      status: true,
      isBot: false,
      x: 3,
      y: 3,
      position: 'bottom',
      bullets: {},
      rating: 0,
      lastShot: 0,
      invulnerableUntil: Date.now() + constants.INVULNERABILITY_TIME,
      exploding: false,
      explosionEndTime: 0,
      respawnShootingCooldown: Date.now() + 2000
    };

    socket.emit('player id', socket.id);
    socket.emit('game mode', { mode: state.gameMode, wave: state.coopWave });

    console.log('Total players:', Object.keys(state.players).length);
  });

  // Movement handlers
  socket.on('movePieceRight', () => playerModule.movePlayer(socket.id, 1, 0, 'left'));
  socket.on('movePieceLeft', () => playerModule.movePlayer(socket.id, -1, 0, 'right'));
  socket.on('movePieceTop', () => playerModule.movePlayer(socket.id, 0, -1, 'top'));
  socket.on('movePieceBottom', () => playerModule.movePlayer(socket.id, 0, 1, 'bottom'));

  // Shoot handler
  socket.on('moveShot', function () {
    bulletModule.createBullet(socket.id);
  });

  // Restart handler
  socket.on('restart', function () {
    if (state.players[socket.id]) {
      playerModule.restartPlayer(socket.id);
    }
  });

  // Disconnect handler
  socket.on('disconnect', function () {
    console.log('Player disconnected:', socket.id);

    if (state.players[socket.id]) {
      // Clean up bullets
      if (state.players[socket.id].bullets) {
        for (const bulletId in state.players[socket.id].bullets) {
          helpers.returnBulletToPool(bulletId);
        }
      }

      // Clean up bot intervals
      if (state.botIntervals[socket.id]) {
        clearInterval(state.botIntervals[socket.id]);
        delete state.botIntervals[socket.id];
      }

      delete state.players[socket.id];
      delete state.botMemory[socket.id];

      console.log('Remaining players:', Object.keys(state.players).length);
    }
  });
});
