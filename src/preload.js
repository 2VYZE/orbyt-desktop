// Sichere Brücke zwischen orbyt.fun und der Desktop-App (nur diese Funktionen, kein Node-Zugriff)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('orbytDesktop', {
  isDesktop: true,
  info: () => ipcRenderer.invoke('info'),
  setBadge: n => ipcRenderer.send('badge', Number(n) || 0),
  focus: () => ipcRenderer.send('focus'),
  onGame: cb => ipcRenderer.on('game', (_e, name) => cb(name || null)),
  onHotkey: cb => ipcRenderer.on('hotkey', (_e, k) => cb(String(k))),
});
