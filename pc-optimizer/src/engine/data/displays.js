// Effective payload bandwidth (Gbit/s) after link overhead.
export const LINKS = {
  'HDMI1.4': { gbps: 8.16, dsc: false, label: 'HDMI 1.4' },
  'HDMI2.0': { gbps: 14.4, dsc: false, label: 'HDMI 2.0' },
  'HDMI2.1': { gbps: 42.0, dsc: true, label: 'HDMI 2.1 (48G FRL)' },
  'HDMI2.1-24': { gbps: 21.0, dsc: true, label: 'HDMI 2.1 (24G, TV-class)' },
  'DP1.2': { gbps: 17.28, dsc: false, label: 'DisplayPort 1.2' },
  'DP1.4': { gbps: 25.92, dsc: true, label: 'DisplayPort 1.4 (HBR3)' },
  'DP2.1-UHBR10': { gbps: 38.7, dsc: true, label: 'DisplayPort 2.1 UHBR10' },
  'DP2.1-UHBR13.5': { gbps: 52.2, dsc: true, label: 'DisplayPort 2.1 UHBR13.5' },
  'DP2.1-UHBR20': { gbps: 77.4, dsc: true, label: 'DisplayPort 2.1 UHBR20' },
  'USB-C-DP1.4-2lane': { gbps: 12.96, dsc: true, label: 'USB-C DP Alt Mode (2 lanes, hub/dock)' },
  'USB-C-DP1.4-4lane': { gbps: 25.92, dsc: true, label: 'USB-C DP Alt Mode (4 lanes, direct)' },
};
export const COMMON_RES = [
  { w: 1280, h: 720, label: '1280x720 (720p)' }, { w: 1280, h: 800, label: '1280x800 (Steam Deck)' }, { w: 1920, h: 1080, label: '1920x1080 (1080p)' }, { w: 1920, h: 1200, label: '1920x1200' },
  { w: 2560, h: 1440, label: '2560x1440 (1440p)' }, { w: 2560, h: 1600, label: '2560x1600' }, { w: 3440, h: 1440, label: '3440x1440 (UW 1440p)' }, { w: 3840, h: 1600, label: '3840x1600 (UW)' }, { w: 3840, h: 2160, label: '3840x2160 (4K)' }, { w: 5120, h: 1440, label: '5120x1440 (Super UW)' }, { w: 5120, h: 2880, label: '5120x2880 (5K)' },
];
export const REFRESH = [60, 75, 90, 100, 120, 144, 165, 175, 180, 240, 280, 300, 360, 480, 500, 540];

// Required payload Gbps for a mode. CVT-RB2 blanking ~ 7%; add 2% for audio/aux.
export function requiredGbps(w, h, hz, bpc = 8) {
  return (w * h * hz * bpc * 3 * 1.09) / 1e9;
}
export function linkCheck(w, h, hz, bpc, linkKey, monitorDsc = true) {
  const link = LINKS[linkKey];
  if (!link) return { ok: true, note: 'Unknown link; cannot verify bandwidth.' };
  const need = requiredGbps(w, h, hz, bpc);
  const dscOk = link.dsc && monitorDsc;
  if (need <= link.gbps) return { ok: true, need, cap: link.gbps, dsc: false };
  if (dscOk && need <= link.gbps * 2.9) return { ok: true, need, cap: link.gbps, dsc: true, note: `Runs with DSC (visually lossless) over ${link.label}.` };
  // find max refresh that fits
  let maxHz = Math.floor((link.gbps * (dscOk ? 2.9 : 1) * 1e9) / (w * h * bpc * 3 * 1.09));
  let maxHz8 = Math.floor((link.gbps * (dscOk ? 2.9 : 1) * 1e9) / (w * h * 8 * 3 * 1.09));
  return { ok: false, need, cap: link.gbps, maxHz, maxHz8, note: `${link.label} cannot carry ${w}x${h}@${hz} at ${bpc}-bit${dscOk ? ' even with DSC' : ' (no DSC)'}. Max ${maxHz} Hz at ${bpc}-bit, ${maxHz8} Hz at 8-bit.` };
}
