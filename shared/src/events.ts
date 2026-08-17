import type { GameMode, GameStateSnapshot, NewPlayerPayload } from './types.js';

export interface ClientToServerEvents {
  'new player': (data: NewPlayerPayload) => void;
  movePieceTop: () => void;
  movePieceBottom: () => void;
  movePieceLeft: () => void;
  movePieceRight: () => void;
  moveShot: () => void;
  restart: () => void;
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
}
