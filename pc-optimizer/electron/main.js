import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectHardware } from './detect.js';
import { applySettings, describeTarget } from './apply.js';
import { speedTest } from './speedtest.js';
import { measure, presentMonPath } from './presentmon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({ width: 1380, height: 920, minWidth: 900, backgroundColor: '#0f1115', title: 'Setup Optimizer', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  if (process.env.OPTIMIZER_SMOKE) {
    win.webContents.on('console-message', (e, level, msg) => console.log('[renderer]', msg));
    win.webContents.once('did-finish-load', async () => {
      try {
        const r = await win.webContents.executeJavaScript(`(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const click = (sel, text) => { const el = [...document.querySelectorAll(sel)].find((e) => !text || e.textContent.includes(text)); if (!el) throw new Error('missing ' + sel + ' ' + (text || '')); el.click(); };
          const out = { bridge: typeof window.optimizer };
          localStorage.clear(); location.reload(); return 'reloaded'; })()`);
        if (r === 'reloaded') { await new Promise((res) => win.webContents.once('did-finish-load', res)); }
        const r2 = await win.webContents.executeJavaScript(`(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const click = (sel, text) => { const el = [...document.querySelectorAll(sel)].find((e) => !text || e.textContent.includes(text)); if (!el) throw new Error('missing ' + sel + ' ' + (text || '')); el.click(); };
          const out = { wizardOpen: !document.getElementById('wizard').hidden };
          await sleep(6000); out.afterScan = document.querySelector('.wiz-card h1')?.textContent; out.found = document.querySelector('.wiz-found')?.textContent;
          click('.wiz-buttons button', 'pick'); await sleep(100); click('.wiz-tile', 'Handheld'); await sleep(100); click('.wiz-tile', 'Z1 Extreme'); await sleep(100);
          click('.wiz-tile', 'Turbo (25W'); await sleep(100); click('.wiz-tile', 'Smoothest'); await sleep(100); click('button', 'Show me my games'); await sleep(200);
          out.wizardClosed = document.getElementById('wizard').hidden; out.tiles = document.querySelectorAll('.game-tile').length;
          click('.game-tile', 'Cyberpunk'); await sleep(300);
          out.hero = document.querySelector('.hero-fps')?.textContent; out.status = document.querySelector('.status')?.textContent; out.applyBtn = !![...document.querySelectorAll('button')].find((b) => b.textContent === 'Apply to game');
          click('.mainnav button', 'My setup'); await sleep(200); out.summaryDevice = document.querySelector('.summary-card .set-row strong')?.textContent;
          out.openBogus = (await window.optimizer.open('rm -rf')).ok; out.searchUnknown = (await window.optimizer.open('monitor-specs', 'evil')).ok;
          return out; })()`);
        console.log('SMOKE', JSON.stringify(r2));
      } catch (e) { console.log('SMOKE_ERROR', e.message); }
      app.exit(0);
    });
  }
}
const WIN_TARGETS = {
  display: { url: 'ms-settings:display' },
  graphics: { url: 'ms-settings:display-advancedgraphics' },
  gamemode: { url: 'ms-settings:gaming-gamemode' },
  power: { url: 'ms-settings:powersleep' },
  bluetooth: { url: 'ms-settings:bluetooth' },
  network: { url: 'ms-settings:network-status' },
  steam: { url: 'steam://open/settings' },
  devmgr: { cmd: ['mmc.exe', ['devmgmt.msc']] },
  msinfo: { cmd: ['msinfo32.exe', []] },
  dxdiag: { cmd: ['dxdiag.exe', []] },
  nvcp: { cmd: ['explorer.exe', ['shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jhes6jfw8m2!NVIDIACorp.NVIDIAControlPanel']] },
  nvapp: { file: 'C:\\Program Files\\NVIDIA Corporation\\NVIDIA App\\CEF\\NVIDIA App.exe' },
  amd: { file: 'C:\\Program Files\\AMD\\CNext\\CNext\\RadeonSoftware.exe' },
  armoury: { cmd: ['explorer.exe', ['shell:AppsFolder\\B9ECED6F.ArmouryCrateSE_qmba6cd70vzyy!App']] },
};
const MAC_TARGETS = { display: { url: 'x-apple.systempreferences:com.apple.Displays-Settings.extension' }, steam: { url: 'steam://open/settings' }, power: { url: 'x-apple.systempreferences:com.apple.Battery-Settings.extension' } };
const SEARCH_TARGETS = { 'monitor-specs': (q) => `${q} monitor specs refresh rate VRR HDR`, 'psu-specs': (q) => `${q} power supply wattage`, 'device-specs': (q) => `${q} specifications` };

app.whenReady().then(() => {
  let lastDetected = new Set();
  ipcMain.handle('detect', async () => {
    const hw = await detectHardware();
    lastDetected = new Set([...(hw.graphics?.displays || []).map((d) => d.model), `${hw.system?.manufacturer || ''} ${hw.system?.model || ''}`.trim()].filter(Boolean));
    return hw;
  });
  ipcMain.handle('measure-available', () => process.platform === 'win32' && !!presentMonPath(path.join(__dirname, '..')));
  ipcMain.handle('measure', async (ev, opts) => {
    if (process.platform !== 'win32') return { ok: false, error: 'Measuring needs Windows.' };
    const exe = presentMonPath(path.join(__dirname, '..'));
    if (!exe) return { ok: false, error: 'PresentMon is missing from this build. Type the fps you saw instead.' };
    const seconds = Math.min(180, Math.max(20, +opts?.seconds || 60)), lead = Math.min(30, Math.max(5, +opts?.lead || 10));
    const r = await measure(exe, { seconds, lead });
    const w = BrowserWindow.fromWebContents(ev.sender); if (w) { w.show(); w.focus(); w.flashFrame(true); }
    return r;
  });
  ipcMain.handle('speedtest', async (ev) => { try { return { ok: true, ...(await speedTest((p) => ev.sender.send('speedtest-progress', p))) }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('open', async (ev, target, arg) => {
    if (SEARCH_TARGETS[target]) {
      if (typeof arg !== 'string' || arg.length > 120 || !lastDetected.has(arg)) return { ok: false, error: 'Run hardware detection first.' };
      await shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(SEARCH_TARGETS[target](arg))}`); return { ok: true };
    }
    const t = (process.platform === 'win32' ? WIN_TARGETS : process.platform === 'darwin' ? MAC_TARGETS : {})[target];
    if (!t) return { ok: false, error: 'Not available on this system.' };
    try {
      if (t.url) await shell.openExternal(t.url);
      else if (t.file) { if (!fs.existsSync(t.file)) return { ok: false, error: 'Not installed.' }; const r = await shell.openPath(t.file); if (r) return { ok: false, error: r }; }
      else if (t.cmd) { const c = spawn(t.cmd[0], t.cmd[1], { detached: true, stdio: 'ignore' }); c.on('error', () => {}); c.unref(); }
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('apply', async (ev, gameId, values) => {
    const target = describeTarget(gameId);
    if (!target) return { ok: false, error: 'This game has no config writer yet (encrypted or cloud-synced settings). Use "Copy settings list".' };
    const win = BrowserWindow.fromWebContents(ev.sender);
    const { response } = await dialog.showMessageBox(win, { type: 'question', buttons: ['Write settings', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Apply to game', message: `Write settings to ${target.label}?`, detail: `File: ${target.path}\n\nClose the game first or it will overwrite this on exit. A timestamped backup is created next to the file.` });
    if (response !== 0) return { ok: false, error: 'Cancelled.' };
    try { return await applySettings(gameId, values); } catch (e) { return { ok: false, error: e.message }; }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
