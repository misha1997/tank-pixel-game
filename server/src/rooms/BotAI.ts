import { BULLET_COOLDOWN, bulletDirections, size } from '@tank/shared';
import type { BulletState, PlayerState, TankFacing } from '@tank/shared';
import type { RoomState, BotMemory } from './state.js';
import type { BulletManager } from './BulletManager.js';

interface Move {
  dx: number;
  dy: number;
  pos: TankFacing;
}

interface AttackPosition {
  canShoot: boolean;
  position?: TankFacing;
  targetX?: number;
  targetY?: number;
  targetDir?: TankFacing;
}

// Canonical dx/dy -> facing mapping, verified against the human input handlers
// in index.ts (movePieceRight sends dx:1, pos:'left', etc). The tank facing
// names are gun-relative, not screen-relative, which is why "left" means
// "moving/looking right" — see bulletDirections' comment in shared/constants.
const CANONICAL_MOVES: Move[] = [
  { dx: 0, dy: -1, pos: 'top' },
  { dx: 0, dy: 1, pos: 'bottom' },
  { dx: -1, dy: 0, pos: 'right' },
  { dx: 1, dy: 0, pos: 'left' },
];

export class BotAI {
  constructor(
    private readonly state: RoomState,
    private readonly bullets: BulletManager,
  ) {}

  // Coop enemy AI
  coopEnemyAI(botId: string): void {
    const { state } = this;
    const bot = state.players[botId];
    const memory = state.botMemory[botId];
    if (!bot || !bot.status || !memory) return;

    const now = Date.now();
    // status stays true for the full boomAnimate() duration (only flips to
    // false once the animation ends) — without this the bot keeps dodging,
    // shooting, and moving while its own death animation is still playing.
    if (bot.exploding && now < bot.explosionEndTime) return;

    if (!memory.positions) memory.positions = [];
    if (now - (memory.lastPosUpdate || 0) > 500) {
      memory.positions.push({ x: bot.x, y: bot.y, time: now });
      if (memory.positions.length > 5) memory.positions.shift();
      memory.lastPosUpdate = now;
    }

    if (this.isStuck(memory)) {
      memory.stuckCounter = (memory.stuckCounter || 0) + 1;
      if (memory.stuckCounter > 3) {
        const emergencyMove = this.getRandomValidMove(bot);
        if (emergencyMove) {
          this.tryMove(botId, emergencyMove.dx, emergencyMove.dy, emergencyMove.pos);
          memory.stuckCounter = 0;
          return;
        }
      }
    } else {
      memory.stuckCounter = 0;
    }

    // 1. PRIORITY: Dodge player bullets — how often a bot even bothers is
    // difficulty-driven (an "easy" bot mostly eats bullets it could avoid).
    if (Math.random() < (memory.dodgeChance ?? 0.6)) {
      const dodgeMove = this.shouldDodgeBullet(bot);
      if (dodgeMove && now - (memory.lastDodge || 0) > 300) {
        this.tryMove(botId, dodgeMove.dx, dodgeMove.dy, dodgeMove.pos);
        memory.lastDodge = now;
        return;
      }
    }

    // 2. PRIORITY: Attack players if close and vulnerable — more aggressive
    // bots engage from farther out and retreat less readily.
    const aggression = memory.aggressionLevel ?? 0.6;
    const engageRadius = 4 + aggression * 4;
    const retreatThreshold = 4 * (1 - aggression * 0.5);
    const playerThreat = this.findBestPlayerTarget(bot);
    if (playerThreat && playerThreat.distance <= engageRadius) {
      if (
        this.canShootTarget(bot, playerThreat.player) &&
        now - bot.lastShot > BULLET_COOLDOWN &&
        now > bot.respawnShootingCooldown
      ) {
        bot.position = playerThreat.position;
        bot.lastShot = now;
        this.bullets.createBullet(botId);
        memory.targetPlayer = playerThreat.playerId;
        return;
      }

      if (playerThreat.distance < retreatThreshold) {
        const retreat = this.calculateRetreat(bot, playerThreat.player);
        if (retreat) {
          this.tryMove(botId, retreat.dx, retreat.dy, retreat.pos);
          return;
        }
      }
    }

    // 3. PRIORITY: Attack base
    const attackPos = this.findBestAttackPosition(bot, botId);

    if (attackPos.canShoot && attackPos.position) {
      bot.position = attackPos.position;
      if (now - bot.lastShot > BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
        bot.lastShot = now;
        this.bullets.createBullet(botId);
      }
      return;
    }

    // 4. Move to attack position
    if (attackPos.targetX !== undefined && attackPos.targetY !== undefined) {
      const move = this.calculateSmartPath(bot, attackPos.targetX, attackPos.targetY);
      if (move && !this.isCollidingWithOtherBots(bot, botId, move)) {
        this.tryMove(botId, move.dx, move.dy, move.pos);
        memory.lastMove = move;
        memory.lastTarget = { x: attackPos.targetX, y: attackPos.targetY };
        return;
      }
    }

    // 5. Destroy obstacles
    if (now - bot.lastShot > BULLET_COOLDOWN && now > bot.respawnShootingCooldown) {
      const obstacle = this.findBestObstacleToShoot(bot);
      if (obstacle) {
        bot.position = obstacle.position;
        bot.lastShot = now;
        this.bullets.createBullet(botId);
        return;
      }
    }

    // 6. Patrol if nothing to do
    const patrolMove = this.getRandomValidMove(bot);
    if (patrolMove) {
      this.tryMove(botId, patrolMove.dx, patrolMove.dy, patrolMove.pos);
    }
  }

  isStuck(memory: BotMemory): boolean {
    if (!memory || !memory.positions || memory.positions.length < 4) return false;
    const recent = memory.positions.slice(-4);
    const first = recent[0];
    for (const pos of recent) {
      if (Math.abs(pos.x - first.x) > 1 || Math.abs(pos.y - first.y) > 1) {
        return false;
      }
    }
    return true;
  }

  getRandomValidMove(bot: PlayerState, avoid?: (x: number, y: number) => boolean): Move | null {
    const moves: Move[] = [...CANONICAL_MOVES];
    const shuffled = moves.sort(() => Math.random() - 0.5);
    for (const move of shuffled) {
      const newX = bot.x + move.dx;
      const newY = bot.y + move.dy;
      if (
        newX >= 0 &&
        newX < size.col - 3 &&
        newY >= 0 &&
        newY < size.row - 3 &&
        !this.bullets.checkWallCollision(newX, newY, move.pos) &&
        !(avoid && avoid(newX, newY))
      ) {
        return move;
      }
    }
    return null;
  }

  shouldDodgeBullet(bot: PlayerState, avoid?: (x: number, y: number) => boolean): Move | null {
    const { state } = this;
    let threat: BulletState | null = null;
    let minDist = Infinity;

    for (const [, bullet] of state.activeBullets) {
      if (!bullet.active) continue;
      if (bullet.ownerId && state.players[bullet.ownerId]?.isCoopEnemy) continue;

      const dist = Math.abs(bullet.x - bot.x) + Math.abs(bullet.y - bot.y);
      if (dist < minDist && dist < 6) {
        if (this.isHeadingTowards(bullet, bot)) {
          minDist = dist;
          threat = bullet;
        }
      }
    }

    if (!threat) return null;

    const moves: Move[] = [
      { dx: 1, dy: 0, pos: 'left' },
      { dx: -1, dy: 0, pos: 'right' },
      { dx: 0, dy: 1, pos: 'bottom' },
      { dx: 0, dy: -1, pos: 'top' },
    ];

    for (const move of moves) {
      const newX = bot.x + move.dx;
      const newY = bot.y + move.dy;
      if (
        newX >= 0 &&
        newX < size.col - 3 &&
        newY >= 0 &&
        newY < size.row - 3 &&
        !this.bullets.checkWallCollision(newX, newY, move.pos) &&
        !this.wouldBeHit({ x: newX, y: newY }, threat) &&
        !(avoid && avoid(newX, newY))
      ) {
        return move;
      }
    }
    return null;
  }

  findBestPlayerTarget(
    bot: PlayerState,
  ): { player: PlayerState; playerId: string; distance: number; position: TankFacing } | null {
    const { state } = this;
    let bestTarget: PlayerState | null = null;
    let bestTargetId: string | null = null;
    let minDistance = Infinity;
    let bestPosition: TankFacing | null = null;

    for (const playerId in state.players) {
      const player = state.players[playerId];
      if (!player || !player.status || player.isBot || player.isCoopEnemy) continue;

      const now = Date.now();
      if (player.invulnerableUntil && now < player.invulnerableUntil) continue;
      if (player.exploding && now < player.explosionEndTime) continue;

      const dist = Math.abs(bot.x - player.x) + Math.abs(bot.y - player.y);
      if (dist < minDistance) {
        const shootPos = this.canShootTargetFrom(bot, player);
        if (shootPos) {
          minDistance = dist;
          bestTarget = player;
          bestTargetId = playerId;
          bestPosition = shootPos;
        }
      }
    }

    return bestTarget && bestTargetId && bestPosition
      ? {
          player: bestTarget,
          playerId: bestTargetId,
          distance: minDistance,
          position: bestPosition,
        }
      : null;
  }

  canShootTarget(bot: PlayerState, target: PlayerState): TankFacing | null {
    return this.canShootTargetFrom(bot, target);
  }

  // from doesn't have to be an actual player — findFiringPosition probes
  // hypothetical spots with this same check.
  canShootTargetFrom(
    from: { x: number; y: number },
    target: { x: number; y: number },
  ): TankFacing | null {
    const directions: TankFacing[] = ['top', 'bottom', 'left', 'right'];
    for (const dir of directions) {
      const bulletConfig = bulletDirections[dir];
      if (!bulletConfig) continue;

      let checkX = from.x + bulletConfig.offsetX;
      let checkY = from.y + bulletConfig.offsetY;

      for (let i = 0; i < 15; i++) {
        checkX += bulletConfig.dx;
        checkY += bulletConfig.dy;

        if (
          target.x <= checkX &&
          checkX < target.x + 3 &&
          target.y <= checkY &&
          checkY < target.y + 3
        ) {
          return dir;
        }

        // A wall blocks the shot entirely — stop marching this ray. (Previously
        // this `break` only exited the inner wall-scan loop, so bots thought
        // they could see straight through walls when scoring targets.)
        if (this.isWallAt(checkX, checkY)) break;
      }
    }
    return null;
  }

  isWallAt(x: number, y: number): boolean {
    const { state } = this;
    for (const wall of state.walls) {
      if (wall.x === x && wall.y === y) return true;
    }
    if (state.gameMode === 'coop') {
      for (const brick of state.bricks) {
        if (brick.x === x && brick.y === y && brick.health > 0) return true;
      }
    }
    return false;
  }

  calculateRetreat(bot: PlayerState, player: PlayerState): Move | null {
    const dx = bot.x - player.x;
    const dy = bot.y - player.y;

    const moves: Move[] = [];
    if (Math.abs(dx) > Math.abs(dy)) {
      moves.push({ dx: dx > 0 ? 1 : -1, dy: 0, pos: dx > 0 ? 'left' : 'right' });
      moves.push({ dx: 0, dy: dy > 0 ? 1 : -1, pos: dy > 0 ? 'bottom' : 'top' });
    } else {
      moves.push({ dx: 0, dy: dy > 0 ? 1 : -1, pos: dy > 0 ? 'bottom' : 'top' });
      moves.push({ dx: dx > 0 ? 1 : -1, dy: 0, pos: dx > 0 ? 'left' : 'right' });
    }

    for (const move of moves) {
      const newX = bot.x + move.dx;
      const newY = bot.y + move.dy;
      if (
        newX >= 0 &&
        newX < size.col - 3 &&
        newY >= 0 &&
        newY < size.row - 3 &&
        !this.bullets.checkWallCollision(newX, newY, move.pos)
      ) {
        return move;
      }
    }
    return null;
  }

  isCollidingWithOtherBots(bot: PlayerState, botId: string, move: Move): boolean {
    const newX = bot.x + move.dx;
    const newY = bot.y + move.dy;
    return this.wouldOverlapPlayer(newX, newY, botId, (p) => !!p.isCoopEnemy);
  }

  // Would the tank's 3x3 footprint at (x, y) overlap any other live bot's footprint?
  // Used to keep PvP bots from bunching up on top of each other while pathing.
  wouldCollideWithAnyBot(botId: string, x: number, y: number): boolean {
    return this.wouldOverlapPlayer(x, y, botId, (p) => p.isBot);
  }

  private wouldOverlapPlayer(
    x: number,
    y: number,
    selfId: string,
    predicate: (player: PlayerState) => boolean,
  ): boolean {
    const { state } = this;
    for (const otherId in state.players) {
      if (otherId === selfId) continue;
      const other = state.players[otherId];
      if (!other || !other.status || other.exploding || !predicate(other)) continue;

      if (Math.abs(x - other.x) < 3 && Math.abs(y - other.y) < 3) return true;
    }
    return false;
  }

  // Picks the player worth engaging: prefers a target the bot already has a
  // clear shot at, then falls back to nearest. `preferredTargetId` (the bot's
  // current target, if any) gets a small bonus so the bot commits to chasing
  // someone instead of flip-flopping targets every tick a marginally closer
  // player wanders by.
  findBestPvpTarget(
    bot: PlayerState,
    botId: string,
    preferredTargetId?: string,
  ): { id: string; player: PlayerState } | null {
    const { state } = this;
    const now = Date.now();
    let best: PlayerState | null = null;
    let bestId: string | null = null;
    let bestScore = -Infinity;

    for (const playerId in state.players) {
      if (playerId === botId) continue;
      const player = state.players[playerId];
      if (!player || !player.status || player.isCoopEnemy) continue;
      if (player.invulnerableUntil && now < player.invulnerableUntil) continue;
      if (player.exploding && now < player.explosionEndTime) continue;

      const dist = Math.abs(bot.x - player.x) + Math.abs(bot.y - player.y);
      const hasShot = this.canShootTargetFrom(bot, player) !== null;
      let score = (hasShot ? 1000 : 0) - dist;
      if (playerId === preferredTargetId) score += 5;

      if (score > bestScore) {
        bestScore = score;
        best = player;
        bestId = playerId;
      }
    }

    return best && bestId ? { id: bestId, player: best } : null;
  }

  // Scans the target's row and column (the only lines a tank can actually
  // shoot along) for the closest cell that both has an unobstructed shot at
  // the target and isn't itself wall-embedded, so pursuit has somewhere
  // concrete to path toward instead of beelining onto the target's own tile.
  findFiringPosition(bot: PlayerState, target: PlayerState): { x: number; y: number } | null {
    const maxX = size.col - 3;
    const maxY = size.row - 3;
    const RANGE = 14;

    const candidates: { x: number; y: number; dist: number }[] = [];
    for (let d = 1; d <= RANGE; d++) {
      if (target.x - d >= 0) candidates.push({ x: target.x - d, y: target.y, dist: d });
      if (target.x + d <= maxX) candidates.push({ x: target.x + d, y: target.y, dist: d });
      if (target.y - d >= 0) candidates.push({ x: target.x, y: target.y - d, dist: d });
      if (target.y + d <= maxY) candidates.push({ x: target.x, y: target.y + d, dist: d });
    }
    candidates.sort((a, b) => a.dist - b.dist);

    for (const c of candidates) {
      if (this.isWallAt(c.x, c.y)) continue;
      if (this.canShootTargetFrom(c, target)) return { x: c.x, y: c.y };
    }
    return null;
  }

  // BFS over the walkable grid — same per-direction wall mask real movement
  // uses, so a returned path is guaranteed walkable step by step. Lets bots
  // route around obstacles instead of nudging into them and giving up.
  findPath(
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
  ): { x: number; y: number }[] | null {
    const maxX = size.col - 3;
    const maxY = size.row - 3;
    if (goalX < 0 || goalX > maxX || goalY < 0 || goalY > maxY) return null;
    if (startX === goalX && startY === goalY) return [];

    const startKey = `${startX},${startY}`;
    const goalKey = `${goalX},${goalY}`;
    const cameFrom = new Map<string, string>();
    const visited = new Set<string>([startKey]);
    const queue: [number, number][] = [[startX, startY]];
    const maxExplored = 2500;

    let head = 0;
    let explored = 0;

    while (head < queue.length && explored < maxExplored) {
      const [x, y] = queue[head++];
      explored++;

      for (const d of CANONICAL_MOVES) {
        const nx = x + d.dx;
        const ny = y + d.dy;
        if (nx < 0 || nx > maxX || ny < 0 || ny > maxY) continue;

        const nKey = `${nx},${ny}`;
        if (visited.has(nKey)) continue;
        if (this.bullets.checkWallCollision(nx, ny, d.pos)) continue;

        visited.add(nKey);
        cameFrom.set(nKey, `${x},${y}`);

        if (nKey === goalKey) {
          const path: { x: number; y: number }[] = [];
          let cur = nKey;
          while (cur !== startKey) {
            const [px, py] = cur.split(',').map(Number);
            path.push({ x: px, y: py });
            cur = cameFrom.get(cur)!;
          }
          return path.reverse();
        }

        queue.push([nx, ny]);
      }
    }

    return null;
  }

  private stepToward(bot: PlayerState, next: { x: number; y: number }): Move | null {
    const dx = next.x - bot.x;
    const dy = next.y - bot.y;
    return CANONICAL_MOVES.find((m) => m.dx === dx && m.dy === dy) ?? null;
  }

  // High-level pursuit: walk a cached BFS route toward a firing position on
  // the target's row/column, only re-planning when the goal has drifted far
  // enough to matter, the route ran out, or it's gone stale — full BFS every
  // tick would be wasteful since the target moves a cell at a time.
  planPursuit(
    bot: PlayerState,
    memory: BotMemory,
    target: PlayerState,
    avoid?: (x: number, y: number) => boolean,
  ): Move | null {
    const goal = this.findFiringPosition(bot, target) ?? { x: target.x, y: target.y };
    const now = Date.now();

    const goalDrift =
      memory.pathGoalX === undefined
        ? Infinity
        : Math.abs(memory.pathGoalX - goal.x) + Math.abs((memory.pathGoalY ?? goal.y) - goal.y);
    const stale = now - (memory.pathComputedAt ?? 0) > 1500;
    const exhausted = !memory.path || memory.path.length === 0;

    if (exhausted || goalDrift > 3 || stale) {
      memory.path = this.findPath(bot.x, bot.y, goal.x, goal.y) ?? undefined;
      memory.pathGoalX = goal.x;
      memory.pathGoalY = goal.y;
      memory.pathComputedAt = now;
    }

    if (memory.path && memory.path.length > 0) {
      const move = this.stepToward(bot, memory.path[0]);
      if (move && !(avoid && avoid(bot.x + move.dx, bot.y + move.dy))) {
        memory.path.shift();
        return move;
      }
      // Something's in the way (another bot, or we drifted off-route) — drop
      // the stale route and fall back to a direct step; we'll replan next tick.
      memory.path = undefined;
    }

    return this.calculateSmartPath(bot, goal.x, goal.y, avoid);
  }

  calculateSmartPath(
    bot: PlayerState,
    targetX: number,
    targetY: number,
    avoid?: (x: number, y: number) => boolean,
  ): Move | null {
    const dx = Math.sign(targetX - bot.x);
    const dy = Math.sign(targetY - bot.y);

    const moves: Move[] = [];
    if (Math.abs(targetX - bot.x) > Math.abs(targetY - bot.y)) {
      if (dx !== 0) moves.push({ dx, dy: 0, pos: dx > 0 ? 'left' : 'right' });
      if (dy !== 0) moves.push({ dx: 0, dy, pos: dy > 0 ? 'bottom' : 'top' });
    } else {
      if (dy !== 0) moves.push({ dx: 0, dy, pos: dy > 0 ? 'bottom' : 'top' });
      if (dx !== 0) moves.push({ dx, dy: 0, pos: dx > 0 ? 'left' : 'right' });
    }

    for (const move of moves) {
      const newX = bot.x + move.dx;
      const newY = bot.y + move.dy;
      if (
        newX >= 0 &&
        newX < size.col - 3 &&
        newY >= 0 &&
        newY < size.row - 3 &&
        !this.bullets.checkWallCollision(newX, newY, move.pos) &&
        !(avoid && avoid(newX, newY))
      ) {
        return move;
      }
    }
    return null;
  }

  findBestObstacleToShoot(bot: PlayerState): { position: TankFacing } | null {
    for (const brick of this.state.bricks) {
      if (brick.health > 0) {
        const dist = Math.abs(bot.x - brick.x) + Math.abs(bot.y - brick.y);
        if (dist <= 5) {
          const shootPos = this.canShootTargetFrom(bot, { x: brick.x - 1, y: brick.y - 1 });
          if (shootPos) {
            return { position: shootPos };
          }
        }
      }
    }
    return null;
  }

  // Find best attack position with bot distribution
  findBestAttackPosition(bot: PlayerState, botId: string): AttackPosition {
    const { state } = this;
    const baseCenterX = state.base.x + 1;
    const baseCenterY = state.base.y + 1;

    const attackPositions: {
      x: number;
      y: number;
      pos: 'left' | 'right' | 'top';
      dir: TankFacing;
    }[] = [
      { x: state.base.x - 4, y: baseCenterY, pos: 'left', dir: 'right' },
      { x: state.base.x + 6, y: baseCenterY, pos: 'right', dir: 'left' },
      { x: baseCenterX, y: state.base.y - 4, pos: 'top', dir: 'bottom' },
    ];

    const positionCounts: Record<'left' | 'right' | 'top', number> = { left: 0, right: 0, top: 0 };
    for (const otherId in state.botMemory) {
      if (otherId === botId) continue;
      const otherMemory = state.botMemory[otherId];
      if (otherMemory && otherMemory.attackTargetPos) {
        positionCounts[otherMemory.attackTargetPos]++;
      }
    }

    const availablePositions = attackPositions
      .filter((pos) => this.hasLineOfSightToBase(pos.x, pos.y, pos.dir))
      .map((pos) => ({
        ...pos,
        distance: Math.abs(bot.x - pos.x) + Math.abs(bot.y - pos.y),
        botsTargeting: positionCounts[pos.pos],
      }))
      .sort((a, b) => {
        if (a.botsTargeting !== b.botsTargeting) {
          return a.botsTargeting - b.botsTargeting;
        }
        return a.distance - b.distance;
      });

    let bestPos = availablePositions.length > 0 ? availablePositions[0] : null;

    for (const pos of availablePositions) {
      if (Math.abs(bot.x - pos.x) <= 2 && Math.abs(bot.y - pos.y) <= 2) {
        bestPos = pos;
        break;
      }
    }

    if (bestPos && state.botMemory[botId]) {
      state.botMemory[botId].attackTargetPos = bestPos.pos;
    }

    if (bestPos && Math.abs(bot.x - bestPos.x) <= 1 && Math.abs(bot.y - bestPos.y) <= 1) {
      return { canShoot: true, position: bestPos.dir };
    }

    const distToBase = Math.abs(bot.x - baseCenterX) + Math.abs(bot.y - baseCenterY);
    if (distToBase < 4) {
      const retreatX = bot.x < baseCenterX ? bot.x - 2 : bot.x + 2;
      const retreatY = bot.y < baseCenterY ? bot.y - 2 : bot.y + 2;
      return { canShoot: false, targetX: retreatX, targetY: retreatY };
    }

    if (bestPos) {
      const botIndex = parseInt(botId.split('_')[1], 10) || 0;
      const offsetX = (botIndex % 3) - 1;
      const offsetY = (Math.floor(botIndex / 3) % 3) - 1;

      return {
        canShoot: false,
        targetX: bestPos.x + offsetX,
        targetY: bestPos.y + offsetY,
        targetDir: bestPos.dir,
      };
    }

    return { canShoot: false, targetX: state.base.x - 3, targetY: baseCenterY };
  }

  hasLineOfSightToBase(fromX: number, fromY: number, direction: string): boolean {
    const { state } = this;
    const opposite: Record<string, keyof typeof bulletDirections> = {
      bottom: 'top',
      top: 'bottom',
      left: 'right',
      right: 'left',
    };
    const bulletConfig = bulletDirections[opposite[direction]];
    if (!bulletConfig) return false;

    let checkX = fromX;
    let checkY = fromY;

    for (let i = 0; i < 20; i++) {
      checkX += bulletConfig.dx;
      checkY += bulletConfig.dy;

      if (
        state.base.x <= checkX &&
        checkX < state.base.x + 3 &&
        state.base.y <= checkY &&
        checkY < state.base.y + 3
      ) {
        return true;
      }

      if (this.isWallAt(checkX, checkY)) return false;
    }

    return false;
  }

  isHeadingTowards(
    bullet: { x: number; y: number; dx: number; dy: number },
    bot: PlayerState,
  ): boolean {
    const dx = bot.x - bullet.x;
    const dy = bot.y - bullet.y;
    return (
      (bullet.dx !== 0 && Math.sign(dx) === Math.sign(bullet.dx)) ||
      (bullet.dy !== 0 && Math.sign(dy) === Math.sign(bullet.dy))
    );
  }

  wouldBeHit(
    position: { x: number; y: number },
    bullet: { x: number; y: number; dx: number; dy: number },
  ): boolean {
    const futureX = position.x + bullet.dx;
    const futureY = position.y + bullet.dy;
    return futureX === bullet.x && futureY === bullet.y;
  }

  tryMove(botId: string, dx: number, dy: number, position: TankFacing): boolean {
    const { state } = this;
    const bot = state.players[botId];
    if (!bot) return false;

    const newX = bot.x + dx;
    const newY = bot.y + dy;

    if (newX < 0 || newX >= size.col - 3 || newY < 0 || newY >= size.row - 3) {
      return false;
    }

    if (this.bullets.checkWallCollision(newX, newY, position)) {
      return false;
    }

    bot.x = newX;
    bot.y = newY;
    bot.position = position;
    return true;
  }
}
