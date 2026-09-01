import type { AuthUser } from '@tank/shared';

export interface PlayerProfile {
  name: string;
  color: string;
}

export const DEFAULT_TANK_COLOR = '#00AA00';

// Logins double as tank callsigns: English letters and digits only, max 12
// characters (mirrors the server's USERNAME_PATTERN).
export const LOGIN_MAX_LENGTH = 12;

export function sanitizeLogin(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, LOGIN_MAX_LENGTH);
}

// Identity used when spawning into a room. Logged-in players always field
// their account username (server-side rating is keyed to it); guests get a
// persistent random callsign on first play.
export function loadProfile(account: AuthUser | null): PlayerProfile {
  if (account) {
    return {
      name: account.username,
      color: localStorage.getItem('playerColor') ?? DEFAULT_TANK_COLOR,
    };
  }

  let name = localStorage.getItem('playerName');
  if (!name) {
    name = `Soldier${Math.floor(100 + Math.random() * 900)}`;
    localStorage.setItem('playerName', name);
  }

  let color = localStorage.getItem('playerColor');
  if (!color) {
    color = DEFAULT_TANK_COLOR;
    localStorage.setItem('playerColor', color);
  }

  return { name, color };
}

export function saveProfile(profile: PlayerProfile): void {
  localStorage.setItem('playerName', profile.name);
  localStorage.setItem('playerColor', profile.color);
}
