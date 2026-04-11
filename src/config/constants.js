// Game constants
const BULLET_SPEED = 100;
const BOT_UPDATE_INTERVAL = 400;
const GAME_UPDATE_INTERVAL = 100;
const BULLET_COOLDOWN = 200;
const BOT_SHOOT_DISTANCE = 15;
const INVULNERABILITY_TIME = 2000;

// Performance optimization
const MAX_PLAYERS = 20;
const COLLISION_CHECK_DISTANCE = 5;
const BULLET_POOL_SIZE = 100;

// Game field size
const size = {
  col: 50,
  row: 30,
};

// Tank piece positions (3x3 grid representations)
const positionPiece = {
  top: [[0, 1, 0], [1, 1, 1], [1, 0, 1]],
  bottom: [[1, 0, 1], [1, 1, 1], [0, 1, 0]],
  left: [[1, 1, 0], [0, 1, 1], [1, 1, 0]],
  right: [[0, 1, 1], [1, 1, 0], [0, 1, 1]],
  boomOne: [[1, 0, 1], [0, 1, 0], [1, 0, 1]],
  boomTwo: [[0, 1, 0], [1, 0, 1], [0, 1, 0]],
};

// Bullet directions
// position 'left' = tank looks RIGHT (gun on right), shoots right
// position 'right' = tank looks LEFT (gun on left), shoots left
const bulletDirections = {
  top: { dir: 'up', dx: 0, dy: -1, offsetX: 1, offsetY: 0 },
  bottom: { dir: 'down', dx: 0, dy: 1, offsetX: 1, offsetY: 2 },
  left: { dir: 'right', dx: 1, dy: 0, offsetX: 3, offsetY: 1 },
  right: { dir: 'left', dx: -1, dy: 0, offsetX: 0, offsetY: 1 },
};

// Coop mode constants
const MAX_COOP_BOTS = 4;
const BASE_HEALTH = 1;

module.exports = {
  BULLET_SPEED,
  BOT_UPDATE_INTERVAL,
  GAME_UPDATE_INTERVAL,
  BULLET_COOLDOWN,
  BOT_SHOOT_DISTANCE,
  INVULNERABILITY_TIME,
  MAX_PLAYERS,
  COLLISION_CHECK_DISTANCE,
  BULLET_POOL_SIZE,
  size,
  positionPiece,
  bulletDirections,
  MAX_COOP_BOTS,
  BASE_HEALTH,
};
