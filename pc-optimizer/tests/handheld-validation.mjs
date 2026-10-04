// Published ROG Ally / Ally X results vs model. preset: 0=low 1=med 2=high 3=ultra.
import { estimate } from '../src/engine/estimator.js';
import { GAME_BY_ID } from '../src/engine/data/games.js';
import { DEVICE_BY_ID } from '../src/engine/data/devices.js';
const P = (id, idx) => ({ ...DEVICE_BY_ID[id].powerModes[idx] });
const dev = (id, pm) => { const d = DEVICE_BY_ID[id]; return { gpu: d.gpu, cpu: d.cpu, ramGB: d.ramGB, ramChannels: 2, igpuVramGB: d.ramGB >= 24 ? 8 : 6, gpuBonus: d.gpuBonus, powerMode: pm, monitors: [{ ...d.display, link: 'internal' }] }; };
export const CASES = [
  // [label, device, powerIdx, game, w, h, preset, upscaler tech|null, mode, measured fps]
  ['CP77 Ally 25W 800p low native (Deck preset)', 'rog-ally-z1e', 2, 'cyberpunk', 1280, 800, 0, null, 'native', 42.7],
  ['CP77 Ally 15W 800p low native (Deck preset)', 'rog-ally-z1e', 1, 'cyberpunk', 1280, 800, 0, null, 'native', 32],
  ['CP77 AllyX 25W 720p low native', 'rog-ally-x', 2, 'cyberpunk', 1280, 720, 0, null, 'native', 41],
  ['CP77 AllyX 25W 720p low FSR perf', 'rog-ally-x', 2, 'cyberpunk', 1280, 720, 0, 'fsr3', 'performance', 57],
  ['CP77 AllyX 30W 1080p med FSR bal', 'rog-ally-x', 3, 'cyberpunk', 1920, 1080, 1, 'fsr3', 'balanced', 45],
  ['CP77 AllyX 17W 1080p med FSR bal', 'rog-ally-x', 1, 'cyberpunk', 1920, 1080, 1, 'fsr3', 'balanced', 30],
  ['FH5 AllyX 30W 1080p low native', 'rog-ally-x', 3, 'fh5', 1920, 1080, 0, null, 'native', 71],
  ['FH5 AllyX 17W 1080p low native', 'rog-ally-x', 1, 'fh5', 1920, 1080, 0, null, 'native', 55],
  ['FH5 Ally 25W 720p low native', 'rog-ally-z1e', 2, 'fh5', 1280, 720, 0, null, 'native', 59],
  ['RDR2 Ally 25W 720p low native', 'rog-ally-z1e', 2, 'rdr2', 1280, 720, 0, null, 'native', 60],
  ['RDR2 AllyX 25W 900p low native', 'rog-ally-x', 2, 'rdr2', 1600, 900, 0, null, 'native', 54],
  ['Elden Ring AllyX 25W 1080p med', 'rog-ally-x', 2, 'eldenring', 1920, 1080, 1, null, 'native', 50],
  ['Starfield AllyX 30W 1080p low FSR', 'rog-ally-x', 3, 'starfield', 1920, 1080, 0, 'fsr3', 'quality', 40],
  ['BG3 AllyX 30W 1080p low', 'rog-ally-x', 3, 'bg3', 1920, 1080, 0, 'fsr3', 'quality', 60],
  ['Hogwarts AllyX 30W 1080p med FSR', 'rog-ally-x', 3, 'hogwarts', 1920, 1080, 1, 'fsr3', 'balanced', 55],
  ['GoW AllyX 30W 1080p low FSR', 'rog-ally-x', 3, 'gowr', 1920, 1080, 0, 'fsr3', 'quality', 60],
  ['Helldivers AllyX 30W 1080p low', 'rog-ally-x', 3, 'helldivers2', 1920, 1080, 0, null, 'native', 55],
  ['HFW AllyX 25W 1080p low FSR', 'rog-ally-x', 2, 'hfw', 1920, 1080, 0, 'fsr3', 'balanced', 42],
  ['CS2 Ally 15W 1080p low FSR', 'rog-ally-z1e', 1, 'cs2', 1920, 1080, 0, 'fsr3', 'balanced', 72],
  ['Wukong Claw8 17W 1080p low native', 'msi-claw-8-ai', 0, 'wukong', 1920, 1080, 0, null, 'native', 23],
  ['Wukong Claw8 17W 1080p low FSR perf', 'msi-claw-8-ai', 0, 'wukong', 1920, 1080, 0, 'fsr3', 'performance', 51],
  ['CP77 Claw8 17W 1080p med FSR bal', 'msi-claw-8-ai', 0, 'cyberpunk', 1920, 1080, 1, 'xessXMX', 'balanced', 38],
  ['CP77 Claw8 30W 1080p med FSR bal', 'msi-claw-8-ai', 2, 'cyberpunk', 1920, 1080, 1, 'xessXMX', 'balanced', 54],
  ['CP77 XboxAllyX 25W 1080p med FSR bal', 'rog-xbox-ally-x', 2, 'cyberpunk', 1920, 1080, 1, 'fsr3', 'balanced', 48],
  ['CP77 XboxAllyX 17W 1080p med FSR bal', 'rog-xbox-ally-x', 1, 'cyberpunk', 1920, 1080, 1, 'fsr3', 'balanced', 35],
  ['CP77 Deck OLED 15W 800p low native', 'steamdeck-oled', 2, 'cyberpunk', 1280, 800, 0, null, 'native', 32],
];
export function run(log = true) {
  let sumAbs = 0; const rows = [];
  for (const [label, id, pi, gid, w, h, preset, tech, mode, real] of CASES) {
    const g = GAME_BY_ID[gid];
    const cfg = { settings: g.settings.map((s) => Math.min(preset, s.options.length - 1)), rtIndex: 0, upscaler: tech ? { tech } : null, mode, fg: 'off', w, h };
    const e = estimate(dev(id, P(id, pi)), g, cfg);
    const err = e.fps / real - 1; sumAbs += Math.abs(err); rows.push([label, real, e.fps, err, e.bottleneck]);
  }
  if (log) { rows.forEach(([l, r, p, e, b]) => console.log(l.padEnd(42), String(r).padStart(5), p.toFixed(1).padStart(6), ((e > 0 ? '+' : '') + (e * 100).toFixed(0) + '%').padStart(6), b)); console.log('mean abs error', (sumAbs / rows.length * 100).toFixed(1) + '%', 'median', (rows.map((r) => Math.abs(r[3])).sort((a, b) => a - b)[rows.length >> 1] * 100).toFixed(1) + '%'); }
  return { mae: sumAbs / rows.length, rows };
}
if (import.meta.url === `file://${process.argv[1]}`) run();
