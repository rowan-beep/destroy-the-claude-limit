// Copy the single-file game build (and the pictures beside it) into the desktop app and stamp its version.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = path.join(root, 'dist-single', 'index.html');
if (!fs.existsSync(src)) throw new Error('run "npm run build:single" first');
fs.mkdirSync(path.join(__dirname, 'app'), { recursive: true });
fs.copyFileSync(src, path.join(__dirname, 'app', 'index.html'));
// the pictures the page loads beside itself (loading-screen shots, high-resolution maps)
for (const dir of ['cinematics', 'hires']) {
  const from = path.join(root, 'public', dir);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(__dirname, 'app', dir), { recursive: true });
}
const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = ver;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('desktop app prepared: TRIAD', ver);
