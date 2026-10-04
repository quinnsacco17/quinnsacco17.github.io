import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const S = process.env.SAMPLES || new URL('./fixtures/', import.meta.url).pathname;
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'opt-home-'));
process.env.HOME = home; process.env.USERPROFILE = home;
process.env.LOCALAPPDATA = path.join(home, 'AppData', 'Local'); process.env.APPDATA = path.join(home, 'AppData', 'Roaming'); process.env.STEAM_USERDATA = path.join(home, 'Steam', 'userdata');
const { applySettings, SUPPORTED_APPLY } = await import('../electron/apply.js');
const put = async (rel, src) => { const p = path.join(home, rel); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.copyFile(src, p); return p; };
const have = async (f) => { try { await fs.access(f); return true; } catch { return false; } };
const values = (over = {}) => ({ settings: { textures: 2, shadows: 1, ao: 1, volumetrics: 1, reflections: 0, draw: 2, effects: 1, aa: 2, post: 1, mblur: 0, crowd: 1, vsm: 1, gi: 0, lrefl: 1, foliage: 1, renderdist: 2, sim: 1, shaders: 0 }, rt: 0, upscaler: 'dlss', mode: 'quality', fg: 'fg2', w: 2560, h: 1440, hz: 165, ...over });

test('writers exist for the advertised games', () => { assert.equal(SUPPORTED_APPLY.length, 15); });

test('cyberpunk UserSettings.json', { skip: !(await have(path.join(S, 'cp.json'))) }, async () => {
  const p = await put('AppData/Local/CD Projekt Red/Cyberpunk 2077/UserSettings.json', path.join(S, 'cp.json'));
  const r = await applySettings('cyberpunk', values({ rt: 2 })); assert.ok(r.ok, r.error); assert.ok(r.written >= 15, 'written ' + r.written + ' skipped ' + r.skipped);
  const j = JSON.parse(await fs.readFile(p, 'utf8')); const find = (n) => { let out; const w = (x) => { if (Array.isArray(x)) x.forEach(w); else if (x && typeof x === 'object') { if (x.name === n) out = x; Object.values(x).forEach(w); } }; w(j); return out; };
  assert.equal(find('ScreenSpaceReflectionsQuality').value, 'Off'); assert.equal(find('CrowdDensity').value, 'Medium'); assert.equal(find('RayTracing').value, true); assert.equal(find('RayTracedLighting').value, 'Ultra'); assert.equal(find('DLSS').value, 'Quality'); assert.equal(find('DLSS').index, 2);
  assert.ok((await fs.readdir(path.dirname(p))).some((f) => f.includes('.bak-')), 'backup created');
});

test('cs2 cs2_video.txt', { skip: !(await have(path.join(S, 'cs2_gucu.txt'))) }, async () => {
  const p = await put('Steam/userdata/12345/730/local/cfg/cs2_video.txt', path.join(S, 'cs2_gucu.txt'));
  const r = await applySettings('cs2', values({ upscaler: null, mode: 'native', fg: 'off' })); assert.ok(r.ok, r.error);
  const t = await fs.readFile(p, 'utf8'); assert.match(t, /"setting\.defaultres"\s+"2560"/); assert.match(t, /"setting\.videocfg_shadow_quality"\s+"1"/); assert.match(t, /"setting\.r_low_latency"\s+"2"/); assert.match(t, /"setting\.msaa_samples"\s+"4"/);
});

test('apex videoconfig.txt', { skip: !(await have(path.join(S, 'apex_mu.txt'))) }, async () => {
  const p = await put('Saved Games/Respawn/Apex/local/videoconfig.txt', path.join(S, 'apex_mu.txt'));
  const r = await applySettings('apex', values()); assert.ok(r.ok, r.error);
  const t = await fs.readFile(p, 'utf8'); assert.match(t, /"setting\.r_lod_switch_scale"\s+"1"/); assert.match(t, /"setting\.stream_memory"\s+"1000000"/); assert.match(t, /"setting\.csm_cascade_res"\s+"512"/); assert.match(t, /"setting\.mat_antialias_mode"\s+"12"/);
});

test('elden ring GraphicsConfig.xml keeps encoding', { skip: !(await have(path.join(S, 'er_ultra.xml'))) }, async () => {
  const p = await put('AppData/Roaming/EldenRing/GraphicsConfig.xml', path.join(S, 'er_ultra.xml'));
  const before = await fs.readFile(p); const utf16 = before[0] === 0xff && before[1] === 0xfe;
  const r = await applySettings('eldenring', values({ rt: 1 })); assert.ok(r.ok, r.error); assert.ok(r.written >= 10, 'written ' + r.written);
  const buf = await fs.readFile(p); assert.equal(buf[0] === 0xff && buf[1] === 0xfe, utf16, 'BOM preserved');
  const t = utf16 ? buf.toString('utf16le') : buf.toString('utf8'); assert.match(t, /<Quality>CUSTOM<\/Quality>/); assert.match(t, /<ShadowQuality>MEDIUM<\/ShadowQuality>/); assert.match(t, /<RaytracingQuality>HIGH<\/RaytracingQuality>/); assert.match(t, /<MotionBlur>DISABLE<\/MotionBlur>/); assert.match(t, /<ReflectionQuality>DISABLE<\/ReflectionQuality>/);
});

test('overwatch 2 Settings_v0.ini', { skip: !(await have(path.join(S, 'ow_byks.ini'))) }, async () => {
  const p = await put('Documents/Overwatch/Settings/Settings_v0.ini', path.join(S, 'ow_byks.ini'));
  const r = await applySettings('ow2', values()); assert.ok(r.ok, r.error);
  const t = await fs.readFile(p, 'utf8'); assert.match(t, /^FrameRateCap = "165"$/m); assert.match(t, /^TextureDetail = "2"$/m); assert.match(t, /^DirectionalShadowDetail = "2"$/m); assert.match(t, /^ModelQuality = "3"$/m); assert.match(t, /^ReflexMode = "2"$/m);
  assert.equal((t.match(/^FrameRateCap = /gm) || []).length, 1, 'no duplicate keys');
});

test('fortnite GameUserSettings.ini', { skip: !(await have(path.join(S, 'fn_pickle.ini'))) }, async () => {
  const p = await put('AppData/Local/FortniteGame/Saved/Config/WindowsClient/GameUserSettings.ini', path.join(S, 'fn_pickle.ini'));
  const r = await applySettings('fortnite', values()); assert.ok(r.ok, r.error);
  const t = await fs.readFile(p, 'utf8'); assert.match(t, /^sg\.ShadowQuality=1$/m); assert.match(t, /^sg\.TextureQuality=2$/m); assert.match(t, /^DesiredGlobalIlluminationQuality=0$/m); assert.match(t, /^ResolutionSizeX=2560$/m); assert.match(t, /^FrameRateLimit=165\.000000$/m); assert.match(t, /^LatencyTweak2=2$/m);
  assert.equal((t.match(/^sg\.ShadowQuality=/gm) || []).length, 1, 'no duplicate sg keys');
});

test('marvel rivals GameUserSettings.ini', { skip: !(await have(path.join(S, 'mr_gus.ini'))) }, async () => {
  const p = await put('AppData/Local/Marvel/Saved/Config/Windows/GameUserSettings.ini', path.join(S, 'mr_gus.ini'));
  const r = await applySettings('rivals', values()); assert.ok(r.ok, r.error);
  const t = await fs.readFile(p, 'utf8'); assert.match(t, /^sg\.GlobalIlluminationQuality=0$/m); assert.match(t, /^bDlssFrameGeneration=True$/m);
});

test('minecraft options.txt', { skip: !(await have(path.join(S, 'mc_gist.txt'))) }, async () => {
  const p = await put('AppData/Roaming/.minecraft/options.txt', path.join(S, 'mc_gist.txt'));
  const r = await applySettings('minecraft', values()); assert.ok(r.ok, r.error);
  const t = await fs.readFile(p, 'utf8'); assert.match(t, /^renderDistance:16$/m); assert.match(t, /^maxFps:165$/m); assert.match(t, /^ao:(true|2)$/m);
});

test('UE writer creates file when missing (palworld)', async () => {
  const r = await applySettings('palworld', values({ upscaler: null, mode: 'performance', fg: 'off' })); assert.ok(r.ok, r.error);
  const t = await fs.readFile(r.path, 'utf8'); assert.match(t, /^\[ScalabilityGroups\]$/m); assert.match(t, /^ResolutionScale=50$/m);
});

test('missing config reports a clear error (ow2 without file)', async () => {
  await fs.rm(path.join(home, 'Documents', 'Overwatch'), { recursive: true, force: true });
  const r = await applySettings('ow2', values()); assert.equal(r.ok, false); assert.match(r.error, /Launch the game once/);
});
