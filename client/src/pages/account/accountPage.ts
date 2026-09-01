import type { AuthUser } from '@tank/shared';
import { logout } from '../auth/auth.js';
import { navigate } from '../../core/router.js';
import { mountPartial } from '../../core/page.js';
import { loadProfile, saveProfile, sanitizeLogin, DEFAULT_TANK_COLOR } from '../../core/profile.js';
import html from './accountPage.html?raw';

let wired = false;
let currentAccount: AuthUser | null = null;

// Mirrors the server's auth rules (auth/router.ts).
const LOGIN_MIN_LENGTH = 3;
const PASSWORD_MIN_LENGTH = 6;

function selectedColor(): string {
  const selected = document.querySelector<HTMLElement>('#account-colors .color-option.selected');
  return selected ? selected.dataset.color! : DEFAULT_TANK_COLOR;
}

function flagField(input: HTMLInputElement): void {
  input.focus();
  input.style.borderColor = '#ff4444';
  setTimeout(() => {
    input.style.borderColor = '';
  }, 500);
}

function renderStatus(): void {
  const statusEl = document.getElementById('account-status') as HTMLElement;

  statusEl.replaceChildren();
  if (currentAccount) {
    statusEl.append(
      `Logged in as ${currentAccount.username} (Rating: ${currentAccount.rating}) — `,
    );
    const logoutLink = document.createElement('a');
    logoutLink.textContent = 'Log out';
    logoutLink.addEventListener('click', () => {
      logout().then(() => location.reload());
    });
    statusEl.appendChild(logoutLink);
  } else {
    statusEl.textContent = 'Playing as Guest — progress will not be saved';
  }
}

async function saveLoggedIn(
  newUsername: string,
  currentPassword: string,
  newPassword: string,
  errorBox: HTMLElement,
): Promise<boolean> {
  // The callsign IS the login: renaming the account renames the tank.
  try {
    // Returns false on failure (error box populated); anything else —
    // including "nothing changed" — lets the caller persist color/profile.
    if (newUsername !== currentAccount?.username) {
      const response = await fetch('/api/auth/change-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: newUsername }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        errorBox.textContent = data?.error ?? 'Could not change the login.';
        return false;
      }

      // The routes hold a reference to this same object, so mutating it in
      // place propagates the new login to future spawns without a reload.
      if (currentAccount && data) {
        currentAccount.username = data.username;
        renderStatus();
      }
    }

    if (newPassword.length > 0) {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        errorBox.textContent = data?.error ?? 'Could not change the password.';
        return false;
      }
      (document.getElementById('account-current-password') as HTMLInputElement).value = '';
      (document.getElementById('account-new-password') as HTMLInputElement).value = '';
    }

    return true;
  } catch {
    errorBox.textContent = 'Could not reach the server.';
    return false;
  }
}

function wireOnce(): void {
  const nameInput = document.getElementById('account-name') as HTMLInputElement;
  const saveBtn = document.getElementById('account-save') as HTMLButtonElement;
  const backBtn = document.getElementById('account-back-btn') as HTMLButtonElement;
  const errorBox = document.getElementById('account-error') as HTMLElement;
  const colorOptions = document.querySelectorAll<HTMLElement>('#account-colors .color-option');

  colorOptions.forEach((option) => {
    option.addEventListener('click', () => {
      colorOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
    });
  });

  const markSaved = (): void => {
    saveBtn.textContent = 'SAVED';
    setTimeout(() => {
      saveBtn.textContent = 'SAVE';
    }, 1200);
  };

  const save = async (): Promise<void> => {
    errorBox.textContent = '';
    const name = sanitizeLogin(nameInput.value);

    // Login: 3-12, English letters and digits (the live filter already
    // strips everything else — here we enforce the minimum).
    if (name.length < LOGIN_MIN_LENGTH) {
      errorBox.textContent = `Login must be ${LOGIN_MIN_LENGTH}-12 characters.`;
      flagField(nameInput);
      return;
    }

    const currentPasswordInput = document.getElementById(
      'account-current-password',
    ) as HTMLInputElement;
    const newPasswordInput = document.getElementById('account-new-password') as HTMLInputElement;
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;

    if (currentAccount) {
      // Password change is optional — but a half-filled pair is not saveable.
      if (newPassword.length > 0 || currentPassword.length > 0) {
        if (!currentPassword) {
          errorBox.textContent = 'Enter your current password to change it.';
          flagField(currentPasswordInput);
          return;
        }
        if (newPassword.length < PASSWORD_MIN_LENGTH) {
          errorBox.textContent = `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
          flagField(newPasswordInput);
          return;
        }
        if (newPassword === currentPassword) {
          errorBox.textContent = 'The new password must differ from the current one.';
          flagField(newPasswordInput);
          return;
        }
      }
    }

    saveBtn.disabled = true;
    try {
      if (currentAccount) {
        const ok = await saveLoggedIn(name, currentPassword, newPassword, errorBox);
        if (!ok) return; // error box already populated
      }

      saveProfile({
        name: currentAccount ? currentAccount.username : name,
        color: selectedColor(),
      });
      markSaved();
    } finally {
      saveBtn.disabled = false;
    }
  };

  saveBtn.addEventListener('click', () => void save());
  nameInput.addEventListener('input', () => {
    const sanitized = sanitizeLogin(nameInput.value);
    if (sanitized !== nameInput.value) {
      const caret = nameInput.selectionStart;
      nameInput.value = sanitized;
      nameInput.setSelectionRange(
        caret === null ? null : Math.min(caret, sanitized.length),
        caret === null ? null : Math.min(caret, sanitized.length),
      );
    }
  });
  nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') void save();
  });

  backBtn.addEventListener('click', () => navigate('/'));
}

export function showAccountPage(account: AuthUser | null): void {
  currentAccount = account;

  if (!wired) {
    mountPartial(html);
    wireOnce();
    wired = true;
  }

  const overlay = document.getElementById('account-overlay') as HTMLElement;
  const nameInput = document.getElementById('account-name') as HTMLInputElement;
  const passwordFields = document.getElementById('account-password-fields') as HTMLElement;
  const errorBox = document.getElementById('account-error') as HTMLElement;
  const colorOptions = document.querySelectorAll<HTMLElement>('#account-colors .color-option');

  renderStatus();

  if (currentAccount) {
    nameInput.value = currentAccount.username;
    passwordFields.classList.remove('hidden');
  } else {
    nameInput.value = localStorage.getItem('playerName') ?? '';
    passwordFields.classList.add('hidden');
  }
  nameInput.readOnly = false;

  errorBox.textContent = '';
  const savedColor = loadProfile(account).color;
  colorOptions.forEach((option) => {
    option.classList.toggle('selected', option.dataset.color === savedColor);
  });

  overlay.classList.remove('hidden');
}

export function hideAccountPage(): void {
  document.getElementById('account-overlay')?.classList.add('hidden');
}
