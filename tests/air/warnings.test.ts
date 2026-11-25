// Each jet's own warning system (src/audio/warningSets.ts): its language, its calls, an English fallback for
// every call, sane tones, and the US jets' tones exactly as they were before the per-jet sets (7.15.17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WARNING_SETS, warningSetFor, warningPhrase, toneAt, type WarnEvent } from '../../src/audio/warningSets';
import { AIRCRAFT_TYPES, COMBAT_TYPES } from '../../src/aircraft/specs';

const LANG: Record<string, string> = {
  F15EX: 'en-US', FA18EF: 'en-US', F16C: 'en-US', F22: 'en-US', SR71: 'en-US', X15: 'en-US',
  TYPHOON: 'en-GB', SU35: 'ru-RU', MIG31: 'ru-RU', SU57: 'ru-RU', RAFALE: 'fr-FR', GRIPEN: 'sv-SE', J20: 'zh-CN',
};

test('every jet has a warning set in its nation\'s language', () => {
  for (const t of AIRCRAFT_TYPES) {
    const ws = WARNING_SETS[t];
    assert.ok(ws, `${t}: no warning set`);
    assert.equal(ws.lang, LANG[t], `${t}: language`);
    assert.ok(ws.sources.length > 40, `${t}: sources`);
    assert.ok(ws.system.length > 5, `${t}: system`);
  }
  assert.equal(warningSetFor('NOPE'), WARNING_SETS.F15EX);
  assert.equal(warningSetFor(undefined), WARNING_SETS.F15EX);
});

test('every combat jet calls the core warnings, natively and in English', () => {
  for (const t of COMBAT_TYPES) {
    const ws = WARNING_SETS[t];
    for (const ev of ['pullUp', 'altitude', 'missile', 'bingo', 'fire'] as WarnEvent[]) {
      assert.ok(warningPhrase(ws, ev, true), `${t}: no ${ev} in ${ws.lang}`);
      assert.ok(warningPhrase(ws, ev, false), `${t}: no English ${ev}`);
    }
  }
});

test('every native call has an English fallback, written in the right script', () => {
  const script: Record<string, RegExp> = { ru: /[Ѐ-ӿ]/, zh: /[一-鿿]/ };
  for (const t of AIRCRAFT_TYPES) {
    const ws = WARNING_SETS[t];
    const base = ws.lang.split('-')[0];
    for (const [ev, s] of Object.entries(ws.say)) {
      assert.ok(s && s.trim().length > 0, `${t}: empty ${ev}`);
      const en = ws.en[ev as WarnEvent];
      assert.ok(en && /^[\x20-\x7E]+$/.test(en), `${t}: English fallback for ${ev}: ${en}`);
      if (script[base]) assert.ok(script[base].test(s), `${t}: ${ev} "${s}" is not in ${ws.lang}`);
    }
    for (const ev of Object.keys(ws.en)) assert.ok(ws.say[ev as WarnEvent], `${t}: English-only call ${ev}`);
    for (const k of ['radar', 'ir', 'bomb', 'enRadar', 'enIr', 'enBomb'] as const) assert.ok(ws.launch[k], `${t}: launch ${k}`);
  }
});

test('the SR-71 and X-15 have no voice; the calls each system is known for are there', () => {
  for (const t of ['SR71', 'X15'] as const) {
    assert.equal(Object.keys(WARNING_SETS[t].say).length, 0, `${t} speaks`);
    assert.equal(warningPhrase(WARNING_SETS[t], 'pullUp', false), null);
  }
  assert.equal(WARNING_SETS.SU35.say.pullUp, 'Переведи в набор');
  assert.equal(WARNING_SETS.J20.say.rwrSearch, '敌搜索');
  assert.equal(WARNING_SETS.J20.say.rwrLock, '敌跟踪');
  assert.equal(WARNING_SETS.F16C.say.lock, 'Lock');
  assert.ok(WARNING_SETS.FA18EF.say.rollLeft && WARNING_SETS.FA18EF.say.rollRight);
  assert.ok(WARNING_SETS.TYPHOON.tones.attention?.length);
});

test('tones are sane for every jet', () => {
  for (const t of AIRCRAFT_TYPES) {
    const w = WARNING_SETS[t].tones;
    for (const p of [w.lock, w.missile, w.stall]) {
      assert.match(p.pattern, /^[01]+$/);
      assert.ok(p.pattern.includes('1'), `${t}: a tone that never sounds`);
      assert.ok(p.rate >= 0 && p.rate <= 30, `${t}: rate ${p.rate}`);
      for (const f of p.f) assert.ok(f >= 150 && f <= 4000, `${t}: ${f} Hz`);
    }
    for (const [f, at] of w.newThreat) assert.ok(f >= 150 && f <= 4000 && at >= 0 && at < 1, `${t}: new threat`);
    for (const [f, d, at] of [...w.caution, ...(w.attention ?? [])]) assert.ok(f >= 150 && f <= 4000 && d > 0 && d < 1 && at >= 0 && at < 1, `${t}: caution`);
    assert.ok(w.search[0] >= 150 && w.search[1] > 0 && w.search[1] < 0.2);
  }
});

test('the US jets keep the 7.15.17 tones exactly', () => {
  for (const t of ['F15EX', 'FA18EF', 'F16C', 'F22'] as const) {
    const w = WARNING_SETS[t].tones;
    for (let i = 0; i < 2000; i++) {
      const tt = i * 0.0137;
      // (audio.ts before this update)
      const missile = toneAt(w.missile, tt);
      assert.deepEqual(missile, { on: true, f: Math.floor(tt * 12) % 2 === 0 ? 1650 : 1250 });
      const lock = toneAt(w.lock, tt);
      assert.equal(lock.on, Math.floor(tt * 3.5) % 4 !== 3);
      assert.equal(lock.f, 1020);
      const stall = toneAt(w.stall, tt);
      assert.equal(stall.on, Math.floor(tt * 5) % 2 === 0);
      assert.equal(stall.f, 560);
    }
    assert.deepEqual(w.newThreat, [[1150, 0], [1450, 0.07], [1150, 0.16], [1450, 0.23]]);
    assert.deepEqual(w.search, [1200, 0.05]);
    assert.deepEqual(w.caution, [[880, 0.12, 0], [880, 0.12, 0.2]]);
    assert.equal(w.wave, 'square');
  }
});

test('the phrase falls back to English, and to nothing where the system has no such call', () => {
  const ru = WARNING_SETS.MIG31;
  assert.equal(warningPhrase(ru, 'pullUp', true), 'Переведи в набор');
  assert.equal(warningPhrase(ru, 'pullUp', false), 'Climb, climb');
  assert.equal(warningPhrase(ru, 'rollLeft', true), null);
  assert.equal(warningPhrase(ru, 'rollLeft', false), null);
  assert.equal(warningPhrase(WARNING_SETS.F15EX, 'lock', true), null);
});
