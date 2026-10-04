import si from 'systeminformation';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const run = (cmd, args, timeout = 4000) => new Promise((res) => { execFile(cmd, args, { timeout, windowsHide: true }, (err, out) => res(err ? null : String(out))); });

async function nvidiaInfo() {
  const out = await run('nvidia-smi', ['--query-gpu=name,pcie.link.gen.max,pcie.link.width.max,display_active,power.limit', '--format=csv,noheader,nounits']);
  if (!out) return null;
  const [name, gen, width, displayActive, powerLimit] = out.trim().split('\n')[0].split(',').map((x) => x.trim());
  return { name, pcieGen: +gen || null, pcieWidth: +width || null, displayActive: /enabled/i.test(displayActive), powerLimitW: +powerLimit || null };
}

async function obsEncoder() {
  const base = process.platform === 'win32' ? path.join(process.env.APPDATA || '', 'obs-studio') : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'obs-studio') : path.join(os.homedir(), '.config', 'obs-studio');
  try {
    const profiles = await fs.readdir(path.join(base, 'basic', 'profiles'));
    for (const p of profiles) {
      const ini = await fs.readFile(path.join(base, 'basic', 'profiles', p, 'basic.ini'), 'utf8').catch(() => '');
      const mode = (ini.match(/^Mode=(\w+)/m) || [])[1];
      const enc = mode === 'Advanced' ? (ini.match(/^\[AdvOut\][\s\S]*?^Encoder=(.+)$/m) || [])[1] : (ini.match(/^\[SimpleOutput\][\s\S]*?^StreamEncoder=(.+)$/m) || [])[1];
      if (enc) return enc.trim();
    }
  } catch {}
  return null;
}

async function processNames() {
  try { const p = await si.processes(); return [...new Set(p.list.map((x) => (x.name || '').toLowerCase()))]; } catch { return []; }
}

export async function detectHardware() {
  const [cpu, graphics, mem, memLayout, diskLayout, battery, usb, osInfo, system, netIfaces, wifi, nvidia, procs, obs] = await Promise.all([
    si.cpu(), si.graphics(), si.mem(), si.memLayout(), si.diskLayout(), si.battery(), si.usb().catch(() => []), si.osInfo(), si.system().catch(() => ({})),
    si.networkInterfaces('default').catch(() => null), si.wifiConnections().catch(() => []), nvidiaInfo(), processNames(), obsEncoder(),
  ]);
  return { cpu, graphics, mem, memLayout, diskLayout, battery, usb, osInfo, system, net: { iface: Array.isArray(netIfaces) ? netIfaces[0] : netIfaces, wifi: wifi[0] || null }, nvidia, processes: procs, obsEncoder: obs, platform: process.platform };
}
