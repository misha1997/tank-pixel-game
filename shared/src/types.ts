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
  rapidFireUntil?: number;
  weapon?: WeaponType;
  health?: number;
  lives?: number;
  rating?: number;
  userId?: string;
}

// 'cannon' is the default single-shot primary weapon; 'spread' fires 3
// parallel bullets per shot at a higher cooldown (see
// SPREAD_COOLDOWN_MULTIPLIER) — a wide-but-slower trade-off, not a strict
// upgrade.
export type WeaponType = 'cannon' | 'spread';

export type PowerUpType = 'shield' | 'rapidFire';

export interface PowerUpState {
  id: string;
  type: PowerUpType;
  x: number;
  y: number;
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

// Per-player data as streamed in every state snapshot — a trimmed projection
// of the server's internal PlayerState. Fields the client never reads for
// rendering or input prediction (bullets, lastShot, health, rating, userId)
// are deliberately left out of the wire format; they still live on the
// server-side state object.
export interface PlayerSnapshot {
  name: string;
  color: string;
  status: boolean;
  isBot: boolean;
  isCoopEnemy?: boolean;
  x: number;
  y: number;
  position: TankAnimState;
  score: number;
  invulnerableUntil: number;
  exploding: boolean;
  explosionEndTime: number;
  respawnShootingCooldown: number;
  rapidFireUntil?: number;
  weapon?: WeaponType;
  lives?: number;
}

// Static match layout: sent once when a socket joins a room and again whenever
// the host restarts with a new map — never per-tick. Bricks list the cells
// that are currently alive at send time; subsequent destructions arrive via
// the existing 'brick destroyed' event, which clients apply to this array.
export interface ArenaLayout {
  walls: WallState[];
  bricks: BrickState[];
}

// Dynamic per-tick state. Tank and bullet visuals are derived from players +
// bulletCells instead of streaming a full arena matrix: the client stamps each
// player's 3x3 piece locally (first player in key order owns a contested cell,
// mirroring the old server-side stamping) and paints bulletCells last so
// bullets win the cell they occupy — same final pixels as the old playField.
export interface GameStateSnapshot {
  players: Record<string, PlayerSnapshot>;
  bulletCells: MapCell[];
  gameMode: GameMode;
  gameState: MatchState;
  base?: BaseState;
  wave?: number;
  enemiesRemaining?: number;
  enemiesKilled?: number;
}

export interface NewPlayerPayload {
  name: string;
  color: string;
  roomId: string;
  // No rating/userId here on purpose — identity and rating are derived
  // server-side from the session cookie, never trusted from the client
  // (see getSessionUserIdFromSocket in server/src/auth/session.ts).
}

export interface AuthUser {
  id: string;
  username: string;
  rating: number;
  // Not assigned by the server yet — ranks are a future stage. Once real
  // rank data exists, the in-battle rank card (client/src/hud.ts) starts
  // showing automatically; until then it stays hidden.
  rank?: string;
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
  mapId: string;
  botDifficulty: BotDifficulty;
  botFillTarget: number;
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

export type RoomActionResult =
  { ok: true; room: RoomSummary; isHost: boolean } | { ok: false; error: string };

export interface UpdateRoomSettingsPayload {
  mapId?: string;
  botDifficulty?: BotDifficulty;
  botFillTarget?: number;
}

export interface MapCell {
  x: number;
  y: number;
}

// Cells are placed within the shared arena grid (shared/src/constants.ts
// `size`), but a map's own layout can occupy any sub-region of it — coop
// (server/src/rooms/MapGenerator.ts computeMapBounds) derives that region's
// bounding box from these cells to keep respawns/enemy spawns on the map
// instead of scattered across the full grid.
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
  data: MapDefinition;
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

export interface LeaderboardEntry {
  id: string;
  username: string;
  rating: number;
}

export interface MatchHistoryEntry {
  matchId: string;
  mode: GameMode;
  mapName: string;
  durationSec: number;
  createdAt: string;
  score: number;
  ratingBefore: number;
  ratingAfter: number;
  won: boolean;
}
