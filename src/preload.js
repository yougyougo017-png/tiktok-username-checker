const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  check: (n) => ipcRenderer.invoke('check', n),
  open: (n) => ipcRenderer.invoke('open', n),
  exportList: (t) => ipcRenderer.invoke('export', t),
  platform: process.platform
});
