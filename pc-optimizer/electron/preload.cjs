const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('optimizer', {
  platform: process.platform,
  detect: () => ipcRenderer.invoke('detect'),
  applySettings: (gameId, values) => ipcRenderer.invoke('apply', gameId, values),
  open: (target, arg) => ipcRenderer.invoke('open', target, arg),
  speedTest: (onProgress) => { const h = (e, p) => onProgress && onProgress(p); ipcRenderer.on('speedtest-progress', h); return ipcRenderer.invoke('speedtest').finally(() => ipcRenderer.removeListener('speedtest-progress', h)); },
});
