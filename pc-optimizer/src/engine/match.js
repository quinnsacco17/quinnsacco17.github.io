// Map detected hardware strings to database entries.
function norm(s) { return (s || '').toLowerCase().replace(/\(r\)|\(tm\)|®|™/g, '').replace(/geforce|radeon|graphics|nvidia|amd|intel|core|processor|cpu|gpu|with|laptop gpu/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
export function bestMatch(name, list) {
  const n = norm(name); if (!n) return null;
  const toks = n.split(' ').filter(Boolean);
  let best = null, bestScore = 0;
  for (const item of list) {
    const m = norm(item.name); const mt = m.split(' ');
    let score = 0; toks.forEach((t) => { if (mt.includes(t)) score += t.length > 2 ? 2 : 1; });
    // model number exact match bonus
    const num = toks.find((t) => /^\d{3,5}[a-z]*$/.test(t)); if (num && mt.includes(num)) score += 5;
    if (/\b(ti|super|xt|xtx|x3d|k|kf|hx|hs|h)\b/.test(n)) { ['ti', 'super', 'xt', 'xtx', 'x3d'].forEach((s) => { if (toks.includes(s) !== mt.includes(s)) score -= 3; }); }
    mt.forEach((t) => { if (!toks.includes(t) && !/^\d+gb$/.test(t)) score -= 1.5; });
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return bestScore >= 5 ? best : null;
}
export function matchHardware(hw, db) {
  const out = {}, summary = [];
  const cpu = bestMatch(hw.cpu?.brand, db.CPUS); if (cpu) { out.cpu = cpu.name; summary.push(`CPU: ${hw.cpu.brand} → ${cpu.name}`); } else { summary.push(`CPU: ${hw.cpu?.brand} (not in database; set a custom index)`); out.cpu = hw.cpu?.brand || ''; out.cpuCores = hw.cpu?.physicalCores; }
  const ctrls = (hw.graphics?.controllers || []).filter((c) => c.model).sort((a, b) => (b.vram || 0) - (a.vram || 0));
  const dGpu = ctrls.find((c) => /nvidia|radeon rx|arc a|arc b/i.test(`${c.vendor} ${c.model}`)) || ctrls[0];
  const gpu = bestMatch(dGpu?.model, db.GPUS);
  if (gpu) { out.gpu = gpu.name; summary.push(`GPU: ${dGpu.model} → ${gpu.name}`); } else if (dGpu) { out.gpu = dGpu.model; out.vram = dGpu.vram ? Math.round(dGpu.vram / 1024) : ''; summary.push(`GPU: ${dGpu.model} (not in database; set a custom index)`); }
  if (hw.mem?.total) { out.ramGB = Math.round(hw.mem.total / 1073741824); summary.push(`RAM: ${out.ramGB} GB`); }
  const sticks = (hw.memLayout || []).filter((m) => m.size > 0); if (sticks.length) { out.ramChannels = Math.min(4, sticks.length); const t = sticks[0]; out.ramType = `${t.type || 'DDR'}-${t.clockSpeed || ''}`.replace(/-$/, ''); summary.push(`RAM: ${sticks.length} stick(s), ${out.ramType}`); }
  const disks = hw.diskLayout || []; const primary = disks.find((d) => /nvme/i.test(d.interfaceType || d.name || '')) || disks[0];
  if (primary) { out.storage = /nvme/i.test(primary.interfaceType || primary.name || '') ? 'nvme4' : primary.type === 'HD' ? 'hdd' : 'sata'; summary.push(`Drive: ${primary.name} (${out.storage})`); }
  const disp = (hw.graphics?.displays || []).filter((d) => d.resolutionX);
  if (disp.length) { out.monitors = disp.sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0)).map((d, i) => ({ w: d.resolutionX, h: d.resolutionY, hz: d.currentRefreshRate || 60, vrr: false, vrrType: 'none', hdr: false, link: d.connection && /hdmi/i.test(d.connection) ? 'HDMI2.0' : d.builtin ? 'internal' : 'DP1.4', dsc: true, video: i > 0, builtin: !!d.builtin })); summary.push(`Monitors: ${out.monitors.map((m) => `${m.w}x${m.h}@${m.hz}`).join(', ')} (VRR/HDR/cable not detectable: set them manually)`); }
  if (hw.battery?.hasBattery) { out.form = 'laptop'; out.onBattery = !hw.battery.acConnected; summary.push(`Laptop detected${out.onBattery ? ' (on battery)' : ''}`); } else out.form = 'desktop';
  const usb = hw.usb || []; const mice = usb.filter((u) => /mouse/i.test(u.type || u.name || '')); if (mice.length) summary.push(`USB: ${usb.length} devices, ${mice.length} mouse. Polling rate is not detectable: set it manually.`);
  return { setup: out, summary };
}
