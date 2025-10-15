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

// Оптимизация: пул пуль и кеш
const bulletPool = [];
const activeBullets = new Map();
let bulletIdCounter = 0;
let lastGameUpdate = 0;

// Стены на игровом поле
const walls = [];

// Размер игрового поля
const size = {
  col: 50,
  row: 30,
};

// Константы
const BULLET_SPEED = 100;
const BOT_UPDATE_INTERVAL = 400; // Оптимизированная частота
const GAME_UPDATE_INTERVAL = 100; // Увеличено для снижения нагрузки
const BULLET_COOLDOWN = 200;
const BOT_SHOOT_DISTANCE = 15;
const INVULNERABILITY_TIME = 2000;

// Оптимизация производительности
const MAX_PLAYERS = 20;
const COLLISION_CHECK_DISTANCE = 5;
const BULLET_POOL_SIZE = 100;

// Позиции для отображения фигур
const positionPiece = {
  top: [[0, 1, 0], [1, 1, 1], [1, 0, 1]],
  bottom: [[1, 0, 1], [1, 1, 1], [0, 1, 0]],
  left: [[1, 1, 0], [0, 1, 1], [1, 1, 0]],
  right: [[0, 1, 1], [1, 1, 0], [0, 1, 1]],
  boomOne: [[1, 0, 1], [0, 1, 0], [1, 0, 1]],
  boomTwo: [[0, 1, 0], [1, 0, 1], [0, 1, 0]],
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

// Создание стен на игровом поле
function generateWalls() {
  // Очищаем существующие стены
  walls.length = 0;
  
  // Стена 1: Вертикальная стена слева
  for (let y = 8; y < 22; y++) {
    walls.push({ x: 15, y: y, type: 'wall' });
  }
  
  // Стена 2: Горизонтальная стена сверху
  for (let x = 20; x < 35; x++) {
    walls.push({ x: x, y: 10, type: 'wall' });
  }
  
  // Стена 3: Вертикальная стена справа
  for (let y = 5; y < 18; y++) {
    walls.push({ x: 35, y: y, type: 'wall' });
  }
  
  // Стена 4: Короткая горизонтальная стена снизу
  for (let x = 8; x < 15; x++) {
    walls.push({ x: x, y: 20, type: 'wall' });
  }
  
  // Стена 5: L-образная стена
  for (let x = 40; x < 45; x++) {
    walls.push({ x: x, y: 20, type: 'wall' });
  }
  for (let y = 20; y < 25; y++) {
    walls.push({ x: 40, y: y, type: 'wall' });
  }
}

generateWalls();

// Инициализация пула пуль
function initializeBulletPool() {
  for (let i = 0; i < BULLET_POOL_SIZE; i++) {
    bulletPool.push({
      id: null,
      position: null,
      x: 0,
      y: 0,
      direction: null,
      dx: 0,
      dy: 0,
      ownerId: null,
      active: false
    });
  }
}

initializeBulletPool();

function randomInteger(max) {
  return Math.floor(Math.random() * max);
}

// Получение пули из пула
function getBulletFromPool() {
  for (const bullet of bulletPool) {
    if (!bullet.active) {
      bullet.active = true;
      bullet.id = `bullet_${++bulletIdCounter}`;
      return bullet;
    }
  }
  // Если пул пуст, создаем новую пулю
  const bullet = {
    id: `bullet_${++bulletIdCounter}`,
    position: null,
    x: 0,
    y: 0,
    direction: null,
    dx: 0,
    dy: 0,
    ownerId: null,
    active: true
  };
  bulletPool.push(bullet);
  return bullet;
}

// Возврат пули в пул
function returnBulletToPool(bulletId) {
  const bullet = activeBullets.get(bulletId);
  if (bullet) {
    bullet.active = false;
    bullet.ownerId = null;
    activeBullets.delete(bulletId);

    // Очищаем интервал
    if (bulletIntervals[bulletId]) {
      clearInterval(bulletIntervals[bulletId]);
      delete bulletIntervals[bulletId];
    }
  }
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
      if (player.status && Math.abs(player.x - x) < 5 && Math.abs(player.y - y) < 5 && !checkWallCollision(x, y, player.position)) {
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

  socket.on('new player', function (data) {
    const name = typeof data === 'string' ? data : data.name;
    const color = typeof data === 'object' ? data.color : '#00AA00';

    const positions = ['top', 'left', 'right', 'bottom'];
    const spawnPos = getSafeSpawnPosition();

    players[socket.id] = {
      name: name || 'Player',
      color: color || '#00AA00',
      status: true,
      isBot: false,
      x: spawnPos.x,
      y: spawnPos.y,
      position: positions[randomInteger(4)],
      bullets: {},
      rating: 0,
      lastShot: 0,
      invulnerableUntil: Date.now() + INVULNERABILITY_TIME,
      exploding: false,
      explosionEndTime: 0,
      respawnShootingCooldown: Date.now() + 2000, // 2 секунды без стрельбы после спавна
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
    
    // Проверяем кулдаун после респавна
    if (now < player.respawnShootingCooldown) {
      return; // Блокируем стрельбу в течение 2 секунд после респавна
    }
    
    // Проверяем обычный кулдаун между выстрелами
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

// Оптимизированное создание пули
function createBullet(playerId) {
  const player = players[playerId];
  if (!player || !player.status) return;

  const bulletConfig = bulletDirections[player.position];
  if (!bulletConfig) return;

  const bullet = getBulletFromPool();
  bullet.position = player.position;
  bullet.x = player.x + bulletConfig.offsetX;
  bullet.y = player.y + bulletConfig.offsetY;
  bullet.direction = bulletConfig.dir;
  bullet.dx = bulletConfig.dx;
  bullet.dy = bulletConfig.dy;
  bullet.ownerId = playerId;

  // Добавляем в активные пули
  activeBullets.set(bullet.id, bullet);

  // Добавляем в пули игрока для совместимости
  if (!player.bullets) player.bullets = {};
  player.bullets[bullet.id] = bullet;

  bulletIntervals[bullet.id] = setInterval(() => {
    if (!bullet.active || !players[playerId]) {
      returnBulletToPool(bullet.id);
      return;
    }

    bullet.x += bullet.dx;
    bullet.y += bullet.dy;

    if (checkBulletHit(bullet, playerId, bullet.id)) {
      returnBulletToPool(bullet.id);
      if (players[playerId] && players[playerId].bullets) {
        delete players[playerId].bullets[bullet.id];
      }
    }
  }, BULLET_SPEED);
}

// Проверка попадания пули
function checkBulletHit(bullet, shooterId, bulletId) {
  if (bullet.x < 0 || bullet.x >= size.col || bullet.y < 0 || bullet.y >= size.row) {
    return true;
  }

  // Проверяем столкновение со стенами
  for (const wall of walls) {
    if (wall.x === bullet.x && wall.y === bullet.y) {
      return true; // Пуля попадает в стену
    }
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

// Проверка столкновения со стенами
function checkWallCollision(newX, newY, position) {
  const playerPiece = positionPiece[position];
  if (!playerPiece) return false;

  // Проверяем каждую ячейку танка на столкновение со стенами
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (playerPiece[y][x] === 1) {
        const checkX = newX + x;
        const checkY = newY + y;

        // Проверяем, есть ли стена в этой позиции
        for (const wall of walls) {
          if (wall.x === checkX && wall.y === checkY) {
            return true; // Столкновение со стеной
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

  // Проверяем, не взрывается ли игрок
  const now = Date.now();
  if (player.exploding && now < player.explosionEndTime) {
    return; // Блокируем движение во время взрыва
  }

  const newX = player.x + dx;
  const newY = player.y + dy;

  if (newX < 0 || newX > size.col - 3 || newY < 0 || newY > size.row - 3) return;

  // Проверяем столкновение со стенами
  if (checkWallCollision(newX, newY, position)) {
    return; // Блокируем движение при столкновении со стеной
  }

  const collidedPlayer = checkPlayerCollision(player, newX, newY, position);
  if (collidedPlayer) {
    const collided = players[collidedPlayer];
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

// Оптимизированная проверка столкновений между игроками
function checkPlayerCollision(player, newX, newY, newPosition) {
  const playerPiece = positionPiece[newPosition];
  if (!playerPiece) return null;

  const now = Date.now();

  // Быстрая проверка расстояния для всех игроков
  for (const playerId in players) {
    const otherPlayer = players[playerId];
    if (otherPlayer === player || !otherPlayer.status) continue;

    const playerInvulnerable = player.invulnerableUntil && now < player.invulnerableUntil;
    const otherInvulnerable = otherPlayer.invulnerableUntil && now < otherPlayer.invulnerableUntil;

    if (playerInvulnerable || otherInvulnerable) continue;

    // Быстрая проверка расстояния
    const distance = Math.abs(newX - otherPlayer.x) + Math.abs(newY - otherPlayer.y);
    if (distance > COLLISION_CHECK_DISTANCE) continue;

    // Детальная проверка только для близких игроков
    if (checkDetailedCollision(playerPiece, newX, newY, otherPlayer)) {
      return playerId;
    }
  }
  return null;
}

// Детальная проверка столкновения
function checkDetailedCollision(playerPiece, newX, newY, otherPlayer) {
  const otherPiece = positionPiece[otherPlayer.position];
  if (!otherPiece) return false;

  // Оптимизированная проверка пересечений
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (playerPiece[y][x] !== 1) continue;

      const checkX = newX + x;
      const checkY = newY + y;

      // Проверяем только релевантные ячейки другого игрока
      const startX = Math.max(0, checkX - otherPlayer.x);
      const endX = Math.min(3, checkX - otherPlayer.x + 1);
      const startY = Math.max(0, checkY - otherPlayer.y);
      const endY = Math.min(3, checkY - otherPlayer.y + 1);

      for (let oy = startY; oy < endY; oy++) {
        for (let ox = startX; ox < endX; ox++) {
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
  return false;
}

// Анимация взрыва
function boomAnimate(playerId) {
  const player = players[playerId];
  if (!player || !player.status) return;

  const now = Date.now();
  const explosionDuration = 600; // Длительность взрыва в миллисекундах

  // Устанавливаем состояние взрыва
  player.exploding = true;
  player.explosionEndTime = now + explosionDuration;

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
      players[playerId].exploding = false; // Сбрасываем состояние взрыва
      io.sockets.emit('user dead', playerId);
    }
  }, explosionDuration);
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
  player.exploding = false;
  player.explosionEndTime = 0;
  player.respawnShootingCooldown = Date.now() + 2000; // 2 секунды без стрельбы после респавна

  if (!player.isBot) {
    player.rating = 0;
  }
}

// Оптимизированное обновление состояния игры
function updateGameState() {
  const now = Date.now();

  // Пропускаем обновление если прошло мало времени
  if (now - lastGameUpdate < GAME_UPDATE_INTERVAL) {
    return;
  }
  lastGameUpdate = now;

  // Проверяем количество игроков
  const playerCount = Object.keys(players).length;
  if (playerCount === 0) return;

  // Генерируем поле только если есть активные игроки
  generatePlayField();

  // Обновляем только активных игроков
  for (const playerId in players) {
    const player = players[playerId];
    if (player && player.status && positionPiece[player.position]) {
      applyPlayerToField(player);
    }

    // Обновляем пули игрока
    if (player && player.bullets) {
      for (const bulletId in player.bullets) {
        const bullet = player.bullets[bulletId];
        if (bullet && bullet.x >= 0 && bullet.x < size.col && bullet.y >= 0 && bullet.y < size.row) {
          playField[bullet.y][bullet.x] = 1;
        }
      }
    }
  }

  // Проверяем столкновения пуль только если есть активные пули
  if (activeBullets.size > 0) {
    checkBulletCollisions();
  }

  // Отправляем состояние только если есть изменения
  io.sockets.emit('state', {
    playField,
    players,
    walls,
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

// Оптимизированная проверка столкновений пуль
function checkBulletCollisions() {
  const bulletsToRemove = [];

  // Используем Map для быстрого поиска
  const bulletPositions = new Map();

  // Собираем позиции всех пуль
  for (const [bulletId, bullet] of activeBullets) {
    const posKey = `${bullet.x},${bullet.y}`;
    if (bulletPositions.has(posKey)) {
      // Найдено столкновение
      bulletsToRemove.push(bulletId);
      bulletsToRemove.push(bulletPositions.get(posKey));
    } else {
      bulletPositions.set(posKey, bulletId);
    }
  }

  // Удаляем столкнувшиеся пули
  for (const bulletId of bulletsToRemove) {
    if (activeBullets.has(bulletId)) {
      const bullet = activeBullets.get(bulletId);
      if (bullet && bullet.ownerId && players[bullet.ownerId]) {
        delete players[bullet.ownerId].bullets[bulletId];
      }
      returnBulletToPool(bulletId);

      // Отправляем событие взрыва
      io.sockets.emit('explosion', { x: bullet.x, y: bullet.y });
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
    color: '#000000',
    status: true,
    isBot: true,
    x: spawnPos.x,
    y: spawnPos.y,
    position: positions[randomInteger(4)],
    bullets: {},
    rating: 0,
    lastShot: 0,
    invulnerableUntil: Date.now() + INVULNERABILITY_TIME,
    exploding: false,
    explosionEndTime: 0,
    respawnShootingCooldown: Date.now() + 2000, // 2 секунды без стрельбы после спавна
  };

  botMemory[botId] = {
    lastPositions: [],
    stuckCounter: 0,
    lastDodge: 0,
    lastMemoryUpdate: 0,
    aggressionLevel: Math.random() * 0.5 + 0.5, // 0.5-1.0
    dangerZones: [], // Опасные зоны для избегания
    lastCollisionAvoidance: 0,
  };

  // Таймер для автоматического воскрешения бота
  let respawnTimeout = null;

  botIntervals[botId] = setInterval(() => {
    if (!players[botId]) {
      clearInterval(botIntervals[botId]);
      delete botIntervals[botId];
      delete botMemory[botId];
      if (respawnTimeout) {
        clearTimeout(respawnTimeout);
        respawnTimeout = null;
      }
      return;
    }

    if (players[botId].status) {
      botAI(botId);
    } else if (!respawnTimeout) {
      // Устанавливаем таймер воскрешения только если его еще нет
      respawnTimeout = setTimeout(() => {
        if (players[botId]) {
          restartPlayer(botId);
          if (botMemory[botId]) {
            botMemory[botId].lastPositions = [];
            botMemory[botId].stuckCounter = 0;
            botMemory[botId].dangerZones = [];
            botMemory[botId].lastCollisionAvoidance = 0;
          }
        }
        respawnTimeout = null;
      }, 3000);
    }
  }, BOT_UPDATE_INTERVAL);

  console.log('Bot added:', botId);
}

// Улучшенный ИИ бота
function botAI(botId) {
  const bot = players[botId];
  if (!bot || !bot.status) return;

  const memory = botMemory[botId];
  if (!memory) return;

  const now = Date.now();

  // Обновляем память реже для экономии ресурсов
  if (now - memory.lastMemoryUpdate > 300) {
    updateBotMemory(botId);
    memory.lastMemoryUpdate = now;
  }

  // Упрощенная проверка застревания
  if (memory.lastPositions.length >= 3) {
    const recent = memory.lastPositions.slice(-3);
    const uniquePos = new Set(recent.map(p => `${p.x},${p.y}`));
    if (uniquePos.size <= 1) {
      executeEscapeManeuver(botId);
      memory.lastPositions = [];
      return;
    }
  }

  // 1. Быстрая проверка опасных пуль
  const dangerousBullets = findDangerousBullets(botId);
  if (dangerousBullets.length > 0 && now - memory.lastDodge > 200) {
    const evasion = calculateBestEvasion(botId, dangerousBullets);
    if (evasion && tryMove(botId, evasion.dx, evasion.dy, evasion.pos)) {
      memory.lastDodge = now;
      return;
    }
  }

  // 2. Поиск цели с увеличенным радиусом
  const target = findBestTarget(botId);

  if (target) {
    const distance = Math.abs(bot.x - target.x) + Math.abs(bot.y - target.y);

    // 3. Стрельба по цели (увеличенная дистанция)
    if (isTargetInLine(bot, target) && distance < BOT_SHOOT_DISTANCE + 5) {
      // Проверяем кулдаун после респавна для ботов
      if (now < bot.respawnShootingCooldown) {
        return; // Бот не стреляет в течение 2 секунд после респавна
      }
      
      if (now - bot.lastShot > BULLET_COOLDOWN) {
        bot.lastShot = now;
        createBullet(botId);
        return;
      }
    }

    // 4. Агрессивное преследование
    const huntMove = simpleHunt(botId, target);
    if (huntMove && tryMove(botId, huntMove.dx, huntMove.dy, huntMove.pos)) {
      return;
    }
  }

  // 5. Улучшенное патрулирование
  simplePatrol(botId);
}

// Обнаружение угрозы столкновения
function detectCollisionThreat(botId) {
  const bot = players[botId];
  if (!bot) return null;

  const DANGER_DISTANCE = 5; // Критическое расстояние
  let closestThreat = null;
  let minDist = Infinity;

  for (const playerId in players) {
    if (playerId === botId) continue;

    const other = players[playerId];
    if (!other || !other.status) continue;

    // Пропускаем неуязвимых
    const now = Date.now();
    if (other.invulnerableUntil && now < other.invulnerableUntil) continue;

    const dist = Math.abs(bot.x - other.x) + Math.abs(bot.y - other.y);

    // Проверяем близость и направление движения
    if (dist < DANGER_DISTANCE) {
      // Предсказываем столкновение на основе позиций
      const willCollide = predictCollision(bot, other, dist);

      if (willCollide && dist < minDist) {
        minDist = dist;
        closestThreat = {
          player: other,
          distance: dist,
          playerId: playerId
        };
      }
    }
  }

  return closestThreat;
}

// Предсказание столкновения
function predictCollision(bot, other, currentDist) {
  // Если очень близко - высокий риск
  if (currentDist <= 2) return true;

  // Проверяем, движутся ли объекты навстречу друг другу
  const memory = botMemory[bot.id];
  if (!memory || memory.lastPositions.length < 2) return currentDist < 3;

  // Анализируем траекторию
  const botLastPos = memory.lastPositions[memory.lastPositions.length - 1];
  const botDx = bot.x - botLastPos.x;
  const botDy = bot.y - botLastPos.y;

  const otherDx = other.x - bot.x;
  const otherDy = other.y - bot.y;

  // Если движемся в сторону другого объекта
  const movingTowards = (botDx !== 0 && Math.sign(botDx) === Math.sign(otherDx)) ||
    (botDy !== 0 && Math.sign(botDy) === Math.sign(otherDy));

  return movingTowards && currentDist < 4;
}

// Расчет маневра избегания столкновения
function calculateCollisionAvoidance(botId, threat) {
  const bot = players[botId];
  if (!bot || !threat) return null;

  const other = threat.player;
  const dx = other.x - bot.x;
  const dy = other.y - bot.y;

  // Генерируем возможные маневры избегания
  const avoidanceMoves = [];

  // Перпендикулярные движения (наиболее эффективные для избегания)
  if (Math.abs(dx) > Math.abs(dy)) {
    // Другой объект справа/слева - двигаемся вверх/вниз
    avoidanceMoves.push(
      { dx: 0, dy: -2, pos: 'top', priority: 5 },
      { dx: 0, dy: 2, pos: 'bottom', priority: 5 },
      { dx: 0, dy: -1, pos: 'top', priority: 4 },
      { dx: 0, dy: 1, pos: 'bottom', priority: 4 }
    );
  } else {
    // Другой объект сверху/снизу - двигаемся влево/вправо
    avoidanceMoves.push(
      { dx: -2, dy: 0, pos: 'right', priority: 5 },
      { dx: 2, dy: 0, pos: 'left', priority: 5 },
      { dx: -1, dy: 0, pos: 'right', priority: 4 },
      { dx: 1, dy: 0, pos: 'left', priority: 4 }
    );
  }

  // Диагональные уходы
  avoidanceMoves.push(
    { dx: -1, dy: -1, pos: 'top', priority: 3 },
    { dx: 1, dy: -1, pos: 'top', priority: 3 },
    { dx: -1, dy: 1, pos: 'bottom', priority: 3 },
    { dx: 1, dy: 1, pos: 'bottom', priority: 3 }
  );

  // Движение назад от угрозы
  if (dx > 0) avoidanceMoves.push({ dx: 1, dy: 0, pos: 'left', priority: 2 });
  if (dx < 0) avoidanceMoves.push({ dx: -1, dy: 0, pos: 'right', priority: 2 });
  if (dy > 0) avoidanceMoves.push({ dx: 0, dy: -1, pos: 'top', priority: 2 });
  if (dy < 0) avoidanceMoves.push({ dx: 0, dy: 1, pos: 'bottom', priority: 2 });

  // Сортируем по приоритету
  avoidanceMoves.sort((a, b) => b.priority - a.priority);

  // Выбираем лучший безопасный маневр
  for (const move of avoidanceMoves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;

    if (newX < 1 || newX > size.col - 4 || newY < 1 || newY > size.row - 4) continue;

    // Проверяем, что новая позиция безопасна
    if (isSafeFromCollisions(botId, newX, newY, move.pos)) {
      // Дополнительно проверяем, что уходим от угрозы
      const newDist = Math.abs(newX - other.x) + Math.abs(newY - other.y);
      if (newDist > threat.distance) {
        return move;
      }
    }
  }

  return null;
}

// Проверка безопасности от столкновений
function isSafeFromCollisions(botId, newX, newY, position) {
  const bot = players[botId];
  if (!bot) return false;

  const SAFE_DISTANCE = 10; // Минимальное безопасное расстояние
  const playerPiece = positionPiece[position];
  if (!playerPiece) return false;

  const now = Date.now();

  for (const playerId in players) {
    const otherPlayer = players[playerId];
    if (otherPlayer === bot || !otherPlayer.status) continue;

    // Пропускаем неуязвимых
    const botInvulnerable = bot.invulnerableUntil && now < bot.invulnerableUntil;
    const otherInvulnerable = otherPlayer.invulnerableUntil && now < otherPlayer.invulnerableUntil;
    if (botInvulnerable || otherInvulnerable) continue;

    const dist = Math.abs(newX - otherPlayer.x) + Math.abs(newY - otherPlayer.y);

    // Быстрая проверка расстояния
    if (dist <= SAFE_DISTANCE) {
      // Детальная проверка пересечения
      const otherPiece = positionPiece[otherPlayer.position];
      if (!otherPiece) continue;

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

                // Проверяем пересечение с буфером
                if (Math.abs(checkX - otherX) <= 1 && Math.abs(checkY - otherY) <= 1) {
                  return false;
                }
              }
            }
          }
        }
      }
    }
  }

  return true;
}

// Умное преследование с избеганием столкновений
function smartHuntWithCollisionAvoidance(botId, target) {
  const bot = players[botId];
  const memory = botMemory[botId];
  if (!bot || !target || !memory) return null;

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

  // Добавляем диагональные маневры для агрессивных ботов
  if (memory.aggressionLevel > 0.7) {
    if (dx > 0 && dy > 0) moves.push({ dx: -1, dy: 1, pos: 'bottom', priority: 2 });
    if (dx < 0 && dy > 0) moves.push({ dx: 1, dy: 1, pos: 'bottom', priority: 2 });
    if (dx > 0 && dy < 0) moves.push({ dx: -1, dy: -1, pos: 'top', priority: 2 });
    if (dx < 0 && dy < 0) moves.push({ dx: 1, dy: -1, pos: 'top', priority: 2 });
  }

  moves.sort((a, b) => b.priority - a.priority);

  // Выбираем первое безопасное движение (с улучшенной проверкой)
  for (const move of moves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;

    if (isSafeFromCollisions(botId, newX, newY, move.pos) &&
      isSafePosition(botId, newX, newY, move.pos)) {
      return move;
    }
  }

  // Если все приоритетные пути заблокированы, ищем обходной маневр
  const alternativeMoves = [
    { dx: -1, dy: 0, pos: 'right', priority: 1 },
    { dx: 1, dy: 0, pos: 'left', priority: 1 },
    { dx: 0, dy: 1, pos: 'bottom', priority: 1 },
    { dx: 0, dy: -1, pos: 'top', priority: 1 },
  ];

  for (const move of alternativeMoves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;

    if (isSafeFromCollisions(botId, newX, newY, move.pos) &&
      isSafePosition(botId, newX, newY, move.pos)) {
      return move;
    }
  }

  return moves[0];
}

// Обновление памяти бота
function updateBotMemory(botId) {
  const bot = players[botId];
  const memory = botMemory[botId];
  if (!bot || !memory) return;

  memory.lastPositions.push({ x: bot.x, y: bot.y });
  if (memory.lastPositions.length > 5) {
    memory.lastPositions.shift();
  }
}

// Исправленное преследование
function simpleHunt(botId, target) {
  const bot = players[botId];
  if (!bot || !target) return null;

  const dx = target.x - bot.x;
  const dy = target.y - bot.y;

  // Исправленная логика движения к цели
  if (Math.abs(dx) > Math.abs(dy)) {
    // Движемся по X-оси
    if (dx > 0) return { dx: 1, dy: 0, pos: 'left' };  // Цель справа - идем вправо
    else return { dx: -1, dy: 0, pos: 'right' };       // Цель слева - идем влево
  } else {
    // Движемся по Y-оси
    if (dy > 0) return { dx: 0, dy: 1, pos: 'bottom' }; // Цель снизу - идем вниз
    else return { dx: 0, dy: -1, pos: 'top' };          // Цель сверху - идем вверх
  }
}

// Улучшенное патрулирование
function simplePatrol(botId) {
  const bot = players[botId];
  if (!bot) return;

  const centerX = Math.floor(size.col / 2);
  const centerY = Math.floor(size.row / 2);
  const distToCenter = Math.abs(bot.x - centerX) + Math.abs(bot.y - centerY);

  // Если бот слишком далеко от центра, двигаемся к центру
  if (distToCenter > 10) {
    const dx = centerX - bot.x;
    const dy = centerY - bot.y;

    let move = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      move = dx > 0 ? { dx: 1, dy: 0, pos: 'left' } : { dx: -1, dy: 0, pos: 'right' };
    } else {
      move = dy > 0 ? { dx: 0, dy: 1, pos: 'bottom' } : { dx: 0, dy: -1, pos: 'top' };
    }

    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;

    if (newX >= 0 && newX < size.col - 3 && newY >= 0 && newY < size.row - 3) {
      if (isSafePosition(botId, newX, newY, move.pos)) {
        tryMove(botId, move.dx, move.dy, move.pos);
        return;
      }
    }
  }

  // Случайное движение, но избегаем краев
  const moves = [];

  // Предпочитаем движения к центру
  if (bot.x < centerX) moves.push({ dx: 1, dy: 0, pos: 'left' });
  if (bot.x > centerX) moves.push({ dx: -1, dy: 0, pos: 'right' });
  if (bot.y < centerY) moves.push({ dx: 0, dy: 1, pos: 'bottom' });
  if (bot.y > centerY) moves.push({ dx: 0, dy: -1, pos: 'top' });

  // Если нет движений к центру, добавляем случайные
  if (moves.length === 0) {
    moves.push(
      { dx: 1, dy: 0, pos: 'left' },
      { dx: -1, dy: 0, pos: 'right' },
      { dx: 0, dy: 1, pos: 'bottom' },
      { dx: 0, dy: -1, pos: 'top' }
    );
  }

  // Выбираем случайное движение из доступных
  const move = moves[Math.floor(Math.random() * moves.length)];
  const newX = bot.x + move.dx;
  const newY = bot.y + move.dy;

  if (newX >= 0 && newX < size.col - 3 && newY >= 0 && newY < size.row - 3) {
    if (isSafePosition(botId, newX, newY, move.pos) && !checkWallCollision(newX, newY, move.pos)) {
      tryMove(botId, move.dx, move.dy, move.pos);
    }
  }
}

// Проверка застревания
function isStuck(botId) {
  const memory = botMemory[botId];
  if (!memory || memory.lastPositions.length < 4) return false;

  const recent = memory.lastPositions.slice(-4);
  const uniquePos = new Set(recent.map(p => `${p.x},${p.y}`));
  return uniquePos.size <= 2;
}

// Маневр побега
function executeEscapeManeuver(botId) {
  const bot = players[botId];
  if (!bot) return;

  const bigMoves = [
    { dx: 3, dy: 0, pos: 'left' },
    { dx: -3, dy: 0, pos: 'right' },
    { dx: 0, dy: 3, pos: 'bottom' },
    { dx: 0, dy: -3, pos: 'top' },
    { dx: 2, dy: 2, pos: 'bottom' },
    { dx: -2, dy: 2, pos: 'bottom' },
    { dx: 2, dy: -2, pos: 'top' },
    { dx: -2, dy: -2, pos: 'top' },
  ];

  for (let i = 0; i < 3; i++) {
    const move = bigMoves[randomInteger(bigMoves.length)];
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;

    if (newX >= 0 && newX < size.col - 3 && newY >= 0 && newY < size.row - 3) {
      if (tryMove(botId, move.dx, move.dy, move.pos)) {
        return;
      }
    }
  }
}

// Поиск опасных снарядов
function findDangerousBullets(botId) {
  const bot = players[botId];
  if (!bot) return [];

  const dangerous = [];

  for (const playerId in players) {
    if (playerId === botId) continue;

    const player = players[playerId];
    for (const bulletId in player?.bullets || {}) {
      const bullet = player.bullets[bulletId];
      const dist = Math.abs(bullet.x - bot.x) + Math.abs(bullet.y - bot.y);

      if (dist < 10 && isHeadingTowards(bullet, bot)) {
        dangerous.push({ bullet, distance: dist });
      }
    }
  }

  return dangerous.sort((a, b) => a.distance - b.distance);
}

// Проверка направления снаряда
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

// Расчет лучшего уклонения
function calculateBestEvasion(botId, dangerousBullets) {
  const bot = players[botId];
  if (!bot) return null;

  const allMoves = [
    { dx: 0, dy: 2, pos: 'bottom' },
    { dx: 0, dy: -2, pos: 'top' },
    { dx: 2, dy: 0, pos: 'left' },
    { dx: -2, dy: 0, pos: 'right' },
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

    if (newX < 1 || newX > size.col - 4 || newY < 1 || newY > size.row - 4) continue;

    let score = 100;

    // Оцениваем безопасность
    for (const danger of dangerousBullets) {
      const bullet = danger.bullet;
      const newDist = Math.abs(bullet.x - newX) + Math.abs(bullet.y - newY);
      score += newDist * 3;

      // Проверяем, не попадем ли на траекторию
      if (wouldBeHit(bullet, newX, newY)) {
        score -= 100;
      }
    }

    // Проверяем столкновения
    if (!isSafePosition(botId, newX, newY, move.pos)) {
      score -= 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

// Проверка попадания на траекторию
function wouldBeHit(bullet, x, y) {
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
    let score = -dist + player.rating * 5;

    // Бонус за линию огня
    if (isTargetInLine(bot, player)) {
      score += 30;
    }

    // Бонус за близость
    if (dist < 15) {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTarget = player;
    }
  }

  return bestTarget;
}

// Проверка линии огня
function isTargetInLine(bot, target) {
  const tolerance = 2;

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

// Умное преследование
function smartHunt(botId, target) {
  const bot = players[botId];
  const memory = botMemory[botId];
  if (!bot || !target || !memory) return null;

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

  // Добавляем диагональные маневры для агрессивных ботов
  if (memory.aggressionLevel > 0.7) {
    if (dx > 0 && dy > 0) moves.push({ dx: -1, dy: 1, pos: 'bottom', priority: 2 });
    if (dx < 0 && dy > 0) moves.push({ dx: 1, dy: 1, pos: 'bottom', priority: 2 });
    if (dx > 0 && dy < 0) moves.push({ dx: -1, dy: -1, pos: 'top', priority: 2 });
    if (dx < 0 && dy < 0) moves.push({ dx: 1, dy: -1, pos: 'top', priority: 2 });
  }

  moves.sort((a, b) => b.priority - a.priority);

  // Выбираем первое безопасное движение
  for (const move of moves) {
    if (isSafePosition(botId, bot.x + move.dx, bot.y + move.dy, move.pos) && !checkWallCollision(bot.x + move.dx, bot.y + move.dy, move.pos)) {
      return move;
    }
  }

  return moves[0];
}

// Тактический отход
function tacticalRetreat(botId) {
  const bot = players[botId];
  if (!bot) return;

  const retreats = {
    top: { dx: 0, dy: 1, pos: 'bottom' },
    bottom: { dx: 0, dy: -1, pos: 'top' },
    left: { dx: -1, dy: 0, pos: 'right' },
    right: { dx: 1, dy: 0, pos: 'left' },
  };

  const retreat = retreats[bot.position];
  if (retreat && isSafePosition(botId, bot.x + retreat.dx, bot.y + retreat.dy, retreat.pos) && !checkWallCollision(bot.x + retreat.dx, bot.y + retreat.dy, retreat.pos)) {
    tryMove(botId, retreat.dx, retreat.dy, retreat.pos);
  }
}

// Умное патрулирование с избеганием столкновений
function smartPatrol(botId) {
  const bot = players[botId];
  const memory = botMemory[botId];
  if (!bot || !memory) return;

  const centerX = Math.floor(size.col / 2);
  const centerY = Math.floor(size.row / 2);

  const distToCenter = Math.abs(bot.x - centerX) + Math.abs(bot.y - centerY);

  // Движение к центру если далеко
  if (distToCenter > 8) {
    const dx = centerX - bot.x;
    const dy = centerY - bot.y;

    const moves = [];

    if (Math.abs(dx) > Math.abs(dy)) {
      const move = dx > 0 ? { dx: -1, dy: 0, pos: 'right' } : { dx: 1, dy: 0, pos: 'left' };
      moves.push(move);
    } else {
      const move = dy > 0 ? { dx: 0, dy: 1, pos: 'bottom' } : { dx: 0, dy: -1, pos: 'top' };
      moves.push(move);
    }

    // Пробуем безопасное движение к центру
    for (const move of moves) {
      const newX = bot.x + move.dx;
      const newY = bot.y + move.dy;

      if (isSafeFromCollisions(botId, newX, newY, move.pos) &&
        isSafePosition(botId, newX, newY, move.pos) && !checkWallCollision(newX, newY, move.pos)) {
        if (tryMove(botId, move.dx, move.dy, move.pos)) return;
      }
    }
  }

  // Случайное патрулирование с проверкой безопасности
  const moves = [
    { dx: 1, dy: 0, pos: 'left' },
    { dx: -1, dy: 0, pos: 'right' },
    { dx: 0, dy: 1, pos: 'bottom' },
    { dx: 0, dy: -1, pos: 'top' },
  ];

  // Перемешиваем для случайности
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }

  // Пробуем несколько безопасных направлений
  for (const move of moves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;

    if (isSafeFromCollisions(botId, newX, newY, move.pos) &&
      isSafePosition(botId, newX, newY, move.pos)) {
      if (tryMove(botId, move.dx, move.dy, move.pos)) return;
    }
  }
}

// Проверка безопасности позиции (упрощенная версия для совместимости)
function isSafePosition(botId, newX, newY, position) {
  const bot = players[botId];
  if (!bot) return false;

  // Проверка границ
  const margin = 1;
  if (newX < margin || newX > size.col - 3 - margin ||
    newY < margin || newY > size.row - 3 - margin) {
    return false;
  }

  // Используем более строгую проверку столкновений
  return isSafeFromCollisions(botId, newX, newY, position);
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

  const collidedWall = checkWallCollision(newX, newY, position);

  if (!collidedPlayer && !collidedWall) {
    bot.x = newX;
    bot.y = newY;
    bot.position = position;
    return true;
  } else {
    // Столкновение - оба взрываются
    const collided = players[collidedPlayer];
    if (collided) {
      boomAnimate(botId);
      boomAnimate(collidedPlayer);
      io.sockets.emit('collision explosion', {
        x: (bot.x + collided.x) / 2,
        y: (bot.y + collided.y) / 2
      });
    }
    return false;
  }
}

// Добавляем ботов при старте
addBot();
addBot();
addBot();

// Запуск игрового цикла
setInterval(updateGameState, GAME_UPDATE_INTERVAL);