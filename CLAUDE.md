# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multiplayer pixel tank battle game using Socket.io for real-time communication. The game features a 50x30 grid-based arena where players control tanks, shoot at each other, and compete for points. The game includes AI bots with sophisticated behavior including dodging, hunting, and collision avoidance.

## Commands

```bash
# Start the production server (port 5000)
npm start

# Development with auto-restart on changes
npm run dev

# PM2 process management (if using PM2)
npm run pm2:logs    # View game logs
npm run pm2:monit   # Open PM2 monitoring dashboard
```

## Architecture

### Server (server.js)
- **Express server** serves static files and the main HTML page
- **Socket.io** handles real-time bidirectional communication
- **Game loop** runs at 100ms intervals via `setInterval(updateGameState, GAME_UPDATE_INTERVAL)`
- **Game state** consists of:
  - `players` object: stores all player/bot data (position, color, rating, invulnerability timers)
  - `playField` 2D array: 50x30 grid representing the game world
  - `walls` array: static collision objects
  - `activeBullets` Map: bullet pool for performance optimization

### Client (static/index.js + static/view.js)
- **index.js**: Socket.io client, input handling (WASD/arrow keys + space to shoot), game state reception
- **view.js**: HTML5 Canvas rendering with a two-layer system:
  - Static background canvas (grid) rendered once
  - Dynamic foreground canvas for players, bullets, and UI
  - Right-side panel shows player leaderboard and mini-map

### Key Game Mechanics

**Tank Movement**: 3x3 pixel grid representations defined in `positionPiece` (top/bottom/left/right orientations)

**Bullets**: 
- Pool-based allocation for performance (`bulletPool`, `activeBullets`)
- Speed: 100ms interval updates
- Cooldown: 200ms between shots
- Despawn on wall hit, player hit, or out of bounds

**Combat System**:
- 2-second invulnerability period after spawn (`INVULNERABILITY_TIME`)
- 2-second shooting cooldown after respawn (`respawnShootingCooldown`)
- Collision between tanks causes mutual explosion
- Death animation cycles through `boomOne`/`boomTwo` frames over 600ms
- Rating (score) increments on successful hit

**AI Bots** (`addBot()` function creates 3 bots at startup):
- State stored in `botMemory` with position history, danger zones, aggression level
- Behavior cycle: dodge bullets → hunt targets → patrol
- Bullet evasion uses trajectory prediction (`isHeadingTowards`, `calculateBestEvasion`)
- Collision avoidance with `isSafeFromCollisions` checks
- 3-second respawn delay with memory reset

**Wall System**: Static barriers defined in `generateWalls()` that block both player movement and bullets

### Socket Events

**Client → Server**:
- `new player`: Join with name and color
- `movePieceTop/Left/Right/Bottom`: Directional movement
- `moveShot`: Fire bullet
- `restart`: Respawn after death

**Server → Client**:
- `player id`: Assign socket ID to player
- `state`: Full game state broadcast (100ms interval)
- `user dead`: Player died notification
- `user dead sound`: Trigger death sound
- `collision explosion`: Mutual tank collision event
- `explosion`: Bullet collision event

### Input Throttling
- Input throttled to 100ms (`INPUT_THROTTLE` in index.js)
- Movement batched and sent every 50ms
- Shooting sent immediately (separate from movement batching)

### File Structure
```
├── server.js              # Main server + game logic
├── index.html             # Entry point with menu overlay
├── package.json           # Dependencies: express, socket.io, uuid
├── static/
│   ├── index.js           # Client game logic (module)
│   ├── view.js            # Canvas rendering class
│   ├── style.css          # Game UI styles
│   ├── sounds/            # Game audio files
│   └── font/              # Custom pixel font
```

### Performance Optimizations
- Bullet pooling to reduce GC pressure
- Background canvas caching for static grid
- Distance-based collision checks (early exit if > 5 cells apart)
- Bot AI memory updates throttled to 300ms
- Input batching to reduce network traffic
