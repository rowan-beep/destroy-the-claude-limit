// The curve of the Earth. The world is flat for the simulation, but seen from
// high up (the X-15 goes past 350,000 ft) the ground and sea must fall away
// toward a curved horizon. Every vertex is lowered in view space by d^2 / 2R,
// d being its horizontal distance from the camera and R the Earth's radius;
// the effect fades in with camera height, so nothing changes down low.
//
// Installed once, before any material compiles: it patches three's shared
// vertex projection chunk (every built-in material) and offers the same
// function to the game's own shaders (ocean, clouds) through <common>.

import * as THREE from 'three';

const CURVE_GLSL = /* glsl */ `
// lower a view-space position by the Earth's curvature below the camera
vec4 curveView( vec4 mv ) {
  float k = smoothstep( 3000.0, 25000.0, cameraPosition.y ) * 7.848e-8;
  if ( k <= 0.0 ) return mv;
  vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float along = dot( mv.xyz, upV );
  float h2 = max( 0.0, dot( mv.xyz, mv.xyz ) - along * along );
  mv.xyz -= upV * ( h2 * k );
  return mv;
}
`;

/**
 * A flat disc in the XZ plane (facing up) made of concentric rings, dense at the
 * centre and spaced geometrically out to radius R. Big flat surfaces (sea, cloud
 * decks) need it: the curvature bends vertices, so a two-triangle plane or a
 * fan would turn into a cone instead of a sphere. UVs match a plane of side
 * uvSize rotated flat (u along +x, v along -z).
 */
export function ringDisc(R: number, rings: number, seg: number, r0: number, uvSize = 2 * R): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const uv: number[] = [0.5, 0.5];
  for (let i = 0; i < rings; i++) {
    const r = i === rings - 1 ? R : r0 * Math.pow(R / r0, i / (rings - 1));
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, 0, z);
      uv.push(x / uvSize + 0.5, -z / uvSize + 0.5);
    }
  }
  const idx: number[] = [];
  for (let k = 0; k < seg; k++) idx.push(0, 1 + ((k + 1) % seg), 1 + k);
  for (let i = 0; i < rings - 1; i++) {
    const a0 = 1 + i * seg, b0 = 1 + (i + 1) * seg;
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      idx.push(a0 + k, a0 + k1, b0 + k, a0 + k1, b0 + k1, b0 + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

let installed = false;

export function installCurvature(): void {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  if (!C.common.includes('curveView')) C.common = C.common + '\n' + CURVE_GLSL;
  const pv = C.project_vertex;
  const target = 'gl_Position = projectionMatrix * mvPosition;';
  if (pv.includes(target) && !pv.includes('curveView')) C.project_vertex = pv.replace(target, 'mvPosition = curveView( mvPosition );\n' + target);
}

installCurvature();
