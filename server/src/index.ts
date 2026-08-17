import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@tank/shared';
import { authRouter } from './auth/router.js';
import { mapsRouter } from './maps/router.js';
import { matchesRouter } from './matches/router.js';
import { RoomManager, LOBBY_WATCHERS_ROOM } from './rooms/RoomManager.js';
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
app.use('/api/maps', mapsRouter);
app.use('/api/matches', matchesRouter);

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// SPA fallback so deep links like /room/ABC123 serve the client shell.
app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_request, response) => {
  response.sendFile(path.join(clientDist, 'index.html'));
});

server.listen(port, () => {
  console.log(`Starting server on port ${port}`);
});

const roomManager = new RoomManager(io);

// Always-on public rooms so there is always something to jump into
// immediately, on top of whatever players create themselves.
await roomManager.createRoom({ name: 'Quick Play: PvP Arena', mode: 'pvp', visibility: 'public', hostSocketId: null, isDefault: true });
await roomManager.createRoom({ name: 'Quick Play: Co-op Defense', mode: 'coop', visibility: 'public', hostSocketId: null, isDefault: true });

const socketRooms = new Map<string, GameRoom>();

function leaveCurrentRoom(socketId: string): void {
  const room = socketRooms.get(socketId);
  if (!room) return;

  const leavingName = room.state.players[socketId]?.name;
  room.removePlayer(socketId);
  socketRooms.delete(socketId);
  if (leavingName) room.broadcastSystemMessage(`${leavingName} left the battle`);
  roomManager.broadcastRoster(room);
  roomManager.broadcastLobby();
  roomManager.removeIfEmptyAndDestroyable(room);
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('lobby:subscribe', () => {
    socket.join(LOBBY_WATCHERS_ROOM);
    socket.emit('lobby:rooms', roomManager.listPublic());
  });

  socket.on('lobby:unsubscribe', () => {
    socket.leave(LOBBY_WATCHERS_ROOM);
  });

  socket.on('lobby:create', async ({ name, mode, visibility, mapId, botDifficulty, botFillTarget }, ack) => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) {
      ack({ ok: false, error: 'Room name is required.' });
      return;
    }

    const room = await roomManager.createRoom({
      name: trimmed,
      mode,
      visibility,
      hostSocketId: socket.id,
      mapId,
      botDifficulty,
      botFillTarget,
    });
    ack({ ok: true, room: room.toSummary() });
  });

  socket.on('lobby:join', ({ code }, ack) => {
    const room = roomManager.getByCode(code.trim());
    if (!room) {
      ack({ ok: false, error: 'No room found with that code.' });
      return;
    }
    ack({ ok: true, room: room.toSummary() });
  });

  socket.on('room:kick', ({ roomId, targetSocketId }) => {
    const room = roomManager.get(roomId);
    if (!room || !room.kick(socket.id, targetSocketId)) return;

    socketRooms.delete(targetSocketId);
    io.sockets.sockets.get(targetSocketId)?.leave(room.id);
    roomManager.broadcastRoster(room);
    roomManager.broadcastLobby();
  });

  socket.on('new player', ({ name, color, roomId, rating, userId }) => {
    const room = roomManager.get(roomId);
    if (!room) return;

    console.log('New player:', name, 'Color:', color, 'Room:', room.name);

    socket.leave(LOBBY_WATCHERS_ROOM);
    socketRooms.set(socket.id, room);
    socket.join(room.id);
    room.addPlayer(socket.id, name, color, rating, userId);

    socket.emit('player id', socket.id);
    socket.emit('game mode', { mode: room.mode, wave: room.state.coopWave });
    socket.emit('chat:history', room.getChatHistory());

    roomManager.broadcastRoster(room);
    roomManager.broadcastLobby();

    console.log('Room', room.name, 'players:', room.playerCount());
  });

  socket.on('chat:send', (text) => {
    socketRooms.get(socket.id)?.sendChat(socket.id, text);
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

  socket.on('room:leave', () => {
    leaveCurrentRoom(socket.id);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    leaveCurrentRoom(socket.id);
  });
});
