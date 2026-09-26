import type { Aircraft } from '../aircraft';
import { AirframeVisual } from './visual';
import { buildF15EX } from './f15ex';
import { buildFA18 } from './fa18';
import { buildTyphoon } from './typhoon';
import { buildSu35, su35PlainLivery } from './su35';
import { partMaterials } from './parts';
import { f15PlainLivery } from './f15ex';
import type { PaintConfig } from './paint';

// One fully built airframe per type and coalition; every aircraft in the
// sim is a clone sharing its geometry, livery and materials.
const templates = new Map<string, AirframeVisual>();

function template(ac: Aircraft): AirframeVisual {
  const key = `${ac.type}:${ac.team}`;
  let t = templates.get(key);
  if (!t) {
    t = new AirframeVisual(ac);
    if (ac.type === 'F15EX') buildF15EX(t);
    else if (ac.type === 'FA18EF') buildFA18(t);
    else if (ac.type === 'SU35') buildSu35(t);
    else buildTyphoon(t);
    const pm = partMaterials();
    t.finishTemplate(new Set([pm.duct, pm.seat, pm.flight, pm.helmet, pm.visor, pm.antenna, pm.formation, pm.darkMetal, pm.lens, pm.frame]));
    templates.set(key, t);
  }
  return t;
}

/** Build the full visual model for an aircraft (one of the four allowed types). */
export function createAirframe(ac: Aircraft): AirframeVisual {
  const v = template(ac).cloneFor(ac);
  v.buildStores();
  return v;
}

/** Build templates ahead of time (so the first spawn of a type doesn't hitch). */
export function prewarmAirframes(list: Aircraft[]): void {
  for (const a of list) template(a);
}

/** Put a paint job on one aircraft's visual (the player's jet, the hangar jet). */
export function paintAirframe(v: AirframeVisual, cfg: PaintConfig | null): void {
  v.applyPaint(cfg, v.ac.type === 'F15EX' ? f15PlainLivery(v.ac.team) : v.ac.type === 'SU35' ? su35PlainLivery(v.ac.team) : null);
}

export { AirframeVisual };
