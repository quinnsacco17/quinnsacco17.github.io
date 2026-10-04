import { estimate, visualScore, availableUpscalers, fgOptions, UPSCALE_MODES, primaryMonitor, resolveGpu } from './estimator.js';

export const TARGET_MODES = [
  { id: 'refresh', name: 'Match monitor refresh rate', desc: 'Highest visuals that hold your refresh rate in average fps with 1% lows above 80% of it.' },
  { id: 'quality60', name: 'Max quality at 60 fps', desc: 'Everything the hardware can do while staying at 60+ (lows above 50).' },
  { id: 'quality', name: 'Max quality at a custom fps', desc: 'Pick your own fps target and maximize visuals.' },
  { id: 'competitive', name: 'Competitive (max fps, lowest latency)', desc: 'Low settings except visibility-relevant ones, no frame gen, no RT, upscaling only if needed.' },
  { id: 'balanced', name: 'Balanced', desc: 'Visual quality and fps weighted together.' },
  { id: 'battery', name: 'Battery / handheld efficiency', desc: 'Hit a modest fps cap with the lowest GPU load, for runtime and heat.' },
];

export function baseConfig(game, w, h) {
  return { settings: game.settings.map((s) => s.defaultIndex ?? s.options.length - 1), rtIndex: 0, upscaler: null, mode: 'native', fg: 'off', w, h };
}

function stepDown(game, cfg, competitive, locks = {}) {
  // Returns list of candidate single-step reductions [{cfg, loss}]
  const out = [];
  game.settings.forEach((s, i) => {
    const cur = cfg.settings[i];
    if (cur <= 0) return;
    if (s.key in locks) return;
    if (competitive && s.key === 'textures' && cur <= 2) return; // keep textures at least High in comp
    const c = { ...cfg, settings: [...cfg.settings] }; c.settings[i] = cur - 1;
    const loss = (s.visual[cur] - s.visual[cur - 1]) * s.weight;
    out.push({ cfg: c, loss, what: `${s.name}: ${s.options[cur]} -> ${s.options[cur - 1]}` });
  });
  return out;
}

function greedy(setup, game, cfg, target, lowsTarget, competitive, budget = 64, locks = {}) {
  let cur = cfg, est = estimate(setup, game, cur);
  const log = [];
  let steps = 0;
  while ((est.fps < target || est.lows < lowsTarget) && steps++ < budget) {
    const cands = stepDown(game, cur, competitive, locks);
    if (!cands.length) break;
    let best = null;
    for (const c of cands) {
      const e = estimate(setup, game, c.cfg);
      const gain = e.fps - est.fps;
      const score = gain / Math.max(0.05, c.loss);
      if (gain <= 0.05) continue;
      if (!best || score > best.score) best = { ...c, e, score };
    }
    if (!best) break;
    cur = best.cfg; est = best.e; log.push(best.what);
  }
  return { cfg: cur, est, log };
}

export function recommend(setup, game, opts) {
  const mon = primaryMonitor(setup);
  const gpu = resolveGpu(setup);
  const w = opts.w || mon.w, h = opts.h || mon.h;
  const mode = opts.mode || 'refresh';
  const competitive = mode === 'competitive';
  let target, lowsTarget, allowFg = true, allowRt = true;
  if (mode === 'refresh') { target = mon.hz; lowsTarget = mon.hz * 0.8; }
  else if (mode === 'quality60') { target = 60; lowsTarget = 50; }
  else if (mode === 'quality') { target = opts.targetFps || 90; lowsTarget = target * 0.8; }
  else if (mode === 'competitive') { target = Math.max(mon.hz * 1.3, 200); lowsTarget = mon.hz; allowFg = false; allowRt = false; }
  else if (mode === 'balanced') { target = Math.min(mon.hz, Math.max(90, mon.hz * 0.6)); lowsTarget = target * 0.8; }
  else if (mode === 'battery') { target = opts.targetFps || 45; lowsTarget = target * 0.85; allowFg = false; allowRt = false; }
  if (game.cap && target > game.cap) { target = game.cap; lowsTarget = game.cap * 0.9; }

  const prefs = { fg: 'allow', upscale: 'allow', upscaler: 'auto', rt: 'auto', ...(opts.prefs || {}) };
  const locks = opts.locks || {};
  if (prefs.fg === 'never') allowFg = false;
  if (prefs.rt === 'off') allowRt = false;
  let upscalers = prefs.upscale === 'native' ? [] : availableUpscalers(gpu, game);
  if (prefs.upscaler !== 'auto' && upscalers.some((u) => u.id === prefs.upscaler)) upscalers = upscalers.filter((u) => u.id === prefs.upscaler);
  if ('upscaler' in locks) upscalers = locks.upscaler ? upscalers.filter((u) => u.id === locks.upscaler) : [];
  let fgs = allowFg ? fgOptions(gpu, game) : [fgOptions(gpu, game)[0]];
  if ('fg' in locks) fgs = fgOptions(gpu, game).filter((f) => f.id === locks.fg); if (!fgs.length) fgs = [fgOptions(gpu, game)[0]];
  let rtModes = game.rt ? game.rt.modes.map((_, i) => i) : [0];
  if (game.rt && prefs.rt === 'prefer' && !competitive) rtModes = rtModes.filter((i) => i > 0);
  if (game.rt && 'rt' in locks) { rtModes = [Math.min(locks.rt, game.rt.modes.length - 1)]; allowRt = true; }
  const candidates = [];
  const upsCombos = ('mode' in locks && locks.mode !== 'native') || ('upscaler' in locks && locks.upscaler) ? [] : [{ up: null, modeId: 'native' }];
  for (const up of upscalers) {
    for (const m of UPSCALE_MODES) {
      if (m.id === 'native') continue;
      if (m.id === 'dlaa' && !(up.tech.startsWith('dlss') || up.tech === 'fsr4' || up.tech === 'xessXMX')) continue;
      if (competitive && (m.id === 'ultraperf' || m.id === 'performance')) continue;
      if ('mode' in locks && locks.mode !== m.id) continue;
      upsCombos.push({ up, modeId: m.id });
    }
  }
  for (const rtI of rtModes) {
    if (!allowRt && game.rt && !game.rt.mandatory && rtI > 0) continue;
    for (const uc of upsCombos) {
      for (const fg of fgs) {
        let cfg = { ...baseConfig(game, w, h), rtIndex: rtI, upscaler: uc.up, mode: uc.modeId, fg: fg.id };
        if (competitive) { cfg.settings = game.settings.map((s) => s.competitiveOff ? 0 : s.key === 'textures' ? Math.min(2, s.options.length - 1) : s.key === 'aa' ? s.options.length - 1 : s.key === 'shadows' ? Math.min(1, s.options.length - 1) : 0); }
        game.settings.forEach((s, i) => { if (s.key in locks) cfg.settings[i] = Math.min(locks[s.key], s.options.length - 1); });
        const g = greedy(setup, game, cfg, target, lowsTarget, competitive, 64, locks);
        if (fg.id !== 'off' && g.est.baseFps < 55 && !('fg' in locks)) continue;
        const meets = g.est.fps >= target - 0.5 && g.est.lows >= lowsTarget - 0.5;
        let vis = visualScore(game, g.cfg, uc.up?.tech);
        if (fg.id !== 'off') vis -= 0.35 * (fg.id === 'fg4' ? 2 : fg.id === 'fg3' ? 1.5 : 1); // latency + artifacts
        if (g.est.vramOver) vis -= 3;
        let score;
        if (competitive) score = g.est.fps + (g.est.lows * 0.5) - (uc.modeId !== 'native' ? g.est.fps * 0.3 : 0);
        else if (mode === 'battery') score = meets ? -g.est.gpuMs * -1 * 0 + vis - (g.est.fps - target) * 0.02 : -100 + g.est.fps;
        else if (mode === 'balanced') score = vis * 6 + Math.min(g.est.fps, mon.hz) * 0.12;
        else score = meets ? vis * 10 + Math.min(g.est.fps - target, target * 0.3) * 0.05 : -1000 + g.est.fps;
        candidates.push({ cfg: g.cfg, est: g.est, log: g.log, meets, vis, score, fg, up: uc.up });
      }
    }
  }
  if (!candidates.length) { const r = recommend(setup, game, { ...opts, locks: {}, prefs: {} }); return { ...r, lockConflict: true }; }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const anyMeets = candidates.some((c) => c.meets);
  // Resolution fallback if nothing meets
  let resFallback = null;
  if (!anyMeets && !competitive && !opts._noFallback) {
    const lower = [[2560, 1440], [1920, 1080], [1600, 900], [1280, 720]].filter(([lw]) => lw < w);
    for (const [lw, lh] of lower) {
      const r = recommend(setup, game, { ...opts, w: lw, h: lh, _noFallback: true, _tier: true });
      if (r.best.meets) { resFallback = { w: lw, h: lh, est: r.best.est }; break; }
    }
  }
  // Goal unreachable: drop to the highest smooth fps tier this hardware can hold, then maximize visuals there.
  if (!anyMeets && !competitive && !opts._tier) {
    const tiers = [144, 120, 100, 90, 75, 60, 50, 45, 40, 30].filter((t) => t < target && (mon.vrr ? t >= 40 || t === 30 : mon.hz % t === 0));
    for (const t of tiers) {
      const r = recommend(setup, game, { ...opts, mode: 'quality', targetFps: t, w, h, _tier: true });
      if (r.anyMeets) return { ...r, mode, tierFallback: { from: target, to: t }, resFallback };
    }
  }
  return { target, lowsTarget, mode, w, h, best, candidates: candidates.slice(0, 12), anyMeets, resFallback, frameCap: frameCapAdvice(setup, best.est, mon, game, competitive) };
}

export function frameCapAdvice(setup, est, mon, game, competitive) {
  const gpu = resolveGpu(setup);
  const out = [];
  const reflex = gpu.vendor === 'NVIDIA' ? 'NVIDIA Reflex (On + Boost)' : gpu.vendor === 'AMD' ? 'Radeon Anti-Lag 2' : 'Intel XeLL';
  if (mon.vrr) {
    const cap = mon.hz - Math.max(3, Math.round(mon.hz * 0.03));
    if (est.fps > mon.hz) out.push(`VRR is on: cap at ${cap} fps (${reflex} does this automatically when supported) so you stay inside the VRR window with V-Sync on in the driver and off in-game.`);
    else out.push(`VRR is on and you are under ${mon.hz} fps: no cap needed. Enable ${reflex}.`);
    if (competitive && est.fps > mon.hz * 1.5) out.push(`Competitive: you can instead run uncapped at ~${Math.round(est.fps)} fps with V-Sync off for the lowest input latency, at the cost of tearing.`);
  } else {
    if (est.fps >= mon.hz) out.push(`No VRR: cap at ${mon.hz} fps with V-Sync on, or use ${reflex} with an in-game cap of ${mon.hz - 1} to reduce tearing.`);
    else { const div = [120, 90, 72, 60, 48, 40, 30].find((d) => d <= est.lows && mon.hz % d === 0) || Math.floor(est.lows); out.push(`No VRR and below refresh: cap at ${div} fps (an integer divisor of ${mon.hz}) for even frame pacing.`); }
  }
  if (game.cap) out.push(`Engine cap: ${game.cap} fps.`);
  return out;
}

// Calibrate: measured fps at known config
export function calibrate(setup, game, config, measuredFps) {
  const clean = { ...setup, calibration: null };
  const e = estimate(clean, game, config);
  const ratio = measuredFps / e.fps;
  let gf = 1, cf = 1;
  if (e.bottleneck === 'GPU') gf = ratio; else if (e.bottleneck === 'CPU') cf = ratio; else { gf = Math.sqrt(ratio); cf = Math.sqrt(ratio); }
  const clamp = (x) => Math.max(0.5, Math.min(1.6, x));
  const prev = setup.calibration;
  if (prev && prev.n) {
    const n = prev.n;
    gf = Math.exp((Math.log(prev.gpu) * n + Math.log(clamp(gf * (gf === 1 ? 1 : 1)))) / (n + 1));
    cf = Math.exp((Math.log(prev.cpu) * n + Math.log(clamp(cf))) / (n + 1));
    return { gpu: gf, cpu: cf, n: n + 1, predicted: e.fps, measured: measuredFps, bottleneck: e.bottleneck };
  }
  return { gpu: clamp(gf), cpu: clamp(cf), n: 1, predicted: e.fps, measured: measuredFps, bottleneck: e.bottleneck };
}
