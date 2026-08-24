# OPENCODE.md

## Rules

- Never break Socket.io event compatibility.
- @tank/shared is the single source of truth for all types.
- Preserve pixel-perfect rendering.
- Always run typecheck after edits.
- Prefer for-loops inside the game loop over filter/map.
- Avoid allocations inside updateGameState().
- Never modify shared constants without explanation.

## Performance targets

- 60 FPS client
- 100 ms server tick
- Zero allocations inside bullet update
- Object pooling for frequently created entities