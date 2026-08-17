# Tank Battle

A multiplayer pixel tank battle game (Socket.io + Canvas), in the style of Brick Game Tank 9999-in-1.
Lobby of rooms, public/private rooms with join codes/links, an in-browser map editor, progressive AI bots,
in-battle chat, and a rating/leaderboard system.

[![](http://misha97.ho.ua/game.png)](http://misha97.ho.ua/game.png)

## Project layout

npm workspaces monorepo — see `CLAUDE.md` for the full architecture writeup.

```
/shared     Types shared by server and client (game state, socket events, constants)
/server     Express + Socket.io + Prisma (PostgreSQL), TypeScript
/client     Vite + TypeScript client, canvas rendering
```

## Development

```bash
git clone https://github.com/misha1997/tank-pixel-game.git
cd tank-pixel-game
npm install

# Local Postgres for accounts/maps/ratings
docker compose up -d
cp server/.env.example server/.env   # then set a real SESSION_SECRET
cd server && npx prisma migrate dev && cd ..

npm run dev
```

Open http://localhost:5173 — the client dev server proxies API/socket requests to the backend on port 5000.
Open it in a few browser windows/tabs to try multiplayer.

## Production

```bash
npm run build              # builds shared, server, client
npm run db:migrate:deploy  # applies pending Prisma migrations
npm start                  # node server/dist/index.js — serves the built client too
```

Or via PM2 (`ecosystem.config.cjs`):

```bash
npm run deploy    # build + migrate + pm2 startOrReload
npm run pm2:logs
npm run pm2:monit
```

`server/.env` (`DATABASE_URL`, `SESSION_SECRET`, `PORT`) must exist before starting in either mode.

---

If you want to help develop this game, let's do it! Email mishaotroshenko2013@gmail.com.
