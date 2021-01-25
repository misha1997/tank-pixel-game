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

app.get('/', function(request, response) {
  response.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(5000, function() {
  console.log('Starting server on port 5000');
});

var players = {};

var size = {
  col: 25,
  row: 25
};

var positionPiece = {
  top: [
      [0, 1, 0], 
      [1, 1, 1], 
      [1, 0, 1]
  ],
  bottom: [
      [1, 0, 1], 
      [1, 1, 1], 
      [0, 1, 0]
  ],
  left: [
      [1, 1, 0], 
      [0, 1, 1], 
      [1, 1, 0]
  ],
  right: [
      [0, 1, 1], 
      [1, 1, 0], 
      [0, 1, 1]
  ],
  boomOne: [
      [1, 0, 1], 
      [0, 1, 0], 
      [1, 0, 1]
  ],
  boomTwo: [
      [0, 1, 0], 
      [1, 0, 1], 
      [0, 1, 0]
  ]
}

var playField = [];

function generatePlayField() {
  for (let row = 0; row < size.row; row++) {
    playField[row] = [];
    for (let col = 0; col < size.col; col++) {
        playField[row][col] = 0;
    }
  }
}

function randomInteger() {
  let rand = 0 + Math.random() * (22 + 1 - 0);
  return Math.floor(rand);
}

io.on('connection', function(socket) {
  socket.on('new player', function(name) {
    var positions = ['top', 'left', 'right', 'bottom']; 
    players[socket.id] = {
      name,
      status: true,
      x: randomInteger(),
      y: randomInteger(),
      position: positions[(Math.random() * 4) | 0],
      bullets: [],
      rating: 0
    };
  });

  socket.on('movePieceRight', function() {
    if(players[socket.id].status) {
      players[socket.id].position = 'right';
      players[socket.id].x -= 1;
      if(isPieceOutOfBounds(players[socket.id])) {
        players[socket.id].x += 1;
      }
    }
  });

  socket.on('movePieceLeft', function() {
    if(players[socket.id].status) {
      players[socket.id].position = 'left';
      players[socket.id].x += 1;
      if(isPieceOutOfBounds(players[socket.id])) {
        players[socket.id].x -= 1;
      }
    }
  });

  socket.on('movePieceTop', function() {
    if(players[socket.id].status) {
      players[socket.id].position = 'top';
      players[socket.id].y -= 1;
      if(isPieceOutOfBounds(players[socket.id])) {
        players[socket.id].y += 1;
      }
    }
  });

  socket.on('movePieceBottom', function() {
    if(players[socket.id]) {
      players[socket.id].position = 'bottom';
      players[socket.id].y += 1;
      if(isPieceOutOfBounds(players[socket.id])) {
        players[socket.id].y -= 1;
      }
    }
  });

  socket.on('moveShot', function() {
    if(players[socket.id] && players[socket.id].status) {
      if(players[socket.id].position == 'top') {
        var id = uuidv4();
        var bull = {
          position: players[socket.id].position,
            x: players[socket.id].x + 1,
            y: players[socket.id].y - 1
        };

        players[socket.id].bullets[id] = bull;

        var interval = setInterval(() => {
          if(!players[socket.id]) {
            clearInterval(interval);
            return;
          }
          players[socket.id].bullets[id].y -= 1;
          if(isBulletOutOfBounds(players[socket.id].bullets[id], socket.id)) {
            delete players[socket.id].bullets[id];
            clearInterval(interval);
          }
        }, 100);
      }
      if(players[socket.id].position == 'bottom') {
        var id = uuidv4();
        var bull = {
          position: players[socket.id].position,
            x: players[socket.id].x + 1,
            y: players[socket.id].y + 3
        };

        players[socket.id].bullets[id] = bull;

        var interval = setInterval(() => {
          if(!players[socket.id]) {
            clearInterval(interval);
            return;
          }
          players[socket.id].bullets[id].y += 1;
          if(isBulletOutOfBounds(players[socket.id].bullets[id], socket.id)) {
            delete players[socket.id].bullets[id];
            clearInterval(interval);
          }
        }, 100);
      }
      if(players[socket.id].position == 'right') {
        var id = uuidv4();
        var bull = {
          position: players[socket.id].position,
            x: players[socket.id].x,
            y: players[socket.id].y + 1
        };

        players[socket.id].bullets[id] = bull;

        var interval = setInterval(() => {
          if(!players[socket.id]) {
            clearInterval(interval);
            return;
          }
          players[socket.id].bullets[id].x -= 1;
          if(isBulletOutOfBounds(players[socket.id].bullets[id], socket.id)) {
            delete players[socket.id].bullets[id];
            clearInterval(interval);
          }
        }, 100);
      }
      if(players[socket.id].position == 'left') {
        var id = uuidv4();
        var bull = {
          position: players[socket.id].position,
            x: players[socket.id].x + 3,
            y: players[socket.id].y + 1
        };

        players[socket.id].bullets[id] = bull;

        var interval = setInterval(() => {
          if(!players[socket.id]) {
            clearInterval(interval);
            return;
          }
          players[socket.id].bullets[id].x += 1;
          if(isBulletOutOfBounds(players[socket.id].bullets[id], socket.id)) {
            delete players[socket.id].bullets[id];
            clearInterval(interval);
          }
        }, 100);
      }
    }
  });

  socket.on('restart', function(index) {
    var positions = ['top', 'left', 'right', 'bottom']; 
    players[index].status = true;
    players[index].x = randomInteger();
    players[index].y = randomInteger();
    players[index].rating = 0;
    players[index].position = positions[(Math.random() * 4) | 0];
  });

  socket.on('disconnect', function() {
    delete players[socket.id];
  });

});

function isPieceOutOfBounds(player) {
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (
          playField[player.x + x] === undefined || 
          playField[player.y + y] === undefined || 
          playField[player.y + y][player.x + x] === undefined
        ) {
        return true;
      }
    }
  }
  return false;
}

function isBulletOutOfBounds(bullet, userId) {
  if(playField[bullet.y] === undefined || playField[bullet.x] === undefined || playField[bullet.y][bullet.x] === undefined) {
      return true;
  }
  for(var index in players) {
      if(index != userId) {
          for (let x = 0; x < 3; x++) {
              for (let y = 0; y < 3; y++) {
                  if (
                    (players[index].x + x) == bullet.x && 
                    (players[index].y + y) == bullet.y && 
                    players[index].status && 
                    players[index].position != 'boomOne' && 
                    players[index].position != 'boomTwo' &&
                    players[userId].position != 'boomOne' && 
                    players[userId].position != 'boomTwo'
                  ) {
                    players[userId].rating++;
                    boomAnimate(index);
                    return true;
                  }
              }
          }
      }
  }
  return false;
}

function boomAnimate(index) {
  io.sockets.emit('user dead sound');
  if(players[index].status === true) {
    setTimeout((() => {
      players[index].position = 'boomOne';
    }), 0);
    setTimeout((() => {
      players[index].position = 'boomTwo';
    }), 200);
    setTimeout((() => {
      players[index].position = 'boomOne';
    }), 400);
    setTimeout((() => {
      players[index].status = false;
      io.sockets.emit('user dead', index);
    }), 600);
  }

}

setInterval(() => {
  generatePlayField();
  for(var index in players) {
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
          if(players[index] && positionPiece[players[index].position][y][x] && players[index].status) {
              playField[players[index].y + y][players[index].x + x] = 1;
          }
      }
    }
    for(var indexB in players[index].bullets) {
      if(players[index] && players[index].bullets[indexB]) {
        playField[players[index].bullets[indexB].y][players[index].bullets[indexB].x] = 1;
      }
    }
  }
  io.sockets.emit('state', {
    playField,
    players
  });
}, 100);