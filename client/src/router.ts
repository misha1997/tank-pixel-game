type CleanupFn = () => void;
type RouteHandler = (params: Record<string, string>) => CleanupFn | void;

interface RouteEntry {
  regex: RegExp;
  keys: string[];
  handler: RouteHandler;
}

const routes: RouteEntry[] = [];
let activeCleanup: CleanupFn | null = null;
let generation = 0;

export function registerRoute(path: string, handler: RouteHandler): void {
  const keys: string[] = [];
  const pattern = path.replace(/:([A-Za-z]+)/g, (_match, key: string) => {
    keys.push(key);
    return '([^/]+)';
  });
  routes.push({ regex: new RegExp(`^${pattern}$`), keys, handler });
}

// Route handlers that kick off async work (e.g. joining a room by code)
// should snapshot this before the async call and compare it after — if the
// user has navigated elsewhere in the meantime, the generation will have
// moved on and the stale callback should bail out instead of acting.
export function currentGeneration(): number {
  return generation;
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (location.pathname === path) return;
  if (options.replace) {
    history.replaceState(null, '', path);
  } else {
    history.pushState(null, '', path);
  }
  resolveRoute();
}

function resolveRoute(): void {
  generation++;
  activeCleanup?.();
  activeCleanup = null;

  const path = location.pathname;
  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(match[i + 1]);
      });
      const cleanup = route.handler(params);
      if (typeof cleanup === 'function') activeCleanup = cleanup;
      return;
    }
  }

  navigate('/', { replace: true });
}

export function startRouter(): void {
  window.addEventListener('popstate', resolveRoute);
  resolveRoute();
}
