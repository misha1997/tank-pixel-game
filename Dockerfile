# Fallback deployment image: builds the whole npm-workspaces monorepo
# (shared -> server -> client) and serves it as one Node process.
# Normal deployment is docker-less (see README) — this is only for
# `docker compose up` as a self-contained alternative.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app .

EXPOSE 5000
CMD ["sh", "-c", "npm run db:migrate:deploy && npm start"]
