// Map selection: which theater is active, remembered between visits. The
// map is chosen before the world is built (a change reloads the page), and
// the same choice is sent to every terrain worker before its first job.

import { setMapDimensions } from '../core/constants';
import { applyMapData, MAPS, MapId, activeMap } from './islands';
import { refreshGridSize } from './heightGrid';
import { refreshTerrainCaches } from './terrain';
import { refreshCarriers } from './carriers';

const KEY = 'triad.map.v1';
/** New players start on the newest map. */
export const DEFAULT_MAP: MapId = 'jade';

/** Make `id` the active map everywhere in this thread (main or worker). */
export function applyMap(id: MapId): void {
  applyMapData(id);
  setMapDimensions(activeMap.sizeNm, activeMap.maxTerrain);
  refreshGridSize();
  refreshTerrainCaches();
  refreshCarriers();
}

export function loadMapChoice(): MapId {
  // a switch made where storage is blocked rides along in the URL hash
  const hm = /map=(\w+)/.exec(typeof location !== 'undefined' ? location.hash : '');
  if (hm && MAPS.some((m) => m.id === hm[1])) return hm[1] as MapId;
  try {
    const v = localStorage.getItem(KEY);
    if (v && MAPS.some((m) => m.id === v)) return v as MapId;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_MAP;
}

export function saveMapChoice(id: MapId): boolean {
  try {
    localStorage.setItem(KEY, id);
    return localStorage.getItem(KEY) === id;
  } catch {
    return false;
  }
}

/** Change theater: remember it and restart the game on the new map. */
export function switchMap(id: MapId, extraHash = ''): void {
  saveMapChoice(id);
  try {
    location.hash = `map=${id}${extraHash ? '&' + extraHash : ''}`;
  } catch {
    /* ignore */
  }
  setTimeout(() => location.reload(), 60);
}

export { activeMap, MAPS };
export type { MapId };
