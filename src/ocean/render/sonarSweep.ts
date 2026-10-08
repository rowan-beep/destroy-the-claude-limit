// The scanning sonar's sweep, as the overlay shows it in the water. A real
// scanning sonar turns its head step by step and builds a picture of
// everything round it, one narrow beam at a time; here the beam's bearing goes
// round, and as it passes over the sea bed, a wreck or a mooring, what it hits
// lights up blue and fades behind it (the display's persistence), with range
// rings every 50 m (that part is in the sea's material, oceanMaterial.ts). A
// faint disc at the head's depth shows the beam turning in the open water.
// Both are drawn at the same brightness whatever the eye's exposure, like the
// rest of the overlay, and only while the overlay is on.

import * as THREE from 'three';
import { OCEAN_FX } from './oceanMaterial';

/** the sweep as the shaders see it (the same uniforms the sea bed and the props use; set by the dive each frame) */
export const SWEEP = {
  uSweep: OCEAN_FX.uSweep,
  uSweepY: OCEAN_FX.uSweepY,
  uSweepSpan: OCEAN_FX.uSweepSpan,
  uSweepLead: OCEAN_FX.uSweepLead,
  uSweepK: OCEAN_FX.uSweepK,
  uSweepExpInv: OCEAN_FX.uSweepExpInv,
};

const DISC_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4( position, 1.0 );
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const DISC_FRAG = /* glsl */ `
uniform vec4 uSweep;
uniform float uSweepSpan, uSweepLead, uSweepK, uSweepExpInv, uWaterY;
varying vec3 vW;
void main() {
  vec2 sv = vW.xz - uSweep.xy;
  float sd = length( sv );
  float since = mod( uSweep.z - atan( sv.x, -sv.y ), 6.2831853 );
  if ( since > uSweepSpan || sd > uSweep.w || vW.y > uWaterY ) discard;
  float lead = exp( -since * 45.0 ) * uSweepLead;
  float trail = exp( -since * 1.8 );
  float ring = exp( -pow( ( fract( sd / 50.0 + 0.5 ) - 0.5 ) * 50.0, 2.0 ) * 0.8 );
  float fall = ( 1.0 - smoothstep( uSweep.w * 0.45, uSweep.w, sd ) ) * smoothstep( 2.0, 8.0, sd );
  float a = ( lead * 0.5 + trail * 0.035 + ring * trail * 0.12 ) * fall * uSweepK;
  if ( a < 0.0005 ) discard;
  gl_FragColor = vec4( vec3( 0.12, 0.55, 1.0 ) * a * uSweepExpInv, 0.0 );
}
`;

/** the faint turning disc at the head's depth */
export class SweepDisc {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    const g = new THREE.CircleGeometry(1, 160);
    g.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: DISC_VERT,
      fragmentShader: DISC_FRAG,
      uniforms: { ...SWEEP, uWaterY: OCEAN_FX.uWaterY },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 19;
    this.mesh.name = 'sonar-sweep';
    this.mesh.visible = false;
  }

  /** follow the head (call after the dive has set SWEEP) */
  update(): void {
    const s = SWEEP.uSweep.value;
    this.mesh.visible = SWEEP.uSweepK.value > 0.001;
    this.mesh.position.set(s.x, SWEEP.uSweepY.value, s.y);
    this.mesh.scale.setScalar(s.w);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
