import { GPU_BY_NAME } from './data/gpus.js';
import { CPU_BY_NAME } from './data/cpus.js';
import { linkCheck } from './data/displays.js';

// Tunables fitted against published benchmarks (tests/handheld-validation.mjs, tests/engine.test.js).
export const MODEL = { lowResExp: 0.4, settingsK: 0.9 };
const resScale = (r, e) => (r >= 1 ? Math.pow(r, e) : Math.pow(r, Math.min(e, MODEL.lowResExp)));

export const UPSCALE_MODES = [
  { id: 'native', name: 'Native (TAA)', scale: 1.0 },
  { id: 'dlaa', name: 'DLAA / Native AA', scale: 1.0, overhead: 1.0 },
  { id: 'quality', name: 'Quality (67%)', scale: 0.667 },
  { id: 'balanced', name: 'Balanced (58%)', scale: 0.58 },
  { id: 'performance', name: 'Performance (50%)', scale: 0.5 },
  { id: 'ultraperf', name: 'Ultra Performance (33%)', scale: 0.333 },
];

// Visual score (native = 10) per upscaler tech and mode.
const UPSCALER_VISUAL = {
  dlss4: { native: 10, dlaa: 10.6, quality: 9.7, balanced: 9.3, performance: 8.8, ultraperf: 7.4, overhead: 1.1 },
  dlss3: { native: 10, dlaa: 10.4, quality: 9.4, balanced: 8.9, performance: 8.2, ultraperf: 6.6, overhead: 0.6 },
  dlss2: { native: 10, dlaa: 10.3, quality: 9.3, balanced: 8.8, performance: 8.0, ultraperf: 6.4, overhead: 0.7 },
  fsr4: { native: 10, dlaa: 10.3, quality: 9.4, balanced: 8.9, performance: 8.2, ultraperf: 6.8, overhead: 1.2 },
  fsr3: { native: 10, dlaa: 10.0, quality: 8.5, balanced: 7.7, performance: 6.8, ultraperf: 5.0, overhead: 0.8 },
  xessXMX: { native: 10, dlaa: 10.2, quality: 9.1, balanced: 8.6, performance: 7.8, ultraperf: 6.2, overhead: 1.0 },
  xess: { native: 10, dlaa: 10.0, quality: 8.4, balanced: 7.7, performance: 6.8, ultraperf: 5.2, overhead: 1.4 },
};

export function availableUpscalers(gpu, game) {
  const out = [];
  if (game.upscalers.includes('dlss') && gpu.dlss) out.push({ id: 'dlss', name: gpu.dlss >= 4 ? 'DLSS 4' : gpu.dlss === 3 ? 'DLSS 3' : 'DLSS 2', tech: gpu.dlss >= 4 ? 'dlss4' : gpu.dlss === 3 ? 'dlss3' : 'dlss2' });
  if (game.upscalers.includes('fsr')) out.push({ id: 'fsr', name: gpu.family === 'rdna4' ? 'FSR 4' : 'FSR 3', tech: gpu.family === 'rdna4' ? 'fsr4' : 'fsr3' });
  if (game.upscalers.includes('xess')) out.push({ id: 'xess', name: gpu.vendor === 'Intel' ? 'XeSS 2 (XMX)' : 'XeSS (DP4a)', tech: gpu.vendor === 'Intel' ? 'xessXMX' : 'xess' });
  return out;
}
export function upscalerVisual(tech, modeId) { return (UPSCALER_VISUAL[tech] || UPSCALER_VISUAL.fsr3)[modeId] ?? 10; }

export function fgOptions(gpu, game) {
  if (!game.fg) return [{ id: 'off', name: 'Off', mult: 1 }];
  const o = [{ id: 'off', name: 'Off', mult: 1 }];
  if (gpu.fg === 'mfg') o.push({ id: 'fg2', name: 'DLSS Frame Gen 2x', mult: 1.83, overhead: 2.0 }, { id: 'fg3', name: 'DLSS Multi Frame Gen 3x', mult: 2.64, overhead: 2.9 }, { id: 'fg4', name: 'DLSS Multi Frame Gen 4x', mult: 3.38, overhead: 3.9 });
  else if (gpu.fg === 'dlss3') o.push({ id: 'fg2', name: 'DLSS Frame Gen 2x', mult: 1.75, overhead: 2.8 });
  else if (gpu.fg === 'xess2') o.push({ id: 'fg2', name: 'XeSS Frame Gen 2x', mult: 1.75, overhead: 1.8 });
  else o.push({ id: 'fg2', name: 'FSR Frame Gen 2x', mult: 1.8, overhead: 1.5 });
  return o;
}

export function resolveGpu(setup) {
  const base = GPU_BY_NAME[setup.gpu] || { name: setup.gpu || 'Custom GPU', idx: setup.gpuIdx || 30, vram: setup.vramGB || 8, rt: 0.7, dlss: 0, fg: 'fsr3', vendor: 'Custom', family: 'custom', ports: ['DP1.4', 'HDMI2.0'] };
  const g = { ...base };
  if (setup.gpuIdxOverride) g.idx = setup.gpuIdxOverride;
  if (setup.vramOverride) g.vram = setup.vramOverride;
  return g;
}
export function resolveCpu(setup) {
  const base = CPU_BY_NAME[setup.cpu] || { name: setup.cpu || 'Custom CPU', idx: setup.cpuIdx || 50, cores: setup.cpuCores || 6, threads: (setup.cpuCores || 6) * 2, vendor: 'Custom' };
  const c = { ...base };
  if (setup.cpuIdxOverride) c.idx = setup.cpuIdxOverride;
  return c;
}

// Effective system multipliers from everything that is not the GPU/CPU silicon itself.
export function systemFactors(setup) {
  const gpu = resolveGpu(setup), cpu = resolveCpu(setup);
  const f = { gpu: 1, cpu: 1, vramReserve: 0.6, lowsPenalty: 1, warnings: [], notes: [] };
  const pm = setup.powerMode;
  if (pm) { f.gpu *= pm.gpu; f.cpu *= pm.cpu; f.notes.push(`Power mode "${pm.name}" applied (GPU x${pm.gpu}, CPU x${pm.cpu}).`); }
  if (setup.gpuBonus) f.gpu *= setup.gpuBonus;
  if (setup.cpuBonus) f.cpu *= setup.cpuBonus;
  if (setup.onBattery && !pm) { f.gpu *= 0.65; f.cpu *= 0.8; f.warnings.push('On battery: expect 30-40% lower performance than plugged in.'); }
  if (setup.laptopMux === 'optimus') { f.gpu *= 0.94; f.notes.push('Optimus/hybrid mode (no MUX): ~5% fps and a few ms of latency lost. Use the MUX / dGPU-only mode if the laptop has one.'); }
  // RAM
  const ram = setup.ramGB || 16;
  if (ram < 12) { f.cpu *= 0.8; f.lowsPenalty *= 0.8; f.warnings.push(`${ram} GB RAM: modern games page to disk. Expect stutter; 16 GB minimum, 32 GB for UE5 titles.`); }
  else if (ram < 16) { f.cpu *= 0.92; f.lowsPenalty *= 0.9; f.warnings.push('12 GB RAM is under the 16 GB floor for current games.'); }
  if ((setup.ramChannels || 2) < 2) { f.cpu *= 0.88; f.lowsPenalty *= 0.95; if (gpu.family === 'igpu') f.gpu *= 0.65; f.warnings.push('Single-channel RAM: -12% avg and -16% 1% lows in CPU-bound games (TechSpot 2025), up to -34% in Marvel Rivals; -30-50% on an iGPU. Add a second matching stick.'); }
  if (setup.ramType && /DDR4-(2133|2400|2666)/i.test(setup.ramType) && cpu.vendor === 'AMD') { f.cpu *= 0.93; f.lowsPenalty *= 0.95; f.notes.push('Slow DDR4 on Ryzen: 3600 MT/s CL16 adds ~6-9% avg and ~10% to 1% lows (TechSpot Ryzen 5000 memory guide).'); }
  if (setup.ramType && /DDR5-(4800|5200)/i.test(setup.ramType) && cpu.vendor !== 'Apple' && !/X3D/.test(cpu.name)) { const slow = /4800/.test(setup.ramType); f.cpu *= slow ? 0.9 : 0.94; f.notes.push(`DDR5-${slow ? 4800 : 5200} on a non-X3D CPU: 6000 MT/s CL30 adds ~${slow ? 10 : 6}% in CPU-bound games (HUB 13-game test). X3D chips barely care.`); }
  // Cores
  if (cpu.threads < 8) { f.cpu *= 0.8; f.lowsPenalty *= 0.85; f.warnings.push(`${cpu.threads} threads: modern engines want 8+. Expect traversal stutter.`); }
  else if (cpu.cores < 6 && !cpu.eCores) { f.cpu *= 0.92; }
  // Storage
  if (setup.storage === 'hdd') { f.lowsPenalty *= 0.8; f.warnings.push('Game on HDD: asset streaming stutter and long loads. Move the game to an SSD; this is the single biggest 1% low fix available.'); }
  // Monitors
  const mons = setup.monitors || [];
  const extra = Math.max(0, mons.length - 1);
  if (extra > 0) {
    let cost = 0; let vram = 0;
    mons.slice(1).forEach((m) => { const heavy = (m.w * m.h >= 3686400) || m.hz >= 120 || m.hdr; cost += heavy ? 0.025 : 0.015; vram += heavy ? 0.35 : 0.2; if (m.video) { cost += 0.04; } });
    f.gpu *= 1 - cost; f.vramReserve += vram;
    f.notes.push(`${extra} extra monitor${extra > 1 ? 's' : ''}: ~${Math.round(cost * 100)}% GPU time and ${vram.toFixed(1)} GB VRAM reserved for desktop composition${mons.some((m, i) => i > 0 && m.video) ? ' (video playback on a secondary screen is the expensive part)' : ''}.`);
    if (mons.slice(1).some((m) => m.hz !== mons[0].hz && m.hz > 60)) f.notes.push('Mixed refresh rates: if the game monitor stutters while video plays on the other, set both to a common refresh or enable Hardware-accelerated GPU scheduling.');
  }
  // Background software
  const bg = setup.background || {};
  if (bg.discordOverlay) { f.cpu *= 0.985; }
  if (bg.browserVideo) { f.gpu *= 0.96; f.cpu *= 0.97; f.notes.push('Browser video while gaming: ~4% GPU. Close YouTube/Twitch tabs for benchmarks.'); }
  if (bg.rgbSoftware) { f.cpu *= 0.98; f.notes.push('RGB suites (iCUE, Synapse, Armoury Crate) idle at 1-3% CPU. Set them to start minimized or lighting-only.'); }
  if (bg.streaming === 'nvenc' || bg.streaming === 'amf' || bg.streaming === 'qsv') { f.gpu *= 0.93; f.cpu *= 0.97; f.notes.push('Hardware-encoder streaming/recording: ~7% GPU. On a second monitor, this mostly affects 1% lows.'); }
  if (bg.streaming === 'x264') { f.cpu *= 0.75; f.warnings.push('x264 software encoding on the gaming PC: ~25% CPU. Use NVENC/AV1 or a second PC.'); }
  if (bg.captureCard) { f.cpu *= 0.98; }
  // Peripherals
  const per = setup.peripherals || {};
  const poll = per.mousePolling || 1000;
  if (poll >= 8000) { const hit = cpu.idx < 70 ? 0.95 : 0.975; f.cpu *= hit; f.warnings.push(`8000 Hz mouse polling costs ${Math.round((1 - hit) * 100)}% CPU time on this CPU. Use 2000-4000 Hz unless you are above 360 Hz.`); }
  else if (poll >= 4000) { f.cpu *= cpu.idx < 70 ? 0.975 : 0.99; }
  if (per.mouseOnHub && poll >= 2000) f.warnings.push('High-polling mouse on a USB hub: shared bandwidth causes polling drops. Plug the mouse into a rear motherboard port.');
  if (per.hubDevices >= 4 && per.hubGen === 'usb2') f.warnings.push('4+ devices on a USB 2.0 hub (480 Mbit shared): a webcam or audio interface will starve the others. Move the webcam to a USB 3 port.');
  if (per.webcamOnHub && per.hubGen === 'usb2') f.warnings.push('Webcam on a USB 2.0 hub: expect dropped frames at 1080p30.');
  if (per.audioInterface && per.audioOnHub) f.warnings.push('Audio interface through a hub: crackle risk. Direct motherboard port, ideally not shared with the mouse controller.');
  if (per.vrHeadset) { f.notes.push('VR headset connected: SteamVR/Oculus runtime reserves ~2-3% GPU when running even if the headset is idle. Close it for flat games.'); f.gpu *= 0.98; }
  // Power
  if (setup.psuW && gpu.tdp && !gpu.mobile) {
    const draw = gpu.tdp * 1.1 + (cpu.vendor === 'Intel' ? 200 : 140) + 80;
    if (setup.psuW < draw) f.warnings.push(`PSU ${setup.psuW} W is below the ~${Math.round(draw)} W transient-safe estimate for this GPU+CPU. Risk of shutdowns under load.`);
    else if (setup.psuW < draw * 1.2) f.notes.push(`PSU ${setup.psuW} W is adequate but tight (est. ${Math.round(draw)} W peak).`);
  }
  // Thermal
  if (setup.cooling === 'poor') { f.gpu *= 0.95; f.cpu *= 0.95; f.notes.push('Poor airflow: ~5% sustained clock loss assumed. Clean filters, add intake.'); }
  (setup.accessoryWarnings || []).forEach((w) => f.warnings.push(w)); (setup.accessoryNotes || []).forEach((n) => f.notes.push(n));
  // Calibration
  if (setup.calibration) { f.gpu *= setup.calibration.gpu || 1; f.cpu *= setup.calibration.cpu || 1; f.notes.push(`Calibrated from measured fps (GPU x${(setup.calibration.gpu || 1).toFixed(2)}, CPU x${(setup.calibration.cpu || 1).toFixed(2)}).`); }
  return f;
}

export function primaryMonitor(setup) {
  const m = (setup.monitors || [])[0];
  if (!m) return { w: 1920, h: 1080, hz: 60, vrr: false, hdr: false, link: 'DP1.4', dsc: true };
  if (m.link && m.link !== 'internal') {
    const lc = linkCheck(m.w, m.h, m.hz, m.hdr ? 10 : 8, m.link, m.dsc !== false);
    if (!lc.ok && lc.maxHz8) { const std = [24, 30, 48, 50, 60, 75, 90, 100, 120, 144, 165, 175, 240].filter((r) => r <= lc.maxHz8); return { ...m, hz: Math.min(m.hz, std.length ? std[std.length - 1] : 24), linkLimited: m.hz }; }
  }
  return m;
}

export function displayChecks(setup) {
  const gpu = resolveGpu(setup);
  const out = [];
  (setup.monitors || []).forEach((m, i) => {
    const bpc = m.hdr ? 10 : 8;
    const r = linkCheck(m.w, m.h, m.hz, bpc, m.link, m.dsc !== false);
    if (!r.ok) out.push({ level: 'warn', text: `Monitor ${i + 1}: ${r.note}` });
    else if (r.dsc) out.push({ level: 'info', text: `Monitor ${i + 1}: ${r.note}` });
    if (m.link && gpu.ports && !gpu.ports.some((p) => p.startsWith(m.link.slice(0, 4)))) {}
    if (m.link === 'HDMI2.0' && m.hz > 60 && m.w >= 3840) out.push({ level: 'warn', text: `Monitor ${i + 1}: 4K above 60 Hz needs HDMI 2.1 or DisplayPort. Check the cable is rated Ultra High Speed.` });
    if (m.link && m.link.startsWith('USB-C') && m.hz >= 144) out.push({ level: 'info', text: `Monitor ${i + 1}: through a USB-C dock/hub, DP alt mode often drops to 2 lanes when USB 3 data is also used. If the max refresh is missing in Windows, this is why.` });
    if (gpu.vendor === 'NVIDIA' && m.vrr && m.vrrType === 'freesync') out.push({ level: 'info', text: `Monitor ${i + 1}: FreeSync panel on NVIDIA. Enable G-SYNC Compatible in NVIDIA Control Panel and turn on Adaptive-Sync in the monitor OSD.` });
    if (!m.vrr && m.hz > 60) out.push({ level: 'info', text: `Monitor ${i + 1}: no VRR. Any fps below ${m.hz} shows judder; cap at ${m.hz} or an integer divisor (${Math.round(m.hz / 2)}).` });
  });
  return out;
}

export function vramNeed(game, settings, rtMode, outW, outH, scale) {
  const mp = (outW * outH) / 1e6;
  let v = game.vramBase + game.vramPerMP * (mp - 2.07) * (0.6 + 0.4 * scale);
  game.settings.forEach((s, i) => { v += s.vram[settings[i]] || 0; });
  v += rtMode?.vram || 0;
  return Math.max(1.5, v);
}

// Core estimate. config: { settings: [idx...], rtIndex, upscaler: {tech}|null, mode: id, fg: id, w, h }
export function estimate(setup, game, config) {
  const gpu = resolveGpu(setup), cpu = resolveCpu(setup), f = systemFactors(setup);
  const um = UPSCALE_MODES.find((m) => m.id === config.mode) || UPSCALE_MODES[0];
  const w = config.w, h = config.h;
  const outPixels = w * h, refPixels = 1920 * 1080;
  const internalPixels = outPixels * um.scale * um.scale;
  let gpuMult = 1, cpuMult = 1;
  game.settings.forEach((s, i) => { const o = Math.min(config.settings[i] ?? s.options.length - 1, s.options.length - 1); gpuMult *= s.gpu[o]; cpuMult *= s.cpu[o]; });
  gpuMult = Math.pow(gpuMult, (game.settingsK ?? 1) * MODEL.settingsK);
  const rtMode = game.rt ? game.rt.modes[config.rtIndex || 0] : null;
  if (rtMode) { const rtEff = gpu.rt > 0 ? gpu.rt : 0.25; gpuMult *= 1 + (rtMode.gpu - 1) / rtEff; cpuMult *= rtMode.cpu; }
  const gpuEff = gpu.idx * f.gpu, cpuEff = cpu.idx * f.cpu;
  const resCost = 0.85 * resScale(internalPixels / refPixels, game.resExp) + 0.15 * resScale(outPixels / refPixels, game.resExp);
  let gpuMs = game.gpuMs * gpuMult * resCost * (100 / gpuEff);
  if (config.upscaler && um.id !== 'native') { const tech = UPSCALER_VISUAL[config.upscaler.tech] || UPSCALER_VISUAL.fsr3; gpuMs += (um.overhead || tech.overhead) * (outPixels / 8294400) * (100 / gpuEff); }
  // Fixed per-frame GPU cost (present, UI, composition): keeps light games from scaling absurdly.
  gpuMs += 0.25 * (100 / gpuEff);
  let cpuMs = game.cpuMs * cpuMult * (100 / cpuEff);
  // RT BVH/driver overhead lands on CPU as well on NVIDIA less, AMD more
  // Blend: near the crossover both contribute.
  const p = 5;
  let frameMs = Math.pow(Math.pow(gpuMs, p) + Math.pow(cpuMs, p), 1 / p);
  const vram = vramNeed(game, config.settings, rtMode, w, h, um.scale) + f.vramReserve;
  const igpu = gpu.family === 'igpu';
  const vramAvail = igpu ? (setup.igpuVramGB || gpu.vram || 4) + 2 : gpu.vram;
  let vramOver = vram > vramAvail * 0.95;
  let lows = frameMs === gpuMs ? 0.74 : 0.66;
  const gpuBound = gpuMs > cpuMs * 1.08, cpuBound = cpuMs > gpuMs * 1.08;
  lows = gpuBound ? 0.75 : cpuBound ? 0.64 : 0.7;
  if (vramOver) { const over = vram / vramAvail; const sev = igpu ? 0.8 : 2.5; frameMs *= 1 + Math.min(1.2, (over - 0.95) * sev); lows *= igpu ? 0.8 : 0.6; }
  lows *= f.lowsPenalty;
  // Frame generation
  const fgOpt = fgOptions(gpu, game).find((o) => o.id === (config.fg || 'off'));
  let baseFps = 1000 / frameMs;
  let fps = baseFps, fgNote = null;
  if (fgOpt && fgOpt.id !== 'off') {
    const fgMs = fgOpt.overhead * (outPixels / 8294400) * (100 / gpuEff);
    const base2 = 1000 / (Math.pow(Math.pow(gpuMs + fgMs, p) + Math.pow(cpuMs, p), 1 / p));
    baseFps = base2; fps = base2 * fgOpt.mult;
    if (base2 < 50) fgNote = `Frame gen from a ${Math.round(base2)} fps base: input latency and artifacts will be obvious. Needs 55-60+ base.`;
  }
  let lowsFps = fps * lows;
  if (game.cap) { fps = Math.min(fps, game.cap); lowsFps = Math.min(lowsFps, game.cap); }
  const uncertainty = setup.calibration ? 0.07 : 0.14;
  return {
    fps, baseFps, lows: lowsFps, gpuMs, cpuMs, frameMs, bottleneck: gpuBound ? 'GPU' : cpuBound ? 'CPU' : 'Balanced', vram, vramAvail, vramOver, fgNote, capped: game.cap && fps >= game.cap - 0.5,
    range: [fps * (1 - uncertainty), fps * (1 + uncertainty)], uncertainty, factors: f, gpu, cpu,
  };
}

export function visualScore(game, config, upscalerTech) {
  let s = 0, wsum = 0;
  game.settings.forEach((st, i) => { const o = Math.min(config.settings[i] ?? st.options.length - 1, st.options.length - 1); s += st.visual[o] * st.weight; wsum += st.weight * 10; });
  let base = (s / wsum) * 10;
  if (game.rt) { const m = game.rt.modes[config.rtIndex || 0]; base += (m.visual || 0) * 0.6; }
  const um = config.mode || 'native';
  const uv = upscalerTech ? upscalerVisual(upscalerTech, um) : (um === 'native' ? 10 : 7);
  return base * (uv / 10);
}
