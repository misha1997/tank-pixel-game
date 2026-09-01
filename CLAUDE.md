# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multiplayer pixel tank battle game using Socket.io for real-time communication. The game features a 50x30 grid-based arena where players control tanks, shoot at each other, and compete for points. The game includes AI bots with sophisticated behavior including dodging, hunting, and collision avoidance.

The project is being rebuilt in stages from a single-process prototype into a full online game (lobby, rooms, accounts/rating, custom maps, in-battle chat, progressive AI). The staged roadmap lives at `.claude/plans` history / was agreed with the user; check recent git history and commit messages for which stage is currently in progress.

## Workspace layout (npm workspaces monorepo)

```
/shared     @tank/shared  — TS types shared by server & client (game state, socket events, constants)
/server     @tank/server  — Express + Socket.io, TypeScript, Prisma (PostgreSQL)
/client     @tank/client  — Vite + TypeScript, canvas rendering, same pixel-art look as the original
```

`shared` must be built (`npm run build -w shared`) before `server`/`client` can resolve `@tank/shared` — its package.json `main`/`types` point at `shared/dist`. The root `npm run dev` script does this automatically before starting both dev servers.

## Commands

```bash
# Install all workspace dependencies (run once, or after adding deps)
npm install

# Dev: builds shared, then runs server (tsx watch, port 5000) and client (vite, port 5173) concurrently
npm run dev

# Production build (shared -> server -> client)
npm run build
npm start          # node server/dist/index.js, serves client/dist as static files

# Local MySQL for Prisma (server/prisma/schema.prisma) — no Docker;
# install MySQL 8+ yourself and create the `tank` database/user (see README).
# `docker compose up -d` builds/runs the whole stack in containers instead,
# as a fallback deployment option (root Dockerfile + docker-compose.yml).
cd server && npx prisma migrate dev
```

In dev, the client runs on Vite's dev server (5173) which proxies `/socket.io` to the server (5000) — see `client/vite.config.ts`. In production the server serves the built client from `client/dist`.

## Architecture

### Server (`server/src`)
- `index.ts` — Express + Socket.io bootstrap, game loop (`setInterval(updateGameState, GAME_UPDATE_INTERVAL)`), socket event wiring
- `config/state.ts` — currently a **global singleton** game state object (players, playField, walls, bullets, bot memory). This is intentional for now: it is a 1:1 port of the original state module. It becomes per-room state (`GameRoom` class, many instances) once the multi-room architecture stage lands — do not build new features assuming there's only ever one game in the process.
- `game/` — `map.ts` (wall/brick layout generation), `bullet.ts` (bullet pool, collision, hit detection), `player.ts` (movement, tank-vs-tank collision, respawn), `coop.ts` (wave spawning, victory/defeat)
- `ai/bot.ts` — shared AI primitives (dodge, hunt, pathing, line-of-sight) used by both PvP and co-op bots
- `bots/pvpBots.ts` — simpler bot loop used to fill PvP matches
- `prisma/schema.prisma` — Postgres schema; empty until accounts/maps/match-history land

### Client (`client/src`)
- `main.ts` — socket.io-client connection, keyboard input (WASD/arrows + space), render loop
- `menu.ts` — pre-game name/color/mode menu (`#menu-overlay` in `index.html`), calls back into `main.ts` to start the game
- `view.ts` — `View` class, HTML5 Canvas rendering with a two-layer system: static background canvas (grid) drawn once, dynamic foreground canvas for players/bullets/UI, right-side panel with leaderboard and mini-map
- `style.css` — original pixel/DS-Digital-Italic look, adapted fullscreen
- `public/` — static assets served as-is (favicon, font, sounds)

### Shared (`shared/src`)
- `types.ts` — `PlayerState`, `BulletState`, `WallState`, `BrickState`, `BaseState`, `GameStateSnapshot`, etc.
- `constants.ts` — grid size, `positionPiece` (3x3 tank sprites per facing), `bulletDirections`, timing constants
- `events.ts` — `ClientToServerEvents` / `ServerToClientEvents` typed Socket.io event maps

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
- Rating (score) increments on successful hit — currently an ephemeral per-match counter; persistent account rating lands with the accounts stage

**AI Bots**:
- PvP (`addBot()` in `bots/pvpBots.ts`): simple hunt + shoot loop, 3 bots at startup
- Co-op (`coopEnemyAI()` in `ai/bot.ts`): dodge → attack player → attack base → destroy obstacles → patrol priority chain, with per-bot memory (`botMemory`) for position history, stuck detection, and attack-position distribution across bots
- Bullet evasion uses trajectory prediction (`isHeadingTowards`, `wouldBeHit`)

**Wall System**: Static barriers defined in `game/map.ts` that block both player movement and bullets; bricks (co-op only) are destructible

### Socket Events (see `shared/src/events.ts` for exact types)

**Client → Server**: `new player`, `movePieceTop/Left/Right/Bottom`, `moveShot`, `restart`

**Server → Client**: `player id`, `game mode`, `state` (100ms interval), `user dead`, `user dead sound`, `collision explosion`, `explosion`, `brick destroyed`, `base hit`, `wave complete`, `game over`

### Input Throttling
- Input throttled to 100ms (`INPUT_THROTTLE` in `client/src/main.ts`)
- Movement batched and sent every 50ms
- Shooting sent immediately (separate from movement batching)

### Performance Optimizations
- Bullet pooling to reduce GC pressure
- Background canvas caching for static grid
- Distance-based collision checks (early exit if > `COLLISION_CHECK_DISTANCE` cells apart)
- Bot AI memory updates throttled
- Input batching to reduce network traffic
