// Rain on the screen: water beads on the canopy / lens that refract the view
// behind them. New drops land, grow, and slide away: down with gravity when
// slow, back toward the edges of the screen in the airflow when fast.

import * as THREE from 'three';

interface Drop {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  life: number;
}

const W = 480;
const H = 270;
const MAX = 140;

function dropSprite(): HTMLCanvasElement {
  // normal map of a water bead: rg = surface normal, b = thickness, a = coverage
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = ((x + 0.5) / s) * 2 - 1;
      const v = ((y + 0.5) / s) * 2 - 1;
      const r2 = u * u + v * v;
      const i = (y * s + x) * 4;
      if (r2 >= 1) {
        img.data[i + 3] = 0;
        continue;
      }
      const h = Math.sqrt(1 - r2);
      img.data[i] = (u * 0.5 + 0.5) * 255;
      img.data[i + 1] = (v * 0.5 + 0.5) * 255;
      img.data[i + 2] = h * 255;
      img.data[i + 3] = Math.min(1, (1 - r2) * 6) * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export const DropletShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDrops: { value: null as THREE.Texture | null },
    amount: { value: 0 },
    texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDrops;
    uniform float amount;
    uniform vec2 texel;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D( tDiffuse, vUv );
      vec4 d = texture2D( tDrops, vUv );
      float cov = d.a;
      if ( cov < 0.02 || amount <= 0.0 ) { gl_FragColor = base; return; }
      vec2 n = d.rg * 2.0 - 1.0;
      float h = d.b;
      // a bead is a small lens: it shows a flipped, blurred view from nearby
      vec2 off = -n * ( 0.045 + 0.03 * h );
      vec2 uv = clamp( vUv + off, 0.001, 0.999 );
      vec3 col = texture2D( tDiffuse, uv ).rgb * 0.4;
      col += texture2D( tDiffuse, uv + vec2( texel.x * 3.0, 0.0 ) ).rgb * 0.15;
      col += texture2D( tDiffuse, uv - vec2( texel.x * 3.0, 0.0 ) ).rgb * 0.15;
      col += texture2D( tDiffuse, uv + vec2( 0.0, texel.y * 3.0 ) ).rgb * 0.15;
      col += texture2D( tDiffuse, uv - vec2( 0.0, texel.y * 3.0 ) ).rgb * 0.15;
      // darker rim, bright specular glint up and to the left
      float rim = smoothstep( 0.55, 0.0, h );
      col *= 1.0 - 0.45 * rim;
      float spec = pow( max( dot( normalize( vec3( n, h + 0.2 ) ), normalize( vec3( -0.45, 0.55, 0.7 ) ) ), 0.0 ), 28.0 );
      col += vec3( spec ) * 1.4 * max( dot( base.rgb, vec3( 0.33 ) ), 0.35 );
      gl_FragColor = vec4( mix( base.rgb, col, cov * amount ), base.a );
    }`,
};

export class ScreenDroplets {
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private sprite = dropSprite();
  readonly texture: THREE.CanvasTexture;
  private drops: Drop[] = [];
  private spawn = 0;
  /** 0..1 how visible the drops are (fades them in and out) */
  amount = 0;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  /**
   * rain: 0..1 how hard it is raining on us; speed: airspeed (m/s).
   * Returns true while there is anything to draw.
   */
  update(dt: number, rain: number, speed: number): boolean {
    dt = Math.min(dt, 0.1);
    this.amount += ((rain > 0.01 || this.drops.length ? 1 : 0) - this.amount) * Math.min(1, dt * 2);
    // new drops land (faster when flying into the rain)
    this.spawn += dt * rain * (18 + Math.min(speed, 250) * 0.12);
    while (this.spawn >= 1 && this.drops.length < MAX) {
      this.spawn -= 1;
      this.drops.push({ x: Math.random() * W, y: Math.random() * H, r: 2 + Math.random() * 5.5, vx: 0, vy: 0, life: 4 + Math.random() * 8 });
    }
    if (this.spawn > 1) this.spawn = 1;
    const fast = Math.min(1, speed / 120);
    const cx = W / 2, cy = H * 0.55;
    for (const d of this.drops) {
      d.life -= dt * (rain > 0.01 ? 1 : 2.5);
      // big drops start to run; at speed the airflow blows them off to the edges
      const run = d.r > 5 || fast > 0.3;
      if (run) {
        const ax = (d.x - cx) / W, ay = (d.y - cy) / H;
        // the airflow sweeps them sideways off the left and right edges
        d.vx += (Math.sign(ax || 1) * (160 + Math.abs(ax) * 1400) * fast + Math.sign(ax || 1) * 12 * (1 - fast)) * dt;
        d.vy += (ay * 300 * fast + 26 * (1 - fast)) * dt;
      }
      d.vx *= 1 - Math.min(1, dt * 2);
      d.vy *= 1 - Math.min(1, dt * 2);
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (!run) d.r = Math.min(7, d.r + dt * 0.25 * rain);
    }
    this.drops = this.drops.filter((d) => d.life > 0 && d.x > -10 && d.x < W + 10 && d.y > -10 && d.y < H + 10);
    const g = this.g;
    g.clearRect(0, 0, W, H);
    for (const d of this.drops) {
      const a = Math.min(1, d.life);
      g.globalAlpha = a;
      // running drops stretch along their path
      const sp = Math.hypot(d.vx, d.vy);
      const stretch = Math.min(2.2, 1 + sp / 120);
      g.save();
      g.translate(d.x, d.y);
      if (sp > 1) g.rotate(Math.atan2(d.vy, d.vx) - Math.PI / 2);
      g.drawImage(this.sprite, -d.r, -d.r * stretch, d.r * 2, d.r * 2 * stretch);
      g.restore();
    }
    g.globalAlpha = 1;
    this.texture.needsUpdate = true;
    return this.amount > 0.01;
  }

  clear(): void {
    this.drops = [];
    this.amount = 0;
  }
}
