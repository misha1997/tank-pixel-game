import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { GAME_UPDATE_INTERVAL } from '@tank/shared';
import type { ClientToServerEvents, GameStateSnapshot, ServerToClientEvents } from '@tank/shared';
import { state } from './config/state.js';
import * as helpers from './utils/helpers.js';
import * as mapModule from './game/map.js';
import * as bulletModule from './game/bullet.js';
import * as playerModule from './game/player.js';
import * as coopModule from './game/coop.js';
import * as botModule from './ai/bot.js';
import { addPvPBots } from './bots/pvpBots.js';
import { authRouter } from './auth/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server);

const port = Number(process.env.PORT) || 5000;
app.set('port', port);

app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

app.get('/', (_request, response) => {
  response.sendFile(path.join(clientDist, 'index.html'));
});

server.listen(port, () => {
  console.log(`Starting server on port ${port}`);
});

bulletModule.init(io);
playerModule.init(io);
coopModule.init(io);
botModule.init(io);

helpers.generatePlayField();
helpers.initializeBulletPool();
mapModule.generateWalls();

function updateGameState(): void {
  const now = Date.now();

  if (now - state.lastGameUpdate < GAME_UPDATE_INTERVAL) {
    return;
  }
  state.lastGameUpdate = now;

  const playerCount = Object.keys(state.players).length;
  if (playerCount === 0) return;

  helpers.generatePlayField();

  for (const playerId in state.players) {
    const player = state.players[playerId];
    if (player && player.status) {
      playerModule.applyPlayerToField(player);
    }

    if (player && player.bullets) {
      for (const bulletId in player.bullets) {
        const bullet = player.bullets[bulletId];
        if (
          bullet && bullet.x >= 0 && bullet.x < state.playField[0]?.length &&
          bullet.y >= 0 && bullet.y < state.playField.length
        ) {
          state.playField[bullet.y][bullet.x] = 1;
        }
      }
    }
  }

  if (state.activeBullets.size > 0) {
    bulletModule.checkBulletCollisions();
  }

  const gameStateData: GameStateSnapshot = {
    playField: state.playField,
    players: state.players,
    walls: state.walls,
    gameMode: state.gameMode,
    gameState: state.gameState,
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

setInterval(updateGameState, GAME_UPDATE_INTERVAL);

addPvPBots();

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('new player', ({ name, color, mode }) => {
    console.log('New player:', name, 'Color:', color, 'Mode:', mode);

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

    state.players[socket.id] = {
      name,
      color,
      status: true,
      isBot: false,
      x: 3,
      y: 3,
      position: 'bottom',
      bullets: {},
      score: 0,
      lastShot: 0,
      invulnerableUntil: Date.now() + 2000,
      exploding: false,
      explosionEndTime: 0,
      respawnShootingCooldown: Date.now() + 2000,
    };

    socket.emit('player id', socket.id);
    socket.emit('game mode', { mode: state.gameMode, wave: state.coopWave });

    console.log('Total players:', Object.keys(state.players).length);
  });

  socket.on('movePieceRight', () => playerModule.movePlayer(socket.id, 1, 0, 'left'));
  socket.on('movePieceLeft', () => playerModule.movePlayer(socket.id, -1, 0, 'right'));
  socket.on('movePieceTop', () => playerModule.movePlayer(socket.id, 0, -1, 'top'));
  socket.on('movePieceBottom', () => playerModule.movePlayer(socket.id, 0, 1, 'bottom'));

  socket.on('moveShot', () => {
    bulletModule.createBullet(socket.id);
  });

  socket.on('restart', () => {
    if (state.players[socket.id]) {
      playerModule.restartPlayer(socket.id);
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);

    if (state.players[socket.id]) {
      if (state.players[socket.id].bullets) {
        for (const bulletId in state.players[socket.id].bullets) {
          helpers.returnBulletToPool(bulletId);
        }
      }

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
