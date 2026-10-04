const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('optimizer', {
  detect: () => ipcRenderer.invoke('detect'),
  applySettings: (gameId, values) => ipcRenderer.invoke('apply', gameId, values),
});
