// Numeric check for the missile racks (racks.ts). Run in the dev game's browser console (npm run dev),
// on the menu with the hangar showing:   eval(await (await fetch('/tools/checkRacks.js')).text()); await checkRacks()
// (or paste the file). Needs window.__hangar and window.__THREE, which the dev build exposes.
//
// For every jet and every loadout it builds the stores and checks:
//   1. the rack geometry has no NaN and every loaded external station was drawn;
//   2. no store's body is inside the airframe (semi-recessed and conformal stations excepted): a ray up from the store's centre line may not hit the
//      skin closer than the store's radius (gear up, bay doors shut);
//   3. a store does not hang far from the skin without a rack to hold it: gap from the store's top to the
//      skin above it is at most MAX_GAP (m), counting the nearest 3 samples along the store.
// It returns { fails, known } (fails is [] when everything passes) and logs a one-line summary. "known" lists
// findings that are expected and explained (KNOWN below), so they do not hide a new failure.
const KNOWN = {
  // the Typhoon's centreline tank touches the small blade fitting under the fuselage there; lowering the tank to
  // clear it would put it below the ground (gear height 1.9 m). Pre-existing, not from the racks.
  'TYPHOON st6': 'centreline tank against the ventral blade fitting',
  // the Gripen's centreline tank now hangs 3 cm under the belly (it sat 28 cm inside it); a small fitting on the
  // centre line 0.6 m aft of the station reaches 14 cm below the belly into the tank's top. Lower would leave
  // the tank too close to the runway (gear height 1.6 m).
  'GRIPEN st5': 'centreline tank against a small ventral fitting',
};
async function checkRacks(opts = {}) {
  const MAX_GAP = opts.maxGap ?? 0.75;
  const H = window.__hangar, T = window.__THREE;
  const S = await import('/src/aircraft/models/stores.ts');
  const RK = await import('/src/aircraft/models/racks.ts');
  const types = opts.types ?? ['F15EX', 'FA18EF', 'F16C', 'TYPHOON', 'SU35', 'RAFALE', 'F22', 'MIG31', 'SR71', 'X15', 'SU57', 'GRIPEN'];
  const fails = [], known = [];
  const report = (type, id, msg) => (KNOWN[type + ' st' + id] ? known : fails).push(msg);
  let checked = 0;
  for (const type of types) {
    H.setJet(type);
    for (let i = 0; i < 80 && (H.current !== type || H.pending); i++) await new Promise((r) => setTimeout(r, 250));
    const j = H.jets.get(type);
    if (!j) { fails.push(type + ': jet not built'); continue; }
    for (const lo of j.ac.spec.loadouts) {
      j.ac.applyLoadout(lo);
      j.vis.buildStores();
      j.ac.fm.gearPos = 0;
      for (const k of Object.keys(j.ac.bayDoor)) j.ac.bayDoor[k] = 0;
      for (let i = 0; i < 30; i++) j.vis.update(0.1);
      j.vis.root.updateMatrixWorld(true);
      // 1. every loaded external station drawn by the jet's racks (when the jet has racks), and no NaN
      const loaded = j.ac.stations.flatMap((s) => (s.store ? [{ def: s.def, store: s.store }] : []));
      const rk = RK.jetRacks(j.ac.spec, loaded);
      if (rk.geo) for (const l of loaded) if (l.def.mount !== 'internal' && !rk.handled.has(l.def.id)) fails.push(`${type}:${lo.id} st${l.def.id} (${l.def.label}): no rack drawn`);
      for (const p of j.vis.pylons) {
        const a = p.geometry.attributes.position.array;
        for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { fails.push(`${type}:${lo.id}: NaN in the rack mesh`); break; }
      }
      const skip = new Set();
      for (const [, g] of j.vis.stationMeshes) g.traverse((o) => skip.add(o));
      for (const p of j.vis.pylons) skip.add(p);
      const targets = [];
      j.vis.root.traverse((o) => { if (o.isMesh && !skip.has(o) && o.visible && !(o.material && o.material.transparent) && o.name !== 'shadow-proxy') targets.push(o); });
      const rc = new T.Raycaster();
      const up = new T.Vector3(0, 1, 0).transformDirection(j.vis.body.matrixWorld);
      for (const st of j.ac.stations) {
        if (!st.store || st.def.mount === 'internal') continue;
        checked++;
        const r = S.storeRadius(st.store);
        const cx = S.storeCenterX(st.def, st.store), cy = S.storeCenterY(st.def, st.store), z0 = st.def.pos[2];
        const gaps = [];
        for (const dz of [-0.6, -0.3, 0, 0.3, 0.6]) {
          const o = new T.Vector3(cx, cy, z0 + dz);
          j.vis.body.localToWorld(o);
          rc.set(o, up);
          rc.far = 3;
          const h = rc.intersectObjects(targets, false)[0];
          if (h) gaps.push(h.distance - r);
        }
        if (!gaps.length) { fails.push(`${type}:${lo.id} st${st.def.id} (${st.def.label}): nothing above the store`); continue; }
        const min = Math.min(...gaps);
        // (belly AMRAAMs of the Typhoon / Rafale-type jets and CFT missiles are meant to sit partly in the skin)
        const recessed = st.def.mount === 'semi-recessed' || st.def.mount === 'conformal';
        if (min < -0.01 && !recessed) report(type, st.def.id, `${type}:${lo.id} st${st.def.id} (${st.def.label}): store body ${(-min * 100).toFixed(1)} cm inside the airframe`);
        gaps.sort((a, b) => a - b);
        const near = gaps[Math.min(2, gaps.length - 1)];
        if (near > MAX_GAP) report(type, st.def.id, `${type}:${lo.id} st${st.def.id} (${st.def.label}): ${near.toFixed(2)} m of air above the store (max ${MAX_GAP})`);
      }
    }
  }
  console.log(`checkRacks: ${checked} stations checked, ${fails.length} failures, ${known.length} known`);
  return { fails, known };
}
window.checkRacks = checkRacks;
