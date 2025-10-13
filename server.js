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
var bulletIntervals = {};
const botIntervals = {};
const botMemory = {};

// Размер игрового поля
const size = {
  col: 50,
  row: 30,
};

// Константы
const BULLET_SPEED = 100;
const BOT_UPDATE_INTERVAL = 200;
const GAME_UPDATE_INTERVAL = 50;
const BULLET_COOLDOWN = 200;
const BOT_SHOOT_DISTANCE = 20;
const INVULNERABILITY_TIME = 2000; // 2 секунды неуязвимости

// Позиции для отображения фигур
const positionPiece = {
  top: [[0, 1, 0], [1, 1, 1], [1, 0, 1]],
  bottom: [[1, 0, 1], [1, 1, 1], [0, 1, 0]],
  left: [[1, 1, 0], [0, 1, 1], [1, 1, 0]],
  right: [[0, 1, 1], [1, 1, 0], [0, 1, 1]],
  boomOne: [[1, 0, 1], [0, 1, 0], [1, 0, 1]],
  boomTwo: [[0, 1, 0], [1, 0, 1], [0, 1, 0]],
};

// Направления движения
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
      lastShot: 0,
      invulnerableUntil: Date.now() + INVULNERABILITY_TIME,
    };

    socket.emit('player id', socket.id);
  });

  socket.on('movePieceRight', () => movePlayer(socket.id, -1, 0, 'right'));
  socket.on('movePieceLeft', () => movePlayer(socket.id, 1, 0, 'left'));
  socket.on('movePieceTop', () => movePlayer(socket.id, 0, -1, 'top'));
  socket.on('movePieceBottom', () => movePlayer(socket.id, 0, 1, 'bottom'));

  socket.on('moveShot', function () {
    const player = players[socket.id];
    if (!player || !player.status) return;

    const now = Date.now();
    if (now - player.lastShot < BULLET_COOLDOWN) return;

    player.lastShot = now;
    createBullet(socket.id);
  });

  socket.on('restart', function () {
    if (players[socket.id]) {
      restartPlayer(socket.id);
    }
  });

  socket.on('disconnect', function () {
    console.log('Player disconnected:', socket.id);
    if (players[socket.id]) {
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

  bulletIntervals[bulletId] = setInterval(() => {
    if (!players[playerId] || !players[playerId].bullets[bulletId]) {
      clearInterval(bulletIntervals[bulletId]);
      delete bulletIntervals[bulletId];
      return;
    }

    bullet.x += bullet.dx;
    bullet.y += bullet.dy;

    if (checkBulletHit(bullet, playerId, bulletId)) {
      delete players[playerId].bullets[bulletId];
      clearInterval(bulletIntervals[bulletId]);
      delete bulletIntervals[bulletId];
    }
  }, BULLET_SPEED);
}

// Проверка попадания пули
function checkBulletHit(bullet, shooterId, bulletId) {
  if (bullet.x < 0 || bullet.x >= size.col || bullet.y < 0 || bullet.y >= size.row) {
    return true;
  }

  const now = Date.now();

  for (const playerId in players) {
    if (playerId === shooterId) continue;

    const target = players[playerId];
    if (!target.status || !positionPiece[target.position]) continue;

    // Проверка неуязвимости
    if (target.invulnerableUntil && now < target.invulnerableUntil) continue;

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

// Перемещение игрока с проверкой столкновений
function movePlayer(playerId, dx, dy, position) {
  const player = players[playerId];
  if (!player || !player.status) return;

  const newX = player.x + dx;
  const newY = player.y + dy;

  if (newX < 0 || newX > size.col - 3 || newY < 0 || newY > size.row - 3) return;

  // Проверяем столкновения
  const collidedPlayer = checkPlayerCollision(player, newX, newY, position);
  if (collidedPlayer) {
    const collided = players[collidedPlayer];
    // При любом столкновении оба взрываются
    if (collided) {
      boomAnimate(playerId);
      boomAnimate(collidedPlayer);
      io.sockets.emit('collision explosion', {
        x: (player.x + collided.x) / 2,
        y: (player.y + collided.y) / 2
      });
    }
  } else {
    player.x = newX;
    player.y = newY;
    player.position = position;
  }
}

// Проверка столкновений между игроками (возвращает ID столкнувшегося игрока)
function checkPlayerCollision(player, newX, newY, newPosition) {
  const playerPiece = positionPiece[newPosition];
  if (!playerPiece) return null;

  const now = Date.now();

  for (const playerId in players) {
    const otherPlayer = players[playerId];
    if (otherPlayer === player || !otherPlayer.status) continue;

    // Проверка неуязвимости обоих игроков
    const playerInvulnerable = player.invulnerableUntil && now < player.invulnerableUntil;
    const otherInvulnerable = otherPlayer.invulnerableUntil && now < otherPlayer.invulnerableUntil;

    if (playerInvulnerable || otherInvulnerable) continue;

    const otherPiece = positionPiece[otherPlayer.position];
    if (!otherPiece) continue;

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
                return playerId;
              }
            }
          }
        }
      }
    }
  }
  return null;
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

// Перезапуск игрока с неуязвимостью
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
  player.invulnerableUntil = Date.now() + INVULNERABILITY_TIME;

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
    invulnerableUntil: Date.now() + INVULNERABILITY_TIME,
  };

  // Инициализируем память бота
  botMemory[botId] = {
    lastPositions: [], // История последних позиций
    stuckCounter: 0, // Счетчик застревания
    lastTarget: null, // Последняя цель
    pathBlocked: 0, // Счетчик заблокированных путей
    avoidanceMode: false, // Режим избегания
    avoidanceTimer: 0,
  };

  botIntervals[botId] = setInterval(() => {
    if (!players[botId]) {
      clearInterval(botIntervals[botId]);
      delete botIntervals[botId];
      delete botMemory[botId];
      return;
    }

    if (players[botId].status) {
      botAI(botId);
    } else {
      static_respawnTimeout = static_respawnTimeout || {};
      if (!static_respawnTimeout[botId]) {
        static_respawnTimeout[botId] = setTimeout(() => {
          if (players[botId]) {
            restartPlayer(botId);
            // Сбрасываем память при возрождении
            botMemory[botId] = {
              lastPositions: [],
              stuckCounter: 0,
              lastTarget: null,
              pathBlocked: 0,
              avoidanceMode: false,
              avoidanceTimer: 0,
            };
          }
          delete static_respawnTimeout[botId];
        }, 3000);
      }
    }
  }, BOT_UPDATE_INTERVAL);

  console.log('Bot added:', botId);
}

let static_respawnTimeout = {};

// Улучшенный ИИ бота с агрессивной охотой
function botAI(botId) {
  const bot = players[botId];
  if (!bot || !bot.status) return;

  const memory = botMemory[botId];
  if (!memory) return;

  const now = Date.now();

  // Сохраняем текущую позицию в историю
  updateBotMemory(botId);

  // Проверка зацикливания
  if (isStuck(botId)) {
    memory.stuckCounter++;
    if (memory.stuckCounter > 3) {
      // Бот застрял - делаем случайный маневр
      executeRandomManeuver(botId);
      memory.stuckCounter = 0;
      memory.lastPositions = [];
      return;
    }
  } else {
    memory.stuckCounter = 0;
  }

  // 1. КРИТИЧЕСКИЙ ПРИОРИТЕТ: Уклонение от снарядов
  const dangerousBullets = findAllDangerousBullets(botId);
  if (dangerousBullets.length > 0) {
    const bestEvasion = calculateBestEvasion(botId, dangerousBullets);
    if (bestEvasion && tryMove(botId, bestEvasion.dx, bestEvasion.dy, bestEvasion.pos)) {
      return;
    }
  }

  // Поиск всех опасных снарядов
  function findAllDangerousBullets(botId) {
    const bot = players[botId];
    if (!bot) return [];

    const dangerousBullets = [];

    for (const playerId in players) {
      if (playerId === botId) continue;

      const player = players[playerId];
      if (!player || !player.bullets) continue;

      for (const bulletId in player.bullets) {
        const bullet = player.bullets[bulletId];
        if (!bullet) continue;

        const dist = Math.abs(bullet.x - bot.x) + Math.abs(bullet.y - bot.y);

        // Увеличиваем дистанцию обнаружения
        if (dist < 8 && isHeadingTowards(bullet, bot)) {
          dangerousBullets.push({ bullet, distance: dist, playerId });
        }
      }
    }

    return dangerousBullets.sort((a, b) => a.distance - b.distance);
  }

  // 2. ВЫСОКИЙ ПРИОРИТЕТ: Избегание столкновений с другими объектами
  if (isInDangerZone(botId)) {
    const safeMove = findSafeEscapeMove(botId);
    if (safeMove && tryMove(botId, safeMove.dx, safeMove.dy, safeMove.pos)) {
      return;
    }
  }

  // 3. СРЕДНИЙ ПРИОРИТЕТ: Поиск и атака цели
  const target = findBestTarget(botId);

  if (target) {
    memory.lastTarget = target;
    const distance = Math.abs(bot.x - target.x) + Math.abs(bot.y - target.y);

    // 3a. Если цель на линии огня - стреляем
    if (isTargetInLine(bot, target) && distance < BOT_SHOOT_DISTANCE) {
      if (now - bot.lastShot > BULLET_COOLDOWN) {
        bot.lastShot = now;
        createBullet(botId);

        // Немного отступаем после выстрела (тактика)
        setTimeout(() => {
          if (players[botId] && players[botId].status) {
            const retreatMove = getRetreatMove(botId);
            if (retreatMove) {
              tryMove(botId, retreatMove.dx, retreatMove.dy, retreatMove.pos);
            }
          }
        }, 100);
        return;
      }
    }

    // 3b. Умное преследование цели
    const huntMove = calculateSmartHunt(botId, target);
    if (huntMove) {
      if (tryMove(botId, huntMove.dx, huntMove.dy, huntMove.pos)) {
        memory.pathBlocked = 0;
        return;
      } else {
        memory.pathBlocked++;
        // Если путь заблокирован несколько раз - обходим
        if (memory.pathBlocked > 2) {
          const alternativeMove = findAlternativeRoute(botId, target);
          if (alternativeMove && tryMove(botId, alternativeMove.dx, alternativeMove.dy, alternativeMove.pos)) {
            memory.pathBlocked = 0;
            return;
          }
        }
      }
    }
  }

  // 4. НИЗКИЙ ПРИОРИТЕТ: Тактическое патрулирование
  smartPatrol(botId);
}

// Тактическое патрулирование
function smartPatrol(botId) {
  const bot = players[botId];
  if (!bot) return;

  const centerX = Math.floor(size.col / 2);
  const centerY = Math.floor(size.row / 2);

  const moves = [
    { dx: 1, dy: 0, pos: 'left' },
    { dx: -1, dy: 0, pos: 'right' },
    { dx: 0, dy: 1, pos: 'bottom' },
    { dx: 0, dy: -1, pos: 'top' },
  ];

  // Стремимся к центру, если далеко
  const distToCenter = Math.abs(bot.x - centerX) + Math.abs(bot.y - centerY);

  if (distToCenter > 5) {
    const dx = centerX - bot.x;
    const dy = centerY - bot.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      const move = dx > 0 ? { dx: -1, dy: 0, pos: 'right' } : { dx: 1, dy: 0, pos: 'left' };
      if (isSafeMove(botId, move.dx, move.dy, move.pos) && tryMove(botId, move.dx, move.dy, move.pos)) {
        return;
      }
    } else {
      const move = dy > 0 ? { dx: 0, dy: 1, pos: 'bottom' } : { dx: 0, dy: -1, pos: 'top' };
      if (isSafeMove(botId, move.dx, move.dy, move.pos) && tryMove(botId, move.dx, move.dy, move.pos)) {
        return;
      }
    }
  }

  // Случайное патрулирование
  for (let i = 0; i < 3; i++) {
    const move = moves[randomInteger(4)];
    if (isSafeMove(botId, move.dx, move.dy, move.pos) && tryMove(botId, move.dx, move.dy, move.pos)) {
      return;
    }
  }
}

// Маневр отступления после выстрела
function getRetreatMove(botId) {
  const bot = players[botId];
  if (!bot) return null;

  // Отступаем в обратную сторону от направления взгляда
  const retreats = {
    top: { dx: 0, dy: 1, pos: 'bottom' },
    bottom: { dx: 0, dy: -1, pos: 'top' },
    left: { dx: -1, dy: 0, pos: 'right' },
    right: { dx: 1, dy: 0, pos: 'left' },
  };

  const retreat = retreats[bot.position];
  if (retreat && isSafeMove(botId, retreat.dx, retreat.dy, retreat.pos)) {
    return retreat;
  }

  return null;
}

// Альтернативный маршрут (обход)
function findAlternativeRoute(botId, target) {
  const bot = players[botId];
  if (!bot || !target) return null;

  const dx = target.x - bot.x;
  const dy = target.y - bot.y;

  // Пробуем двигаться перпендикулярно
  const alternatives = [];

  if (Math.abs(dx) > Math.abs(dy)) {
    alternatives.push({ dx: 0, dy: 1, pos: 'bottom' });
    alternatives.push({ dx: 0, dy: -1, pos: 'top' });
  } else {
    alternatives.push({ dx: 1, dy: 0, pos: 'left' });
    alternatives.push({ dx: -1, dy: 0, pos: 'right' });
  }

  for (const move of alternatives) {
    if (isSafeMove(botId, move.dx, move.dy, move.pos)) {
      return move;
    }
  }

  return null;
}

// Умное преследование
function calculateSmartHunt(botId, target) {
  const bot = players[botId];
  if (!bot || !target) return null;

  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  const moves = [];

  // Приоритет: выравнивание для выстрела
  if (absX > absY) {
    if (dx > 0) moves.push({ dx: -1, dy: 0, pos: 'right', priority: 3 });
    else moves.push({ dx: 1, dy: 0, pos: 'left', priority: 3 });

    if (dy > 0) moves.push({ dx: 0, dy: 1, pos: 'bottom', priority: 2 });
    else if (dy < 0) moves.push({ dx: 0, dy: -1, pos: 'top', priority: 2 });
  } else {
    if (dy > 0) moves.push({ dx: 0, dy: 1, pos: 'bottom', priority: 3 });
    else moves.push({ dx: 0, dy: -1, pos: 'top', priority: 3 });

    if (dx > 0) moves.push({ dx: -1, dy: 0, pos: 'right', priority: 2 });
    else if (dx < 0) moves.push({ dx: 1, dy: 0, pos: 'left', priority: 2 });
  }

  moves.sort((a, b) => b.priority - a.priority);

  // Выбираем первое безопасное движение
  for (const move of moves) {
    if (isSafeMove(botId, move.dx, move.dy, move.pos)) {
      return move;
    }
  }

  return moves[0]; // Возвращаем хотя бы что-то
}

// Поиск лучшей цели
function findBestTarget(botId) {
  const bot = players[botId];
  if (!bot) return null;

  let bestTarget = null;
  let bestScore = -Infinity;

  for (const playerId in players) {
    if (playerId === botId || players[playerId].isBot) continue;

    const player = players[playerId];
    if (!player.status) continue;

    const dist = Math.abs(bot.x - player.x) + Math.abs(bot.y - player.y);

    // Оценка: близость + рейтинг
    let score = -dist + player.rating * 5;

    // Бонус, если цель на линии огня
    if (isTargetInLine(bot, player)) {
      score += 20;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTarget = player;
    }
  }

  return bestTarget;
}

// Поиск безопасного пути отхода
function findSafeEscapeMove(botId) {
  const bot = players[botId];
  if (!bot) return null;

  const centerX = Math.floor(size.col / 2);
  const centerY = Math.floor(size.row / 2);

  const moves = [
    { dx: 1, dy: 0, pos: 'left' },
    { dx: -1, dy: 0, pos: 'right' },
    { dx: 0, dy: 1, pos: 'bottom' },
    { dx: 0, dy: -1, pos: 'top' },
  ];

  let bestMove = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;

    if (newX < 2 || newX > size.col - 5 || newY < 2 || newY > size.row - 5) continue;

    let score = 0;

    // Предпочитаем движение к центру
    const distToCenter = Math.abs(newX - centerX) + Math.abs(newY - centerY);
    score -= distToCenter;

    // Проверяем безопасность
    if (isSafeMove(botId, move.dx, move.dy, move.pos)) {
      score += 30;
    }

    // Проверяем дистанцию до ближайших противников
    let minDistToEnemy = Infinity;
    for (const playerId in players) {
      if (playerId === botId) continue;
      const other = players[playerId];
      if (!other || !other.status) continue;

      const dist = Math.abs(newX - other.x) + Math.abs(newY - other.y);
      minDistToEnemy = Math.min(minDistToEnemy, dist);
    }
    score += minDistToEnemy * 2;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

// Проверка опасной зоны (близко к другим объектам)
function isInDangerZone(botId) {
  const bot = players[botId];
  if (!bot) return false;

  // Проверяем близость к краям
  if (bot.x <= 2 || bot.x >= size.col - 5 || bot.y <= 2 || bot.y >= size.row - 5) {
    return true;
  }

  // Проверяем близость к другим ботам/игрокам
  for (const playerId in players) {
    if (playerId === botId) continue;

    const other = players[playerId];
    if (!other || !other.status) continue;

    const dist = Math.abs(bot.x - other.x) + Math.abs(bot.y - other.y);
    if (dist < 3) {
      return true;
    }
  }

  return false;
}

function updateBotMemory(botId) {
  const bot = players[botId];
  const memory = botMemory[botId];
  if (!bot || !memory) return;

  memory.lastPositions.push({ x: bot.x, y: bot.y, time: Date.now() });

  // Храним только последние 5 позиций
  if (memory.lastPositions.length > 5) {
    memory.lastPositions.shift();
  }
}

// Расчет лучшего маневра уклонения
function calculateBestEvasion(botId, dangerousBullets) {
  const bot = players[botId];
  if (!bot) return null;

  const allMoves = [
    { dx: 1, dy: 0, pos: 'left' },
    { dx: -1, dy: 0, pos: 'right' },
    { dx: 0, dy: 1, pos: 'bottom' },
    { dx: 0, dy: -1, pos: 'top' },
    { dx: 1, dy: 1, pos: 'bottom' },
    { dx: -1, dy: 1, pos: 'bottom' },
    { dx: 1, dy: -1, pos: 'top' },
    { dx: -1, dy: -1, pos: 'top' },
  ];

  let bestMove = null;
  let bestScore = -Infinity;

  for (const move of allMoves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;

    // Проверяем границы
    if (newX < 1 || newX > size.col - 4 || newY < 1 || newY > size.row - 4) continue;

    let score = 0;

    // Оцениваем безопасность этой позиции
    for (const danger of dangerousBullets) {
      const bullet = danger.bullet;
      const newDist = Math.abs(bullet.x - newX) + Math.abs(bullet.y - newY);

      // Чем дальше от снаряда, тем лучше
      score += newDist * 2;

      // Проверяем, будет ли снаряд лететь в новую позицию
      const wouldHit = checkIfBulletWouldHit(bullet, newX, newY);
      if (wouldHit) {
        score -= 50; // Сильный штраф
      }
    }

    // Проверяем столкновения
    if (!isSafeMove(botId, move.dx, move.dy, move.pos)) {
      score -= 20;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

// Проверка, попадет ли снаряд в позицию
function checkIfBulletWouldHit(bullet, x, y) {
  const threshold = 2;

  switch (bullet.direction) {
    case 'up':
      return bullet.y > y && Math.abs(bullet.x - x) < threshold;
    case 'down':
      return bullet.y < y && Math.abs(bullet.x - x) < threshold;
    case 'left':
      return bullet.x > x && Math.abs(bullet.y - y) < threshold;
    case 'right':
      return bullet.x < x && Math.abs(bullet.y - y) < threshold;
  }
  return false;
}

// Случайный маневр для выхода из застревания
function executeRandomManeuver(botId) {
  const moves = [
    { dx: 2, dy: 0, pos: 'left' },
    { dx: -2, dy: 0, pos: 'right' },
    { dx: 0, dy: 2, pos: 'bottom' },
    { dx: 0, dy: -2, pos: 'top' },
    { dx: 1, dy: 1, pos: 'bottom' },
    { dx: -1, dy: 1, pos: 'bottom' },
    { dx: 1, dy: -1, pos: 'top' },
    { dx: -1, dy: -1, pos: 'top' },
  ];

  // Пробуем несколько случайных маневров
  for (let i = 0; i < 3; i++) {
    const move = moves[randomInteger(moves.length)];
    if (tryMove(botId, move.dx, move.dy, move.pos)) {
      return;
    }
  }
}

// Улучшенный ИИ бота с агрессивной охотой
function botAI(botId) {
  const bot = players[botId];
  if (!bot || !bot.status) return;

  const now = Date.now();

  // 1. Проверка опасности (уклонение от пуль)
  const dangerousBullet = findDangerousBullet(botId);
  if (dangerousBullet) {
    evadeBullet(botId, dangerousBullet);
    return;
  }

  // 2. Агрессивный поиск ближайшей цели
  const target = findNearestPlayer(botId);

  if (target) {
    bot.targetPlayer = target;

    const distance = Math.abs(bot.x - target.x) + Math.abs(bot.y - target.y);

    // 3. Если цель на линии огня - стреляем
    if (isTargetInLine(bot, target) && distance < BOT_SHOOT_DISTANCE) {
      if (now - bot.lastShot > BULLET_COOLDOWN) {
        bot.lastShot = now;
        createBullet(botId);
        return;
      }
    }

    // 4. Агрессивное преследование цели
    huntTarget(botId, target);
  } else {
    // Патрулирование в поисках целей
    aggressivePatrol(botId);
  }
}

// Проверка, застрял ли бот
function isStuck(botId) {
  const memory = botMemory[botId];
  if (!memory || memory.lastPositions.length < 4) return false;

  const positions = memory.lastPositions;
  const recent = positions.slice(-4);

  // Проверяем, повторяются ли позиции
  const uniquePositions = new Set(recent.map(p => `${p.x},${p.y}`));

  // Если за последние 4 хода было меньше 3 уникальных позиций - застрял
  return uniquePositions.size <= 2;
}

// Поиск ближайшего игрока (не бота)
function findNearestPlayer(botId) {
  const bot = players[botId];
  if (!bot) return null;

  let nearestPlayer = null;
  let minDist = Infinity;

  for (const playerId in players) {
    // Пропускаем самого себя и других ботов
    if (playerId === botId || players[playerId].isBot) continue;

    const player = players[playerId];
    if (!player.status) continue;

    const dist = Math.abs(bot.x - player.x) + Math.abs(bot.y - player.y);

    if (dist < minDist) {
      minDist = dist;
      nearestPlayer = player;
    }
  }

  return nearestPlayer;
}

// Поиск опасной пули
function findDangerousBullet(botId) {
  const bot = players[botId];
  if (!bot) return null;

  let closestBullet = null;
  let minDist = Infinity;

  for (const playerId in players) {
    if (playerId === botId) continue;

    const player = players[playerId];
    if (!player || !player.bullets) continue;

    for (const bulletId in player.bullets) {
      const bullet = player.bullets[bulletId];
      if (!bullet) continue;

      const dist = Math.abs(bullet.x - bot.x) + Math.abs(bullet.y - bot.y);

      if (dist < 6 && isHeadingTowards(bullet, bot)) {
        if (dist < minDist) {
          minDist = dist;
          closestBullet = bullet;
        }
      }
    }
  }

  return closestBullet;
}

// Проверка направления пули
function isHeadingTowards(bullet, bot) {
  const threshold = 3;

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
  if (!bot) return;

  if (bullet.direction === 'up' || bullet.direction === 'down') {
    // Пуля летит вертикально - двигаемся горизонтально
    const targetX = bot.x < size.col / 2 ? bot.x + 2 : bot.x - 2;
    if (targetX > bot.x) {
      tryMove(botId, 1, 0, 'left');
    } else {
      tryMove(botId, -1, 0, 'right');
    }
  } else {
    // Пуля летит горизонтально - двигаемся вертикально
    const targetY = bot.y < size.row / 2 ? bot.y + 2 : bot.y - 2;
    if (targetY > bot.y) {
      tryMove(botId, 0, 1, 'bottom');
    } else {
      tryMove(botId, 0, -1, 'top');
    }
  }
}

// Проверка линии огня
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

// Агрессивное преследование цели
function huntTarget(botId, target) {
  const bot = players[botId];
  if (!bot || !target) return;

  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  // Проверяем, безопасно ли двигаться в каждом направлении
  const moves = [];

  // Приоритетное направление к цели
  if (absX > absY) {
    if (dx > 0) {
      moves.push({ dx: -1, dy: 0, pos: 'right', priority: 3 });
    } else {
      moves.push({ dx: 1, dy: 0, pos: 'left', priority: 3 });
    }

    if (dy > 0) {
      moves.push({ dx: 0, dy: 1, pos: 'bottom', priority: 2 });
    } else if (dy < 0) {
      moves.push({ dx: 0, dy: -1, pos: 'top', priority: 2 });
    }
  } else {
    if (dy > 0) {
      moves.push({ dx: 0, dy: 1, pos: 'bottom', priority: 3 });
    } else {
      moves.push({ dx: 0, dy: -1, pos: 'top', priority: 3 });
    }

    if (dx > 0) {
      moves.push({ dx: -1, dy: 0, pos: 'right', priority: 2 });
    } else if (dx < 0) {
      moves.push({ dx: 1, dy: 0, pos: 'left', priority: 2 });
    }
  }

  // Добавляем альтернативные направления
  const allMoves = [
    { dx: -1, dy: 0, pos: 'right', priority: 1 },
    { dx: 1, dy: 0, pos: 'left', priority: 1 },
    { dx: 0, dy: 1, pos: 'bottom', priority: 1 },
    { dx: 0, dy: -1, pos: 'top', priority: 1 },
  ];

  allMoves.forEach(move => {
    if (!moves.find(m => m.dx === move.dx && m.dy === move.dy)) {
      moves.push(move);
    }
  });

  // Сортируем по приоритету
  moves.sort((a, b) => b.priority - a.priority);

  // Пробуем двигаться, проверяя безопасность
  for (const move of moves) {
    if (isSafeMove(botId, move.dx, move.dy, move.pos)) {
      if (tryMove(botId, move.dx, move.dy, move.pos)) {
        return;
      }
    }
  }
}


function isSafeMove(botId, dx, dy, position) {
  const bot = players[botId];
  if (!bot) return false;

  const newX = bot.x + dx;
  const newY = bot.y + dy;

  // Проверка границ с отступом
  const borderMargin = 2;
  if (newX < borderMargin || newX > size.col - 3 - borderMargin ||
    newY < borderMargin || newY > size.row - 3 - borderMargin) {
    return false;
  }

  // Проверка столкновений
  const collidedPlayer = checkPotentialCollision(bot, newX, newY, position);
  if (collidedPlayer) {
    return false;
  }

  return true;
}

function checkPotentialCollision(player, newX, newY, newPosition) {
  const playerPiece = positionPiece[newPosition];
  if (!playerPiece) return null;

  for (const playerId in players) {
    const otherPlayer = players[playerId];
    if (otherPlayer === player || !otherPlayer.status) continue;

    const otherPiece = positionPiece[otherPlayer.position];
    if (!otherPiece) continue;

    if (Math.abs(newX - otherPlayer.x) > 3 || Math.abs(newY - otherPlayer.y) > 3) continue;

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
                return playerId;
              }
            }
          }
        }
      }
    }
  }
  return null;
}

// Агрессивное патрулирование
function aggressivePatrol(botId) {
  const bot = players[botId];
  if (!bot) return;

  // Движемся к центру карты
  const centerX = Math.floor(size.col / 2);
  const centerY = Math.floor(size.row / 2);

  const dx = centerX - bot.x;
  const dy = centerY - bot.y;

  const moves = [];

  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    // Идем к центру
    if (Math.abs(dx) > Math.abs(dy)) {
      moves.push({ dx: dx > 0 ? -1 : 1, dy: 0, pos: dx > 0 ? 'right' : 'left' });
      moves.push({ dx: 0, dy: dy > 0 ? 1 : -1, pos: dy > 0 ? 'bottom' : 'top' });
    } else {
      moves.push({ dx: 0, dy: dy > 0 ? 1 : -1, pos: dy > 0 ? 'bottom' : 'top' });
      moves.push({ dx: dx > 0 ? -1 : 1, dy: 0, pos: dx > 0 ? 'right' : 'left' });
    }
  } else {
    // Патрулируем вокруг центра
    moves.push(
      { dx: 1, dy: 0, pos: 'left' },
      { dx: -1, dy: 0, pos: 'right' },
      { dx: 0, dy: 1, pos: 'bottom' },
      { dx: 0, dy: -1, pos: 'top' }
    );
  }

  // Пробуем безопасные движения
  for (const move of moves) {
    if (isSafeMove(botId, move.dx, move.dy, move.pos)) {
      if (tryMove(botId, move.dx, move.dy, move.pos)) {
        return;
      }
    }
  }

  // Если все безопасные направления заблокированы, пробуем любое
  for (const move of moves) {
    if (tryMove(botId, move.dx, move.dy, move.pos)) {
      return;
    }
  }
}

// Попытка движения
function tryMove(botId, dx, dy, position) {
  const bot = players[botId];
  if (!bot || !bot.status) return false;

  const newX = bot.x + dx;
  const newY = bot.y + dy;

  if (newX < 0 || newX > size.col - 3 || newY < 0 || newY > size.row - 3) {
    return false;
  }

  const collidedPlayer = checkPlayerCollision(bot, newX, newY, position);

  if (!collidedPlayer) {
    bot.x = newX;
    bot.y = newY;
    bot.position = position;
    bot.lastMove = Date.now();
    return true;
  } else {
    const collided = players[collidedPlayer];
    if (collided) {
      boomAnimate(botId);
      boomAnimate(collidedPlayer);
      io.sockets.emit('collision explosion', {
        x: (bot.x + collided.x) / 2,
        y: (bot.y + collided.y) / 2
      });
    }
  }

  return false;
}

// Добавляем ботов при старте
addBot();
addBot();
addBot(); // Добавим третьего бота для большей динамики

// Запуск игрового цикла
setInterval(updateGameState, GAME_UPDATE_INTERVAL);