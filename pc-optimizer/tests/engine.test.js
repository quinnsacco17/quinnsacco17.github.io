import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, systemFactors, displayChecks } from '../src/engine/estimator.js';
import { recommend, baseConfig, calibrate } from '../src/engine/recommender.js';
import { GAMES, GAME_BY_ID } from '../src/engine/data/games.js';
import { GPUS } from '../src/engine/data/gpus.js';
import { CPUS } from '../src/engine/data/cpus.js';
import { DEVICES } from '../src/engine/data/devices.js';
import { linkCheck } from '../src/engine/data/displays.js';
import { bestMatch } from '../src/engine/match.js';

const mid = { gpu: 'NVIDIA GeForce RTX 4070', cpu: 'AMD Ryzen 5 7600', ramGB: 32, ramChannels: 2, monitors: [{ w: 2560, h: 1440, hz: 165, vrr: true, link: 'DP1.4' }] };
const within = (v, lo, hi, msg) => assert.ok(v >= lo && v <= hi, `${msg}: got ${v.toFixed(1)}, expected ${lo}-${hi}`);

test('data integrity', () => {
  for (const g of GAMES) { assert.ok(g.gpuMs > 0 && g.cpuMs > 0, g.id); g.settings.forEach((s) => { assert.equal(s.options.length, s.gpu.length, `${g.id}/${s.key} gpu`); assert.equal(s.options.length, s.cpu.length); assert.equal(s.options.length, s.vram.length); assert.equal(s.options.length, s.visual.length); assert.equal(s.gpu[s.baselineIndex ?? s.options.length - 1], 1, `${g.id}/${s.key} baseline mult must be 1`); }); }
  const names = new Set(); for (const x of GPUS) { assert.ok(!names.has(x.name), 'dup gpu ' + x.name); names.add(x.name); assert.ok(x.idx > 0 && x.vram > 0); }
  for (const c of CPUS) assert.ok(c.idx > 0 && c.cores > 0);
  for (const d of DEVICES) { if (d.gpu && !d.gpuIdx) assert.ok(GPUS.some((g) => g.name === d.gpu), `device ${d.id} gpu "${d.gpu}" not in db`); if (d.cpu && !d.cpuIdx) assert.ok(CPUS.some((c) => c.name === d.cpu), `device ${d.id} cpu "${d.cpu}" not in db`); }
});

test('benchmark anchors (published averages, ±20%)', () => {
  const cp = GAME_BY_ID.cyberpunk;
  within(estimate(mid, cp, baseConfig(cp, 2560, 1440)).fps, 60, 90, '4070 CP2077 1440p ultra');
  within(estimate({ ...mid, gpu: 'NVIDIA GeForce RTX 4090', cpu: 'AMD Ryzen 7 9800X3D' }, cp, baseConfig(cp, 3840, 2160)).fps, 60, 90, '4090 CP2077 4K ultra');
  within(estimate({ ...mid, gpu: 'NVIDIA GeForce RTX 4090', cpu: 'AMD Ryzen 7 9800X3D' }, cp, { ...baseConfig(cp, 1920, 1080), rtIndex: 3 }).fps, 45, 70, '4090 CP2077 1080p PT');
  within(estimate({ ...mid, gpu: 'NVIDIA GeForce RTX 3060', cpu: 'AMD Ryzen 5 5600' }, cp, baseConfig(cp, 1920, 1080)).fps, 50, 80, '3060 CP2077 1080p ultra');
  within(estimate(mid, GAME_BY_ID.cs2, { ...baseConfig(GAME_BY_ID.cs2, 1920, 1080), settings: GAME_BY_ID.cs2.settings.map(() => 0) }).fps, 280, 450, '4070/7600 CS2 1080p low');
  within(estimate({ ...mid, gpu: 'AMD Radeon RX 7800 XT', cpu: 'AMD Ryzen 7 7800X3D' }, GAME_BY_ID.rdr2, baseConfig(GAME_BY_ID.rdr2, 2560, 1440)).fps, 70, 105, '7800XT RDR2 1440p ultra');
  within(estimate({ ...mid, gpu: 'AMD Radeon RX 7900 XTX', cpu: 'AMD Ryzen 7 7800X3D' }, cp, { ...baseConfig(cp, 2560, 1440), rtIndex: 2 }).fps, 35, 60, '7900XTX CP2077 1440p RT ultra');
});

test('handheld anchors', () => {
  const ally = { gpu: 'AMD Radeon 780M (Ryzen 7 7840/8845)', cpu: 'AMD Ryzen 7 7840HS', cpuIdxOverride: 42, ramGB: 16, ramChannels: 2, igpuVramGB: 6, powerMode: { name: 't', gpu: 0.85, cpu: 0.95 }, monitors: [{ w: 1920, h: 1080, hz: 120, vrr: true, link: 'internal' }] };
  const cp = GAME_BY_ID.cyberpunk;
  within(estimate(ally, cp, { ...baseConfig(cp, 1920, 1080), settings: cp.settings.map(() => 0), upscaler: { tech: 'fsr3' }, mode: 'performance' }).fps, 40, 70, 'Ally CP2077 1080p low FSR perf');
  within(estimate(ally, GAME_BY_ID.fortnite, { ...baseConfig(GAME_BY_ID.fortnite, 1920, 1080), settings: GAME_BY_ID.fortnite.settings.map(() => 0), upscaler: { tech: 'fsr3' }, mode: 'performance' }).fps, 40, 80, 'Ally Fortnite low FSR perf');
});

test('recommender meets target when hardware allows and respects engine caps', () => {
  const r = recommend(mid, GAME_BY_ID.cyberpunk, { mode: 'refresh' });
  assert.ok(r.best.meets); assert.ok(r.best.est.fps >= 165);
  const er = recommend(mid, GAME_BY_ID.eldenring, { mode: 'refresh' });
  assert.equal(er.target, 60); assert.ok(er.best.est.fps <= 60.01);
  const comp = recommend(mid, GAME_BY_ID.valorant, { mode: 'competitive' });
  assert.equal(comp.best.fg.id, 'off'); assert.ok(comp.best.est.fps > 300);
  // low-end: target unreachable -> fallback resolution offered
  const weak = { gpu: 'NVIDIA GeForce GTX 1650', cpu: 'Intel Core i5-9400F', ramGB: 16, monitors: [{ w: 3840, h: 2160, hz: 144, vrr: false, link: 'HDMI2.0' }] };
  const w = recommend(weak, GAME_BY_ID.alanwake2, { mode: 'refresh' });
  assert.ok(!w.anyMeets);
});

test('system factors: single channel, HDD, 8k polling, extra monitors', () => {
  const base = systemFactors(mid);
  assert.ok(systemFactors({ ...mid, ramChannels: 1 }).cpu < base.cpu);
  assert.ok(systemFactors({ ...mid, storage: 'hdd' }).lowsPenalty < 1);
  assert.ok(systemFactors({ ...mid, peripherals: { mousePolling: 8000 } }).cpu < base.cpu);
  const two = systemFactors({ ...mid, monitors: [...mid.monitors, { w: 1920, h: 1080, hz: 60, video: true }] });
  assert.ok(two.gpu < base.gpu && two.vramReserve > base.vramReserve);
  assert.ok(systemFactors({ ...mid, psuW: 400 }).warnings.some((w) => /PSU/.test(w)));
});

test('display bandwidth', () => {
  assert.ok(linkCheck(3840, 2160, 60, 8, 'HDMI2.0').ok);
  assert.ok(!linkCheck(3840, 2160, 120, 10, 'HDMI2.0').ok);
  assert.ok(linkCheck(3840, 2160, 144, 10, 'DP1.4').dsc);
  assert.ok(!linkCheck(3840, 2160, 240, 10, 'DP1.2').ok);
  assert.ok(linkCheck(3840, 2160, 240, 10, 'DP2.1-UHBR20').ok);
  const dc = displayChecks({ ...mid, monitors: [{ w: 3840, h: 2160, hz: 144, hdr: true, link: 'HDMI2.0', vrr: true }] });
  assert.ok(dc.some((d) => d.level === 'warn'));
});

test('calibration moves prediction to measured value', () => {
  const cp = GAME_BY_ID.cyberpunk; const cfg = baseConfig(cp, 2560, 1440);
  const before = estimate(mid, cp, cfg).fps;
  const cal = calibrate(mid, cp, cfg, before * 0.85);
  const after = estimate({ ...mid, calibration: cal }, cp, cfg).fps;
  within(after / (before * 0.85), 0.97, 1.03, 'calibrated ratio');
});

test('hardware name matching', () => {
  assert.equal(bestMatch('NVIDIA GeForce RTX 4070 Ti SUPER', GPUS).name, 'NVIDIA GeForce RTX 4070 Ti SUPER');
  assert.equal(bestMatch('NVIDIA GeForce RTX 4070', GPUS).name, 'NVIDIA GeForce RTX 4070');
  assert.equal(bestMatch('AMD Ryzen 7 7800X3D 8-Core Processor', CPUS).name, 'AMD Ryzen 7 7800X3D');
  assert.equal(bestMatch('13th Gen Intel(R) Core(TM) i7-13700K', CPUS).name, 'Intel Core i7-13700K');
  assert.equal(bestMatch('AMD Radeon RX 7800 XT', GPUS).name, 'AMD Radeon RX 7800 XT');
});
