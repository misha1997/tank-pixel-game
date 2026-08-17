import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, GameMode, ServerToClientEvents } from '@tank/shared';
import { GameRoom } from './GameRoom.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();

  constructor(private readonly io: TypedServer) {}

  createRoom(mode: GameMode): GameRoom {
    const room = new GameRoom(uuidv4(), mode, this.io);
    this.rooms.set(room.id, room);
    return room;
  }

  get(id: string): GameRoom | undefined {
    return this.rooms.get(id);
  }
}
