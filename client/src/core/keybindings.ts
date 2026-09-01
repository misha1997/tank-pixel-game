export type BindableAction = 'up' | 'down' | 'left' | 'right' | 'shoot' | 'switchWeapon';

export const BINDABLE_ACTIONS: BindableAction[] = [
  'up',
  'down',
  'left',
  'right',
  'shoot',
  'switchWeapon',
];

const DEFAULTS: Record<BindableAction, number> = {
  up: 87, // W
  down: 83, // S
  left: 65, // A
  right: 68, // D
  shoot: 32, // Space
  switchWeapon: 81, // Q
};

// Arrow keys always move regardless of custom bindings (see inputState.ts),
// and Enter always focuses chat (see main.ts) — rebinding to any of these
// would silently make that action unreachable on that key, so block them.
const RESERVED_KEY_CODES = new Set([37, 38, 39, 40, 13]);

const STORAGE_KEY = 'keybindings';

const KEY_LABELS: Record<number, string> = {
  32: 'SPACE',
  37: 'LEFT',
  38: 'UP',
  39: 'RIGHT',
  40: 'DOWN',
  13: 'ENTER',
};

function loadBindings(): Record<BindableAction, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<BindableAction, number>>;
    const merged = { ...DEFAULTS };
    for (const action of BINDABLE_ACTIONS) {
      if (typeof parsed[action] === 'number') merged[action] = parsed[action]!;
    }
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

let current = loadBindings();

export function getAllBindings(): Record<BindableAction, number> {
  return { ...current };
}

export function getBinding(action: BindableAction): number {
  return current[action];
}

export function isKeyCodeBindable(keyCode: number): boolean {
  return !RESERVED_KEY_CODES.has(keyCode);
}

// Returns the action already using this key (other than `except`), if any —
// used to reject a rebind that would collide with another action.
export function findConflict(keyCode: number, except: BindableAction): BindableAction | null {
  for (const action of BINDABLE_ACTIONS) {
    if (action !== except && current[action] === keyCode) return action;
  }
  return null;
}

export function setBinding(action: BindableAction, keyCode: number): void {
  current = { ...current, [action]: keyCode };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export function resetBindings(): void {
  current = { ...DEFAULTS };
  localStorage.removeItem(STORAGE_KEY);
}

export function keyLabel(keyCode: number): string {
  if (KEY_LABELS[keyCode]) return KEY_LABELS[keyCode];
  if (keyCode >= 65 && keyCode <= 90) return String.fromCharCode(keyCode); // A-Z
  if (keyCode >= 48 && keyCode <= 57) return String.fromCharCode(keyCode); // 0-9
  return `KEY ${keyCode}`;
}
