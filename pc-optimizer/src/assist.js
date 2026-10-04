// Field guidance, action buttons, and in-app measurement tools.
const isApp = () => !!window.optimizer;
const isWin = () => window.optimizer?.platform === 'win32';

// steps: plain sentences. actions: [label, target, argKey?]. auto: how the app fills it.
export const HELP = {
  device: { auto: 'Matched from the system model name when you run detection.', steps: ['If your handheld, laptop, or prebuilt is in the list, pick it. It fills the parts, screen, and power modes.', 'Not listed or self-built? Leave it on Custom build.'], actions: [['Show system model (msinfo32)', 'msinfo'], ['Look up this system’s specs', 'device-specs', 'systemName']] },
  powerMode: { auto: 'Cannot be read from Windows. Pick the mode you actually play in.', steps: ['ROG Ally / Ally X / Xbox Ally: press the Command Center button (left of the screen). Operating Mode shows Silent, Performance, or Turbo. Turbo plugged in is 30-35 W.', 'Steam Deck: press the ... button > battery icon > Advanced view > TDP limit. Off means 15 W.', 'Legion Go: Legion Space > Thermal mode (Quiet / Balanced / Performance / Custom).', 'MSI Claw: MSI Center M > User Scenario.'], actions: [['Open Armoury Crate SE', 'armoury']] },
  cpu: { auto: 'Detected from Windows and matched to the database.', steps: ['If it says "not in database", type the closest model or enter a custom index (Ryzen 7 9800X3D = 100).'], actions: [['Open DxDiag', 'dxdiag']] },
  gpu: { auto: 'Detected from the driver and matched to the database.', steps: ['If you have two GPUs (laptop), the dedicated one is used. If it says "not in database", pick the closest card.'], actions: [['Open DxDiag', 'dxdiag']] },
  igpuVram: { auto: 'Read from the driver (the memory Windows reserves for the iGPU).', steps: ['Handhelds: Armoury Crate SE > Settings > Performance > GPU Settings > UMA Frame Buffer Size. Use 6 GB on 16 GB devices, 8 GB on 24 GB devices.', 'Laptops / mini PCs: set in BIOS, usually under Advanced > UMA Frame Buffer Size.'], actions: [['Open Armoury Crate SE', 'armoury']] },
  pcie: { auto: 'Read from nvidia-smi on NVIDIA cards. AMD/Intel cards need a manual check.', steps: ['Download GPU-Z (free). The "Bus Interface" field shows the link, e.g. "PCIe x16 4.0 @ x16 4.0". Click the ? next to it and run the render test so the card is not idle.', 'eGPU over Thunderbolt or USB4: pick the Thunderbolt option even if GPU-Z says x4.'], actions: [] },
  ramType: { auto: 'Read from the memory modules.', steps: ['DDR5 at 4800 or DDR4 at 2133-2666 usually means EXPO/XMP is off. Enable it in BIOS (often one toggle on the main BIOS page).'], actions: [] },
  storage: { auto: 'Uses the fastest drive found.', steps: ['Pick the drive your games are installed on. Steam: Settings > Storage shows which drive each game is on.'], actions: [['Open Steam settings', 'steam']] },
  laptopMode: { auto: 'Detected on NVIDIA laptops (whether the NVIDIA GPU drives a screen).', steps: ['ASUS: Armoury Crate > GPU Mode. Ultimate = MUX/dGPU, Standard = Optimus.', 'Lenovo: Lenovo Vantage or Legion Space > Hybrid Mode off = dGPU only.', 'MSI: MSI Center > GPU Switch. Others: NVIDIA Control Panel > Manage Display Mode.'], actions: [['Open NVIDIA Control Panel', 'nvcp']] },
  psuW: { auto: 'Windows cannot read the power supply.', steps: ['Prebuilt: the wattage is on the product page or the order receipt. Use the button to search it.', 'Self-built: the wattage is printed on the sticker on the side of the PSU (turn off and look inside the case) or in your order history.'], actions: [['Search this system’s PSU wattage', 'psu-specs', 'systemName']] },
  cooling: { auto: 'Judged by you.', steps: ['Pick "Poor" if the GPU runs above 83 °C or the CPU above 95 °C in games, the fans are loud all the time, or the dust filters are clogged.', 'Check temps with the NVIDIA overlay (Alt+R), AMD overlay (Ctrl+Shift+O), or Xbox Game Bar (Win+G > Performance).'], actions: [] },
  mousePolling: { auto: 'Measure it with the tester below. Windows does not expose it.', steps: ['Click "Test polling rate" and move the mouse in fast circles inside the box for 3 seconds.', 'To change it: Logitech G HUB, Razer Synapse, SteelSeries GG, or your mouse’s software.'], actions: [], tool: 'polling' },
  mouseConn: { auto: 'Set to wireless when a USB receiver is found.', steps: ['Wireless with a USB dongle = 2.4 GHz. Paired in Windows Bluetooth settings = Bluetooth.'], actions: [['Open Bluetooth settings', 'bluetooth']] },
  controllerConn: { auto: 'Detected for USB-connected controllers and the Xbox Wireless Adapter.', steps: ['Paired in Windows Bluetooth settings = Bluetooth. Uses the Xbox adapter or a brand dongle = 2.4 GHz dongle.'], actions: [['Open Bluetooth settings', 'bluetooth']] },
  hubGen: { auto: 'External hubs are detected. Which device is on which port is not.', steps: ['Open Device Manager, then View > Devices by connection. Expand your USB controllers; anything under a "Generic USB Hub" is on a hub.', 'Blue or red USB ports are USB 3. Black ports are usually USB 2.'], actions: [['Open Device Manager', 'devmgr']] },
  hubDevices: { auto: 'Count from Device Manager.', steps: ['Count the devices plugged into the hub (including a monitor’s built-in USB ports).'], actions: [['Open Device Manager', 'devmgr']] },
  network: { auto: 'Detected from the active connection and Wi-Fi band.', steps: ['If unsure: Settings > Network & internet shows Ethernet or Wi-Fi, and the Wi-Fi properties show the band (2.4, 5, or 6 GHz).'], actions: [['Open network status', 'network']] },
  streaming: { auto: 'Detected when OBS is running or installed (reads its encoder setting).', steps: ['OBS: Settings > Output > Encoder. Anything with NVENC, AMF, AV1, or QuickSync is hardware. x264 is software.'], actions: [] },
  discordOverlay: { auto: 'Ticked if Discord is running.', steps: ['Discord > User Settings > Game Overlay. Turn it off if you do not use it.'], actions: [] },
  rgbSoftware: { auto: 'Ticked if iCUE, Synapse, Armoury Crate, G HUB, SignalRGB, or similar is running.', steps: [], actions: [] },
  browserVideo: { auto: 'Cannot tell if a tab plays video. Tick it if you watch video while gaming.', steps: [], actions: [] },
  monitors: { auto: 'Resolution, refresh, and port type are detected. VRR, HDR, and exact cable version are not.', steps: ['Click "Look up specs" next to a monitor to search its model for VRR (FreeSync / G-SYNC) and HDR support.', 'Turn VRR on: monitor menu (Adaptive-Sync / FreeSync on), then NVIDIA Control Panel > Set up G-SYNC, or AMD Adrenalin > Display > FreeSync.', 'HDR: Windows Settings > Display > Use HDR.', 'Refresh stuck at 60? Settings > Display > Advanced display > Choose a refresh rate. Use DisplayPort or HDMI 2.1 for high refresh.'], actions: [['Open Display settings', 'display'], ['Open NVIDIA Control Panel', 'nvcp'], ['Open AMD Adrenalin', 'amd']] },
};

export const MEASURE_HELP = { steps: ['Turn on an fps counter: Steam (Settings > In Game > In-game FPS counter), NVIDIA App overlay (Alt+R), AMD overlay (Ctrl+Shift+O), or Xbox Game Bar (Win+G > Performance).', 'Play normally for 1-2 minutes in a typical area (not a menu or loading screen). Note the average fps you see most of the time.', 'Enter the game, preset, resolution, and that number below. One game is enough; three different games is best.'], actions: [['Open Steam settings', 'steam'], ['Open NVIDIA App', 'nvapp'], ['Open AMD Adrenalin', 'amd']] };

export async function runAction(target, arg) {
  if (!isApp()) { alert('This button works in the desktop app. In the browser, follow the steps above.'); return; }
  const r = await window.optimizer.open(target, arg);
  if (!r.ok) alert(r.error || 'Could not open it on this system.');
}

function actionButtons(actions, ctx) {
  const wrap = document.createElement('div'); wrap.className = 'help-actions';
  actions.forEach(([label, target, argKey]) => {
    if (!isApp() && !argKey) { /* still show, explains on click */ }
    if (isApp() && !isWin() && !['display', 'steam', 'power', 'device-specs', 'psu-specs', 'monitor-specs'].includes(target)) return;
    const b = document.createElement('button'); b.className = 'small'; b.type = 'button'; b.textContent = label;
    b.onclick = () => runAction(target, argKey ? ctx()[argKey] : undefined);
    wrap.append(b);
  });
  return wrap;
}

export function helpBlock(key, ctx, tools = {}) {
  const h = HELP[key]; if (!h) return null;
  const d = document.createElement('details'); d.className = 'help';
  const s = document.createElement('summary'); s.textContent = 'How to find this'; d.append(s);
  const p = document.createElement('div'); p.className = 'help-auto'; p.textContent = h.auto; d.append(p);
  if (h.steps.length) { const ol = document.createElement('ol'); h.steps.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ol.append(li); }); d.append(ol); }
  d.append(actionButtons(h.actions, ctx));
  if (h.tool && tools[h.tool]) { const b = document.createElement('button'); b.className = 'small primary'; b.type = 'button'; b.textContent = 'Test polling rate'; b.onclick = tools[h.tool]; d.querySelector('.help-actions').prepend(b); }
  return d;
}

export function measureBlock() {
  const d = document.createElement('div'); d.className = 'help-static';
  const ol = document.createElement('ol'); MEASURE_HELP.steps.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ol.append(li); }); d.append(ol);
  d.append(actionButtons(MEASURE_HELP.actions, () => ({})));
  return d;
}

const STANDARD_RATES = [125, 250, 500, 1000, 2000, 4000, 8000];
export function pollingTester(onResult) {
  const overlay = document.createElement('div'); overlay.className = 'modal';
  overlay.innerHTML = '<div class="modal-card"><h2>Mouse polling rate test</h2><p>Move the mouse in fast circles inside the box. Keep moving until the bar fills.</p><div class="poll-box"><div class="poll-bar"></div><div class="poll-read">Waiting for movement…</div></div><div class="row"><button type="button" class="small" data-close>Cancel</button></div></div>';
  document.body.append(overlay);
  const box = overlay.querySelector('.poll-box'), bar = overlay.querySelector('.poll-bar'), read = overlay.querySelector('.poll-read');
  const stamps = []; let active = 0, last = 0, done = false;
  const evName = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';
  const handler = (e) => {
    const list = evName === 'pointermove' && e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const c of list) { const t = c.timeStamp; if (last && t - last < 60) active += t - last; last = t; stamps.push(t); }
    bar.style.width = Math.min(100, (active / 3000) * 100) + '%';
    if (stamps.length > 50) { const r = estimate(); read.textContent = `≈ ${r.raw} Hz (nearest standard: ${r.rate} Hz)`; }
    if (active >= 3000 && !done) finish();
  };
  function estimate() {
    const iv = []; for (let i = 1; i < stamps.length; i++) { const d = stamps[i] - stamps[i - 1]; if (d > 0 && d < 60) iv.push(d); }
    iv.sort((a, b) => a - b); const med = iv[Math.floor(iv.length / 2)] || 1; const raw = Math.round(1000 / med);
    const rate = STANDARD_RATES.reduce((a, b) => (Math.abs(Math.log(b / raw)) < Math.abs(Math.log(a / raw)) ? b : a));
    return { raw, rate };
  }
  function finish() {
    done = true; box.removeEventListener(evName, handler);
    const r = estimate();
    read.textContent = `Measured ≈ ${r.raw} Hz → set to ${r.rate} Hz.${r.rate >= 4000 ? ' Browsers can under-read above 4000 Hz. If your mouse software says 8000, keep 8000.' : ''}`;
    const ok = document.createElement('button'); ok.className = 'small primary'; ok.type = 'button'; ok.textContent = `Use ${r.rate} Hz`;
    ok.onclick = () => { onResult(r.rate); overlay.remove(); };
    overlay.querySelector('.row').prepend(ok);
  }
  box.addEventListener(evName, handler);
  overlay.querySelector('[data-close]').onclick = () => { box.removeEventListener(evName, handler); overlay.remove(); };
}
