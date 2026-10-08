// Tells the player when the game is not getting their graphics card: the
// browser drawing in software (hardware acceleration off, or the GPU driver
// blocked) runs at a few frames per second however fast the PC is. Also, once
// per session, a hint naming the renderer in use when flight stays very slow.

import * as THREE from 'three';
import { el, button } from './dom';

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i;

/** The GPU the page's WebGL context actually runs on ('' if hidden). */
export function rendererName(r: THREE.WebGLRenderer): string {
  try {
    const gl = r.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
  } catch {
    return '';
  }
}

/** Short readable form of an ANGLE renderer string. */
function shortName(n: string): string {
  if (/swiftshader/i.test(n)) return 'SwiftShader, a software renderer';
  if (/llvmpipe/i.test(n)) return 'llvmpipe, a software renderer';
  // "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)"
  const m = /^ANGLE \(([^,]*),\s*(.*?)(?:\s*\(0x[0-9a-f]+\))?(?:\s+Direct3D.*?|\s+OpenGL.*?|\s+Vulkan.*?)?(?:,[^,]*)?\)$/i.exec(n.trim());
  return (m ? m[2] : n).trim() || 'unknown';
}

const FIX =
  'Turn on hardware acceleration in your browser (Chrome / Edge: Settings → System → "Use graphics acceleration when available", then relaunch), ' +
  'and make sure your graphics driver is up to date. On a laptop, set the browser to "High performance" in Windows Settings → Display → Graphics.';

export class PerfWatch {
  private banner: HTMLDivElement | null = null;
  private slowT = 0;
  private hinted = false;
  readonly name: string;
  readonly software: boolean;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.name = rendererName(renderer);
    this.software = SOFTWARE.test(this.name);
    console.info(`graphics: ${this.name || 'unknown'}`);
    if (this.software)
      this.show(
        'THE GAME IS NOT USING YOUR GRAPHICS CARD',
        `Your browser is drawing the game on the processor (${shortName(this.name)}), so it will only run at a few frames per second, however fast your PC is. ${FIX}`,
      );
  }

  /** Call every frame; `flying` = in a mission, not paused. */
  update(dt: number, flying: boolean, fps: number): void {
    if (this.hinted || !flying) {
      this.slowT = 0;
      return;
    }
    this.slowT = fps < 20 ? this.slowT + dt : 0;
    if (this.slowT < 8) return;
    this.hinted = true;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.show(
      `RUNNING AT ${Math.round(fps)} FPS`,
      this.software
        ? `The game is being drawn without your graphics card (${shortName(this.name)}). ${FIX}`
        : `Graphics: ${shortName(this.name)}, drawing ${size.x} × ${size.y} pixels. If this is not your main graphics card, set the browser to "High performance" in Windows Settings → Display → Graphics. ` +
            'Otherwise lower Settings → Graphics → Quality or Resolution.',
    );
  }

  private show(title: string, text: string): void {
    this.banner?.remove();
    const b = el('div', 'perf-warn', document.body);
    el('b', '', b, title);
    el('div', '', b, text);
    button('OK', 'perf-warn-x', b, () => {
      b.remove();
      if (this.banner === b) this.banner = null;
    });
    this.banner = b;
  }
}
