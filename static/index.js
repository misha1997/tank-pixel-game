import View from './view.js';

const root = document.querySelector('#root');
const view = new View(root, 850, 550);

const socket = io();

let name = prompt('Enter your name', '');
let myPlayerId = null;
let keyStates = {}; // Отслеживание состояния клавиш
let lastInputTime = 0;
const INPUT_THROTTLE = 50; // Минимальный интервал между отправкой команд

if (name) {
    socket.emit('new player', name);
    const manual = document.querySelector('.manual');
    if (manual) {
        manual.style.display = "block";
    }
} else {
    alert('Name is required');
    location.reload();
}

window.view = view;

// Получаем ID игрока
socket.on('player id', function (id) {
    myPlayerId = id;
});

// Оптимизированная обработка ввода с предотвращением спама
document.addEventListener('keydown', function (event) {
    // Предотвращаем повторную отправку при удержании клавиши
    if (keyStates[event.keyCode]) return;
    keyStates[event.keyCode] = true;

    const now = Date.now();
    const canSendInput = now - lastInputTime >= INPUT_THROTTLE;

    switch (event.keyCode) {
        case 37: // Left arrow
        case 65:  // A
            if (canSendInput) {
                socket.emit('movePieceRight');
                lastInputTime = now;
            }
            break;
        case 38: // Up arrow
        case 87:  // W
            if (canSendInput) {
                socket.emit('movePieceTop');
                lastInputTime = now;
            }
            break;
        case 39: // Right arrow
        case 68:  // D
            if (canSendInput) {
                socket.emit('movePieceLeft');
                lastInputTime = now;
            }
            break;
        case 40: // Down arrow
        case 83:  // S
            if (canSendInput) {
                socket.emit('movePieceBottom');
                lastInputTime = now;
            }
            break;
        case 32: // Space
            event.preventDefault(); // Предотвращаем прокрутку страницы
            playSound('/static/sounds/mr_9999_06.wav');
            socket.emit('moveShot');
            break;
    }
});

// Отслеживание отпускания клавиш
document.addEventListener('keyup', function (event) {
    keyStates[event.keyCode] = false;
});

// Оптимизированное воспроизведение звука с переиспользованием объектов
const audioCache = {};
function playSound(url) {
    try {
        if (!audioCache[url]) {
            audioCache[url] = new Audio(url);
        }

        const audio = audioCache[url].cloneNode();
        audio.volume = 0.5; // Уменьшаем громкость
        audio.play().catch(err => console.log('Audio play failed:', err));
    } catch (err) {
        console.log('Audio error:', err);
    }
}

// Автоматический перезапуск при смерти
socket.on('user dead', function (index) {
    if (index === myPlayerId) {
        // Перезапускаемся через небольшую задержку
        setTimeout(() => {
            socket.emit('restart');
        }, 2000);
    }
});

socket.on('user dead sound', function () {
    playSound('/static/sounds/mr_9999_09.wav');
});

// Обработка взрывов пуль (если добавлена соответствующая логика)
socket.on('explosion', function (data) {
    // Можно добавить визуальный эффект взрыва
    console.log('Bullet collision at:', data);
});

// Оптимизированная отрисовка с использованием requestAnimationFrame
let lastState = null;

// Запускаем постоянный цикл отрисовки
function renderLoop() {
    if (lastState) {
        view.render(lastState, myPlayerId);
    }
    requestAnimationFrame(renderLoop);
}
renderLoop();

// Просто обновляем данные без прямого вызова render
socket.on('state', function (data) {
    lastState = data;
});

// Обработка переподключения
socket.on('reconnect', function () {
    console.log('Reconnected to server');
    location.reload(); // Перезагружаем страницу при переподключении
});

socket.on('connect_error', function (error) {
    console.log('Connection error:', error);
});

// Показываем FPS для отладки (опционально)
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

        debugDiv.innerHTML = `FPS: ${fps}<br>Players: ${lastState ? Object.keys(lastState.players).length : 0}<br>Ping: ${socket.io.engine.ping || 0}ms`;
    }, 1000);

    // Считаем кадры
    const originalRender = view.render.bind(view);
    view.render = function (...args) {
        frames++;
        return originalRender(...args);
    };
}