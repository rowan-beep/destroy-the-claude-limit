// Whether this page load should skip the TRIAD intro: a reload the game does by
// itself (a new version, joining a server's theater) goes straight back in.

const SKIP = 'triad.skipIntro';
/** set once a program has been picked: a reload the game does by itself (an update, joining a server's theater) skips the intro */
let pickedOnce = false;
export function noteAutoReload(): void {
  try {
    if (pickedOnce) sessionStorage.setItem(SKIP, '1');
  } catch {
    /* storage blocked: the intro shows again */
  }
}
/** this page load came from such a reload (the flag is used up) */
export function takeIntroSkip(): boolean {
  try {
    const v = sessionStorage.getItem(SKIP) === '1';
    sessionStorage.removeItem(SKIP);
    return v;
  } catch {
    return false;
  }
}
/** the menu came up without the intro: later reloads skip it too */
export function markPicked(): void {
  pickedOnce = true;
}

