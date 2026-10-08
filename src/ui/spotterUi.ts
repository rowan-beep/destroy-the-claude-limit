// The airshow's screen: the camera's viewfinder (focus brackets, the rule-of-thirds
// grid, the lens and shutter readout), the jet's tag (or an arrow to it off screen),
// the programme board, the card for each picture taken (stars, score, the moment,
// what to do better) and the album: every picture kept, and the spotter's logbook
// of every kind of shot of every jet.

import * as THREE from 'three';
import { el, clearEl } from './dom';
import type { SpotterMode } from '../game/modes/spotter';
import { fovFor } from '../game/modes/spotter';
import { SHOTS, RANKS, rankOf, listPhotos, photoBlob, deletePhoto, PhotoMeta } from '../game/spotterBook';
import { AIRCRAFT_TYPES, SPECS } from '../aircraft/specs';
import { saveFile } from '../net/artifact';

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
.sp-album{position:absolute;inset:0;background:#070a0ef2;display:none;pointer-events:auto;overflow:auto}
.sp-album.show{display:block}
.sp-al-top{position:sticky;top:0;display:flex;gap:10px;align-items:center;padding:14px 22px;background:#070a0ef8;border-bottom:1px solid #ffffff14;z-index:2}
.sp-al-top h2{margin:0 12px 0 0;font-size:22px;letter-spacing:.16em}
.sp-al-body{padding:16px 22px 40px}
.sp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.sp-ph{position:relative;border-radius:8px;overflow:hidden;background:#111;cursor:pointer;border:1px solid #ffffff14}
.sp-ph img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.sp-ph div{position:absolute;left:0;right:0;bottom:0;padding:16px 8px 6px;background:linear-gradient(transparent,#000c);font-size:11px;letter-spacing:.1em;display:flex;justify-content:space-between}
.sp-ph div b{color:#ffc85a}
.sp-big{position:fixed;inset:0;background:#000e;display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;z-index:5;pointer-events:auto}
.sp-big.show{display:flex}
.sp-big img{max-width:94vw;max-height:80vh;border-radius:6px}
.sp-big .sp-row{width:min(900px,94vw)}
.sp-lb{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.sp-lb-j{background:#0f141b;border:1px solid #ffffff14;border-radius:10px;padding:10px 12px}
.sp-lb-j h3{margin:0 0 6px;font-size:14px;letter-spacing:.14em;display:flex;justify-content:space-between}
.sp-lb-j h3 span{color:#ffd38a;font-size:12px}
.sp-lb-j .sp-chips span{font-size:10px;padding:3px 6px;cursor:help}
.sp-ranks{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.sp-ranks div{flex:1 1 170px;background:#0f141b;border:1px solid #ffffff14;border-radius:8px;padding:8px 10px;font-size:12px;color:#aab6c6}
.sp-ranks div.on{border-color:#ffb14a}
.sp-ranks b{display:block;color:#fff;font-size:13px;letter-spacing:.1em}
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
  private album: HTMLElement;
  private albumBody: HTMLElement;
  private big: HTMLElement;
  private btnTrack: HTMLButtonElement;
  private btnSpeed: HTMLButtonElement;
  private btnGrid: HTMLButtonElement;
  private btnSpot: HTMLButtonElement;
  private help: HTMLElement;
  /** (the key help fades out after the first half minute) */
  private helpT = 30;
  private seen = 0;
  private cardT = 0;
  private trKey = '';
  private progKey = '';
  private tab: 'photos' | 'logbook' = 'photos';
  private urls: string[] = [];

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
    // the album
    this.album = el('div', 'sp-album', this.root);
    const top = el('div', 'sp-al-top', this.album);
    el('h2', '', top, 'ALBUM');
    const tp = el('button', 'sp-btn on', top, 'PHOTOS') as HTMLButtonElement;
    const tlb = el('button', 'sp-btn', top, "SPOTTER'S LOGBOOK") as HTMLButtonElement;
    tp.addEventListener('click', () => {
      this.tab = 'photos';
      tp.classList.add('on');
      tlb.classList.remove('on');
      void this.fillAlbum();
    });
    tlb.addEventListener('click', () => {
      this.tab = 'logbook';
      tlb.classList.add('on');
      tp.classList.remove('on');
      void this.fillAlbum();
    });
    el('div', '', top).style.flex = '1';
    const close = el('button', 'sp-btn big', top, 'BACK TO THE SHOW') as HTMLButtonElement;
    close.addEventListener('click', () => this.toggleAlbum());
    this.albumBody = el('div', 'sp-al-body', this.album);
    this.big = el('div', 'sp-big', this.root);
    this.big.addEventListener('click', (e) => {
      if (e.target === this.big) this.big.classList.remove('show');
    });
    mode.onToggleAlbum = () => this.toggleAlbum();
  }

  dispose(): void {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.root.remove();
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  toggleAlbum(): void {
    const open = !this.album.classList.contains('show');
    this.album.classList.toggle('show', open);
    this.mode.albumOpen = open;
    if (!open) this.big.classList.remove('show');
    if (open) void this.fillAlbum();
  }

  private async fillAlbum(): Promise<void> {
    const body = this.albumBody;
    clearEl(body);
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    if (this.tab === 'logbook') return this.fillLogbook();
    // (a picture just taken may still be on its way into the album)
    await this.mode.saving;
    const list = await listPhotos();
    if (!list.length) {
      el('div', 'sp-note', body, 'No pictures yet. The ones that score 15 or more are kept here (the best and newest 120).');
      return;
    }
    el('div', 'sp-note', body, `${list.length} pictures · click one to see it big`).style.marginBottom = '10px';
    const grid = el('div', 'sp-grid', body);
    for (const p of list) {
      const cell = el('div', 'sp-ph', grid);
      const img = el('img', '', cell) as HTMLImageElement;
      const cap = el('div', '', cell);
      el('span', '', cap, p.jet);
      el('b', '', cap, '★'.repeat(p.stars) + ` ${p.score}`);
      void photoBlob(p.id).then((b) => {
        if (!b) return;
        const u = URL.createObjectURL(b);
        this.urls.push(u);
        img.src = u;
      });
      cell.addEventListener('click', () => this.showBig(p, img));
    }
  }

  private showBig(p: PhotoMeta, img: HTMLImageElement): void {
    const b = this.big;
    clearEl(b);
    const i = el('img', '', b) as HTMLImageElement;
    i.src = img.src;
    const r = el('div', 'sp-row', b);
    el('span', '', r, `${p.jet} · ${p.base.toUpperCase()} · ${p.lens} MM · ${new Date(p.time).toLocaleString()}`);
    el('b', '', r, `${'★'.repeat(p.stars)} ${p.score}`);
    const tags = el('div', 'sp-tags', b);
    for (const t of p.tags) el('span', '', tags, SHOTS[t]?.name ?? t);
    const row = el('div', 'sp-row', b);
    const save = el('button', 'sp-btn', row, 'SAVE PICTURE') as HTMLButtonElement;
    save.addEventListener('click', async () => {
      const name = `${p.jet.replace(/[^a-z0-9]+/gi, '-')}-${p.score}${save.textContent === 'SAVE COVER' ? '-cover' : ''}.jpg`;
      // (the cover is a data URL; the picture comes straight from the album's store)
      const blob = i.src.startsWith('data:') ? dataUrlBlob(i.src) : await photoBlob(p.id);
      if (blob) await saveFile(name, blob);
    });
    if (p.stars >= 3) {
      const cov = el('button', 'sp-btn', row, 'MAGAZINE COVER') as HTMLButtonElement;
      cov.addEventListener('click', () => {
        const url = makeCover(i, p);
        if (!url) return;
        i.src = url;
        cov.remove();
        save.textContent = 'SAVE COVER';
      });
    }
    const del = el('button', 'sp-btn', row, 'DELETE') as HTMLButtonElement;
    del.addEventListener('click', async () => {
      await deletePhoto(p.id);
      b.classList.remove('show');
      void this.fillAlbum();
    });
    const cl = el('button', 'sp-btn big', row, 'CLOSE') as HTMLButtonElement;
    cl.addEventListener('click', () => b.classList.remove('show'));
    b.classList.add('show');
  }

  private fillLogbook(): void {
    const body = this.albumBody;
    const L = this.mode.log;
    const r = rankOf(L.points);
    const ranks = el('div', 'sp-ranks', body);
    RANKS.forEach((k, i) => {
      const d = el('div', i === r.i ? 'on' : '', ranks);
      el('b', '', d, k.name);
      el('span', '', d, `${k.pts.toLocaleString('en-US')} pts · ${k.perk}`);
    });
    const tot = AIRCRAFT_TYPES.filter((t) => t !== 'X15');
    let got = 0, all = 0;
    const lb = el('div', 'sp-lb', body);
    for (const t of tot) {
      const best = L.best[t] ?? {};
      const kinds = this.kindsFor(t);
      const n = kinds.filter((k) => best[k]).length;
      got += n;
      all += kinds.length;
      const box = el('div', 'sp-lb-j', lb);
      const h = el('h3', '', box, SPECS[t].name);
      el('span', '', h, `${n} / ${kinds.length}`);
      const chips = el('div', 'sp-chips', box);
      for (const k of kinds) {
        const s = best[k] ?? 0;
        const c = el('span', s ? 'on' : '', chips, `${SHOTS[k].name}${s ? ' ' + '★'.repeat(s) : ''}`);
        c.title = SHOTS[k].hint;
      }
    }
    const head = el('div', 'sp-note', body, `${L.points.toLocaleString('en-US')} points · ${L.shots} pictures taken · best score ${L.topScore} · ${got} of ${all} shots collected`);
    body.insertBefore(head, body.firstChild);
  }

  /** the kinds of shot a jet's display offers */
  kindsFor(t: string): string[] {
    const heavy = t === 'SR71' || t === 'MIG31';
    const tvc = (SPECS[t as keyof typeof SPECS].tvcDeg ?? 0) > 0;
    return Object.keys(SHOTS).filter((k) => {
      if (k === 'cobra') return tvc && !heavy;
      if (heavy && ['vertical', 'highg', 'inverted', 'knife', 'highalpha', 'topside'].includes(k)) return false;
      if (heavy && k === 'vapor') return false;
      return true;
    });
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
    const kinds = j ? this.kindsFor(j.ac.type) : [];
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
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) this.card.classList.remove('show');
    }
  }

  private fillCard(s: NonNullable<SpotterMode['lastShot']>): void {
    const c = this.card;
    clearEl(c);
    const img = el('img', '', c) as HTMLImageElement;
    img.src = s.url;
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

/** the cover line for a picture, from the best moment in it */
const COVER_LINES: [string, string][] = [
  ['cobra', 'THE COBRA: NOSE PAST VERTICAL'],
  ['vapor', 'SHOCK WAVE: THE VAPOUR CONE UP CLOSE'],
  ['highg', 'MAX G: VAPOUR POURING OFF THE WINGS'],
  ['knife', 'KNIFE EDGE AT SHOW CENTRE'],
  ['topside', 'TOP SIDE: CRANKING IN THE TURN'],
  ['vertical', 'STRAIGHT UP ON TWIN BURNERS'],
  ['highalpha', 'SLOW, NOSE HIGH, HANGING ON THE WINGS'],
  ['inverted', 'OVER THE TOP, UPSIDE DOWN'],
  ['takeoff', 'WHEELS UP: THE DISPLAY BEGINS'],
  ['touchdown', 'ON THE NUMBERS'],
  ['gear', 'GEAR DOWN, OVER THE FENCE'],
  ['belly', 'THE UNDERSIDE: EVERY PYLON'],
  ['afterburner', 'FULL BURNERS'],
  ['headon', 'HEAD-ON'],
  ['static', 'ON THE STATIC LINE'],
];

/** a magazine cover from a picture: the jet cropped to a portrait page under the masthead */
function makeCover(img: HTMLImageElement, p: PhotoMeta): string | null {
  const W = 960, H = 1280;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g || !img.naturalWidth) return null;
  // the crop: full height, 3:4, centred on the jet (minus the caption strip at the bottom)
  const iw = img.naturalWidth, ih = img.naturalHeight - Math.round(img.naturalHeight / 30);
  const cw = Math.min(iw, ih * (W / H));
  const cx = Math.max(0, Math.min(iw - cw, (p.sx ?? 0.5) * iw - cw / 2));
  g.drawImage(img, cx, 0, cw, ih, 0, 0, W, H);
  // a darker top and bottom so the type reads
  let gr = g.createLinearGradient(0, 0, 0, 300);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, 300);
  gr = g.createLinearGradient(0, H - 420, 0, H);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = gr;
  g.fillRect(0, H - 420, W, 420);
  const font = (w: number, px: number) => `${w} ${px}px Rajdhani, 'Arial Narrow', system-ui, sans-serif`;
  // the masthead
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffffff';
  g.font = font(800, 200);
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 18;
  const mast = 'AIRSHOW';
  const mw = g.measureText(mast).width;
  g.save();
  g.translate(W / 2, 200);
  g.scale(Math.min(1, (W - 60) / mw), 1);
  g.textAlign = 'center';
  g.fillText(mast, 0, 0);
  g.restore();
  g.shadowBlur = 0;
  g.fillStyle = '#e8322c';
  g.fillRect(30, 222, W - 60, 6);
  g.fillStyle = '#ffffff';
  g.font = font(700, 26);
  g.textAlign = 'left';
  const d = new Date(p.time);
  g.fillText(`THE SPOTTER'S MONTHLY  ·  ${d.toLocaleString('en-US', { month: 'long' }).toUpperCase()} ${d.getFullYear()}`, 32, 262);
  g.textAlign = 'right';
  g.fillText(`ISSUE ${(d.getMonth() + 1) * 7 + 113}`, W - 32, 262);
  // cover lines down the left
  g.textAlign = 'left';
  g.shadowColor = 'rgba(0,0,0,0.7)';
  g.shadowBlur = 10;
  const side = [`${p.base.toUpperCase()}`, 'THE SHOW REPORT', '', `${p.lens} MM`, 'HOW THE COVER', 'WAS SHOT'];
  g.font = font(800, 34);
  side.forEach((t, i) => {
    g.fillStyle = i % 3 === 0 ? '#ffd23a' : '#ffffff';
    g.fillText(t, 32, 340 + i * 40);
  });
  // the headline: the jet and the moment
  const line = COVER_LINES.find(([t]) => p.tags.includes(t))?.[1] ?? 'DISPLAY SEASON SPECIAL';
  const short = p.jet.replace(/^(Lockheed Martin|Boeing|Sukhoi|Dassault|Saab|Eurofighter|Mikoyan|General Dynamics|McDonnell Douglas)\s+/i, '');
  g.fillStyle = '#ffd23a';
  g.font = font(700, 30);
  g.fillText(line, 32, H - 210);
  g.fillStyle = '#ffffff';
  g.font = font(800, 104);
  const hw = g.measureText(short.toUpperCase()).width;
  g.save();
  g.translate(32, H - 108);
  g.scale(Math.min(1, (W - 250) / hw), 1);
  g.fillText(short.toUpperCase(), 0, 0);
  g.restore();
  g.font = font(600, 26);
  const where: Record<string, string> = { crowd: 'FROM THE CROWD LINE', static: 'ON THE STATIC PARK', fence: 'AT THE LANDING FENCE', end: 'FROM THE RUNWAY END' };
  g.fillText(`${'★'.repeat(p.stars)}  PHOTOGRAPHED ${where[p.spot ?? 'crowd'] ?? where.crowd}`, 32, H - 60);
  g.shadowBlur = 0;
  // the barcode and the price
  const bx = W - 190, by = H - 150;
  g.fillStyle = '#ffffff';
  g.fillRect(bx, by, 160, 112);
  g.fillStyle = '#000000';
  let x = bx + 10;
  let seed = p.score * 7919 + p.time % 10007;
  while (x < bx + 150) {
    seed = (seed * 16807) % 2147483647;
    const wv = 1 + (seed % 3);
    if (seed % 2) g.fillRect(x, by + 10, wv, 72);
    x += wv + 1;
  }
  g.font = font(700, 18);
  g.textAlign = 'center';
  g.fillText('$7.99', bx + 80, by + 102);
  return c.toDataURL('image/jpeg', 0.9);
}

/** a data: URL as a Blob (no fetch: the page's security policy may not allow one) */
function dataUrlBlob(url: string): Blob {
  const [head, body] = url.split(',', 2);
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  return new Blob([bytes], { type: mime });
}
