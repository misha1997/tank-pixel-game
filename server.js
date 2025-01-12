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

// Размер игрового поля
var size = {
  col: 25,
  row: 25,
};

// Позиции для отображения фигур
var positionPiece = {
  top: [
    [0, 1, 0],
    [1, 1, 1],
    [1, 0, 1],
  ],
  bottom: [
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 0],
  ],
  left: [
    [1, 1, 0],
    [0, 1, 1],
    [1, 1, 0],
  ],
  right: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 1, 1],
  ],
  boomOne: [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
  ],
  boomTwo: [
    [0, 1, 0],
    [1, 0, 1],
    [0, 1, 0],
  ],
};

// Генерация пустого игрового поля
function generatePlayField() {
  for (let row = 0; row < size.row; row++) {
    playField[row] = [];
    for (let col = 0; col < size.col; col++) {
      playField[row][col] = 0;
    }
  }
}
generatePlayField();
addBot();

// Случайное целое число в пределах игрового поля
function randomInteger(max) {
  return Math.floor(Math.random() * max);
}

io.on('connection', function (socket) {
  // Добавление нового игрока
  socket.on('new player', function (name) {
    var positions = ['top', 'left', 'right', 'bottom'];
    players[socket.id] = {
      name,
      status: true,
      isBot: false,
      x: randomInteger(size.col - 3),
      y: randomInteger(size.row - 3),
      position: positions[(Math.random() * 4) | 0],
      bullets: {},
      rating: 0,
    };
  });

  // Движение фигуры
  socket.on('movePieceRight', () => {
    movePlayer(socket.id, -1, 0, 'right'); // dx = -1, dy = 0
  });

  socket.on('movePieceLeft', () => {
    movePlayer(socket.id, 1, 0, 'left'); // dx = 1, dy = 0
  });

  socket.on('movePieceTop', () => {
    movePlayer(socket.id, 0, -1, 'top'); // dx = 0, dy = -1
  });

  socket.on('movePieceBottom', () => {
    movePlayer(socket.id, 0, 1, 'bottom'); // dx = 0, dy = 1
  });

  // Создание выстрела
  socket.on('moveShot', function () {
    if (players[socket.id] && players[socket.id].status) {
      const player = players[socket.id];
      const centerX = player.x + 1; // Центральная точка по X (средний столбец)
      const centerY = player.y + 1; // Центральная точка по Y (средний ряд)
      const id = uuidv4(); // Генерация уникального ID для пули

      let bull = {
        position: player.position,
        x: centerX,
        y: centerY,
        direction: '' // Направление пули
      };

      // Устанавливаем направление выстрела в зависимости от позиции игрока
      if (player.position === 'top') {
        bull.direction = 'up';  // Направление вверх
        bull.y -= 1;
      } else if (player.position === 'bottom') {
        bull.direction = 'down';  // Направление вниз
        bull.y += 2;
      } else if (player.position === 'left') {
        bull.direction = 'right';  // Направление влево
        bull.x += 2;
      } else if (player.position === 'right') {
        bull.direction = 'left';  // Направление вправо
        bull.x -= 1;
      }

      players[socket.id].bullets[id] = bull;

      // Двигаем пулю в зависимости от направления
      let interval = setInterval(() => {
        if (!players[socket.id]) {
          clearInterval(interval);
          return;
        }

        // Двигаем пулю в зависимости от заранее установленного направления
        if (bull.direction === 'up') {
          bull.y -= 1;
        } else if (bull.direction === 'down') {
          bull.y += 1;
        } else if (bull.direction === 'left') {
          bull.x -= 1;
        } else if (bull.direction === 'right') {
          bull.x += 1;
        }

        // Проверка, выходит ли пуля за границы
        if (isBulletOutOfBounds(bull, socket.id)) {
          delete players[socket.id].bullets[id];
          clearInterval(interval);
        }
      }, 100);
    }
  });

  // Перезапуск игры для игрока
  socket.on('restart', function (index) {
    if (players[index]) {
      restartPlayer(index);
    }
  });

  // Отключение игрока
  socket.on('disconnect', function () {
    if (players[socket.id]) {
      delete players[socket.id];
    }
  });
});

// Перемещение игрока с проверкой выхода за границы
function movePlayer(playerId, dx, dy, position) {
  if (players[playerId] && players[playerId].status) {
    const player = players[playerId];
    const newX = player.x + dx;
    const newY = player.y + dy;

    // Проверяем границы и столкновения
    if (!isOutOfBounds({ ...player, x: newX, y: newY, position }) &&
      !isPlayerCollision(player, newX, newY)) {
      player.x = newX;
      player.y = newY;
      player.position = position;
    }
  }
}

// Проверка столкновений между игроками
function isPlayerCollision(player, newX, newY) {
  for (const playerId in players) {
    const otherPlayer = players[playerId];

    // Игнорируем текущего игрока
    if (otherPlayer === player || !otherPlayer.status) continue;

    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (positionPiece[player.position][y][x] === 1) {
          const playerCellX = newX + x;
          const playerCellY = newY + y;

          for (let oy = 0; oy < 3; oy++) {
            for (let ox = 0; ox < 3; ox++) {
              if (positionPiece[otherPlayer.position][oy][ox] === 1) {
                const otherCellX = otherPlayer.x + ox;
                const otherCellY = otherPlayer.y + oy;

                // Проверяем пересечение ячеек
                if (playerCellX === otherCellX && playerCellY === otherCellY) {
                  return true;
                }
              }
            }
          }
        }
      }
    }
  }
  return false;
}

// Проверка выхода игрока за границы
function isOutOfBounds(player) {
  if (!player || !positionPiece[player.position]) {
    return true;
  }

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (positionPiece[player.position][y]?.[x] === 1) {
        const checkX = player.x + x;
        const checkY = player.y + y;

        // Проверяем выход за пределы игрового поля
        if (checkX < 0 || checkX >= size.col || checkY < 0 || checkY >= size.row) {
          return true;
        }
      }
    }
  }
  return false;
}

// Проверка выхода снаряда за границы
function isBulletOutOfBounds(bullet, userId) {
  if (playField[bullet.y] === undefined || playField[bullet.x] === undefined || playField[bullet.y][bullet.x] === undefined) {
    return true;
  }

  for (let index in players) {
    if (index !== userId) { // Проверяем всех игроков, кроме стреляющего
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          // Проверка попадания пули в игрока
          if ((players[index].x + x) === bullet.x && (players[index].y + y) === bullet.y && players[index].status) {
            // Запускаем анимацию взрыва, если пуля попала в игрока
            if (players[index].position != 'boomOne' && players[index].position != 'boomTwo') {
              players[userId].rating++; // Увеличиваем рейтинг игрока
              boomAnimate(index); // Запускаем анимацию взрыва
              return true; // Возвращаем true для удаления пули
            }
          }
        }
      }
    }
  }

  return false; // Пуля не вышла за границы и не попала в игрока
}

function boomAnimate(index) {
  // Анимация взрыва
  io.sockets.emit('user dead sound');
  if (players[index].status === true) {
    setTimeout(() => {
      players[index].position = 'boomOne'; // Первая часть анимации
    }, 0);
    setTimeout(() => {
      players[index].position = 'boomTwo'; // Вторая часть анимации
    }, 200);
    setTimeout(() => {
      players[index].position = 'boomOne'; // Возвращаем на первый этап анимации
    }, 400);
    setTimeout(() => {
      players[index].status = false; // Игрок мертв
      io.sockets.emit('user dead', index); // Уведомляем других игроков
    }, 600);
  }
}

function restartPlayer(index) {
  const positions = ['top', 'left', 'right', 'bottom'];
  players[index].status = true;
  players[index].x = randomInteger(size.col - 3);
  players[index].y = randomInteger(size.row - 3);
  players[index].rating = 0;
  players[index].position = positions[(Math.random() * 4) | 0];
}

function updateGameState() {
  generatePlayField();

  for (const playerId in players) {
    const player = players[playerId];
    if (player && player.status && positionPiece[player.position]) {
      applyPlayerToField(player);
      if (player.isBot) {
        botMovementAndShooting(playerId);
      }
    }

    // Обработка пуль
    for (const bulletId in player?.bullets || {}) {
      const bullet = player.bullets[bulletId];
      if (bullet) {
        applyBulletToField(bullet);
      }
    }
  }

  checkBulletCollisions();

  io.sockets.emit('state', {
    playField,
    players,
  });
}

function applyBulletToField(bullet) {
  if (
    bullet.y >= 0 && bullet.y < size.row && // Проверка на выход за границы
    bullet.x >= 0 && bullet.x < size.col
  ) {
    // Убедимся, что строка существует
    if (!playField[bullet.y]) {
      playField[bullet.y] = [];
    }
    // Устанавливаем значение
    playField[bullet.y][bullet.x] = 1;
  }
}

function applyPlayerToField(player) {
  if (!player || !positionPiece[player.position]) {
    return;
  }

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (positionPiece[player.position][y]?.[x] === 1 && player.status) {
        const posX = player.x + x;
        const posY = player.y + y;

        // Проверяем выход за границы перед записью
        if (posX >= 0 && posX < size.col && posY >= 0 && posY < size.row) {
          playField[posY][posX] = 1;
        }
      }
    }
  }
}

function checkBulletCollisions() {
  for (const playerId in players) {
    const player = players[playerId];
    if (!player.status) continue;

    for (const bulletId in player.bullets) {
      const bullet = player.bullets[bulletId];

      for (const otherPlayerId in players) {
        const otherPlayer = players[otherPlayerId];
        if (!otherPlayer.status || playerId === otherPlayerId) continue;

        for (const otherBulletId in otherPlayer.bullets) {
          const otherBullet = otherPlayer.bullets[otherBulletId];

          // Если координаты двух снарядов совпадают
          if (bullet.x === otherBullet.x && bullet.y === otherBullet.y) {
            delete player.bullets[bulletId];
            delete otherPlayer.bullets[otherBulletId];
            io.sockets.emit('explosion', { x: bullet.x, y: bullet.y });
            break;
          }
        }
      }
    }
  }
}

// Функция для добавления бота
function addBot() {
  const botId = 'bot_' + Math.random().toString(36).substr(2, 9); // Генерация уникального ID для бота
  const positions = ['top', 'left', 'right', 'bottom']; // Разные позиции для бота
  const bot = {
    name: 'Bot',
    status: true,
    isBot: true,
    x: Math.floor(Math.random() * 10), // Начальная позиция по x
    y: Math.floor(Math.random() * 10), // Начальная позиция по y
    position: positions[Math.floor(Math.random() * positions.length)], // Случайная позиция
    bullets: [],
    rating: 0
  };
  players[botId] = bot;

  // Интервал для выполнения действий бота
  setInterval(() => {
    if (!players[botId].status) return; // Если бот мертв, прерываем действия

    // Бот выполняет действия
    handleBotMovement(botId);  // Управление движением бота
  }, 1000); // Каждый 1 секунду обновляем действия бота
}

// Логика движения бота
function handleBotMovement(botId) {
  const bot = players[botId];

  if (bot.status) {
    let nearestPlayer = getNearestPlayer(botId);  // Получение ближайшего игрока
    if (nearestPlayer) {
      moveBotToward(botId, nearestPlayer); // Двигаемся в сторону ближайшего игрока
    }
    avoidCollisions(botId);  // Избегаем столкновений с препятствиями
  }
}

// Получение ближайшего игрока для бота
function getNearestPlayer(botId) {
  let nearestPlayer = null;
  let minDistance = Infinity;

  for (let id in players) {
    if (id !== botId && players[id].status) {
      let distance = Math.abs(players[botId].x - players[id].x) + Math.abs(players[botId].y - players[id].y);
      if (distance < minDistance) {
        minDistance = distance;
        nearestPlayer = players[id];
      }
    }
  }

  return nearestPlayer;
}

// Функция для перемещения бота в сторону ближайшего игрока
function moveBotToward(botId, targetPlayer) {
  const dx = targetPlayer.x - players[botId].x;
  const dy = targetPlayer.y - players[botId].y;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Двигаемся по горизонтали
    if (dx > 0) {
      moveBotRight(botId);
    } else {
      moveBotLeft(botId);
    }
  } else {
    // Двигаемся по вертикали
    if (dy > 0) {
      moveBotDown(botId);
    } else {
      moveBotUp(botId);
    }
  }
}

// Функция для избегания столкновений с другими объектами (снарядами и игроками)
function avoidCollisions(botId) {
  for (let bulletId in players[botId].bullets) {
    let bullet = players[botId].bullets[bulletId];
    if (isBulletNearBot(botId, bullet)) {
      let dx = bullet.x - players[botId].x;
      let dy = bullet.y - players[botId].y;

      // Двигаемся в противоположную сторону от снаряда
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) {
          moveBotLeft(botId);
        } else {
          moveBotRight(botId);
        }
      } else {
        if (dy > 0) {
          moveBotUp(botId);
        } else {
          moveBotDown(botId);
        }
      }
    }
  }

  // Проверка на столкновения с другими игроками
  for (let id in players) {
    if (id !== botId && players[id].status) {
      if (isCollisionWithPlayer(botId, players[id])) {
        moveBotAwayFromPlayer(botId, players[id]);
      }
    }
  }
}

// Движение бота в сторону другого игрока (если столкновение)
function moveBotAwayFromPlayer(botId, player) {
  let dx = players[botId].x - player.x;
  let dy = players[botId].y - player.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Двигаемся в противоположную сторону по горизонтали
    if (dx > 0) {
      moveBotRight(botId);
    } else {
      moveBotLeft(botId);
    }
  } else {
    // Двигаемся в противоположную сторону по вертикали
    if (dy > 0) {
      moveBotDown(botId);
    } else {
      moveBotUp(botId);
    }
  }
}

// Функция для проверки попадания пули вблизи бота
function isBulletNearBot(botId, bullet) {
  return Math.abs(bullet.x - players[botId].x) < 3 && Math.abs(bullet.y - players[botId].y) < 3;
}

// Функция для проверки столкновения с игроком
function isCollisionWithPlayer(botId, player) {
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (positionPiece[players[botId].position][y][x] === 1 &&
        positionPiece[player.position][y][x] === 1 &&
        players[botId].x + x === player.x &&
        players[botId].y + y === player.y) {
        return true;
      }
    }
  }
  return false;
}

// Функции для движения бота
function moveBotLeft(botId) {
  if (players[botId].x > 0) {
    players[botId].x -= 1;
    players[botId].position = 'right';
  }
}

function moveBotRight(botId) {
  if (players[botId].x < 25 - 1) {
    players[botId].x += 1;
    players[botId].position = 'left';
  }
}

function moveBotUp(botId) {
  if (players[botId].y > 0) {
    players[botId].y -= 1;
    players[botId].position = 'top';
  }
}

function moveBotDown(botId) {
  if (players[botId].y < 25 - 1) {
    players[botId].y += 1;
    players[botId].position = 'bottom';
  }
}

function isPlayerOnPath(botId, direction) {
  let playerInRange = null;

  // Направления: 'top', 'bottom', 'left', 'right'
  for (let id in players) {
    if (id !== botId && players[id].status) {
      let player = players[id];

      // Если бот смотрит вверх
      if (direction === 'top' && player.x === players[botId].x && player.y < players[botId].y) {
        playerInRange = player;
      }

      // Если бот смотрит вниз
      if (direction === 'bottom' && player.x === players[botId].x && player.y > players[botId].y) {
        playerInRange = player;
      }

      // Если бот смотрит влево
      if (direction === 'left' && player.y === players[botId].y && player.x < players[botId].x) {
        playerInRange = player;
      }

      // Если бот смотрит вправо
      if (direction === 'right' && player.y === players[botId].y && player.x > players[botId].x) {
        playerInRange = player;
      }

      // Если игрок найден в зоне выстрела, возвращаем игрока
      if (playerInRange) {
        return playerInRange;
      }
    }
  }
  return null;  // Нет игроков по пути
}

function botShoot(botId) {
  const playerInRange = isPlayerOnPath(botId, players[botId].position); // Проверяем, есть ли игрок на пути

  if (playerInRange) {
    let id = uuidv4();
    let bullet = {
      position: players[botId].position,
      x: players[botId].x + 1,
      y: players[botId].y + 1
    };

    // Инициализируем снаряд в зависимости от направления
    if (bullet.position === 'top') {
      bullet.y -= 1;
    } else if (bullet.position === 'bottom') {
      bullet.y += 1;
    } else if (bullet.position === 'left') {
      bullet.x -= 1;
    } else if (bullet.position === 'right') {
      bullet.x += 1;
    }

    players[botId].bullets[id] = bullet;

    // Делаем движение снаряда по линии
    var interval = setInterval(() => {
      if (!players[botId]) {
        clearInterval(interval);
        return;
      }

      // Двигаем снаряд в зависимости от направления
      if (bullet.position === 'top') {
        bullet.y -= 1;
      } else if (bullet.position === 'bottom') {
        bullet.y += 1;
      } else if (bullet.position === 'left') {
        bullet.x -= 1;
      } else if (bullet.position === 'right') {
        bullet.x += 1;
      }

      // Проверка на выход за границы и попадание в игрока
      if (isBulletOutOfBounds(bullet, botId)) {
        delete players[botId].bullets[id];
        clearInterval(interval);
      }
    }, 100);
  }
}

function botMovementAndShooting(botId) {
  const directions = ['top', 'bottom', 'left', 'right'];

  // Для каждой из направлений проверяем, есть ли игрок на пути
  const playerInSight = directions.find(direction => isPlayerOnPath(botId, direction));

  if (playerInSight) {
    botShoot(botId);  // Стреляет только если игрок на пути
  }

  // Бот перемещается в определенном направлении
  if (playerInSight === 'top') {
    moveBotUp(botId);
  } else if (playerInSight === 'bottom') {
    moveBotDown(botId);
  } else if (playerInSight === 'left') {
    moveBotLeft(botId);
  } else if (playerInSight === 'right') {
    moveBotRight(botId);
  }
}

setInterval(updateGameState, 100);