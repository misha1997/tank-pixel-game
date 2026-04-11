// Game state variables
const players = {};
const playField = [];
const bulletIntervals = {};
const botIntervals = {};
const botMemory = {};

// Game mode
let gameMode = 'pvp';
let gameState = 'waiting';

// Coop mode state
const bricks = [];
const base = { x: 24, y: 26, type: 'base', health: 1 };
let coopWave = 1;
let enemiesToSpawn = 0;
let enemiesKilled = 0;
let totalEnemiesInWave = 0;
let waveSpawnInterval = null;
let coopBotCount = 0;

// Bullet pool optimization
const bulletPool = [];
const activeBullets = new Map();
let bulletIdCounter = 0;
let lastGameUpdate = 0;

// Walls
const walls = [];

module.exports = {
  players,
  playField,
  bulletIntervals,
  botIntervals,
  botMemory,
  gameMode,
  gameState,
  bricks,
  base,
  coopWave,
  enemiesToSpawn,
  enemiesKilled,
  totalEnemiesInWave,
  waveSpawnInterval,
  coopBotCount,
  bulletPool,
  activeBullets,
  bulletIdCounter,
  lastGameUpdate,
  walls,
};
