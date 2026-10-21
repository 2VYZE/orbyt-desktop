// Orbyt Desktop – lädt orbyt.fun in einem eigenen Fenster und ergänzt, was ein Browser nicht kann:
// Tray-Symbol, Autostart, Spiele-Erkennung, globale Tastenkürzel, Bildschirm teilen mit Systemton,
// Zahl auf dem Taskleisten-Symbol und automatische Updates.
const { app, BrowserWindow, Tray, Menu, shell, session, ipcMain, desktopCapturer, globalShortcut, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const GAMES = require('./games');

const ORIGIN = process.env.ORBYT_URL || 'https://orbyt.fun';
const HOST = new URL(ORIGIN).host;
const asset = f => path.join(__dirname, '..', 'assets', f);

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('fun.orbyt.app');
// Stream-Qualität: Hardware-Encoder & hohe Bitraten erlauben
app.commandLine.appendSwitch('enable-features', 'WebRtcAllowInputVolumeAdjustment,PlatformHEVCEncoderSupport');
app.commandLine.appendSwitch('force-fieldtrials', 'WebRTC-Video-Pacing/Disabled/');

// ---------------------------------------------------------------- Einstellungen (klein, als JSON)
const cfgFile = () => path.join(app.getPath('userData'), 'settings.json');
let cfg = { closeToTray: true, autostart: true, startHidden: false, gameDetection: true, bounds: null };
// Leistungsmodus (kommt von der Seite) und ob man gerade im Sprachkanal ist
let perf = { on: false, pref: 'auto' }, inVoice = false, scanTimer = null;
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch {}
const saveCfg = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)); } catch {} };

let win = null, tray = null, quitting = false, unread = 0;

function createWindow() {
  const b = cfg.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1280, height: b.height || 820, x: b.x, y: b.y, minWidth: 940, minHeight: 600,
    show: false, backgroundColor: '#07080f', title: 'Orbyt', icon: asset('icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? false : { color: '#07080f', symbolColor: '#c4b5fd', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      backgroundThrottling: true, // wird im Sprachkanal abgeschaltet (siehe applyPerf)
      spellcheck: true,
    },
  });
  win.loadURL(ORIGIN + '/?app=desktop');
  const hidden = process.argv.includes('--hidden') || cfg.startHidden;
  win.once('ready-to-show', () => { if (!hidden) win.show(); });
  win.webContents.on('did-fail-load', (_e, code) => { if (code !== -3) setTimeout(() => win?.loadURL(ORIGIN + '/?app=desktop'), 4000); });

  // Nur Orbyt im Fenster; alles andere im normalen Browser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).host !== HOST) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });
  win.on('close', e => {
    if (!quitting && cfg.closeToTray) { e.preventDefault(); win.hide(); }
  });
  const remember = () => { if (!win.isMaximized() && !win.isMinimized()) { cfg.bounds = win.getBounds(); saveCfg(); } };
  win.on('resized', remember); win.on('moved', remember);
  win.on('focus', () => win.flashFrame(false));
}

// ---------------------------------------------------------------- Tray
const traySize = process.platform === 'win32' ? 32 : 16;
const trayIcon = n => nativeImage.createFromPath(asset(n ? `tray-${traySize}-${n > 9 ? '9plus' : n}.png` : `tray-${traySize}.png`));
function buildTray() {
  tray = new Tray(trayIcon(0));
  tray.setToolTip('Orbyt');
  tray.on('click', showWin);
  refreshTray();
}
function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Orbyt öffnen', click: showWin },
    { type: 'separator' },
    { label: 'Stumm (Strg+Shift+M)', click: () => send('hotkey', 'mute') },
    { label: 'Taub (Strg+Shift+D)', click: () => send('hotkey', 'deafen') },
    { type: 'separator' },
    { label: 'Mit Windows starten', type: 'checkbox', checked: cfg.autostart, click: m => { cfg.autostart = m.checked; saveCfg(); applyAutostart(); } },
    { label: 'Beim Schließen im Hintergrund bleiben', type: 'checkbox', checked: cfg.closeToTray, click: m => { cfg.closeToTray = m.checked; saveCfg(); } },
    { label: 'Leistungsmodus', type: 'checkbox', checked: perf.on, click: m => send('perf', m.checked) },
    { label: 'Spiele automatisch erkennen', type: 'checkbox', checked: cfg.gameDetection, click: m => { cfg.gameDetection = m.checked; saveCfg(); if (!m.checked) setGame(null); } },
    { type: 'separator' },
    { label: 'Nach Updates suchen', click: () => checkUpdates(true) },
    { label: 'Beenden', click: () => { quitting = true; app.quit(); } },
  ]));
}
function showWin() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
const send = (ch, ...a) => { try { win?.webContents.send(ch, ...a); } catch {} };

function applyAutostart() {
  if (process.platform === 'linux') return;
  app.setLoginItemSettings({ openAtLogin: cfg.autostart, args: ['--hidden'] });
}

// ---------------------------------------------------------------- Bildschirm teilen (eigene Auswahl + Systemton)
function setupCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
      const picked = await pickSource(sources);
      if (!picked) return callback({});
      const src = sources.find(s => s.id === picked.id);
      if (!src) return callback({});
      // Windows: kompletter Systemton (loopback); macOS/Linux: nur Bild
      callback({ video: src, audio: picked.audio && request.audioRequested && process.platform === 'win32' ? 'loopback' : undefined });
    } catch (e) { console.error(e); callback({}); }
  }, { useSystemPicker: false });
}

function pickSource(sources) {
  return new Promise(resolve => {
    const picker = new BrowserWindow({
      parent: win, modal: true, width: 760, height: 560, resizable: false, minimizable: false, maximizable: false,
      backgroundColor: '#0d0f1c', title: 'Bildschirm teilen', autoHideMenuBar: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, sandbox: true },
    });
    const list = sources.map(s => ({ id: s.id, name: s.name, screen: s.id.startsWith('screen:'), thumb: s.thumbnail.toDataURL(), icon: s.appIcon?.toDataURL() || null }));
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); if (!picker.isDestroyed()) picker.close(); };
    ipcMain.handleOnce('picker:list', () => ({ sources: list, canAudio: process.platform === 'win32' }));
    ipcMain.once('picker:choose', (_e, v) => finish(v));
    picker.on('closed', () => { ipcMain.removeHandler('picker:list'); ipcMain.removeAllListeners('picker:choose'); finish(null); });
    picker.loadFile(path.join(__dirname, 'picker.html'));
    picker.once('ready-to-show', () => picker.show());
  });
}

// ---------------------------------------------------------------- Spiele-Erkennung
let currentGame = null;
function listProcesses() {
  return new Promise(resolve => {
    if (process.platform === 'win32') {
      execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
        if (err) return resolve([]);
        resolve(out.split(/\r?\n/).map(l => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean).map(s => s.toLowerCase()));
      });
    } else {
      execFile('ps', ['-axco', 'comm'], { maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
        if (err) return resolve([]);
        resolve(out.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean));
      });
    }
  });
}
async function scanGames() {
  if (!cfg.gameDetection) return;
  const procs = new Set(await listProcesses());
  let found = null;
  for (const p of procs) if (GAMES[p]) { found = GAMES[p]; break; }
  if (found !== currentGame) setGame(found);
}
function setGame(name) {
  currentGame = name;
  send('game', name);
}

// ---------------------------------------------------------------- Updates
let updater = null;
function checkUpdates(manual = false) {
  try {
    if (!updater) {
      updater = require('electron-updater').autoUpdater;
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = true;
      updater.on('update-downloaded', () => {
        new Notification({ title: 'Orbyt-Update bereit', body: 'Wird beim nächsten Start installiert.' }).show();
      });
    }
    updater.checkForUpdates().catch(() => {});
    if (manual) new Notification({ title: 'Orbyt', body: 'Suche nach Updates …' }).show();
  } catch {}
}

// ---------------------------------------------------------------- IPC von der Seite
ipcMain.on('badge', (_e, n) => {
  unread = Math.max(0, n | 0);
  if (process.platform === 'win32') {
    win?.setOverlayIcon(unread ? badgeIcon(unread) : null, unread ? `${unread} ungelesen` : '');
    if (unread && win && !win.isFocused()) win.flashFrame(true);
  } else {
    app.setBadgeCount(unread); // macOS-Dock / Linux-Launcher
    if (process.platform === 'darwin' && unread && win && !win.isFocused()) app.dock?.bounce('informational');
  }
  // Roter Zähler auch am Tray-Symbol (wichtig, wenn das Fenster im Hintergrund/Tray ist)
  try { tray?.setImage(trayIcon(unread)); } catch {}
  tray?.setToolTip(unread ? `Orbyt (${unread} ungelesen)` : 'Orbyt');
});
ipcMain.on('focus', showWin);
ipcMain.on('perf', (_e, v) => {
  perf = { on: !!v?.on, pref: v?.pref === true || v?.pref === false ? v.pref : 'auto' };
  applyPerf();
  refreshTray();
});
ipcMain.on('voice', (_e, on) => { inVoice = !!on; applyPerf(); });

// Fenster im Hintergrund (minimiert/im Tray) drosseln, solange man nicht im Sprachkanal ist – spart CPU und Akku.
// Nachrichten und Benachrichtigungen kommen trotzdem sofort an. Im Sprachkanal läuft immer alles voll.
// Leistungsmodus: zusätzlich seltener nach Spielen suchen.
function applyPerf() {
  try { win?.webContents.setBackgroundThrottling(!inVoice); } catch {}
  scheduleScan();
}
function scheduleScan() {
  clearInterval(scanTimer);
  scanTimer = setInterval(scanGames, perf.on ? 45000 : 15000);
}
ipcMain.handle('info', () => ({ version: app.getVersion(), platform: process.platform, game: currentGame, gameDetection: cfg.gameDetection }));

// kleines rotes Kreis-Symbol mit Zahl (vorgefertigte PNGs)
const badgeIcon = n => nativeImage.createFromPath(asset(`badge-${n > 9 ? '9plus' : n}.png`));

// ---------------------------------------------------------------- Start
app.on('second-instance', showWin);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', showWin);
app.on('will-quit', () => globalShortcut.unregisterAll());

app.whenReady().then(() => {
  // Rechte nur für Orbyt selbst
  const ok = new Set(['media', 'notifications', 'display-capture', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    try { cb(ok.has(perm) && new URL(details.requestingUrl || wc.getURL()).host === HOST); } catch { cb(false); }
  });
  session.defaultSession.setPermissionCheckHandler((_wc, perm, origin) => {
    try { return ok.has(perm) && new URL(origin).host === HOST; } catch { return false; }
  });
  setupCapture();
  createWindow();
  buildTray();
  applyAutostart();
  // Stumm/Taub funktioniert auch im Spiel (globale Tastenkürzel)
  globalShortcut.register('CommandOrControl+Shift+M', () => send('hotkey', 'mute'));
  globalShortcut.register('CommandOrControl+Shift+D', () => send('hotkey', 'deafen'));
  scheduleScan();
  win.webContents.on('did-finish-load', () => { setTimeout(scanGames, 3000); });
  setTimeout(() => checkUpdates(false), 8000);
  setInterval(() => checkUpdates(false), 6 * 60 * 60 * 1000);
});
