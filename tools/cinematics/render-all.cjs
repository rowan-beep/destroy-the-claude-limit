// Renders the loading screen's forty cinematic shots (twenty air, twenty space) in the
// game itself at 2560 x 1440 and puts them in place: public/cinematics/<program>/NN.webp
// and the list in src/ui/launcher/shots.ts. Needs a machine with a graphics card:
//
//   npm install
//   npm install --no-save playwright
//   npx playwright install chromium
//   npm run cinematics                (or: npm run cinematics -- space   for one program)
//
// It starts its own copy of the game (the dev server), opens a browser window per
// program and drives the shots in air*.cjs / space.cjs. Leave the window alone while it
// works. CINE_SOFTWARE=1 renders on the CPU instead (no window, very slow).

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const PORT = 5199;
/** the picture shown first (and on the picker) for each program */
const HERO = { air: '01', space: '01' };
const JOBS = {
  air: [
    ['run.cjs', 'air.cjs'],
    ['run.cjs', 'air_frost.cjs'],
    ['run.cjs', 'air_ocean.cjs'],
  ],
  space: [['runspace.cjs', 'space.cjs']],
};

try {
  require.resolve('playwright');
} catch {
  console.error('Playwright is not installed. Run:\n  npm install --no-save playwright\n  npx playwright install chromium');
  process.exit(1);
}

const which = process.argv[2];
const programs = which ? [which] : ['air', 'space'];
if (programs.some((p) => !JOBS[p])) {
  console.error('usage: npm run cinematics [-- air|space]');
  process.exit(1);
}

const up = () =>
  new Promise((res) => {
    const rq = http.get(`http://localhost:${PORT}/`, (r) => {
      r.resume();
      res(r.statusCode === 200);
    });
    rq.on('error', () => res(false));
    rq.setTimeout(3000, () => {
      rq.destroy();
      res(false);
    });
  });

function run(script, args, log) {
  return new Promise((res) => {
    const ch = spawn(process.execPath, [path.join(__dirname, script), ...args], { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = fs.createWriteStream(log, { flags: 'a' });
    const line = (b) => {
      out.write(b);
      process.stdout.write(b);
    };
    ch.stdout.on('data', line);
    ch.stderr.on('data', line);
    ch.on('close', (code) => {
      out.end();
      res(code);
    });
  });
}

/** "NN WxH size time | CAPTION" lines from a log (the last one for each shot wins) */
function shotsIn(log) {
  const caps = {};
  if (!fs.existsSync(log)) return caps;
  for (const l of fs.readFileSync(log, 'utf8').split('\n')) {
    const m = l.match(/^(\d\d) (\d+)x(\d+) .*\| (.+)$/);
    if (m) caps[m[1]] = { w: +m[2], h: +m[3], caption: m[4].trim() };
  }
  return caps;
}

(async () => {
  // the game, served by Vite in development mode (the shots use its debugging hooks)
  let server = null;
  if (!(await up())) {
    const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!fs.existsSync(vite)) throw new Error('Vite is missing: run npm install first');
    server = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 1000));
    if (!(await up())) {
      console.error('The game did not start on port ' + PORT);
      server.kill();
      process.exit(1);
    }
  }
  const missing = [];
  const result = {};
  try {
    for (const p of programs) {
      const dir = path.join(OUT, p);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const log = path.join(dir, 'batch.log');
      for (const [script, shotsFile] of JOBS[p]) {
        console.log(`\n== ${p}: ${shotsFile}`);
        await run(script, [String(PORT), shotsFile, 'all', '1440', dir], log);
      }
      // any that failed get one more go
      const want = JOBS[p].flatMap(([, f]) => Object.keys(require(path.join(__dirname, f)).list).map((id) => [id, f]));
      let caps = shotsIn(log);
      for (const [script, shotsFile] of JOBS[p]) {
        const retry = want.filter(([id, f]) => f === shotsFile && !(caps[id] && fs.existsSync(path.join(dir, `${id}.webp`)))).map(([id]) => id);
        if (retry.length) {
          console.log(`\n== ${p}: again ${retry.join(',')}`);
          await run(script, [String(PORT), shotsFile, retry.join(','), '1440', dir], log);
        }
      }
      caps = shotsIn(log);
      const ids = want.map(([id]) => id).filter((id) => caps[id] && fs.existsSync(path.join(dir, `${id}.webp`)));
      for (const [id] of want) if (!ids.includes(id)) missing.push(`${p} ${id}`);
      ids.sort((a, b) => (a === HERO[p] ? -1 : b === HERO[p] ? 1 : a.localeCompare(b)));
      result[p] = ids.map((id) => ({ id, ...caps[id] }));
    }
  } finally {
    if (server) server.kill();
  }

  // into the game: the pictures beside the page, and the list
  const shotsTs = path.join(ROOT, 'src', 'ui', 'launcher', 'shots.ts');
  let src = fs.readFileSync(shotsTs, 'utf8');
  for (const p of programs) {
    const dest = path.join(ROOT, 'public', 'cinematics', p);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const s of result[p]) fs.copyFileSync(path.join(OUT, p, `${s.id}.webp`), path.join(dest, `${s.id}.webp`));
    const body = result[p].map((s) => `    { file: '${s.id}.webp', caption: ${JSON.stringify(s.caption)} },`).join('\n');
    // (the program's entry: `air: [],` when empty, or `air: [` ... `  ],`)
    const entry = new RegExp(`\\n  ${p}: \\[(?:\\]|[\\s\\S]*?\\n  \\]),`);
    if (!entry.test(src)) throw new Error(`no ${p} list in shots.ts`);
    src = src.replace(entry, () => `\n  ${p}: [\n${body}\n  ],`);
    const small = result[p].filter((s) => s.w !== 2560 || s.h !== 1440);
    console.log(`\n${p}: ${result[p].length} pictures in public/cinematics/${p}` + (small.length ? ` (not 2560x1440: ${small.map((s) => s.id).join(', ')})` : ''));
  }
  fs.writeFileSync(shotsTs, src);
  console.log('src/ui/launcher/shots.ts updated');
  if (missing.length) {
    console.log(`\nThese did not render: ${missing.join(', ')}`);
    process.exit(2);
  }
  console.log('\nDone. Commit public/cinematics and src/ui/launcher/shots.ts.');
})();
