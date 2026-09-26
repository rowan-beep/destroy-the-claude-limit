// TSD / SA / PA page: heading-up moving map. Hill-shaded terrain raster,
// coastlines and contours, airfields, bullseye, the steerpoint and route
// line, the team's datalinked air picture (GCI + every friendly sensor),
// own radar coverage, RWR spikes, missiles in flight and enemy WEZ rings.

import { MfdPage, PageEnv, bottomRow, opt, setOpt } from './page';
import { C, OsbButton } from '../draw';
import { NM, FT, DEG, MAP_HALF, MAP_SIZE } from '../../core/constants';
import { clamp, wrap360 } from '../../core/math';
import { AIRFIELDS } from '../../world/islands';
import { GCI_SITES } from '../../game/teamPicture';
import { tilesInBox, ContourSet } from '../../world/mapData';
import { fmtBrg, fmtTtg } from '../nav';

const RANGES = [5, 10, 20, 40, 80, 160];

export const tsdPage: MfdPage = {
  id: 'TSD',

  buttons(e: PageEnv): OsbButton[] {
    const st = e.st;
    const nav = e.av.nav;
    const rng = opt(st, 'range', 40);
    const p = e.p;
    return [
      { osb: 0, label: opt(st, 'ctr', false) ? 'CNTR' : 'DCTR', act: () => setOpt(st, 'ctr', !opt(st, 'ctr', false)) },
      { osb: 1, label: opt(st, 'raster', true) ? 'MAP' : 'VEC', act: () => setOpt(st, 'raster', !opt(st, 'raster', true)) },
      { osb: 3, label: 'WEZ', sel: opt(st, 'wez', false), act: () => setOpt(st, 'wez', !opt(st, 'wez', false)) },
      { osb: 4, label: 'DCLT', sel: opt(st, 'dclt', false), act: () => setOpt(st, 'dclt', !opt(st, 'dclt', false)) },
      { osb: 5, label: '▲', act: () => setOpt(st, 'range', RANGES[Math.min(RANGES.length - 1, RANGES.indexOf(rng) + 1)]) },
      { osb: 6, label: String(rng) },
      { osb: 7, label: '▼', act: () => setOpt(st, 'range', RANGES[Math.max(0, RANGES.indexOf(rng) - 1)]) },
      { osb: 8, label: 'STPT\n▲', act: () => nav.next() },
      { osb: 9, label: 'STPT\n▼', act: () => nav.prev() },
      { osb: 19, label: 'RTB', act: () => nav.selectNearestFriendly(p.fm.pos.x, p.fm.pos.z) },
      { osb: 18, label: 'BULL', sel: nav.current.kind === 'bullseye', act: () => nav.select('bullseye') },
      { osb: 17, label: 'CONT', sel: opt(st, 'cont', true), act: () => setOpt(st, 'cont', !opt(st, 'cont', true)) },
      ...bottomRow(e, 'TSD'),
    ];
  },

  draw(e: PageEnv): void {
    const { pen, p, w, h, g, st } = e;
    const ctx = pen.ctx;
    const fm = p.fm;
    const nav = e.av.nav;
    const map = e.g.world.mapData;
    const now = g.sim.time;
    const rangeNm = opt(st, 'range', 40);
    const centred = opt(st, 'ctr', false);
    const dclt = opt(st, 'dclt', false);
    const ox = w / 2;
    const oy = centred ? h / 2 : h * 0.7;
    const topY = 64;
    const k = (oy - topY) / (rangeNm * NM); // px per metre
    const hdg = Math.atan2(fm.fwd.x, -fm.fwd.z);
    const ch = Math.cos(hdg), sh = Math.sin(hdg);
    const px = fm.pos.x, pz = fm.pos.z;
    const S = (x: number, z: number): [number, number] => {
      const dx = x - px, dn = -(z - pz);
      return [ox + (dx * ch - dn * sh) * k, oy - (dx * sh + dn * ch) * k];
    };
    const relAng = (bearingDeg: number) => bearingDeg * DEG - hdg;
    const onScreen = (x: number, y: number, m = 0) => x > -m && x < w + m && y > -m && y < h + m;

    // --- map underlay (world transform) ---
    pen.save();
    pen.clip(0, 0, w, h);
    ctx.fillStyle = C.sea;
    ctx.fillRect(0, 0, w, h);
    const radius = Math.hypot(w, h) / k; // metres visible (generous)
    pen.save();
    ctx.translate(ox, oy);
    ctx.rotate(-hdg);
    ctx.scale(k, k);
    if (opt(st, 'raster', true) && map.raster) {
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(map.raster, -MAP_HALF - px, -MAP_HALF - pz, MAP_SIZE, MAP_SIZE);
      ctx.globalAlpha = 1;
    }
    const drawSet = (set: ContourSet | null, color: string, lw: number) => {
      if (!set) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw / k;
      ctx.beginPath();
      for (const ti of tilesInBox(px - radius, pz - radius, px + radius, pz + radius)) {
        const seg = set.tiles.get(ti);
        if (!seg) continue;
        for (let i = 0; i < seg.length; i += 4) {
          ctx.moveTo(seg[i] - px, seg[i + 1] - pz);
          ctx.lineTo(seg[i + 2] - px, seg[i + 3] - pz);
        }
      }
      ctx.stroke();
    };
    if (opt(st, 'cont', true) && rangeNm <= 80) {
      map.contours.forEach((c, i) => drawSet(c, i === 0 ? 'rgba(170,150,110,0.35)' : i === 1 ? 'rgba(190,170,130,0.45)' : 'rgba(230,230,235,0.5)', 1));
    }
    drawSet(map.coast, 'rgba(120,220,255,0.85)', 1.6);
    pen.restore();

    // --- range rings & compass ---
    pen.width(1.5);
    pen.color = 'rgba(200,230,255,0.28)';
    pen.dash([4, 8]);
    pen.circle(ox, oy, (oy - topY) / 2);
    pen.dash();
    pen.color = 'rgba(200,230,255,0.4)';
    pen.circle(ox, oy, oy - topY);
    for (let d = 0; d < 360; d += 10) {
      const a = relAng(d);
      const r0 = oy - topY;
      const len = d % 30 === 0 ? 12 : 6;
      pen.line(ox + Math.sin(a) * r0, oy - Math.cos(a) * r0, ox + Math.sin(a) * (r0 - len), oy - Math.cos(a) * (r0 - len));
      if (d % 90 === 0 && !dclt) {
        const lbl = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : 'W';
        pen.text(lbl, ox + Math.sin(a) * (r0 - 24), oy - Math.cos(a) * (r0 - 24), { size: 18, color: d === 0 ? C.white : C.greenDim, align: 'center' });
      }
    }
    pen.text(`${rangeNm / 2}`, ox + 6, oy - (oy - topY) / 2 - 10, { size: 15, color: 'rgba(200,230,255,0.5)' });

    // --- own radar coverage wedge ---
    const r = p.radar;
    if (r.mode !== 'OFF') {
      const rr = Math.min(r.scopeRange * NM * k, Math.hypot(w, h));
      const sa = r.scanAz * DEG;
      ctx.fillStyle = 'rgba(61,255,114,0.06)';
      ctx.strokeStyle = 'rgba(61,255,114,0.35)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.arc(ox, oy, rr, -Math.PI / 2 - sa, -Math.PI / 2 + sa);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // --- airfields, bullseye, GCI sites ---
    for (const f of AIRFIELDS) {
      const [x, y] = S(f.x, f.z);
      if (!onScreen(x, y, 30)) continue;
      pen.color = f.team === p.team ? C.cyan : C.red;
      pen.width(2);
      pen.airfield(x, y, relAng(f.heading), 8);
      if (!dclt) pen.text(f.icao, x + 14, y + 16, { size: 16, color: f.team === p.team ? C.cyan : C.red });
    }
    {
      const b = nav.bullseye;
      const [x, y] = S(b.x, b.z);
      if (onScreen(x, y, 20)) {
        pen.color = C.white;
        pen.width(1.5);
        pen.bullseye(x, y, -hdg);
      }
    }
    if (!dclt) {
      for (const s of GCI_SITES) {
        if (s.team !== p.team) continue;
        const [x, y] = S(s.pos.x, s.pos.z);
        if (!onScreen(x, y)) continue;
        pen.color = C.cyan;
        pen.width(1.5);
        pen.arc(x, y, 7, Math.PI, Math.PI * 2);
        pen.line(x, y, x, y - 10);
      }
    }

    // --- steerpoint & route line ---
    const sp = nav.current;
    {
      const [x, y] = S(sp.x, sp.z);
      pen.color = C.white;
      pen.width(1.5);
      pen.dash([10, 6]);
      pen.line(ox, oy, x, y);
      pen.dash();
      if (onScreen(x, y, 10)) {
        pen.width(2.5);
        pen.diamond(x, y, 11);
      }
    }

    // --- enemy WEZ rings ---
    const wez = opt(st, 'wez', false);

    // --- datalinked hostile picture ---
    const lock = p.lockedTarget;
    const leaderLen = (spd: number) => 12 + clamp(spd / 18, 0, 26);
    for (const t of g.picture.tracksFor(p.team)) {
      if (!t.target.alive || now - t.time > 30) continue;
      const [x, y] = S(t.pos.x, t.pos.z);
      if (!onScreen(x, y, 20)) continue;
      const age = now - t.time;
      ctx.globalAlpha = clamp(1 - age / 30, 0.3, 1);
      pen.color = C.red;
      pen.width(2);
      pen.track(x, y, 'hostile', 10, t.target === lock);
      const sp2 = Math.hypot(t.vel.x, t.vel.z);
      if (sp2 > 20) pen.leader(x, y, Math.atan2(t.vel.x, -t.vel.z) - hdg, leaderLen(sp2));
      pen.text(String(Math.round(t.pos.y / FT / 1000)), x + 12, y + 14, { size: 15, color: C.white });
      if (t.target === lock) {
        pen.color = C.white;
        pen.rect(x - 15, y - 15, 30, 30);
      }
      if (wez) {
        // their AMRAAM reach against us (head-on, same altitudes): mirror our own DLZ from their side
        const rmax = t.target.launchZoneFor(t.target.radarMissile, p).rmax;
        pen.color = 'rgba(255,59,47,0.55)';
        pen.dash([6, 6]);
        pen.circle(x, y, rmax * k);
        pen.dash();
      }
      ctx.globalAlpha = 1;
    }
    // friendlies
    for (const a of g.sim.aircraft) {
      if (a === p || !a.alive || a.team !== p.team) continue;
      const [x, y] = S(a.fm.pos.x, a.fm.pos.z);
      if (!onScreen(x, y, 20)) continue;
      pen.color = C.friend;
      pen.width(2);
      pen.track(x, y, 'friendly', 10);
      pen.leader(x, y, Math.atan2(a.fm.vel.x, -a.fm.vel.z) - hdg, leaderLen(a.fm.tas));
    }

    // --- missiles ---
    for (const m of g.sim.missiles) {
      if (!m.alive) continue;
      const mine = m.shooter === p;
      const threat = m.target === p;
      if (!mine && !threat) continue;
      if (threat && !p.rwr.missiles.some((w) => w.missile === m)) continue;
      const [x, y] = S(m.pos.x, m.pos.z);
      if (!onScreen(x, y)) continue;
      pen.color = mine ? C.white : C.red;
      pen.circle(x, y, 4, true);
      const vh = Math.atan2(m.vel.x, -m.vel.z) - hdg;
      pen.leader(x, y, vh, 12);
    }

    // --- RWR spikes ---
    for (const t of p.rwr.threats.values()) {
      if (t.level === 'search') continue;
      const a = t.bearing;
      pen.color = t.level === 'lock' ? C.amber : C.red;
      pen.width(2);
      pen.dash([8, 5]);
      const len = oy - topY;
      pen.line(ox + Math.sin(a) * 24, oy - Math.cos(a) * 24, ox + Math.sin(a) * len, oy - Math.cos(a) * len);
      pen.dash();
    }

    // --- ownship ---
    pen.color = C.white;
    pen.width(2.5);
    pen.ownship(ox, oy, 1);
    pen.restore();

    // --- data blocks ---
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(56, 62, 190, 50);
    ctx.fillRect(w - 246, 62, 190, 72);
    const bulls = nav.bullsFor(px, pz);
    pen.text(`BULL ${bulls.text}`, 64, 76, { size: 17, color: C.white });
    pen.text(`${String(Math.round(wrap360(fm.heading)) % 360).padStart(3, '0')}°  ${Math.round(fm.pos.y / FT / 100) * 100}`, 64, 98, { size: 17, color: C.greenDim });
    const brg = nav.bearingTo(px, pz);
    const dist = nav.rangeTo(px, pz);
    const plan = nav.fuelPlan(p);
    pen.text(`${sp.num} ${sp.short}${sp.tacan ? ' ' + sp.tacan : ''}`, w - 238, 76, { size: 17, color: C.white });
    pen.text(`${fmtBrg(brg)}° ${(dist / NM).toFixed(1)}`, w - 238, 98, { size: 17, color: C.white });
    pen.text(`${fmtTtg(plan.ttgSec)}  ${Math.round(plan.atStptLb / 100) * 100}LB`, w - 238, 120, { size: 16, color: plan.atStptLb < plan.bingoLb ? C.amber : C.greenDim });
  },
};
