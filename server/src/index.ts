import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import type { ClientToServerEvents, GameMode, ServerToClientEvents } from '@tank/shared';
import { authRouter } from './auth/router.js';
import { RoomManager } from './rooms/RoomManager.js';
import type { GameRoom } from './rooms/GameRoom.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server);

const port = Number(process.env.PORT) || 5000;
app.set('port', port);

app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

app.get('/', (_request, response) => {
  response.sendFile(path.join(clientDist, 'index.html'));
});

server.listen(port, () => {
  console.log(`Starting server on port ${port}`);
});

// Stage 3 (lobby) replaces this with user-created rooms; for now every
// player is routed into one of two always-on default rooms by game mode,
// which is enough to prove the rooms can run fully independently.
const roomManager = new RoomManager(io);
const defaultRooms: Record<GameMode, GameRoom> = {
  pvp: roomManager.createRoom('pvp'),
  coop: roomManager.createRoom('coop'),
};

const socketRooms = new Map<string, GameRoom>();

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('new player', ({ name, color, mode }) => {
    console.log('New player:', name, 'Color:', color, 'Mode:', mode);

    const room = defaultRooms[mode];
    socketRooms.set(socket.id, room);
    socket.join(room.id);
    room.addPlayer(socket.id, name, color);

    socket.emit('player id', socket.id);
    socket.emit('game mode', { mode: room.mode, wave: room.state.coopWave });

    console.log('Room', room.mode, 'players:', room.playerCount());
  });

  socket.on('movePieceRight', () => socketRooms.get(socket.id)?.move(socket.id, 1, 0, 'left'));
  socket.on('movePieceLeft', () => socketRooms.get(socket.id)?.move(socket.id, -1, 0, 'right'));
  socket.on('movePieceTop', () => socketRooms.get(socket.id)?.move(socket.id, 0, -1, 'top'));
  socket.on('movePieceBottom', () => socketRooms.get(socket.id)?.move(socket.id, 0, 1, 'bottom'));

  socket.on('moveShot', () => {
    socketRooms.get(socket.id)?.shoot(socket.id);
  });

  socket.on('restart', () => {
    socketRooms.get(socket.id)?.restart(socket.id);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);

    const room = socketRooms.get(socket.id);
    if (room) {
      room.removePlayer(socket.id);
      socketRooms.delete(socket.id);
      console.log('Room', room.mode, 'players:', room.playerCount());
    }
  });
});
