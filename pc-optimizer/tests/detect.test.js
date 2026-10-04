import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchHardware } from '../src/engine/match.js';
import { GPUS } from '../src/engine/data/gpus.js';
import { CPUS } from '../src/engine/data/cpus.js';
import { DEVICES } from '../src/engine/data/devices.js';
const db = { GPUS, CPUS, DEVICES };

test('ROG Ally is recognized from the system model and picks the Z1 Extreme preset', () => {
  const m = matchHardware({ system: { manufacturer: 'ASUSTeK COMPUTER INC.', model: 'ROG Ally RC71L_RC71L' }, cpu: { brand: 'AMD Ryzen Z1 Extreme', physicalCores: 8 }, graphics: { controllers: [{ vendor: 'AMD', model: 'AMD Radeon(TM) Graphics', vram: 6144 }], displays: [{ resolutionX: 1920, resolutionY: 1080, currentRefreshRate: 120, connection: 'INTERNAL', builtin: true, model: 'Built-in' }] }, mem: { total: 16 * 1073741824 }, memLayout: [{ size: 8e9, type: 'LPDDR5', clockSpeed: 6400 }, { size: 8e9, type: 'LPDDR5', clockSpeed: 6400 }], diskLayout: [{ name: 'Micron 2400 NVMe', interfaceType: 'NVMe' }], battery: { hasBattery: true, acConnected: false }, usb: [], processes: ['armourycrate.exe', 'discord.exe'], net: { iface: { type: 'wireless', ifaceName: 'Wi-Fi' }, wifi: { frequency: 5180, model: 'MediaTek Wi-Fi 6E MT7922' } } }, db);
  assert.equal(m.setup.device, 'rog-ally-z1e');
  assert.equal(m.setup.igpuVramGB, 6);
  assert.equal(m.setup.onBattery, true);
  assert.equal(m.setup.network, 'wifi6');
  assert.equal(m.setup.background.rgbSoftware, true);
  assert.equal(m.setup.background.discordOverlay, true);
  assert.equal(m.setup.monitors[0].link, 'internal');
});

test('NVIDIA desktop: GPU, PCIe link, single-channel RAM, OBS x264, Ethernet, capture card', () => {
  const m = matchHardware({ system: { manufacturer: 'Micro-Star', model: 'MS-7D75' }, cpu: { brand: 'AMD Ryzen 7 7800X3D 8-Core Processor' }, graphics: { controllers: [{ vendor: 'NVIDIA', model: 'NVIDIA GeForce RTX 4070 Ti SUPER', vram: 16376 }], displays: [{ resolutionX: 2560, resolutionY: 1440, currentRefreshRate: 60, connection: 'DP', model: 'XG27AQ', main: true }, { resolutionX: 1920, resolutionY: 1080, currentRefreshRate: 60, connection: 'HDMI', model: 'VG245' }] }, nvidia: { name: 'NVIDIA GeForce RTX 4070 Ti SUPER', pcieGen: 4, pcieWidth: 16, displayActive: true }, mem: { total: 32 * 1073741824 }, memLayout: [{ size: 32e9, type: 'DDR5', clockSpeed: 4800 }], diskLayout: [{ name: 'Samsung 990 PRO', interfaceType: 'NVMe' }], battery: { hasBattery: false }, usb: [{ name: 'Elgato HD60 X' }, { name: 'Generic USB Hub' }, { name: 'USB Root Hub (USB 3.0)' }], processes: ['obs64.exe', 'icue.exe', 'chrome.exe'], obsEncoder: 'obs_x264', net: { iface: { type: 'wired', ifaceName: 'Ethernet', speed: 2500 } } }, db);
  assert.equal(m.setup.gpu, 'NVIDIA GeForce RTX 4070 Ti SUPER'); assert.equal(m.setup.cpu, 'AMD Ryzen 7 7800X3D');
  assert.equal(m.setup.pcie, 'pcie4x16'); assert.equal(m.setup.ramChannels, 1); assert.equal(m.setup.ramType, 'DDR5-4800'); assert.ok(m.hints.ramType);
  assert.equal(m.setup.background.streaming, 'x264'); assert.equal(m.setup.network, 'eth2.5'); assert.equal(m.setup.peripherals.captureCard, true); assert.equal(m.setup.peripherals.hubGen, 'usb2');
  assert.equal(m.setup.monitors.length, 2); assert.equal(m.setup.monitors[0].model, 'XG27AQ'); assert.ok(m.hints.monitors, '60 Hz hint'); assert.ok(m.hints.browserVideo);
});

test('Optimus laptop on 6 GHz Wi-Fi 7', () => {
  const m = matchHardware({ system: { manufacturer: 'LENOVO', model: '82XYZ' }, cpu: { brand: 'Intel(R) Core(TM) i7-13700HX' }, graphics: { controllers: [{ vendor: 'Intel', model: 'Intel(R) UHD Graphics', vram: 128 }, { vendor: 'NVIDIA', model: 'NVIDIA GeForce RTX 4060 Laptop GPU', vram: 8188 }], displays: [{ resolutionX: 2560, resolutionY: 1600, currentRefreshRate: 165, connection: 'INTERNAL', builtin: true }] }, nvidia: { name: 'NVIDIA GeForce RTX 4060 Laptop GPU', pcieGen: 4, pcieWidth: 8, displayActive: false }, mem: { total: 16 * 1073741824 }, memLayout: [{ size: 8e9, type: 'DDR5', clockSpeed: 5600 }, { size: 8e9, type: 'DDR5', clockSpeed: 5600 }], diskLayout: [], battery: { hasBattery: true, acConnected: true }, usb: [{ name: 'Logitech USB Receiver Unifying' }], processes: [], net: { iface: { type: 'wireless', ifaceName: 'Wi-Fi' }, wifi: { frequency: 6115, model: 'Intel Wi-Fi 7 BE200' } } }, db);
  assert.equal(m.setup.gpu, 'NVIDIA GeForce RTX 4060 Laptop'); assert.equal(m.setup.form, 'laptop'); assert.equal(m.setup.laptopMode, 'optimus'); assert.equal(m.setup.network, 'wifi7'); assert.equal(m.setup.pcie, 'pcie4x8'); assert.equal(m.setup.peripherals.mouseConn, 'wireless-2.4'); assert.equal(m.setup.ramChannels, 2);
});
