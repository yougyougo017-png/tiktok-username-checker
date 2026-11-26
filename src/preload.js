const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  check: (n, p) => ipcRenderer.invoke('check', n, p),
  open: (n) => ipcRenderer.invoke('open', n),
  exportList: (t) => ipcRenderer.invoke('export', t),
  proxySources: () => ipcRenderer.invoke('proxy-sources'),
  proxyScrape: (idx) => ipcRenderer.invoke('proxy-scrape', idx),
  proxyTest: (a, t) => ipcRenderer.invoke('proxy-test', a, t),
  onProxyProgress: (cb) => ipcRenderer.on('proxy-progress', (_e, d) => cb(d)),
  platform: process.platform
});
