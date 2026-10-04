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
      text = setIni(text, '/Script/Engine.GameUserSettings', 'ResolutionSizeX', values.w); text = setIni(text, '/Script/Engine.GameUserSettings', 'ResolutionSizeY', values.h); text = setIni(text, '/Script/Engine.GameUserSettings', 'FullscreenMode', 1); text = setIni(text, '/Script/Engine.GameUserSettings', 'FrameRateLimit', `${(values.hz || 0).toFixed(6)}`); n += 4;
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
  fortnite: () => ueWriter(path.join(LOCAL, 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini')),
  rivals: () => ueWriter(path.join(LOCAL, 'Marvel', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  finals: () => ueWriter(path.join(LOCAL, 'Discovery', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  palworld: () => ueWriter(path.join(LOCAL, 'Pal', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  wukong: () => ueWriter(path.join(LOCAL, 'b1', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  stalker2: () => ueWriter(path.join(LOCAL, 'Stalker2', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  oblivion: () => ueWriter(path.join(DOCS, 'My Games', 'Oblivion Remastered', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  expedition33: () => ueWriter(path.join(LOCAL, 'Sandfall', 'Saved', 'Config', 'Windows', 'GameUserSettings.ini')),
  pubg: () => ueWriter(path.join(LOCAL, 'TslGame', 'Saved', 'Config', 'WindowsNoEditor', 'GameUserSettings.ini')),
  cs2: () => {
    // Steam userdata/<id>/730/local/cfg/cs2_video.txt: pick the most recently modified account.
    return {
      path: 'Steam\\userdata\\<account>\\730\\local\\cfg\\cs2_video.txt', label: 'Counter-Strike 2 video config',
      async resolve() {
        const roots = ['C:\\Program Files (x86)\\Steam\\userdata', 'D:\\Steam\\userdata', 'D:\\SteamLibrary\\userdata'];
        for (const r of roots) { if (!(await exists(r))) continue; const ids = await fs.readdir(r); let best = null; for (const id of ids) { const p = path.join(r, id, '730', 'local', 'cfg', 'cs2_video.txt'); if (await exists(p)) { const st = await fs.stat(p); if (!best || st.mtimeMs > best.m) best = { p, m: st.mtimeMs }; } } if (best) return best.p; }
        return null;
      },
      async write(values) {
        const s = values.settings;
        const w = kvWriter(this.path, this.label, (v) => [
          ['setting.defaultres', v.w], ['setting.defaultresheight', v.h], ['setting.fullscreen', 1], ['setting.coop_fullscreen', 1],
          ['setting.shadowquality', Math.min(3, s.shadows ?? 3)], ['setting.gpu_mem_level', Math.min(2, s.textures ?? 3)], ['setting.gpu_level', Math.min(3, s.effects ?? 3)], ['setting.shaderquality', (s.effects ?? 3) >= 2 ? 1 : 0],
          ['setting.r_texturefilteringquality', (s.textures ?? 3) >= 2 ? 4 : 2], ['setting.msaa_samples', (s.aa ?? 2) === 0 ? 1 : (s.aa === 1 ? 2 : 4)], ['setting.r_csgo_cmaa_enable', (s.aa ?? 2) === 0 ? 0 : 1],
          ['setting.volumetric_fog', s.volumetrics != null ? (s.volumetrics > 0 ? 1 : 0) : null], ['setting.r_low_latency', 2], ['setting.r_player_visibility_mode', 1], ['setting.fsr_enable', v.upscaler === 'fsr' && v.mode !== 'native' ? 1 : 0],
        ]);
        return w.write(values);
      },
    };
  },
  apex: () => kvWriter(path.join(SAVED, 'Respawn', 'Apex', 'local', 'videoconfig.txt'), 'Apex Legends videoconfig.txt', (v) => { const s = v.settings; return [
    ['setting.defaultres', v.w], ['setting.defaultresheight', v.h], ['setting.fullscreen', 1], ['setting.shadow_enable', (s.shadows ?? 3) > 0 ? 1 : 0], ['setting.csm_enabled', (s.shadows ?? 3) > 1 ? 1 : 0], ['setting.csm_coverage', Math.min(1, s.shadows ?? 3)], ['setting.csm_cascade_res', [512, 1024, 2048, 4096][s.shadows ?? 3]],
    ['setting.ssao_enabled', (s.ao ?? 3) > 0 ? 1 : 0], ['setting.ssao_downsample', (s.ao ?? 3) >= 2 ? 0 : 1], ['setting.volumetric_lighting', (s.volumetrics ?? 3) > 0 ? 1 : 0], ['setting.mat_antialias_mode', (s.aa ?? 2) === 0 ? 0 : (s.aa === 1 ? 2 : 4)],
    ['setting.cl_particle_fallback_base', [3, 2, 1, 0][s.effects ?? 3]], ['setting.cl_particle_fallback_multiplier', [2, 1, 1, 0][s.effects ?? 3]], ['setting.r_lod_switch_scale', [0.3, 0.6, 0.8, 1.0][s.draw ?? 3]], ['setting.mat_picmip', [2, 1, 0, 0][s.textures ?? 3]], ['setting.mat_depthfeather_enable', (s.post ?? 1) ? 1 : 0], ['setting.dvs_enable', 0], ['setting.mat_motion_blur_enabled', s.mblur ? 1 : 0],
  ]; }),
  minecraft: () => ({
    path: path.join(ROAMING, '.minecraft', 'options.txt'), label: 'Minecraft options.txt',
    async write(values) {
      let text = await fs.readFile(this.path, 'utf8'); const s = values.settings; let n = 0;
      const set = (k, v) => { const re = new RegExp(`^${k}:.*$`, 'm'); if (re.test(text)) text = text.replace(re, `${k}:${v}`); else text += `\n${k}:${v}`; n++; };
      set('renderDistance', [8, 12, 16, 24, 32][s.renderdist ?? 3]); set('simulationDistance', [5, 8, 12, 16][s.sim ?? 3]); set('graphicsMode', (s.shaders ?? 0) > 0 ? 2 : 1); set('ao', 'true'); set('particles', 0); set('maxFps', values.hz || 120); set('enableVsync', 'false');
      return { text, n, skipped: s.shaders ? ['shader pack (choose in Iris/OptiFine)'] : [] };
    },
  }),
  eldenring: () => ({
    path: path.join(ROAMING, 'EldenRing', 'GraphicsConfig.xml'), label: 'Elden Ring GraphicsConfig.xml',
    async write(values) {
      let text = await fs.readFile(this.path, 'utf8'); const s = values.settings; let n = 0; const L = ['LOW', 'MEDIUM', 'HIGH', 'MAXIMUM'];
      const set = (tag, v) => { const re = new RegExp(`<${tag}>[^<]*</${tag}>`); if (re.test(text)) { text = text.replace(re, `<${tag}>${v}</${tag}>`); n++; } };
      set('TextureQuality', L[s.textures ?? 3]); set('ShadowQuality', L[s.shadows ?? 3]); set('SSAO', (s.ao ?? 3) === 0 ? 'OFF' : L[s.ao]); set('EffectsQuality', L[s.effects ?? 3]); set('VolumetricQuality', L[s.volumetrics ?? 3]); set('ReflectionQuality', (s.reflections ?? 3) === 0 ? 'OFF' : L[s.reflections]); set('GrassQuality', L[s.foliage ?? 3]); set('MotionBlur', s.mblur ? 'ON' : 'OFF'); set('AntialiasingQuality', (s.aa ?? 2) === 0 ? 'OFF' : s.aa === 1 ? 'LOW' : 'HIGH');
      set('RayTracingQuality', values.rt ? 'HIGH' : 'OFF'); set('LightingQuality', L[s.shadows ?? 3]);
      return { text, n, skipped: [] };
    },
  }),
  ow2: () => ({
    path: path.join(DOCS, 'Overwatch', 'Settings', 'Settings_v0.ini'), label: 'Overwatch 2 Settings_v0.ini',
    async write(values) {
      let text = await fs.readFile(this.path, 'utf8'); const s = values.settings; let n = 0;
      const set = (k, v) => { const re = new RegExp(`^${k}\\s*=.*$`, 'm'); if (re.test(text)) { text = text.replace(re, `${k} = "${v}"`); n++; } else { text = text.replace(/\[Render\.13\]/, `[Render.13]\r\n${k} = "${v}"`); n++; } };
      set('ShadowDetail', s.shadows ?? 3); set('EffectsQuality', s.effects ?? 3); set('ModelDetail', s.draw ?? 3); set('TextureDetail', s.textures ?? 3); set('AAQuality', s.aa ?? 2); set('LocalFogDetail', s.volumetrics ?? 3); set('AmbientOcclusion', s.ao ?? 3); set('FrameRateCap', values.hz || 240); set('MotionBlur', s.mblur ? 1 : 0); set('FullScreenWidth', values.w); set('FullScreenHeight', values.h);
      return { text, n, skipped: [] };
    },
  }),
  cyberpunk: () => ({
    path: path.join(LOCAL, 'CD Projekt Red', 'Cyberpunk 2077', 'UserSettings.json'), label: 'Cyberpunk 2077 UserSettings.json',
    async write(values) {
      const raw = await fs.readFile(this.path, 'utf8'); const json = JSON.parse(raw); const s = values.settings; let n = 0; const skipped = [];
      const Q = ['Low', 'Medium', 'High', 'Ultra'];
      const want = { TextureQuality: Q[s.textures ?? 3], LocalShadowQuality: Q[s.shadows ?? 3], CascadedShadowsResolution: Q[s.shadows ?? 3], DistantShadowsResolution: Q[s.shadows ?? 3], AmbientOcclusion: (s.ao ?? 3) === 0 ? 'Off' : Q[s.ao], VolumetricFogResolution: Q[s.volumetrics ?? 3], VolumetricCloudQuality: Q[s.volumetrics ?? 3], ScreenSpaceReflectionsQuality: (s.reflections ?? 3) === 0 ? 'Off' : (s.reflections === 3 ? 'Psycho' : Q[s.reflections]), LevelOfDetail: Q[s.draw ?? 3], CrowdDensity: Q[s.crowd ?? 3], MotionBlur: s.mblur ? 'High' : 'Off', FieldOfView: null,
        RayTracing: !!values.rt, RayTracedPathTracing: values.rt === 3, RayTracedReflections: values.rt >= 2, RayTracedLighting: values.rt >= 2 ? 'Ultra' : values.rt === 1 ? 'Medium' : 'Off', RayTracedShadows: values.rt >= 1, DLSS: values.upscaler === 'dlss' ? ({ native: 'Off', dlaa: 'DLAA', quality: 'Quality', balanced: 'Balanced', performance: 'Performance', ultraperf: 'Ultra Performance' }[values.mode]) : 'Off', FSR3: values.upscaler === 'fsr' ? ({ native: 'Off', quality: 'Quality', balanced: 'Balanced', performance: 'Performance', ultraperf: 'Ultra Performance' }[values.mode]) : 'Off', DLSS_FrameGeneration: values.fg && values.fg !== 'off' && values.upscaler === 'dlss', Resolution: `${values.w}x${values.h}` };
      const walk = (node) => { if (Array.isArray(node)) node.forEach(walk); else if (node && typeof node === 'object') { if (node.name && node.name in want && want[node.name] != null && 'value' in node) { node.value = want[node.name]; n++; delete want[node.name]; } Object.values(node).forEach(walk); } };
      walk(json);
      Object.keys(want).forEach((k) => { if (want[k] != null) skipped.push(k); });
      return { text: JSON.stringify(json, null, 2), n, skipped };
    },
  }),
};

export function describeTarget(gameId) { const f = ADAPTERS[gameId]; if (!f) return null; const a = f(); return { path: a.path, label: a.label }; }
export async function applySettings(gameId, values) {
  const f = ADAPTERS[gameId]; if (!f) return { ok: false, error: 'No writer for this game.' };
  const a = f();
  if (a.resolve) { const p = await a.resolve(); if (!p) return { ok: false, error: `Config not found (${a.path}). Launch the game once, close it, and retry.` }; a.path = p; }
  if (!(await exists(a.path))) { if (a.label.includes('Unreal')) { await fs.mkdir(path.dirname(a.path), { recursive: true }); await fs.writeFile(a.path, ''); } else return { ok: false, error: `Config not found at ${a.path}. Launch the game once, close it, and retry.` }; }
  const bak = await backup(a.path);
  const { text, n, skipped } = await a.write(values);
  await fs.writeFile(a.path, text, 'utf8');
  return { ok: true, path: a.path, backup: bak, written: n, skipped };
}
export const SUPPORTED_APPLY = Object.keys(ADAPTERS);
