// Accounts and cloud saves (Supabase) for the website and the Windows app.
//
// Sign-in is by email: Supabase sends a short code and the player types it in.
// The first time a player signs in, everything this device has saved is copied to
// the account (the browser copy stays exactly as it is). After that the save
// follows the account: changes go up every 20 s and when the game is hidden, and
// another device that signs in gets them. When a device and the account have both
// moved on, the player chooses which to keep, and the other copy is stored in the
// account's backups first, so nothing is ever lost. The ranked leaderboard for
// these builds lives here too. The claude.ai artifact has its own storage and
// board, so none of this runs there.

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { inArtifact } from './artifact';
import { applySave, isEmptySave, planSync, saveHash, snapshot, summarize, type SaveData, type SaveSummary } from './cloudSave';

const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const SUPABASE_URL = ENV?.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = ENV?.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
/** what this device and its account last agreed on (not part of the save itself) */
const BOOK = 'triad.cloud.v1';
const SYNC_EVERY = 20000;

export type CloudStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'conflict' | 'offline' | 'error';

export interface CloudConflict {
  device: SaveSummary;
  account: SaveSummary & { savedAt: string; on: string | null };
}

export interface CloudState {
  status: CloudStatus;
  email: string | null;
  /** when this device last matched the account (ms, 0: not yet) */
  lastSync: number;
  /** what went wrong, for the account screen */
  message: string;
  conflict: CloudConflict | null;
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    s.getItem(BOOK);
    return s;
  } catch {
    return null;
  }
}

/** Accounts and the online leaderboard exist in this copy of the game. */
export function cloudEnabled(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_KEY && typeof window !== 'undefined' && !inArtifact() && !!storage();
}

let clientP: Promise<SupabaseClient | null> | null = null;
function client(): Promise<SupabaseClient | null> {
  clientP ??= cloudEnabled()
    ? import('@supabase/supabase-js').then(
        ({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }),
        () => null,
      )
    : Promise.resolve(null);
  return clientP;
}

const state: CloudState = { status: cloudEnabled() ? 'signed-out' : 'off', email: null, lastSync: 0, message: '', conflict: null };
const subs = new Set<(s: CloudState) => void>();
function set(p: Partial<CloudState>): void {
  Object.assign(state, p);
  for (const f of subs) f(state);
}

/** Follow the account state (called at once with the current one). */
export function onCloud(fn: (s: CloudState) => void): () => void {
  subs.add(fn);
  fn(state);
  return () => subs.delete(fn);
}

export function cloudState(): CloudState {
  return state;
}

let userId: string | null = null;
/** The signed-in account's id (null: signed out). */
export function cloudUserId(): string | null {
  return userId;
}

// ---------------------------------------------------------------- bookkeeping
interface Book {
  user: string;
  hash: string;
  at: number;
}

function agreedHash(user: string): string | null {
  try {
    const b = JSON.parse(storage()?.getItem(BOOK) ?? 'null') as Book | null;
    return b && b.user === user && typeof b.hash === 'string' ? b.hash : null;
  } catch {
    return null;
  }
}

function agree(user: string, hash: string): void {
  try {
    storage()?.setItem(BOOK, JSON.stringify({ user, hash, at: Date.now() } satisfies Book));
  } catch {
    /* storage full: we will simply compare again next time */
  }
  set({ status: 'synced', lastSync: Date.now(), message: '', conflict: null });
}

function deviceName(): string {
  return /Electron/i.test(navigator.userAgent) ? 'Windows app' : 'Browser';
}

function errorText(e: unknown): string {
  const o = (e ?? {}) as { message?: string; code?: string };
  if (o.code === '42P01' || o.code === 'PGRST205' || /does not exist|could not find the table/i.test(o.message ?? '')) return 'Online saves are not set up yet.';
  if (/fetch|network|failed to load/i.test(o.message ?? '')) return 'Could not reach the server.';
  return o.message || 'Something went wrong.';
}

// ---------------------------------------------------------------- sync
interface CloudRow {
  data: SaveData;
  hash: string;
  device: string | null;
  updated_at: string;
}
/** the account's save while the player decides between it and this device's */
let pending: CloudRow | null = null;
let busy = false;

async function backup(c: SupabaseClient, data: SaveData, reason: string): Promise<void> {
  if (isEmptySave(data)) return;
  const { error } = await c.from('save_backups').insert({ user_id: userId, data, reason, device: deviceName() });
  if (error) throw error;
}

/** Send this device's save. `expect`: the account's save fingerprint it replaces (null: none yet). */
async function upload(c: SupabaseClient, local: SaveData, expect: string | null): Promise<boolean> {
  const user = userId;
  if (!user) return false;
  const hash = saveHash(local);
  if (expect === null) {
    const { error } = await c.from('saves').insert({ user_id: user, data: local, hash, device: deviceName() });
    if (error) {
      if (error.code === '23505') return false; // another device created it meanwhile
      throw error;
    }
  } else {
    // only replace the version we know about: if another device saved since, think again
    const { data, error } = await c.from('saves').update({ data: local, hash, device: deviceName() }).eq('user_id', user).eq('hash', expect).select('hash');
    if (error) throw error;
    if (!data?.length) return false;
  }
  agree(user, hash);
  return true;
}

/** Put the account's save on this device (the device's own copy is backed up first), then restart. */
async function download(c: SupabaseClient, row: CloudRow, local: SaveData): Promise<void> {
  const st = storage();
  const user = userId;
  if (!st || !user) return;
  await backup(c, local, 'device-replaced');
  applySave(st, row.data);
  agree(user, saveHash(row.data));
  location.reload();
}

async function fetchSave(c: SupabaseClient): Promise<CloudRow | null> {
  const { data, error } = await c.from('saves').select('data,hash,device,updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as CloudRow | null) ?? null;
}

/** Compare this device with the account and act on it. */
async function reconcile(): Promise<void> {
  const c = await client();
  const st = storage();
  if (!c || !st || !userId || busy) return;
  busy = true;
  set({ status: 'syncing', message: '' });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await fetchSave(c);
      const local = snapshot(st);
      const cloudHash = row ? saveHash(row.data) : null;
      const plan = planSync(local, cloudHash, agreedHash(userId));
      if (plan.do === 'none') {
        if (row) agree(userId, row.hash);
        else set({ status: 'synced', lastSync: Date.now(), message: '' });
        return;
      }
      if (plan.do === 'upload') {
        if (await upload(c, local, row ? row.hash : null)) return;
        continue; // the account changed under us: look again
      }
      if (plan.do === 'download' && row) {
        await download(c, row, local);
        return;
      }
      if (plan.do === 'ask' && row) {
        pending = row;
        set({
          status: 'conflict',
          conflict: { device: summarize(local), account: { ...summarize(row.data), savedAt: row.updated_at, on: row.device } },
        });
        return;
      }
    }
    set({ status: 'error', message: 'Your save kept changing on another device. Try again in a moment.' });
  } catch (e) {
    set({ status: navigator.onLine === false ? 'offline' : 'error', message: errorText(e) });
  } finally {
    busy = false;
  }
}

/** Every few seconds: send this device's changes, or retry after a failure. */
async function tick(): Promise<void> {
  const c = await client();
  const st = storage();
  if (!c || !st || !userId || busy) return;
  if (state.status === 'error' || state.status === 'offline') return reconcile();
  if (state.status !== 'synced') return;
  const local = snapshot(st);
  const agreed = agreedHash(userId);
  if (saveHash(local) === agreed) return;
  busy = true;
  let ok = false;
  try {
    ok = await upload(c, local, agreed);
  } catch (e) {
    set({ status: navigator.onLine === false ? 'offline' : 'error', message: errorText(e) });
    ok = true;
  } finally {
    busy = false;
  }
  if (!ok) await reconcile();
}

/** The player's choice when this device and the account both have new progress. */
export async function resolveConflict(keep: 'device' | 'account'): Promise<void> {
  const c = await client();
  const st = storage();
  const row = pending;
  if (!c || !st || !row || !userId) return;
  busy = true;
  set({ status: 'syncing', message: '' });
  try {
    const local = snapshot(st);
    if (keep === 'account') {
      await download(c, row, local);
      return;
    }
    await backup(c, row.data, 'account-replaced');
    pending = null;
    busy = false;
    if (!(await upload(c, local, row.hash))) await reconcile();
  } catch (e) {
    set({ status: 'conflict', message: errorText(e) });
  } finally {
    busy = false;
  }
}

// ---------------------------------------------------------------- sign-in
let started = false;
let readyResolve: () => void = () => {};
const ready = new Promise<void>((r) => (readyResolve = r));

async function onSession(session: Session | null): Promise<void> {
  const id = session?.user.id ?? null;
  if (id === userId) return; // token refreshes and repeats
  userId = id;
  pending = null;
  if (!id) {
    set({ status: 'signed-out', email: null, lastSync: 0, conflict: null, message: '' });
    return;
  }
  set({ email: session?.user.email ?? null });
  await reconcile();
}

/** Restore the last session and start syncing (website and Windows app only). */
export async function startCloud(): Promise<void> {
  if (started) return;
  started = true;
  const c = await client();
  if (!c) {
    readyResolve();
    return;
  }
  // (Supabase calls inside this callback can deadlock its lock: defer them)
  c.auth.onAuthStateChange((_ev, session) => setTimeout(() => void onSession(session), 0));
  try {
    const { data } = await c.auth.getSession();
    await onSession(data.session);
  } catch {
    /* offline: still signed in, synced later */
  }
  readyResolve();
  setInterval(() => void tick(), SYNC_EVERY);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void tick();
  });
}

/** Email the player a sign-in code (creates the account the first time). */
export async function sendCode(email: string): Promise<void> {
  const c = await client();
  if (!c) throw new Error('Accounts are not available in this version of the game.');
  const { error } = await c.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) {
    if (/not authori[sz]ed/i.test(error.message)) throw new Error('Sign-in emails cannot be sent to this address yet. Please try again later.');
    if (/rate limit|too many/i.test(error.message)) throw new Error('Too many sign-in emails were sent. Please wait a while and try again.');
    throw new Error(error.message);
  }
}

/** Finish signing in with the code from the email. */
export async function verifyCode(email: string, code: string): Promise<void> {
  const c = await client();
  if (!c) throw new Error('Accounts are not available in this version of the game.');
  const { data, error } = await c.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s+/g, ''), type: 'email' });
  if (error) throw new Error(error.message);
  await onSession(data.session);
}

/** Sign out. This device keeps everything it has saved. */
export async function signOut(): Promise<void> {
  const c = await client();
  if (!c) return;
  await tick();
  await c.auth.signOut({ scope: 'local' });
  await onSession(null);
}

export async function syncNow(): Promise<void> {
  if (state.status === 'synced') await tick();
  else await reconcile();
}

// ---------------------------------------------------------------- leaderboard
export interface CloudRankRow {
  user_id: string;
  callsign: string;
  rp: number;
  wins: number;
  losses: number;
  kills: number;
}

const int = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));

/** Write the signed-in pilot's row for the week. */
export async function cloudPublishRank(r: { week: string; callsign: string; rp: number; maxRp: number; wins: number; losses: number; kills: number }): Promise<boolean> {
  const c = await client();
  if (!c) return false;
  await Promise.race([ready, new Promise((r) => setTimeout(r, 4000))]);
  if (!userId) return false;
  const { error } = await c.from('ranked').upsert({
    user_id: userId,
    week: r.week,
    callsign: r.callsign.slice(0, 16) || 'PILOT',
    rp: int(r.rp, 0, 100000),
    max_rp: int(r.maxRp, 0, 100000),
    wins: int(r.wins, 0, 1000000),
    losses: int(r.losses, 0, 1000000),
    kills: int(r.kills, 0, 10000000),
    updated_at: new Date().toISOString(),
  });
  return !error;
}

/** The week's board, best first (null: unavailable). Anyone can read it. */
export async function cloudBoard(week: string, limit: number): Promise<CloudRankRow[] | null> {
  const c = await client();
  if (!c) return null;
  await Promise.race([ready, new Promise((r) => setTimeout(r, 4000))]);
  const { data, error } = await c.from('ranked').select('user_id,callsign,rp,wins,losses,kills').eq('week', week).order('rp', { ascending: false }).limit(limit);
  return error ? null : ((data as CloudRankRow[]) ?? []);
}
