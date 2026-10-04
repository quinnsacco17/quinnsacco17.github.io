// Representative preview renderer. Not game footage: a synthetic scene whose shadows, AO, fog, reflections,
// texture detail, draw distance, AA and upscaling react to the chosen settings.
export function renderPreview(canvas, state) {
  const W = canvas.width, H = canvas.height;
  const q = (k, d = 3) => (state[k] == null ? d : state[k]); // 0..3 levels
  const tex = q('textures'), sh = q('shadows', q('vsm')), ao = q('ao', 3), vol = q('volumetrics'), refl = q('reflections', q('lrefl')), draw = q('draw'), fx = q('effects', 3), aa = q('aa', 2), mblur = q('mblur', 0), gi = q('gi', 3), rt = state.rt || 0;
  const scale = state.upscale ?? 1, upTech = state.upTech || 'fsr3';
  const aaLevels = [1, 1, 1];
  const iw = Math.max(64, Math.round(W * scale)), ih = Math.max(36, Math.round(H * scale));
  const off = document.createElement('canvas'); off.width = iw; off.height = ih;
  const c = off.getContext('2d');
  const s = iw / 640;
  // sky
  const sky = c.createLinearGradient(0, 0, 0, ih); sky.addColorStop(0, '#5a7fb5'); sky.addColorStop(0.55, '#c9d9ee'); sky.addColorStop(0.56, '#6d7a5a'); sky.addColorStop(1, '#3f4a33');
  c.fillStyle = sky; c.fillRect(0, 0, iw, ih);
  const horizon = ih * 0.55;
  // mountains: draw distance decides how many layers show; fog hides the far ones
  const layers = [[0.9, '#3d4f6e'], [0.78, '#4f6383'], [0.66, '#62789a']];
  layers.slice(0, 1 + draw).forEach(([depth, col], li) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, horizon);
    for (let x = 0; x <= iw; x += 8 * s) { const y = horizon - (Math.sin(x * 0.012 / s + li) * 0.5 + 0.5) * ih * (0.12 + 0.08 * li) * depth; c.lineTo(x, y); }
    c.lineTo(iw, horizon); c.closePath(); c.fill();
  });
  // ground texture (checker whose sharpness depends on tex level)
  const cell = [48, 32, 20, 12][tex] * s;
  for (let y = horizon; y < ih; y += cell / 2) { const t = (y - horizon) / (ih - horizon); const cw = cell * (0.3 + t); for (let x = -cw; x < iw; x += cw) { const k = (Math.floor(x / cw) + Math.floor((y - horizon) / (cell / 2))) % 2; c.fillStyle = k ? `rgb(${86 + 20 * t},${98 + 20 * t},${70 + 10 * t})` : `rgb(${72 + 20 * t},${84 + 20 * t},${58 + 10 * t})`; c.fillRect(x, y, cw, cell / 2); } }
  if (tex < 2) { c.fillStyle = `rgba(120,130,100,${0.35 - tex * 0.15})`; c.fillRect(0, horizon, iw, ih - horizon); }
  // water strip with reflections
  const wy = ih * 0.8, wh = ih * 0.08;
  c.fillStyle = '#4a6a8a'; c.fillRect(0, wy, iw, wh);
  // pillars
  const pillars = [[0.2, 0.9], [0.45, 1.0], [0.72, 0.8]];
  const sun = { x: 0.3, y: -0.6 };
  pillars.forEach(([px, ph]) => {
    const x = px * iw, base = ih * 0.78, h = ih * 0.28 * ph, w = 26 * s;
    // shadow: resolution by level, softness by RT
    const shLen = h * 0.9;
    const steps = [2, 4, 8, 16][sh] + (rt ? 8 : 0);
    for (let i = 0; i < steps; i++) { const t = i / steps; c.fillStyle = `rgba(20,25,20,${(rt ? 0.5 : 0.65) * (1 - t * (rt ? 0.9 : 0.3)) / steps * 2.2})`; c.fillRect(x + w / 2 + sun.x * shLen * t * 2.2 - w * 0.5 - (rt ? t * 4 * s : 0), base - 2 * s + t * 1, w + (rt ? t * 8 * s : 0), 6 * s); }
    // AO at contact
    if (ao > 0) { const g = c.createRadialGradient(x + w / 2, base, 0, x + w / 2, base, w * (0.8 + ao * 0.3)); g.addColorStop(0, `rgba(0,0,0,${0.15 + ao * 0.12})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - w, base - w / 2, w * 3, w); }
    // body
    const bg = c.createLinearGradient(x, 0, x + w, 0); bg.addColorStop(0, rt || gi >= 2 ? '#b8a890' : '#a89a86'); bg.addColorStop(0.6, '#8a7f70'); bg.addColorStop(1, gi >= 1 ? '#6a6459' : '#55504a');
    c.fillStyle = bg; c.fillRect(x, base - h, w, h);
    if (tex >= 2) { c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = Math.max(1, s * 0.7); for (let y = base - h + 10 * s; y < base; y += (tex === 3 ? 7 : 12) * s) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke(); } }
    // reflection
    if (refl > 0 || rt) { const rq = rt ? 1 : [0, 0.35, 0.65, 1][refl]; c.save(); c.globalAlpha = 0.35 + 0.25 * rq; c.translate(0, wy * 2 + 4 * s); c.scale(1, -1); if (rq < 1) { c.filter = `blur(${(1 - rq) * 4 * s}px)`; } c.fillStyle = bg; c.fillRect(x, wy - (wh * (0.6 + 0.4 * rq)) + wy - base + h, w, wh * (0.6 + 0.4 * rq)); c.restore(); }
  });
  // volumetric light shafts / fog
  if (vol > 0) { for (let i = 0; i < vol * 2; i++) { const g = c.createLinearGradient(iw * (0.1 + i * 0.12), 0, iw * (0.25 + i * 0.12), ih * 0.7); g.addColorStop(0, `rgba(255,240,200,${0.12 + vol * 0.03})`); g.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(iw * (0.1 + i * 0.12), 0); c.lineTo(iw * (0.18 + i * 0.12), 0); c.lineTo(iw * (0.33 + i * 0.12), ih * 0.75); c.lineTo(iw * (0.2 + i * 0.12), ih * 0.75); c.fill(); } }
  const fogA = draw === 3 ? 0.05 : draw === 2 ? 0.12 : draw === 1 ? 0.25 : 0.4;
  const fog = c.createLinearGradient(0, horizon - ih * 0.2, 0, horizon + ih * 0.05); fog.addColorStop(0, `rgba(200,215,235,${fogA})`); fog.addColorStop(1, 'rgba(200,215,235,0)'); c.fillStyle = fog; c.fillRect(0, 0, iw, horizon + ih * 0.05);
  // particles
  const n = [6, 16, 32, 60][fx]; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { c.fillStyle = `rgba(255,${200 + Math.floor(rnd() * 55)},150,${0.3 + rnd() * 0.5})`; const r = (1 + rnd() * 2) * s; c.beginPath(); c.arc(rnd() * iw, horizon + rnd() * (ih - horizon) * 0.9, r, 0, 7); c.fill(); }
  // compose: upscale with technique-dependent softness, AA
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = aa > 0 || scale < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'none';
  if (scale < 1) { const soft = { dlss4: 0.15, dlss3: 0.3, dlss2: 0.35, fsr4: 0.3, fsr3: 0.7, xessXMX: 0.35, xess: 0.7 }[upTech] ?? 0.6; ctx.filter = `blur(${(1 - scale) * soft * 2}px) contrast(1.02)`; }
  else if (aa === 0) { ctx.imageSmoothingEnabled = false; }
  ctx.drawImage(off, 0, 0, W, H);
  ctx.filter = 'none';
  if (aa === 0 && scale >= 1) { // emphasize jaggies by re-sampling at 85%
    const t = document.createElement('canvas'); t.width = Math.round(W * 0.85); t.height = Math.round(H * 0.85); const tc = t.getContext('2d'); tc.imageSmoothingEnabled = false; tc.drawImage(off, 0, 0, t.width, t.height); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, W, H);
  }
  if (mblur) { ctx.globalAlpha = 0.35; for (let i = 1; i <= 3; i++) ctx.drawImage(canvas, i * 2, 0); ctx.globalAlpha = 1; }
  // overlay label
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, H - 18, W, 18); ctx.fillStyle = '#fff'; ctx.font = '11px system-ui'; ctx.fillText(`Representative preview (not game footage) · internal ${Math.round(scale * 100)}% · ${rt ? 'RT on' : 'RT off'}`, 6, H - 5);
}

export const SETTING_EXPLAIN = {
  textures: ['Blurry surfaces up close, pop-in on 8 GB cards is actually reduced.', 'Noticeably soft on walls and ground.', 'Sharp at normal viewing distance; only differs from Ultra when inspecting.', 'Full-resolution textures. Costs VRAM, not fps, as long as it fits.'],
  shadows: ['Blocky, shimmering shadow edges; distant shadows disappear.', 'Soft but low-res; fine in motion.', 'Clean edges; hard to tell from Ultra while playing.', 'Highest cascade resolution. Usually 6-10% fps for a subtle gain.'],
  vsm: ['Low-res shadow maps; noticeable aliasing on edges.', 'Decent; some flicker in foliage shadows.', 'Clean, stable shadows.', 'Highest resolution; small visual gain for a measurable cost.'],
  ao: ['Flat look: objects float on the ground.', 'Basic contact shadows.', 'Good depth in corners and under objects.', 'Highest quality; tiny gain over High.'],
  volumetrics: ['Flat fog, no light shafts.', 'Light shafts present but grainy.', 'Smooth god rays and clouds.', 'Highest resolution volumetrics: one of the most expensive settings.'],
  reflections: ['No screen-space reflections; puddles look dull.', 'Low-res reflections, obvious noise.', 'Clean reflections in motion.', 'Full-res SSR; costly in wet or glossy scenes.'],
  lrefl: ['Screen-space fallback; reflections vanish at screen edges.', 'Lumen reflections at low res.', 'Stable, accurate reflections.', 'Max quality; mostly matters on mirrors/water.'],
  gi: ['Static-looking lighting; no bounced light.', 'Software Lumen low: soft bounce light, some noise.', 'Convincing indirect light.', 'Hardware-grade GI; the single most expensive UE5 setting.'],
  draw: ['Objects and shadows pop in close to you.', 'Pop-in visible in open areas.', 'Pop-in only at long range.', 'Everything renders to the horizon. Mostly a CPU cost.'],
  foliage: ['Sparse grass, visible pop-in.', 'Reasonable density.', 'Dense foliage.', 'Max density and distance; CPU and GPU cost.'],
  effects: ['Fewer particles, simplified explosions.', 'Moderate particles.', 'Full effects.', 'Max particle counts; only matters in heavy combat.'],
  crowd: ['Streets look empty.', 'Some NPCs.', 'Lively.', 'Dense crowds: directly a CPU frametime cost.'],
  aa: ['Jagged edges and shimmering; sharpest image.', 'Smooth edges, slight softness.', 'Smooth and stable.'],
  post: ['Fewer post effects; sharper, flatter look.', 'Full bloom, DoF, chromatic aberration.'],
  mblur: ['Off: clearest image in motion. Recommended for anything competitive.', 'On: cinematic smear; hides low fps.'],
  water: ['Flat water.', 'Basic waves.', 'Good waves and foam.', 'Simulated water; expensive near rivers/ocean.'],
  hair: ['Hair cards only.', 'Some strand hair.', 'Strand hair on main characters.', 'Full strand hair everywhere.'],
  tess: ['Flat terrain detail.', 'Some displacement.', 'Detailed terrain.', 'Max tessellation.'],
  physics: ['Minimal debris.', 'Some destruction.', 'Full destruction.', 'Max physics objects (CPU).'],
  renderdist: ['Fog very close.', 'Short view.', 'Standard.', 'Far horizon.', 'Very far; heavy CPU and RAM.'],
  shaders: ['Vanilla look, max fps.', 'Shadows and water with low cost.', 'Full shadows, reflections, volumetrics.', 'Path-traced look; only high-end GPUs.'],
  sim: ['Fewer active mobs/farms.', 'Standard.', 'Large active area.', 'Max simulation; CPU heavy.'],
  gq: ['Flat lighting, short view.', 'Standard look.', 'Shadows and far view.', 'Max shadows, lighting, and distance.'],
};
