// Per-game config writers. Each adapter: locate file, back it up, write mapped values, report what was skipped.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const home = os.homedir();
const LOCAL = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
const ROAMING = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
const DOCS = path.join(home, 'Documents');
const SAVED = path.join(home, 'Saved Games');
const ueMap = (v) => Math.max(0, Math.min(3, v)); // our 0..3 -> UE sg.* 0..3 (4 = cinematic)

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
async function backup(p) { const b = `${p}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`; await fs.copyFile(p, b); return b; }

// INI helpers (UE GameUserSettings.ini and similar)
function setIni(text, section, key, value) {
  const lines = text.split(/\r?\n/); let inSec = false, secIdx = -1, done = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith('[')) { if (inSec && !done) { lines.splice(i, 0, `${key}=${value}`); done = true; break; } inSec = l === `[${section}]`; if (inSec) secIdx = i; continue; }
    if (inSec && l.split('=')[0].trim() === key) { lines[i] = `${key}=${value}`; done = true; break; }
  }
  if (!done) { if (secIdx === -1) lines.push(`[${section}]`); lines.push(`${key}=${value}`); }
  return lines.join('\r\n');
}
function ueWriter(file, extra = {}) {
  return {
    path: file, label: 'Unreal Engine GameUserSettings.ini',
    async write(values) {
      let text = (await exists(file)) ? await fs.readFile(file, 'utf8') : '';
      const s = values.settings; let n = 0; const skipped = [];
      const map = { textures: 'sg.TextureQuality', shadows: 'sg.ShadowQuality', vsm: 'sg.ShadowQuality', gi: 'sg.GlobalIlluminationQuality', lrefl: 'sg.ReflectionQuality', reflections: 'sg.ReflectionQuality', volumetrics: 'sg.ShadingQuality', post: 'sg.PostProcessQuality', effects: 'sg.EffectsQuality', foliage: 'sg.FoliageQuality', draw: 'sg.ViewDistanceQuality', aa: 'sg.AntiAliasingQuality', ao: null, mblur: null, crowd: null, hair: 'sg.ShadingQuality', physics: 'sg.EffectsQuality', ...extra.map };
      for (const [k, v] of Object.entries(s)) { const key = map[k]; if (!key) { skipped.push(k); continue; } text = setIni(text, 'ScalabilityGroups', key, ueMap(v)); n++; }
      if (s.post !== undefined && s.post === 0) { text = setIni(text, 'ScalabilityGroups', 'sg.PostProcessQuality', 1); }
      text = setIni(text, '/Script/Engine.GameUserSettings', 'ResolutionSizeX', values.w); text = setIni(text, '/Script/Engine.GameUserSettings', 'ResolutionSizeY', values.h); text = setIni(text, '/Script/Engine.GameUserSettings', 'FullscreenMode', 0); text = setIni(text, '/Script/Engine.GameUserSettings', 'FrameRateLimit', `${(values.hz || 0).toFixed(6)}`); n += 4;
      // resolution scale when no vendor upscaler mapping
      const scale = { native: 100, dlaa: 100, quality: 67, balanced: 58, performance: 50, ultraperf: 33 }[values.mode] ?? 100;
      if (!values.upscaler) { text = setIni(text, '/Script/Engine.GameUserSettings', 'ResolutionScale', scale); n++; } else skipped.push(`${values.upscaler} mode (set in-game)`);
      if (values.fg && values.fg !== 'off') skipped.push('frame generation (set in-game)');
      return { text, n, skipped };
    },
  };
}
function kvWriter(file, label, mapping, quote = true) {
  // Source2/Source "key" "value" style
  return {
    path: file, label,
    async write(values) {
      let text = await fs.readFile(file, 'utf8'); let n = 0; const skipped = [];
      const pairs = mapping(values);
      for (const [k, v] of pairs) {
        if (v == null) continue;
        const re = new RegExp(`("${k.replace(/\./g, '\\.')}"\\s+)"[^"]*"`);
        if (re.test(text)) { text = text.replace(re, `$1"${v}"`); n++; }
        else if (quote) { text = text.replace(/\n}\s*$/, `\n\t"${k}"\t\t"${v}"\n}\n`); n++; }
      }
      return { text, n, skipped };
    },
  };
}

const ADAPTERS = {
  fortnite: () => {
    const w = ueWriter(path.join(LOCAL, 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini'), { map: { gi: null, lrefl: null, vsm: 'sg.ShadowQuality' } });
    const base = w.write.bind(w);
    w.write = async (values) => {
      const r = await base(values); const s = values.settings; const S = '/Script/FortniteGame.FortGameUserSettings';
      if (s.gi != null) { r.text = setIni(r.text, S, 'DesiredGlobalIlluminationQuality', ueMap(s.gi)); r.n++; }
      if (s.lrefl != null) { r.text = setIni(r.text, S, 'DesiredReflectionQuality', ueMap(s.lrefl)); r.n++; }
      r.text = setIni(r.text, S, 'bMotionBlur', s.mblur ? 'True' : 'False'); r.text = setIni(r.text, S, 'LatencyTweak2', 2); r.text = setIni(r.text, S, 'FortAntiAliasingMethod', (s.aa ?? 2) === 0 ? 'FXAA' : 'TSRHigh'); r.n += 3;
      if (values.upscaler === 'dlss' && values.mode !== 'native') r.text = setIni(r.text, S, 'bEnableDLSSFrameGeneration', values.fg && values.fg !== 'off' ? 'True' : 'False');
      r.skipped = r.skipped.filter((k) => !['gi', 'lrefl'].includes(k));
      return r;
    };
    return w;
  },
  rivals: () => {
    const w = ueWriter(path.join(LOCAL, 'Marvel', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini'));
    const base = w.write.bind(w);
    w.write = async (values) => { const r = await base(values); const S = '/Script/Marvel.MarvelGameUserSettings'; r.text = setIni(r.text, S, 'bNvidiaReflex', 'True'); r.text = setIni(r.text, S, 'bDlssFrameGeneration', values.upscaler === 'dlss' && values.fg !== 'off' ? 'True' : 'False'); r.text = setIni(r.text, S, 'bFSRFrameGeneration', values.upscaler === 'fsr' && values.fg !== 'off' ? 'True' : 'False'); r.n += 3; return r; };
    return w;
  },
  finals: () => ueWriter(path.join(LOCAL, 'Discovery', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  palworld: () => ueWriter(path.join(LOCAL, 'Pal', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  wukong: () => ueWriter(path.join(LOCAL, 'b1', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  stalker2: () => ueWriter(path.join(LOCAL, 'Stalker2', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  oblivion: () => ueWriter(path.join(DOCS, 'My Games', 'Oblivion Remastered', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  expedition33: () => ueWriter(path.join(LOCAL, 'Sandfall', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  pubg: () => ueWriter(path.join(LOCAL, 'TslGame', 'Saved', 'Config', 'WindowsNoEditor', 'GameUserSettings.ini')),
  cs2: () => ({
    path: 'Steam\\userdata\\<account>\\730\\local\\cfg\\cs2_video.txt', label: 'Counter-Strike 2 video config (cs2_video.txt)',
    async resolve() {
      const roots = [process.env.STEAM_USERDATA, 'C:\\Program Files (x86)\\Steam\\userdata', 'C:\\Steam\\userdata', 'D:\\Steam\\userdata', 'D:\\SteamLibrary\\userdata', 'E:\\Steam\\userdata', 'F:\\SteamLibrary\\userdata'].filter(Boolean);
      for (const r of roots) { if (!(await exists(r))) continue; const ids = await fs.readdir(r); let best = null; for (const id of ids) { const p = path.join(r, id, '730', 'local', 'cfg', 'cs2_video.txt'); if (await exists(p)) { const st = await fs.stat(p); if (!best || st.mtimeMs > best.m) best = { p, m: st.mtimeMs }; } } if (best) return best.p; }
      return null;
    },
    async write(values) {
      const s = values.settings; const hz = values.hz || 0;
      return kvWriter(this.path, this.label, (v) => [
        ['setting.defaultres', v.w], ['setting.defaultresheight', v.h], ['setting.fullscreen', 1], ['setting.coop_fullscreen', 0], ['setting.nowindowborder', 0], ['setting.mat_vsync', 0],
        ['setting.refreshrate_numerator', hz ? Math.round(hz * 1000) : 0], ['setting.refreshrate_denominator', hz ? 1000 : 0],
        ['setting.videocfg_shadow_quality', Math.min(3, s.shadows ?? 3)], ['setting.videocfg_dynamic_shadows', (s.shadows ?? 3) >= 2 ? 1 : 0], ['setting.videocfg_texture_detail', Math.min(2, s.textures ?? 3)], ['setting.videocfg_particle_detail', Math.min(3, s.effects ?? 3)], ['setting.videocfg_ao_detail', Math.min(2, s.ao ?? 3)],
        ['setting.shaderquality', (s.effects ?? 3) >= 2 ? 1 : 0], ['setting.r_texturefilteringquality', (s.textures ?? 3) >= 2 ? 5 : 3], ['setting.msaa_samples', (s.aa ?? 2) === 0 ? 0 : (s.aa === 1 ? 2 : 4)], ['setting.r_csgo_cmaa_enable', (s.aa ?? 2) === 0 ? 1 : 0],
        ['setting.r_low_latency', 2], ['setting.r_player_visibility_mode', 1], ['setting.videocfg_fsr_detail', v.upscaler === 'fsr' && v.mode !== 'native' ? ({ quality: 2, balanced: 3, performance: 4 }[v.mode] || 2) : 0],
      ]).write(values);
    },
  }),
  apex: () => kvWriter(path.join(SAVED, 'Respawn', 'Apex', 'local', 'videoconfig.txt'), 'Apex Legends videoconfig.txt', (v) => { const s = v.settings; const tex = s.textures ?? 3, sh = s.shadows ?? 3, fx = s.effects ?? 3; return [
    ['setting.defaultres', v.w], ['setting.defaultresheight', v.h], ['setting.fullscreen', 1], ['setting.nowindowborder', 1], ['setting.mat_vsync_mode', 0], ['setting.dvs_enable', 0],
    ['setting.mat_antialias_mode', (s.aa ?? 2) === 0 ? 0 : 12], ['setting.stream_memory', [300000, 600000, 1000000, 2000000][tex]], ['setting.mat_picmip', 0], ['setting.mat_forceaniso', tex >= 2 ? 16 : 4], ['setting.mat_mip_linear', 1],
    ['setting.r_lod_switch_scale', [0.6, 0.8, 1, 1][s.draw ?? 3]], ['setting.particle_cpu_level', Math.min(2, fx)], ['setting.cl_particle_fallback_base', fx === 0 ? 3 : 0], ['setting.cl_particle_fallback_multiplier', [2, 1.75, 1, 1][fx]],
    ['setting.csm_enabled', sh > 0 ? 1 : 0], ['setting.csm_cascade_res', sh >= 2 ? 1024 : 512], ['setting.shadow_enable', sh > 0 ? 1 : 0], ['setting.shadow_depth_dimen_min', [0, 128, 256, 512][sh]], ['setting.shadow_depth_upres_factor_max', sh >= 2 ? 3 : 2], ['setting.shadow_maxdynamic', sh >= 2 ? 8 : (sh === 1 ? 2 : 0)],
    ['setting.ssao_enabled', (s.ao ?? 3) > 0 ? 1 : 0], ['setting.ssao_quality', Math.min(4, (s.ao ?? 3) + 1 - ((s.ao ?? 3) === 0 ? 1 : 0))], ['setting.volumetric_lighting', (s.volumetrics ?? 3) > 0 ? 1 : 0], ['setting.cl_ragdoll_maxcount', fx >= 2 ? 8 : 4], ['setting.r_decals', fx >= 1 ? 256 : 0], ['setting.mat_depthfeather_enable', (s.post ?? 1) ? 1 : 0],
  ]; }),
  minecraft: () => ({
    path: path.join(ROAMING, '.minecraft', 'options.txt'), label: 'Minecraft options.txt',
    async write(values) {
      let text = await fs.readFile(this.path, 'utf8'); const s = values.settings; let n = 0;
      const set = (k, v) => { const re = new RegExp(`^${k}:.*$`, 'm'); if (re.test(text)) text = text.replace(re, `${k}:${v}`); else text += `\n${k}:${v}`; n++; };
      set('renderDistance', [8, 12, 16, 24, 32][s.renderdist ?? 3]); set('simulationDistance', [5, 8, 12, 16][s.sim ?? 3]); set('graphicsMode', (s.shaders ?? 0) > 0 ? 2 : 1); set('particles', 0); set('maxFps', Math.min(260, values.hz || 120)); set('enableVsync', 'false');
      const aoBool = /^ao:(true|false)$/m.test(text); set('ao', aoBool ? 'true' : 2);
      return { text, n, skipped: s.shaders ? ['shader pack (choose in Iris/OptiFine)'] : [] };
    },
  }),
  eldenring: () => ({
    path: path.join(ROAMING, 'EldenRing', 'GraphicsConfig.xml'), label: 'Elden Ring GraphicsConfig.xml (UTF-16)',
    async resolve() { if (await exists(this.path)) return this.path; const dir = path.join(ROAMING, 'EldenRing'); if (!(await exists(dir))) return null; for (const d of await fs.readdir(dir)) { const p = path.join(dir, d, 'GraphicsConfig.xml'); if (await exists(p)) return p; } return null; },
    async write(values) {
      const buf = await fs.readFile(this.path); const utf16 = buf[0] === 0xff && buf[1] === 0xfe; let text = utf16 ? buf.toString('utf16le').replace(/^\ufeff/, '') : buf.toString('utf8');
      const s = values.settings; let n = 0; const L = ['LOW', 'MEDIUM', 'HIGH', 'MAXIMUM']; const LD = (i) => i === 0 ? 'DISABLE' : L[i];
      const set = (tag, v) => { const re = new RegExp(`<${tag}>[^<]*</${tag}>`); if (re.test(text)) { text = text.replace(re, `<${tag}>${v}</${tag}>`); n++; } };
      set('Quality', 'CUSTOM'); set('TextureQuality', L[s.textures ?? 3]); set('ShadowQuality', L[s.shadows ?? 3]); set('LightingQuality', L[s.shadows ?? 3]); set('SSAO', LD(s.ao ?? 3)); set('EffectsQuality', L[s.effects ?? 3]); set('VolumetricEffectQuality', L[s.volumetrics ?? 3]); set('ReflectionQuality', LD(s.reflections ?? 3)); set('GrassQuality', L[s.foliage ?? 3]); set('MotionBlur', s.mblur ? 'HIGH' : 'DISABLE'); set('AntialiasingQuality', (s.aa ?? 2) === 0 ? 'DISABLE' : s.aa === 1 ? 'LOW' : 'HIGH'); set('DepthOfField', (s.post ?? 1) ? 'HIGH' : 'DISABLE');
      set('RaytracingQuality', values.rt ? 'HIGH' : 'DISABLE'); set('Resolution-FullScreenX', values.w); set('Resolution-FullScreenY', values.h);
      const out = utf16 ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]) : text;
      return { text: out, n, skipped: [] };
    },
  }),
  ow2: () => ({
    path: path.join(DOCS, 'Overwatch', 'Settings', 'Settings_v0.ini'), label: 'Overwatch 2 Settings_v0.ini',
    async write(values) {
      let text = await fs.readFile(this.path, 'utf8'); const s = values.settings; let n = 0;
      const set = (k, v) => { const re = new RegExp(`^${k}\\s*=.*$`, 'm'); if (re.test(text)) { text = text.replace(re, `${k} = "${v}"`); n++; } else if (/\[Render\.13\]/.test(text)) { text = text.replace(/\[Render\.13\]\r?\n/, (m) => `${m}${k} = "${v}"\r\n`); n++; } };
      set('TextureDetail', s.textures ?? 3); set('ModelQuality', (s.draw ?? 3) + 1); set('EffectsQuality', (s.effects ?? 3) + 1); set('LightQuality', s.shadows ?? 3); set('DirectionalShadowDetail', (s.shadows ?? 3) + 1); set('SimpleDirectionalShadows', (s.shadows ?? 3) <= 1 ? 1 : 0); set('LocalFogDetail', (s.volumetrics ?? 3) + 1); set('SSAODetail', s.ao ?? 3); set('AADetail', (s.aa ?? 2) === 0 ? 0 : (s.aa === 1 ? 2 : 3));
      set('UseCustomFrameRates', 1); set('FrameRateCap', values.hz || 240); set('FullScreenWidth', values.w); set('FullScreenHeight', values.h); set('ReflexMode', 2); set('VerticalSyncEnabled', 0);
      return { text, n, skipped: ['If values do not stick, open Video settings once and set Graphics Quality to Custom'] };
    },
  }),
  cyberpunk: () => ({
    path: path.join(LOCAL, 'CD Projekt Red', 'Cyberpunk 2077', 'UserSettings.json'), label: 'Cyberpunk 2077 UserSettings.json',
    async write(values) {
      const raw = await fs.readFile(this.path, 'utf8'); const json = JSON.parse(raw); const s = values.settings; let n = 0; const skipped = [];
      const L3 = ['Low', 'Medium', 'High', 'High'], L4 = ['Low', 'Medium', 'High', 'Ultra'];
      const rt = values.rt || 0;
      const dlssOrder = ['Auto', 'DLAA', 'Quality', 'Balanced', 'Performance', 'Ultra Performance'], fsrOrder = ['Auto', 'Native AA', 'Quality', 'Balanced', 'Performance', 'Ultra Performance'];
      const modeName = { native: null, dlaa: 'DLAA', quality: 'Quality', balanced: 'Balanced', performance: 'Performance', ultraperf: 'Ultra Performance' }[values.mode];
      const want = {
        TextureQuality: L3[s.textures ?? 3], ShadowMeshQuality: L3[s.shadows ?? 3], LocalShadowsQuality: (s.shadows ?? 3) === 0 ? 'Low' : L3[s.shadows], CascadedShadowsRange: L3[s.shadows ?? 3], CascadedShadowsResolution: L3[s.shadows ?? 3], DistantShadowsResolution: (s.shadows ?? 3) >= 2 ? 'High' : 'Low',
        AmbientOcclusion: (s.ao ?? 3) === 0 ? 'Off' : L3[s.ao], VolumetricFogResolution: L4[s.volumetrics ?? 3], VolumetricCloudsQuality: (s.volumetrics ?? 3) === 0 ? 'Medium' : L4[s.volumetrics], ScreenSpaceReflectionsQuality: (s.reflections ?? 3) === 0 ? 'Off' : L4[s.reflections], LODPreset: L3[s.draw ?? 3], CrowdDensity: L3[s.crowd ?? 3], MotionBlur: s.mblur ? 'High' : 'Off', MaxDynamicDecals: L4[s.effects ?? 3],
        RayTracing: rt > 0, RayTracedPathTracing: rt === 3, RayTracedReflections: rt >= 2, RayTracedLighting: rt >= 2 ? 'Ultra' : rt === 1 ? 'Medium' : 'Off', RayTracedLocalShadows: rt >= 1, RayTracedSunShadows: rt >= 1,
        ResolutionScaling: values.upscaler === 'dlss' && modeName ? 'DLSS' : values.upscaler === 'fsr' && modeName ? 'FSR3' : values.upscaler === 'xess' && modeName ? 'XESS' : 'Off',
        DLSS: values.upscaler === 'dlss' && modeName ? modeName : 'Auto', FSR3: values.upscaler === 'fsr' && modeName ? (modeName === 'DLAA' ? 'Native AA' : modeName) : 'Auto',
        FrameGeneration: values.fg && values.fg !== 'off' ? (values.upscaler === 'dlss' ? 'DLSS' : 'FSR3') : 'Off', DLSSFrameGen: !!(values.fg && values.fg !== 'off' && values.upscaler === 'dlss'), DLSS_MultiFrameGeneration: values.fg === 'fg4' ? 'x4' : values.fg === 'fg3' ? 'x3' : 'x2', FSR3_FrameGeneration: !!(values.fg && values.fg !== 'off' && values.upscaler === 'fsr'),
        Resolution: `${values.w}x${values.h}`, MaximumFPS_OnOff: false, ReflexMode: 'Enabled + Boost', DLSS_BackendPreset: 'Transformer',
      };
      const orders = { DLSS: dlssOrder, FSR3: fsrOrder, ResolutionScaling: ['Off', 'DLSS', 'FSR2', 'FSR3', 'XESS', 'FSR4'], FrameGeneration: ['Off', 'DLSS', 'FSR3'] };
      const seen = new Set();
      const walk = (node) => { if (Array.isArray(node)) node.forEach(walk); else if (node && typeof node === 'object') { if (node.name && node.name in want && want[node.name] != null && 'value' in node) { const v = want[node.name]; seen.add(node.name); if (typeof v === 'string' && Array.isArray(node.values) && !node.values.includes(v)) { skipped.push(`${node.name} (value ${v} not offered)`); } else { node.value = v; if (Array.isArray(node.values)) node.index = node.values.indexOf(v); else if (orders[node.name] && orders[node.name].includes(v)) node.index = orders[node.name].indexOf(v); n++; } } Object.values(node).forEach(walk); } };
      walk(json);
      Object.keys(want).forEach((k) => { if (want[k] != null && !seen.has(k) && !['Resolution', 'DLSS_BackendPreset', 'FSR3_FrameGeneration', 'DLSS_MultiFrameGeneration'].includes(k)) skipped.push(k); });
      return { text: JSON.stringify(json, null, 2), n, skipped };
    },
  }),
};

export function describeTarget(gameId) { const f = ADAPTERS[gameId]; if (!f) return null; const a = f(); return { path: a.path, label: a.label }; }
export async function applySettings(gameId, values) {
  const f = ADAPTERS[gameId]; if (!f) return { ok: false, error: 'No writer for this game.' };
  const a = f();
  if (a.resolve) { const p = await a.resolve(); if (!p) return { ok: false, error: `Config not found (${a.path}). Launch the game once, close it, and retry.` }; a.path = p; }
  if (gameId === 'fortnite') { /* performance mode cannot be toggled safely here */ }
  if (!(await exists(a.path))) { if (a.label.includes('Unreal')) { await fs.mkdir(path.dirname(a.path), { recursive: true }); await fs.writeFile(a.path, ''); } else return { ok: false, error: `Config not found at ${a.path}. Launch the game once, close it, and retry.` }; }
  const bak = await backup(a.path);
  const { text, n, skipped } = await a.write(values);
  await fs.writeFile(a.path, text, typeof text === 'string' ? 'utf8' : undefined);
  return { ok: true, path: a.path, backup: bak, written: n, skipped };
}
export const SUPPORTED_APPLY = Object.keys(ADAPTERS);
