import { GPUS } from './engine/data/gpus.js';
import { CPUS } from './engine/data/cpus.js';
import { GAMES, GAME_BY_ID } from './engine/data/games.js';
import { DEVICES, DEVICE_BY_ID } from './engine/data/devices.js';
import { LINKS, COMMON_RES, REFRESH } from './engine/data/displays.js';
import { PCIE, STORAGE, NETWORK, USB_HUB, MOUSE_CONN, CONTROLLER_CONN, AUDIO_CONN, LAPTOP_GPU_MODE, DOCKS, CHARGERS, EGPUS, EGPU_LINKS } from './engine/data/connections.js';
import { estimate, systemFactors, displayChecks, resolveGpu, resolveCpu, availableUpscalers, fgOptions, primaryMonitor, UPSCALE_MODES } from './engine/estimator.js';
import { recommend, TARGET_MODES, baseConfig, calibrate } from './engine/recommender.js';
import { renderPreview, SETTING_EXPLAIN } from './preview.js';
import { matchHardware } from './engine/match.js';
import { buildEngineSetup } from './engine/setup.js';
import { networkAdvice } from './engine/network.js';
import { HELP, helpBlock, measureBlock, pollingTester, runAction } from './assist.js';

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
    playMode: 'handheld', dock: 'none', charger: 'stock', dockEthernet: false, egpu: 'none', egpuGpu: '', egpuLink: 'tb4', egpuInternal: false, network: 'eth1', background: { discordOverlay: true, browserVideo: false, rgbSoftware: false, streaming: '' }, calibration: null, manual: [], autoFields: [], hints: {}, autoDetect: true, systemName: '' };
}
function loadSetup() { try { const s = JSON.parse(localStorage.getItem('setup') || 'null'); return s ? { ...defaultSetup(), ...s } : defaultSetup(); } catch { return defaultSetup(); } }
function saveSetup() { localStorage.setItem('setup', JSON.stringify(setup)); }

// Build the setup object the engine consumes (device presets + connection multipliers folded in)
export function engineSetup(s = setup) { return buildEngineSetup(s); }

/* ---------- Setup tab ---------- */
function fillSelect(sel, items, val, labelFn = (x) => x.name, valFn = (x) => x.id) { sel.innerHTML = ''; items.forEach((it) => sel.append(el('option', { value: valFn(it) }, labelFn(it)))); if (val != null) sel.value = val; }
function initSetup() {
  $('cpuList').append(...CPUS.map((c) => el('option', { value: c.name })));
  $('gpuList').append(...GPUS.map((g) => el('option', { value: g.name })));
  const dev = $('device'); DEVICES.forEach((d) => dev.append(el('option', { value: d.id }, `${d.name}`)));
  fillSelect($('dock'), DOCKS, setup.dock || 'none'); fillSelect($('charger'), CHARGERS, setup.charger || 'stock'); fillSelect($('egpu'), EGPUS, setup.egpu || 'none'); fillSelect($('egpuLink'), EGPU_LINKS, setup.egpuLink || 'tb4');
  fillSelect($('pcie'), PCIE, setup.pcie); fillSelect($('storage'), STORAGE, setup.storage); fillSelect($('network'), NETWORK, setup.network);
  fillSelect($('laptopMode'), LAPTOP_GPU_MODE, setup.laptopMode); fillSelect($('mouseConn'), MOUSE_CONN, setup.peripherals.mouseConn); fillSelect($('audioConn'), AUDIO_CONN, setup.peripherals.audioConn); fillSelect($('hubGen'), USB_HUB, setup.peripherals.hubGen);
  const cc = $('controllerConn'); CONTROLLER_CONN.forEach((c) => cc.append(el('option', { value: c.id }, c.name)));
  bindSetupFields(); renderMonitors(); applyDevice(false); refreshSetupWarnings();
  $('addMonitor').onclick = () => { setup.monitors.push({ w: 1920, h: 1080, hz: 60, vrr: false, hdr: false, link: 'HDMI2.0', dsc: false, video: true }); renderMonitors(); saveSetup(); refreshSetupWarnings(); };
}
const simpleFields = ['playMode', 'dock', 'charger', 'dockEthernet', 'egpu', 'egpuGpu', 'egpuLink', 'egpuInternal', 'cpu', 'gpu', 'cpuIdx', 'cpuCores', 'gpuIdx', 'vram', 'igpuVram', 'pcie', 'ramGB', 'ramChannels', 'ramType', 'storage', 'form', 'laptopMode', 'onBattery', 'psuW', 'cooling', 'network'];
const periFields = ['mouseConn', 'mousePolling', 'mouseOnHub', 'controllerConn', 'audioConn', 'hubGen', 'hubDevices', 'webcamOnHub', 'audioInterface', 'audioOnHub', 'captureCard', 'vrHeadset'];
const bgFields = ['discordOverlay', 'browserVideo', 'rgbSoftware', 'streaming'];
const keyMap = { igpuVram: 'igpuVramGB' };
function readField(id) { const e = $(id); return e.type === 'checkbox' ? e.checked : e.value; }
function writeField(id, v) { const e = $(id); if (!e) return; if (e.type === 'checkbox') e.checked = !!v; else e.value = v ?? ''; }
function bindSetupFields() {
  simpleFields.forEach((id) => { writeField(id, setup[keyMap[id] || id]); $(id).addEventListener('change', () => { setup[keyMap[id] || id] = readField(id); markManual(id); saveSetup(); refreshSetupWarnings(); }); });
  periFields.forEach((id) => { writeField(id, setup.peripherals[id]); $(id).addEventListener('change', () => { setup.peripherals[id] = readField(id); markManual(id); saveSetup(); refreshSetupWarnings(); }); });
  bgFields.forEach((id) => { writeField(id, setup.background[id]); $(id).addEventListener('change', () => { setup.background[id] = readField(id); markManual(id); saveSetup(); refreshSetupWarnings(); }); });
  $('device').value = setup.device || '';
  $('device').addEventListener('change', () => { setup.device = $('device').value; markManual('device'); applyDevice(true); saveSetup(); refreshSetupWarnings(); });
  $('powerMode').addEventListener('change', () => { setup.powerModeIdx = +$('powerMode').value; markManual('powerMode'); saveSetup(); refreshSetupWarnings(); });
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
    if (d.display) setup.monitors = [{ ...d.display, link: 'internal', dsc: true, video: false, vrrType: 'freesync' }, ...setup.monitors.filter((m) => !m.builtin && m.link !== "internal" && (m.model || (m.manual || []).length))];
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
    [[resSel, 'res'], [hz, 'hz'], [link, 'link'], [vrr, 'vrr'], [hdr, 'hdr'], [dsc, 'dsc'], [video, 'video']].forEach(([ctl, k]) => ctl.addEventListener('change', () => { m.manual = [...new Set([...(m.manual || []), k])]; saveSetup(); refreshChips(); }));
    const row = el('div', { class: 'monitor' }, el('strong', {}, (i === 0 ? 'Game monitor' : `Monitor ${i + 1}`) + (m.model ? ` · ${m.model}` : '')), el('label', {}, 'Resolution', resSel), el('label', {}, 'Refresh', hz), el('label', {}, 'Connection', link), el('label', {}, 'VRR', vrr), el('label', { class: 'chk' }, hdr, ' HDR'), el('label', { class: 'chk' }, dsc, ' DSC capable'));
    if (m.model) row.append(el('button', { class: 'small', type: 'button', onclick: () => runAction('monitor-specs', m.model) }, 'Look up specs'));
    if (!m.vrr && !(m.manual || []).includes('vrr') && !m.builtin) row.append(el('span', { class: 'chip check' }, 'Set VRR / HDR'));
    if (i > 0) row.append(el('label', { class: 'chk' }, video, ' Video playing on it'), el('button', { class: 'small', onclick: () => { setup.monitors.splice(i, 1); renderMonitors(); saveSetup(); refreshSetupWarnings(); } }, 'Remove'));
    wrap.append(row);
  });
}
function refreshSetupWarnings() {
  refreshChips();
  const es = engineSetup(); const f = systemFactors(es); const dc = displayChecks(es);
  const gpu = resolveGpu(es), cpu = resolveCpu(es);
  const w = $('setupWarnings'); w.innerHTML = '';
  w.append(el('div', { class: 'info' }, `Using GPU "${gpu.name}" (index ${gpu.idx}, ${gpu.vram} GB) and CPU "${cpu.name}" (index ${cpu.idx}). Effective after your setup: GPU x${f.gpu.toFixed(2)}, CPU x${f.cpu.toFixed(2)}.`));
  if (!GPUS.some((g) => g.name === es.gpu) && !es.gpuIdxOverride) w.append(el('div', {}, 'GPU not in database: enter a custom GPU index (4090 = 100) or pick the closest card. TechPowerUp relative performance charts give this number directly.'));
  if (!CPUS.some((c) => c.name === es.cpu) && !es.cpuIdxOverride) w.append(el('div', {}, 'CPU not in database: enter a custom gaming index (9800X3D = 100) or pick the closest chip.'));
  Object.values(setup.hints || {}).forEach((t) => w.append(el('div', { class: 'info' }, t)));
  f.warnings.forEach((t) => w.append(el('div', {}, t))); dc.forEach((d) => w.append(el('div', { class: d.level === 'info' ? 'info' : '' }, d.text))); f.notes.forEach((t) => w.append(el('div', { class: 'info' }, t)));
  [...PCIE, ...STORAGE, ...NETWORK, ...MOUSE_CONN, ...CONTROLLER_CONN, ...AUDIO_CONN, ...LAPTOP_GPU_MODE].forEach((c) => { const chosen = [setup.pcie, setup.storage, setup.network, setup.peripherals.mouseConn, setup.peripherals.controllerConn, setup.peripherals.audioConn, setup.form === 'laptop' ? setup.laptopMode : null]; if (c.note && chosen.includes(c.id)) w.append(el('div', { class: 'info' }, c.note)); });
}

/* ---------- Games tab ---------- */
function fillRes() {
  const mon = engineSetup().monitors[0] || setup.monitors[0]; const sel = $('res'); const cur = sel.value; sel.innerHTML = '';
  sel.append(el('option', { value: `${mon.w}x${mon.h}` }, `Monitor native ${mon.w}x${mon.h}`));
  COMMON_RES.filter((r) => r.w * r.h < mon.w * mon.h).reverse().forEach((r) => sel.append(el('option', { value: `${r.w}x${r.h}` }, r.label)));
  const key = `${mon.w}x${mon.h}`; if (sel.dataset.mon === key && [...sel.options].some((o) => o.value === cur)) sel.value = cur; sel.dataset.mon = key;
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
  const rec = recommend(es, game, { mode: $('targetMode').value, targetFps: +$('targetFps').value, w, h, prefs: setup.prefs || {}, locks: (setup.locks || {})[game.id] || {} });
  lastRec = { rec, game, es };
  renderResult(rec, game, es);
}
function kpi(l, v, cls = '') { return el('div', { class: 'kpi ' + cls }, el('div', { class: 'v' }, v), el('div', { class: 'l' }, l)); }
function process_isWin() { return window.optimizer?.platform === 'win32'; }
const APPLY_SUPPORTED = ['cyberpunk', 'fortnite', 'rivals', 'finals', 'palworld', 'wukong', 'stalker2', 'oblivion', 'expedition33', 'pubg', 'cs2', 'apex', 'minecraft', 'eldenring', 'ow2'];
function renderResult(rec, game, es) {
  const r = $('result'); r.innerHTML = '';
  $('gamesHome').hidden = true;
  const b = rec.best, e = b.est, gpu = e.gpu;
  const live = { ...b.cfg, settings: [...b.cfg.settings], upscaler: b.up, fg: b.fg.id };
  const locks = (setup.locks ||= {})[game.id] ||= {};
  const ups = availableUpscalers(gpu, game), fgs = fgOptions(gpu, game);
  const upLabel = () => live.upscaler && live.mode !== 'native' ? `${live.upscaler.name} ${UPSCALE_MODES.find((m) => m.id === live.mode).name.replace(/ \(.*\)/, '')}` : 'Off';
  const numEl = el('span', { class: 'num' }, fmt(e.fps)), statusEl = el('div', { class: 'status' }), subEl = el('div', { class: 'hero-sub' });
  const setStatus = (est, edited) => {
    const t = rec.tierFallback ? rec.tierFallback.to : rec.target;
    const st = !edited && rec.tierFallback ? ['warn', `${fmt(rec.tierFallback.from)} fps isn’t reachable here. Tuned for a steady ${fmt(rec.tierFallback.to)} fps instead.`] : est.fps >= t - 0.5 ? ['ok', `Hits your ${fmt(t)} fps goal${edited ? ' with your changes' : ''}`] : est.fps >= t * 0.85 ? ['warn', `Just under your ${fmt(t)} fps goal${edited ? ' with your changes' : ''}`] : ['bad', edited ? `Below your ${fmt(t)} fps goal with your changes` : `Can’t reach ${fmt(t)} fps here. This is the best it can do.`];
    statusEl.className = 'status ' + st[0]; statusEl.textContent = st[1];
    subEl.textContent = `${rec.w}x${rec.h} · Upscaling: ${upLabel()}${live.fg !== 'off' ? ' · Frame generation on' : ''}${game.rt && live.rtIndex ? ' · Ray tracing on' : ''} · 1% lows about ${fmt(est.lows)} fps`;
  };
  let edited = false;
  const update = () => { const est = estimate(es, game, { ...live }); numEl.textContent = fmt(est.fps); setStatus(est, edited); reoptBtn.hidden = !Object.keys(locks).length; clearBtn.hidden = !Object.keys(locks).length; if (typeof redraw === 'function') redraw(); };
  const hero = el('div', { class: 'hero' },
    el('button', { class: 'back', type: 'button', onclick: () => { r.innerHTML = ''; $('gamesHome').hidden = false; } }, '← All games'),
    el('div', { class: 'hero-title' }, game.name),
    el('div', { class: 'hero-fps' }, numEl, el('span', { class: 'unit' }, 'fps average'), (setup.gameCal || {})[game.id] ? el('span', { class: 'gt-badge static' }, 'Calibrated to your device') : ''), statusEl, subEl);
  const actions = el('div', { class: 'hero-actions' });
  const canApply = isDesktopApp && APPLY_SUPPORTED.includes(game.id);
  if (canApply) actions.append(el('button', { class: 'big primary', type: 'button', onclick: () => applyToGame(game, live, { ...b, up: live.upscaler, fg: fgs.find((f) => f.id === live.fg) || b.fg }, rec) }, 'Apply to game'));
  actions.append(el('button', { class: 'big' + (canApply ? '' : ' primary'), type: 'button', onclick: () => copyText(settingsText(game, live, { ...b, up: live.upscaler, fg: fgs.find((f) => f.id === live.fg) || b.fg }, estimate(es, game, live), rec)) }, 'Copy settings'));
  actions.append(el('button', { class: 'big', type: 'button', onclick: () => measureFlow(game, live, es, rec) }, (setup.gameCal || {})[game.id] ? 'Measure again' : (isDesktopApp && process_isWin() ? 'Measure my real fps' : 'Enter my real fps')));
  hero.append(actions);
  if (!canApply) hero.append(el('div', { class: 'notes' }, isDesktopApp ? 'This game stores settings where the app can’t write them. Set these in the game’s menu.' : 'Set these in the game’s menu.'));
  if (rec.lockConflict) hero.append(el('div', { class: 'tip warn' }, 'Your pinned settings couldn’t all be kept together, so pins were ignored for this result.'));
  // Editable settings list
  const reoptBtn = el('button', { class: 'small primary', type: 'button', onclick: () => { saveSetup(); runRecommend(); } }, 'Re-optimize around my pins');
  const clearBtn = el('button', { class: 'small', type: 'button', onclick: () => { setup.locks[game.id] = {}; saveSetup(); runRecommend(); } }, 'Clear pins');
  const list = el('div', { class: 'set-list editable' });
  const addRow = (label, options, value, onChange, lockKey) => {
    const sel = el('select'); options.forEach(([v, t]) => sel.append(el('option', { value: v }, t))); sel.value = value;
    const pin = el('button', { type: 'button', class: 'pin' + (lockKey in locks ? ' on' : ''), title: 'Pin: keep this when re-optimizing' }, lockKey in locks ? 'Pinned' : 'Pin');
    const setPin = (on, v) => { if (on) locks[lockKey] = v; else delete locks[lockKey]; pin.className = 'pin' + (on ? ' on' : ''); pin.textContent = on ? 'Pinned' : 'Pin'; saveSetup(); };
    pin.onclick = () => setPin(!(lockKey in locks), onChange(sel.value, true));
    sel.onchange = () => { edited = true; const v = onChange(sel.value); setPin(true, v); update(); };
    list.append(el('div', { class: 'set-row' }, el('span', {}, label), el('div', { class: 'set-ctl' }, sel, pin)));
  };
  game.settings.forEach((s, i) => addRow(s.name, s.options.map((o, j) => [j, o]), live.settings[i], (v, peek) => { if (!peek) live.settings[i] = +v; return live.settings[i]; }, s.key));
  if (game.rt) addRow('Ray tracing', game.rt.modes.map((m, j) => [j, m.name]), live.rtIndex, (v, peek) => { if (!peek) live.rtIndex = +v; return live.rtIndex; }, 'rt');
  const upOpts = [['native', 'Off (native)']]; ups.forEach((u) => UPSCALE_MODES.forEach((m) => { if (m.id !== 'native' && (m.id !== 'dlaa' || /dlss|fsr4|xessXMX/.test(u.tech))) upOpts.push([`${u.id}:${m.id}`, `${u.name} ${m.name.replace(/ \(.*\)/, '')}`]); }));
  addRow('Upscaling', upOpts, live.upscaler && live.mode !== 'native' ? `${live.upscaler.id}:${live.mode}` : 'native', (v, peek) => { if (!peek) { if (v === 'native') { live.upscaler = null; live.mode = 'native'; } else { const [u, m] = v.split(':'); live.upscaler = ups.find((x) => x.id === u); live.mode = m; } } return live.mode; }, 'mode');
  if (fgs.length > 1) addRow('Frame generation', fgs.map((f) => [f.id, f.name]), live.fg, (v, peek) => { if (!peek) live.fg = v; return live.fg; }, 'fg');
  list.append(el('div', { class: 'set-row' }, el('span', {}, gpu.vendor === 'NVIDIA' ? 'NVIDIA Reflex' : gpu.vendor === 'AMD' ? 'AMD Anti-Lag' : 'Low latency mode'), el('strong', {}, 'On')));
  const listHead = el('div', { class: 'list-head' }, el('span', {}, 'Change anything. The fps updates as you go. Changed settings get pinned.'), reoptBtn, clearBtn);
  const capTip = rec.frameCap[0] ? el('div', { class: 'tip' }, rec.frameCap[0]) : '';
  // Details
  const det = el('details', { class: 'more' }, el('summary', {}, 'More details: preview, alternatives, tips'));
  det.append(el('div', { class: 'kpis' }, kpi('Likely range', `${fmt(e.range[0])}-${fmt(e.range[1])}`), kpi('1% lows', `${fmt(e.lows)} fps`), kpi('Limited by', e.bottleneck), kpi('Video memory', `${e.vram.toFixed(1)} / ${e.vramAvail} GB`, e.vramOver ? 'bad' : '')));
  if (!b.meets && rec.resFallback) det.append(el('div', { class: 'tip' }, `Dropping to ${rec.resFallback.w}x${rec.resFallback.h} reaches about ${fmt(rec.resFallback.est.fps)} fps. Change it under Options on the games screen.`));
  if (e.fgNote) det.append(el('div', { class: 'tip warn' }, e.fgNote));
  const canvas = el('canvas', { id: 'preview', width: 640, height: 360 });
  var redraw = () => { const st = {}; game.settings.forEach((s, i) => { st[s.key] = live.settings[i]; }); st.rt = live.rtIndex; st.upscale = UPSCALE_MODES.find((m) => m.id === live.mode).scale; st.upTech = live.upscaler?.tech; renderPreview(canvas, st); };
  det.append(el('h3', {}, 'Preview'), canvas, el('div', { class: 'notes' }, 'Illustration of what your settings change, not real game footage. It updates when you change a setting above.')); redraw();
  const adv = el('div', { class: 'notes' }); rec.frameCap.slice(1).forEach((t) => adv.append(el('div', {}, '• ' + t))); game.tips.forEach((t) => adv.append(el('div', {}, '• ' + t)));
  if (setup.net && game.competitive) { const na = networkAdvice(setup.net, { network: setup.network }); if (na.online) adv.prepend(el('div', {}, '• Internet: ' + na.online.text)); }
  if (setup.net && setup.background?.streaming) { const na = networkAdvice(setup.net); if (na.streaming) adv.prepend(el('div', {}, '• ' + na.streaming.text)); }
  det.append(el('h3', {}, 'Tips for this game'), adv);
  const f = e.factors; if (f.warnings.length) { const w = el('div', { class: 'warnings' }); f.warnings.forEach((t) => w.append(el('div', {}, t))); det.append(el('h3', {}, 'Things in your setup holding this back'), w); }
  const alt = el('table'); alt.append(el('tr', {}, el('th', {}, 'Other option'), el('th', {}, 'fps'), el('th', {}, 'Looks'), el('th', {}, 'Goal')));
  rec.candidates.slice(0, 6).forEach((c) => alt.append(el('tr', { class: 'alt', onclick: () => { rec.best = c; renderResult(rec, game, es); window.scrollTo(0, 0); } }, el('td', {}, `${c.up ? c.up.name + ' ' + UPSCALE_MODES.find((m) => m.id === c.cfg.mode).name.replace(/ \(.*\)/, '') : 'No upscaling'}${c.fg.id !== 'off' ? ' + frame gen' : ''}${game.rt && c.cfg.rtIndex ? ' + ray tracing' : ''}`), el('td', {}, fmt(c.est.fps)), el('td', {}, c.vis.toFixed(1) + '/10'), el('td', {}, c.meets ? '✓' : '—'))));
  det.append(el('h3', {}, 'Other ways to run it (tap to use)'), alt);
  r.append(el('div', { class: 'result-card' }, hero, capTip, listHead, list, det));
  update(); edited = false; setStatus(estimate(es, game, live), false);
  window.scrollTo(0, 0);
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
    t.append(el('tr', { class: 'alt', onclick: () => { $('game').value = g.id; $('targetMode').value = mode; $('targetMode').dispatchEvent(new Event('change')); showView('games'); runRecommend(); } }, el('td', {}, g.name), el('td', {}, `${fmt(ultra.fps)} fps`), el('td', {}, `${b.log.length ? b.log.length + ' reduced' : 'max'} · ${b.up ? b.up.name + ' ' + b.cfg.mode : 'native'}${b.fg.id !== 'off' ? ' · FG' : ''}${g.rt && b.cfg.rtIndex ? ' · RT' : ''}`), el('td', {}, fmt(b.est.fps)), el('td', {}, fmt(b.est.lows)), el('td', {}, b.est.bottleneck), el('td', {}, b.meets ? '✓' : `✗ (goal ${fmt(r.target)})`)));
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
function markManual(id) { if (!setup.manual.includes(id)) setup.manual.push(id); refreshChips(); }
const AUTO_TARGET = { device: 'device', cpu: 'cpu', gpu: 'gpu', igpuVram: 'igpuVramGB', pcie: 'pcie', ramGB: 'ramGB', ramChannels: 'ramChannels', ramType: 'ramType', storage: 'storage', form: 'form', onBattery: 'onBattery', laptopMode: 'laptopMode', network: 'network' };
function applyDetection(m) {
  const d = m.setup, changes = [];
  const set = (key, obj, prop, val) => { if (setup.manual.includes(key) || val === undefined) return; if (JSON.stringify(obj[prop]) !== JSON.stringify(val)) changes.push(key); obj[prop] = val; };
  setup.systemName = d.systemName || setup.systemName;
  if (d.device && !setup.manual.includes('device') && setup.device !== d.device) { setup.device = d.device; changes.push('device'); applyDevice(true); }
  for (const key of m.auto) {
    if (key === 'device' || key === 'monitors') continue;
    if (AUTO_TARGET[key]) { if (key === 'cpu' || key === 'gpu') { if (setup.device && !setup.manual.includes(key)) continue; } set(key, setup, AUTO_TARGET[key], d[AUTO_TARGET[key]]); }
    else if (key in (d.peripherals || {})) set(key, setup.peripherals, key, d.peripherals[key]);
    else if (key in (d.background || {})) set(key, setup.background, key, d.background[key]);
  }
  if (d.cpuCores && !setup.manual.includes('cpuCores')) setup.cpuCores = d.cpuCores;
  if (d.vram && !setup.manual.includes('vram')) setup.vram = d.vram;
  if (d.monitors && !setup.manual.includes('monitors')) {
    const prev = setup.monitors;
    const next = d.monitors.map((nm, i) => { const pm = prev[i] || {}; const keep = pm.manual || []; const merged = { ...nm, manual: keep };
      for (const k of ['vrr', 'vrrType', 'hdr', 'dsc', 'video']) if (pm[k] !== undefined && (keep.includes(k) || keep.includes(k.replace('Type', '')) || pm.model === nm.model)) merged[k] = pm[k];
      if (keep.includes('link') && pm.link) merged.link = pm.link; if (keep.includes('hz') && pm.hz) merged.hz = pm.hz; if (keep.includes('res')) { merged.w = pm.w; merged.h = pm.h; }
      return merged; });
    if (JSON.stringify(next.map((x) => [x.w, x.h, x.hz, x.model])) !== JSON.stringify(prev.map((x) => [x.w, x.h, x.hz, x.model]))) changes.push('monitors');
    setup.monitors = next;
  }
  setup.autoFields = m.auto; setup.hints = m.hints || {};
  simpleFields.forEach((id) => writeField(id, setup[keyMap[id] || id])); periFields.forEach((id) => writeField(id, setup.peripherals[id])); bgFields.forEach((id) => writeField(id, setup.background[id]));
  $('device').value = setup.device || ''; renderMonitors(); fillRes(); saveSetup(); refreshSetupWarnings();
  return changes;
}
async function detect(quiet = false) {
  if (!isDesktopApp) { alert('Hardware detection needs the desktop app. In the browser, pick parts manually or choose a device preset.'); return; }
  $('btnDetect').textContent = 'Detecting…';
  try {
    const hw = await window.optimizer.detect();
    const m = matchHardware(hw, { GPUS, CPUS, DEVICES });
    const changes = applyDetection(m);
    const b = $('detectBanner'); b.hidden = false;
    b.textContent = quiet ? (changes.length ? `Hardware re-detected on launch. Updated: ${changes.join(', ')}. Your manual entries were kept.` : 'Hardware re-detected on launch. No changes.') : `Detected: ${m.summary.join(' · ')}`;
  } catch (e) { if (!quiet) alert('Detection failed: ' + e.message); }
  $('btnDetect').textContent = 'Detect my hardware';
}

/* ---------- Guidance ---------- */
const CHECKBOX_HELP = ['discordOverlay', 'rgbSoftware', 'browserVideo'];
function fieldStatus(key) {
  if (setup.manual.includes(key)) return 'manual';
  if ((setup.autoFields || []).includes(key)) return 'auto';
  return 'check';
}
function refreshChips() {
  document.querySelectorAll('[data-chip]').forEach((c) => { const st = fieldStatus(c.dataset.chip); c.className = 'chip ' + st; c.textContent = st === 'auto' ? 'Auto' : st === 'manual' ? 'Set by you' : 'Check'; });
  const list = $('checklist'); if (!list) return; list.innerHTML = '';
  const keys = Object.keys(HELP).filter((k) => $(k) || k === 'monitors').filter((k) => k !== 'powerMode' || !$('powerModeWrap').hidden).filter((k) => k !== 'laptopMode' || setup.form === 'laptop').filter((k) => k !== 'igpuVram' || resolveGpu(engineSetup()).family === 'igpu').filter((k) => k !== 'psuW' || setup.form === 'desktop').filter((k) => k !== 'hubDevices' || setup.peripherals.hubGen !== 'none');
  const todo = keys.filter((k) => k === 'monitors' ? setup.monitors.some((m) => !m.builtin && !(m.manual || []).includes('vrr')) : fieldStatus(k) === 'check');
  $('checklistCount').textContent = todo.length ? `${todo.length} item${todo.length > 1 ? 's' : ''} need a quick check` : 'All set';
  todo.forEach((k) => list.append(el('div', { onclick: () => { const t = k === 'monitors' ? $('monitors') : $(k); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); const h = document.querySelector(`details.help[data-for="${k}"]`); if (h) h.open = true; } }, `→ ${labelFor(k)}`)));
}
function labelFor(k) { if (k === 'monitors') return 'Monitors: VRR / HDR / cable'; const lab = $(k)?.closest('label'); return lab ? lab.firstChild.textContent.trim() : k; }
function decorate() {
  const ctx = () => ({ systemName: setup.systemName });
  Object.keys(HELP).forEach((k) => {
    if (k === 'monitors') { const h = helpBlock(k, ctx); h.dataset.for = k; $('monitors').after(h); return; }
    const f = $(k); if (!f) return; const lab = f.closest('label'); if (!lab) return;
    const chip = el('span', { 'data-chip': k }); (lab.firstChild && lab.firstChild.nodeType === 3 ? lab.firstChild.after(chip) : lab.prepend(chip));
    if (CHECKBOX_HELP.includes(k)) { lab.title = [HELP[k].auto, ...HELP[k].steps].join(' '); return; }
    const h = helpBlock(k, ctx, { polling: () => pollingTester((rate) => { setup.peripherals.mousePolling = rate; writeField('mousePolling', rate); markManual('mousePolling'); saveSetup(); refreshSetupWarnings(); }) });
    h.dataset.for = k; lab.after(h);
  });
  $('measureHelp').append(measureBlock());
  refreshChips();
}

/* ---------- Shell ---------- */
function showTab(id) { document.querySelectorAll('.subnav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id)); document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + id)); }
function showView(id) { document.querySelectorAll('.mainnav button').forEach((b) => b.classList.toggle('active', b.dataset.view === id)); document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + id)); if (id === 'setup') renderSummary(); window.scrollTo(0, 0); }
document.querySelectorAll('.subnav button').forEach((b) => b.onclick = () => showTab(b.dataset.tab));
document.querySelectorAll('.mainnav button').forEach((b) => b.onclick = () => showView(b.dataset.view));

function applyMeasurement(game, live, measured, low1, app) {
  const es = engineSetup();
  const predicted = estimate({ ...es, _noGameCal: true, calibration: null }, game, live).fps;
  const cfg = { settings: [...live.settings], rtIndex: live.rtIndex || 0, upscalerTech: live.upscaler && live.mode !== 'native' ? live.upscaler.tech : null, mode: live.upscaler ? live.mode : 'native', fg: live.fg || 'off', w: live.w, h: live.h };
  setup.calibration = calibrate(es, game, { ...cfg, upscaler: cfg.upscalerTech ? { tech: cfg.upscalerTech } : null }, measured);
  (setup.gameCal ||= {})[game.id] = { measured, low1: low1 || null, app: app || null, config: cfg, at: new Date().toISOString(), predicted };
  saveSetup();
  return predicted;
}
function measureFlow(game, live, es, rec) {
  const overlay = el('div', { class: 'modal' }); const card = el('div', { class: 'modal-card' }); overlay.append(card); document.body.append(overlay);
  const close = () => overlay.remove();
  const done = (measured, low1, app) => { const predicted = applyMeasurement(game, live, measured, low1, app); card.innerHTML = ''; card.append(el('h2', {}, 'Got it'), el('p', {}, `Measured ${fmt(measured)} fps${low1 ? ` (1% lows ${fmt(low1)})` : ''}${app ? ` in ${app}` : ''}. The estimate was ${fmt(predicted)}.`), el('p', { class: 'notes' }, `${game.name} now uses your real result, and every other game’s estimate was adjusted for your device.`), el('div', { class: 'row' }, el('button', { class: 'big primary', type: 'button', onclick: () => { close(); runRecommend(); } }, 'See updated settings'))); };
  const manual = el('div', { class: 'row' }); const inp = el('input', { type: 'number', min: 5, max: 1000, placeholder: 'Average fps you saw' });
  manual.append(inp, el('button', { class: 'small', type: 'button', onclick: () => { if (!(+inp.value > 0)) return; done(+inp.value); } }, 'Use this number'));
  const start = el('button', { class: 'big primary', type: 'button' }, 'Start measuring');
  if (!(isDesktopApp && process_isWin())) { card.append(el('h2', {}, `Your real fps in ${game.name}`), el('p', { class: 'notes' }, 'Turn on an fps counter (Steam overlay, NVIDIA Alt+R, AMD Ctrl+Shift+O, or Xbox Game Bar), play 1-2 minutes with the settings on this screen, then enter the average.'), manual, el('div', { class: 'row' }, el('button', { class: 'big', type: 'button', onclick: close }, 'Cancel'))); return; }
  card.append(el('h2', {}, `Measure your real fps in ${game.name}`),
    el('ol', { class: 'steps' }, el('li', {}, 'Set the game to the settings on this screen (or press Apply to game first).'), el('li', {}, 'Start the game and load into normal gameplay, not a menu.'), el('li', {}, 'Come back, press Start, and approve the Windows prompt. Then switch to the game within 10 seconds and play normally for 60 seconds.'), el('li', {}, 'This app comes back on its own when it’s done.')),
    el('div', { class: 'row' }, start, el('button', { class: 'big', type: 'button', onclick: close }, 'Cancel')),
    el('details', { class: 'subtle' }, el('summary', {}, 'Or type the fps you saw from an fps counter'), manual));
  start.onclick = async () => {
    if (!(await window.optimizer.measureAvailable())) { alert('The fps tool is missing from this build. Type the fps instead.'); return; }
    start.disabled = true; let t = 70; start.textContent = 'Switch to the game now…';
    const timer = setInterval(() => { t--; start.textContent = t > 60 ? `Switch to the game now… ${t - 60}` : `Measuring… ${Math.max(0, t)} s left`; }, 1000);
    const r = await window.optimizer.measure({ seconds: 60, lead: 10 });
    clearInterval(timer); start.disabled = false; start.textContent = 'Start measuring';
    if (!r.ok) { alert(r.error); return; }
    done(r.avgFps, r.low1Fps, r.app);
  };
}

/* ---------- Simple games home ---------- */
const GOALS = [
  { id: 'refresh', name: 'Smoothest', desc: 'Match your screen’s refresh rate' },
  { id: 'quality60', name: 'Best looking', desc: 'Max visuals at 60 fps' },
  { id: 'balanced', name: 'Balanced', desc: 'Good looks, good fps' },
  { id: 'competitive', name: 'Competitive', desc: 'Highest fps, lowest lag' },
  { id: 'battery', name: 'Battery life', desc: 'Cap fps, save power', portable: true },
];
function currentGoal() { return setup.goal || 'refresh'; }
function renderModeToggle() {
  const t = $('modeToggle'); t.innerHTML = '';
  t.hidden = !(setup.form !== 'desktop' && setup.playModes === 'both');
  if (t.hidden) return;
  t.append(el('span', { class: 'goal-label' }, 'Playing:'));
  [['handheld', 'Handheld'], ['docked', 'Docked']].forEach(([v, l]) => t.append(el('button', { type: 'button', class: 'chip-btn' + (setup.playMode === v ? ' active' : ''), onclick: () => { setup.playMode = v; writeField('playMode', v); saveSetup(); renderModeToggle(); refreshSetupWarnings(); fillRes(); } }, l)));
}
function renderGoalChips() {
  renderModeToggle();
  const row = $('goalChips'); row.innerHTML = '';
  row.append(el('span', { class: 'goal-label' }, 'Goal:'));
  GOALS.filter((g) => !g.portable || setup.form !== 'desktop').forEach((g) => row.append(el('button', { type: 'button', class: 'chip-btn' + (currentGoal() === g.id ? ' active' : ''), title: g.desc, onclick: () => { setup.goal = g.id; saveSetup(); renderGoalChips(); } }, g.name)));
}
function renderGameGrid() {
  const q = ($('gameSearch').value || '').toLowerCase(); const grid = $('gameGrid'); grid.innerHTML = '';
  GAMES.filter((g) => g.name.toLowerCase().includes(q)).forEach((g) => {
    const short = g.name.replace(/\s*\(.*\)/, '');
    grid.append(el('button', { type: 'button', class: 'game-tile', onclick: () => openGame(g.id) }, el('span', { class: 'gt-initial', style: `background:${tileColor(g.id)}` }, short.replace(/^(The|Marvel's|Call of Duty:)\s*/i, '').slice(0, 1)), el('span', { class: 'gt-name' }, short), APPLY_SUPPORTED.includes(g.id) ? el('span', { class: 'gt-badge' }, 'Auto-apply') : ''));
  });
}
function tileColor(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 38%)`; }
function openGame(id) {
  $('game').value = id; $('targetMode').value = currentGoal();
  if (currentGoal() === 'battery' && !$('targetFps').dataset.touched) $('targetFps').value = 45;
  runRecommend();
}
$('gameSearch').addEventListener('input', renderGameGrid);
$('targetFps').addEventListener('change', () => { $('targetFps').dataset.touched = '1'; });

/* ---------- Setup summary ---------- */
function renderSummary() {
  const es = engineSetup(); const gpu = resolveGpu(es), cpu = resolveCpu(es); const d = setup.device ? DEVICE_BY_ID[setup.device] : null; const es0 = engineSetup(); const mon = primaryMonitor(es0);
  const pm = d && d.powerModes ? d.powerModes[setup.powerModeIdx ?? d.defaultPower] : null;
  const f = systemFactors(es);
  const rows = [['Device', d ? d.name : `Custom ${setup.form}`], ['Processor', cpu.name], ['Graphics', gpu.name], ['Memory', `${setup.ramGB} GB`], ['Game screen', `${mon.model ? mon.model + ', ' : ''}${mon.w}x${mon.h} at ${mon.hz} Hz${mon.linkLimited ? ` (limited from ${mon.linkLimited} Hz by the dock or cable)` : ''}${mon.vrr ? ', VRR on' : ''}`]];
  if (pm) rows.push(['Power mode', pm.name]);
  const portable = setup.form !== 'desktop';
  if (portable) { rows.push(['Plays', setup.playModes === 'both' ? `Handheld and docked (now: ${setup.playMode})` : setup.playMode === 'docked' ? 'Docked' : 'Handheld']); if (setup.dock && setup.dock !== 'none') rows.push(['Dock', DOCKS.find((x) => x.id === setup.dock).name]); rows.push(['Charger', CHARGERS.find((x) => x.id === (setup.charger || 'stock')).name]); }
  if (setup.egpu && setup.egpu !== 'none') rows.push(['External GPU', EGPUS.find((x) => x.id === setup.egpu).name + (setup.egpu === 'custom' ? `: ${setup.egpuGpu}` : '')]);
  rows.push(['Goal', (GOALS.find((g) => g.id === currentGoal()) || GOALS[0]).name], ['Accuracy', setup.calibration ? 'Calibrated (about ±7%)' : 'Not calibrated (about ±15%)']);
  const card = el('div', { class: 'summary-card' }, el('h2', {}, 'My setup'));
  rows.forEach(([k, v]) => card.append(el('div', { class: 'set-row' }, el('span', {}, k), el('strong', {}, v))));
  if (f.warnings.length) { const w = el('div', { class: 'warnings' }); f.warnings.forEach((t) => w.append(el('div', {}, t))); card.append(el('h3', {}, 'Worth fixing'), w); }
  card.append(el('div', { class: 'hero-actions' }, el('button', { class: 'big primary', type: 'button', onclick: () => openWizard() }, 'Run setup again'), el('button', { class: 'big', type: 'button', onclick: () => { $('advancedBox').open = true; showTab('calibrate'); $('advancedBox').scrollIntoView({ behavior: 'smooth' }); } }, setup.calibration ? 'Recalibrate' : 'Improve accuracy')));
  const prefs = (setup.prefs ||= {});
  const pref = (label, key, opts, def) => { const sel = el('select'); opts.forEach(([v, t]) => sel.append(el('option', { value: v }, t))); sel.value = prefs[key] || def; sel.onchange = () => { prefs[key] = sel.value; saveSetup(); }; return el('div', { class: 'set-row' }, el('span', {}, label), sel); };
  const pcard = el('div', { class: 'summary-card' }, el('h2', {}, 'Preferences'), el('div', { class: 'notes' }, 'Applied to every game. Pin individual settings on a game’s result screen.'),
    pref('Frame generation', 'fg', [['allow', 'Allow when it helps'], ['never', 'Never use it']], 'allow'),
    pref('Upscaling', 'upscale', [['allow', 'Allow when it helps'], ['native', 'Native resolution only']], 'allow'),
    pref('Preferred upscaler', 'upscaler', [['auto', 'Pick the best one'], ['dlss', 'DLSS (NVIDIA)'], ['fsr', 'FSR (AMD, works everywhere)'], ['xess', 'XeSS (Intel, works everywhere)']], 'auto'),
    pref('Ray tracing', 'rt', [['auto', 'Use if there’s headroom'], ['prefer', 'Prefer ray tracing on'], ['off', 'Always off']], 'auto'),
    el('div', { class: 'hero-actions' }, el('button', { class: 'small', type: 'button', onclick: () => { if (confirm('Remove every pinned setting in every game?')) { setup.locks = {}; saveSetup(); } } }, 'Clear all pinned settings')));
  $('setupSummary').innerHTML = ''; $('setupSummary').append(card, pcard, netCard());
}

function netCard() {
  const c = el('div', { class: 'summary-card' }, el('h2', {}, 'Internet'));
  const body = el('div');
  const show = () => {
    body.innerHTML = '';
    const n = setup.net;
    if (!n) { body.append(el('div', { class: 'notes' }, isDesktopApp ? 'Test your connection to see how it handles online games, cloud gaming, and streaming.' : 'Enter your speeds from any speed test (e.g. speed.cloudflare.com).')); return; }
    [['Download', `${n.down.toFixed(n.down < 10 ? 1 : 0)} Mbps`], ['Upload', `${n.up.toFixed(n.up < 10 ? 1 : 0)} Mbps`], ['Ping', n.ping != null ? `${Math.round(n.ping)} ms` : '—'], ['Jitter', n.jitter != null ? `${n.jitter.toFixed(1)} ms` : '—'], ['Connection', (NETWORK.find((x) => x.id === setup.network) || {}).name || '—']].forEach(([k, v]) => body.append(el('div', { class: 'set-row' }, el('span', {}, k), el('strong', {}, v))));
    const a = networkAdvice(n, { network: setup.network });
    const tips = el('div', { class: 'net-advice' });
    if (a.online) tips.append(el('div', { class: 'tip' + (/Poor|Bad/.test(a.online.level) ? ' warn' : '') }, a.online.text));
    a.cloud.forEach((x) => tips.append(el('div', { class: 'tip' }, `${x.service}: ${x.text}`)));
    if (a.streaming) tips.append(el('div', { class: 'tip' }, a.streaming.text));
    if (a.download) tips.append(el('div', { class: 'tip' }, a.download));
    a.notes.forEach((t) => tips.append(el('div', { class: 'tip warn' }, t)));
    body.append(tips, el('div', { class: 'notes' }, `Tested ${new Date(n.at).toLocaleString()}.`));
  };
  const actions = el('div', { class: 'hero-actions' });
  if (isDesktopApp) {
    const btn = el('button', { class: 'big primary', type: 'button' }, setup.net ? 'Test again' : 'Test my internet');
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Testing… (about 20 seconds)';
      const r = await window.optimizer.speedTest((p) => { btn.textContent = `Testing ${p.stage}… ${Math.round(p.pct * 100)}%`; });
      btn.disabled = false; btn.textContent = 'Test again';
      if (!r.ok) { alert(r.error); return; }
      setup.net = { down: r.down, up: r.up, ping: r.ping, jitter: r.jitter, at: r.at }; saveSetup(); show();
    };
    actions.append(btn);
  }
  const manual = el('details', { class: 'subtle' }, el('summary', {}, isDesktopApp ? 'Or type your speeds' : 'Enter your speeds'));
  const fd = el('input', { type: 'number', placeholder: 'Download Mbps', min: 0 }), fu = el('input', { type: 'number', placeholder: 'Upload Mbps', min: 0 }), fp = el('input', { type: 'number', placeholder: 'Ping ms', min: 0 });
  manual.append(el('div', { class: 'row' }, fd, fu, fp), el('button', { class: 'small', type: 'button', onclick: () => { if (!+fd.value || !+fu.value) return alert('Enter download and upload.'); setup.net = { down: +fd.value, up: +fu.value, ping: +fp.value || null, jitter: null, at: new Date().toISOString() }; saveSetup(); show(); } }, 'Save'));
  c.append(body, actions, manual); show();
  return c;
}

/* ---------- First-run setup guide ---------- */
const wiz = { step: 'welcome', type: null };
function openWizard() { wiz.step = 'welcome'; $('wizard').hidden = false; document.body.classList.add('wiz-open'); renderWizard(); }
function closeWizard() { setup.onboarded = true; saveSetup(); $('wizard').hidden = true; document.body.classList.remove('wiz-open'); writeAllFields(); renderMonitors(); fillRes(); refreshSetupWarnings(); renderGoalChips(); showView('games'); }
function writeAllFields() { simpleFields.forEach((id) => writeField(id, setup[keyMap[id] || id])); periFields.forEach((id) => writeField(id, setup.peripherals[id])); bgFields.forEach((id) => writeField(id, setup.background[id])); $('device').value = setup.device || ''; applyDevice(false); }
function tiles(items) { const g = el('div', { class: 'wiz-tiles' }); items.forEach(([label, sub, fn]) => g.append(el('button', { type: 'button', class: 'wiz-tile', onclick: fn }, el('strong', {}, label), sub ? el('span', {}, sub) : ''))); return g; }
function wizScreen(title, sub, ...content) {
  const steps = ['welcome', 'device', 'power', 'screen', 'goal'];
  const map = { confirm: 'device', type: 'device', model: 'device', parts: 'device', where: 'power', dock: 'power', charger: 'power', egpu: 'power', egpu2: 'power', screen2: 'screen', done: 'goal' };
  const idx = Math.max(0, steps.indexOf(map[wiz.step] || wiz.step));
  const w = $('wizard'); w.innerHTML = '';
  w.append(el('div', { class: 'wiz-card' },
    el('div', { class: 'wiz-progress' }, ...steps.map((_, i) => el('span', { class: i <= idx ? 'on' : '' }))),
    el('h1', {}, title), sub ? el('p', { class: 'wiz-sub' }, sub) : '', ...content,
    setup.onboarded ? el('button', { type: 'button', class: 'wiz-skip', onclick: closeWizard }, 'Close') : ''));
}
function go(step) { wiz.step = step; renderWizard(); }
async function renderWizard() {
  const s = wiz.step;
  if (s === 'welcome') {
    if (!isDesktopApp) return wizScreen('Let’s set up your device', 'Takes about a minute. Answer a few questions and you’ll get the best settings for every game.', el('button', { type: 'button', class: 'big primary', onclick: () => go('type') }, 'Start'));
    wizScreen('Checking your hardware…', 'This takes a few seconds.', el('div', { class: 'spinner' }));
    await detect(true); return go('confirm');
  }
  if (s === 'confirm') {
    const d = setup.device ? DEVICE_BY_ID[setup.device] : null; const es = engineSetup();
    if (!d && (!CPUS.some((c) => c.name === setup.cpu) || !GPUS.some((g) => g.name === setup.gpu))) return go('type');
    const what = d ? d.name : `A ${setup.form === 'laptop' ? 'laptop' : 'PC'} with ${resolveCpu(es).name} and ${resolveGpu(es).name}`;
    return wizScreen('Is this your device?', null, el('div', { class: 'wiz-found' }, what), el('div', { class: 'wiz-buttons' }, el('button', { type: 'button', class: 'big primary', onclick: () => go(d && d.powerModes || setup.form === 'laptop' ? 'power' : 'screen') }, 'Yes, that’s it'), el('button', { type: 'button', class: 'big', onclick: () => go('type') }, 'No, I’ll pick it')));
  }
  if (s === 'type') return wizScreen('What are you setting up?', null, tiles([
    ['Handheld', 'ROG Ally, Steam Deck, Legion Go, Claw', () => { wiz.type = 'handheld'; go('model'); }],
    ['Laptop', 'Gaming or regular laptop', () => { wiz.type = 'laptop'; go('model'); }],
    ['Desktop', 'Prebuilt or self-built PC', () => { wiz.type = 'desktop'; go('model'); }],
  ]));
  if (s === 'model') {
    const list = DEVICES.filter((d) => d.type === wiz.type);
    return wizScreen('Which one?', wiz.type === 'desktop' ? 'Pick your prebuilt, or choose "Mine isn’t listed" for a custom PC.' : null, tiles([
      ...list.map((d) => [d.name.replace(/\s*\(.*\)$/, ''), (d.name.match(/\((.*)\)$/) || [])[1] || '', () => { setup.device = d.id; markManual('device'); applyDevice(true); saveSetup(); go(d.powerModes || wiz.type === 'laptop' ? 'power' : (wiz.type === 'handheld' ? 'where' : 'screen')); }]),
      ['Mine isn’t listed', 'Enter the processor and graphics card', () => { setup.device = ''; setup.form = wiz.type; markManual('device'); saveSetup(); go('parts'); }],
    ]));
  }
  if (s === 'parts') {
    const cpuIn = el('input', { list: 'cpuList', value: setup.cpu || '', placeholder: 'e.g. Ryzen 7 7800X3D' });
    const gpuIn = el('input', { list: 'gpuList', value: setup.gpu || '', placeholder: 'e.g. RTX 4070' });
    const ram = el('select'); [8, 16, 32, 64].forEach((n) => ram.append(el('option', { value: n }, `${n} GB`))); ram.value = [8, 16, 32, 64].includes(+setup.ramGB) ? setup.ramGB : 16;
    return wizScreen('Your parts', isDesktopApp ? 'Filled in from your hardware. Change anything that’s wrong.' : 'Start typing and pick from the list.',
      el('label', { class: 'wiz-field' }, 'Processor (CPU)', cpuIn), el('label', { class: 'wiz-field' }, 'Graphics card (GPU)', gpuIn), el('label', { class: 'wiz-field' }, 'Memory (RAM)', ram),
      el('div', { class: 'wiz-buttons' }, el('button', { type: 'button', class: 'big primary', onclick: () => { setup.cpu = cpuIn.value; setup.gpu = gpuIn.value; setup.ramGB = +ram.value; ['cpu', 'gpu', 'ramGB'].forEach(markManual); saveSetup(); go(setup.form === 'laptop' ? 'power' : 'screen'); } }, 'Next')));
  }
  if (s === 'power') {
    const d = setup.device ? DEVICE_BY_ID[setup.device] : null;
    if (d && d.powerModes) return wizScreen('How do you usually play?', 'Pick the power mode you play in most. You can change it any time.', tiles(d.powerModes.map((p, i) => [p.name, i === d.defaultPower ? 'Most common' : '', () => { setup.powerModeIdx = i; markManual('powerMode'); saveSetup(); go('where'); }])));
    return wizScreen('How do you usually play?', null, tiles([['Plugged in', 'Full performance', () => { setup.onBattery = false; markManual('onBattery'); saveSetup(); go('where'); }], ['On battery', 'About 30-40% slower', () => { setup.onBattery = true; markManual('onBattery'); saveSetup(); go('where'); }]]));
  }
  if (s === 'where' && setup.form === 'desktop') return go('screen');
  if (s === 'where') return wizScreen('Where do you play?', null, tiles([
    ['On its own screen', 'Handheld or laptop screen only', () => { setup.playMode = 'handheld'; setup.playModes = 'handheld'; saveSetup(); go('charger'); }],
    ['Docked to a TV or monitor', '', () => { setup.playMode = 'docked'; setup.playModes = 'docked'; saveSetup(); go('dock'); }],
    ['Both', 'Switch any time on the Games screen', () => { setup.playMode = 'docked'; setup.playModes = 'both'; saveSetup(); go('dock'); }]]));
  if (s === 'dock') return wizScreen('How do you connect to the screen?', 'The dock decides the highest resolution and refresh rate your TV or monitor can get.', tiles(DOCKS.filter((x) => x.id !== 'none').map((x) => [x.name, x.note || '', () => { setup.dock = x.id; markManual('dock'); saveSetup(); go('charger'); }])));
  if (s === 'charger') { const dev = setup.device ? DEVICE_BY_ID[setup.device] : null; return wizScreen('What charger do you use?', dev && dev.stockChargerW ? `The one in the box is ${dev.stockChargerW} W. Full-power modes need about 60 W or more${setup.playMode === 'docked' ? ', and a dock uses some of it' : ''}.` : null, tiles(CHARGERS.map((c) => [c.name, '', () => { setup.charger = c.id; markManual('charger'); saveSetup(); go('egpu'); }]))); }
  if (s === 'egpu') { const dev = setup.device ? DEVICE_BY_ID[setup.device] : null; const ports = dev?.ports || ['usb4', 'xgm']; const list = EGPUS.filter((x) => x.id === 'none' || x.id === 'custom' || (x.port === 'xgm' ? ports.includes('xgm') : ports.some((p) => /usb4|tb/.test(p))));
    return wizScreen('Do you use an external graphics card?', 'Like an ASUS XG Mobile or a Thunderbolt/OCuLink eGPU box.', tiles(list.map((x) => [x.id === 'none' ? 'No' : x.name, x.port === 'xgm' ? 'Uses the XG Mobile port' : '', () => { setup.egpu = x.id; markManual('egpu'); saveSetup(); go(x.id === 'custom' ? 'egpu2' : 'screen'); }]))); }
  if (s === 'egpu2') { const gIn = el('input', { list: 'gpuList', value: setup.egpuGpu || '', placeholder: 'e.g. RTX 4070' }); const lk = el('select'); EGPU_LINKS.forEach((x) => lk.append(el('option', { value: x.id }, x.name))); lk.value = setup.egpuLink || 'tb4';
    return wizScreen('Your eGPU', null, el('label', { class: 'wiz-field' }, 'Graphics card in the enclosure', gIn), el('label', { class: 'wiz-field' }, 'How it connects', lk), el('div', { class: 'wiz-buttons' }, el('button', { type: 'button', class: 'big primary', onclick: () => { setup.egpuGpu = gIn.value; setup.egpuLink = lk.value; saveSetup(); go('screen'); } }, 'Next'))); }
  if (s === 'screen') {
    if (setup.playMode === 'docked' && !setup.monitors.some((m) => !m.builtin && m.link !== 'internal')) setup.monitors.push({ w: 1920, h: 1080, hz: 60, vrr: false, vrrType: 'none', hdr: false, link: 'HDMI2.0', dsc: true, video: false, model: '', manual: [] });
    const ext = setup.monitors.findIndex((m) => !m.builtin && m.link !== 'internal');
    if (ext < 0) return go('goal');
    const m = setup.monitors[ext];
    const resSel = el('select'); COMMON_RES.forEach((r) => resSel.append(el('option', { value: `${r.w}x${r.h}` }, r.label))); if (![...resSel.options].some((o) => o.value === `${m.w}x${m.h}`)) resSel.append(el('option', { value: `${m.w}x${m.h}` }, `${m.w}x${m.h}`)); resSel.value = `${m.w}x${m.h}`;
    const hzSel = el('select'); [60, 75, 100, 120, 144, 165, 170, 180, 240, 280, 360, 480, 540].forEach((v) => hzSel.append(el('option', { value: v }, `${v} Hz`))); if (![...hzSel.options].some((o) => +o.value === m.hz)) hzSel.append(el('option', { value: m.hz }, `${m.hz} Hz`)); hzSel.value = m.hz;
    const vrrBtns = (val) => { m.vrr = val; m.vrrType = val ? 'freesync' : 'none'; m.manual = [...new Set([...(m.manual || []), 'vrr'])]; };
    const multi = setup.monitors.filter((x) => !x.builtin && x.link !== 'internal').length > 1;
    const next = () => { m.hz = +hzSel.value; const [rw, rh] = resSel.value.split('x').map(Number); m.w = rw; m.h = rh; m.manual = [...new Set([...(m.manual || []), 'hz', 'res'])]; saveSetup(); go(multi ? 'screen2' : 'goal'); };
    return wizScreen(setup.playMode === 'docked' ? 'Your TV or monitor' : 'Your monitor', m.model ? `Found: ${m.model}` : setup.playMode === 'docked' ? 'Tell us about the screen you dock to.' : null,
      el('label', { class: 'wiz-field' }, 'Resolution', resSel), el('label', { class: 'wiz-field' }, 'Highest refresh rate it supports', hzSel),
      el('div', { class: 'wiz-q' }, 'Does it have FreeSync or G-SYNC?'),
      tiles([['Yes', '', () => { vrrBtns(true); next(); }], ['No', '', () => { vrrBtns(false); next(); }], ['Not sure', 'Treated as no', () => { vrrBtns(false); next(); }]]),
      m.model && isDesktopApp ? el('button', { type: 'button', class: 'linkish', onclick: () => runAction('monitor-specs', m.model) }, `Look up ${m.model} specs`) : '');
  }
  if (s === 'screen2') return wizScreen('Other screens', `You have ${setup.monitors.length} screens. Do you play videos on another one while gaming?`, tiles([
    ['Yes, often', 'YouTube, Twitch, etc.', () => { setup.monitors.slice(1).forEach((m) => { m.video = true; }); setup.background.browserVideo = true; saveSetup(); go('goal'); }],
    ['No', '', () => { setup.monitors.slice(1).forEach((m) => { m.video = false; }); setup.background.browserVideo = false; saveSetup(); go('goal'); }]]));
  if (s === 'goal') return wizScreen('What matters most to you?', 'You can switch this per game later.', tiles(GOALS.filter((g) => !g.portable || setup.form !== 'desktop').map((g) => [g.name, g.desc, () => { setup.goal = g.id; saveSetup(); go('done'); }])));
  if (s === 'done') return wizScreen('You’re all set', 'Pick a game to see its best settings.', el('button', { type: 'button', class: 'big primary', onclick: closeWizard }, 'Show me my games'), el('p', { class: 'wiz-sub small' }, 'Want even more accurate numbers? Later, play one game with an fps counter on and enter it under My setup > Improve accuracy.'));
}

$('btnDetect').onclick = () => detect(false);
$('autoDetect').checked = setup.autoDetect !== false; $('autoDetect').onchange = () => { setup.autoDetect = $('autoDetect').checked; saveSetup(); };
$('btnExport').onclick = () => { const a = el('a', { href: 'data:application/json,' + encodeURIComponent(JSON.stringify(setup, null, 2)), download: 'my-setup.json' }); a.click(); };
$('fileImport').onchange = async (ev) => { const f = ev.target.files[0]; if (!f) return; setup = { ...defaultSetup(), ...JSON.parse(await f.text()) }; saveSetup(); location.reload(); };
initSetup(); initGames(); decorate(); renderGoalChips(); renderGameGrid();
if (!setup.onboarded) openWizard();
else if (isDesktopApp && setup.autoDetect !== false) detect(true);
window.__app = { engineSetup, setup: () => setup, runRecommend };
