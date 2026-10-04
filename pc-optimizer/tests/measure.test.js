import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePresentMonCsv } from '../electron/presentmon.js';
import { estimate } from '../src/engine/estimator.js';
import { baseConfig, calibrate } from '../src/engine/recommender.js';
import { GAME_BY_ID } from '../src/engine/data/games.js';

const csv = (head, rows) => [head, ...rows].join('\n');
test('parses v1 PresentMon CSV, ignores desktop apps, skips lead-in, picks the game', () => {
  const rows = [];
  for (let i = 0; i < 600; i++) rows.push(`dwm.exe,100,0x1,DXGI,1,0,0,Composed: Flip,${(1000 / 120).toFixed(3)}`);
  for (let i = 0; i < 200; i++) rows.push(`Cyberpunk2077.exe,200,0x2,DXGI,0,0,1,Hardware: Independent Flip,${(1000 / 30).toFixed(3)}`); // menu before the lead-in ends
  for (let i = 0; i < 3000; i++) rows.push(`Cyberpunk2077.exe,200,0x2,DXGI,0,0,1,Hardware: Independent Flip,${(i % 100 === 0 ? 40 : 1000 / 52).toFixed(3)}`);
  const r = parsePresentMonCsv(csv('Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,MsBetweenPresents', rows), 6.7);
  assert.equal(r.app, 'Cyberpunk2077.exe');
  assert.ok(Math.abs(r.avgFps - 51) < 2, `avg ${r.avgFps}`); assert.ok(r.low1Fps < 26, `1% low ${r.low1Fps}`);
});
test('parses v2 PresentMon CSV (FrameTime column)', () => {
  const rows = []; for (let i = 0; i < 500; i++) rows.push(`eldenring.exe,10,0x1,DXGI,1,0,0,Hardware: Independent Flip,Application,${i * 16.6},16.667`);
  const r = parsePresentMonCsv(csv('Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,CPUStartTime,FrameTime', rows));
  assert.equal(r.app, 'eldenring.exe'); assert.ok(Math.abs(r.avgFps - 60) < 0.5);
});
test('unknown CSV format gives a clear error; nothing running gives null', () => {
  assert.throws(() => parsePresentMonCsv('Foo,Bar\n1,2'), /Unrecognized PresentMon output/);
  assert.equal(parsePresentMonCsv(csv('Application,MsBetweenPresents', ['dwm.exe,8.3', 'explorer.exe,16'])), null);
});
test('per-game calibration pins the measured config and shifts others proportionally', () => {
  const mid = { gpu: 'NVIDIA GeForce RTX 4070', cpu: 'AMD Ryzen 5 7600', ramGB: 32, ramChannels: 2, monitors: [{ w: 2560, h: 1440, hz: 165 }] };
  const cp = GAME_BY_ID.cyberpunk; const cfg = baseConfig(cp, 2560, 1440); const other = { ...baseConfig(cp, 1920, 1080), settings: cp.settings.map(() => 1) };
  const before = estimate(mid, cp, cfg).fps, beforeOther = estimate(mid, cp, other).fps;
  const measured = before * 0.8;
  const cal = calibrate(mid, cp, cfg, measured);
  const s = { ...mid, calibration: cal, gameCal: { cyberpunk: { measured, config: { settings: cfg.settings, rtIndex: 0, upscalerTech: null, mode: 'native', fg: 'off', w: 2560, h: 1440 } } } };
  const e = estimate(s, cp, cfg); assert.ok(Math.abs(e.fps / measured - 1) < 0.01, `pinned ${e.fps} vs ${measured}`); assert.ok(e.gameCalibrated); assert.equal(e.uncertainty, 0.05);
  const o = estimate(s, cp, other).fps; assert.ok(o < beforeOther && o > beforeOther * 0.7, `other config moved proportionally: ${beforeOther} -> ${o}`);
  const ER = GAME_BY_ID.rdr2; assert.ok(estimate(s, ER, baseConfig(ER, 2560, 1440)).fps < estimate(mid, ER, baseConfig(ER, 2560, 1440)).fps, 'global calibration nudges other games');
});
