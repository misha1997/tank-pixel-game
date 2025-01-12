export default class View {
    constructor(element, width, height) {
        this.element = element;
        this.width = width;
        this.height = height;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.context = this.canvas.getContext('2d');

        this.element.appendChild(this.canvas);
    }

    render(playField) {
        this.clearScreen();
        this.renderPlayField(playField);
    }

    clearScreen() {
        this.context.clearRect(0, 0, this.width, this.height);
    }

    renderPlayField(data) {
        // Рендеринг игрового поля
        for (let y = 0; y < data.playField.length; y++) {
            for (let x = 0; x < data.playField[y].length; x++) {
                this.context.fillStyle = data.playField[y][x] ? 'rgba(0, 0, 0)' : 'rgba(0, 0, 0, 0.2)';
                this.context.fillRect(x * 22, y * 22, 20, 20);
                this.context.clearRect((x * 22) + 2, (y * 22) + 2, 16, 16);
                this.context.fillRect((x * 22) + 4, (y * 22) + 4, 12, 12);
            }
        }

        // Рендеринг игроков
        this.renderPlayers(data.players);
    }

    renderPlayers(players) {
        this.context.font = '22px DS-Digital-Italic';
        this.context.fillStyle = 'rgba(0, 0, 0)';
        let countPlayers = 0;
        let playerPosition = 30;

        for (let index in players) {
            countPlayers++;
            playerPosition += 25;
            this.context.fillText(countPlayers + ": " + players[index].name + " - " + players[index].rating, 560, playerPosition);
        }

        this.context.fillText('Players: ' + countPlayers, 560, 20);
    }
}