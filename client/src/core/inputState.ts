import { socket } from './socket.js';
import { getAllBindings } from './keybindings.js';

export type MovementInput = 'movePieceTop' | 'movePieceBottom' | 'movePieceLeft' | 'movePieceRight';

const INPUT_THROTTLE = 100;
let lastInputTime = 0;
let lastInputSent = 0;
let inputQueue: { type: MovementInput; timestamp: number }[] = [];

// Arrow keys and the virtual d-pad's pseudo-codes always move, regardless of
// custom bindings (see core/keybindings.ts) — rebinding can never lock a
// player out of moving. 1001+ are pseudo-keycodes for the d-pad buttons.
const FIXED_MOVEMENT_KEYS: Record<number, MovementInput> = {
  37: 'movePieceLeft',
  38: 'movePieceTop',
  39: 'movePieceRight',
  40: 'movePieceBottom',
  1001: 'movePieceTop',
  1002: 'movePieceRight',
  1003: 'movePieceBottom',
  1004: 'movePieceLeft',
};

// Physical keys and the virtual d-pad share one press-order stack, so the
// "most recently pressed, still-held direction wins" rule covers both input
// sources identically. Populated by rebuildMovementKeys() below — kept as a
// mutated-in-place object (not reassigned) so the exported reference stays
// valid for every importer after a rebind.
export const MOVEMENT_KEYS: Record<number, MovementInput> = {};

export function rebuildMovementKeys(): void {
  for (const key of Object.keys(MOVEMENT_KEYS)) delete MOVEMENT_KEYS[Number(key)];
  Object.assign(MOVEMENT_KEYS, FIXED_MOVEMENT_KEYS);

  const bindings = getAllBindings();
  MOVEMENT_KEYS[bindings.up] = 'movePieceTop';
  MOVEMENT_KEYS[bindings.down] = 'movePieceBottom';
  MOVEMENT_KEYS[bindings.left] = 'movePieceLeft';
  MOVEMENT_KEYS[bindings.right] = 'movePieceRight';
}

rebuildMovementKeys();

export const DPAD_CODES: Record<MovementInput, number> = {
  movePieceTop: 1001,
  movePieceRight: 1002,
  movePieceBottom: 1003,
  movePieceLeft: 1004,
};

const heldMovementKeys: number[] = [];

export function trackMovementKeyDown(keyCode: number): void {
  const index = heldMovementKeys.indexOf(keyCode);
  if (index !== -1) heldMovementKeys.splice(index, 1);
  heldMovementKeys.push(keyCode);
}

export function trackMovementKeyUp(keyCode: number): void {
  const index = heldMovementKeys.indexOf(keyCode);
  if (index !== -1) heldMovementKeys.splice(index, 1);
}

function latestHeldMovement(): MovementInput | null {
  for (let i = heldMovementKeys.length - 1; i >= 0; i--) {
    const input = MOVEMENT_KEYS[heldMovementKeys[i]];
    if (input) return input;
  }
  return null;
}

// Injected by main.ts — movement is refused while the local tank's death
// animation is playing (the keydown path checks the same condition inline).
let blockedGuard: (() => boolean) | null = null;

export function setMovementBlockedGuard(guard: () => boolean): void {
  blockedGuard = guard;
}

// One step now (fresh key press / d-pad touch), throttled to INPUT_THROTTLE.
export function queueMovementPress(input: MovementInput): void {
  const now = Date.now();
  if (now - lastInputTime < INPUT_THROTTLE) return;

  queueInput(input);
  lastInputTime = now;
}

function queueInput(inputType: MovementInput): void {
  const now = Date.now();

  inputQueue = inputQueue.filter((input) => input.type !== inputType);
  inputQueue.push({ type: inputType, timestamp: now });

  if (now - lastInputSent > 50) {
    sendInputBatch();
  }
}

function sendInputBatch(): void {
  if (inputQueue.length === 0) return;

  lastInputSent = Date.now();

  const latestInputs: Partial<Record<MovementInput, true>> = {};
  for (const input of inputQueue) {
    latestInputs[input.type] = true;
  }

  for (const type of Object.keys(latestInputs) as MovementInput[]) {
    socket.emit(type);
  }

  inputQueue = [];
}

function pollHeldMovement(): void {
  const now = Date.now();
  if (now - lastInputTime < INPUT_THROTTLE) return;

  if (blockedGuard?.()) return;

  const active = latestHeldMovement();
  if (!active) return;

  queueInput(active);
  lastInputTime = now;
}

let pipelineStarted = false;

export function startInputPipeline(): void {
  if (pipelineStarted) return;
  pipelineStarted = true;

  setInterval(() => {
    pollHeldMovement();
    if (inputQueue.length > 0) {
      sendInputBatch();
    }
  }, 50);
}
