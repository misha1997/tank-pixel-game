export default class View {
    constructor(element, width, height) {
        this.element = element;
        this.width = width;
        this.height = height;

        // Создаем canvas для игрового поля
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.context = this.canvas.getContext('2d');

        // Кешируем размеры ячеек
        this.cellSize = 22;
        this.cellPadding = 2;
        this.innerCellSize = 12;
        this.innerCellOffset = 4;

        // Кеш для цветов
        this.colors = {
            filled: 'rgba(0, 0, 0)',
            empty: 'rgba(0, 0, 0, 0.2)',
            background: '#9aa680',
        };

        // Кеш для состояния - хранит сериализованную версию поля
        this.lastPlayFieldStr = '';
        this.lastPlayersCount = 0;

        // Создаем статичный фоновый canvas (рисуем только раз)
        this.backgroundCanvas = document.createElement('canvas');
        this.backgroundCanvas.width = this.width;
        this.backgroundCanvas.height = this.height;
        this.backgroundContext = this.backgroundCanvas.getContext('2d');
        this.drawBackground();

        this.element.appendChild(this.canvas);

        // Предзагружаем шрифт
        this.context.font = '22px DS-Digital-Italic';
    }

    drawBackground() {
        // Рисуем статичный фон один раз
        this.backgroundContext.fillStyle = this.colors.background;
        this.backgroundContext.fillRect(0, 0, this.width, this.height);

        // Рисуем пустые ячейки (сетку)
        for (let y = 0; y < 25; y++) {
            for (let x = 0; x < 25; x++) {
                this.renderEmptyCell(x, y, this.backgroundContext);
            }
        }
    }

    renderEmptyCell(x, y, ctx) {
        const xPos = x * this.cellSize;
        const yPos = y * this.cellSize;

        // Внешний прямоугольник (рамка) - полупрозрачный
        ctx.fillStyle = this.colors.empty;
        ctx.fillRect(xPos, yPos, this.cellSize - 2, this.cellSize - 2);

        // Внутренняя область - заливаем фоном вместо clearRect
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(
            xPos + this.cellPadding,
            yPos + this.cellPadding,
            this.cellSize - 2 * this.cellPadding - 2,
            this.cellSize - 2 * this.cellPadding - 2
        );

        // Внутренний квадрат - полупрозрачный
        ctx.fillStyle = this.colors.empty;
        ctx.fillRect(
            xPos + this.innerCellOffset,
            yPos + this.innerCellOffset,
            this.innerCellSize,
            this.innerCellSize
        );
    }

    render(data, myPlayerId) {
        // Копируем фон на основной canvas
        this.context.drawImage(this.backgroundCanvas, 0, 0);

        // Рисуем игровое поле (заполненные ячейки)
        this.renderPlayField(data.playField);

        // Рисуем UI
        this.renderPlayers(data.players, myPlayerId);
    }

    renderPlayField(playField) {
        // Рисуем только заполненные ячейки поверх фона
        for (let y = 0; y < playField.length; y++) {
            for (let x = 0; x < playField[y].length; x++) {
                if (playField[y][x] === 1) {
                    this.renderFilledCell(x, y);
                }
            }
        }
    }

    renderFilledCell(x, y) {
        const xPos = x * this.cellSize;
        const yPos = y * this.cellSize;

        // Внешний прямоугольник (рамка) - полностью черный
        this.context.fillStyle = this.colors.filled;
        this.context.fillRect(xPos, yPos, this.cellSize - 2, this.cellSize - 2);

        // Внутренняя область - заливаем фоном вместо clearRect
        this.context.fillStyle = this.colors.background;
        this.context.fillRect(
            xPos + this.cellPadding,
            yPos + this.cellPadding,
            this.cellSize - 2 * this.cellPadding - 2,
            this.cellSize - 2 * this.cellPadding - 2
        );

        // Внутренний квадрат - полностью черный
        this.context.fillStyle = this.colors.filled;
        this.context.fillRect(
            xPos + this.innerCellOffset,
            yPos + this.innerCellOffset,
            this.innerCellSize,
            this.innerCellSize
        );
    }

    renderPlayers(players, myPlayerId) {
        // Очищаем область UI (правую панель)
        this.context.fillStyle = this.colors.background;
        this.context.fillRect(550, 0, this.width - 550, this.height);

        this.context.font = '22px DS-Digital-Italic';
        this.context.fillStyle = this.colors.empty;

        let countPlayers = 0;
        let playerPosition = 30;
        const playersArray = Object.entries(players);

        // Сортируем игроков по рейтингу
        playersArray.sort((a, b) => b[1].rating - a[1].rating);

        // Отрисовка списка игроков с цветовой индикацией
        for (let i = 0; i < playersArray.length; i++) {
            const [playerId, player] = playersArray[i];
            countPlayers++;
            playerPosition += 25;

            // Выделяем текущего игрока
            const isMe = playerId === myPlayerId;
            const isBot = player.isBot;
            const isDead = !player.status;

            // Выбираем цвет для игрока
            let color = this.colors.filled;
            if (isMe) {
                color = '#00AA00'; // Зеленый для текущего игрока
            } else if (isDead) {
                color = '#888888'; // Серый для мертвых
            } else if (isBot) {
                color = '#FF4444'; // Красный для ботов
            }

            this.context.fillStyle = color;

            // Добавляем индикаторы
            const prefix = isMe ? '► ' : isBot ? '[B] ' : '';
            const status = isDead ? ' [DEAD]' : '';
            const text = `${i + 1}: ${prefix}${player.name} - ${player.rating}${status}`;

            this.context.fillText(text, 560, playerPosition);
        }

        // Заголовок
        this.context.fillStyle = this.colors.filled;
        this.context.fillText('Players: ' + countPlayers, 560, 20);

        // Мини-карта (опционально, для больших игр)
        if (countPlayers > 2) {
            this.renderMiniMap(players, myPlayerId);
        }
    }

    renderMiniMap(players, myPlayerId) {
        const miniMapX = 560;
        const miniMapY = 350;
        const miniMapSize = 150;
        const scale = miniMapSize / 25; // 25 - размер поля

        // Фон мини-карты
        this.context.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.context.fillRect(miniMapX, miniMapY, miniMapSize, miniMapSize);

        // Рамка
        this.context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        this.context.strokeRect(miniMapX, miniMapY, miniMapSize, miniMapSize);

        // Отображение игроков на мини-карте
        for (const playerId in players) {
            const player = players[playerId];
            if (!player.status) continue;

            const isMe = playerId === myPlayerId;
            const x = miniMapX + player.x * scale;
            const y = miniMapY + player.y * scale;

            this.context.fillStyle = isMe ? '#00AA00' : player.isBot ? '#FF4444' : '#4ECDC4';
            this.context.beginPath();
            this.context.arc(x + scale, y + scale, isMe ? 4 : 3, 0, Math.PI * 2);
            this.context.fill();

            // Направление взгляда
            let dirX = 0, dirY = 0;
            switch (player.position) {
                case 'top': dirY = -6; break;
                case 'bottom': dirY = 6; break;
                case 'left': dirX = 6; break;
                case 'right': dirX = -6; break;
            }

            if (dirX || dirY) {
                this.context.strokeStyle = this.context.fillStyle;
                this.context.lineWidth = 2;
                this.context.beginPath();
                this.context.moveTo(x + scale, y + scale);
                this.context.lineTo(x + scale + dirX, y + scale + dirY);
                this.context.stroke();
            }
        }

        // Заголовок мини-карты
        this.context.fillStyle = this.colors.filled;
        this.context.font = '16px DS-Digital-Italic';
        this.context.fillText('Mini Map', miniMapX, miniMapY - 5);
        this.context.font = '22px DS-Digital-Italic'; // Восстанавливаем шрифт
    }
}