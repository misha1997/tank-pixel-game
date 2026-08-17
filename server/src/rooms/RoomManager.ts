import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'socket.io';
import type { BotDifficulty, ClientToServerEvents, GameMode, RoomVisibility, ServerToClientEvents } from '@tank/shared';
import { GameRoom } from './GameRoom.js';
import { resolveMapDefinition } from '../maps/resolve.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to read aloud
export const LOBBY_WATCHERS_ROOM = 'lobby-watchers';

export class RoomManager {
  private readonly roomsById = new Map<string, GameRoom>();
  private readonly roomsByCode = new Map<string, GameRoom>();

  constructor(private readonly io: TypedServer) {}

  async createRoom(options: {
    name: string;
    mode: GameMode;
    visibility: RoomVisibility;
    hostSocketId: string | null;
    isDefault?: boolean;
    mapId?: string;
    botDifficulty?: BotDifficulty;
    botFillTarget?: number;
  }): Promise<GameRoom> {
    const map = await resolveMapDefinition(options.mode, options.mapId);

    const room = new GameRoom(
      {
        id: uuidv4(),
        code: this.generateCode(),
        name: options.name,
        mode: options.mode,
        visibility: options.visibility,
        hostSocketId: options.hostSocketId,
        isDefault: options.isDefault ?? false,
        map,
        botDifficulty: options.botDifficulty,
        botFillTarget: options.botFillTarget,
      },
      this.io,
    );

    this.roomsById.set(room.id, room);
    this.roomsByCode.set(room.code, room);
    this.broadcastLobby();
    return room;
  }

  get(id: string): GameRoom | undefined {
    return this.roomsById.get(id);
  }

  getByCode(code: string): GameRoom | undefined {
    return this.roomsByCode.get(code.toUpperCase());
  }

  listPublic() {
    return [...this.roomsById.values()]
      .filter((room) => room.visibility === 'public')
      .map((room) => room.toSummary());
  }

  removeIfEmptyAndDestroyable(room: GameRoom): void {
    if (room.isDefault || !room.isEmpty()) return;

    room.destroy();
    this.roomsById.delete(room.id);
    this.roomsByCode.delete(room.code);
    this.broadcastLobby();
  }

  broadcastLobby(): void {
    this.io.to(LOBBY_WATCHERS_ROOM).emit('lobby:rooms', this.listPublic());
  }

  broadcastRoster(room: GameRoom): void {
    this.io.to(room.id).emit('room:players', room.roster());
  }

  private generateCode(): string {
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.roomsByCode.has(code));
    return code;
  }
}
