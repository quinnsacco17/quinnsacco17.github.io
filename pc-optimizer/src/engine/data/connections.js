// Every connection type and its measured-ish effect. mult = GPU/CPU multiplier; notes shown to user.
export const PCIE = [
  { id: 'pcie5x16', name: 'PCIe 5.0 x16', gpu: 1.0 }, { id: 'pcie4x16', name: 'PCIe 4.0 x16', gpu: 1.0 }, { id: 'pcie3x16', name: 'PCIe 3.0 x16', gpu: 0.985, note: 'PCIe 3.0 x16: ~1-2% on high-end cards.' },
  { id: 'pcie4x8', name: 'PCIe 4.0 x8 (card or slot limited)', gpu: 0.99 }, { id: 'pcie3x8', name: 'PCIe 3.0 x8', gpu: 0.96, note: 'PCIe 3.0 x8: 3-5% loss, more when VRAM overflows.', vramSensitive: 0.9 },
  { id: 'pcie4x4', name: 'PCIe 4.0 x4 (OCuLink eGPU / chipset slot)', gpu: 0.93, note: 'PCIe 4.0 x4: ~7% loss on average, 15%+ when VRAM is full.', vramSensitive: 0.85 },
  { id: 'pcie3x4', name: 'PCIe 3.0 x4 (older OCuLink / M.2 adapter)', gpu: 0.88, note: 'PCIe 3.0 x4: 10-15% loss.', vramSensitive: 0.8 },
  { id: 'tb4', name: 'Thunderbolt 4 / USB4 eGPU (~32 Gbit effective)', gpu: 0.78, note: 'Thunderbolt eGPU: 20-25% loss plus higher frametime variance. Connect the monitor to the eGPU, not the laptop panel, to avoid another 10-15%.', vramSensitive: 0.75 },
  { id: 'tb3', name: 'Thunderbolt 3 eGPU (~22 Gbit effective)', gpu: 0.72, note: 'Thunderbolt 3 eGPU: 25-30% loss.', vramSensitive: 0.7 },
  { id: 'tb5', name: 'Thunderbolt 5 eGPU (PCIe 4.0 x4 class)', gpu: 0.92, note: 'Thunderbolt 5 eGPU: ~8% loss.', vramSensitive: 0.85 },
];
export const STORAGE = [
  { id: 'nvme5', name: 'NVMe PCIe 5.0 SSD', lows: 1.0 }, { id: 'nvme4', name: 'NVMe PCIe 4.0 SSD', lows: 1.0 }, { id: 'nvme3', name: 'NVMe PCIe 3.0 SSD', lows: 1.0 },
  { id: 'sata', name: 'SATA SSD', lows: 0.98, note: 'SATA SSD: fine for nearly all games; DirectStorage titles (Forspoken, Ratchet & Clank) stream textures slightly later.' },
  { id: 'usb-ssd', name: 'External USB SSD', lows: 0.95, note: 'External SSD over USB: OK for most games; loads 20-40% slower than internal NVMe.' },
  { id: 'microsd', name: 'microSD card (handheld)', lows: 0.85, note: 'microSD: asset streaming stutter in open-world games. Keep heavy titles on the internal SSD.' },
  { id: 'hdd', name: 'Hard drive (HDD)', lows: 0.8, note: 'HDD: traversal stutter and long loads. Moving the game to any SSD is the biggest 1% low improvement available.' },
  { id: 'network', name: 'Network share / NAS', lows: 0.7, note: 'Network storage: not viable for modern games.' },
];
export const NETWORK = [
  { id: 'eth2.5', name: 'Ethernet 2.5 GbE', ping: 0, jitter: 'very low' }, { id: 'eth1', name: 'Ethernet 1 GbE', ping: 0, jitter: 'very low' },
  { id: 'wifi7', name: 'Wi-Fi 7 (6 GHz)', ping: 2, jitter: 'low', note: 'Wi-Fi 7 on 6 GHz: near-wired latency if the router is in the same room.' },
  { id: 'wifi6e', name: 'Wi-Fi 6E (6 GHz)', ping: 3, jitter: 'low' }, { id: 'wifi6', name: 'Wi-Fi 6 (5 GHz)', ping: 5, jitter: 'medium', note: 'Wi-Fi on 5 GHz: 3-10 ms added and occasional spikes. For competitive play use Ethernet or 6 GHz.' },
  { id: 'wifi5', name: 'Wi-Fi 5 (5 GHz)', ping: 8, jitter: 'medium-high' }, { id: 'wifi24', name: 'Wi-Fi 2.4 GHz', ping: 15, jitter: 'high', note: '2.4 GHz Wi-Fi: packet loss spikes; shares spectrum with USB 3 and Bluetooth. Avoid for online games.' },
  { id: 'powerline', name: 'Powerline adapter', ping: 6, jitter: 'medium' }, { id: 'hotspot', name: 'Phone hotspot / 5G', ping: 25, jitter: 'high' },
];
export const USB_HUB = [
  { id: 'none', name: 'No hub (direct to motherboard)' }, { id: 'usb2', name: 'USB 2.0 hub (480 Mbit shared)' }, { id: 'usb3', name: 'USB 3.x hub (5-10 Gbit shared)' }, { id: 'tb-dock', name: 'Thunderbolt / USB4 dock' }, { id: 'monitor-hub', name: 'Monitor built-in USB hub (usually 2-lane upstream)' },
];
export const MOUSE_CONN = [
  { id: 'wired', name: 'Wired USB', latency: 0 }, { id: 'wireless-2.4', name: '2.4 GHz wireless (dongle)', latency: 0.5, note: 'Dongle next to the mouse (extender) avoids polling drops at 4000 Hz+.' }, { id: 'bluetooth', name: 'Bluetooth', latency: 8, note: 'Bluetooth mouse: 125 Hz polling and 8-15 ms latency. Not for gaming.' },
];
export const CONTROLLER_CONN = [
  { id: 'wired', name: 'Wired USB', latency: 0 }, { id: 'wireless-dongle', name: '2.4 GHz dongle (Xbox Wireless Adapter / official dongle)', latency: 1 }, { id: 'bluetooth', name: 'Bluetooth', latency: 6, note: 'Bluetooth controller: 5-10 ms extra latency and 125 Hz polling. Xbox Wireless Adapter or cable is better.' },
];
export const AUDIO_CONN = [
  { id: 'motherboard', name: 'Motherboard 3.5 mm' }, { id: 'usb-dac', name: 'USB DAC / headset' }, { id: 'interface', name: 'USB audio interface' }, { id: 'wireless-dongle', name: 'Wireless headset (dongle)' }, { id: 'bluetooth', name: 'Bluetooth audio', note: 'Bluetooth audio: 100-200 ms delay unless aptX LL/LE Audio. Noticeable in rhythm and shooter games.' }, { id: 'hdmi-dp', name: 'Monitor speakers (HDMI/DP audio)' },
];
export const LAPTOP_GPU_MODE = [
  { id: 'mux', name: 'dGPU direct / MUX switch (Ultimate mode)', gpu: 1.0 }, { id: 'optimus', name: 'Hybrid / Optimus (iGPU drives the panel)', gpu: 0.94, note: 'Hybrid mode routes frames through the iGPU: ~5% fps and 3-8 ms latency.' }, { id: 'advanced-optimus', name: 'Advanced Optimus (auto-switching)', gpu: 0.99 }, { id: 'external', name: 'External monitor on the dGPU port', gpu: 1.0 },
];
