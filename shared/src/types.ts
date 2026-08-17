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
  rating: number;
  lastShot: number;
  invulnerableUntil: number;
  exploding: boolean;
  explosionEndTime: number;
  respawnShootingCooldown: number;
  health?: number;
  lives?: number;
}

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
  mode: GameMode;
}
