// RADAR page: B-scope (azimuth across, range up) for the APG-82(V)1,
// APG-79 and CAPTOR-E. Shows raw RWS bricks, TWS track files with velocity
// leaders and ranks, the STT target with its data block, IRST and datalink
// tracks, own AMRAAMs in flight with time-to-active, the launch zone, and the
// reason a track was lost (terrain masking, notch, gimbal limits).

import { MfdPage, PageEnv, bottomRow, opt, setOpt } from './page';
import { C, OsbButton } from '../draw';
import { DEG, NM, FT, KT } from '../../core/constants';
import { clamp, wrap360 } from '../../core/math';
import { weaponCode } from '../../weapons/weaponSpecs';
import type * as THREE from 'three';
import type { Aircraft } from '../../aircraft/aircraft';

const RANGES = [10, 20, 40, 80, 160];

function hdgOf(v: { x: number; z: number }): number {
  return Math.atan2(v.x, -v.z);
}

/** Target aspect: degrees off the target's nose with side (e.g. "35R"). */
export function aspectText(own: Aircraft, t: Aircraft): string {
  const dx = own.fm.pos.x - t.fm.pos.x, dz = own.fm.pos.z - t.fm.pos.z;
  const losHdg = Math.atan2(dx, -dz); // bearing from target to us
  const th = hdgOf(t.fm.vel);
  let a = wrap360(((losHdg - th) * 180) / Math.PI);
  const side = a > 180 ? 'L' : 'R';
  if (a > 180) a = 360 - a;
  return `${String(Math.round(a / 10) * 10).padStart(2, '0')}${a < 5 || a > 175 ? '' : side}`;
}

export function closureKts(own: Aircraft, t: Aircraft): number {
  const dx = t.fm.pos.x - own.fm.pos.x, dy = t.fm.pos.y - own.fm.pos.y, dz = t.fm.pos.z - own.fm.pos.z;
  const r = Math.hypot(dx, dy, dz) || 1;
  const rvx = t.fm.vel.x - own.fm.vel.x, rvy = t.fm.vel.y - own.fm.vel.y, rvz = t.fm.vel.z - own.fm.vel.z;
  return -((rvx * dx + rvy * dy + rvz * dz) / r) / KT;
}

export const radarPage: MfdPage = {
  id: 'RDR',

  buttons(e: PageEnv): OsbButton[] {
    const p = e.p;
    const r = p.radar;
    const sim = e.g.sim;
    const mode = r.mode === 'STT' ? 'TWS' : r.mode;
    const b: OsbButton[] = [
      { osb: 0, label: 'RWS', sel: mode === 'RWS', act: () => r.setMode('RWS') },
      { osb: 1, label: 'TWS', sel: mode === 'TWS', act: () => r.setMode('TWS') },
      { osb: 2, label: 'ACM', sel: mode === 'ACM', act: () => r.setMode('ACM') },
      { osb: 3, label: 'SIL', sel: mode === 'OFF', act: () => r.setMode('OFF') },
      {
        osb: 5,
        label: '▲',
        act: () => {
          const i = RANGES.indexOf(r.scopeRange);
          r.scopeRange = RANGES[Math.min(RANGES.length - 1, i + 1)];
        },
      },
      { osb: 6, label: String(r.scopeRange) },
      {
        osb: 7,
        label: '▼',
        act: () => {
          const i = RANGES.indexOf(r.scopeRange);
          r.scopeRange = RANGES[Math.max(0, i - 1)];
        },
      },
      {
        osb: 8,
        label: `AZ\n${Math.round(r.scanAz)}`,
        act: () => {
          const pats = r.scanPatterns;
          const i = pats.indexOf(r.scanAz);
          r.scanAz = pats[(i + 1) % pats.length];
        },
      },
      {
        osb: 9,
        label: 'LOCK',
        sel: !!r.lock,
        act: () => {
          r.cycleLock(sim);
        },
      },
      {
        osb: 19,
        label: 'UNLK',
        act: () => {
          r.setLock(null, sim);
          if (p.irst) p.irst.lock = null;
        },
      },
      {
        osb: 18,
        label: 'D/L',
        sel: opt(e.st, 'dl', true),
        act: () => setOpt(e.st, 'dl', !opt(e.st, 'dl', true)),
      },
    ];
    if (p.irst) {
      const irst = p.irst;
      b.push({
        osb: 4,
        label: 'IRST',
        sel: !!irst.lock,
        act: () => {
          let best: Aircraft | null = null;
          let bd = Infinity;
          for (const c of irst.contacts.values()) {
            if (!c.hostile) continue;
            const a = r.anglesTo(c.pos);
            const s = Math.hypot(a.az, a.el);
            if (s < bd) {
              bd = s;
              best = c.target;
            }
          }
          if (irst.lock) irst.lock = null;
          else if (best) irst.setLock(best, sim);
        },
      });
    }
    return [...b, ...bottomRow(e, 'RDR')];
  },

  draw(e: PageEnv): void {
    const { pen, p, w, h, g } = e;
    const r = p.radar;
    const now = g.sim.time;
    const azDisp = clamp(p.spec.radar.azLimitDeg, 60, 70) * DEG;
    const x0 = 64, x1 = w - 64, y0 = 74, y1 = h - 78;
    const cx = (x0 + x1) / 2;
    const sw = (x1 - x0) / 2;
    const sh = y1 - y0;
    const R = r.scopeRange * NM;
    const X = (az: number) => cx + (az / azDisp) * sw;
    const Y = (rng: number) => y1 - (rng / R) * sh;

    // frame, range ticks and azimuth grid
    pen.width(1.5);
    pen.color = C.greenFaint;
    for (let k = 1; k < 4; k++) pen.line(x0, y1 - (sh * k) / 4, x1, y1 - (sh * k) / 4);
    for (const a of [-30, 30]) pen.line(X(a * DEG), y0, X(a * DEG), y1);
    pen.color = C.greenDim;
    pen.line(cx, y0, cx, y1);
    pen.rect(x0, y0, x1 - x0, sh);
    for (let d = -60; d <= 60; d += 10) {
      const x = X(d * DEG);
      pen.line(x, y1, x, y1 + (d % 30 === 0 ? 12 : 6));
    }
    for (let k = 0; k <= 4; k++) {
      const y = y1 - (sh * k) / 4;
      pen.line(x0 - 8, y, x0, y);
    }
    pen.text(String(r.scopeRange), x0 - 6, y0 + 12, { size: 17, color: C.greenDim, align: 'right' });
    pen.text(String(r.scopeRange / 2), x0 - 6, y1 - sh / 2, { size: 17, color: C.greenDim, align: 'right' });

    // scan volume limits
    if (r.mode !== 'OFF') {
      pen.color = C.greenDim;
      pen.dash([6, 6]);
      const sa = r.scanAz * DEG;
      if (sa < azDisp - 0.01) {
        pen.line(X(-sa), y0, X(-sa), y1);
        pen.line(X(sa), y0, X(sa), y1);
      }
      pen.dash();
      // antenna azimuth caret
      const ant = r.lock ? r.anglesTo(r.lock.fm.pos).az : Math.sin(e.t * (2 / p.spec.radar.frameTime)) * sa;
      const ax = X(clamp(ant, -azDisp, azDisp));
      pen.color = C.green;
      pen.poly([ax, y1 + 4, ax - 7, y1 + 16, ax + 7, y1 + 16], true, true);
    }

    // mode / status line
    const modeTxt = r.mode === 'OFF' ? 'SILENT' : r.lock ? (r.mode === 'ACM' ? 'ACM STT' : 'STT') : r.mode;
    pen.text(modeTxt, cx, y0 - 16, { size: 22, color: r.mode === 'OFF' ? C.amber : C.white, align: 'center', bold: true });
    pen.text(p.spec.radar.name.split(' ')[0], x0, y0 - 16, { size: 16, color: C.greenDim });
    if (r.mode === 'OFF') {
      pen.text('EMCON — NOT RADIATING', cx, y0 + sh / 2, { size: 20, color: C.amber, align: 'center' });
    }

    // lock-loss reason
    const ll = e.av.lastLockLoss;
    if (ll && now - ll.time < 4) {
      const why = ll.reason === 'terrain' ? 'TERRAIN MASK' : ll.reason === 'notch' ? 'NOTCHED' : ll.reason === 'gimbal' ? 'GIMBAL LIMIT' : ll.reason === 'range' ? 'OUT OF RANGE' : 'TARGET LOST';
      pen.text(`LOCK LOST — ${why}`, cx, y0 + 22, { size: 18, color: e.blink ? C.amber : C.yellow, align: 'center' });
    }

    const own = p.fm;
    const ownHdg = hdgOf(own.fwd);
    const drawn = new Set<number>();
    const tws = r.mode === 'TWS' || !!r.lock;

    // rank hostile tracks by range
    const hostiles = [...r.contacts.values()].filter((c) => c.hostile && c.target.alive && now - c.lastSeen < 8).sort((a, b) => a.range - b.range);
    const rank = new Map<number, number>();
    hostiles.forEach((c, i) => rank.set(c.target.id, i + 1));

    const symbol = (t: Aircraft, pos: THREE.Vector3, vel: THREE.Vector3, hostile: boolean, age: number, src: 'radar' | 'irst' | 'dl') => {
      const a = r.anglesTo(pos);
      if (Math.abs(a.az) > azDisp || a.range > R) return;
      const x = X(a.az), y = Y(a.range);
      const alpha = clamp(1 - age / 8, 0.25, 1);
      pen.ctx.globalAlpha = alpha;
      const locked = r.lock === t || p.irst?.lock === t;
      const col = hostile ? C.red : C.friend;
      pen.width(2);
      if (src === 'radar' && !tws) {
        // raw RWS brick
        pen.color = C.white;
        pen.rect(x - 7, y - 4, 14, 8, true);
      } else if (src === 'dl') {
        pen.color = hostile ? C.red : C.friend;
        pen.dash([3, 3]);
        pen.track(x, y, hostile ? 'hostile' : 'friendly', 9);
        pen.dash();
      } else {
        pen.color = col;
        pen.track(x, y, hostile ? 'hostile' : 'friendly', 11, locked);
        if (src === 'irst') {
          pen.color = C.yellow;
          pen.triangle(x, y + 16, 5, Math.PI);
        }
      }
      // velocity leader (heading relative to own heading)
      const sp = Math.hypot(vel.x, vel.z);
      if (sp > 20 && (tws || src !== 'radar')) {
        const rel = hdgOf(vel) - ownHdg;
        pen.color = col;
        pen.leader(x, y, rel, 10 + clamp(sp / 20, 0, 22));
      }
      // altitude (thousands of feet) and rank
      pen.text(String(Math.round(pos.y / FT / 1000)), x + 12, y + 14, { size: 16, color: C.white });
      const rk = rank.get(t.id);
      if (rk && tws && rk <= 8) pen.text(String(rk), x - 14, y - 12, { size: 16, color: C.yellow, align: 'right' });
      if (locked) {
        pen.color = C.white;
        pen.width(2);
        pen.rect(x - 16, y - 16, 32, 32);
        pen.diamond(x, y, 20);
      }
      pen.ctx.globalAlpha = 1;
      drawn.add(t.id);
    };

    if (r.mode !== 'OFF') {
      for (const c of r.contacts.values()) {
        if (!c.target.alive) continue;
        symbol(c.target, c.pos, c.vel, c.hostile, now - c.lastSeen, 'radar');
      }
    }
    if (p.irst) {
      for (const c of p.irst.contacts.values()) {
        if (drawn.has(c.target.id) || !c.target.alive) continue;
        symbol(c.target, c.pos, c.vel, c.hostile, now - c.lastSeen, 'irst');
      }
    }
    if (opt(e.st, 'dl', true)) {
      for (const t of g.picture.tracksFor(p.team)) {
        if (drawn.has(t.target.id) || !t.target.alive || now - t.time > 20) continue;
        symbol(t.target, t.pos, t.vel, true, (now - t.time) * 0.4, 'dl');
      }
    }

    // noise-jammer strobes (bearing only)
    if (r.mode !== 'OFF') {
      for (const s of r.strobes.values()) {
        if (drawn.has(s.target.id) || Math.abs(s.az) > azDisp) continue;
        const x = X(s.az);
        pen.color = C.amber;
        pen.width(2);
        pen.dash([3, 7]);
        pen.line(x, y0 + 30, x, y1);
        pen.dash();
        pen.text('J', x, y0 + 18, { size: 18, color: C.amber, align: 'center', bold: true });
      }
    }

    // own missiles in flight
    for (const m of g.sim.missiles) {
      if (m.shooter !== p || !m.alive) continue;
      const a = r.anglesTo(m.pos);
      if (Math.abs(a.az) > azDisp || a.range > R) continue;
      pen.color = m.mode === 'ACTIVE' || m.mode === 'IR' ? C.yellow : C.white;
      pen.circle(X(a.az), Y(a.range), 4, true);
      const tgt = m.target;
      if (tgt && tgt.alive && m.spec.seeker === 'ARH') {
        const ta = r.anglesTo(tgt.fm.pos);
        if (Math.abs(ta.az) <= azDisp && ta.range <= R) {
          const mr = m.pos.distanceTo(tgt.fm.pos);
          const closing = Math.max(150, m.vel.length());
          const pit = m.spec.seekerRange;
          const txt = m.mode === 'ACTIVE' ? `T${Math.max(0, Math.round(mr / closing))}` : `A${Math.max(0, Math.round((mr - pit) / closing))}`;
          pen.text(txt, X(ta.az) + 14, Y(ta.range) - 14, { size: 17, color: m.mode === 'ACTIVE' ? C.yellow : C.white });
        }
      }
    }

    // STT data block + DLZ
    const lt = p.lockedTarget;
    if (lt) {
      const rng = p.distanceTo(lt);
      const vc = closureKts(p, lt);
      const bx = x0 + 8, by = y0 + 44;
      const info = [
        `R ${(rng / NM).toFixed(1)}`,
        `A ${aspectText(p, lt)}`,
        `VC ${Math.round(vc)}`,
        `H ${String(Math.round(wrap360((hdgOf(lt.fm.vel) * 180) / Math.PI))).padStart(3, '0')}`,
        `M ${lt.fm.mach.toFixed(2)}`,
        `${Math.round(lt.fm.pos.y / FT / 100) * 100} FT`,
      ];
      pen.ctx.fillStyle = 'rgba(0,0,0,0.55)';
      pen.ctx.fillRect(bx - 4, by - 14, 118, info.length * 22 + 6);
      info.forEach((s, i) => pen.text(s, bx, by + i * 22, { size: 18, color: C.white }));
      // NCTR identification after a few seconds of STT
      pen.text(lt.spec.shortName.toUpperCase(), x1 - 8, y0 + 30, { size: 18, color: C.red, align: 'right', bold: true });
      const sel = p.selectedWeapon;
      if (sel !== 'GUN') {
        const lz = p.launchZoneFor(sel, lt);
        const sx = x1 - 22;
        const top = y0 + 60, bot = y1 - 20;
        const maxR = Math.max(lz.rmax * 1.25, rng * 1.05);
        const yy = (v: number) => bot - (clamp(v, 0, maxR) / maxR) * (bot - top);
        pen.color = C.green;
        pen.width(3);
        pen.line(sx, yy(lz.rmax), sx, yy(lz.rmin));
        pen.width(2);
        pen.line(sx - 10, yy(lz.rmax), sx + 4, yy(lz.rmax));
        pen.line(sx - 10, yy(lz.rne), sx + 4, yy(lz.rne));
        pen.line(sx - 10, yy(lz.rmin), sx + 4, yy(lz.rmin));
        const ry = yy(rng);
        pen.color = rng < lz.rmax && rng > lz.rmin ? C.yellow : C.white;
        pen.poly([sx + 4, ry, sx + 16, ry - 7, sx + 16, ry + 7], true, true);
        if (rng < lz.rne && rng > lz.rmin) pen.text('NEZ', sx - 12, yy(lz.rne) + 16, { size: 15, color: C.yellow, align: 'right' });
      }
    }

    // bottom status: own speed / altitude, selected weapon
    const sel = p.selectedWeapon;
    const wtxt = sel === 'GUN' ? `GUN ${p.gunAmmo}` : `${weaponCode(sel)} ${p.countOf(sel)}`;
    pen.text(`${Math.round(own.cas / KT)}`, x0, h - 56, { size: 18, color: C.greenDim });
    pen.text(wtxt, cx, h - 56, { size: 18, color: C.white, align: 'center' });
    pen.text(`${Math.round(own.pos.y / FT / 100) * 100}`, x1, h - 56, { size: 18, color: C.greenDim, align: 'right' });
  },
};
