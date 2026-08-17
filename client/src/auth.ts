import type { AuthUser } from '@tank/shared';

type AuthTab = 'login' | 'register';

async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (!response.ok) return null;
  return (await response.json()) as AuthUser;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export async function initAuth(onReady: (account: AuthUser | null) => void): Promise<void> {
  const overlay = document.getElementById('auth-overlay') as HTMLElement;

  const existing = await fetchCurrentUser();
  if (existing) {
    overlay.classList.add('hidden');
    onReady(existing);
    return;
  }

  const tabButtons = document.querySelectorAll<HTMLButtonElement>('.auth-tab-btn');
  const form = document.getElementById('auth-form') as HTMLFormElement;
  const usernameInput = document.getElementById('auth-username') as HTMLInputElement;
  const passwordInput = document.getElementById('auth-password') as HTMLInputElement;
  const errorBox = document.getElementById('auth-error') as HTMLElement;
  const submitBtn = document.getElementById('auth-submit') as HTMLButtonElement;
  const guestBtn = document.getElementById('btn-guest') as HTMLButtonElement;

  let activeTab: AuthTab = 'login';

  function setTab(tab: AuthTab): void {
    activeTab = tab;
    errorBox.textContent = '';
    tabButtons.forEach((btn) => btn.classList.toggle('selected', btn.dataset.tab === tab));
    submitBtn.textContent = tab === 'login' ? 'LOG IN' : 'REGISTER';
    passwordInput.autocomplete = tab === 'login' ? 'current-password' : 'new-password';
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab as AuthTab));
  });

  function finish(account: AuthUser | null): void {
    overlay.classList.add('hidden');
    onReady(account);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.textContent = '';

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    submitBtn.disabled = true;
    try {
      const response = await fetch(`/api/auth/${activeTab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        errorBox.textContent = data.error || 'Something went wrong.';
        return;
      }

      finish(data as AuthUser);
    } catch {
      errorBox.textContent = 'Could not reach the server.';
    } finally {
      submitBtn.disabled = false;
    }
  });

  guestBtn.addEventListener('click', () => finish(null));
}
