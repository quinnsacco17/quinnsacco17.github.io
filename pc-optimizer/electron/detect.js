import si from 'systeminformation';
export async function detectHardware() {
  const [cpu, graphics, mem, memLayout, diskLayout, battery, usb, osInfo] = await Promise.all([
    si.cpu(), si.graphics(), si.mem(), si.memLayout(), si.diskLayout(), si.battery(), si.usb().catch(() => []), si.osInfo(),
  ]);
  return { cpu, graphics, mem, memLayout, diskLayout, battery, usb, osInfo };
}
