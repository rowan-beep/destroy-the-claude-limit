// Unit tests: every tests/**/*.test.ts is bundled with esbuild (shipped with
// Vite) and run with Node's built-in test runner. No browser, no extra packages.
import { build } from 'esbuild';
import { readdirSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const testsDir = join(root, 'tests');
const out = join(root, 'node_modules', '.tests');

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.test.ts')) files.push(p);
  }
};
walk(testsDir);
if (!files.length) {
  console.log('no tests found');
  process.exit(0);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// (Vite's `?worker` imports have no meaning outside the browser: a stub that cannot start, so code falls back to the main thread)
const workerStub = {
  name: 'worker-stub',
  setup(b) {
    b.onResolve({ filter: /\?worker/ }, (args) => ({ path: args.path, namespace: 'worker-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'worker-stub' }, () => ({ contents: 'export default class { constructor() { throw new Error("no workers in unit tests"); } }', loader: 'js' }));
  },
};
const outs = [];
for (const f of files) {
  const o = join(out, relative(testsDir, f).replace(/[\\/]/g, '__').replace(/\.ts$/, '.mjs'));
  await build({ entryPoints: [f], outfile: o, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning', plugins: [workerStub] });
  outs.push(o);
}
const r = spawnSync(process.execPath, ['--test', ...outs], { stdio: 'inherit' });
process.exit(r.status ?? 1);
