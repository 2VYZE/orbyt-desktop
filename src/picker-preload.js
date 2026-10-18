const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('picker', {
  list: () => ipcRenderer.invoke('picker:list'),
  choose: v => ipcRenderer.send('picker:choose', v),
});
