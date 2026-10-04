// Speed test against Cloudflare's public speed endpoints (the same ones speed.cloudflare.com uses).
const BASE = process.env.SPEEDTEST_BASE || 'https://speed.cloudflare.com';
const now = () => performance.now();
async function timed(url, init, expect) { const t0 = now(); const r = await fetch(url, { cache: 'no-store', ...init }); const t1 = now(); if (!r.ok) throw new Error(`Speed test server answered ${r.status}. A firewall or VPN may be blocking speed.cloudflare.com.`); const buf = await r.arrayBuffer(); if (expect && buf.byteLength < expect * 0.95) throw new Error('Download was cut short. Try again.'); return { ttfb: t1 - t0, total: now() - t0, bytes: buf.byteLength }; }

export async function speedTest(progress = () => {}) {
  const pings = [];
  let lastErr = null;
  for (let i = 0; i < 12; i++) { try { const r = await timed(`${BASE}/__down?bytes=0&r=${Math.random()}`); pings.push(r.ttfb); } catch (e) { lastErr = e; } progress({ stage: 'ping', pct: (i + 1) / 12 }); }
  if (pings.length < 3) throw new Error(lastErr?.message || 'Could not reach the speed test server. Check your internet connection.');
  pings.shift(); // first request includes connection setup
  const sorted = [...pings].sort((a, b) => a - b); const ping = sorted[Math.floor(sorted.length / 2)];
  let jit = 0; for (let i = 1; i < pings.length; i++) jit += Math.abs(pings[i] - pings[i - 1]); const jitter = jit / (pings.length - 1);
  // Download: grow the size until a request takes > 1.5 s, then run 4 in parallel.
  let size = 1e6, down = 0;
  for (let i = 0; i < 5; i++) { const r = await timed(`${BASE}/__down?bytes=${size}`, undefined, size); down = (r.bytes * 8) / (r.total / 1000) / 1e6; progress({ stage: 'download', pct: (i + 1) / 7 }); if (r.total > 1500 || size >= 1e8) break; size *= 4; }
  { const t0 = now(); const rs = await Promise.all([0, 1, 2, 3].map(() => timed(`${BASE}/__down?bytes=${size}`))); const bytes = rs.reduce((a, r) => a + r.bytes, 0); down = Math.max(down, (bytes * 8) / ((now() - t0) / 1000) / 1e6); }
  progress({ stage: 'upload', pct: 0 });
  let upSize = 1e6, up = 0;
  for (let i = 0; i < 4; i++) { const body = new Uint8Array(upSize); const t0 = now(); await fetch(`${BASE}/__up`, { method: 'POST', body, cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`Upload test failed (${r.status}).`); return r.arrayBuffer(); }); const t = now() - t0; up = (upSize * 8) / (t / 1000) / 1e6; progress({ stage: 'upload', pct: (i + 1) / 4 }); if (t > 1500 || upSize >= 5e7) break; upSize *= 4; }
  return { down, up, ping, jitter, at: new Date().toISOString() };
}
