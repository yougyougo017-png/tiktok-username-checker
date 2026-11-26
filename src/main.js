const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
