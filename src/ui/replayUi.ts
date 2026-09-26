// Replay controls: play / pause, restart, speed, a scrub bar with event
// ticks (kills, launches), which aircraft the camera follows, the camera
// mode, and exit. Drag on the view to orbit the camera, wheel to zoom.

import { el, button, clearEl } from './dom';
import type { ReplayPlayer } from '../game/replay';
import type { CameraRig } from '../render/cameraRig';
import type { Aircraft } from '../aircraft/aircraft';
import { fmtTime } from '../core/math';

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

export class ReplayUi {
  readonly root: HTMLDivElement;
  private surface: HTMLElement;
  private bar: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private timeEl!: HTMLElement;
  private range!: HTMLInputElement;
  private speedEl!: HTMLElement;
  private focusEl!: HTMLElement;
  private camEl!: HTMLElement;
  private ticks!: HTMLElement;
  private player: ReplayPlayer | null = null;
  private dragging = false;
  private scrubbing = false;
  private last = { x: 0, y: 0 };
  focus: Aircraft | null = null;
  target: Aircraft | null = null;
  camMode: 'chase' | 'flyby' | 'target' = 'chase';

  constructor(
    parent: HTMLElement,
    private cam: CameraRig,
    private onExit: () => void,
  ) {
    this.root = el('div', 'replay-ui hidden', parent);
    this.surface = el('div', 'replay-surface', this.root);
    this.surface.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.last = { x: e.clientX, y: e.clientY };
      try {
        this.surface.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    this.surface.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.cam.addLook((e.clientX - this.last.x) * 0.005, (e.clientY - this.last.y) * 0.005);
      this.last = { x: e.clientX, y: e.clientY };
    });
    const end = () => (this.dragging = false);
    this.surface.addEventListener('pointerup', end);
    this.surface.addEventListener('pointercancel', end);
    this.surface.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.cam.chaseDist = Math.max(0.45, Math.min(8, this.cam.chaseDist * (e.deltaY > 0 ? 1.12 : 0.89)));
      },
      { passive: false },
    );
    const head = el('div', 'replay-head', this.root);
    el('span', 'rtitle', head, 'TRACK REPLAY');
    this.bar = el('div', 'replay-bar', this.root);
    window.addEventListener('keydown', (e) => {
      if (this.root.classList.contains('hidden') || !this.player) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'ArrowRight') this.player.seek(this.player.t + 10);
      else if (e.code === 'ArrowLeft') this.player.seek(this.player.t - 10);
      else if (e.code === 'Escape') this.onExit();
      else if (e.code === 'KeyF') this.cycleCam();
      else if (e.code === 'Tab') {
        e.preventDefault();
        this.cycleFocus(1);
      }
    });
  }

  open(p: ReplayPlayer): void {
    this.player = p;
    this.focus = p.playerPuppet;
    this.target = null;
    this.camMode = 'chase';
    this.build();
    this.root.classList.remove('hidden');
  }

  close(): void {
    this.player = null;
    this.root.classList.add('hidden');
  }

  private build(): void {
    const p = this.player!;
    clearEl(this.bar);
    const row1 = el('div', 'rrow', this.bar);
    button('⏮', '', row1, () => {
      p.seek(0);
      p.playing = true;
    });
    this.playBtn = button('❚❚', 'primary', row1, () => this.togglePlay());
    this.timeEl = el('span', 'rtime', row1, '0:00 / 0:00');
    const scrub = el('div', 'rscrub', row1);
    this.range = el('input', '', scrub);
    this.range.type = 'range';
    this.range.min = '0';
    this.range.max = String(p.duration);
    this.range.step = '0.1';
    this.range.addEventListener('input', () => {
      this.scrubbing = true;
      p.seek(parseFloat(this.range.value));
    });
    this.range.addEventListener('change', () => (this.scrubbing = false));
    this.ticks = el('div', 'rticks', scrub);
    for (const e of p.data.events) {
      if (e.kind !== 'destroyed' && e.kind !== 'launch') continue;
      const tk = el('div', 'rtick ' + e.kind, this.ticks);
      tk.style.left = `${((e.t - p.data.start) / Math.max(1, p.duration)) * 100}%`;
    }
    const row2 = el('div', 'rrow', this.bar);
    el('span', 'rlab', row2, 'SPEED');
    button('−', '', row2, () => this.setSpeed(-1));
    this.speedEl = el('span', 'rval', row2, '1×');
    button('+', '', row2, () => this.setSpeed(1));
    el('span', 'rlab', row2, 'FOLLOW');
    button('◀', '', row2, () => this.cycleFocus(-1));
    this.focusEl = el('span', 'rval wide', row2, '');
    button('▶', '', row2, () => this.cycleFocus(1));
    el('span', 'rlab', row2, 'CAMERA');
    this.camEl = el('span', 'rval', row2, 'CHASE');
    button('CYCLE [F]', '', row2, () => this.cycleCam());
    button('EXIT REPLAY', '', row2, () => this.onExit());
  }

  private togglePlay(): void {
    const p = this.player!;
    if (!p.playing && p.t >= p.duration - 0.05) p.seek(0);
    p.playing = !p.playing;
  }

  private setSpeed(dir: number): void {
    const p = this.player!;
    const i = SPEEDS.indexOf(p.speed);
    p.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 2 : i) + dir))];
  }

  private cycleFocus(dir: number): void {
    const list = this.player!.present.filter((a) => !a.fm.crashed);
    if (list.length === 0) return;
    const i = this.focus ? list.indexOf(this.focus) : -1;
    this.focus = list[(i + dir + list.length) % list.length];
    if (this.target === this.focus) this.target = null;
  }

  private cycleCam(): void {
    if (this.camMode === 'chase') this.camMode = 'flyby';
    else if (this.camMode === 'flyby') {
      this.camMode = 'target';
      const others = this.player!.present.filter((a) => a !== this.focus && !a.fm.crashed && a.team !== this.focus?.team);
      this.target = others[0] ?? null;
      if (!this.target) this.camMode = 'chase';
    } else {
      // step through targets, then back to chase
      const others = this.player!.present.filter((a) => a !== this.focus && !a.fm.crashed);
      const i = this.target ? others.indexOf(this.target) : -1;
      if (i >= 0 && i + 1 < others.length) this.target = others[i + 1];
      else {
        this.camMode = 'chase';
        this.target = null;
      }
    }
  }

  /** Per frame: keep the widgets in sync with playback. */
  update(): void {
    const p = this.player;
    if (!p) return;
    if (!this.focus || !p.sim.aircraft.includes(this.focus)) this.focus = p.playerPuppet ?? p.present[0] ?? null;
    this.playBtn.textContent = p.playing ? '❚❚' : '▶';
    this.timeEl.textContent = `${fmtTime(p.t)} / ${fmtTime(p.duration)}`;
    if (!this.scrubbing) this.range.value = String(p.t);
    this.speedEl.textContent = `${p.speed}×`;
    const f = this.focus;
    this.focusEl.textContent = f ? `${f.callsign} · ${f.spec.shortName.toUpperCase()}${f.alive ? '' : ' (LOST)'}` : '—';
    this.camEl.textContent = this.camMode === 'target' && this.target ? `→ ${this.target.spec.shortName.toUpperCase()}` : this.camMode.toUpperCase();
  }
}
