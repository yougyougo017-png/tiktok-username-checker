const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  check: (n, p) => ipcRenderer.invoke('check', n, p),
  open: (n) => ipcRenderer.invoke('open', n),
  exportList: (t) => ipcRenderer.invoke('export', t),
  platform: process.platform
});
