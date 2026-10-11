// Updates reach every open game within seconds of going live. GitHub Pages'
// CDN caches index.html for ~10 minutes, so the page is fetched with a unique
// query (a fresh CDN key, never a cached copy) and its hashed bundle name
// compared with ours; a newer build reloads the game to a fresh URL as well.
// On boot that happens at once; while the game runs (website and desktop app)
// it checks every 15 s and reloads at the main menu (never mid-flight: then it
// waits until you are back in the menu).
import { noteAutoReload } from '../ui/launcher/introSkip';

const name = (s: string) => s.match(/assets\/index-[\w-]+\.js/)?.[0];

function mine(): string | undefined {
  const cur = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]');
  return cur ? name(cur.src) : undefined; // single-file / dev build: nothing to compare
}

/** this page's URL with `key` set to `value` (other parameters kept, no hash) */
function withParam(key: string, value: string): string {
  const u = new URL(location.href);
  u.hash = '';
  u.searchParams.set(key, value);
  return u.toString();
}

function liveBuild(): Promise<string | undefined> {
  return fetch(withParam('fresh', String(Date.now())), { cache: 'no-store' })
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
  noteAutoReload();
  // (to a URL the CDN has not cached, so the new page comes back and not the old one)
  location.replace(withParam('b', live.replace(/^.*index-|\.js$/g, '')));
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
  }, 15000);
  setInterval(() => {
    if (pending && atMenu()) reloadTo(pending);
  }, 1000);
}
