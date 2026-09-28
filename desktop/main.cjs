// TRIAD desktop app. It plays the live game from the website, so every update
// arrives by itself (the game checks every minute and reloads at the main menu),
// and falls back to the copy built into the app when there is no internet.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const LIVE = 'https://rowan-beep.github.io/destroy-the-claude-limit/';

// smooth frame pacing and the discrete GPU on laptops with two
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'TRIAD Air Combat',
    backgroundColor: '#05080d',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  // links (release notes, GitHub) open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // F11: full screen; Ctrl+R / F5 reload (the in-game map switch reloads too)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      win.reload();
      e.preventDefault();
    }
  });
  win.webContents.setUserAgent(win.webContents.getUserAgent() + ' TRIADDesktop');
  // offline (or the site unreachable): play the copy that shipped with the app
  let fellBack = false;
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || fellBack || code === -3) return;
    if (!url.startsWith(LIVE)) return;
    fellBack = true;
    win.loadFile(path.join(__dirname, 'app', 'index.html'));
  });
  win.loadURL(LIVE);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
