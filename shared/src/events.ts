import type {
  CreateRoomPayload,
  GameMode,
  GameStateSnapshot,
  JoinRoomPayload,
  NewPlayerPayload,
  RoomActionResult,
  RoomPlayerInfo,
  RoomSummary,
} from './types.js';

export interface ClientToServerEvents {
  'new player': (data: NewPlayerPayload) => void;
  movePieceTop: () => void;
  movePieceBottom: () => void;
  movePieceLeft: () => void;
  movePieceRight: () => void;
  moveShot: () => void;
  restart: () => void;

  'lobby:subscribe': () => void;
  'lobby:unsubscribe': () => void;
  'lobby:create': (data: CreateRoomPayload, ack: (result: RoomActionResult) => void) => void;
  'lobby:join': (data: JoinRoomPayload, ack: (result: RoomActionResult) => void) => void;
  'room:kick': (data: { roomId: string; targetSocketId: string }) => void;
}

export interface ServerToClientEvents {
  'player id': (id: string) => void;
  'game mode': (data: { mode: GameMode; wave: number }) => void;
  state: (data: GameStateSnapshot) => void;
  'user dead': (id: string) => void;
  'user dead sound': () => void;
  explosion: (data: { x: number; y: number }) => void;
  'collision explosion': (data: { x: number; y: number }) => void;
  'brick destroyed': (data: { x: number; y: number }) => void;
  'base hit': (data: { health: number }) => void;
  'wave complete': (data: { wave: number }) => void;
  'game over': (data: { reason: string; wave: number; kills: number }) => void;

  'lobby:rooms': (rooms: RoomSummary[]) => void;
  'room:players': (players: RoomPlayerInfo[]) => void;
  'room:kicked': () => void;
}
