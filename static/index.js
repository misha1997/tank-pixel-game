import View from './view.js';

const root = document.querySelector('#root');

const view = new View(root, 850, 550);

var socket = io();

let name = prompt('Enter your name', '');

if(name) {
    socket.emit('new player', name);
    const manual = document.querySelector('.manual');
    manual.style.display = "block";
} else {
    alert('Name is required');
    location.reload();
}

window.view = view;

var click = false;

document.addEventListener('keydown', function(event) {
    if(!click) {
        switch(event.keyCode) {
            case 37:
            case 65:
                socket.emit('movePieceRight');
                break;
            case 38:
            case 87:
                socket.emit('movePieceTop');
                break;
            case 39:
            case 68:
                socket.emit('movePieceLeft');
                break;
            case 40:
            case 83:
                    socket.emit('movePieceBottom');
                break;
            case 32:
                var audio = new Audio('/static/sounds/mr_9999_06.wav');
                audio.play();
                socket.emit('moveShot');
                break;
        }
        click = true;
    }
});

document.addEventListener('keyup', function(event) {
    click = false;
});

socket.on('user dead', function(index) {
    socket.emit('restart', index);
});

socket.on('user dead sound', function() {
    var audio = new Audio('/static/sounds/mr_9999_09.wav');
    audio.play();
});

socket.on('state', function(data) {
    view.render(data);
});