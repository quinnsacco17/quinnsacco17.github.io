import { GPUS } from './engine/data/gpus.js';
import { CPUS } from './engine/data/cpus.js';
import { GAMES, GAME_BY_ID } from './engine/data/games.js';
import { DEVICES, DEVICE_BY_ID } from './engine/data/devices.js';
import { LINKS, COMMON_RES, REFRESH } from './engine/data/displays.js';
import { PCIE, STORAGE, NETWORK, USB_HUB, MOUSE_CONN, CONTROLLER_CONN, AUDIO_CONN, LAPTOP_GPU_MODE } from './engine/data/connections.js';
import { estimate, systemFactors, displayChecks, resolveGpu, resolveCpu, availableUpscalers, UPSCALE_MODES } from './engine/estimator.js';
import { recommend, TARGET_MODES, baseConfig, calibrate } from './engine/recommender.js';
import { renderPreview, SETTING_EXPLAIN } from './preview.js';
import { matchHardware } from './engine/match.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => k === 'class' ? e.className = v : k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v)); kids.flat().forEach((k) => e.append(k)); return e; };
const fmt = (n) => Math.round(n).toLocaleString();
const isDesktopApp = !!window.optimizer;

let setup = loadSetup();
let lastRec = null;

function defaultSetup() {
  return { device: '', cpu: '', gpu: '', ramGB: 16, ramChannels: 2, ramType: 'DDR5-6000', storage: 'nvme4', pcie: 'pcie4x16', form: 'desktop', laptopMode: 'mux', onBattery: false, psuW: '', cooling: 'good', igpuVramGB: 4,
    monitors: [{ w: 1920, h: 1080, hz: 144, vrr: true, vrrType: 'freesync', hdr: false, link: 'DP1.4', dsc: true, video: false }],
    peripherals: { mouseConn: 'wired', mousePolling: 1000, mouseOnHub: false, controllerConn: '', audioConn: 'motherboard', hubGen: 'none', hubDevices: 0, webcamOnHub: false, audioInterface: false, audioOnHub: false, captureCard: false, vrHeadset: false },
    network: 'eth1', background: { discordOverlay: true, browserVideo: false, rgbSoftware: false, streaming: '' }, calibration: null };
}
function loadSetup() { try { const s = JSON.parse(localStorage.getItem('setup') || 'null'); return s ? { ...defaultSetup(), ...s } : defaultSetup(); } catch { return defaultSetup(); } }
function saveSetup() { localStorage.setItem('setup', JSON.stringify(setup)); }

// Build the setup object the engine consumes (device presets + connection multipliers folded in)
export function engineSetup(s = setup) {
  const e = { ...s, peripherals: { ...s.peripherals }, background: { ...s.background } };
  const d = s.device ? DEVICE_BY_ID[s.device] : null;
  if (d) {
    if (d.cpuIdx) e.cpuIdxOverride = d.cpuIdx; if (d.gpuIdx) e.gpuIdxOverride = d.gpuIdx;
    if (d.gpuBonus) e.gpuBonus = d.gpuBonus; if (d.cpuBonus) e.cpuBonus = d.cpuBonus;
    if (d.powerModes) e.powerMode = d.powerModes[s.powerModeIdx ?? d.defaultPower] || d.powerModes[d.defaultPower];
  }
  if (s.cpuIdx) e.cpuIdxOverride = +s.cpuIdx; if (s.gpuIdx) e.gpuIdxOverride = +s.gpuIdx; if (s.vram) e.vramOverride = +s.vram; if (s.cpuCores) e.cpuCores = +s.cpuCores;
  const pc = PCIE.find((p) => p.id === s.pcie); if (pc) e.gpuBonus = (e.gpuBonus || 1) * pc.gpu;
  if (s.form === 'laptop') e.laptopMux = s.laptopMode === 'optimus' ? 'optimus' : null;
  const st = STORAGE.find((x) => x.id === s.storage); e.storage = st && st.id === 'hdd' ? 'hdd' : s.storage;
  e.psuW = s.form === 'desktop' && s.psuW ? +s.psuW : null;
  e.igpuVramGB = +s.igpuVramGB || 4;
  e.peripherals.mousePolling = +s.peripherals.mousePolling;
  return e;
}

/* ---------- Setup tab ---------- */
function fillSelect(sel, items, val, labelFn = (x) => x.name, valFn = (x) => x.id) { sel.innerHTML = ''; items.forEach((it) => sel.append(el('option', { value: valFn(it) }, labelFn(it)))); if (val != null) sel.value = val; }
function initSetup() {
  $('cpuList').append(...CPUS.map((c) => el('option', { value: c.name })));
  $('gpuList').append(...GPUS.map((g) => el('option', { value: g.name })));
  const dev = $('device'); DEVICES.forEach((d) => dev.append(el('option', { value: d.id }, `${d.name}`)));
  fillSelect($('pcie'), PCIE, setup.pcie); fillSelect($('storage'), STORAGE, setup.storage); fillSelect($('network'), NETWORK, setup.network);
  fillSelect($('laptopMode'), LAPTOP_GPU_MODE, setup.laptopMode); fillSelect($('mouseConn'), MOUSE_CONN, setup.peripherals.mouseConn); fillSelect($('audioConn'), AUDIO_CONN, setup.peripherals.audioConn); fillSelect($('hubGen'), USB_HUB, setup.peripherals.hubGen);
  const cc = $('controllerConn'); CONTROLLER_CONN.forEach((c) => cc.append(el('option', { value: c.id }, c.name)));
  bindSetupFields(); renderMonitors(); applyDevice(false); refreshSetupWarnings();
  $('addMonitor').onclick = () => { setup.monitors.push({ w: 1920, h: 1080, hz: 60, vrr: false, hdr: false, link: 'HDMI2.0', dsc: false, video: true }); renderMonitors(); saveSetup(); refreshSetupWarnings(); };
}
const simpleFields = ['cpu', 'gpu', 'cpuIdx', 'cpuCores', 'gpuIdx', 'vram', 'igpuVram', 'pcie', 'ramGB', 'ramChannels', 'ramType', 'storage', 'form', 'laptopMode', 'onBattery', 'psuW', 'cooling', 'network'];
const periFields = ['mouseConn', 'mousePolling', 'mouseOnHub', 'controllerConn', 'audioConn', 'hubGen', 'hubDevices', 'webcamOnHub', 'audioInterface', 'audioOnHub', 'captureCard', 'vrHeadset'];
const bgFields = ['discordOverlay', 'browserVideo', 'rgbSoftware', 'streaming'];
const keyMap = { igpuVram: 'igpuVramGB' };
function readField(id) { const e = $(id); return e.type === 'checkbox' ? e.checked : e.value; }
function writeField(id, v) { const e = $(id); if (!e) return; if (e.type === 'checkbox') e.checked = !!v; else e.value = v ?? ''; }
function bindSetupFields() {
  simpleFields.forEach((id) => { writeField(id, setup[keyMap[id] || id]); $(id).addEventListener('change', () => { setup[keyMap[id] || id] = readField(id); saveSetup(); refreshSetupWarnings(); }); });
  periFields.forEach((id) => { writeField(id, setup.peripherals[id]); $(id).addEventListener('change', () => { setup.peripherals[id] = readField(id); saveSetup(); refreshSetupWarnings(); }); });
  bgFields.forEach((id) => { writeField(id, setup.background[id]); $(id).addEventListener('change', () => { setup.background[id] = readField(id); saveSetup(); refreshSetupWarnings(); }); });
  $('device').value = setup.device || '';
  $('device').addEventListener('change', () => { setup.device = $('device').value; applyDevice(true); saveSetup(); refreshSetupWarnings(); });
  $('powerMode').addEventListener('change', () => { setup.powerModeIdx = +$('powerMode').value; saveSetup(); refreshSetupWarnings(); });
}
function applyDevice(fill) {
  const d = setup.device ? DEVICE_BY_ID[setup.device] : null;
  $('powerModeWrap').hidden = !(d && d.powerModes);
  $('deviceNotes').innerHTML = '';
  if (!d) return;
  if (d.powerModes) { fillSelect($('powerMode'), d.powerModes.map((p, i) => ({ id: i, name: p.name })), setup.powerModeIdx ?? d.defaultPower); }
  (d.notes || []).forEach((n) => $('deviceNotes').append(el('div', {}, '• ' + n)));
  if (fill) {
    Object.assign(setup, { cpu: d.cpu, gpu: d.gpu, ramGB: d.ramGB, ramChannels: d.ramChannels, ramType: d.ramType, storage: d.storage === 'nvme' ? 'nvme4' : d.storage, form: d.type === 'console' ? 'desktop' : d.type, psuW: d.psuW || '', cpuIdx: '', gpuIdx: '', vram: '', powerModeIdx: d.defaultPower, igpuVramGB: d.type === 'handheld' ? 6 : 4 });
    if (d.display) setup.monitors = [{ ...d.display, link: 'internal', dsc: true, video: false, vrrType: 'freesync' }, ...setup.monitors.filter((m) => !m.builtin)];
    simpleFields.forEach((id) => writeField(id, setup[keyMap[id] || id])); renderMonitors();
  }
}
function renderMonitors() {
  const wrap = $('monitors'); wrap.innerHTML = '';
  setup.monitors.forEach((m, i) => {
    const resSel = el('select'); COMMON_RES.forEach((r) => resSel.append(el('option', { value: `${r.w}x${r.h}` }, r.label))); if (![...resSel.options].some((o) => o.value === `${m.w}x${m.h}`)) resSel.append(el('option', { value: `${m.w}x${m.h}` }, `${m.w}x${m.h}`)); resSel.value = `${m.w}x${m.h}`;
    resSel.onchange = () => { const [w, h] = resSel.value.split('x').map(Number); m.w = w; m.h = h; saveSetup(); refreshSetupWarnings(); fillRes(); };
    const hz = el('select'); REFRESH.forEach((r) => hz.append(el('option', { value: r }, r + ' Hz'))); if (!REFRESH.includes(m.hz)) hz.append(el('option', { value: m.hz }, m.hz + ' Hz')); hz.value = m.hz; hz.onchange = () => { m.hz = +hz.value; saveSetup(); refreshSetupWarnings(); };
    const link = el('select'); link.append(el('option', { value: 'internal' }, 'Built-in panel (laptop/handheld)')); Object.entries(LINKS).forEach(([k, v]) => link.append(el('option', { value: k }, v.label))); link.value = m.link || 'DP1.4'; link.onchange = () => { m.link = link.value; saveSetup(); refreshSetupWarnings(); };
    const vrr = el('select'); [['none', 'No VRR'], ['freesync', 'FreeSync / Adaptive-Sync'], ['gsync', 'G-SYNC (module)'], ['gsync-compat', 'G-SYNC Compatible']].forEach(([v, l]) => vrr.append(el('option', { value: v }, l))); vrr.value = m.vrr ? (m.vrrType || 'freesync') : 'none'; vrr.onchange = () => { m.vrr = vrr.value !== 'none'; m.vrrType = vrr.value; saveSetup(); refreshSetupWarnings(); };
    const hdr = el('input', { type: 'checkbox' }); hdr.checked = !!m.hdr; hdr.onchange = () => { m.hdr = hdr.checked; saveSetup(); refreshSetupWarnings(); };
    const dsc = el('input', { type: 'checkbox' }); dsc.checked = m.dsc !== false; dsc.onchange = () => { m.dsc = dsc.checked; saveSetup(); refreshSetupWarnings(); };
    const video = el('input', { type: 'checkbox' }); video.checked = !!m.video; video.onchange = () => { m.video = video.checked; saveSetup(); refreshSetupWarnings(); };
    const row = el('div', { class: 'monitor' }, el('strong', {}, i === 0 ? 'Game monitor' : `Monitor ${i + 1}`), el('label', {}, 'Resolution', resSel), el('label', {}, 'Refresh', hz), el('label', {}, 'Connection', link), el('label', {}, 'VRR', vrr), el('label', { class: 'chk' }, hdr, ' HDR'), el('label', { class: 'chk' }, dsc, ' DSC capable'));
    if (i > 0) row.append(el('label', { class: 'chk' }, video, ' Video playing on it'), el('button', { class: 'small', onclick: () => { setup.monitors.splice(i, 1); renderMonitors(); saveSetup(); refreshSetupWarnings(); } }, 'Remove'));
    wrap.append(row);
  });
}
function refreshSetupWarnings() {
  const es = engineSetup(); const f = systemFactors(es); const dc = displayChecks(es);
  const gpu = resolveGpu(es), cpu = resolveCpu(es);
  const w = $('setupWarnings'); w.innerHTML = '';
  w.append(el('div', { class: 'info' }, `Using GPU "${gpu.name}" (index ${gpu.idx}, ${gpu.vram} GB) and CPU "${cpu.name}" (index ${cpu.idx}). Effective after your setup: GPU x${f.gpu.toFixed(2)}, CPU x${f.cpu.toFixed(2)}.`));
  if (!GPUS.some((g) => g.name === es.gpu) && !es.gpuIdxOverride) w.append(el('div', {}, 'GPU not in database: enter a custom GPU index (4090 = 100) or pick the closest card. TechPowerUp relative performance charts give this number directly.'));
  if (!CPUS.some((c) => c.name === es.cpu) && !es.cpuIdxOverride) w.append(el('div', {}, 'CPU not in database: enter a custom gaming index (9800X3D = 100) or pick the closest chip.'));
  f.warnings.forEach((t) => w.append(el('div', {}, t))); dc.forEach((d) => w.append(el('div', { class: d.level === 'info' ? 'info' : '' }, d.text))); f.notes.forEach((t) => w.append(el('div', { class: 'info' }, t)));
  [...PCIE, ...STORAGE, ...NETWORK, ...MOUSE_CONN, ...CONTROLLER_CONN, ...AUDIO_CONN, ...LAPTOP_GPU_MODE].forEach((c) => { const chosen = [setup.pcie, setup.storage, setup.network, setup.peripherals.mouseConn, setup.peripherals.controllerConn, setup.peripherals.audioConn, setup.form === 'laptop' ? setup.laptopMode : null]; if (c.note && chosen.includes(c.id)) w.append(el('div', { class: 'info' }, c.note)); });
}

/* ---------- Games tab ---------- */
function fillRes() {
  const mon = setup.monitors[0]; const sel = $('res'); const cur = sel.value; sel.innerHTML = '';
  sel.append(el('option', { value: `${mon.w}x${mon.h}` }, `Monitor native ${mon.w}x${mon.h}`));
  COMMON_RES.filter((r) => r.w * r.h < mon.w * mon.h).reverse().forEach((r) => sel.append(el('option', { value: `${r.w}x${r.h}` }, r.label)));
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  const cr = $('calRes'); cr.innerHTML = ''; COMMON_RES.forEach((r) => cr.append(el('option', { value: `${r.w}x${r.h}` }, r.label))); cr.value = `${mon.w}x${mon.h}`;
}
function initGames() {
  const gs = $('game'); GAMES.forEach((g) => gs.append(el('option', { value: g.id }, g.name)));
  fillSelect($('targetMode'), TARGET_MODES, 'refresh'); fillSelect($('ovMode'), TARGET_MODES, 'refresh');
  const cg = $('calGame'); GAMES.forEach((g) => cg.append(el('option', { value: g.id }, g.name)));
  fillRes();
  const upd = () => { const m = TARGET_MODES.find((t) => t.id === $('targetMode').value); $('goalDesc').textContent = m.desc; $('targetFpsWrap').hidden = !(m.id === 'quality' || m.id === 'battery'); if (m.id === 'battery') $('targetFps').value = 45; };
  $('targetMode').addEventListener('change', upd); upd();
  $('btnRecommend').onclick = runRecommend;
  $('btnOverview').onclick = runOverview;
  $('calGame').addEventListener('change', fillCalRt); fillCalRt();
  $('btnCalibrate').onclick = runCalibrate;
  $('btnResetCal').onclick = () => { setup.calibration = null; saveSetup(); $('calResult').textContent = 'Calibration cleared.'; refreshSetupWarnings(); };
}
function fillCalRt() { const g = GAME_BY_ID[$('calGame').value]; const s = $('calRt'); s.innerHTML = ''; (g.rt ? g.rt.modes : [{ name: 'Not available' }]).forEach((m, i) => s.append(el('option', { value: i }, m.name))); }

function runRecommend() {
  const game = GAME_BY_ID[$('game').value]; const es = engineSetup();
  const [w, h] = $('res').value.split('x').map(Number);
  const rec = recommend(es, game, { mode: $('targetMode').value, targetFps: +$('targetFps').value, w, h });
  lastRec = { rec, game, es };
  renderResult(rec, game, es);
}
function kpi(l, v, cls = '') { return el('div', { class: 'kpi ' + cls }, el('div', { class: 'v' }, v), el('div', { class: 'l' }, l)); }
function renderResult(rec, game, es) {
  const r = $('result'); r.innerHTML = '';
  const b = rec.best, e = b.est, gpu = e.gpu;
  const meetsCls = b.meets ? 'ok' : e.fps >= rec.target * 0.85 ? 'warn' : 'bad';
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, `${game.name} at ${rec.w}x${rec.h} · goal ${fmt(rec.target)} fps`));
  card.append(el('div', { class: 'kpis' }, kpi('Predicted average', `${fmt(e.fps)} fps`, meetsCls), kpi('Likely range', `${fmt(e.range[0])}-${fmt(e.range[1])}`), kpi('1% lows (est.)', `${fmt(e.lows)} fps`, e.lows >= rec.lowsTarget ? 'ok' : 'warn'), kpi('Bottleneck', e.bottleneck), kpi('VRAM needed', `${e.vram.toFixed(1)} / ${e.vramAvail} GB`, e.vramOver ? 'bad' : 'ok'), kpi('Visual score', `${b.vis.toFixed(1)} / 10`)));
  if (!b.meets) {
    const msg = el('div', { class: 'warnings' });
    msg.append(el('div', {}, `This hardware cannot hold ${fmt(rec.target)} fps in ${game.name} at ${rec.w}x${rec.h} even at minimum settings${rec.resFallback ? '' : ' or lower resolutions'}. Shown: the fastest configuration that still looks acceptable.`));
    if (rec.resFallback) msg.append(el('div', { class: 'info' }, `Dropping to ${rec.resFallback.w}x${rec.resFallback.h} reaches ~${fmt(rec.resFallback.est.fps)} fps. Change "Render resolution" above to see those settings.`));
    card.append(msg);
  }
  if (e.capped) card.append(el('div', { class: 'notes' }, `Engine cap of ${game.cap} fps reached; headroom is spent on visuals.`));
  const pills = el('div', {}, el('span', { class: 'pill' }, `Upscaler: ${b.up ? `${b.up.name} ${UPSCALE_MODES.find((m) => m.id === b.cfg.mode).name}` : 'Off (native)'}`), el('span', { class: 'pill' }, `Frame gen: ${b.fg.name}`), game.rt ? el('span', { class: 'pill' }, `Ray tracing: ${game.rt.modes[b.cfg.rtIndex].name}`) : '', el('span', { class: 'pill' }, `${gpu.vendor === 'NVIDIA' ? 'Reflex' : gpu.vendor === 'AMD' ? 'Anti-Lag 2' : 'XeLL'}: On`));
  card.append(pills);
  if (e.fgNote) card.append(el('div', { class: 'warnings' }, el('div', {}, e.fgNote)));
  // settings + preview
  const grid = el('div', { class: 'settings-grid' });
  const tbl = el('table'); tbl.append(el('tr', {}, el('th', {}, 'Setting'), el('th', {}, 'Use'), el('th', {}, 'What you will notice')));
  const live = { ...b.cfg, settings: [...b.cfg.settings] };
  const canvas = el('canvas', { id: 'preview', width: 640, height: 360 });
  const redraw = () => { const st = {}; game.settings.forEach((s, i) => { st[s.key] = live.settings[i]; }); st.rt = live.rtIndex; st.upscale = UPSCALE_MODES.find((m) => m.id === live.mode).scale; st.upTech = b.up?.tech; renderPreview(canvas, st); const e2 = estimate(es, game, live); liveFps.textContent = `Live estimate with your tweaks: ${fmt(e2.fps)} fps avg, ${fmt(e2.lows)} lows, VRAM ${e2.vram.toFixed(1)} GB`; };
  game.settings.forEach((s, i) => {
    const sel = el('select'); s.options.forEach((o, j) => sel.append(el('option', { value: j }, o))); sel.value = live.settings[i];
    sel.onchange = () => { live.settings[i] = +sel.value; redraw(); explain.textContent = (SETTING_EXPLAIN[s.key] || [])[live.settings[i]] || ''; };
    const explain = el('td', {}, (SETTING_EXPLAIN[s.key] || [])[live.settings[i]] || '');
    tbl.append(el('tr', {}, el('td', {}, s.name), el('td', {}, sel), explain));
  });
  if (game.rt) { const sel = el('select'); game.rt.modes.forEach((m, j) => sel.append(el('option', { value: j }, m.name))); sel.value = live.rtIndex; sel.onchange = () => { live.rtIndex = +sel.value; redraw(); }; tbl.append(el('tr', {}, el('td', {}, 'Ray Tracing'), el('td', {}, sel), el('td', {}, 'RT shadows/reflections/GI are physically accurate but cost 30-70% fps; path tracing 3x.'))); }
  { const sel = el('select'); UPSCALE_MODES.forEach((m) => { if (m.id === 'native' || b.up) sel.append(el('option', { value: m.id }, m.name)); }); sel.value = live.mode; sel.onchange = () => { live.mode = sel.value; redraw(); }; tbl.append(el('tr', {}, el('td', {}, `Upscaling${b.up ? ` (${b.up.name})` : ''}`), el('td', {}, sel), el('td', {}, b.up ? 'Quality mode is near-free visually on DLSS 4 / FSR 4; FSR 3 below Quality gets shimmery.' : 'No upscaler available for this GPU/game combination.'))); }
  const liveFps = el('div', { class: 'notes' });
  grid.append(el('div', {}, tbl, liveFps), el('div', {}, canvas, el('div', { class: 'notes' }, 'Preview reacts to the dropdowns on the left. It shows the kind of difference each setting makes, not the actual game.')));
  card.append(grid); redraw();
  // frame cap + tips + warnings
  const adv = el('div', { class: 'notes' }); rec.frameCap.forEach((t) => adv.append(el('div', {}, '• ' + t))); game.tips.forEach((t) => adv.append(el('div', {}, '• ' + t)));
  if (b.log.length) adv.append(el('div', {}, `Reduced from max: ${b.log.join('; ')}`));
  card.append(el('h2', {}, 'Frame cap, sync, and game-specific notes'), adv);
  const f = e.factors; if (f.warnings.length) { const w = el('div', { class: 'warnings' }); f.warnings.forEach((t) => w.append(el('div', {}, t))); card.append(el('h2', {}, 'Setup issues affecting this result'), w); }
  // apply / copy
  const actions = el('div', { class: 'row' });
  actions.append(el('button', { onclick: () => copyText(settingsText(game, live, b, e, rec)) }, 'Copy settings list'));
  if (isDesktopApp) actions.append(el('button', { class: 'primary', onclick: () => applyToGame(game, live, b, rec) }, 'Apply to game (writes config file)'));
  else actions.append(el('span', { class: 'notes' }, 'Auto-apply to the game is available in the Windows app build.'));
  card.append(el('h2', {}, 'Apply'), actions);
  // alternatives
  const alt = el('table'); alt.append(el('tr', {}, el('th', {}, 'Alternative'), el('th', {}, 'Avg fps'), el('th', {}, 'Lows'), el('th', {}, 'Visual'), el('th', {}, 'Meets goal')));
  rec.candidates.slice(0, 8).forEach((c) => { const row = el('tr', { class: 'alt', onclick: () => { rec.best = c; renderResult(rec, game, es); } }, el('td', {}, `${c.up ? c.up.name + ' ' + UPSCALE_MODES.find((m) => m.id === c.cfg.mode).name : 'Native'} · FG ${c.fg.name} · RT ${game.rt ? game.rt.modes[c.cfg.rtIndex].name : 'n/a'} · ${c.log.length ? c.log.length + ' settings reduced' : 'all max'}`), el('td', {}, fmt(c.est.fps)), el('td', {}, fmt(c.est.lows)), el('td', {}, c.vis.toFixed(1)), el('td', {}, c.meets ? '✓' : '—')); alt.append(row); });
  card.append(el('h2', {}, 'Other viable configurations (click to inspect)'), alt);
  r.append(card);
}
function settingsText(game, cfg, b, e, rec) {
  const lines = [`${game.name} — ${rec.w}x${rec.h} — predicted ${fmt(e.fps)} fps (lows ${fmt(e.lows)})`];
  game.settings.forEach((s, i) => lines.push(`${s.name}: ${s.options[cfg.settings[i]]}`));
  if (game.rt) lines.push(`Ray Tracing: ${game.rt.modes[cfg.rtIndex].name}`);
  lines.push(`Upscaling: ${b.up ? b.up.name + ' ' + UPSCALE_MODES.find((m) => m.id === cfg.mode).name : 'Off'}`, `Frame Generation: ${b.fg.name}`, ...rec.frameCap);
  return lines.join('\n');
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); alert('Copied.'); } catch { prompt('Copy:', t); } }
async function applyToGame(game, cfg, b, rec) {
  const values = { settings: {}, rt: game.rt ? cfg.rtIndex : null, upscaler: b.up?.id || null, mode: cfg.mode, fg: cfg.fg, w: rec.w, h: rec.h, hz: setup.monitors[0].hz };
  game.settings.forEach((s, i) => { values.settings[s.key] = cfg.settings[i]; });
  const res = await window.optimizer.applySettings(game.id, values);
  alert(res.ok ? `Applied. ${res.written} value(s) written to\n${res.path}\nBackup: ${res.backup}${res.skipped?.length ? '\nNot mapped (set manually): ' + res.skipped.join(', ') : ''}` : `Could not apply: ${res.error}`);
}

/* ---------- Overview ---------- */
function runOverview() {
  const es = engineSetup(); const mode = $('ovMode').value; const mon = setup.monitors[0];
  const wrap = $('overview'); wrap.innerHTML = '';
  const t = el('table'); t.append(el('tr', {}, el('th', {}, 'Game'), el('th', {}, 'Max settings, native'), el('th', {}, 'Recommended config'), el('th', {}, 'Recommended fps'), el('th', {}, 'Lows'), el('th', {}, 'Bottleneck'), el('th', {}, 'Meets goal')));
  GAMES.filter((g) => g.id !== 'generic').forEach((g) => {
    const ultra = estimate(es, g, baseConfig(g, mon.w, mon.h));
    const r = recommend(es, g, { mode, targetFps: +$('targetFps').value, w: mon.w, h: mon.h });
    const b = r.best;
    t.append(el('tr', { class: 'alt', onclick: () => { $('game').value = g.id; $('targetMode').value = mode; $('targetMode').dispatchEvent(new Event('change')); showTab('games'); runRecommend(); } }, el('td', {}, g.name), el('td', {}, `${fmt(ultra.fps)} fps`), el('td', {}, `${b.log.length ? b.log.length + ' reduced' : 'max'} · ${b.up ? b.up.name + ' ' + b.cfg.mode : 'native'}${b.fg.id !== 'off' ? ' · FG' : ''}${g.rt && b.cfg.rtIndex ? ' · RT' : ''}`), el('td', {}, fmt(b.est.fps)), el('td', {}, fmt(b.est.lows)), el('td', {}, b.est.bottleneck), el('td', {}, b.meets ? '✓' : `✗ (goal ${fmt(r.target)})`)));
  });
  wrap.append(el('div', { class: 'card' }, t));
}

/* ---------- Calibration ---------- */
function runCalibrate() {
  const game = GAME_BY_ID[$('calGame').value]; const es = engineSetup();
  const [w, h] = $('calRes').value.split('x').map(Number); const preset = +$('calPreset').value;
  const gpu = resolveGpu(es); const ups = availableUpscalers(gpu, game);
  const cfg = { settings: game.settings.map((s) => Math.min(preset, s.defaultIndex ?? s.options.length - 1)), rtIndex: game.rt ? +$('calRt').value : 0, upscaler: $('calUp').value !== 'native' && ups[0] ? ups[0] : null, mode: $('calUp').value, fg: $('calFg').value, w, h };
  const fps = +$('calFps').value; if (!fps) return alert('Enter the measured fps.');
  const cal = calibrate(es, game, cfg, fps);
  setup.calibration = cal; saveSetup(); refreshSetupWarnings();
  $('calResult').innerHTML = `Model predicted ${fmt(cal.predicted)} fps (${cal.bottleneck}-bound), you measured ${fmt(cal.measured)}. Correction applied: GPU x${cal.gpu.toFixed(2)}, CPU x${cal.cpu.toFixed(2)} (${cal.n} measurement${cal.n > 1 ? 's' : ''}). ${Math.abs(cal.measured / cal.predicted - 1) > 0.3 ? 'Large gap: double-check the preset/resolution you entered, or your GPU may be thermally or power limited.' : ''}`;
}

/* ---------- Detect ---------- */
async function detect() {
  if (!isDesktopApp) { alert('Hardware detection needs the desktop app (it reads CPU, GPU, RAM, monitors, drives, and USB devices from Windows). In the browser, pick parts manually or choose a device preset.'); return; }
  $('btnDetect').textContent = 'Detecting…';
  try {
    const hw = await window.optimizer.detect();
    const m = matchHardware(hw, { GPUS, CPUS });
    Object.assign(setup, m.setup);
    simpleFields.forEach((id) => writeField(id, setup[keyMap[id] || id])); renderMonitors(); fillRes(); saveSetup(); refreshSetupWarnings();
    alert(`Detected:\n${m.summary.join('\n')}`);
  } catch (e) { alert('Detection failed: ' + e.message); }
  $('btnDetect').textContent = 'Detect my hardware';
}

/* ---------- Shell ---------- */
function showTab(id) { document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id)); document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + id)); }
document.querySelectorAll('nav button').forEach((b) => b.onclick = () => showTab(b.dataset.tab));
$('btnDetect').onclick = detect;
$('btnExport').onclick = () => { const a = el('a', { href: 'data:application/json,' + encodeURIComponent(JSON.stringify(setup, null, 2)), download: 'my-setup.json' }); a.click(); };
$('fileImport').onchange = async (ev) => { const f = ev.target.files[0]; if (!f) return; setup = { ...defaultSetup(), ...JSON.parse(await f.text()) }; saveSetup(); location.reload(); };
initSetup(); initGames();
window.__app = { engineSetup, setup: () => setup, runRecommend };
