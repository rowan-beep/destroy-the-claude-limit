// GitHub Pages caches index.html for ~10 minutes, so a returning player can
// keep loading an old build. On boot, fetch the page uncached and compare the
// hashed bundle name; if a newer build is live, reload once to pick it up.
export function checkForNewBuild(): void {
  const cur = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]');
  if (!cur) return; // single-file / dev build: nothing to compare
  const name = (s: string) => s.match(/assets\/index-[\w-]+\.js/)?.[0];
  const mine = name(cur.src);
  if (!mine) return;
  const url = location.href.split('#')[0];
  fetch(url, { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : ''))
    .then((html) => {
      const live = name(html);
      if (!live || live === mine) return;
      try {
        if (sessionStorage.getItem('triad-reloaded') === live) return;
        sessionStorage.setItem('triad-reloaded', live);
      } catch {
        return;
      }
      location.reload();
    })
    .catch(() => {});
}
