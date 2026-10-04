// Turns the user's saved setup into what the estimator consumes: device presets, connections,
// docks, chargers, and external GPUs folded in.
import { DEVICE_BY_ID } from './data/devices.js';
import { PCIE, STORAGE, DOCKS, CHARGERS, EGPUS } from './data/connections.js';

export function buildEngineSetup(s) {
  const e = { ...s, peripherals: { ...(s.peripherals || {}) }, background: { ...(s.background || {}) }, monitors: (s.monitors || []).map((m) => ({ ...m })), accessoryWarnings: [], accessoryNotes: [] };
  const d = s.device ? DEVICE_BY_ID[s.device] : null;
  if (d) {
    if (d.cpuIdx) e.cpuIdxOverride = d.cpuIdx; if (d.gpuIdx) e.gpuIdxOverride = d.gpuIdx;
    if (d.gpuBonus) e.gpuBonus = d.gpuBonus; if (d.cpuBonus) e.cpuBonus = d.cpuBonus;
    if (d.powerModes) e.powerMode = d.powerModes[s.powerModeIdx ?? d.defaultPower] || d.powerModes[d.defaultPower];
  }
  if (s.cpuIdx) e.cpuIdxOverride = +s.cpuIdx; if (s.gpuIdx) e.gpuIdxOverride = +s.gpuIdx; if (s.vram) e.vramOverride = +s.vram; if (s.cpuCores) e.cpuCores = +s.cpuCores;
  const portable = d ? ['handheld', 'laptop'].includes(d.type) : ['handheld', 'laptop'].includes(s.form);

  // Dock and play mode
  const dock = DOCKS.find((x) => x.id === s.dock) || DOCKS[0];
  const docked = portable && s.playMode === 'docked' && dock.id !== 'none';
  if (docked) {
    const ext = e.monitors.filter((m) => !m.builtin && m.link !== 'internal');
    if (ext.length) {
      ext.forEach((m) => { if (dock.link && !(m.manual || []).includes('link')) m.link = dock.link; });
      e.monitors = [...ext, ...e.monitors.filter((m) => m.builtin || m.link === 'internal').map((m) => ({ ...m, off: true }))];
    } else e.accessoryWarnings.push('You play docked but no external screen is set. Add your TV or monitor under Run setup again.');
    if (dock.note) e.accessoryNotes.push(`${dock.name}: ${dock.note}`);
    if (dock.ethernet && s.dockEthernet) e.network = 'eth1';
  }

  // Charger: the top "plugged in" mode needs enough watts, or the device falls back a mode.
  if (d && d.powerModes && portable) {
    const top = d.powerModes.length - 1, idx = s.powerModeIdx ?? d.defaultPower;
    const chargerW = s.charger && s.charger !== 'stock' ? (CHARGERS.find((c) => c.id === s.charger) || {}).w : d.stockChargerW;
    if (chargerW) {
      const avail = docked && dock.passW ? Math.min(chargerW - 15, dock.passW) : chargerW;
      const need = d.type === 'handheld' ? 60 : 100;
      if (idx === top && /plugged/i.test(d.powerModes[top].name) && avail < need) {
        e.powerMode = d.powerModes[top - 1];
        e.accessoryWarnings.push(`${docked ? 'Through this dock your charger delivers' : 'Your charger delivers'} about ${Math.max(0, Math.round(avail))} W, below the ~${need} W needed for "${d.powerModes[top].name}". It runs like "${d.powerModes[top - 1].name}" instead. Use a ${need >= 100 ? 100 : 65} W+ USB-C PD charger${docked ? ' plugged into the dock' : ''}.`);
      }
    }
  }

  // External GPU
  const eg = EGPUS.find((x) => x.id === s.egpu);
  if (eg && eg.id !== 'none') {
    const gpuName = eg.id === 'custom' ? s.egpuGpu : eg.gpu;
    const link = eg.id === 'custom' ? (s.egpuLink || 'tb4') : eg.link;
    if (gpuName) {
      e.gpu = gpuName; delete e.gpuIdxOverride; e.gpuBonus = 1; e.vramOverride = null;
      if (d && d.powerModes) e.powerMode = { name: 'eGPU, plugged in', gpu: 1, cpu: d.type === 'handheld' ? 1.1 : 1 };
      e.pcie = link;
      if (eg.port === 'xgm' && d && !(d.ports || []).includes('xgm')) e.accessoryWarnings.push(`${d.name} has no XG Mobile port. This eGPU only connects to the original ROG Ally and some ASUS laptops.`);
      if (s.egpuInternal) { e.gpuBonus *= 0.88; e.accessoryNotes.push('eGPU drawing to the built-in screen: frames are copied back over the cable, about 12% slower. Plug a monitor into the eGPU for full speed.'); }
      e.accessoryNotes.push(`External GPU in use: ${gpuName} over ${(PCIE.find((p) => p.id === link) || { name: link }).name}.`);
    }
  }
  const pc = PCIE.find((p) => p.id === e.pcie); if (pc) e.gpuBonus = (e.gpuBonus || 1) * pc.gpu;
  if (s.form === 'laptop') e.laptopMux = s.laptopMode === 'optimus' ? 'optimus' : null;
  const st = STORAGE.find((x) => x.id === s.storage); e.storage = st && st.id === 'hdd' ? 'hdd' : s.storage;
  e.psuW = s.form === 'desktop' && s.psuW ? +s.psuW : null;
  e.igpuVramGB = +s.igpuVramGB || 4;
  e.peripherals.mousePolling = +(e.peripherals.mousePolling || 1000);
  return e;
}
