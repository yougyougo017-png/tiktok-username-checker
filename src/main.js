const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function createWindow() {
  const win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 980, minHeight: 680,
    backgroundColor: '#030a1c',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

// Heuristic check: TikTok returns a profile page for taken handles and a
// "couldn't find this account" page (or 404) for free ones. Banned/reserved
// handles can also look "free", so results are labeled as likely.
async function checkUsername(name) {
  if (!/^[a-zA-Z0-9_.]{2,24}$/.test(name) || name.endsWith('.')) return { name, status: 'invalid' };
  try {
    const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(name)}?lang=en`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow'
    });
    if (res.status === 404) return { name, status: 'available' };
    if (res.status === 429) return { name, status: 'ratelimited' };
    const html = await res.text();
    const lower = html.toLowerCase();
    if (lower.includes(`"uniqueid":"${name.toLowerCase()}"`)) return { name, status: 'taken' };
    if (lower.includes("couldn't find this account") || lower.includes('"statuscode":10221') || lower.includes('"statuscode":10202')) return { name, status: 'available' };
    if (lower.includes('"statuscode":10222')) return { name, status: 'taken' }; // private / exists
    return { name, status: 'unknown' };
  } catch (e) {
    return { name, status: 'error', message: e.message };
  }
}

// Discord: the same endpoint the sign-up page uses to say "username taken".
async function checkDiscord(name) {
  if (!/^[a-z0-9_.]{2,32}$/.test(name) || name.includes('..')) return { name, status: 'invalid' };
  try {
    const res = await fetch('https://discord.com/api/v9/unique-username/username-attempt-unauthed', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify({ username: name })
    });
    if (res.status === 429) return { name, status: 'ratelimited' };
    const data = await res.json();
    if (typeof data.taken === 'boolean') return { name, status: data.taken ? 'taken' : 'available' };
    return { name, status: 'unknown' };
  } catch (e) { return { name, status: 'error', message: e.message }; }
}

ipcMain.handle('check', (_e, name, platform) => platform === 'discord' ? checkDiscord(name) : checkUsername(name));
ipcMain.handle('open', (_e, name) => shell.openExternal(`https://www.tiktok.com/@${encodeURIComponent(name)}`));
ipcMain.handle('export', async (_e, text) => {
  const { filePath } = await dialog.showSaveDialog({ defaultPath: 'available-usernames.txt' });
  if (filePath) fs.writeFileSync(filePath, text);
  return !!filePath;
});

// ---------- Proxy scraper ----------
const PROXY_SOURCES = [
  ['ProxyScrape HTTP', 'http', 'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all'],
  ['ProxyScrape SOCKS5', 'socks5', 'https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks5&timeout=10000&country=all'],
  ['TheSpeedX HTTP', 'http', 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt'],
  ['TheSpeedX SOCKS5', 'socks5', 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt'],
  ['monosans HTTP', 'http', 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt'],
  ['monosans SOCKS5', 'socks5', 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt'],
  ['clarketm', 'http', 'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt'],
  ['ShiftyTR HTTP', 'http', 'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt'],
  ['jetkai HTTP', 'http', 'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt'],
  ['roosterkid HTTPS', 'https', 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt'],
  ['mmpx12 HTTP', 'http', 'https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt'],
  ['hookzof SOCKS5', 'socks5', 'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt'],
  ['sunny9577', 'http', 'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt'],
  ['proxifly HTTP', 'http', 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt'],
  ['proxy-list.download', 'http', 'https://www.proxy-list.download/api/v1/get?type=http']
];
ipcMain.handle('proxy-sources', () => PROXY_SOURCES.map(([name, type]) => ({ name, type })));
ipcMain.handle('proxy-scrape', async (e, indexes) => {
  const all = new Map();
  await Promise.all(indexes.map(async (i) => {
    const [name, type, url] = PROXY_SOURCES[i];
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
      clearTimeout(t);
      const found = (await res.text()).match(/\b\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}\b/g) || [];
      found.forEach(p => { if (!all.has(p)) all.set(p, type); });
      e.sender.send('proxy-progress', { i, ok: true, count: found.length });
    } catch (err) { e.sender.send('proxy-progress', { i, ok: false, count: 0 }); }
  }));
  return [...all].map(([addr, type]) => ({ addr, type }));
});
// Quick check: can we open a connection to the proxy's port in time?
ipcMain.handle('proxy-test', (_e, addr, timeout) => new Promise((resolve) => {
  const [host, port] = addr.split(':'); const start = Date.now();
  const s = net.connect({ host, port: +port });
  const done = (ok) => { s.destroy(); resolve({ addr, ok, ms: Date.now() - start }); };
  s.setTimeout(timeout || 4000, () => done(false));
  s.on('connect', () => done(true)); s.on('error', () => done(false));
}));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
