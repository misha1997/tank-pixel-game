var express = require('express');
var http = require('http');
var path = require('path');
var socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');

var app = express();
var server = http.Server(app);
var io = socketIO(server);

app.set('port', 5000);
app.use('/static', express.static(__dirname + '/static'));

app.get('/', function (request, response) {
  response.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(5000, function () {
  console.log('Starting server on port 5000');
});

// Игроки и игровые данные
var players = {};
var playField = [];
var bulletIntervals = {}; // Храним интервалы пуль для очистки

// Размер игрового поля
const size = {
  col: 25,
  row: 25,
};

// Константы для оптимизации
const BULLET_SPEED = 100;
const BOT_UPDATE_INTERVAL = 300; // Уменьшено для более быстрой реакции
const GAME_UPDATE_INTERVAL = 50; // Увеличена частота обновлений для плавности
const BULLET_COOLDOWN = 200; // Кулдаун между выстрелами
const BOT_SHOOT_DISTANCE = 15; // Дистанция для стрельбы бота

// Позиции для отображения фигур
const positionPiece = {
  top: [[0, 1, 0], [1, 1, 1], [1, 0, 1]],
  bottom: [[1, 0, 1], [1, 1, 1], [0, 1, 0]],
  left: [[1, 1, 0], [0, 1, 1], [1, 1, 0]],
  right: [[0, 1, 1], [1, 1, 0], [0, 1, 1]],
  boomOne: [[1, 0, 1], [0, 1, 0], [1, 0, 1]],
  boomTwo: [[0, 1, 0], [1, 0, 1], [0, 1, 0]],
};

// Направления движения для оптимизации
const directions = {
  top: { dx: 0, dy: -1 },
  bottom: { dx: 0, dy: 1 },
  left: { dx: 1, dy: 0 },
  right: { dx: -1, dy: 0 },
};

// Направления пуль
const bulletDirections = {
  top: { dir: 'up', dx: 0, dy: -1, offsetX: 1, offsetY: 0 },
  bottom: { dir: 'down', dx: 0, dy: 1, offsetX: 1, offsetY: 3 },
  left: { dir: 'right', dx: 1, dy: 0, offsetX: 3, offsetY: 1 },
  right: { dir: 'left', dx: -1, dy: 0, offsetX: 0, offsetY: 1 },
};

// Генерация пустого игрового поля
function generatePlayField() {
  for (let row = 0; row < size.row; row++) {
    playField[row] = new Array(size.col).fill(0);
  }
}

generatePlayField();

// Случайное целое число в пределах игрового поля
function randomInteger(max) {
  return Math.floor(Math.random() * max);
}

// Получение безопасной позиции для спавна
function getSafeSpawnPosition() {
  let attempts = 0;
  const maxAttempts = 50;

  while (attempts < maxAttempts) {
    const x = randomInteger(size.col - 3);
    const y = randomInteger(size.row - 3);

    // Проверяем, не занята ли эта позиция
    let isSafe = true;
    for (const playerId in players) {
      const player = players[playerId];
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

  return { x: randomInteger(size.col - 3), y: randomInteger(size.row - 3) };
}

io.on('connection', function (socket) {
  console.log('Player connected:', socket.id);

  // Добавление нового игрока
  socket.on('new player', function (name) {
    const positions = ['top', 'left', 'right', 'bottom'];
    const spawnPos = getSafeSpawnPosition();

    players[socket.id] = {
      name: name || 'Player',
      status: true,
      isBot: false,
      x: spawnPos.x,
      y: spawnPos.y,
      position: positions[randomInteger(4)],
      bullets: {},
      rating: 0,
      lastShot: 0, // Для кулдауна стрельбы
    };

    // Отправляем игроку его ID
    socket.emit('player id', socket.id);
  });

  // Движение фигуры - используем единую функцию
  socket.on('movePieceRight', () => movePlayer(socket.id, -1, 0, 'right'));
  socket.on('movePieceLeft', () => movePlayer(socket.id, 1, 0, 'left'));
  socket.on('movePieceTop', () => movePlayer(socket.id, 0, -1, 'top'));
  socket.on('movePieceBottom', () => movePlayer(socket.id, 0, 1, 'bottom'));

  // Создание выстрела с кулдауном
  socket.on('moveShot', function () {
    const player = players[socket.id];
    if (!player || !player.status) return;

    const now = Date.now();
    if (now - player.lastShot < BULLET_COOLDOWN) return;

    player.lastShot = now;
    createBullet(socket.id);
  });

  // Перезапуск игры для игрока
  socket.on('restart', function () {
    if (players[socket.id]) {
      restartPlayer(socket.id);
    }
  });

  // Отключение игрока
  socket.on('disconnect', function () {
    console.log('Player disconnected:', socket.id);
    if (players[socket.id]) {
      // Очищаем интервалы пуль
      for (const bulletId in players[socket.id].bullets) {
        if (bulletIntervals[bulletId]) {
          clearInterval(bulletIntervals[bulletId]);
          delete bulletIntervals[bulletId];
        }
      }
      delete players[socket.id];
    }
  });
});

// Создание пули
function createBullet(playerId) {
  const player = players[playerId];
  if (!player || !player.status) return;

  const bulletConfig = bulletDirections[player.position];
  if (!bulletConfig) return;

  const bulletId = uuidv4();
  const bullet = {
    position: player.position,
    x: player.x + bulletConfig.offsetX,
    y: player.y + bulletConfig.offsetY,
    direction: bulletConfig.dir,
    dx: bulletConfig.dx,
    dy: bulletConfig.dy,
  };

  player.bullets[bulletId] = bullet;

  // Интервал движения пули
  bulletIntervals[bulletId] = setInterval(() => {
    if (!players[playerId] || !players[playerId].bullets[bulletId]) {
      clearInterval(bulletIntervals[bulletId]);
      delete bulletIntervals[bulletId];
      return;
    }

    bullet.x += bullet.dx;
    bullet.y += bullet.dy;

    // Проверка выхода за границы или попадания
    if (checkBulletHit(bullet, playerId, bulletId)) {
      delete players[playerId].bullets[bulletId];
      clearInterval(bulletIntervals[bulletId]);
      delete bulletIntervals[bulletId];
    }
  }, BULLET_SPEED);
}

// Проверка попадания пули
function checkBulletHit(bullet, shooterId, bulletId) {
  // Проверка границ
  if (bullet.x < 0 || bullet.x >= size.col || bullet.y < 0 || bullet.y >= size.row) {
    return true;
  }

  // Проверка попадания в игроков
  for (const playerId in players) {
    if (playerId === shooterId) continue;

    const target = players[playerId];
    if (!target.status || !positionPiece[target.position]) continue;

    // Проверяем попадание в каждую часть фигуры
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (positionPiece[target.position][y][x] === 1) {
          const cellX = target.x + x;
          const cellY = target.y + y;

          if (bullet.x === cellX && bullet.y === cellY) {
            if (target.position !== 'boomOne' && target.position !== 'boomTwo') {
              players[shooterId].rating++;
              boomAnimate(playerId);
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

// Перемещение игрока с проверкой выхода за границы
function movePlayer(playerId, dx, dy, position) {
  const player = players[playerId];
  if (!player || !player.status) return;

  const newX = player.x + dx;
  const newY = player.y + dy;

  // Быстрая проверка границ
  if (newX < 0 || newX > size.col - 3 || newY < 0 || newY > size.row - 3) return;

  // Проверяем столкновения
  if (!isPlayerCollision(player, newX, newY, position)) {
    player.x = newX;
    player.y = newY;
    player.position = position;
  }
}

// Оптимизированная проверка столкновений между игроками
function isPlayerCollision(player, newX, newY, newPosition) {
  const playerPiece = positionPiece[newPosition];
  if (!playerPiece) return true;

  for (const playerId in players) {
    const otherPlayer = players[playerId];
    if (otherPlayer === player || !otherPlayer.status) continue;

    const otherPiece = positionPiece[otherPlayer.position];
    if (!otherPiece) continue;

    // Быстрая проверка расстояния
    if (Math.abs(newX - otherPlayer.x) > 3 || Math.abs(newY - otherPlayer.y) > 3) continue;

    // Детальная проверка пересечения
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (playerPiece[y][x] !== 1) continue;

        const checkX = newX + x;
        const checkY = newY + y;

        for (let oy = 0; oy < 3; oy++) {
          for (let ox = 0; ox < 3; ox++) {
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
  }
  return false;
}

// Анимация взрыва
function boomAnimate(playerId) {
  const player = players[playerId];
  if (!player || !player.status) return;

  io.sockets.emit('user dead sound');

  player.position = 'boomOne';
  setTimeout(() => {
    if (players[playerId]) players[playerId].position = 'boomTwo';
  }, 200);
  setTimeout(() => {
    if (players[playerId]) players[playerId].position = 'boomOne';
  }, 400);
  setTimeout(() => {
    if (players[playerId]) {
      players[playerId].status = false;
      io.sockets.emit('user dead', playerId);
    }
  }, 600);
}

// Перезапуск игрока
function restartPlayer(playerId) {
  const player = players[playerId];
  if (!player) return;

  const positions = ['top', 'left', 'right', 'bottom'];
  const spawnPos = getSafeSpawnPosition();

  player.status = true;
  player.x = spawnPos.x;
  player.y = spawnPos.y;
  player.position = positions[randomInteger(4)];
  player.bullets = {};
  player.lastShot = 0;

  if (!player.isBot) {
    player.rating = 0;
  }
}

// Обновление состояния игры
function updateGameState() {
  generatePlayField();

  for (const playerId in players) {
    const player = players[playerId];
    if (player && player.status && positionPiece[player.position]) {
      applyPlayerToField(player);
    }

    // Обработка пуль
    for (const bulletId in player?.bullets || {}) {
      const bullet = player.bullets[bulletId];
      if (bullet && bullet.x >= 0 && bullet.x < size.col && bullet.y >= 0 && bullet.y < size.row) {
        playField[bullet.y][bullet.x] = 1;
      }
    }
  }

  checkBulletCollisions();

  io.sockets.emit('state', {
    playField,
    players,
  });
}

// Применение игрока на поле
function applyPlayerToField(player) {
  const piece = positionPiece[player.position];
  if (!piece) return;

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (piece[y][x] === 1 && player.status) {
        const posX = player.x + x;
        const posY = player.y + y;

        if (posX >= 0 && posX < size.col && posY >= 0 && posY < size.row) {
          playField[posY][posX] = 1;
        }
      }
    }
  }
}

// Проверка столкновений пуль
function checkBulletCollisions() {
  const checkedPairs = new Set();

  for (const playerId in players) {
    const player = players[playerId];
    if (!player.status) continue;

    for (const bulletId in player.bullets) {
      const bullet = player.bullets[bulletId];

      for (const otherPlayerId in players) {
        if (playerId >= otherPlayerId) continue;

        const otherPlayer = players[otherPlayerId];
        if (!otherPlayer.status) continue;

        for (const otherBulletId in otherPlayer.bullets) {
          const pairKey = `${bulletId}-${otherBulletId}`;
          if (checkedPairs.has(pairKey)) continue;
          checkedPairs.add(pairKey);

          const otherBullet = otherPlayer.bullets[otherBulletId];

          if (bullet.x === otherBullet.x && bullet.y === otherBullet.y) {
            delete player.bullets[bulletId];
            delete otherPlayer.bullets[otherBulletId];

            if (bulletIntervals[bulletId]) {
              clearInterval(bulletIntervals[bulletId]);
              delete bulletIntervals[bulletId];
            }
            if (bulletIntervals[otherBulletId]) {
              clearInterval(bulletIntervals[otherBulletId]);
              delete bulletIntervals[otherBulletId];
            }

            io.sockets.emit('explosion', { x: bullet.x, y: bullet.y });
          }
        }
      }
    }
  }
}

// ===== УЛУЧШЕННЫЙ ИИ БОТА =====

// Добавление бота
function addBot() {
  const botId = 'bot_' + Math.random().toString(36).substr(2, 9);
  const positions = ['top', 'left', 'right', 'bottom'];
  const spawnPos = getSafeSpawnPosition();

  players[botId] = {
    name: 'Bot',
    status: true,
    isBot: true,
    x: spawnPos.x,
    y: spawnPos.y,
    position: positions[randomInteger(4)],
    bullets: {},
    rating: 0,
    lastShot: 0,
    targetPlayer: null,
    lastMove: Date.now(),
  };

  // Интервал для ИИ бота
  setInterval(() => {
    if (players[botId] && players[botId].status) {
      botAI(botId);
    } else if (!players[botId]) {
      // Если бот умер, воскрешаем его
      setTimeout(() => {
        if (players[botId]) {
          restartPlayer(botId);
        }
      }, 3000);
    }
  }, BOT_UPDATE_INTERVAL);
}

// Улучшенный ИИ бота
function botAI(botId) {
  const bot = players[botId];
  if (!bot || !bot.status) return;

  // 1. Проверка опасности (уклонение от пуль)
  const dangerousBullet = findDangerousBullet(botId);
  if (dangerousBullet) {
    evadeBullet(botId, dangerousBullet);
    return;
  }

  // 2. Поиск цели
  const target = findBestTarget(botId);

  if (target) {
    bot.targetPlayer = target;

    // 3. Проверка возможности выстрела
    const canShoot = isTargetInLine(bot, target);

    if (canShoot && Date.now() - bot.lastShot > BULLET_COOLDOWN) {
      bot.lastShot = Date.now();
      createBullet(botId);
      return;
    }

    // 4. Движение к цели с тактикой
    moveTowardsTarget(botId, target);
  } else {
    // Патрулирование
    patrolMovement(botId);
  }
}

// Поиск ближайшей опасной пули
function findDangerousBullet(botId) {
  const bot = players[botId];
  let closestBullet = null;
  let minDist = Infinity;

  for (const playerId in players) {
    if (playerId === botId) continue;

    const player = players[playerId];
    for (const bulletId in player.bullets) {
      const bullet = player.bullets[bulletId];

      // Проверяем, летит ли пуля в сторону бота
      const dist = Math.abs(bullet.x - bot.x) + Math.abs(bullet.y - bot.y);

      if (dist < 5 && isHeadingTowards(bullet, bot)) {
        if (dist < minDist) {
          minDist = dist;
          closestBullet = bullet;
        }
      }
    }
  }

  return closestBullet;
}

// Проверка, летит ли пуля в сторону бота
function isHeadingTowards(bullet, bot) {
  const threshold = 2;

  switch (bullet.direction) {
    case 'up':
      return bullet.y > bot.y && Math.abs(bullet.x - bot.x) < threshold;
    case 'down':
      return bullet.y < bot.y && Math.abs(bullet.x - bot.x) < threshold;
    case 'left':
      return bullet.x > bot.x && Math.abs(bullet.y - bot.y) < threshold;
    case 'right':
      return bullet.x < bot.x && Math.abs(bullet.y - bot.y) < threshold;
  }
  return false;
}

// Уклонение от пули
function evadeBullet(botId, bullet) {
  const bot = players[botId];

  // Двигаемся перпендикулярно направлению пули
  if (bullet.direction === 'up' || bullet.direction === 'down') {
    // Пуля летит вертикально - двигаемся горизонтально
    if (bot.x < size.col / 2) {
      tryMove(botId, 1, 0, 'left');
    } else {
      tryMove(botId, -1, 0, 'right');
    }
  } else {
    // Пуля летит горизонтально - двигаемся вертикально
    if (bot.y < size.row / 2) {
      tryMove(botId, 0, 1, 'bottom');
    } else {
      tryMove(botId, 0, -1, 'top');
    }
  }
}

// Поиск лучшей цели
function findBestTarget(botId) {
  const bot = players[botId];
  let bestTarget = null;
  let bestScore = -Infinity;

  for (const playerId in players) {
    if (playerId === botId || playerId.startsWith('bot_')) continue;

    const player = players[playerId];
    if (!player.status) continue;

    const dist = Math.abs(bot.x - player.x) + Math.abs(bot.y - player.y);

    // Оценка цели: близость + рейтинг противника
    const score = -dist + player.rating * 10;

    if (score > bestScore && dist < BOT_SHOOT_DISTANCE) {
      bestScore = score;
      bestTarget = player;
    }
  }

  return bestTarget;
}

// Проверка, находится ли цель на линии огня
function isTargetInLine(bot, target) {
  const tolerance = 1;

  switch (bot.position) {
    case 'top':
      return Math.abs(bot.x - target.x) <= tolerance && target.y < bot.y;
    case 'bottom':
      return Math.abs(bot.x - target.x) <= tolerance && target.y > bot.y;
    case 'left':
      return Math.abs(bot.y - target.y) <= tolerance && target.x > bot.x;
    case 'right':
      return Math.abs(bot.y - target.y) <= tolerance && target.x < bot.x;
  }
  return false;
}

// Движение к цели с тактикой
function moveTowardsTarget(botId, target) {
  const bot = players[botId];
  const dx = target.x - bot.x;
  const dy = target.y - bot.y;

  // Приоритет: сначала выравниваемся по оси для выстрела
  if (Math.abs(dx) > Math.abs(dy)) {
    // Горизонтальное выравнивание
    if (dx > 0) {
      tryMove(botId, -1, 0, 'right');
    } else {
      tryMove(botId, 1, 0, 'left');
    }
  } else {
    // Вертикальное выравнивание
    if (dy > 0) {
      tryMove(botId, 0, 1, 'bottom');
    } else {
      tryMove(botId, 0, -1, 'top');
    }
  }
}

// Патрулирование
function patrolMovement(botId) {
  const moves = [
    { dx: 1, dy: 0, pos: 'left' },
    { dx: -1, dy: 0, pos: 'right' },
    { dx: 0, dy: 1, pos: 'bottom' },
    { dx: 0, dy: -1, pos: 'top' },
  ];

  const randomMove = moves[randomInteger(4)];
  tryMove(botId, randomMove.dx, randomMove.dy, randomMove.pos);
}

// Попытка движения
function tryMove(botId, dx, dy, position) {
  const bot = players[botId];
  if (!bot) return false;

  const newX = bot.x + dx;
  const newY = bot.y + dy;

  if (newX < 0 || newX > size.col - 3 || newY < 0 || newY > size.row - 3) {
    return false;
  }

  if (!isPlayerCollision(bot, newX, newY, position)) {
    bot.x = newX;
    bot.y = newY;
    bot.position = position;
    bot.lastMove = Date.now();
    return true;
  }

  return false;
}

// Добавляем ботов при старте
addBot();
addBot(); // Можно добавить несколько ботов

// Запуск игрового цикла
setInterval(updateGameState, GAME_UPDATE_INTERVAL);