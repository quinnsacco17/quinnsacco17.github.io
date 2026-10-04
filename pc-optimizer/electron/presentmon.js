// Runs PresentMon (Intel, MIT) to capture real frame times of whatever game is running, and parses the CSV.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const IGNORE = /^(dwm|explorer|setup optimizer|electron|steamwebhelper|chrome|msedge|firefox|opera|brave|discord|shellexperiencehost|searchhost|startmenuexperiencehost|textinputhost|applicationframehost|nvcontainer|nvidia overlay|amdrsserv|radeonsoftware|armourycrate.*|gamebar.*|xboxpcappft|obs64|lockapp|systemsettings|widgets)(\.exe)?$/i;

export function parsePresentMonCsv(text, skipSeconds = 0) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const head = lines[0].split(',').map((h) => h.trim());
  const col = (names) => head.findIndex((h) => names.includes(h));
  const iApp = col(['Application', 'ProcessName']);
  const iFt = col(['MsBetweenPresents', 'FrameTime', 'msBetweenPresents', 'MsBetweenAppStart']);
  if (iApp < 0 || iFt < 0) throw new Error(`Unrecognized PresentMon output (columns: ${head.slice(0, 8).join(', ')}…)`);
  const apps = new Map();
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(','); const app = c[iApp]; const ft = parseFloat(c[iFt]);
    if (!app || !(ft > 0 && ft < 1000)) continue;
    if (!apps.has(app)) apps.set(app, []);
    apps.get(app).push(ft);
  }
  const results = [];
  for (const [app, fts] of apps) {
    if (IGNORE.test(app)) continue;
    let skip = 0, acc = 0; while (skip < fts.length && acc < skipSeconds * 1000) acc += fts[skip++];
    const kept = fts.slice(skip); if (kept.length < 30) continue;
    const total = kept.reduce((a, b) => a + b, 0);
    const sorted = [...kept].sort((a, b) => a - b);
    const worst = sorted.slice(-Math.max(1, Math.ceil(sorted.length * 0.01)));
    const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
    results.push({ app, frames: kept.length, seconds: total / 1000, avgFps: (kept.length * 1000) / total, low1Fps: 1000 / worstAvg });
  }
  results.sort((a, b) => b.seconds - a.seconds || b.frames - a.frames);
  return results[0] || null;
}

export function presentMonPath(appRoot) {
  const cands = [process.resourcesPath && path.join(process.resourcesPath, 'vendor', 'PresentMon.exe'), path.join(appRoot, 'vendor', 'PresentMon.exe')].filter(Boolean);
  return cands.find((p) => fs.existsSync(p)) || null;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
export function measure(exe, { seconds = 60, lead = 10 } = {}) {
  return new Promise((resolve) => {
    const out = path.join(os.tmpdir(), `setup-optimizer-${Date.now()}.csv`);
    const args = ['--output_file', out, '--timed', String(seconds + lead), '--terminate_after_timed', '--stop_existing_session', '--session_name', 'SetupOptimizer', '--v1_metrics', '--no_console_stats'];
    const ps = `$p = Start-Process -FilePath ${q(exe)} -ArgumentList ${args.map(q).join(',')} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`;
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    const kill = setTimeout(() => child.kill(), (seconds + lead + 90) * 1000);
    child.on('close', (code) => {
      clearTimeout(kill);
      if (/canceled by the user|operation was canceled/i.test(err)) return resolve({ ok: false, error: 'Windows permission was declined. PresentMon needs it to read frame times.' });
      if (!fs.existsSync(out)) return resolve({ ok: false, error: `PresentMon did not produce data (exit ${code}). ${err.trim().slice(0, 200)}` });
      try {
        const r = parsePresentMonCsv(fs.readFileSync(out, 'utf8'), lead);
        fs.rmSync(out, { force: true });
        if (!r) return resolve({ ok: false, error: 'No game was detected drawing frames. Make sure the game is running and in focus during the measurement.' });
        resolve({ ok: true, ...r });
      } catch (e) { resolve({ ok: false, error: e.message }); }
    });
  });
}
