import type {
  ArenaLayout,
  ChatMessage,
  CreateRoomPayload,
  GameMode,
  GameStateSnapshot,
  JoinRoomPayload,
  NewPlayerPayload,
  PowerUpState,
  PowerUpType,
  RoomActionResult,
  RoomPlayerInfo,
  RoomSummary,
  UpdateRoomSettingsPayload,
} from './types.js';

export interface ClientToServerEvents {
  'new player': (data: NewPlayerPayload) => void;
  movePieceTop: () => void;
  movePieceBottom: () => void;
  movePieceLeft: () => void;
  movePieceRight: () => void;
  moveShot: () => void;
  switchWeapon: () => void;
  restart: () => void;

  'lobby:subscribe': () => void;
  'lobby:unsubscribe': () => void;
  'lobby:create': (data: CreateRoomPayload, ack: (result: RoomActionResult) => void) => void;
  'lobby:join': (data: JoinRoomPayload, ack: (result: RoomActionResult) => void) => void;
  'room:kick': (data: { roomId: string; targetSocketId: string }) => void;
  'room:leave': () => void;
  'room:updateSettings': (
    data: UpdateRoomSettingsPayload,
    ack: (result: RoomActionResult) => void,
  ) => void;

  'chat:send': (text: string) => void;
}

export interface ServerToClientEvents {
  'player id': (id: string) => void;
  'game mode': (data: { mode: GameMode; wave: number }) => void;
  arena: (layout: ArenaLayout) => void;
  state: (data: GameStateSnapshot) => void;
  'user dead': (id: string) => void;
  'user dead sound': () => void;
  // Sent only to the victim's own socket, right as the kill lands — powers
  // the client's brief kill-cam. `null` for a non-attributable death (e.g.
  // a mutual tank-vs-tank collision).
  'killed by': (killerId: string | null) => void;
  'powerup:spawned': (powerUp: PowerUpState) => void;
  'powerup:collected': (data: { id: string; type: PowerUpType; playerId: string }) => void;
  explosion: (data: { x: number; y: number }) => void;
  'collision explosion': (data: { x: number; y: number }) => void;
  'brick destroyed': (data: { x: number; y: number }) => void;
  'base hit': (data: { health: number }) => void;
  'wave complete': (data: { wave: number }) => void;
  'game over': (data: { reason: string; wave: number; kills: number }) => void;

  'lobby:rooms': (rooms: RoomSummary[]) => void;
  'room:players': (players: RoomPlayerInfo[]) => void;
  'room:kicked': () => void;
  'room:restarted': (room: RoomSummary) => void;

  'chat:message': (message: ChatMessage) => void;
  'chat:history': (messages: ChatMessage[]) => void;
}
