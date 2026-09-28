// Copy the single-file game build into the desktop app and stamp its version.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = path.join(root, 'dist-single', 'index.html');
if (!fs.existsSync(src)) throw new Error('run "npm run build:single" first');
fs.mkdirSync(path.join(__dirname, 'app'), { recursive: true });
fs.copyFileSync(src, path.join(__dirname, 'app', 'index.html'));
const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = ver;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('desktop app prepared: TRIAD', ver);
