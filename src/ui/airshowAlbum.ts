// The airshow album: every picture kept, browsable in the show (TAB) and from the
// main menu (PHOTO ALBUM). Filter by jet, by what the jet is doing in the picture
// (the kind of shot), by rating and favourites; sort by date, rating or jet, with
// the pictures grouped under headings. Thumbnails load only as they scroll into
// view, so a full album opens at once. A picture opens big, with its details, and
// can be saved, made into a magazine cover, starred as a favourite or deleted.
// The second tab is the spotter's logbook: the ranks, and every kind of shot of
// every jet with the best stars for each.

import { el, clearEl } from './dom';
import { SHOTS, RANKS, rankOf, listPhotos, photoBlob, photoThumb, photoRaw, savePhoto, deletePhoto, deletePhotos, setFavourite, kindsFor, PhotoMeta, SpotterLog, MAX_PHOTOS } from '../game/spotterBook';
import { fmtShutter, fmtAperture, fmtEv, STYLE_NAMES, STYLE_LOOK, kelvinRgb, Style } from '../game/camera/cameraBody';
import { develop, DevelopParams } from '../game/camera/develop';
import { process as developFrame } from '../game/camera/processor';
import { AIRCRAFT_TYPES, AircraftType, SPECS } from '../aircraft/specs';
import { saveFile } from '../net/artifact';

const CSS = `
.aa{position:fixed;inset:0;z-index:60;background:#06080bf5;color:#eef2f7;font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;letter-spacing:.04em;display:none;flex-direction:column}
.aa.show{display:flex}
.aa button{font:inherit;cursor:pointer;color:inherit}
.aa-top{display:flex;align-items:center;gap:14px;padding:14px 22px 10px;border-bottom:1px solid #ffffff12;flex-wrap:wrap}
.aa-title{font-size:24px;font-weight:700;letter-spacing:.2em}
.aa-tabs{display:flex;gap:6px}
.aa-tab{background:#ffffff0d;border:1px solid #ffffff1c;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:700;letter-spacing:.14em}
.aa-tab.on{background:#7a4a12;border-color:#ffb14a}
.aa-tab i{font-style:normal;color:#ffd38a;margin-left:6px}
.aa-sp{flex:1}
.aa-close{background:linear-gradient(180deg,#fff2dc,#ffcf8a);color:#1a1206!important;border:0;border-radius:8px;padding:8px 16px;font-weight:800;letter-spacing:.12em}
.aa-bar{padding:10px 22px 6px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #ffffff0d}
.aa-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.aa-lab{font-size:11px;letter-spacing:.2em;color:#8796a8;min-width:58px}
.aa-seg{display:flex;border:1px solid #ffffff1f;border-radius:8px;overflow:hidden}
.aa-seg button{background:transparent;border:0;border-right:1px solid #ffffff14;padding:5px 11px;font-size:12px;font-weight:700;letter-spacing:.1em;color:#c4cfdc}
.aa-seg button:last-child{border-right:0}
.aa-seg button.on{background:#ffb14a;color:#1a1206}
.aa-chips{display:flex;gap:5px;overflow-x:auto;scrollbar-width:thin;padding-bottom:2px;flex:1;min-width:0}
.aa-chip{white-space:nowrap;background:#ffffff0b;border:1px solid #ffffff17;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600;letter-spacing:.08em;color:#c4cfdc}
.aa-chip i{font-style:normal;color:#8796a8;margin-left:5px;font-weight:500}
.aa-chip.on{background:#ffb14a26;border-color:#ffb14a;color:#ffe2b0}
.aa-chip.on i{color:#ffd38a}
.aa-fav{white-space:nowrap;background:#ffffff0b;border:1px solid #ffffff17;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:700;letter-spacing:.1em;color:#c4cfdc}
.aa-fav.on{background:#e8455a2e;border-color:#e8455a;color:#ffc2cb}
.aa-body{flex:1;overflow-y:auto;padding:6px 22px 40px}
.aa-sum{font-size:12px;color:#8796a8;letter-spacing:.12em;margin:8px 0 2px}
.aa-gh{position:sticky;top:0;z-index:2;background:linear-gradient(#06080b 70%,#06080b00);padding:14px 0 8px;font-size:13px;font-weight:700;letter-spacing:.2em;color:#ffd38a;display:flex;gap:10px;align-items:baseline}
.aa-gh i{font-style:normal;color:#8796a8;font-weight:500;letter-spacing:.12em;font-size:12px}
.aa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.aa-card{position:relative;border-radius:10px;overflow:hidden;background:#11161d;cursor:pointer;border:1px solid #ffffff12;transition:transform .12s,border-color .12s}
.aa-card:hover{transform:translateY(-2px);border-color:#ffb14a80}
.aa-card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#0b0e12}
.aa-cap{padding:7px 9px 8px}
.aa-cap-t{display:flex;justify-content:space-between;font-size:13px;font-weight:700;letter-spacing:.08em}
.aa-st{color:#ffc85a;letter-spacing:1px}
.aa-st i{font-style:normal;color:#ffffff26}
.aa-cap-s{font-size:11px;color:#8796a8;letter-spacing:.1em;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aa-heart{position:absolute;top:7px;right:8px;font-size:17px;color:#ff5a6e;text-shadow:0 1px 3px #000}
.aa-score{position:absolute;top:7px;left:8px;font-size:12px;font-weight:700;background:#000a;border-radius:5px;padding:1px 6px}
.aa-empty{margin:60px auto;max-width:520px;text-align:center;color:#8796a8;font-size:15px;line-height:1.6}
.aa-more{height:1px}
.aa-selbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.aa-sbtn{white-space:nowrap;background:#ffffff0b;border:1px solid #ffffff1f;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:700;letter-spacing:.1em;color:#c4cfdc}
.aa-sbtn:hover{background:#ffffff1a}
.aa-sbtn.on{background:#ffb14a;color:#1a1206;border-color:#ffb14a}
.aa-sbtn.trash{color:#ffb3b3;border-color:#ff6b6b66}
.aa-sbtn.trash.sure{background:#e8455a;color:#fff;border-color:#e8455a}
.aa-sbtn:disabled{opacity:.35;cursor:default}
.aa-scount{font-size:12px;letter-spacing:.14em;color:#ffd38a;min-width:90px}
.aa-tick{position:absolute;top:7px;right:8px;width:24px;height:24px;border-radius:50%;border:2px solid #fffc;background:#0008;display:none;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#1a1206;box-shadow:0 1px 4px #000}
.aa.selecting .aa-tick{display:flex}
.aa.selecting .aa-heart{right:38px}
.aa-card.sel{border-color:#ffb14a;box-shadow:0 0 0 2px #ffb14a inset}
.aa-card.sel .aa-tick{background:#ffb14a;border-color:#ffb14a}
.aa-card.sel img{opacity:.72}
.aa-dev{display:flex;flex-direction:column;gap:6px;margin-top:4px;padding:8px;border:1px solid #ffb14a55;border-radius:8px;background:#ffb14a0d}
.aa-dev label{display:grid;grid-template-columns:88px 1fr 46px;align-items:center;gap:6px;font-size:11px;letter-spacing:.12em;color:#c6d0dc}
.aa-dev input[type=range]{width:100%;accent-color:#ffb14a}
.aa-dev select{background:#0c1016;color:#eef2f7;border:1px solid #ffffff2a;border-radius:6px;padding:3px;font:inherit;font-size:12px}
.aa-dev b{font-size:12px;text-align:right;font-variant-numeric:tabular-nums}
.aa-raw{position:absolute;top:7px;left:44px;font-size:10px;font-weight:800;letter-spacing:.12em;background:#3c8cff;color:#fff;border-radius:4px;padding:1px 5px}
.aa-big{position:fixed;inset:0;z-index:3;background:#000f;display:none;grid-template-columns:1fr 330px}
.aa-big.show{display:grid}
.aa-big-img{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;padding:18px}
.aa-big-img img{max-width:100%;max-height:100%;border-radius:6px;box-shadow:0 10px 40px #000;cursor:zoom-in}
.aa-big.full{grid-template-columns:1fr}
.aa-big.full .aa-side{display:none}
.aa-big.full .aa-big-img{padding:0}
.aa-big.full .aa-big-img img{border-radius:0;box-shadow:none;cursor:zoom-out;width:100%;height:100%;object-fit:contain}
.aa-fs{position:absolute;right:14px;bottom:14px;border-radius:8px;background:#000a;border:1px solid #ffffff33;padding:6px 10px;font-size:12px;font-weight:700;letter-spacing:.12em}
.aa-nav{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:64px;border-radius:10px;background:#ffffff14;border:1px solid #ffffff22;font-size:26px}
.aa-nav:hover{background:#ffffff26}
.aa-side{background:#0c1016;border-left:1px solid #ffffff14;padding:20px 18px;display:flex;flex-direction:column;gap:10px;overflow-y:auto}
.aa-side h3{margin:0;font-size:20px;letter-spacing:.1em}
.aa-side .aa-st{font-size:22px}
.aa-kv{display:flex;justify-content:space-between;font-size:13px;color:#8796a8;border-bottom:1px solid #ffffff0d;padding:4px 0}
.aa-kv b{color:#eef2f7;font-weight:600}
.aa-tags{display:flex;flex-wrap:wrap;gap:5px}
.aa-tags span{font-size:11px;letter-spacing:.12em;padding:3px 8px;border-radius:5px;background:#ffb14a2a;color:#ffd38a}
.aa-act{display:flex;flex-direction:column;gap:7px;margin-top:6px}
.aa-btn{background:#ffffff0d;border:1px solid #ffffff22;border-radius:8px;padding:9px 12px;font-size:13px;font-weight:700;letter-spacing:.12em;text-align:left}
.aa-btn:hover{background:#ffffff1c}
.aa-btn.red{color:#ffb3b3;border-color:#ff6b6b55}
.aa-btn.gold{background:linear-gradient(180deg,#fff2dc,#ffcf8a);color:#1a1206;border:0}
.aa-ranks{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
.aa-ranks div{flex:1 1 180px;background:#0f141b;border:1px solid #ffffff14;border-radius:8px;padding:9px 11px;font-size:12px;color:#8796a8}
.aa-ranks div.on{border-color:#ffb14a;background:#ffb14a14}
.aa-ranks b{display:block;color:#fff;font-size:13px;letter-spacing:.12em;margin-bottom:2px}
.aa-lb{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.aa-lb-j{background:#0f141b;border:1px solid #ffffff14;border-radius:10px;padding:10px 12px}
.aa-lb-j h4{margin:0 0 8px;font-size:14px;letter-spacing:.14em;display:flex;justify-content:space-between}
.aa-lb-j h4 span{color:#ffd38a;font-size:12px}
.aa-lb-bar{height:4px;border-radius:2px;background:#ffffff14;margin:-2px 0 8px;overflow:hidden}
.aa-lb-bar i{display:block;height:100%;background:linear-gradient(90deg,#ffb14a,#ffe2a6)}
.aa-lb-j .aa-chips{flex-wrap:wrap;overflow:visible}
.aa-lb-j .aa-chip{font-size:11px;padding:3px 8px;cursor:help}
@media (max-width:820px){.aa-big{grid-template-columns:1fr;grid-template-rows:1fr auto}.aa-side{max-height:45vh}.aa-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
`;

type Sort = 'new' | 'old' | 'best' | 'jet';
interface View {
  jet: AircraftType | 'all';
  shot: string;
  stars: number;
  fav: boolean;
  sort: Sort;
}
const VIEW_KEY = 'triad.album.view';
const PAGE = 72;

const short = (t: AircraftType) => SPECS[t]?.shortName ?? t;
const starText = (n: number) => `${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i>`;
const SPOT_NAME: Record<string, string> = { crowd: 'Crowd line', static: 'Static park', fence: 'Landing fence', end: 'Runway end' };

export class AirshowAlbum {
  readonly root: HTMLDivElement;
  /** the album closed (the show un-pauses its input) */
  onClose: (() => void) | null = null;
  private body: HTMLElement;
  private bar: HTMLElement;
  private tabPhotos: HTMLButtonElement;
  private tabLog: HTMLButtonElement;
  private tab: 'photos' | 'logbook' = 'photos';
  private view: View = { jet: 'all', shot: 'all', stars: 0, fav: false, sort: 'new' };
  private all: PhotoMeta[] = [];
  private shown: PhotoMeta[] = [];
  private rendered = 0;
  private curGrid: HTMLElement | null = null;
  private curGroup = '';
  private thumbUrls = new Map<string, string>();
  private io: IntersectionObserver | null = null;
  private moreIo: IntersectionObserver | null = null;
  private big: HTMLElement;
  private bigI = -1;
  private bigUrl = '';
  private keyFn = (e: KeyboardEvent) => this.onKey(e);
  /** picking pictures to delete (or save) together */
  private selecting = false;
  private sel = new Set<string>();
  private lastPick = -1;
  private selCount: HTMLElement | null = null;
  private trashBtn: HTMLButtonElement | null = null;
  private trashSure = false;

  constructor(
    parent: HTMLElement,
    private getLog: () => SpotterLog,
    closeLabel = 'CLOSE',
  ) {
    if (!document.getElementById('aa-style')) {
      const st = document.createElement('style');
      st.id = 'aa-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      if (v && typeof v === 'object') this.view = { ...this.view, ...v };
    } catch {
      /* (defaults) */
    }
    this.root = el('div', 'aa', parent);
    const top = el('div', 'aa-top', this.root);
    el('div', 'aa-title', top, 'ALBUM');
    const tabs = el('div', 'aa-tabs', top);
    this.tabPhotos = el('button', 'aa-tab on', tabs, 'PHOTOS') as HTMLButtonElement;
    this.tabLog = el('button', 'aa-tab', tabs, "SPOTTER'S LOGBOOK") as HTMLButtonElement;
    this.tabPhotos.addEventListener('click', () => this.setTab('photos'));
    this.tabLog.addEventListener('click', () => this.setTab('logbook'));
    el('div', 'aa-sp', top);
    const close = el('button', 'aa-close', top, closeLabel) as HTMLButtonElement;
    close.addEventListener('click', () => this.close());
    this.bar = el('div', 'aa-bar', this.root);
    this.body = el('div', 'aa-body', this.root);
    this.big = el('div', 'aa-big', this.root);
  }

  get isOpen(): boolean {
    return this.root.classList.contains('show');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else void this.open();
  }

  async open(tab: 'photos' | 'logbook' = this.tab): Promise<void> {
    this.root.classList.add('show');
    window.addEventListener('keydown', this.keyFn, true);
    this.setTab(tab);
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.remove('show');
    window.removeEventListener('keydown', this.keyFn, true);
    this.closeBig();
    this.freeThumbs();
    if (this.selecting) this.setSelecting(false);
    this.onClose?.();
  }

  dispose(): void {
    this.close();
    this.root.remove();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    // (keys on a slider or a text box are theirs: the arrows move the slider, not the picture)
    const tg = e.target as HTMLElement | null;
    if (tg && e.code !== 'Escape' && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)) return;
    if (this.big.classList.contains('show')) {
      if (e.code === 'ArrowRight') this.step(1);
      else if (e.code === 'ArrowLeft') this.step(-1);
      else if (e.code === 'KeyF') this.toggleFull();
      else if (e.code === 'Escape') {
        if (this.big.classList.contains('full')) this.toggleFull();
        else this.closeBig();
      } else return;
    } else if (this.selecting && e.code === 'Escape') this.setSelecting(false);
    else if (this.selecting && (e.code === 'Delete' || e.code === 'Backspace')) void this.trash();
    else if (this.tab === 'photos' && e.code === 'KeyA' && (e.ctrlKey || e.metaKey)) {
      if (!this.selecting) this.setSelecting(true);
      this.selectAll();
    } else if (e.code === 'Escape' || e.code === 'Tab') this.close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  private save(): void {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(this.view));
    } catch {
      /* (this session only) */
    }
  }

  private setTab(t: 'photos' | 'logbook'): void {
    this.tab = t;
    this.tabPhotos.classList.toggle('on', t === 'photos');
    this.tabLog.classList.toggle('on', t === 'logbook');
    if (t === 'logbook') {
      clearEl(this.bar);
      this.bar.style.display = 'none';
      this.fillLogbook();
    } else {
      this.bar.style.display = '';
      void this.loadPhotos();
    }
  }

  // ------------------------------------------------------------------ photos

  private async loadPhotos(): Promise<void> {
    this.all = await listPhotos();
    this.tabPhotos.innerHTML = `PHOTOS<i>${this.all.length}</i>`;
    this.fillBar();
    this.fillGrid();
  }

  /** the filters: sort, rating, favourites; the jets and the kinds of shot there are pictures of */
  private fillBar(): void {
    const b = this.bar;
    clearEl(b);
    const v = this.view;
    const r1 = el('div', 'aa-row', b);
    el('span', 'aa-lab', r1, 'SORT');
    this.seg(r1, [['new', 'NEWEST'], ['old', 'OLDEST'], ['best', 'BEST RATED'], ['jet', 'BY JET']], v.sort, (x) => (v.sort = x as Sort));
    el('span', 'aa-lab', r1, 'RATING').style.marginLeft = '10px';
    this.seg(r1, [['0', 'ANY'], ['3', '★3+'], ['4', '★4+'], ['5', '★5']], String(v.stars), (x) => (v.stars = +x));
    const fav = el('button', 'aa-fav' + (v.fav ? ' on' : ''), r1, `♥ FAVOURITES · ${this.all.filter((p) => p.fav).length}`) as HTMLButtonElement;
    fav.addEventListener('click', () => {
      v.fav = !v.fav;
      this.changed();
    });
    // jets: only those with pictures, with how many
    const jets = new Map<AircraftType, number>();
    for (const p of this.all) jets.set(p.type, (jets.get(p.type) ?? 0) + 1);
    const r2 = el('div', 'aa-row', b);
    el('span', 'aa-lab', r2, 'JET');
    const c2 = el('div', 'aa-chips', r2);
    this.chip(c2, 'ALL JETS', this.all.length, v.jet === 'all', () => (v.jet = 'all'));
    for (const t of AIRCRAFT_TYPES) if (jets.has(t)) this.chip(c2, short(t).toUpperCase(), jets.get(t)!, v.jet === t, () => (v.jet = t));
    // what the jet is doing: the kinds of shot (among the pictures of the jet picked)
    const pool = v.jet === 'all' ? this.all : this.all.filter((p) => p.type === v.jet);
    const kinds = new Map<string, number>();
    let plain = 0;
    for (const p of pool) {
      if (!p.tags.length) plain++;
      for (const t of p.tags) kinds.set(t, (kinds.get(t) ?? 0) + 1);
    }
    const r3 = el('div', 'aa-row', b);
    el('span', 'aa-lab', r3, 'SHOT');
    const c3 = el('div', 'aa-chips', r3);
    this.chip(c3, 'EVERYTHING', pool.length, v.shot === 'all', () => (v.shot = 'all'));
    for (const k of Object.keys(SHOTS)) if (kinds.has(k)) this.chip(c3, SHOTS[k].name, kinds.get(k)!, v.shot === k, () => (v.shot = k));
    if (plain) this.chip(c3, 'PORTRAITS', plain, v.shot === 'none', () => (v.shot = 'none'));
    // picking several pictures: select, select all, delete
    const r4 = el('div', 'aa-row aa-selbar', b);
    el('span', 'aa-lab', r4, 'EDIT');
    const selB = el('button', 'aa-sbtn' + (this.selecting ? ' on' : ''), r4, this.selecting ? '✓ SELECTING' : '☐ SELECT') as HTMLButtonElement;
    selB.title = 'Click pictures to pick them (shift-click picks a run of them; Ctrl+A picks all)';
    selB.addEventListener('click', () => this.setSelecting(!this.selecting));
    if (this.selecting) {
      const all = el('button', 'aa-sbtn', r4, 'SELECT ALL') as HTMLButtonElement;
      all.addEventListener('click', () => this.selectAll());
      const none = el('button', 'aa-sbtn', r4, 'CLEAR') as HTMLButtonElement;
      none.addEventListener('click', () => {
        this.sel.clear();
        this.syncSel();
      });
      this.selCount = el('span', 'aa-scount', r4);
      this.trashBtn = el('button', 'aa-sbtn trash', r4) as HTMLButtonElement;
      this.trashBtn.addEventListener('click', () => void this.trash());
      const done = el('button', 'aa-sbtn', r4, 'DONE') as HTMLButtonElement;
      done.addEventListener('click', () => this.setSelecting(false));
    } else {
      this.selCount = null;
      this.trashBtn = null;
      el('span', 'aa-cap-s', r4, 'Pick pictures to delete many at once').style.marginTop = '0';
    }
    this.syncSel();
  }

  private setSelecting(on: boolean): void {
    this.selecting = on;
    if (!on) this.sel.clear();
    this.lastPick = -1;
    this.root.classList.toggle('selecting', on);
    this.fillBar();
    this.syncSel();
  }

  /** every picture the filters show */
  private selectAll(): void {
    for (const p of this.shown) this.sel.add(p.id);
    this.syncSel();
  }

  private toggleSel(i: number, range: boolean): void {
    const p = this.shown[i];
    if (!p) return;
    if (range && this.lastPick >= 0) {
      const on = !this.sel.has(p.id);
      const [a, z] = this.lastPick < i ? [this.lastPick, i] : [i, this.lastPick];
      for (let k = a; k <= z; k++) {
        if (on) this.sel.add(this.shown[k].id);
        else this.sel.delete(this.shown[k].id);
      }
    } else if (this.sel.has(p.id)) this.sel.delete(p.id);
    else this.sel.add(p.id);
    this.lastPick = i;
    this.syncSel();
  }

  /** the ticks on the cards, the count and the trash button */
  private syncSel(): void {
    for (const c of this.body.querySelectorAll<HTMLElement>('.aa-card')) c.classList.toggle('sel', this.sel.has(c.dataset.id ?? ''));
    const n = this.sel.size;
    this.trashSure = false;
    if (this.selCount) this.selCount.textContent = n ? `${n} SELECTED` : 'NONE SELECTED';
    if (this.trashBtn) {
      this.trashBtn.classList.remove('sure');
      this.trashBtn.disabled = !n;
      this.trashBtn.textContent = `🗑 DELETE${n ? ` ${n}` : ''}`;
    }
  }

  /** delete the picked pictures (a second click to be sure) */
  private async trash(): Promise<void> {
    const n = this.sel.size;
    const b = this.trashBtn;
    if (!n || !b) return;
    if (!this.trashSure) {
      this.trashSure = true;
      b.classList.add('sure');
      const favs = this.all.filter((p) => p.fav && this.sel.has(p.id)).length;
      b.textContent = `SURE? DELETE ${n}${favs ? ` (${favs} ♥)` : ''}`;
      return;
    }
    b.disabled = true;
    b.textContent = 'DELETING…';
    const ids = [...this.sel];
    await deletePhotos(ids);
    const gone = new Set(ids);
    this.all = this.all.filter((p) => !gone.has(p.id));
    this.tabPhotos.innerHTML = `PHOTOS<i>${this.all.length}</i>`;
    this.sel.clear();
    this.fillBar();
    this.fillGrid();
  }

  private seg(parent: HTMLElement, opts: [string, string][], cur: string, set: (v: string) => void): void {
    const s = el('div', 'aa-seg', parent);
    for (const [id, label] of opts) {
      const b = el('button', id === cur ? 'on' : '', s, label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        set(id);
        this.changed();
      });
    }
  }

  private chip(parent: HTMLElement, label: string, n: number, on: boolean, set: () => void): void {
    const b = el('button', 'aa-chip' + (on ? ' on' : ''), parent) as HTMLButtonElement;
    b.textContent = label;
    el('i', '', b, String(n));
    b.addEventListener('click', () => {
      set();
      this.changed();
    });
  }

  private changed(): void {
    // (a shot kind that the jet picked has no pictures of: back to everything)
    this.save();
    this.fillBar();
    this.fillGrid();
  }

  /** the pictures that pass the filters, in order */
  private filtered(): PhotoMeta[] {
    const v = this.view;
    let l = this.all.filter((p) => (v.jet === 'all' || p.type === v.jet) && p.stars >= v.stars && (!v.fav || p.fav) && (v.shot === 'all' || (v.shot === 'none' ? !p.tags.length : p.tags.includes(v.shot))));
    if (v.sort === 'old') l = l.sort((a, b) => a.time - b.time);
    else if (v.sort === 'best') l = l.sort((a, b) => b.score - a.score || b.time - a.time);
    else if (v.sort === 'jet') l = l.sort((a, b) => short(a.type).localeCompare(short(b.type)) || b.score - a.score);
    else l = l.sort((a, b) => b.time - a.time);
    return l;
  }

  /** the heading a picture goes under, for the sort chosen */
  private groupOf(p: PhotoMeta): string {
    const v = this.view;
    if (v.sort === 'best') return p.stars ? `${'★'.repeat(p.stars)}  ${p.stars} STAR${p.stars > 1 ? 'S' : ''}` : 'UNRATED';
    if (v.sort === 'jet') return SPECS[p.type]?.name.toUpperCase() ?? p.type;
    const d = new Date(p.time);
    const today = new Date();
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(today) - day(d)) / 86400000);
    if (diff === 0) return 'TODAY';
    if (diff === 1) return 'YESTERDAY';
    return d.toLocaleDateString('en-US', { weekday: diff < 7 ? 'long' : undefined, day: 'numeric', month: 'long', year: diff > 300 ? 'numeric' : undefined }).toUpperCase();
  }

  private fillGrid(): void {
    const body = this.body;
    clearEl(body);
    this.io?.disconnect();
    this.moreIo?.disconnect();
    this.freeThumbs();
    this.shown = this.filtered();
    this.rendered = 0;
    if (!this.all.length) {
      el('div', 'aa-empty', body, `No pictures yet. Every picture from the AIRSHOW that scores 15 or more is kept here (up to ${MAX_PHOTOS.toLocaleString('en-US')}, and your favourites for good).`);
      return;
    }
    const sum = el('div', 'aa-sum', body, this.shown.length === this.all.length ? `${this.all.length} PICTURES` : `${this.shown.length} OF ${this.all.length} PICTURES`);
    void sum;
    if (!this.shown.length) {
      el('div', 'aa-empty', body, 'No pictures match. Try another jet, shot or rating.');
      return;
    }
    // thumbnails load as they come into view
    this.io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          const img = e.target as HTMLImageElement;
          this.io?.unobserve(img);
          const id = img.dataset.id!;
          void photoThumb(id).then((b) => {
            if (!b || !this.isOpen) return;
            const u = URL.createObjectURL(b);
            this.thumbUrls.set(id, u);
            img.src = u;
          });
        }
      },
      { root: body, rootMargin: '600px 0px' },
    );
    this.renderMore();
  }

  /** the next page of cards (more follow as the end scrolls into view) */
  private renderMore(): void {
    const body = this.body;
    body.querySelector('.aa-more')?.remove();
    const end = Math.min(this.shown.length, this.rendered + PAGE);
    if (this.rendered === 0) {
      this.curGrid = null;
      this.curGroup = '';
    }
    for (let i = this.rendered; i < end; i++) {
      const p = this.shown[i];
      const g = this.groupOf(p);
      if (g !== this.curGroup || !this.curGrid) {
        this.curGroup = g;
        const n = this.shown.filter((x) => this.groupOf(x) === g).length;
        const h = el('div', 'aa-gh', body, g);
        el('i', '', h, `${n} PICTURE${n > 1 ? 'S' : ''}`);
        this.curGrid = el('div', 'aa-grid', body);
      }
      this.card(this.curGrid, p, i);
    }
    this.rendered = end;
    if (end < this.shown.length) {
      const more = el('div', 'aa-more', body);
      this.moreIo = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting)) {
          this.moreIo?.disconnect();
          this.renderMore();
        }
      }, { root: body, rootMargin: '900px 0px' });
      this.moreIo.observe(more);
    }
  }

  private card(grid: HTMLElement, p: PhotoMeta, i: number): void {
    const c = el('div', 'aa-card' + (this.sel.has(p.id) ? ' sel' : ''), grid);
    c.dataset.id = p.id;
    const img = el('img', '', c) as HTMLImageElement;
    img.alt = p.jet;
    img.dataset.id = p.id;
    this.io?.observe(img);
    el('div', 'aa-score', c, String(p.score));
    if (p.raw) el('div', 'aa-raw', c, 'RAW');
    if (p.fav) el('div', 'aa-heart', c, '♥');
    const cap = el('div', 'aa-cap', c);
    const t = el('div', 'aa-cap-t', cap);
    el('span', '', t, short(p.type).toUpperCase());
    el('span', 'aa-st', t).innerHTML = starText(p.stars);
    el('div', 'aa-cap-s', cap, p.tags.length ? p.tags.map((k) => SHOTS[k]?.name ?? k).join(' · ') : 'PORTRAIT');
    el('div', 'aa-tick', c, '✓');
    c.addEventListener('click', (e) => {
      // (Ctrl/Cmd-click starts picking straight away)
      if (!this.selecting && (e.ctrlKey || e.metaKey)) this.setSelecting(true);
      if (this.selecting) this.toggleSel(i, e.shiftKey);
      else this.openBig(i);
    });
  }

  private freeThumbs(): void {
    for (const u of this.thumbUrls.values()) URL.revokeObjectURL(u);
    this.thumbUrls.clear();
  }

  // ------------------------------------------------------------------ one picture, big

  private openBig(i: number): void {
    const p = this.shown[i];
    if (!p) return;
    this.bigI = i;
    const b = this.big;
    clearEl(b);
    const pane = el('div', 'aa-big-img', b);
    const img = el('img', '', pane) as HTMLImageElement;
    // (the thumbnail at once, the full picture when it has loaded)
    const tu = this.thumbUrls.get(p.id);
    if (tu) img.src = tu;
    // (the full picture decoded off-screen first, then swapped in: no blurry flash, no half-drawn frame)
    void photoBlob(p.id).then((blob) => {
      if (!blob || this.bigI !== i) return;
      if (this.bigUrl) URL.revokeObjectURL(this.bigUrl);
      const url = (this.bigUrl = URL.createObjectURL(blob));
      const full = new Image();
      full.decoding = 'async';
      full.src = url;
      void full.decode().catch(() => undefined).then(() => {
        if (this.bigI === i && this.bigUrl === url) img.src = url;
      });
    });
    img.addEventListener('dblclick', () => this.toggleFull());
    const fs = el('button', 'aa-fs', pane, '⛶ FULL SCREEN  F') as HTMLButtonElement;
    fs.addEventListener('click', () => this.toggleFull());
    const prev = el('button', 'aa-nav', pane, '‹') as HTMLButtonElement;
    prev.style.left = '14px';
    prev.addEventListener('click', () => this.step(-1));
    const next = el('button', 'aa-nav', pane, '›') as HTMLButtonElement;
    next.style.right = '14px';
    next.addEventListener('click', () => this.step(1));
    pane.addEventListener('click', (e) => {
      if (e.target === pane) this.closeBig();
    });
    const side = el('div', 'aa-side', b);
    el('h3', '', side, SPECS[p.type]?.name ?? p.jet);
    const st = el('div', 'aa-st', side);
    st.innerHTML = `${starText(p.stars)} <span style="color:#eef2f7;font-size:16px;margin-left:6px">${p.score}</span>`;
    const tags = el('div', 'aa-tags', side);
    if (p.tags.length) for (const t of p.tags) el('span', '', tags, SHOTS[t]?.name ?? t);
    else el('span', '', tags, 'PORTRAIT');
    const kv = (k: string, v: string) => {
      const r = el('div', 'aa-kv', side);
      el('span', '', r, k);
      el('b', '', r, v);
    };
    kv('TAKEN', new Date(p.time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
    kv('AIRSHOW', p.base);
    kv('FROM', SPOT_NAME[p.spot ?? 'crowd'] ?? 'Crowd line');
    kv('LENS', `${p.lens} mm`);
    const x = p.exif;
    if (x) {
      kv('EXPOSURE', `${fmtShutter(x.shutter)} · ${fmtAperture(x.aperture)} · ISO ${x.iso}`);
      kv('MODE', `${x.mode.length === 1 ? x.mode : x.mode.toUpperCase()} · ${fmtEv(x.ev)} EV · ${x.metering.toUpperCase()}`);
      kv('FOCUS', x.af);
      kv('COLOUR', `${x.wb} · ${STYLE_NAMES[x.style as Style] ?? x.style} · ${x.space === 'adobe' ? 'Adobe RGB' : 'sRGB'}`);
      kv('FILE', `${x.format.toUpperCase()}${p.raw ? ' (RAW kept)' : ''} · IS ${x.is.toUpperCase()}`);
    }
    kv('PICTURE', `${i + 1} of ${this.shown.length}`);
    const acts = el('div', 'aa-act', side);
    const favB = el('button', 'aa-btn', acts, p.fav ? '♥ FAVOURITE' : '♡ ADD TO FAVOURITES') as HTMLButtonElement;
    favB.addEventListener('click', async () => {
      p.fav = !p.fav;
      await setFavourite(p.id, p.fav);
      favB.textContent = p.fav ? '♥ FAVOURITE' : '♡ ADD TO FAVOURITES';
    });
    const save = el('button', 'aa-btn', acts, 'SAVE PICTURE') as HTMLButtonElement;
    let cover = false;
    save.addEventListener('click', async () => {
      const name = `${p.jet.replace(/[^a-z0-9]+/gi, '-')}-${p.score}${cover ? '-cover' : ''}.jpg`;
      const blob = img.src.startsWith('data:') ? dataUrlBlob(img.src) : await photoBlob(p.id);
      if (blob) await saveFile(name, blob);
    });
    if (p.stars >= 3) {
      const cov = el('button', 'aa-btn gold', acts, 'MAGAZINE COVER') as HTMLButtonElement;
      cov.addEventListener('click', () => {
        const url = makeCover(img, p);
        if (!url) return;
        img.src = url;
        cover = true;
        cov.remove();
        save.textContent = 'SAVE COVER';
      });
    }
    if (p.raw) {
      const sr = el('button', 'aa-btn', acts, 'SAVE RAW (.PNG)') as HTMLButtonElement;
      sr.addEventListener('click', async () => {
        const blob = await photoRaw(p.id);
        if (blob) await saveFile(`${p.jet.replace(/[^a-z0-9]+/gi, '-')}-${p.score}-raw.png`, blob);
      });
      const dv = el('button', 'aa-btn gold', acts, 'DEVELOP RAW') as HTMLButtonElement;
      dv.addEventListener('click', () => {
        dv.remove();
        void this.developPanel(acts, p, img);
      });
    }
    const del = el('button', 'aa-btn red', acts, 'DELETE') as HTMLButtonElement;
    del.addEventListener('click', async () => {
      if (del.dataset.sure !== '1') {
        del.dataset.sure = '1';
        del.textContent = 'DELETE: SURE? CLICK AGAIN';
        return;
      }
      await deletePhoto(p.id);
      this.all = this.all.filter((x) => x.id !== p.id);
      const at = this.bigI;
      this.closeBig();
      this.fillBar();
      this.fillGrid();
      if (this.shown.length) this.openBig(Math.min(at, this.shown.length - 1));
    });
    const back = el('button', 'aa-btn', acts, 'BACK TO THE ALBUM') as HTMLButtonElement;
    back.addEventListener('click', () => this.closeBig());
    b.classList.add('show');
  }

  /** develop a RAW: exposure, white balance, contrast, colour and a picture style, live, then kept as a new picture */
  private async developPanel(parent: HTMLElement, p: PhotoMeta, img: HTMLImageElement): Promise<void> {
    const raw = await photoRaw(p.id);
    if (!raw) return;
    const bmp = await createImageBitmap(raw);
    // (the preview at screen size; the full picture when it is kept)
    const pw = Math.min(bmp.width, 1600), ph = Math.round((pw * bmp.height) / bmp.width);
    const prev = document.createElement('canvas');
    prev.width = pw;
    prev.height = ph;
    const pg = prev.getContext('2d', { willReadFrequently: true })!;
    pg.drawImage(bmp, 0, 0, pw, ph);
    const base = pg.getImageData(0, 0, pw, ph);
    const box = el('div', 'aa-dev', parent);
    const v = { ev: 0, kelvin: 5500, con: 1, sat: 1, style: 'standard' as Style };
    const params = (): DevelopParams => {
      const set = kelvinRgb(v.kelvin), day = kelvinRgb(5500);
      const g: [number, number, number] = [day[0] / set[0], 1, day[2] / set[2]];
      const m = (g[0] + g[1] + g[2]) / 3;
      const st = STYLE_LOOK[v.style];
      return { wb: [g[0] / m, g[1] / m, g[2] / m], ev: v.ev, contrast: st.con * v.con, saturation: st.sat * v.sat, lift: st.lift, warm: st.warm, mono: st.mono, adobe: false };
    };
    let pending = 0;
    const redraw = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        const im = new ImageData(new Uint8ClampedArray(base.data), pw, ph);
        develop(im, params());
        pg.putImageData(im, 0, 0);
        img.src = prev.toDataURL('image/jpeg', 0.9);
      });
    };
    const slider = (label: string, min: number, max: number, step: number, get: () => number, set: (x: number) => void, fmt: (x: number) => string) => {
      const l = el('label', '', box);
      el('span', '', l, label);
      const r = el('input', '', l) as HTMLInputElement;
      r.type = 'range';
      r.min = String(min);
      r.max = String(max);
      r.step = String(step);
      r.value = String(get());
      const out = el('b', '', l, fmt(get()));
      r.addEventListener('input', () => {
        set(+r.value);
        out.textContent = fmt(+r.value);
        redraw();
      });
    };
    slider('EXPOSURE', -2, 2, 0.1, () => v.ev, (x) => (v.ev = x), (x) => fmtEv(x));
    slider('TEMPERATURE', 2500, 10000, 100, () => v.kelvin, (x) => (v.kelvin = x), (x) => `${x}K`);
    slider('CONTRAST', 0.7, 1.4, 0.01, () => v.con, (x) => (v.con = x), (x) => x.toFixed(2));
    slider('SATURATION', 0, 1.6, 0.01, () => v.sat, (x) => (v.sat = x), (x) => x.toFixed(2));
    const sl = el('label', '', box);
    el('span', '', sl, 'STYLE');
    const sel = el('select', '', sl) as HTMLSelectElement;
    for (const k of Object.keys(STYLE_NAMES) as Style[]) {
      const o = el('option', '', sel, STYLE_NAMES[k]) as HTMLOptionElement;
      o.value = k;
    }
    sel.addEventListener('change', () => {
      v.style = sel.value as Style;
      redraw();
    });
    const keep = el('button', 'aa-btn gold', box, 'KEEP AS A NEW PICTURE') as HTMLButtonElement;
    keep.addEventListener('click', async () => {
      keep.disabled = true;
      keep.textContent = 'DEVELOPING…';
      const full = await createImageBitmap(raw);
      const out = await developFrame({ bmp: full, w: full.width, h: full.height, params: params(), caption: null, jpeg: true, raw: false, quality: 0.93, thumbW: 400 });
      if (out.jpeg) {
        const meta: PhotoMeta = { ...p, id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`, time: Date.now(), raw: false, fav: false, exif: p.exif ? { ...p.exif, style: v.style, wb: `${v.kelvin} K`, format: 'developed' } : undefined };
        await savePhoto(meta, out.jpeg, out.thumb ?? undefined);
        this.all = await listPhotos();
        keep.textContent = 'KEPT ✓ (NEWEST IN THE ALBUM)';
        this.fillBar();
        this.fillGrid();
        // (the open picture moved down one: keep the arrows stepping from it)
        this.bigI = Math.max(0, this.shown.findIndex((x) => x.id === p.id));
      } else keep.textContent = 'COULD NOT DEVELOP';
    });
    redraw();
  }

  private step(d: number): void {
    if (this.bigI < 0 || !this.shown.length) return;
    let i = this.bigI + d;
    if (i < 0) i = this.shown.length - 1;
    if (i >= this.shown.length) i = 0;
    // (the cards past the rendered page get rendered so their thumbnails exist)
    while (i >= this.rendered && this.rendered < this.shown.length) this.renderMore();
    this.openBig(i);
  }

  /** the picture alone, filling the screen (the browser's own full screen where allowed) */
  private toggleFull(): void {
    const on = !this.big.classList.contains('full');
    this.big.classList.toggle('full', on);
    try {
      if (on && !document.fullscreenElement) {
        void this.big.requestFullscreen?.().then(() => {
          // (Esc leaves the browser's full screen by itself: the picture goes back with it)
          const off = () => {
            if (document.fullscreenElement) return;
            document.removeEventListener('fullscreenchange', off);
            this.big.classList.remove('full');
          };
          document.addEventListener('fullscreenchange', off);
        }).catch(() => undefined);
      }
      else if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } catch {
      /* (no browser full screen: the picture still fills the window) */
    }
  }

  private closeBig(): void {
    if (this.big.classList.contains('full')) this.toggleFull();
    this.big.classList.remove('show');
    this.bigI = -1;
    if (this.bigUrl) URL.revokeObjectURL(this.bigUrl);
    this.bigUrl = '';
  }

  // ------------------------------------------------------------------ the logbook

  private fillLogbook(): void {
    const body = this.body;
    clearEl(body);
    this.io?.disconnect();
    const L = this.getLog();
    const r = rankOf(L.points);
    const tot = AIRCRAFT_TYPES.filter((t) => t !== 'X15');
    let got = 0, all = 0;
    for (const t of tot) {
      const best = L.best[t] ?? {};
      const kinds = kindsFor(t);
      got += kinds.filter((k) => best[k]).length;
      all += kinds.length;
    }
    el('div', 'aa-sum', body, `${L.points.toLocaleString('en-US')} POINTS · ${L.shots.toLocaleString('en-US')} PICTURES TAKEN · BEST SCORE ${L.topScore} · ${got} OF ${all} SHOTS COLLECTED`);
    const ranks = el('div', 'aa-ranks', body);
    RANKS.forEach((k, i) => {
      const d = el('div', i === r.i ? 'on' : '', ranks);
      el('b', '', d, `${i <= r.i ? '✓ ' : ''}${k.name}`);
      el('span', '', d, `${k.pts.toLocaleString('en-US')} pts · ${k.perk}`);
    });
    const lb = el('div', 'aa-lb', body);
    for (const t of tot) {
      const best = L.best[t] ?? {};
      const kinds = kindsFor(t);
      const n = kinds.filter((k) => best[k]).length;
      const box = el('div', 'aa-lb-j', lb);
      const h = el('h4', '', box, SPECS[t].name.toUpperCase());
      el('span', '', h, `${n} / ${kinds.length}`);
      el('div', 'aa-lb-bar', box).innerHTML = `<i style="width:${((n / kinds.length) * 100).toFixed(0)}%"></i>`;
      const chips = el('div', 'aa-chips', box);
      for (const k of kinds) {
        const s = best[k] ?? 0;
        const c = el('span', 'aa-chip' + (s ? ' on' : ''), chips, `${SHOTS[k].name}${s ? ' ' + '★'.repeat(s) : ''}`);
        c.title = SHOTS[k].hint;
      }
    }
  }
}

/** a data: URL as a Blob (no fetch: the page's security policy may not allow one) */
export function dataUrlBlob(url: string): Blob {
  const [head, body] = url.split(',', 2);
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  return new Blob([bytes], { type: mime });
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
export function makeCover(img: HTMLImageElement, p: PhotoMeta): string | null {
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
  const jet = p.jet.replace(/^(Lockheed Martin|Boeing|Sukhoi|Dassault|Saab|Eurofighter|Mikoyan|General Dynamics|McDonnell Douglas)\s+/i, '');
  g.fillStyle = '#ffd23a';
  g.font = font(700, 30);
  g.fillText(line, 32, H - 210);
  g.fillStyle = '#ffffff';
  g.font = font(800, 104);
  const hw = g.measureText(jet.toUpperCase()).width;
  g.save();
  g.translate(32, H - 108);
  g.scale(Math.min(1, (W - 250) / hw), 1);
  g.fillText(jet.toUpperCase(), 0, 0);
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
  let seed = p.score * 7919 + (p.time % 10007);
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
