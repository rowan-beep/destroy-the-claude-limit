// GitHub Pages caches index.html for ~10 minutes, so a returning player can
// keep loading an old build. On boot, fetch the page uncached and compare the
// hashed bundle name; if a newer build is live, reload once to pick it up.
// While the game runs (website and desktop app) it keeps checking every
// minute; a new build reloads the game at the main menu (never mid-flight:
// then it waits until you are back in the menu).

const name = (s: string) => s.match(/assets\/index-[\w-]+\.js/)?.[0];

function mine(): string | undefined {
  const cur = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]');
  return cur ? name(cur.src) : undefined; // single-file / dev build: nothing to compare
}

function liveBuild(): Promise<string | undefined> {
  const url = location.href.split('#')[0];
  return fetch(url, { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : ''))
    .then((html) => name(html))
    .catch(() => undefined);
}

/** Reload to `live` unless we already did (a CDN edge can serve an old page for a while). */
function reloadTo(live: string): void {
  try {
    if (sessionStorage.getItem('triad-reloaded') === live) return;
    sessionStorage.setItem('triad-reloaded', live);
  } catch {
    return;
  }
  location.reload();
}

export function checkForNewBuild(): void {
  const cur = mine();
  if (!cur) return;
  void liveBuild().then((live) => {
    if (live && live !== cur) reloadTo(live);
  });
}

/**
 * Keep watching for new builds while the game is open. `atMenu` says whether
 * reloading now is harmless (in the menu, not flying); `onPending` shows a
 * notice while an update waits for the player to finish flying.
 */
export function watchForUpdates(atMenu: () => boolean, onPending?: (v: boolean) => void): void {
  const cur = mine();
  if (!cur) return;
  let pending: string | null = null;
  setInterval(() => {
    if (pending) return;
    void liveBuild().then((live) => {
      if (live && live !== cur) {
        pending = live;
        onPending?.(true);
      }
    });
  }, 60000);
  setInterval(() => {
    if (pending && atMenu()) reloadTo(pending);
  }, 2000);
}
