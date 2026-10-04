import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectHardware } from './detect.js';
import { applySettings, describeTarget } from './apply.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({ width: 1380, height: 920, minWidth: 900, backgroundColor: '#0f1115', title: 'Setup Optimizer', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
}
app.whenReady().then(() => {
  ipcMain.handle('detect', () => detectHardware());
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
