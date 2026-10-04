import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineSetup } from '../src/engine/setup.js';
import { estimate, primaryMonitor, systemFactors, resolveGpu } from '../src/engine/estimator.js';
import { recommend, baseConfig } from '../src/engine/recommender.js';
import { GAME_BY_ID } from '../src/engine/data/games.js';
import { DEVICE_BY_ID } from '../src/engine/data/devices.js';
const ally = DEVICE_BY_ID['rog-ally-z1e'];
const base = (over = {}) => ({ device: 'rog-ally-z1e', cpu: ally.cpu, gpu: ally.gpu, ramGB: 16, ramChannels: 2, powerModeIdx: 3, igpuVramGB: 6, form: 'handheld', monitors: [{ ...ally.display, link: 'internal', builtin: true }], peripherals: {}, background: {}, ...over });
const tv = { w: 3840, h: 2160, hz: 120, vrr: true, hdr: false, link: 'HDMI2.1', model: 'LG C3' };

test('docked: external screen becomes the game screen and the dock limits refresh', () => {
  const e = buildEngineSetup(base({ playMode: 'docked', dock: 'rog-charger-dock', monitors: [{ ...ally.display, link: 'internal', builtin: true }, tv] }));
  assert.equal(e.monitors[0].model, 'LG C3'); assert.equal(e.monitors[0].link, 'HDMI2.0');
  const m = primaryMonitor(e); assert.equal(m.linkLimited, 120); assert.ok(m.hz <= 60, `HDMI 2.0 limits 4K to 60, got ${m.hz}`);
  const cheap = primaryMonitor(buildEngineSetup(base({ playMode: 'docked', dock: 'usbc-hdmi14', monitors: [tv] })));
  assert.ok(cheap.hz <= 30, `HDMI 1.4 limits 4K to 30, got ${cheap.hz}`);
});

test('weak charger stops the plugged-in Turbo mode', () => {
  const ok = buildEngineSetup(base({ charger: 'stock' })); assert.match(ok.powerMode.name, /30W/);
  const weak = buildEngineSetup(base({ charger: '30' })); assert.match(weak.powerMode.name, /25W/); assert.ok(weak.accessoryWarnings.length);
  const viaDock = buildEngineSetup(base({ charger: '65', playMode: 'docked', dock: 'steam-deck-dock', monitors: [tv] })); assert.match(viaDock.powerMode.name, /25W/, 'dock passthrough below 60 W');
  const f = systemFactors(weak); assert.ok(f.warnings.some((w) => /charger/i.test(w)));
});

test('XG Mobile eGPU replaces the iGPU on the original Ally, and is flagged on the Ally X', () => {
  const cp = GAME_BY_ID.cyberpunk;
  const plain = buildEngineSetup(base()); const xgm = buildEngineSetup(base({ egpu: 'xgm-4090', playMode: 'docked', dock: 'direct', monitors: [{ w: 2560, h: 1440, hz: 165, vrr: true, link: 'DP1.4', model: 'XG27' }] }));
  assert.equal(resolveGpu(xgm).name, 'NVIDIA GeForce RTX 4090 Laptop');
  const fPlain = estimate(plain, cp, baseConfig(cp, 1920, 1080)).fps, fX = estimate(xgm, cp, baseConfig(cp, 1920, 1080)).fps;
  assert.ok(fX > fPlain * 3, `eGPU should be far faster (${fPlain.toFixed(0)} -> ${fX.toFixed(0)})`);
  assert.equal(estimate(xgm, cp, baseConfig(cp, 1920, 1080)).bottleneck, 'CPU', 'Z1 Extreme CPU becomes the limit with a 4090');
  const allyX = buildEngineSetup(base({ device: 'rog-ally-x', egpu: 'xgm-4090' })); assert.ok(allyX.accessoryWarnings.some((w) => /no XG Mobile port/.test(w)));
  const tb = buildEngineSetup(base({ egpu: 'custom', egpuGpu: 'NVIDIA GeForce RTX 4070', egpuLink: 'tb4' })); const oc = buildEngineSetup(base({ egpu: 'custom', egpuGpu: 'NVIDIA GeForce RTX 4070', egpuLink: 'pcie4x4' }));
  assert.ok(estimate(oc, cp, baseConfig(cp, 2560, 1440)).fps > estimate(tb, cp, baseConfig(cp, 2560, 1440)).fps * 1.1, 'OCuLink beats Thunderbolt');
  const internal = buildEngineSetup(base({ egpu: 'custom', egpuGpu: 'NVIDIA GeForce RTX 4070', egpuLink: 'tb4', egpuInternal: true }));
  assert.ok(estimate(internal, cp, baseConfig(cp, 2560, 1440)).fps < estimate(tb, cp, baseConfig(cp, 2560, 1440)).fps);
});

test('recommendation targets the dock-limited refresh rate', () => {
  const e = buildEngineSetup(base({ playMode: 'docked', dock: 'rog-charger-dock', monitors: [tv] }));
  const r = recommend(e, GAME_BY_ID.valorant, { mode: 'refresh' });
  assert.ok(r.target <= 60); assert.ok(r.frameCap.some((t) => /can't carry/.test(t)));
});
