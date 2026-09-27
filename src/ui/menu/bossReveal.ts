// The v4.1.0 Rafale reveal: the first time the update notes open, the
// whole screen goes dark and a dark-red intro plays over the first seven
// seconds of a horror-trailer cue, which then fades out. It plays once, ever.

import { el } from '../dom';
import cueUrl from '../../assets/boss-reveal.mp3';

const PLAYED_KEY = 'triad.bossReveal.4.1.0';
/** seconds of music before the fade starts, and the fade itself */
const HOLD = 7;
const FADE = 3.4;

export function bossRevealPending(): boolean {
  try {
    return localStorage.getItem(PLAYED_KEY) !== '1';
  } catch {
    return false;
  }
}

function markPlayed(): void {
  try {
    localStorage.setItem(PLAYED_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

// Rafale planform seen from above (half, metres: x out, z aft), nose up
const HALF: [number, number][] = [
  [0, -7.95], [0.3, -7.0], [0.5, -5.9], [0.6, -4.2], [0.62, -3.55], [1.98, -2.3], [1.98, -1.84], [0.9, -2.0],
  [0.95, -1.0], [5.3, 3.83], [5.36, 3.3], [5.42, 3.3], [5.42, 5.6], [5.3, 4.92], [0.97, 5.4], [0.95, 6.65], [0.9, 7.35], [0.05, 7.35], [0, 7.2],
];

function planformPath(): string {
  const right = HALF.map(([x, z]) => `${(x * 10).toFixed(1)},${(z * 10).toFixed(1)}`);
  const left = HALF.slice().reverse().map(([x, z]) => `${(-x * 10).toFixed(1)},${(z * 10).toFixed(1)}`);
  return 'M' + right.join(' L') + ' L' + left.join(' L') + ' Z';
}

/**
 * Play the reveal (resolves when it's over and the screen is back). If the
 * browser won't start sound without a click, the dark screen asks for one.
 */
export function playBossReveal(): Promise<void> {
  return new Promise((resolve) => {
    // music only: the text is there to be read, never spoken
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* speech unavailable */
    }
    const root = el('div', 'boss-reveal', document.body);
    el('div', 'br-grain', root);
    el('div', 'br-scan', root);
    el('div', 'br-vignette', root);
    const stage = el('div', 'br-stage', root);
    el('div', 'br-line br-l1', stage, 'INCOMING TRANSMISSION');
    el('div', 'br-line br-l2', stage, 'SOMETHING IS COMING.');
    const jet = el('div', 'br-jet', stage);
    jet.innerHTML = `<svg viewBox="-60 -85 120 165" aria-hidden="true"><path d="${planformPath()}"/><circle class="br-eye" cx="-4.7" cy="73.5" r="3.2"/><circle class="br-eye" cx="4.7" cy="73.5" r="3.2"/></svg>`;
    el('div', 'br-line br-l3', stage, 'DASSAULT RAFALE');
    el('div', 'br-line br-l4', stage, 'It sees you from 90 NM, and its Meteor is still under power when it arrives: inside 34 NM no turn, no dive, no afterburner will save you.');
    el('div', 'br-line br-l5', stage, 'Live through that and ten missiles, a 30 mm cannon and 9 G are waiting for you at the merge. Pick a fight with it and you have already lost.');
    const gate = el('div', 'br-gate hidden', root, 'CLICK… IF YOU DARE');

    let ctx: AudioContext | null = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      markPlayed();
      root.classList.add('br-out');
      setTimeout(() => {
        root.remove();
        void ctx?.close().catch(() => undefined);
        resolve();
      }, 900);
    };

    const start = (buf: AudioBuffer | null) => {
      gate.classList.add('hidden');
      root.classList.add('br-run');
      markPlayed();
      if (ctx && buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        const t0 = ctx.currentTime + 0.02;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(1, t0 + 0.35);
        g.gain.setValueAtTime(1, t0 + HOLD);
        g.gain.linearRampToValueAtTime(0, t0 + HOLD + FADE);
        src.connect(g).connect(ctx.destination);
        src.start(t0, 0, HOLD + FADE + 0.1);
      }
      setTimeout(finish, (HOLD + FADE) * 1000);
    };

    const skip = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', skip);
        finish();
      }
    };
    window.addEventListener('keydown', skip);

    // decode the cue, then start at once if sound is allowed, else wait for a click
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    let buf: AudioBuffer | null = null;
    const ready = (async () => {
      if (!AC) return;
      try {
        ctx = new AC();
        const data = await (await fetch(cueUrl)).arrayBuffer();
        buf = await ctx.decodeAudioData(data);
      } catch {
        buf = null;
      }
    })();
    void ready.then(() => {
      if (finished) return;
      if (!ctx || !buf || ctx.state === 'running') {
        start(buf);
        return;
      }
      void ctx.resume().catch(() => undefined);
      setTimeout(() => {
        if (finished) return;
        if (ctx && ctx.state === 'running') {
          start(buf);
          return;
        }
        gate.classList.remove('hidden');
        const go = () => {
          root.removeEventListener('pointerdown', go);
          void ctx!.resume().then(() => start(buf), () => start(null));
        };
        root.addEventListener('pointerdown', go);
      }, 120);
    });
  });
}
