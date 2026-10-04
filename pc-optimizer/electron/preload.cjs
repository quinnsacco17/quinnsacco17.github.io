const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('optimizer', {
  platform: process.platform,
  detect: () => ipcRenderer.invoke('detect'),
  applySettings: (gameId, values) => ipcRenderer.invoke('apply', gameId, values),
  open: (target, arg) => ipcRenderer.invoke('open', target, arg),
});
