import type { Aircraft } from '../aircraft';
import { AirframeVisual } from './visual';
import { buildF15EX } from './f15ex';
import { buildFA18 } from './fa18';
import { buildTyphoon } from './typhoon';

/** Build the full visual model for an aircraft (one of the three allowed types). */
export function createAirframe(ac: Aircraft): AirframeVisual {
  const v = new AirframeVisual(ac);
  if (ac.type === 'F15EX') buildF15EX(v);
  else if (ac.type === 'FA18EF') buildFA18(v);
  else buildTyphoon(v);
  v.buildStores();
  return v;
}

export { AirframeVisual };
