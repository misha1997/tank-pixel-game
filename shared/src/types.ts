export type TankFacing = 'top' | 'bottom' | 'left' | 'right';
export type TankAnimState = TankFacing | 'boomOne' | 'boomTwo';

export type GameMode = 'pvp' | 'coop';
export type MatchState = 'waiting' | 'playing' | 'defeat' | 'victory';

export interface BulletState {
  id: string | null;
  position: TankAnimState | null;
  x: number;
  y: number;
  direction: string | null;
  dx: number;
  dy: number;
  ownerId: string | null;
  active: boolean;
}

export interface PlayerState {
  name: string;
  color: string;
  status: boolean;
  isBot: boolean;
  isCoopEnemy?: boolean;
  x: number;
  y: number;
  position: TankAnimState;
  bullets: Record<string, BulletState>;
  score: number;
  lastShot: number;
  invulnerableUntil: number;
  exploding: boolean;
  explosionEndTime: number;
  respawnShootingCooldown: number;
  health?: number;
  lives?: number;
  rating?: number;
}

export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'adaptive';

export interface WallState {
  x: number;
  y: number;
  type: 'wall';
}

export interface BrickState {
  x: number;
  y: number;
  type: 'brick';
  health: number;
}

export interface BaseState {
  x: number;
  y: number;
  type: 'base';
  health: number;
}

export interface GameStateSnapshot {
  playField: number[][];
  players: Record<string, PlayerState>;
  walls: WallState[];
  gameMode: GameMode;
  gameState: MatchState;
  bricks?: BrickState[];
  base?: BaseState;
  wave?: number;
  enemiesRemaining?: number;
  enemiesKilled?: number;
}

export interface NewPlayerPayload {
  name: string;
  color: string;
  roomId: string;
  rating?: number;
}

export interface AuthUser {
  id: string;
  username: string;
  rating: number;
}

export type RoomVisibility = 'public' | 'private';
export type RoomStatus = 'waiting' | 'playing';

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  mode: GameMode;
  visibility: RoomVisibility;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
}

export interface RoomPlayerInfo {
  socketId: string;
  name: string;
  isHost: boolean;
}

export interface CreateRoomPayload {
  name: string;
  mode: GameMode;
  visibility: RoomVisibility;
  mapId?: string;
  botDifficulty?: BotDifficulty;
  botFillTarget?: number;
}

export interface JoinRoomPayload {
  code: string;
}

export type RoomActionResult = { ok: true; room: RoomSummary } | { ok: false; error: string };

export interface MapCell {
  x: number;
  y: number;
}

// Grid is always the standard 50x30 arena (shared/src/constants.ts `size`) —
// variable map sizes are a Stage 8 (fullscreen scaling) concern, not this one.
export interface MapDefinition {
  walls: MapCell[];
  bricks: MapCell[];
  base?: MapCell;
  enemySpawnPoints?: MapCell[];
}

export interface MapSummary {
  id: string;
  name: string;
  mode: GameMode;
  visibility: RoomVisibility;
  isBuiltin: boolean;
  ownerName: string | null;
}

export interface MapListResponse {
  builtin: MapSummary[];
  public: MapSummary[];
  mine: MapSummary[];
}

export interface SaveMapPayload {
  name: string;
  mode: GameMode;
  visibility: RoomVisibility;
  data: MapDefinition;
}

export interface ChatMessage {
  id: string;
  authorName: string | null;
  text: string;
  timestamp: number;
  system?: boolean;
}
