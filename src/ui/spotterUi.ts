// The airshow's screen: the camera's viewfinder (focus brackets, the rule-of-thirds
// grid, the lens and shutter readout), the jet's tag (or an arrow to it off screen),
// the programme board, the card for each picture taken (stars, score, the moment,
// what to do better) and the album: every picture kept, and the spotter's logbook
// of every kind of shot of every jet.

import * as THREE from 'three';
import { el, clearEl } from './dom';
import type { SpotterMode } from '../game/modes/spotter';
import { fovFor } from '../game/modes/spotter';
import { SHOTS, rankOf, kindsFor } from '../game/spotterBook';
import { SPECS } from '../aircraft/specs';
import { AirshowAlbum } from './airshowAlbum';

const CSS = `
.sp-ui{position:fixed;inset:0;pointer-events:none;z-index:31;font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;color:#f1f4f8;letter-spacing:.04em}
.sp-ui.hidden{display:none}
.sp-ui button{pointer-events:auto;font:inherit;cursor:pointer}
.sp-cv{position:absolute;inset:0;width:100%;height:100%}
.sp-flash{position:absolute;inset:0;background:#fff;opacity:0;transition:opacity .12s}
.sp-tl{position:absolute;left:18px;top:14px;text-shadow:0 1px 3px #000a;max-width:min(520px,55vw)}
.sp-k{font-size:11px;letter-spacing:.24em;color:#ffd38a}
.sp-t{font-size:21px;font-weight:700;letter-spacing:.08em;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-m{font-size:15px;font-weight:600;letter-spacing:.14em;color:#ffe2b0;margin-top:2px}
.sp-prog{margin-top:8px;font-size:12px;line-height:1.55;color:#c9d4e2}
.sp-prog b{color:#fff}
.sp-prog i{font-style:normal;color:#7f8ea2}
.sp-tr{position:absolute;right:16px;top:14px;width:250px;background:#0d1219c4;border:1px solid #ffffff1f;border-radius:10px;padding:10px 12px;backdrop-filter:blur(6px)}
.sp-rank{font-size:13px;font-weight:700;letter-spacing:.14em}
.sp-bar{height:5px;border-radius:3px;background:#ffffff18;margin:6px 0 4px;overflow:hidden}
.sp-bar i{display:block;height:100%;background:linear-gradient(90deg,#ffb14a,#ffe2a6)}
.sp-row{display:flex;justify-content:space-between;font-size:12px;color:#aab6c6;padding:1px 0;font-variant-numeric:tabular-nums}
.sp-row b{color:#fff;font-weight:600}
.sp-chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px}
.sp-chips span{font-size:9px;letter-spacing:.1em;padding:2px 5px;border-radius:4px;background:#ffffff12;color:#8494a8}
.sp-chips span.on{background:#ffb14a33;color:#ffd38a}
.sp-read{position:absolute;left:50%;bottom:58px;transform:translateX(-50%);display:flex;gap:18px;align-items:baseline;font-variant-numeric:tabular-nums;text-shadow:0 1px 3px #000}
.sp-read b{font-size:22px;font-weight:700}
.sp-read span{font-size:12px;letter-spacing:.18em;color:#d2dae6}
.sp-read .on{color:#ffd38a}
.sp-bot{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 32px);display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}
.sp-btn{background:#121820d8;border:1px solid #ffffff2a;color:#f1f4f8;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;letter-spacing:.1em}
.sp-btn.on{background:#7a4a12;border-color:#ffb14a}
.sp-btn.big{background:linear-gradient(180deg,#fff2dc,#ffcf8a);color:#1a1206;border:0;font-weight:800}
.sp-card{position:absolute;right:16px;bottom:60px;width:300px;background:#0d1219ee;border:1px solid #ffffff26;border-radius:12px;overflow:hidden;opacity:0;transform:translateY(12px);transition:opacity .35s,transform .35s}
.sp-card.show{opacity:1;transform:none}
.sp-card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
.sp-card-b{padding:9px 12px 11px}
.sp-stars{font-size:18px;letter-spacing:2px;color:#ffc85a}
.sp-stars i{font-style:normal;color:#ffffff30}
.sp-score{float:right;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.sp-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.sp-tags span{font-size:10px;letter-spacing:.12em;padding:2px 6px;border-radius:4px;background:#ffb14a2a;color:#ffd38a}
.sp-tags span.new{background:#ffb14a;color:#1a1206;font-weight:700}
.sp-note{font-size:12px;color:#c9d4e2;margin-top:6px}
.sp-pts{font-size:12px;color:#9fe8b4;margin-top:4px;letter-spacing:.1em}
.sp-tag{position:absolute;transform:translate(-50%,-100%);font-size:11px;font-weight:700;letter-spacing:.14em;text-shadow:0 1px 3px #000;white-space:nowrap;text-align:center;color:#ffe2b0}
.sp-tag i{display:block;font-style:normal;font-weight:500;font-size:10px;color:#d2dae6}
.sp-arrow{position:absolute;width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:16px solid #ffd38a;filter:drop-shadow(0 1px 2px #000)}
.sp-help{position:absolute;left:50%;bottom:90px;transform:translateX(-50%);width:max-content;max-width:min(600px,calc(100vw - 680px));text-align:center;font-size:11px;color:#c3cdda;letter-spacing:.1em;line-height:1.5;text-shadow:0 1px 2px #000;transition:opacity 1.5s}
.sp-help.dim{opacity:0}
@media (max-width:1000px){.sp-help{display:none}}
@media (max-width:760px){.sp-tr{width:180px}.sp-card{width:220px}.sp-prog{display:none}}
`;

export class SpotterUi {
  readonly root: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private flashEl: HTMLElement;
  private elT: HTMLElement;
  private elM: HTMLElement;
  private elProg: HTMLElement;
  private elTr: HTMLElement;
  private elRead: HTMLElement;
  private elTag: HTMLElement;
  private elArrow: HTMLElement;
  private card: HTMLElement;
  private album: AirshowAlbum;
  private btnTrack: HTMLButtonElement;
  private btnSpeed: HTMLButtonElement;
  private btnGrid: HTMLButtonElement;
  private btnSpot: HTMLButtonElement;
  private help: HTMLElement;
  /** (the key help fades out after the first half minute) */
  private helpT = 30;
  private seen = 0;
  private cardImg: HTMLImageElement | null = null;
  private cardShot: SpotterMode['lastShot'] = null;
  private cardT = 0;
  private trKey = '';
  private progKey = '';

  constructor(
    parent: HTMLElement,
    private mode: SpotterMode,
    private onExit: () => void,
  ) {
    if (!document.getElementById('sp-style')) {
      const st = document.createElement('style');
      st.id = 'sp-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = el('div', 'sp-ui', parent);
    this.cv = el('canvas', 'sp-cv', this.root);
    this.flashEl = el('div', 'sp-flash', this.root);
    const tl = el('div', 'sp-tl', this.root);
    el('div', 'sp-k', tl, `AIRSHOW · ${mode.field.name.toUpperCase()}`);
    this.elT = el('div', 'sp-t', tl, '');
    this.elM = el('div', 'sp-m', tl, '');
    this.elProg = el('div', 'sp-prog', tl, '');
    this.elTr = el('div', 'sp-tr', this.root);
    this.elRead = el('div', 'sp-read', this.root);
    this.elTag = el('div', 'sp-tag', this.root);
    this.elArrow = el('div', 'sp-arrow', this.root);
    this.card = el('div', 'sp-card', this.root);
    this.help = el('div', 'sp-help', this.root);
    this.help.textContent = 'DRAG / WASD look · WHEEL or + − zoom · CLICK or SPACE shoot · T auto-track · V photo spot · N next act · F show speed · TAB album · ESC pause';
    const bot = el('div', 'sp-bot', this.root);
    const b = (t: string, fn: () => void, cls = '') => {
      const x = el('button', 'sp-btn ' + cls, bot, t) as HTMLButtonElement;
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
        x.blur();
      });
      return x;
    };
    b('−', () => mode.zoom(-1));
    b('+', () => mode.zoom(1));
    this.btnTrack = b('AUTO-TRACK', () => (mode.track = !mode.track));
    this.btnGrid = b('GRID', () => (mode.grid = !mode.grid));
    this.btnSpot = b('SPOT', () => mode.nextSpot());
    this.btnSpeed = b('SHOW 1×', () => (mode.showSpeed = mode.showSpeed >= 4 ? 1 : mode.showSpeed * 2));
    b('NEXT ACT', () => mode.nextAct());
    b('ALBUM', () => this.toggleAlbum(), 'big');
    b('EXIT', () => onExit());
    // the album (the same one the main menu opens)
    this.album = new AirshowAlbum(document.body, () => mode.log, 'BACK TO THE SHOW');
    // (the show keeps ignoring the keys for a moment, so the Escape that closed it doesn't pause the game)
    this.album.onClose = () => setTimeout(() => (mode.albumOpen = false), 150);
    mode.onToggleAlbum = () => this.toggleAlbum();
  }

  dispose(): void {
    this.album.dispose();
    this.root.remove();
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  toggleAlbum(): void {
    const open = !this.album.isOpen;
    if (open) {
      this.mode.albumOpen = true;
      // (a picture just taken may still be on its way into the album)
      void this.mode.saving.then(() => this.album.open());
    } else this.album.close();
  }

  /** every frame */
  update(dt: number, cam: THREE.PerspectiveCamera, w: number, h: number): void {
    const m = this.mode;
    const j = m.jet;
    // the programme
    const pk = `${m.actI}|${j?.label ?? ''}|${j?.done}`;
    if (pk !== this.progKey) {
      this.progKey = pk;
      this.elT.textContent = j ? j.ac.spec.name.toUpperCase() : '';
      this.elM.textContent = j ? (j.done ? 'TAXIING IN · NEXT ACT SOON' : j.label === 'REPOSITIONING' ? 'REPOSITIONING ⏩' : j.label) : '';
      clearEl(this.elProg);
      if (j) {
        const items = j.routine.items;
        const cur = j.label;
        for (const it of items.slice(0, 12)) {
          const d = el('div', '', this.elProg);
          if (it.label === cur) el('b', '', d, `▸ ${it.label}`);
          else el(it.t < j.t ? 'i' : 'span', '', d, `  ${it.label}`);
        }
        const nxt = m.acts[(m.actI + 1) % m.acts.length];
        el('div', '', this.elProg).innerHTML = `<i>NEXT: ${SPECS[nxt].name.toUpperCase()}</i>`;
      }
    }
    // the spotter's panel
    const L = m.log;
    const r = rankOf(L.points);
    const kinds = j ? kindsFor(j.ac.type) : [];
    const best = j ? L.best[j.ac.type] ?? {} : {};
    const tk = `${L.points}|${j?.ac.type}|${kinds.map((k) => best[k] ?? 0).join('')}`;
    if (tk !== this.trKey) {
      this.trKey = tk;
      const frac = r.next ? (L.points - r.rank.pts) / (r.next.pts - r.rank.pts) : 1;
      this.elTr.innerHTML = `<div class="sp-rank">${r.rank.name}</div><div class="sp-bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>` +
        `<div class="sp-row"><span>POINTS</span><b>${L.points.toLocaleString('en-US')}${r.next ? ` / ${r.next.pts.toLocaleString('en-US')}` : ''}</b></div>` +
        `<div class="sp-row"><span>PICTURES</span><b>${L.shots}</b></div>` +
        (j ? `<div class="sp-row" style="margin-top:6px"><span>${j.ac.spec.shortName.toUpperCase()} SHOTS</span><b>${kinds.filter((k) => best[k]).length} / ${kinds.length}</b></div><div class="sp-chips">${kinds.map((k) => `<span class="${best[k] ? 'on' : ''}">${SHOTS[k].name}</span>`).join('')}</div>` : '');
    }
    if (this.helpT > 0) {
      this.helpT -= dt;
      if (this.helpT <= 0) this.help.classList.add('dim');
    }
    // the readout
    this.elRead.innerHTML = `<span>LENS</span><b>${Math.round(m.focal)} MM</b><span>MAX ${m.maxFocal()}</span><span>1/500 S</span><span class="${m.track ? 'on' : ''}">${m.track ? 'AUTO-TRACK' : 'MANUAL'}</span><span>SHOW ${m.showSpeed}×</span>`;
    this.btnTrack.classList.toggle('on', m.track);
    this.btnGrid.classList.toggle('on', m.grid);
    this.btnSpeed.textContent = `SHOW ${m.showSpeed}×`;
    const sp = m.spots[m.spotI];
    const spt = sp ? sp.name : 'SPOT';
    if (this.btnSpot.textContent !== spt) this.btnSpot.textContent = spt;
    // the flash of the shutter
    this.flashEl.style.opacity = String(Math.min(0.55, m.flashing * 5));
    // the viewfinder
    this.drawFinder(cam, w, h);
    // the jet's tag, or an arrow toward it
    this.placeTag(cam, w, h);
    // a new picture: its card
    const s = m.lastShot;
    if (s && m.shotSeq !== this.seen) {
      this.seen = m.shotSeq;
      this.fillCard(s);
      this.cardT = 5;
    }
    if (this.cardImg && this.cardShot?.url && !this.cardImg.src) this.cardImg.src = this.cardShot.url;
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) this.card.classList.remove('show');
    }
  }

  private fillCard(s: NonNullable<SpotterMode['lastShot']>): void {
    const c = this.card;
    clearEl(c);
    const img = el('img', '', c) as HTMLImageElement;
    // (the picture arrives a moment after the score)
    if (s.url) img.src = s.url;
    this.cardImg = img;
    this.cardShot = s;
    const b = el('div', 'sp-card-b', c);
    const st = el('div', 'sp-stars', b);
    st.innerHTML = '★'.repeat(s.meta.stars) + `<i>${'★'.repeat(5 - s.meta.stars)}</i>`;
    el('span', 'sp-score', st, String(s.meta.score));
    const tags = el('div', 'sp-tags', b);
    for (const t of s.meta.tags) el('span', s.newTags.includes(t) ? 'new' : '', tags, (s.newTags.includes(t) ? 'NEW · ' : '') + (SHOTS[t]?.name ?? t));
    for (const n of s.notes.slice(0, 2)) el('div', 'sp-note', b, n);
    if (s.points) el('div', 'sp-pts', b, `+${s.points} POINTS`);
    if (s.rankUp) el('div', 'sp-pts', b, `RANK UP: ${s.rankUp}`).style.color = '#ffd38a';
    c.classList.add('show');
  }

  private drawFinder(cam: THREE.PerspectiveCamera, w: number, h: number): void {
    const cv = this.cv;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const m = this.mode;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1.5;
    // the frame's corners
    const inset = 28, L = 34;
    for (const [x, y, sx, sy] of [[inset, inset, 1, 1], [w - inset, inset, -1, 1], [inset, h - inset, 1, -1], [w - inset, h - inset, -1, -1]] as [number, number, number, number][]) {
      g.beginPath();
      g.moveTo(x, y + sy * L);
      g.lineTo(x, y);
      g.lineTo(x + sx * L, y);
      g.stroke();
    }
    // the thirds
    if (m.grid) {
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.lineWidth = 1;
      g.beginPath();
      for (const k of [1 / 3, 2 / 3]) {
        g.moveTo(w * k, 0);
        g.lineTo(w * k, h);
        g.moveTo(0, h * k);
        g.lineTo(w, h * k);
      }
      g.stroke();
    }
    // the focus point: it locks green on the jet
    const sp = m.screenPos(cam, w, h);
    const onJet = !!sp && Math.abs(sp.x - w / 2) < w * 0.12 && Math.abs(sp.y - h / 2) < h * 0.12;
    g.strokeStyle = onJet ? 'rgba(120,255,150,0.95)' : 'rgba(255,255,255,0.7)';
    g.lineWidth = 2;
    const s = 22;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = w / 2 + sx * s, y = h / 2 + sy * s;
      g.beginPath();
      g.moveTo(x, y - sy * 8);
      g.lineTo(x, y);
      g.lineTo(x - sx * 8, y);
      g.stroke();
    }
    // how the jet is moving across the frame: a short streak (long = blurry: pan with it)
    if (sp && m.jet && !m.jet.done) {
      const v = m.screenVel;
      const blur = v.length() / 500;
      if (blur > 2) {
        g.strokeStyle = blur > 10 ? 'rgba(255,120,90,0.7)' : 'rgba(255,220,140,0.6)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sp.x, sp.y);
        g.lineTo(sp.x - (v.x / 500) * 4, sp.y - (v.y / 500) * 4);
        g.stroke();
      }
    }
    // the angle of view, small, at the top
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.font = '600 11px Rajdhani, system-ui';
    g.fillText(`${fovFor(m.focal).toFixed(1)}° VIEW`, w / 2 - 22, inset + 12);
  }

  private placeTag(cam: THREE.PerspectiveCamera, w: number, h: number): void {
    const m = this.mode;
    const j = m.jet;
    const tag = this.elTag, arrow = this.elArrow;
    if (!j || j.done) {
      tag.style.display = arrow.style.display = 'none';
      return;
    }
    const fm = j.ac.fm;
    const v = fm.pos.clone().project(cam);
    const dist = fm.pos.distanceTo(m.eye);
    const inView = v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95;
    if (inView) {
      arrow.style.display = 'none';
      tag.style.display = '';
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      // (above the jet, clear of it at any zoom)
      const px = (Math.max(j.ac.spec.span, j.ac.spec.length) / (2 * dist * Math.tan((cam.fov * Math.PI) / 360))) * h * 0.5;
      tag.style.left = `${x.toFixed(0)}px`;
      tag.style.top = `${(y - Math.min(h * 0.4, px + 18)).toFixed(0)}px`;
      tag.innerHTML = `${j.ac.spec.name.toUpperCase()}<i>${Math.round(dist)} m · ${Math.round(fm.tas * 1.944)} kt</i>`;
    } else {
      tag.style.display = 'none';
      arrow.style.display = '';
      // point to it from the middle, at the edge
      let dx = v.x, dy = -v.y;
      if (v.z > 1) {
        dx = -dx;
        dy = -dy;
      }
      const ang = Math.atan2(dy, dx);
      const r = Math.min(w, h) * 0.38;
      arrow.style.left = `${(w / 2 + Math.cos(ang) * r - 9).toFixed(0)}px`;
      arrow.style.top = `${(h / 2 + Math.sin(ang) * r - 8).toFixed(0)}px`;
      arrow.style.transform = `rotate(${(ang + Math.PI / 2).toFixed(3)}rad)`;
    }
  }
}

