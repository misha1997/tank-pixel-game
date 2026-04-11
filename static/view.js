export default class View {
    constructor(element) {
        this.element = element;
        
        // Создаем canvas на весь экран
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
        
        // Устанавливаем размер
        this.resize();
        
        // Слушаем изменение размера окна
        window.addEventListener('resize', () => this.resize());

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
            invulnerable: 'rgba(255, 215, 0)',
        };

        // Кеш для оптимизации рендеринга (только фон)

        // Создаем статичный фоновый canvas
        this.backgroundCanvas = document.createElement('canvas');
        this.backgroundContext = this.backgroundCanvas.getContext('2d');
        this.updateBackground();

        this.element.appendChild(this.canvas);

        // Предзагружаем шрифт
        this.context.font = '22px DS-Digital-Italic';
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        if (this.backgroundCanvas) {
            this.updateBackground();
        }
    }

    updateBackground() {
        this.backgroundCanvas.width = this.width;
        this.backgroundCanvas.height = this.height;
        this.drawBackground();
    }

    drawBackground() {
        // Рисуем статичный фон один раз
        this.backgroundContext.fillStyle = this.colors.background;
        this.backgroundContext.fillRect(0, 0, this.width, this.height);

        // Рисуем пустые ячейки (сетку)
        for (let y = 0; y < 30; y++) {
            for (let x = 0; x < 50; x++) {
                this.renderEmptyCell(x, y, this.backgroundContext);
            }
        }
    }

    renderEmptyCell(x, y, ctx) {
        const xPos = x * this.cellSize;
        const yPos = y * this.cellSize;

        // Внешний прямоугольник (рамка)
        ctx.fillStyle = this.colors.empty;
        ctx.fillRect(xPos, yPos, this.cellSize - 2, this.cellSize - 2);

        // Внутренняя область
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(
            xPos + this.cellPadding,
            yPos + this.cellPadding,
            this.cellSize - 2 * this.cellPadding - 2,
            this.cellSize - 2 * this.cellPadding - 2
        );

        // Внутренний квадрат
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

        // Рисуем стены
        this.renderWalls(data.walls);

        // Рисуем кирпичи (в кооп-режиме)
        if (data.bricks) {
            this.renderBricks(data.bricks);
        }

        // Рисуем базу (в кооп-режиме)
        if (data.base) {
            this.renderBase(data.base);
        }

        // Рисуем игровое поле с учетом неуязвимости
        this.renderPlayField(data.playField, data.players);

        // Рисуем UI
        this.renderPlayers(data.players, myPlayerId, data);
    }


    renderWalls(walls) {
        if (!walls) return;

        // Цвет стен
        this.context.fillStyle = '#654321'; // Коричневый цвет для стен

        // Рисуем каждую стену
        for (const wall of walls) {
            this.renderWallCell(wall.x, wall.y);
        }
    }

    renderWallCell(x, y) {
        const xPos = x * this.cellSize;
        const yPos = y * this.cellSize;

        // Внешний прямоугольник (темная рамка)
        this.context.fillStyle = '#4a2c17';
        this.context.fillRect(xPos, yPos, this.cellSize - 2, this.cellSize - 2);

        // Внутренняя область (основной цвет стены)
        this.context.fillStyle = '#654321';
        this.context.fillRect(
            xPos + this.cellPadding,
            yPos + this.cellPadding,
            this.cellSize - 2 * this.cellPadding - 2,
            this.cellSize - 2 * this.cellPadding - 2
        );

        // Внутренний квадрат (светлый акцент)
        this.context.fillStyle = '#8b4513';
        this.context.fillRect(
            xPos + this.innerCellOffset,
            yPos + this.innerCellOffset,
            this.innerCellSize,
            this.innerCellSize
        );
    }

    renderBricks(bricks) {
        if (!bricks) return;

        for (const brick of bricks) {
            if (brick.health > 0) {
                this.renderBrickCell(brick.x, brick.y);
            }
        }
    }

    renderBrickCell(x, y) {
        const xPos = x * this.cellSize;
        const yPos = y * this.cellSize;

        // Кирпичный цвет (красно-коричневый)
        this.context.fillStyle = '#cc6633';
        this.context.fillRect(xPos, yPos, this.cellSize - 2, this.cellSize - 2);

        // Текстура кирпича (более темные линии)
        this.context.fillStyle = '#aa4422';
        this.context.fillRect(
            xPos + 2,
            yPos + 2,
            this.cellSize - 6,
            this.cellSize - 6
        );

        // "Раствор" между кирпичами
        this.context.fillStyle = '#cc6633';
        this.context.fillRect(
            xPos + this.cellSize / 2 - 1,
            yPos + 4,
            2,
            this.cellSize - 10
        );
        this.context.fillRect(
            xPos + 4,
            yPos + this.cellSize / 2 - 1,
            this.cellSize - 10,
            2
        );
    }

    renderBase(base) {
        if (!base || base.health <= 0) return;

        const baseX = base.x * this.cellSize;
        const baseY = base.y * this.cellSize;
        const baseSize = this.cellSize * 3;

        // Фон базы (белый с серой рамкой)
        this.context.fillStyle = '#666666';
        this.context.fillRect(baseX, baseY, baseSize - 2, baseSize - 2);

        this.context.fillStyle = '#ffffff';
        this.context.fillRect(
            baseX + 4,
            baseY + 4,
            baseSize - 10,
            baseSize - 10
        );

        // Символ орла (E)
        this.context.fillStyle = '#c20000';
        this.context.font = `${this.cellSize}px DS-Digital-Italic`;
        this.context.fillText('E',
            baseX + this.cellSize / 2,
            baseY + this.cellSize * 2
        );
    }

    renderPlayField(playField, players) {
        const now = Date.now();

        // Рисуем только заполненные ячейки поверх фона
        for (let y = 0; y < playField.length; y++) {
            for (let x = 0; x < playField[y].length; x++) {
                if (playField[y][x] === 1) {
                    // Находим игрока, которому принадлежит эта ячейка
                    let isInvulnerable = false;
                    let playerColor = null;
                    
                    for (const playerId in players) {
                        const player = players[playerId];
                        if (player && player.status) {
                            // Проверяем, находится ли ячейка в области игрока
                            if (x >= player.x && x < player.x + 3 && 
                                y >= player.y && y < player.y + 3) {
                                playerColor = player.color;
                                
                                // Проверяем неуязвимость
                                if (player.invulnerableUntil && now < player.invulnerableUntil) {
                                    isInvulnerable = true;
                                }
                                break;
                            }
                        }
                    }
                    
                    this.renderFilledCell(x, y, isInvulnerable, now, playerColor);
                }
            }
        }
    }

    renderFilledCell(x, y, isInvulnerable = false, now = Date.now(), playerColor = null) {
        const xPos = x * this.cellSize;
        const yPos = y * this.cellSize;

        // Определяем цвет ячейки
        let fillStyle = playerColor || this.colors.filled;
        
        // Мерцание для неуязвимых (каждые 200ms)
        if (isInvulnerable && Math.floor(now / 200) % 2 === 0) {
            fillStyle = this.colors.invulnerable;
        }

        // Внешний прямоугольник
        this.context.fillStyle = fillStyle;
        this.context.fillRect(xPos, yPos, this.cellSize - 2, this.cellSize - 2);

        // Внутренняя область
        this.context.fillStyle = this.colors.background;
        this.context.fillRect(
            xPos + this.cellPadding,
            yPos + this.cellPadding,
            this.cellSize - 2 * this.cellPadding - 2,
            this.cellSize - 2 * this.cellPadding - 2
        );

        // Внутренний квадрат
        this.context.fillStyle = fillStyle;
        this.context.fillRect(
            xPos + this.innerCellOffset,
            yPos + this.innerCellOffset,
            this.innerCellSize,
            this.innerCellSize
        );
    }

    renderPlayers(players, myPlayerId, data) {
        // Рассчитываем позицию UI панели (справа)
        const uiWidth = 300;
        const uiX = this.width - uiWidth;

        // Очищаем область UI
        this.context.fillStyle = 'rgba(154, 166, 128, 0.95)';
        this.context.fillRect(uiX, 0, uiWidth, this.height);

        // Рамка UI
        this.context.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        this.context.lineWidth = 2;
        this.context.strokeRect(uiX, 0, uiWidth, this.height);

        this.context.font = '22px DS-Digital-Italic';
        this.context.fillStyle = this.colors.empty;

        // Режим кооператива - показываем инфо о волне
        if (data && data.gameMode === 'coop') {
            this.context.fillStyle = '#c20000';
            this.context.fillText('CO-OP DEFENSE', uiX + 10, 25);

            this.context.fillStyle = this.colors.filled;
            this.context.font = '18px DS-Digital-Italic';
            this.context.fillText(`WAVE: ${data.wave || 1}`, uiX + 10, 50);
            this.context.fillText(`ENEMIES: ${data.enemiesRemaining || 0}`, uiX + 10, 70);
            this.context.fillText(`KILLED: ${data.enemiesKilled || 0}`, uiX + 10, 90);

            if (data.base) {
                const baseHealth = data.base.health > 0 ? 'OK' : 'DESTROYED';
                const baseColor = data.base.health > 0 ? '#00AA00' : '#ff0000';
                this.context.fillStyle = baseColor;
                this.context.fillText(`BASE: ${baseHealth}`, uiX + 10, 115);
            }

            // Состояние игры
            if (data.gameState === 'defeat') {
                this.context.fillStyle = '#ff0000';
                this.context.font = '24px DS-Digital-Italic';
                this.context.fillText('GAME OVER', uiX + 10, 150);
            } else if (data.gameState === 'victory') {
                this.context.fillStyle = '#00AA00';
                this.context.font = '24px DS-Digital-Italic';
                this.context.fillText('VICTORY!', uiX + 10, 150);
            }

            // Список игроков (кооп)
            this.context.fillStyle = this.colors.filled;
            this.context.font = '18px DS-Digital-Italic';
            let playerY = 180;
            for (const playerId in players) {
                const player = players[playerId];
                if (player.isBot) continue;

                const isMe = playerId === myPlayerId;
                const prefix = isMe ? '► ' : '';
                const lives = '♥'.repeat(player.lives || 1);
                this.context.fillText(`${prefix}${player.name}: ${lives}`, uiX + 10, playerY);
                playerY += 22;
            }

            return;
        }

        // PvP режим - обычный UI
        this.context.fillStyle = this.colors.filled;
        let countPlayers = 0;
        let playerPosition = 30;
        const playersArray = Object.entries(players);

        // Сортируем игроков по рейтингу
        playersArray.sort((a, b) => b[1].rating - a[1].rating);

        // Отрисовка списка игроков
        for (let i = 0; i < playersArray.length; i++) {
            const [playerId, player] = playersArray[i];
            countPlayers++;
            playerPosition += 25;

            const isMe = playerId === myPlayerId;
            const isBot = player.isBot;
            const isDead = !player.status;

            // Выбираем цвет
            let color = player.color || this.colors.filled;
            if (isDead) {
                color = '#888888'; // Серый для мертвых
            }

            this.context.fillStyle = color;

            // Индикаторы
            const prefix = isMe ? '► ' : isBot ? '[B] ' : '';
            const status = isDead ? ' [DEAD]' : '';
            const text = `${i + 1}: ${prefix}${player.name} - ${player.rating}${status}`;

            this.context.fillText(text, uiX + 10, playerPosition);
        }

        // Заголовок
        this.context.fillStyle = this.colors.filled;
        this.context.fillText('Players: ' + countPlayers, uiX + 10, 20);

        // Мини-карта (если игроков больше 2)
        if (countPlayers > 2) {
            this.renderMiniMap(players, myPlayerId, uiX);
        }
    }

    renderMiniMap(players, myPlayerId, uiX) {
        const miniMapX = uiX + 20;
        const miniMapY = Math.min(this.height - 220, 400);
        const miniMapHeight = 250;
        const miniMapWidth = 150;
        const scale = miniMapHeight / 50;

        // Фон мини-карты
        this.context.fillStyle = 'rgba(0, 0, 0, 0.15)';
        this.context.fillRect(miniMapX, miniMapY, miniMapHeight, miniMapWidth);

        // Рамка
        this.context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        this.context.lineWidth = 2;
        this.context.strokeRect(miniMapX, miniMapY, miniMapHeight, miniMapWidth);

        // Отображение игроков
        for (const playerId in players) {
            const player = players[playerId];
            if (!player.status) continue;

            const isMe = playerId === myPlayerId;
            const x = miniMapX + player.x * scale;
            const y = miniMapY + player.y * scale;

            // Цвет точки
            this.context.fillStyle = player.color || (isMe ? '#00AA00' : player.isBot ? '#FF4444' : '#4ECDC4');
            this.context.beginPath();
            this.context.arc(x + scale, y + scale, isMe ? 5 : 3, 0, Math.PI * 2);
            this.context.fill();

            // Направление взгляда
            let dirX = 0, dirY = 0;
            switch (player.position) {
                case 'top': dirY = -8; break;
                case 'bottom': dirY = 8; break;
                case 'left': dirX = 8; break;
                case 'right': dirX = -8; break;
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
        this.context.font = '18px DS-Digital-Italic';
        this.context.fillText('Mini Map', miniMapX, miniMapY - 10);
        this.context.font = '22px DS-Digital-Italic';
    }
}