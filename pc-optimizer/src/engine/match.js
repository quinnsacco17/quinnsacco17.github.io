// Map detected hardware to database entries and setup fields.
function norm(s) { return (s || '').toLowerCase().replace(/\(r\)|\(tm\)|®|™/g, '').replace(/geforce|radeon|graphics|nvidia|amd|intel|core|processor|cpu|gpu|with/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
export function bestMatch(name, list) {
  const n = norm(name); if (!n) return null;
  const toks = n.split(' ').filter(Boolean);
  let best = null, bestScore = 0;
  for (const item of list) {
    const m = norm(item.name); const mt = m.split(' ');
    let score = 0; toks.forEach((t) => { if (mt.includes(t)) score += t.length > 2 ? 2 : 1; });
    const num = toks.find((t) => /^\d{3,5}[a-z]*$/.test(t)); if (num && mt.includes(num)) score += 5;
    if (/\b(ti|super|xt|xtx|x3d|k|kf|hx|hs|h)\b/.test(n)) { ['ti', 'super', 'xt', 'xtx', 'x3d'].forEach((s) => { if (toks.includes(s) !== mt.includes(s)) score -= 3; }); }
    mt.forEach((t) => { if (!toks.includes(t) && !/^\d+gb$/.test(t)) score -= 1.5; });
    const wantsMobile = toks.includes('laptop') || toks.includes('mobile'); if (item.mobile !== undefined && 'vram' in item && wantsMobile !== !!item.mobile) score -= 6;
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return bestScore >= 5 ? best : null;
}

const has = (list, re) => list.some((x) => re.test(x));
const RGB = /^(icue|corsair\.service|razer ?synapse|razerappengine|razercentralservice|armourycrate|armoury crate|lghub|lghub_agent|signalrgb|openrgb|msi ?center|nzxt cam|steelseriesgg|alienware command center)/i;

// Returns { setup: partial setup, auto: [field keys filled automatically], summary: [lines], hints: {fieldKey: text}, device: id|null }
export function matchHardware(hw, db) {
  const out = { peripherals: {}, background: {} }, summary = [], auto = [], hints = {};
  const mark = (k) => auto.push(k);
  // Commercial device (handhelds, laptops, prebuilts)
  const sysName = `${hw.system?.manufacturer || ''} ${hw.system?.model || ''}`.trim();
  const gpuNames = (hw.graphics?.controllers || []).map((c) => c.model || '').join(' ');
  let device = null;
  for (const d of db.DEVICES || []) {
    if (!d.match) continue;
    if (d.match.model && !d.match.model.test(sysName)) continue;
    if (d.match.cpu && !d.match.cpu.test(hw.cpu?.brand || '')) continue;
    if (d.match.gpu && !d.match.gpu.test(gpuNames)) continue;
    device = d; break;
  }
  if (device) { out.device = device.id; mark('device'); summary.push(`Device: ${sysName} → ${device.name}`); }
  else if (sysName) summary.push(`System: ${sysName}`);
  out.systemName = sysName;
  // CPU
  const cpu = bestMatch(hw.cpu?.brand, db.CPUS);
  if (device) { /* device preset supplies CPU/GPU */ }
  else if (cpu) { out.cpu = cpu.name; mark('cpu'); summary.push(`CPU: ${hw.cpu.brand} → ${cpu.name}`); }
  else { out.cpu = hw.cpu?.brand || ''; out.cpuCores = hw.cpu?.physicalCores; summary.push(`CPU: ${hw.cpu?.brand} (not in database, set a custom index)`); hints.cpu = 'Not in the database. Pick the closest CPU or enter a custom index.'; }
  // GPU
  const ctrls = (hw.graphics?.controllers || []).filter((c) => c.model).sort((a, b) => (b.vram || 0) - (a.vram || 0));
  const dGpu = ctrls.find((c) => /nvidia|radeon rx|arc a|arc b/i.test(`${c.vendor} ${c.model}`)) || ctrls[0];
  const iGpu = ctrls.find((c) => c !== dGpu);
  const nvName = hw.nvidia?.name;
  const gpu = bestMatch(nvName || dGpu?.model, db.GPUS);
  if (!device) {
    if (gpu) { out.gpu = gpu.name; mark('gpu'); summary.push(`GPU: ${nvName || dGpu.model} → ${gpu.name}`); }
    else if (dGpu) { out.gpu = dGpu.model; out.vram = dGpu.vram ? Math.round(dGpu.vram / 1024) : ''; summary.push(`GPU: ${dGpu.model} (not in database, set a custom index)`); hints.gpu = 'Not in the database. Pick the closest GPU or enter a custom index.'; }
  }
  const isIgpu = (gpu && gpu.family === 'igpu') || (device && device.type === 'handheld');
  if (isIgpu && dGpu?.vram) { out.igpuVramGB = Math.max(1, Math.round(dGpu.vram / 1024)); mark('igpuVram'); summary.push(`iGPU memory allocation: ${out.igpuVramGB} GB`); }
  // GPU link (NVIDIA only)
  if (hw.nvidia?.pcieGen && hw.nvidia?.pcieWidth) {
    const g = hw.nvidia.pcieGen, w = hw.nvidia.pcieWidth;
    const id = w >= 16 ? (g >= 5 ? 'pcie5x16' : g === 4 ? 'pcie4x16' : 'pcie3x16') : w >= 8 ? (g >= 4 ? 'pcie4x8' : 'pcie3x8') : (g >= 4 ? 'pcie4x4' : 'pcie3x4');
    out.pcie = id; mark('pcie'); summary.push(`GPU link: PCIe ${g}.0 x${w}${w <= 4 ? ' (eGPU, OCuLink, or chipset slot)' : ''}`);
    if (w <= 4) hints.pcie = 'An x4 link usually means an eGPU. If it is Thunderbolt, pick the Thunderbolt option instead.';
  }
  // RAM
  if (hw.mem?.total) { out.ramGB = Math.round(hw.mem.total / 1073741824); mark('ramGB'); summary.push(`RAM: ${out.ramGB} GB`); }
  const sticks = (hw.memLayout || []).filter((m) => m.size > 0);
  if (sticks.length) {
    const soldered = /lpddr/i.test(sticks[0].type || '') || (device && /LPDDR/i.test(device.ramType || ''));
    out.ramChannels = soldered ? 2 : Math.min(4, sticks.length >= 2 ? 2 : 1); if (soldered && sticks.length >= 4) out.ramChannels = 4; mark('ramChannels');
    const t = sticks[0]; if (t.type && t.clockSpeed) { out.ramType = `${t.type}-${t.clockSpeed}`; mark('ramType'); }
    summary.push(`RAM: ${sticks.length} module(s)${out.ramType ? ', ' + out.ramType : ''}${out.ramChannels === 1 ? ' (single channel)' : ''}`);
    if (t.clockSpeed && /DDR5/i.test(t.type) && t.clockSpeed <= 4800) hints.ramType = 'Running at 4800 usually means EXPO/XMP is off in BIOS. Turning it on is free performance.';
    if (t.clockSpeed && /DDR4/i.test(t.type) && t.clockSpeed <= 2666) hints.ramType = 'Running at 2133-2666 usually means XMP is off in BIOS. Turning it on is free performance.';
  }
  // Storage
  const disks = hw.diskLayout || []; const primary = disks.find((d) => /nvme/i.test(`${d.interfaceType} ${d.name}`)) || disks[0];
  if (primary) { out.storage = /nvme/i.test(`${primary.interfaceType} ${primary.name}`) ? 'nvme4' : primary.type === 'HD' ? 'hdd' : 'sata'; mark('storage'); summary.push(`Drive: ${primary.name} (${out.storage})`); if (disks.length > 1) hints.storage = 'More than one drive found. Pick the one your games are installed on.'; }
  // Form factor / battery / laptop GPU mode
  if (device) out.form = device.type === 'console' ? 'desktop' : device.type; else out.form = hw.battery?.hasBattery ? 'laptop' : 'desktop';
  mark('form');
  if (hw.battery?.hasBattery) { out.onBattery = !hw.battery.acConnected; mark('onBattery'); summary.push(out.onBattery ? 'Running on battery' : 'Plugged in'); }
  if (out.form === 'laptop' && hw.nvidia && iGpu) {
    out.laptopMode = hw.nvidia.displayActive ? 'mux' : 'optimus'; mark('laptopMode');
    summary.push(`Laptop GPU mode: ${hw.nvidia.displayActive ? 'dGPU drives a display (MUX / dGPU mode)' : 'iGPU drives the screen (Optimus / hybrid)'}`);
  }
  // Monitors
  const disp = (hw.graphics?.displays || []).filter((d) => d.resolutionX);
  if (disp.length) {
    out.monitors = disp.sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0)).map((d) => {
      const conn = (d.connection || '').toUpperCase(); const builtin = !!d.builtin || /INTERNAL|EDP|LVDS/.test(conn);
      const hz = Math.round(d.currentRefreshRate || 60); const gbps = d.resolutionX * d.resolutionY * hz * 24 * 1.09 / 1e9;
      const link = builtin ? 'internal' : /HDMI/.test(conn) ? (gbps > 14.4 ? 'HDMI2.1' : 'HDMI2.0') : /DP|DISPLAYPORT/.test(conn) ? (gbps > 25.9 ? 'DP2.1-UHBR13.5' : 'DP1.4') : /USB|TYPE-?C/.test(conn) ? 'USB-C-DP1.4-4lane' : 'DP1.4';
      return { w: d.resolutionX, h: d.resolutionY, hz, model: d.model || '', link, builtin, vrr: false, vrrType: 'none', hdr: false, dsc: true, video: false };
    });
    mark('monitors');
    summary.push(`Monitors: ${out.monitors.map((m) => `${m.model || 'display'} ${m.w}x${m.h}@${m.hz}`).join(', ')}`);
    if (out.monitors.some((m) => m.hz <= 60 && !m.builtin)) hints.monitors = 'A monitor is running at 60 Hz. If it supports more, Windows may be set to 60. Open Display settings > Advanced display > Choose a refresh rate.';
  }
  // Network
  const ifc = hw.net?.iface, wifi = hw.net?.wifi;
  if (ifc) {
    if (ifc.type === 'wired' && !/wi-?fi|wireless|wlan/i.test(ifc.ifaceName || ifc.iface || '')) { out.network = (ifc.speed || 0) >= 2500 ? 'eth2.5' : 'eth1'; }
    else if (wifi) { const f = wifi.frequency || 0; const model = `${wifi.model || ''} ${ifc.ifaceName || ''}`; out.network = f >= 5925 ? (/BE\d|Wi-?Fi 7/i.test(model) ? 'wifi7' : 'wifi6e') : f >= 4900 ? (/AX\d|Wi-?Fi 6/i.test(model) ? 'wifi6' : 'wifi5') : 'wifi24'; }
    else out.network = 'wifi6';
    mark('network'); summary.push(`Network: ${out.network}${wifi?.frequency ? ` (${(wifi.frequency / 1000).toFixed(1)} GHz)` : ''}`);
  }
  // USB devices
  const usb = (hw.usb || []).map((u) => `${u.name || ''} ${u.manufacturer || ''} ${u.type || ''}`);
  const nonRootHubs = usb.filter((u) => /hub/i.test(u) && !/root/i.test(u));
  if (nonRootHubs.length) { out.peripherals.hubGen = nonRootHubs.some((u) => /3\.|superspeed|usb3/i.test(u)) ? 'usb3' : 'usb2'; mark('hubGen'); hints.hubDevices = `Found ${nonRootHubs.length} external hub(s). Count what is plugged into it (Device Manager > View > Devices by connection shows the tree).`; }
  if (has(usb, /cam link|hd60|4k60|4k x|capture|avermedia|live gamer/i)) { out.peripherals.captureCard = true; mark('captureCard'); }
  if (has(usb, /focusrite|scarlett|audient|motu|umc\d|ssl ?2|universal audio|volt \d|presonus|steinberg|rme|goxlr|rodecaster/i)) { out.peripherals.audioInterface = true; mark('audioInterface'); }
  if (has(usb, /xbox wireless adapter/i)) { out.peripherals.controllerConn = 'wireless-dongle'; mark('controllerConn'); }
  else if (has(usb, /xbox.*controller|dualsense|dualshock|wireless controller|8bitdo|gamepad/i)) { out.peripherals.controllerConn = 'wired'; mark('controllerConn'); }
  if (has(usb, /lightspeed receiver|unifying|hyperspeed|2\.4g|receiver|dongle/i)) { out.peripherals.mouseConn = 'wireless-2.4'; mark('mouseConn'); }
  const webcam = has(usb, /webcam|c920|c922|brio|kiyo|facecam|camera/i);
  if (webcam) summary.push('Webcam found.');
  // Running software
  const procs = hw.processes || [];
  if (procs.length) {
    out.background.discordOverlay = has(procs, /^discord(\.exe)?$/); mark('discordOverlay');
    out.background.rgbSoftware = has(procs, RGB); mark('rgbSoftware');
    if (has(procs, /^obs(64|32)?(\.exe)?$/) || hw.obsEncoder) {
      const enc = (hw.obsEncoder || '').toLowerCase(); out.background.streaming = /x264/.test(enc) ? 'x264' : 'nvenc'; mark('streaming');
      summary.push(`OBS ${has(procs, /^obs/) ? 'running' : 'installed'}${enc ? `, encoder ${hw.obsEncoder}` : ''}`);
    }
    if (has(procs, /^(vrserver|vrmonitor|ovrserver_x64|oculusclient|virtual desktop streamer)(\.exe)?$/)) { out.peripherals.vrHeadset = true; mark('vrHeadset'); }
    const browsers = procs.filter((p) => /^(chrome|msedge|firefox|opera|brave|vivaldi|arc)(\.exe)?$/.test(p));
    if (browsers.length) hints.browserVideo = 'A browser is open. If it is playing video on another screen, tick this box and close it before benchmarking.';
    const rgbNames = procs.filter((p) => RGB.test(p)); if (rgbNames.length) summary.push(`RGB/peripheral software running: ${rgbNames.join(', ')}`);
  }
  return { setup: out, auto, summary, hints, device };
}
