// The Echo Atlas: the player's lasting record of the sea. Not a collection of
// icons but of evidence: where a sound was heard from, which way it lay, how two
// bearings narrowed it, what was found there and why the explanation changed.
// Pure data with an injectable store, saved as one small JSON document.

import { triangulate, type BearingLine, type Fix, type SoundPattern } from '../acoustics/acoustics';

export type ContactStatus = 'heard' | 'bearing' | 'located' | 'confirmed';

export interface Interpretation {
  t: number;
  text: string;
}

export interface AtlasContact {
  id: string;
  label: string;
  status: ContactStatus;
  pattern: SoundPattern;
  /** how the explanation changed (oldest first) */
  interpretations: Interpretation[];
  /** the current search area from the bearings */
  estimate: Fix | null;
  /** where it was found, once found */
  site: { x: number; z: number; depth: number } | null;
  /** pinned beside the next briefing */
  pinned: boolean;
}

export interface Observation {
  id: string;
  contactId: string;
  x: number;
  z: number;
  depth: number;
  bearing: number;
  halfWidth: number;
  snr: number;
  t: number;
}

export type EvidenceKind = 'sound' | 'photo' | 'scan' | 'item' | 'note';

export interface Evidence {
  id: string;
  contactId: string | null;
  kind: EvidenceKind;
  title: string;
  text: string;
  /** a photograph (a small JPEG data URL), for kind 'photo' */
  image?: string;
  t: number;
}

export interface Track {
  mission: string;
  t: number;
  /** x, z, depth every few tens of metres */
  points: [number, number, number][];
}

export type MarkerKind = 'return' | 'narrow' | 'listen' | 'note';
export interface Marker {
  id: string;
  kind: MarkerKind;
  x: number;
  z: number;
  text: string;
}

export interface ExpeditionRecord {
  mission: string;
  t: number;
  durationS: number;
  distanceM: number;
  maxDepth: number;
  bearings: number;
  /** how far the triangulated centre was from the true source (m), if known */
  fixErrorM: number | null;
  batteryUsed: number;
  recovered: string[];
}

export interface AtlasData {
  v: 1;
  contacts: AtlasContact[];
  observations: Observation[];
  evidence: Evidence[];
  tracks: Track[];
  markers: Marker[];
  /** region ids the player has been to */
  visited: string[];
  expeditions: ExpeditionRecord[];
}

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** localStorage, quietly doing nothing where storage is blocked */
export const browserStore: Store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode or full: this session keeps it in memory */
    }
  },
};

export const ATLAS_KEY = 'triad.ocean.atlas.v1';
/** photographs kept (the oldest drop off): the atlas must stay small */
const MAX_PHOTOS = 16;
const MAX_TRACKS = 12;

export function emptyAtlas(): AtlasData {
  return { v: 1, contacts: [], observations: [], evidence: [], tracks: [], markers: [], visited: [], expeditions: [] };
}

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export class EchoAtlas {
  data: AtlasData;

  constructor(private store: Store = browserStore) {
    this.data = EchoAtlas.parse(store.get(ATLAS_KEY));
  }

  static parse(raw: string | null): AtlasData {
    if (!raw) return emptyAtlas();
    try {
      const d = JSON.parse(raw) as AtlasData;
      if (d && d.v === 1 && Array.isArray(d.contacts)) {
        // (fields added later get their defaults)
        return { ...emptyAtlas(), ...d };
      }
    } catch {
      /* a damaged save: start a fresh atlas rather than fail */
    }
    return emptyAtlas();
  }

  save(): void {
    this.store.set(ATLAS_KEY, JSON.stringify(this.data));
  }

  contact(id: string): AtlasContact | undefined {
    return this.data.contacts.find((c) => c.id === id);
  }

  /** a contact enters the atlas the first time it is heard */
  hear(id: string, label: string, pattern: SoundPattern, interpretation: string): AtlasContact {
    let c = this.contact(id);
    if (!c) {
      c = { id, label, status: 'heard', pattern, interpretations: [{ t: Date.now(), text: interpretation }], estimate: null, site: null, pinned: false };
      this.data.contacts.push(c);
      this.addEvidence({ contactId: id, kind: 'sound', title: `Recording: ${label}`, text: pattern.caption });
      this.save();
    }
    return c;
  }

  interpret(id: string, text: string, label?: string): void {
    const c = this.contact(id);
    if (!c) return;
    const last = c.interpretations[c.interpretations.length - 1];
    if (!last || last.text !== text) c.interpretations.push({ t: Date.now(), text });
    if (label) c.label = label;
    this.save();
  }

  /** a bearing from a listening position; the search area is recomputed from every bearing on the contact */
  observe(o: Omit<Observation, 'id' | 't'>): { obs: Observation; fix: Fix | null } {
    const obs: Observation = { ...o, id: uid('obs'), t: Date.now() };
    this.data.observations.push(obs);
    const c = this.contact(o.contactId);
    let fix: Fix | null = null;
    if (c) {
      fix = triangulate(this.linesFor(c.id));
      if (c.status === 'heard') c.status = 'bearing';
      if (fix) {
        c.estimate = fix;
        if (c.status === 'bearing') c.status = 'located';
      }
    }
    this.save();
    return { obs, fix };
  }

  linesFor(contactId: string): BearingLine[] {
    return this.data.observations.filter((o) => o.contactId === contactId).map((o) => ({ x: o.x, z: o.z, bearing: o.bearing, halfWidth: o.halfWidth }));
  }

  /** the source has been seen and explained */
  confirm(id: string, site: { x: number; z: number; depth: number }, label: string, interpretation: string): void {
    const c = this.contact(id);
    if (!c) return;
    c.status = 'confirmed';
    c.site = site;
    this.interpret(id, interpretation, label);
  }

  addEvidence(e: Omit<Evidence, 'id' | 't'>): Evidence {
    const ev: Evidence = { ...e, id: uid('ev'), t: Date.now() };
    this.data.evidence.push(ev);
    // keep the photographs within bounds (the text evidence stays)
    const photos = this.data.evidence.filter((x) => x.kind === 'photo');
    if (photos.length > MAX_PHOTOS) {
      const drop = new Set(photos.slice(0, photos.length - MAX_PHOTOS).map((x) => x.id));
      this.data.evidence = this.data.evidence.filter((x) => !drop.has(x.id));
    }
    this.save();
    return ev;
  }

  evidenceFor(contactId: string): Evidence[] {
    return this.data.evidence.filter((e) => e.contactId === contactId);
  }

  pin(id: string, on: boolean): void {
    for (const c of this.data.contacts) c.pinned = on && c.id === id;
    this.save();
  }

  visit(regionId: string): boolean {
    if (this.data.visited.includes(regionId)) return false;
    this.data.visited.push(regionId);
    this.save();
    return true;
  }

  addMarker(kind: MarkerKind, x: number, z: number, text: string): Marker {
    const m: Marker = { id: uid('mk'), kind, x, z, text };
    this.data.markers.push(m);
    this.save();
    return m;
  }

  removeMarker(id: string): void {
    this.data.markers = this.data.markers.filter((m) => m.id !== id);
    this.save();
  }

  /** keep a finished route (the oldest drop off) */
  addTrack(t: Track): void {
    if (t.points.length < 2) return;
    this.data.tracks.push(t);
    if (this.data.tracks.length > MAX_TRACKS) this.data.tracks.splice(0, this.data.tracks.length - MAX_TRACKS);
    this.save();
  }

  addExpedition(r: ExpeditionRecord): void {
    this.data.expeditions.push(r);
    this.save();
  }

  reset(): void {
    this.data = emptyAtlas();
    this.save();
  }
}

/** a route recorder that keeps a point every `spacing` metres */
export class TrackRecorder {
  points: [number, number, number][] = [];
  distance = 0;
  private last: [number, number, number] | null = null;

  constructor(private spacing = 25) {}

  add(x: number, z: number, depth: number): void {
    if (!this.last) {
      this.last = [x, z, depth];
      this.points.push([Math.round(x), Math.round(z), Math.round(depth)]);
      return;
    }
    const d = Math.hypot(x - this.last[0], z - this.last[1]);
    if (d >= this.spacing) {
      this.distance += d;
      this.last = [x, z, depth];
      this.points.push([Math.round(x), Math.round(z), Math.round(depth)]);
    }
  }
}
