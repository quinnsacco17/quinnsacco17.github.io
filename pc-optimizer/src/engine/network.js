// Turns a speed test result into gaming advice. Thresholds follow the services' published guidance.
const rate = (v, bands) => bands.find(([max]) => v <= max)[1];

export function networkAdvice(net, ctx = {}) {
  const { down, up, ping, jitter } = net;
  const out = { online: null, cloud: [], streaming: null, download: null, notes: [] };
  if (ping != null) {
    const level = rate(ping, [[25, 'Excellent'], [45, 'Good'], [80, 'OK'], [130, 'Poor'], [Infinity, 'Bad']]);
    const j = jitter != null ? rate(jitter, [[4, 'steady'], [12, 'a bit uneven'], [Infinity, 'very uneven']]) : null;
    out.online = { level, text: `${level} for online games: ${Math.round(ping)} ms to the nearest internet hub${j ? `, ${j} (jitter ${jitter.toFixed(1)} ms)` : ''}. Your ping in a game also depends on how far the game server is.` };
    if (jitter != null && jitter > 12) out.notes.push('High jitter causes rubber-banding. Plug in Ethernet, or move closer to the router and use 5 or 6 GHz Wi-Fi.');
  }
  if (ctx.network === 'wifi24') out.notes.push('You are on 2.4 GHz Wi-Fi. Switching to 5 or 6 GHz, or Ethernet, usually cuts lag spikes the most.');
  if (ctx.network === 'hotspot') out.notes.push('Phone hotspots add a lot of latency and data caps. Fine for casual games, rough for competitive ones.');
  if (down != null) {
    const okLatency = ping == null || ping <= 80;
    const gfn = down >= 65 ? '4K at 60-120 fps (Ultimate tier)' : down >= 45 ? '1440p at 120 fps' : down >= 25 ? '1080p at 60 fps' : down >= 15 ? '720p at 60 fps' : 'not enough (needs 15 Mbps)';
    out.cloud.push({ service: 'GeForce NOW', text: okLatency ? gfn : `${gfn}, but your ping is high, so expect input lag` });
    out.cloud.push({ service: 'Xbox Cloud Gaming', text: down >= 20 ? (okLatency ? '1080p, smooth' : '1080p, but expect input lag') : down >= 10 ? 'playable at reduced quality' : 'not enough (needs 10-20 Mbps)' });
    out.download = `A 100 GB game takes about ${fmtTime((100 * 8000) / (down * 0.9))} to download.`;
  }
  if (up != null) {
    const usable = up * 0.75 * 1000; // kbps, leave headroom
    const twitch = usable >= 6000 ? { res: '1080p 60 fps', kbps: 6000 } : usable >= 4500 ? { res: '900p 60 fps', kbps: Math.floor(usable / 500) * 500 } : usable >= 3000 ? { res: '720p 60 fps', kbps: Math.floor(usable / 500) * 500 } : usable >= 2000 ? { res: '720p 30 fps', kbps: Math.floor(usable / 500) * 500 } : null;
    const yt = usable >= 18000 ? { res: '1440p 60 fps', kbps: 18000 } : usable >= 9000 ? { res: '1080p 60 fps', kbps: Math.min(12000, Math.floor(usable / 1000) * 1000) } : usable >= 4500 ? { res: '720p 60 fps', kbps: Math.floor(usable / 500) * 500 } : null;
    out.streaming = { twitch, youtube: yt, text: twitch ? `Streaming: set OBS to ${twitch.res} at ${twitch.kbps} kbps for Twitch${yt ? `, or ${yt.res} at ${yt.kbps} kbps for YouTube` : ''}.` : `Your upload (${up.toFixed(1)} Mbps) is too low to stream reliably. Recording locally works fine.` };
  }
  return out;
}
function fmtTime(sec) { if (sec < 90) return `${Math.round(sec)} seconds`; if (sec < 5400) return `${Math.round(sec / 60)} minutes`; return `${(sec / 3600).toFixed(1)} hours`; }
