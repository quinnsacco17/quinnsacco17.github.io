import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { networkAdvice } from '../src/engine/network.js';

// Local server throttled to known speeds: 40 Mbps down, 10 Mbps up, ~30 ms latency.
function server() {
  const DOWN = 40e6 / 8, UP = 10e6 / 8, LAT = 30; let linkFree = 0; // shared link: one bucket for all connections
  const reserve = (n) => { const t = Math.max(Date.now(), linkFree) + (n / DOWN) * 1000; linkFree = t; return t - Date.now(); };
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__down') {
      const total = +u.searchParams.get('bytes') || 0; let sent = 0;
      setTimeout(() => { res.writeHead(200, { 'content-length': total }); if (!total) return res.end(); const chunk = Buffer.alloc(16384); const tick = () => { const n = Math.min(chunk.length, total - sent); res.write(chunk.subarray(0, n)); sent += n; if (sent >= total) return res.end(); setTimeout(tick, reserve(n)); }; tick(); }, LAT);
    } else if (u.pathname === '/__up') {
      let got = 0, t0 = Date.now(); req.on('data', (c) => { got += c.length; }); req.on('end', () => { const need = (got / UP) * 1000 - (Date.now() - t0); setTimeout(() => { res.writeHead(200); res.end('ok'); }, Math.max(0, need) + LAT); });
    } else if (u.pathname === '/blocked/__down') { res.writeHead(403); res.end('nope'); }
  });
}

test('speed test measures throttled down/up/ping within tolerance', { timeout: 60000 }, async () => {
  const srv = server(); await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  process.env.SPEEDTEST_BASE = `http://127.0.0.1:${port}`;
  const { speedTest } = await import('../electron/speedtest.js?' + port);
  const r = await speedTest();
  srv.close();
  assert.ok(r.ping > 20 && r.ping < 80, `ping ${r.ping}`);
  assert.ok(r.down > 25 && r.down < 60, `down ${r.down}`);
  assert.ok(r.up > 6 && r.up < 14, `up ${r.up}`);
});

test('blocked server gives a clear error', { timeout: 30000 }, async () => {
  const srv = server(); await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  process.env.SPEEDTEST_BASE = `http://127.0.0.1:${port}/blocked`;
  const { speedTest } = await import('../electron/speedtest.js?b' + port);
  await assert.rejects(speedTest(), /403/);
  srv.close();
});

test('network advice', () => {
  const a = networkAdvice({ down: 300, up: 20, ping: 12, jitter: 2 }, { network: 'eth1' });
  assert.equal(a.online.level, 'Excellent'); assert.match(a.cloud[0].text, /4K/); assert.equal(a.streaming.twitch.kbps, 6000); assert.match(a.streaming.text, /YouTube/);
  const b = networkAdvice({ down: 18, up: 3, ping: 95, jitter: 20 }, { network: 'wifi24' });
  assert.equal(b.online.level, 'Poor'); assert.match(b.cloud[0].text, /720p/); assert.match(b.cloud[0].text, /input lag/); assert.ok(b.notes.length >= 2); assert.equal(b.streaming.twitch.res, '720p 30 fps'); assert.ok(b.streaming.twitch.kbps <= 2250);
  assert.equal(networkAdvice({ up: 2 }).streaming.twitch, null);
});
