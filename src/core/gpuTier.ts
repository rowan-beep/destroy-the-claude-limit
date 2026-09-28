// A first guess at how much graphics the device can handle, from the GPU the
// browser reports (and the CPU / memory as a tie-breaker). Used to pick the
// starting graphics preset so a laptop on integrated graphics doesn't start
// on settings meant for a gaming PC.

import type { Tier } from './settings';

let cached: Tier | null = null;

export function gpuName(): string {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name || '');
  } catch {
    return '';
  }
}

export function detectTier(): Tier {
  if (cached) return cached;
  const n = gpuName().toLowerCase();
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  let t: Tier;
  if (!n || /swiftshader|llvmpipe|software|basic render/.test(n)) t = 'low';
  else if (/mali|adreno|powervr|videocore|apple gpu/.test(n)) t = 'low';
  else if (/rtx|gtx 1[06-9]|gtx 20|radeon rx|rx [5-9]\d{3}|radeon pro|arc a\d/.test(n)) t = 'high';
  else if (/geforce|nvidia|quadro/.test(n)) t = 'medium';
  else if (/apple m\d (max|pro|ultra)/.test(n)) t = 'high';
  else if (/apple m\d/.test(n)) t = 'medium';
  // integrated: Iris Xe and the newer Radeon APUs manage MEDIUM, older Intel HD / UHD are LOW
  else if (/iris|arc/.test(n) && !/iris\(tm\) (plus|pro) graphics 6/.test(n)) t = 'medium';
  else if (/intel|uhd|hd graphics/.test(n)) t = 'low';
  else if (/radeon\(tm\) (7|6)\d0m|radeon 7\d0m|radeon 6\d0m|780m|760m|680m/.test(n)) t = 'medium';
  else if (/radeon|vega|amd/.test(n)) t = 'low';
  else t = 'medium';
  // a weak CPU or little memory holds everything back
  if ((cores <= 4 || mem <= 4) && t === 'high') t = 'medium';
  if (cores <= 2 || mem <= 2) t = 'low';
  cached = t;
  return t;
}
