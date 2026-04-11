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

// Режим игры
let gameMode = 'pvp'; // 'pvp' или 'coop'
let gameState = 'waiting'; // 'waiting', 'playing', 'victory', 'defeat'

// Кооперативный режим
const bricks = []; // Разрушаемые кирпичи
const base = { x: 24, y: 26, type: 'base', health: 1 }; // База (орел)
let coopWave = 1;
let enemiesToSpawn = 0;
let enemiesKilled = 0;
let totalEnemiesInWave = 0;
let waveSpawnInterval = null;
let coopBotCount = 0;
const MAX_COOP_BOTS = 4;

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
// position 'left' = танк смотрит ВПРАВО (орудие справа), стреляет вправо
// position 'right' = танк смотрит ВЛЕВО (орудие слева), стреляет влево
const bulletDirections = {
  top: { dir: 'up', dx: 0, dy: -1, offsetX: 1, offsetY: 0 },
  bottom: { dir: 'down', dx: 0, dy: 1, offsetX: 1, offsetY: 2 },
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

// Генерация карты для PvP режима
function generatePvPMap() {
  walls.length = 0;
  bricks.length = 0;

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

// Генерация карты для кооперативного режима
function generateCoopMap() {
  walls.length = 0;
  bricks.length = 0;

  // Бетонные стены (неразрушимые) - границы и некоторые препятствия
  // Верхняя стена
  for (let x = 5; x < 45; x++) {
    if (x < 20 || x > 29) walls.push({ x: x, y: 3, type: 'wall' });
  }

  // Боковые стены
  for (let y = 3; y < 15; y++) {
    walls.push({ x: 5, y: y, type: 'wall' });
    walls.push({ x: 44, y: y, type: 'wall' });
  }

  // Центральное препятствие (бетон)
  for (let x = 20; x <= 29; x++) {
    walls.push({ x: x, y: 10, type: 'wall' });
  }
  for (let y = 8; y <= 12; y++) {
    walls.push({ x: 22, y: y, type: 'wall' });
    walls.push({ x: 27, y: y, type: 'wall' });
  }

  // Боковые препятствия (бетон)
  for (let y = 6; y < 10; y++) {
    walls.push({ x: 10, y: y, type: 'wall' });
    walls.push({ x: 39, y: y, type: 'wall' });
  }

  // Кирпичные стены (разрушаемые) - защита базы
  // Стены вокруг базы
  const baseX = base.x;
  const baseY = base.y;

  // Верхняя линия защиты
  for (let x = baseX - 2; x <= baseX + 4; x++) {
    bricks.push({ x: x, y: baseY - 2, type: 'brick', health: 1 });
  }

  // Боковые стены защиты
  for (let y = baseY - 2; y <= baseY + 2; y++) {
    bricks.push({ x: baseX - 2, y: y, type: 'brick', health: 1 });
    bricks.push({ x: baseX + 4, y: y, type: 'brick', health: 1 });
  }

  // Дополнительные кирпичные препятствия на карте
  // Левый фланг
  for (let y = 15; y < 20; y++) {
    bricks.push({ x: 8, y: y, type: 'brick', health: 1 });
    bricks.push({ x: 12, y: y, type: 'brick', health: 1 });
  }

  // Правый фланг
  for (let y = 15; y < 20; y++) {
    bricks.push({ x: 37, y: y, type: 'brick', health: 1 });
    bricks.push({ x: 41, y: y, type: 'brick', health: 1 });
  }

  // Центральные препятствия
  for (let x = 18; x <= 31; x += 2) {
    bricks.push({ x: x, y: 15, type: 'brick', health: 1 });
  }

  // Обновляем состояние игры
  base.health = 1;
  gameState = 'playing';
  coopWave = 1;
  enemiesKilled = 0;
  coopBotCount = 0;
}

// Запуск волны врагов в кооп-режиме
function startCoopWave() {
  enemiesToSpawn = 5 + coopWave * 2; // Увеличиваем количество врагов с каждой волной
  totalEnemiesInWave = enemiesToSpawn;

  // Интервал спавна врагов
  if (waveSpawnInterval) {
    clearInterval(waveSpawnInterval);
  }

  waveSpawnInterval = setInterval(() => {
    if (gameState !== 'playing' || enemiesToSpawn <= 0 || coopBotCount >= MAX_COOP_BOTS) {
      if (enemiesToSpawn <= 0 && coopBotCount === 0) {
        // Волна завершена
        coopWave++;
        setTimeout(() => startCoopWave(), 5000); // 5 секунд до следующей волны
      }
      return;
    }

    spawnCoopEnemy();
    enemiesToSpawn--;
  }, 3000); // Спавн каждые 3 секунды
}

// Спавн врага в кооп-режиме
function spawnCoopEnemy() {
  // Точки спавна вне стен (в кооп-карте)
  const spawnPoints = [
    { x: 10, y: 4 },
    { x: 39, y: 4 },
    { x: 12, y: 13 },
    { x: 37, y: 13 }
  ];

  // Ищем свободную точку спавна
  let spawn = null;
  for (const point of spawnPoints) {
    // Проверяем, что точка не в стене
    let inWall = false;
    for (const wall of walls) {
      if (Math.abs(wall.x - point.x) <= 2 && Math.abs(wall.y - point.y) <= 2) {
        inWall = true;
        break;
      }
    }

    // Проверяем, что точка не занята другим игроком
    let occupied = false;
    for (const playerId in players) {
      const player = players[playerId];
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

  // Если все точки заняты - ищем случайную свободную
  if (!spawn) {
    let attempts = 0;
    while (attempts < 20) {
      const x = 5 + randomInteger(40);
      const y = 3 + randomInteger(12);

      let valid = true;
      // Проверяем стены
      for (const wall of walls) {
        if (Math.abs(wall.x - x) <= 2 && Math.abs(wall.y - y) <= 2) {
          valid = false;
          break;
        }
      }

      // Проверяем других игроков
      for (const playerId in players) {
        const player = players[playerId];
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

  // Если не нашли свободную точку - пропускаем спавн
  if (!spawn) {
    console.log('No valid spawn point found for coop enemy');
    return;
  }

  const botId = 'coop_bot_' + uuidv4();

  players[botId] = {
    name: 'Enemy Tank',
    color: '#c20000', // Красный цвет врагов
    status: true,
    isBot: true,
    isCoopEnemy: true, // Отмечаем как врага кооп-режима
    x: spawn.x,
    y: spawn.y,
    position: 'bottom', // Смотрят вниз (на базу)
    bullets: {},
    rating: 0,
    lastShot: 0,
    invulnerableUntil: Date.now() + 1000, // 1 секунда неуязвимости
    exploding: false,
    explosionEndTime: 0,
    respawnShootingCooldown: Date.now() + 1500,
    health: 1 // Здоровье врага
  };

  coopBotCount++;

  // AI для кооп-врагов - движение к базе
  botMemory[botId] = {
    lastPositions: [],
    stuckCounter: 0,
    lastDodge: 0,
    lastMemoryUpdate: 0,
    aggressionLevel: 0.8,
    dangerZones: [],
    lastCollisionAvoidance: 0,
    target: 'base' // Цель - база
  };

  // Запускаем AI для врага
  botIntervals[botId] = setInterval(() => {
    if (!players[botId]) {
      clearInterval(botIntervals[botId]);
      delete botIntervals[botId];
      delete botMemory[botId];
      coopBotCount--;
      return;
    }

    if (players[botId].status) {
      coopEnemyAI(botId);
    } else {
      // Враг уничтожен
      clearInterval(botIntervals[botId]);
      delete botIntervals[botId];
      delete botMemory[botId];
      delete players[botId];
      coopBotCount--;
      enemiesKilled++;

      // Проверяем победу
      checkCoopVictory();
    }
  }, BOT_UPDATE_INTERVAL);
}

// AI для врагов в кооп-режиме (супер умный)
function coopEnemyAI(botId) {
  const bot = players[botId];
  const memory = botMemory[botId];
  if (!bot || !bot.status || !memory) return;

  const now = Date.now();

  // Обновляем память позиций
  if (!memory.positions) memory.positions = [];
  if (now - (memory.lastPosUpdate || 0) > 500) {
    memory.positions.push({ x: bot.x, y: bot.y, time: now });
    if (memory.positions.length > 5) memory.positions.shift();
    memory.lastPosUpdate = now;
  }

  // Проверяем застревание
  if (isStuck(memory)) {
    memory.stuckCounter = (memory.stuckCounter || 0) + 1;
    if (memory.stuckCounter > 3) {
      // Экстренный маневр - двигаемся в случайном направлении
      const emergencyMove = getRandomValidMove(bot);
      if (emergencyMove) {
        tryMove(botId, emergencyMove.dx, emergencyMove.dy, emergencyMove.pos);
        memory.stuckCounter = 0;
        return;
      }
    }
  } else {
    memory.stuckCounter = 0;
  }

  // 1. ПРИОРИТЕТ: Уклонение от пуль игроков
  const dodgeMove = shouldDodgeBullet(bot);
  if (dodgeMove && now - (memory.lastDodge || 0) > 300) {
    tryMove(botId, dodgeMove.dx, dodgeMove.dy, dodgeMove.pos);
    memory.lastDodge = now;
    return;
  }

  // 2. ПРИОРИТЕТ: Атака игроков если они близко и уязвимы
  const playerThreat = findBestPlayerTarget(bot);
  if (playerThreat && playerThreat.distance <= 6) {
    // Если можем стрелять - стреляем
    if (canShootTarget(bot, playerThreat.player) &&
        now - bot.lastShot > BULLET_COOLDOWN &&
        now > bot.respawnShootingCooldown) {
      bot.position = playerThreat.position;
      bot.lastShot = now;
      createBullet(botId);
      memory.targetPlayer = playerThreat.playerId;
      return;
    }

    // Если игрок слишком близко и опасен - отступаем
    if (playerThreat.distance < 4) {
      const retreat = calculateRetreat(bot, playerThreat.player);
      if (retreat) {
        tryMove(botId, retreat.dx, retreat.dy, retreat.pos);
        return;
      }
    }
  }

  // 3. ПРИОРИТЕТ: Атака базы
  const attackPos = findBestAttackPosition(bot, botId);

  if (attackPos.canShoot) {
    bot.position = attackPos.position;

    // Стреляем по базе
    if (now - bot.lastShot > BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
      bot.lastShot = now;
      createBullet(botId);
    }
    return;
  }

  // 4. Движение к позиции атаки
  if (attackPos.targetX !== undefined && attackPos.targetY !== undefined) {
    const move = calculateSmartPath(bot, attackPos.targetX, attackPos.targetY);

    if (move) {
      // Проверяем, что не толкаемся с другими ботами
      if (!isCollidingWithOtherBots(bot, botId, move)) {
        tryMove(botId, move.dx, move.dy, move.pos);
        memory.lastMove = move;
        memory.lastTarget = { x: attackPos.targetX, y: attackPos.targetY };
        return;
      }
    }
  }

  // 5. Разрушение препятствий
  if (now - bot.lastShot > BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
    const obstacle = findBestObstacleToShoot(bot);
    if (obstacle) {
      bot.position = obstacle.position;
      bot.lastShot = now;
      createBullet(botId);
      return;
    }
  }

  // 6. Патрулирование если нечего делать
  const patrolMove = getPatrolMove(bot, memory);
  if (patrolMove) {
    tryMove(botId, patrolMove.dx, patrolMove.dy, patrolMove.pos);
  }
}

// Поиск игрока в прямой видимости
function findPlayerInSight(bot) {
  const directions = ['top', 'bottom', 'left', 'right'];

  for (const dir of directions) {
    const bulletConfig = bulletDirections[dir];
    if (!bulletConfig) continue;

    let checkX = bot.x + bulletConfig.offsetX;
    let checkY = bot.y + bulletConfig.offsetY;

    // Проверяем 10 клеток
    for (let i = 0; i < 10; i++) {
      checkX += bulletConfig.dx;
      checkY += bulletConfig.dy;

      // Ищем игрока
      for (const playerId in players) {
        const player = players[playerId];
        if (player && player.status && !player.isBot &&
            checkX >= player.x && checkX < player.x + 3 &&
            checkY >= player.y && checkY < player.y + 3) {
          return { position: dir };
        }
      }

      // Проверяем стены
      let hitWall = false;
      for (const wall of walls) {
        if (wall.x === checkX && wall.y === checkY) {
          hitWall = true;
          break;
        }
      }
      if (hitWall) break;
    }
  }

  return null;
}

// Проверка застревания
function isStuck(memory) {
  if (!memory.positions || memory.positions.length < 3) return false;
  const recent = memory.positions.slice(-3);
  const unique = new Set(recent.map(p => `${p.x},${p.y}`));
  return unique.size <= 1;
}

// Получить случайный валидный ход
function getRandomValidMove(bot) {
  const moves = [
    { dx: 1, dy: 0, pos: 'left' },
    { dx: -1, dy: 0, pos: 'right' },
    { dx: 0, dy: 1, pos: 'bottom' },
    { dx: 0, dy: -1, pos: 'top' }
  ];

  // Перемешиваем
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }

  for (const move of moves) {
    if (isValidMove(bot, move)) return move;
  }
  return null;
}

// Проверка нужно ли уклоняться от пули
function shouldDodgeBullet(bot) {
  // Ищем пули игроков
  for (const playerId in players) {
    const player = players[playerId];
    if (player.isBot || !player.bullets) continue;

    for (const bulletId in player.bullets) {
      const bullet = player.bullets[bulletId];
      if (!bullet) continue;

      const dist = Math.abs(bullet.x - bot.x) + Math.abs(bullet.y - bot.y);
      if (dist > 5) continue;

      // Проверяем движется ли пуля в нашу сторону
      const bulletConfig = bulletDirections[bullet.position];
      if (!bulletConfig) continue;

      // Предсказываем попадание
      let nextX = bullet.x;
      let nextY = bullet.y;
      for (let i = 0; i < 3; i++) {
        nextX += bulletConfig.dx;
        nextY += bulletConfig.dy;

        // Попадание в бота?
        if (nextX >= bot.x && nextX < bot.x + 3 &&
            nextY >= bot.y && nextY < bot.y + 3) {
          // Уклоняемся перпендикулярно
          if (bulletConfig.dx !== 0) {
            // Пуля движется горизонтально - уклоняемся вертикально
            const up = { dx: 0, dy: -1, pos: 'bottom' };
            const down = { dx: 0, dy: 1, pos: 'top' };
            if (isValidMove(bot, up)) return up;
            if (isValidMove(bot, down)) return down;
          } else {
            // Пуля движется вертикально - уклоняемся горизонтально
            const left = { dx: -1, dy: 0, pos: 'right' };
            const right = { dx: 1, dy: 0, pos: 'left' };
            if (isValidMove(bot, left)) return left;
            if (isValidMove(bot, right)) return right;
          }
        }
      }
    }
  }
  return null;
}

// Находим лучшую цель среди игроков
function findBestPlayerTarget(bot) {
  let bestTarget = null;
  let bestScore = -Infinity;

  for (const playerId in players) {
    const player = players[playerId];
    if (player.isBot || !player.status) continue;

    const dist = Math.abs(bot.x - player.x) + Math.abs(bot.y - player.y);
    const canShoot = canShootTarget(bot, player);

    // Оцениваем цель
    let score = 0;
    if (canShoot) score += 100;
    score -= dist * 5; // Ближе = лучше
    if (dist < 4) score += 50; // Опасно близко

    // Проверяем есть ли линия огня
    const pos = getDirectionToTarget(bot, player);
    if (pos) {
      const bulletConfig = bulletDirections[pos];
      if (bulletConfig) {
        // Проверяем видимость
        let checkX = bot.x + bulletConfig.offsetX;
        let checkY = bot.y + bulletConfig.offsetY;
        let hasSight = true;

        for (let i = 0; i < dist; i++) {
          checkX += bulletConfig.dx;
          checkY += bulletConfig.dy;

          // Стена блокирует
          for (const wall of walls) {
            if (wall.x === checkX && wall.y === checkY) {
              hasSight = false;
              break;
            }
          }
          if (!hasSight) break;
        }

        if (hasSight) score += 30;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTarget = {
        player: player,
        playerId: playerId,
        distance: dist,
        position: pos
      };
    }
  }

  return bestTarget;
}

// Можем ли стрелять по цели
function canShootTarget(bot, target) {
  const pos = getDirectionToTarget(bot, target);
  if (!pos) return false;

  const bulletConfig = bulletDirections[pos];
  if (!bulletConfig) return false;

  // Проверяем что мы повернуты к цели
  if (bot.position !== pos) return false;

  return true;
}

// Получить направление к цели
function getDirectionToTarget(bot, target) {
  const dx = (target.x + 1) - (bot.x + 1);
  const dy = (target.y + 1) - (bot.y + 1);

  // Определяем направление
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'left' : 'right';
  } else {
    return dy > 0 ? 'bottom' : 'top';
  }
}

// Рассчитать отступление от игрока
function calculateRetreat(bot, player) {
  const dx = bot.x - player.x;
  const dy = bot.y - player.y;

  let move = null;
  if (Math.abs(dx) > Math.abs(dy)) {
    move = dx > 0 ? { dx: 1, dy: 0, pos: 'left' } : { dx: -1, dy: 0, pos: 'right' };
  } else {
    move = dy > 0 ? { dx: 0, dy: 1, pos: 'bottom' } : { dx: 0, dy: -1, pos: 'top' };
  }

  if (isValidMove(bot, move)) return move;

  // Если не получилось - ищем любой валидный
  return getRandomValidMove(bot);
}

// Проверка столкновения с другими ботами
function isCollidingWithOtherBots(bot, botId, move) {
  const newX = bot.x + move.dx;
  const newY = bot.y + move.dy;

  for (const otherId in players) {
    if (otherId === botId) continue;
    const other = players[otherId];
    if (!other.isBot || !other.status) continue;

    const dist = Math.abs(newX - other.x) + Math.abs(newY - other.y);
    if (dist < 2) return true;
  }

  return false;
}

// Умный расчет пути
function calculateSmartPath(bot, targetX, targetY) {
  const dx = targetX - bot.x;
  const dy = targetY - bot.y;

  // Пробуем основное направление
  let move = null;
  if (Math.abs(dx) > Math.abs(dy)) {
    move = dx > 0 ? { dx: 1, dy: 0, pos: 'left' } : { dx: -1, dy: 0, pos: 'right' };
  } else {
    move = dy > 0 ? { dx: 0, dy: 1, pos: 'bottom' } : { dx: 0, dy: -1, pos: 'top' };
  }

  if (isValidMove(bot, move)) return move;

  // Пробуем альтернативные направления
  const alternatives = [
    { dx: 1, dy: 0, pos: 'left' },
    { dx: -1, dy: 0, pos: 'right' },
    { dx: 0, dy: 1, pos: 'bottom' },
    { dx: 0, dy: -1, pos: 'top' }
  ];

  // Сортируем по близости к цели
  alternatives.sort((a, b) => {
    const distA = Math.abs(bot.x + a.dx - targetX) + Math.abs(bot.y + a.dy - targetY);
    const distB = Math.abs(bot.x + b.dx - targetX) + Math.abs(bot.y + b.dy - targetY);
    return distA - distB;
  });

  for (const alt of alternatives) {
    if (isValidMove(bot, alt)) return alt;
  }

  return null;
}

// Найти лучшее препятствие для разрушения
function findBestObstacleToShoot(bot) {
  const bulletConfig = bulletDirections[bot.position];
  if (!bulletConfig) return null;

  // Проверяем 5 клеток впереди
  let checkX = bot.x + bulletConfig.offsetX;
  let checkY = bot.y + bulletConfig.offsetY;

  for (let i = 0; i < 5; i++) {
    checkX += bulletConfig.dx;
    checkY += bulletConfig.dy;

    // Нашли кирпич
    for (const brick of bricks) {
      if (brick.x === checkX && brick.y === checkY && brick.health > 0) {
        return { position: bot.position, type: 'brick' };
      }
    }
  }

  return null;
}

// Движение патрулирования
function getPatrolMove(bot, memory) {
  // Патрулируем вокруг центра верхней части карты
  const centerX = 25;
  const centerY = 8;

  const dx = centerX - bot.x;
  const dy = centerY - bot.y;

  let move = null;
  if (Math.abs(dx) > Math.abs(dy)) {
    move = dx > 0 ? { dx: 1, dy: 0, pos: 'left' } : { dx: -1, dy: 0, pos: 'right' };
  } else {
    move = dy > 0 ? { dx: 0, dy: 1, pos: 'bottom' } : { dx: 0, dy: -1, pos: 'top' };
  }

  if (isValidMove(bot, move)) return move;

  // Случайное движение
  return getRandomValidMove(bot);
}

// Находит лучшую позицию для атаки базы с распределением ботов
function findBestAttackPosition(bot, botId) {
  const baseCenterX = base.x + 1;
  const baseCenterY = base.y + 1;

  // Позиции для атаки (слева, справа, сверху)
  const attackPositions = [
    { x: base.x - 4, y: baseCenterY, pos: 'left', dir: 'right' },   // Слева от базы
    { x: base.x + 6, y: baseCenterY, pos: 'right', dir: 'left' },  // Справа от базы
    { x: baseCenterX, y: base.y - 4, pos: 'top', dir: 'bottom' }   // Сверху базы
  ];

  // Считаем сколько ботов уже идут к каждой позиции
  const positionCounts = { left: 0, right: 0, top: 0 };
  for (const otherId in botMemory) {
    if (otherId === botId) continue;
    const otherMemory = botMemory[otherId];
    if (otherMemory && otherMemory.attackTargetPos) {
      positionCounts[otherMemory.attackTargetPos]++;
    }
  }

  // Фильтруем позиции с прямой видимостью и сортируем по занятости
  const availablePositions = attackPositions
    .filter(pos => hasLineOfSightToBase(pos.x, pos.y, pos.dir))
    .map(pos => ({
      ...pos,
      distance: Math.abs(bot.x - pos.x) + Math.abs(bot.y - pos.y),
      botsTargeting: positionCounts[pos.pos]
    }))
    .sort((a, b) => {
      // Приоритет: меньше ботов целятся, затем меньше расстояние
      if (a.botsTargeting !== b.botsTargeting) {
        return a.botsTargeting - b.botsTargeting;
      }
      return a.distance - b.distance;
    });

  // Выбираем лучшую позицию (с наименьшей загрузкой)
  let bestPos = availablePositions.length > 0 ? availablePositions[0] : null;

  // Если бот уже близко к какой-то позиции - остаёмся на ней
  for (const pos of availablePositions) {
    if (Math.abs(bot.x - pos.x) <= 2 && Math.abs(bot.y - pos.y) <= 2) {
      bestPos = pos;
      break;
    }
  }

  // Сохраняем выбранную позицию в памяти бота
  if (bestPos && botMemory[botId]) {
    botMemory[botId].attackTargetPos = bestPos.pos;
  }

  // Если уже на позиции для стрельбы
  if (bestPos && Math.abs(bot.x - bestPos.x) <= 1 && Math.abs(bot.y - bestPos.y) <= 1) {
    return {
      canShoot: true,
      position: bestPos.dir
    };
  }

  // Если бот слишком близко к базе - отступаем
  const distToBase = Math.abs(bot.x - baseCenterX) + Math.abs(bot.y - baseCenterY);
  if (distToBase < 4) {
    // Отступаем назад
    const retreatX = bot.x < baseCenterX ? bot.x - 2 : bot.x + 2;
    const retreatY = bot.y < baseCenterY ? bot.y - 2 : bot.y + 2;
    return {
      canShoot: false,
      targetX: retreatX,
      targetY: retreatY
    };
  }

  // Возвращаем целевую позицию с небольшим случайным смещением для разнообразия
  if (bestPos) {
    // Добавляем уникальное смещение для каждого бота чтобы не стояли в одной точке
    const botIndex = parseInt(botId.split('_')[1]) || 0;
    const offsetX = (botIndex % 3) - 1; // -1, 0, 1
    const offsetY = Math.floor(botIndex / 3) % 3 - 1; // -1, 0, 1

    return {
      canShoot: false,
      targetX: bestPos.x + offsetX,
      targetY: bestPos.y + offsetY,
      targetDir: bestPos.dir
    };
  }

  // Если нет позиций с прямой видимостью - идём ближе и стреляем по кирпичам
  return {
    canShoot: false,
    targetX: base.x - 3,
    targetY: baseCenterY
  };
}

// Проверка прямой видимости до базы
function hasLineOfSightToBase(fromX, fromY, direction) {
  const bulletConfig = bulletDirections[direction === 'bottom' ? 'top' : direction === 'top' ? 'bottom' : direction === 'left' ? 'right' : 'left'];
  if (!bulletConfig) return false;

  let checkX = fromX;
  let checkY = fromY;

  for (let i = 0; i < 20; i++) {
    checkX += bulletConfig.dx;
    checkY += bulletConfig.dy;

    // Дошли до базы
    if (base.x <= checkX && checkX < base.x + 3 && base.y <= checkY && checkY < base.y + 3) {
      return true;
    }

    // Проверяем бетонные стены
    for (const wall of walls) {
      if (wall.x === checkX && wall.y === checkY) {
        return false;
      }
    }
  }

  return false;
}

// Проверка валидности хода
function isValidMove(bot, move) {
  const newX = bot.x + move.dx;
  const newY = bot.y + move.dy;

  // Границы поля
  if (newX < 0 || newX > size.col - 3 || newY < 0 || newY > size.row - 3) {
    return false;
  }

  // Проверка стен и кирпичей
  return !checkWallCollision(newX, newY, move.pos) && !checkBrickCollision(newX, newY, move.pos);
}

// Поиск обхода препятствия
function findDetour(bot, targetX, targetY) {
  const moves = [
    { dx: 1, dy: 0, pos: 'left' },
    { dx: -1, dy: 0, pos: 'right' },
    { dx: 0, dy: 1, pos: 'bottom' },
    { dx: 0, dy: -1, pos: 'top' },
    { dx: 1, dy: 1, pos: 'left' },
    { dx: -1, dy: 1, pos: 'right' },
    { dx: 1, dy: -1, pos: 'left' },
    { dx: -1, dy: -1, pos: 'right' }
  ];

  // Сортируем по близости к цели
  moves.sort((a, b) => {
    const distA = Math.abs(bot.x + a.dx - targetX) + Math.abs(bot.y + a.dy - targetY);
    const distB = Math.abs(bot.x + b.dx - targetX) + Math.abs(bot.y + b.dy - targetY);
    return distA - distB;
  });

  for (const move of moves) {
    if (isValidMove(bot, move)) {
      return move;
    }
  }

  return null;
}

// Проверка нужно ли стрелять по препятствию
function shouldShootObstacle(bot) {
  const bulletConfig = bulletDirections[bot.position];
  if (!bulletConfig) return false;

  // Проверяем 3 клетки впереди
  let checkX = bot.x + bulletConfig.offsetX;
  let checkY = bot.y + bulletConfig.offsetY;

  for (let i = 0; i < 3; i++) {
    checkX += bulletConfig.dx;
    checkY += bulletConfig.dy;

    // Нашли кирпич - стреляем
    for (const brick of bricks) {
      if (brick.x === checkX && brick.y === checkY && brick.health > 0) {
        return true;
      }
    }
  }

  return false;
}

// Проверка пути к базе
function isPathToBaseClear(bot) {
  const bulletConfig = bulletDirections[bot.position];
  if (!bulletConfig) return false;

  let checkX = bot.x + bulletConfig.offsetX;
  let checkY = bot.y + bulletConfig.offsetY;

  // Проверяем 10 клеток впереди
  for (let i = 0; i < 10; i++) {
    checkX += bulletConfig.dx;
    checkY += bulletConfig.dy;

    // Если дошли до базы - путь чист
    if (Math.abs(checkX - base.x) <= 2 && Math.abs(checkY - base.y) <= 2) {
      return true;
    }

    // Если встретили бетонную стену - путь не чист
    for (const wall of walls) {
      if (wall.x === checkX && wall.y === checkY) {
        return false;
      }
    }
  }

  return false;
}

// Проверка столкновения с кирпичом
function checkBrickCollision(newX, newY, position) {
  const playerPiece = positionPiece[position];
  if (!playerPiece) return false;

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (playerPiece[y][x] === 1) {
        const checkX = newX + x;
        const checkY = newY + y;

        for (const brick of bricks) {
          if (brick.x === checkX && brick.y === checkY && brick.health > 0) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// Проверка победы в кооп-режиме
function checkCoopVictory() {
  if (enemiesToSpawn === 0 && coopBotCount === 0 && gameState === 'playing') {
    // Победа в волне
    io.sockets.emit('wave complete', { wave: coopWave });
  }
}

// Проверка поражения в кооп-режиме
function checkCoopDefeat() {
  if (base.health <= 0 && gameState === 'playing') {
    gameState = 'defeat';
    io.sockets.emit('game over', { reason: 'base destroyed', wave: coopWave, kills: enemiesKilled });

    // Останавливаем спавн
    if (waveSpawnInterval) {
      clearInterval(waveSpawnInterval);
      waveSpawnInterval = null;
    }
  }
}

// Сброс игры
function resetGame() {
  gameState = 'waiting';
  coopWave = 1;
  enemiesToSpawn = 0;
  enemiesKilled = 0;
  coopBotCount = 0;

  if (waveSpawnInterval) {
    clearInterval(waveSpawnInterval);
    waveSpawnInterval = null;
  }

  // Очищаем всех ботов
  for (const playerId in players) {
    if (players[playerId].isBot) {
      if (botIntervals[playerId]) {
        clearInterval(botIntervals[playerId]);
        delete botIntervals[playerId];
      }
      delete botMemory[playerId];
      delete players[playerId];
    }
  }

  // Очищаем пули
  for (const bulletId in bulletIntervals) {
    clearInterval(bulletIntervals[bulletId]);
    delete bulletIntervals[bulletId];
  }
  activeBullets.clear();

  base.health = 1;
  bricks.length = 0;
}

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
  const positions = ['top', 'left', 'right', 'bottom'];

  while (attempts < maxAttempts) {
    const x = randomInteger(size.col - 3);
    const y = randomInteger(size.row - 3);

    let isSafe = true;

    // Проверяем, что позиция не в стене (проверяем все 4 варианта поворота)
    let inWall = false;
    for (const pos of positions) {
      if (checkWallCollision(x, y, pos)) {
        inWall = true;
        break;
      }
    }
    if (inWall) {
      attempts++;
      continue;
    }

    // Проверяем расстояние до других игроков
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

  socket.on('new player', function (data) {
    const name = typeof data === 'string' ? data : data.name;
    const color = typeof data === 'object' ? data.color : '#00AA00';
    const mode = typeof data === 'object' ? data.mode : 'pvp';

    // Устанавливаем режим игры (только если еще не установлен или первый игрок)
    if (Object.keys(players).length === 0) {
      gameMode = mode;

      // Инициализируем карту для выбранного режима
      if (gameMode === 'coop') {
        resetGame();
        generateCoopMap();
        startCoopWave();
      } else {
        generatePvPMap();
        // Добавляем ботов только для первого игрока в PvP
        setTimeout(addPvPBots, 500);
      }
    }

    const positions = ['top', 'left', 'right', 'bottom'];
    let spawnPos;

    if (gameMode === 'coop') {
      // В кооп-режиме спавним игроков внизу, у базы
      const coopSpawns = [
        { x: 20, y: 25 },
        { x: 28, y: 25 },
        { x: 16, y: 25 },
        { x: 32, y: 25 }
      ];
      // Ищем свободную позицию
      for (const pos of coopSpawns) {
        let occupied = false;
        for (const playerId in players) {
          if (!players[playerId].isBot &&
              Math.abs(players[playerId].x - pos.x) < 3 &&
              Math.abs(players[playerId].y - pos.y) < 3) {
            occupied = true;
            break;
          }
        }
        if (!occupied) {
          spawnPos = pos;
          break;
        }
      }
      if (!spawnPos) spawnPos = coopSpawns[0];
    } else {
      spawnPos = getSafeSpawnPosition();
    }

    players[socket.id] = {
      name: name || 'Player',
      color: color || '#00AA00',
      status: true,
      isBot: false,
      x: spawnPos.x,
      y: spawnPos.y,
      position: gameMode === 'coop' ? 'top' : positions[randomInteger(4)], // В коопе смотрим вверх
      bullets: {},
      rating: 0,
      lastShot: 0,
      invulnerableUntil: Date.now() + INVULNERABILITY_TIME,
      exploding: false,
      explosionEndTime: 0,
      respawnShootingCooldown: Date.now() + 2000,
      lives: gameMode === 'coop' ? 3 : 1 // В коопе 3 жизни
    };

    socket.emit('player id', socket.id);
    socket.emit('game mode', { mode: gameMode, wave: coopWave });
  });

  socket.on('movePieceRight', () => movePlayer(socket.id, 1, 0, 'left'));   // едет вправо, смотрит вправо (position='left')
  socket.on('movePieceLeft', () => movePlayer(socket.id, -1, 0, 'right'));  // едет влево, смотрит влево (position='right')
  socket.on('movePieceTop', () => movePlayer(socket.id, 0, -1, 'top'));      // едет вверх, смотрит вверх
  socket.on('movePieceBottom', () => movePlayer(socket.id, 0, 1, 'bottom')); // едет вниз, смотрит вниз

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

  const bulletX = player.x + bulletConfig.offsetX;
  const bulletY = player.y + bulletConfig.offsetY;

  // Проверяем, что пуля создается в пределах поля
  if (bulletX < 0 || bulletX >= size.col || bulletY < 0 || bulletY >= size.row) {
    return; // Пуля за пределами поля - не создаем
  }

  // Проверяем, что пуля не создается внутри стены
  for (const wall of walls) {
    if (wall.x === bulletX && wall.y === bulletY) {
      return; // Пуля в стене - не создаем
    }
  }

  const bullet = getBulletFromPool();
  bullet.position = player.position;
  bullet.x = bulletX;
  bullet.y = bulletY;
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

    // Проверяем следующую позицию перед движением
    const nextX = bullet.x + bullet.dx;
    const nextY = bullet.y + bullet.dy;

    // Проверяем столкновение со стеной на пути
    for (const wall of walls) {
      if (wall.x === nextX && wall.y === nextY) {
        returnBulletToPool(bullet.id);
        delete player.bullets[bullet.id];
        return;
      }
    }

    bullet.x = nextX;
    bullet.y = nextY;

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

  // Проверяем столкновение с кирпичами (только в кооп-режиме)
  if (gameMode === 'coop') {
    for (let i = 0; i < bricks.length; i++) {
      const brick = bricks[i];
      if (brick.x === bullet.x && brick.y === bullet.y && brick.health > 0) {
        brick.health--;
        if (brick.health <= 0) {
          io.sockets.emit('brick destroyed', { x: brick.x, y: brick.y });
        }
        return true;
      }
    }

    // Проверяем столкновение с базой
    if (base.x <= bullet.x && bullet.x < base.x + 3 &&
        base.y <= bullet.y && bullet.y < base.y + 3) {
      base.health--;
      io.sockets.emit('base hit', { health: base.health });
      checkCoopDefeat();
      return true;
    }
  }

  const now = Date.now();

  for (const playerId in players) {
    if (playerId === shooterId) continue;

    const target = players[playerId];
    if (!target.status || !positionPiece[target.position]) continue;

    // Проверка неуязвимости
    if (target.invulnerableUntil && now < target.invulnerableUntil) continue;

    // Проверка, что игрок не в процессе взрыва
    if (target.exploding && now < target.explosionEndTime) continue;

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

        // Проверяем кирпичи (в кооп-режиме)
        if (gameMode === 'coop') {
          for (const brick of bricks) {
            if (brick.x === checkX && brick.y === checkY && brick.health > 0) {
              return true; // Столкновение с кирпичом
            }
          }

          // Проверяем базу (игроки не могут проехать через базу)
          if (base.x <= checkX && checkX < base.x + 3 &&
              base.y <= checkY && checkY < base.y + 3) {
            return true;
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

  // Проверяем, не взрывается ли сам игрок
  if (player.exploding && now < player.explosionEndTime) return null;

  // Быстрая проверка расстояния для всех игроков
  for (const playerId in players) {
    const otherPlayer = players[playerId];
    if (otherPlayer === player || !otherPlayer.status) continue;

    // В кооп-режиме игроки не сталкиваются друг с другом (только с врагами)
    if (gameMode === 'coop' && !player.isBot && !otherPlayer.isBot) continue;

    // Пропускаем игроков в процессе взрыва
    if (otherPlayer.exploding && now < otherPlayer.explosionEndTime) continue;

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
  const gameStateData = {
    playField,
    players,
    walls,
    gameMode,
    gameState
  };

  // Добавляем данные кооп-режима
  if (gameMode === 'coop') {
    gameStateData.bricks = bricks;
    gameStateData.base = base;
    gameStateData.wave = coopWave;
    gameStateData.enemiesRemaining = enemiesToSpawn + coopBotCount;
    gameStateData.enemiesKilled = enemiesKilled;
  }

  io.sockets.emit('state', gameStateData);
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

  // Очищаем устаревшие целевые позиции
  if (memory.targetPosition && now - memory.targetPosition.timestamp > 500) {
    memory.targetPosition = null;
  }

  // 1. Проверка слишком близкого расстояния к другим ботам
  const botThreat = detectBotCollisionThreat(botId);
  if (botThreat && now - memory.lastCollisionAvoidance > 300) {
    const avoidance = calculateBotAvoidance(botId, botThreat);
    if (avoidance && tryMove(botId, avoidance.dx, avoidance.dy, avoidance.pos)) {
      memory.lastCollisionAvoidance = now;
      return;
    }
  }

  // 2. Быстрая проверка опасных пуль
  const dangerousBullets = findDangerousBullets(botId);
  if (dangerousBullets.length > 0 && now - memory.lastDodge > 200) {
    const evasion = calculateBestEvasion(botId, dangerousBullets);
    if (evasion && tryMove(botId, evasion.dx, evasion.dy, evasion.pos)) {
      memory.lastDodge = now;
      return;
    }
  }

  // 3. Поиск цели с увеличенным радиусом
  const target = findBestTarget(botId);

  if (target) {
    const distance = Math.abs(bot.x - target.x) + Math.abs(bot.y - target.y);

    // 4. Стрельба по цели (увеличенная дистанция)
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

    // 5. Агрессивное преследование с проверкой безопасности
    const huntMove = smartHuntWithCollisionAvoidance(botId, target);
    if (huntMove && tryMove(botId, huntMove.dx, huntMove.dy, huntMove.pos)) {
      return;
    }
  }

  // 6. Улучшенное патрулирование
  smartPatrol(botId);
}

// Обнаружение угрозы столкновения с другими ботами
function detectBotCollisionThreat(botId) {
  const bot = players[botId];
  if (!bot) return null;

  const BOT_DANGER_DISTANCE = 6; // Расстояние для активации избегания
  const CRITICAL_DISTANCE = 3;   // Критическое расстояние

  let closestThreat = null;
  let minDist = Infinity;

  const now = Date.now();

  for (const playerId in players) {
    if (playerId === botId) continue;

    const other = players[playerId];
    if (!other || !other.status) continue;
    if (!other.isBot) continue; // Проверяем только других ботов

    // Пропускаем взрывающихся
    if (other.exploding && now < other.explosionEndTime) continue;

    const dist = Math.abs(bot.x - other.x) + Math.abs(bot.y - other.y);

    if (dist < BOT_DANGER_DISTANCE && dist < minDist) {
      minDist = dist;
      closestThreat = {
        player: other,
        distance: dist,
        playerId: playerId,
        isCritical: dist <= CRITICAL_DISTANCE
      };
    }
  }

  return closestThreat;
}

// Расчет маневра для избегания другого бота
function calculateBotAvoidance(botId, threat) {
  const bot = players[botId];
  if (!bot || !threat) return null;

  const other = threat.player;
  const dx = other.x - bot.x;
  const dy = other.y - bot.y;

  // Возможные направления для отхода
  const moves = [];

  if (Math.abs(dx) > Math.abs(dy)) {
    // Другой бот справа/слева - отходим вверх/вниз
    if (bot.y > size.row / 2) {
      moves.push({ dx: 0, dy: -1, pos: 'top' });
      moves.push({ dx: 0, dy: 1, pos: 'bottom' });
    } else {
      moves.push({ dx: 0, dy: 1, pos: 'bottom' });
      moves.push({ dx: 0, dy: -1, pos: 'top' });
    }
    // Также пробуем диагонали
    moves.push({ dx: 1, dy: -1, pos: 'top' });
    moves.push({ dx: -1, dy: -1, pos: 'top' });
    moves.push({ dx: 1, dy: 1, pos: 'bottom' });
    moves.push({ dx: -1, dy: 1, pos: 'bottom' });
  } else {
    // Другой бот сверху/снизу - отходим влево/вправо
    if (bot.x > size.col / 2) {
      moves.push({ dx: -1, dy: 0, pos: 'right' });
      moves.push({ dx: 1, dy: 0, pos: 'left' });
    } else {
      moves.push({ dx: 1, dy: 0, pos: 'left' });
      moves.push({ dx: -1, dy: 0, pos: 'right' });
    }
    // Также пробуем диагонали
    moves.push({ dx: -1, dy: 1, pos: 'bottom' });
    moves.push({ dx: -1, dy: -1, pos: 'top' });
    moves.push({ dx: 1, dy: 1, pos: 'bottom' });
    moves.push({ dx: 1, dy: -1, pos: 'top' });
  }

  // При критическом расстоянии добавляем отступление назад
  if (threat.isCritical) {
    if (dx > 0) moves.unshift({ dx: -1, dy: 0, pos: 'right' }); // Отходим влево
    if (dx < 0) moves.unshift({ dx: 1, dy: 0, pos: 'left' });   // Отходим вправо
    if (dy > 0) moves.unshift({ dx: 0, dy: -1, pos: 'bottom' }); // Отходим вверх
    if (dy < 0) moves.unshift({ dx: 0, dy: 1, pos: 'top' });     // Отходим вниз
  }

  // Выбираем первое безопасное движение
  for (const move of moves) {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;

    if (newX >= 0 && newX < size.col - 3 && newY >= 0 && newY < size.row - 3) {
      if (!checkWallCollision(newX, newY, move.pos) &&
          isSafeFromCollisions(botId, newX, newY, move.pos)) {
        return move;
      }
    }
  }

  return null;
}

// Обнаружение угрозы столкновения
function detectCollisionThreat(botId) {
  const bot = players[botId];
  if (!bot) return null;

  const DANGER_DISTANCE = 5; // Критическое расстояние
  let closestThreat = null;
  let minDist = Infinity;

  const now = Date.now();

  for (const playerId in players) {
    if (playerId === botId) continue;

    const other = players[playerId];
    if (!other || !other.status) continue;

    // Пропускаем неуязвимых и взрывающихся
    if (other.invulnerableUntil && now < other.invulnerableUntil) continue;
    if (other.exploding && now < other.explosionEndTime) continue;

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

// Проверка безопасности от столкновений с учетом предсказания движения
function isSafeFromCollisions(botId, newX, newY, position) {
  const bot = players[botId];
  if (!bot) return false;

  const SAFE_DISTANCE = 6; // Уменьшено с 10 до 6 для более точной проверки
  const MIN_DISTANCE = 4;  // Минимальное безопасное расстояние (2 клетки буфера)
  const playerPiece = positionPiece[position];
  if (!playerPiece) return false;

  const now = Date.now();

  for (const playerId in players) {
    const otherPlayer = players[playerId];
    if (otherPlayer === bot || !otherPlayer.status) continue;

    // Пропускаем неуязвимых и взрывающихся
    const botInvulnerable = bot.invulnerableUntil && now < bot.invulnerableUntil;
    const otherInvulnerable = otherPlayer.invulnerableUntil && now < otherPlayer.invulnerableUntil;
    const otherExploding = otherPlayer.exploding && now < otherPlayer.explosionEndTime;
    if (botInvulnerable || otherInvulnerable || otherExploding) continue;

    const dist = Math.abs(newX - otherPlayer.x) + Math.abs(newY - otherPlayer.y);

    // Проверка на слишком близкое расстояние
    if (dist < MIN_DISTANCE) {
      return false;
    }

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

                // Проверяем пересечение
                if (Math.abs(checkX - otherX) <= 1 && Math.abs(checkY - otherY) <= 1) {
                  return false;
                }
              }
            }
          }
        }
      }
    }

    // Проверка на конфликт целевых позиций с другими ботами
    const otherMemory = botMemory[playerId];
    if (otherMemory && otherMemory.targetPosition) {
      const targetDist = Math.abs(newX - otherMemory.targetPosition.x) +
                        Math.abs(newY - otherMemory.targetPosition.y);
      if (targetDist < 3) {
        return false; // Другой бот уже целится в эту позицию
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
    if (dx > 0) moves.push({ dx: 1, dy: 0, pos: 'left', priority: 3 });      // Цель справа - идем вправо, смотрим вправо
    else moves.push({ dx: -1, dy: 0, pos: 'right', priority: 3 });         // Цель слева - идем влево, смотрим влево

    if (dy > 0) moves.push({ dx: 0, dy: 1, pos: 'bottom', priority: 2 });     // Цель снизу - идем вниз, смотрим вниз
    else if (dy < 0) moves.push({ dx: 0, dy: -1, pos: 'top', priority: 2 });    // Цель сверху - идем вверх, смотрим вверх
  } else {
    if (dy > 0) moves.push({ dx: 0, dy: 1, pos: 'bottom', priority: 3 });        // Цель снизу - идем вниз, смотрим вниз
    else moves.push({ dx: 0, dy: -1, pos: 'top', priority: 3 });            // Цель сверху - идем вверх, смотрим вверх

    if (dx > 0) moves.push({ dx: 1, dy: 0, pos: 'left', priority: 2 });       // Цель справа - идем вправо, смотрим вправо
    else if (dx < 0) moves.push({ dx: -1, dy: 0, pos: 'right', priority: 2 });   // Цель слева - идем влево, смотрим влево
  }

  // Добавляем диагональные маневры для агрессивных ботов
  if (memory.aggressionLevel > 0.7) {
    if (dx > 0 && dy > 0) moves.push({ dx: 1, dy: 1, pos: 'bottom', priority: 2 });     // Вправо-вниз, смотрим вниз
    if (dx < 0 && dy > 0) moves.push({ dx: -1, dy: 1, pos: 'bottom', priority: 2 });   // Влево-вниз, смотрим вниз
    if (dx > 0 && dy < 0) moves.push({ dx: 1, dy: -1, pos: 'top', priority: 2 });      // Вправо-вверх, смотрим вверх
    if (dx < 0 && dy < 0) moves.push({ dx: -1, dy: -1, pos: 'top', priority: 2 });    // Влево-вверх, смотрим вверх
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

    if (!checkWallCollision(newX, newY, move.pos) &&
      isSafeFromCollisions(botId, newX, newY, move.pos) &&
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
    if (dx > 0) return { dx: 1, dy: 0, pos: 'left' };   // Цель справа - идем вправо, смотрим вправо
    else return { dx: -1, dy: 0, pos: 'right' };       // Цель слева - идем влево, смотрим влево
  } else {
    // Движемся по Y-оси
    if (dy > 0) return { dx: 0, dy: 1, pos: 'bottom' };    // Цель снизу - идем вниз, смотрим вниз
    else return { dx: 0, dy: -1, pos: 'top' };       // Цель сверху - идем вверх, смотрим вверх
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
  const now = Date.now();

  for (const playerId in players) {
    if (playerId === botId || players[playerId].isBot) continue;

    const player = players[playerId];
    if (!player.status) continue;

    // Пропускаем взрывающихся игроков
    if (player.exploding && now < player.explosionEndTime) continue;

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
    if (dx > 0) moves.push({ dx: 1, dy: 0, pos: 'left', priority: 3 });      // Цель справа - идем вправо, смотрим вправо
    else moves.push({ dx: -1, dy: 0, pos: 'right', priority: 3 });         // Цель слева - идем влево, смотрим влево

    if (dy > 0) moves.push({ dx: 0, dy: 1, pos: 'bottom', priority: 2 });     // Цель снизу - идем вниз, смотрим вниз
    else if (dy < 0) moves.push({ dx: 0, dy: -1, pos: 'top', priority: 2 });    // Цель сверху - идем вверх, смотрим вверх
  } else {
    if (dy > 0) moves.push({ dx: 0, dy: 1, pos: 'bottom', priority: 3 });        // Цель снизу - идем вниз, смотрим вниз
    else moves.push({ dx: 0, dy: -1, pos: 'top', priority: 3 });            // Цель сверху - идем вверх, смотрим вверх

    if (dx > 0) moves.push({ dx: 1, dy: 0, pos: 'left', priority: 2 });       // Цель справа - идем вправо, смотрим вправо
    else if (dx < 0) moves.push({ dx: -1, dy: 0, pos: 'right', priority: 2 });   // Цель слева - идем влево, смотрим влево
  }

  // Добавляем диагональные маневры для агрессивных ботов
  if (memory.aggressionLevel > 0.7) {
    if (dx > 0 && dy > 0) moves.push({ dx: 1, dy: 1, pos: 'bottom', priority: 2 });     // Вправо-вниз, смотрим вниз
    if (dx < 0 && dy > 0) moves.push({ dx: -1, dy: 1, pos: 'bottom', priority: 2 });   // Влево-вниз, смотрим вниз
    if (dx > 0 && dy < 0) moves.push({ dx: 1, dy: -1, pos: 'top', priority: 2 });      // Вправо-вверх, смотрим вверх
    if (dx < 0 && dy < 0) moves.push({ dx: -1, dy: -1, pos: 'top', priority: 2 });    // Влево-вверх, смотрим вверх
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
      const move = dx > 0 ? { dx: 1, dy: 0, pos: 'left' } : { dx: -1, dy: 0, pos: 'right' };
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

  // Проверка на других ботов, движущихся к той же позиции
  const memory = botMemory[botId];
  if (memory) {
    // Очищаем старую целевую позицию
    memory.targetPosition = null;

    // Проверяем, не занята ли целевая позиция другим ботом
    for (const otherId in botMemory) {
      if (otherId === botId) continue;
      const otherMemory = botMemory[otherId];
      if (otherMemory && otherMemory.targetPosition) {
        const targetDist = Math.abs(newX - otherMemory.targetPosition.x) +
                          Math.abs(newY - otherMemory.targetPosition.y);
        if (targetDist < 2) {
          return false; // Позиция уже зарезервирована другим ботом
        }
      }
    }
  }

  const collidedPlayer = checkPlayerCollision(bot, newX, newY, position);

  const collidedWall = checkWallCollision(newX, newY, position);

  if (!collidedPlayer && !collidedWall) {
    bot.x = newX;
    bot.y = newY;
    bot.position = position;

    // Сохраняем целевую позицию в памяти бота
    if (memory) {
      memory.targetPosition = { x: newX, y: newY, timestamp: Date.now() };
    }

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

// Запуск игрового цикла
setInterval(updateGameState, GAME_UPDATE_INTERVAL);

// Функция для добавления ботов PvP (вызывается при первом подключении в PvP режиме)
function addPvPBots() {
  addBot();
  addBot();
  addBot();
}