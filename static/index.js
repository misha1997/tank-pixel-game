import View from './view.js';

const root = document.querySelector('#root');
const socket = io();

let myPlayerId = null;
let keyStates = {};
let lastInputTime = 0;
const INPUT_THROTTLE = 100; // Увеличено для снижения нагрузки
let view = null;
let inputQueue = [];
let lastInputSent = 0;

// Ждем, пока игрок введет имя
const startGameInterval = setInterval(() => {
    if (window.gameStarted && window.playerName) {
        clearInterval(startGameInterval);
        initGame();
    }
}, 100);

function initGame() {
    const name = window.playerName;
    const color = window.playerColor || '#00AA00';

    // Создаем View с полноэкранным canvas
    view = new View(root);

    // Отправляем данные игрока на сервер
    socket.emit('new player', { name, color });

    console.log('Game started with name:', name, 'and color:', color);

    // playSound('/static/sounds/start.mp3');
}

// Получаем ID игрока
socket.on('player id', function (id) {
    myPlayerId = id;
    console.log('My player ID:', myPlayerId);
});

// Оптимизированная обработка ввода с батчингом
document.addEventListener('keydown', function (event) {
    if (!view) return; // Игра еще не началась

    if (keyStates[event.keyCode]) return;
    keyStates[event.keyCode] = true;

    const now = Date.now();
    const canSendInput = now - lastInputTime >= INPUT_THROTTLE;

    // Проверяем, не взрывается ли игрок
    if (lastState && lastState.players && lastState.players[myPlayerId]) {
        const myPlayer = lastState.players[myPlayerId];
        if (myPlayer.exploding && now < myPlayer.explosionEndTime) {
            return; // Блокируем ввод во время взрыва
        }
    }

    switch (event.keyCode) {
        case 37: // Left arrow
        case 65:  // A
            if (canSendInput) {
                queueInput('movePieceRight');
                lastInputTime = now;
            }
            break;
        case 38: // Up arrow
        case 87:  // W
            if (canSendInput) {
                queueInput('movePieceTop');
                lastInputTime = now;
            }
            break;
        case 39: // Right arrow
        case 68:  // D
            if (canSendInput) {
                queueInput('movePieceLeft');
                lastInputTime = now;
            }
            break;
        case 40: // Down arrow
        case 83:  // S
            if (canSendInput) {
                queueInput('movePieceBottom');
                lastInputTime = now;
            }
            break;
        case 32: // Space
            event.preventDefault();
            
            // Проверяем кулдаун после респавна
            if (lastState && lastState.players && lastState.players[myPlayerId]) {
                const myPlayer = lastState.players[myPlayerId];
                if (now < myPlayer.respawnShootingCooldown) {
                    return; // Блокируем стрельбу в течение 2 секунд после респавна
                }
            }
            
            // playSound('/static/sounds/shot.mp3');
            socket.emit('moveShot'); // Выстрелы отправляем сразу
            break;
    }
});

// Очередь ввода для батчинга
function queueInput(inputType) {
    const now = Date.now();
    
    // Удаляем старые вводы того же типа
    inputQueue = inputQueue.filter(input => input.type !== inputType);
    
    // Добавляем новый ввод
    inputQueue.push({
        type: inputType,
        timestamp: now
    });
    
    // Отправляем батч если прошло достаточно времени
    if (now - lastInputSent > 50) {
        sendInputBatch();
    }
}

// Отправка батча ввода
function sendInputBatch() {
    if (inputQueue.length === 0) return;
    
    const now = Date.now();
    lastInputSent = now;
    
    // Отправляем только последний ввод каждого типа
    const latestInputs = {};
    for (const input of inputQueue) {
        latestInputs[input.type] = input;
    }
    
    // Отправляем вводы
    for (const input of Object.values(latestInputs)) {
        socket.emit(input.type);
    }
    
    inputQueue = [];
}

document.addEventListener('keyup', function (event) {
    keyStates[event.keyCode] = false;
});

// Оптимизированное воспроизведение звука
const audioCache = {};
function playSound(url) {
    try {
        if (!audioCache[url]) {
            audioCache[url] = new Audio(url);
        }

        const audio = audioCache[url].cloneNode();
        audio.volume = 0.5;
        audio.play().catch(err => console.log('Audio play failed:', err));
    } catch (err) {
        console.log('Audio error:', err);
    }
}

// Автоматический перезапуск при смерти
socket.on('user dead', function (index) {
    if (index === myPlayerId) {
        setTimeout(() => {
            socket.emit('restart');
        }, 2000);
    }
});

socket.on('user dead sound', function () {
    // playSound('/static/sounds/dead.mp3');
});

// Обработка взрывов
socket.on('explosion', function (data) {
    console.log('Bullet collision at:', data);
});

socket.on('collision explosion', function (data) {
    console.log('Player collision at:', data);
    // playSound('/static/sounds/dead.mp3');
});

// Цикл отрисовки
let lastState = null;

function renderLoop() {
    if (lastState && view) {
        view.render(lastState, myPlayerId);
    }
    requestAnimationFrame(renderLoop);
}
renderLoop();

// Периодическая отправка батча ввода
setInterval(() => {
    if (inputQueue.length > 0) {
        sendInputBatch();
    }
}, 50);

socket.on('state', function (data) {
    lastState = data;
});

// Обработка переподключения
socket.on('reconnect', function () {
    console.log('Reconnected to server');
    location.reload();
});

socket.on('connect_error', function (error) {
    console.log('Connection error:', error);
});

// Debug mode
if (window.location.search.includes('debug')) {
    let fps = 0;
    let lastTime = Date.now();
    let frames = 0;

    setInterval(() => {
        const now = Date.now();
        fps = Math.round(frames * 1000 / (now - lastTime));
        frames = 0;
        lastTime = now;

        const debugDiv = document.getElementById('debug') || (() => {
            const div = document.createElement('div');
            div.id = 'debug';
            div.style.cssText = 'position:fixed;top:10px;left:10px;color:white;background:rgba(0,0,0,0.7);padding:10px;font-family:monospace;z-index:1000;';
            document.body.appendChild(div);
            return div;
        })();

        debugDiv.innerHTML = `FPS: ${fps}<br>Players: ${lastState ? Object.keys(lastState.players).length : 0}<br>Ping: ${socket.io.engine ? socket.io.engine.ping : 0}ms`;
    }, 1000);

    if (view) {
        const originalRender = view.render.bind(view);
        view.render = function (...args) {
            frames++;
            return originalRender(...args);
        };
    }
}