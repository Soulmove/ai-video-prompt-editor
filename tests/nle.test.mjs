import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NLE_SQUARE_TEMPLATES, GROUPS, CHARACTER_FIELDS } from '../dist/nle-catalog.mjs';
import { renderOptionSwatch } from '../dist/nle-swatches.mjs';
import { ICON_IDS, uiIcon } from '../dist/nle-icons.mjs';
import {
 AI_STORY_TEMPLATES,
 normalizeAIBrief,
 resolveVisualOverrides,
 briefPreselectionSummary
} from '../dist/nle-ai-brief.mjs';
import {
 DEFAULT_AI_MODEL,
 DEFAULT_THINKING_LEVEL,
 normalizeGoogleKey,
 normalizeGoogleModel,
 nlePlanSchema,
 testGoogleConnection,
 generateNleAIPlan,
 normalizeNleAIPlan,
 applyNleAIPlan
} from '../dist/nle-ai.mjs';
import { handleApiRoute } from '../worker/index.mjs';
import { handleLocalMuseRoute } from '../muse-bridge.mjs';
import {
 MUSE_CHANNELS,
 MUSE_VIDEO_MODELS,
 normalizeMuseConfig,
 computeVideoSize,
 clampMuseSeconds,
 isPlayableVideoUrl,
 buildMuseVideoFormData,
 parseMuseTaskState,
 probeMuseService,
 submitMuseVideoTask,
 pollMuseVideoTask,
 cancelMuseVideoTask,
 recoverMuseVideoTask
} from '../dist/nle-muse.mjs';

import {
 createBlankProject,
 createDemoProject,
 cloneProject,
 hasProjectContent,
 hasExportableClips,
 advancePlayhead,
 displayAspectLabel,
 displayResolutionLabel,
 parseCustomResolution,
 parseCustomNegativeTags,
 addExtraTrack,
 removeExtraTrack,
 deleteClips,
 batchUpdateClipDuration,
 createBlankTemplateJson,
 addClip,
 addPresetClip,
 splitClipAt,
 splitAtPlayhead,
 moveClip,
 trimClip,
 deleteClip,
 duplicateClip,
 stateAtTime,
 validateTimeline,
 compileTimelinePrompt,
 projectDuration,
 parseAnyProjectImport,
 convertV1ToV2,
 fmtTimecode,
 fmtFramesTimecode,
 aspectRatioParts
} from '../dist/nle-model.mjs';

test('createBlankProject starts strictly at 00:00 with empty 5 tracks and zero AI requirement', () => {
 const p = createBlankProject();
 assert.equal(p.version, 2);
 assert.equal(projectDuration(p), 0);
 assert.equal(p.playhead, 0);
 for (const k of ['adjust', 'video', 'dialogue', 'audio', 'bgm']) {
  assert.deepEqual(p.tracks[k], []);
 }
 const prompt = compileTimelinePrompt(p, 'storyboard', 'zh');
 assert.match(prompt, /00:00/);
});

test('adding clips across all 5 tracks computes duration and normalizes presets', () => {
 const p = createBlankProject();
 const r1 = addClip(p, 'video', { title: '街头开场', duration: 4, prompt: '清晨阳光照进老街' });
 assert.equal(r1.clip.start, 0);
 assert.equal(projectDuration(p), 4);

 const r2 = addPresetClip(p, 'handheld-follow');
 assert.equal(r2.clip.start, 4);
 assert.equal(r2.clip.style, 'handheld_cinema');
 assert.equal(projectDuration(p), 8);

 p.playhead = 3.5;
 const d1 = addClip(p, 'dialogue', { speakerName: '记者', text: '这条巷子还在改造吗？', duration: 2.5 });
 assert.equal(d1.clip.start, 3.5);

 addClip(p, 'audio', { kind: 'sfx', cue: '自行车铃铛清脆响两声', duration: 1.5 });
 addClip(p, 'bgm', { style: 'warm_piano', duration: 8 });
 addClip(p, 'adjust', { label: '黄金时刻偏暖', colorOverride: 'warm_film', duration: 4.5 });

 assert.equal(projectDuration(p), 11.5);
 assert.equal(p.tracks.adjust.length, 1);
 assert.equal(p.tracks.bgm.length, 1);
});

test('splitAtPlayhead splits V1 and T1 cleanly and enforces >= 0.5s minimum', () => {
 const p = createBlankProject();
 const { clip } = addClip(p, 'video', { title: '长镜头', duration: 6, transitionIn: 'fade_in' });
 p.playhead = 2.5;
 const res = splitAtPlayhead(p);
 assert.equal(res.ok, true);
 assert.equal(p.tracks.video.length, 2);
 assert.equal(p.tracks.video[0].duration, 2.5);
 assert.equal(p.tracks.video[1].start, 2.5);
 assert.equal(p.tracks.video[1].duration, 3.5);
 assert.match(p.tracks.video[1].title, /\(续\)/);
 assert.equal(p.tracks.video[1].transitionIn, 'cut');

 // Too close to left edge (< 0.5s)
 const failRes = splitClipAt(p, 'video', clip.id, 0.3);
 assert.equal(failRes.ok, false);
 assert.equal(p.tracks.video.length, 2);
});

test('moveClip and deleteClip respect ripple on vs free gap mode', () => {
 const p = createBlankProject();
 const c1 = addClip(p, 'video', { title: '镜1', duration: 3 }).clip;
 const c2 = addClip(p, 'video', { title: '镜2', duration: 4 }).clip;
 const c3 = addClip(p, 'video', { title: '镜3', duration: 2 }).clip;

 // Move c3 to front with ripple=true
 moveClip(p, 'video', c3.id, 0);
 assert.deepEqual(p.tracks.video.map((x) => x.title), ['镜3', '镜1', '镜2']);
 assert.deepEqual(p.tracks.video.map((x) => x.start), [0, 2, 5]);

 // Delete middle clip with ripple=true closes gap
 deleteClip(p, 'video', c1.id);
 assert.deepEqual(p.tracks.video.map((x) => [x.title, x.start]), [['镜3', 0], ['镜2', 2]]);

 // Turn off ripple and move c2 right leaving intentional black gap
 p.ripple = false;
 moveClip(p, 'video', c2.id, 4);
 assert.equal(p.tracks.video[1].start, 4);
 const gapState = stateAtTime(p, 3);
 assert.equal(gapState.video, null);
});

test('trimClip enforces minimum 0.5s and clamps neighbors in free mode', () => {
 const p = createBlankProject();
 p.ripple = true;
 const c1 = addClip(p, 'video', { title: 'A', duration: 4 }).clip;
 const c2 = addClip(p, 'video', { title: 'B', duration: 4 }).clip;

 trimClip(p, 'video', c1.id, 'right', 6);
 assert.equal(c1.duration, 6);
 assert.equal(c2.start, 6); // rippled

 trimClip(p, 'video', c1.id, 'right', 0.1);
 assert.equal(c1.duration, 0.5);

 p.ripple = false;
 moveClip(p, 'video', c2.id, 3);
 trimClip(p, 'video', c1.id, 'right', 5); // should clamp at c2.start (3)
 assert.equal(c1.duration, 3);
});

test('stateAtTime and compileTimelinePrompt apply Adjustment Layer and J-Cut timing', () => {
 const demo = createDemoProject();
 assert.equal(projectDuration(demo), 12);

 // At t=3.7: still V1 shot 1 (v-1: 0..4), dialogue t-1 (3.5..7) has already entered early (J-Cut!), no adjust yet (e-1 starts at 4)
 const st37 = stateAtTime(demo, 3.7);
 assert.equal(st37.video.id, 'v-1');
 assert.equal(st37.dialogues.length, 1);
 assert.equal(st37.adjusts.length, 0);
 assert.equal(st37.bgms[0].isDucking, true);

 // At t=6.0: V1 shot 2 (v-2: 4..8.5) covered by Adjustment Layer e-1
 const st6 = stateAtTime(demo, 6.0);
 assert.equal(st6.video.id, 'v-2');
 assert.equal(st6.adjusts.length, 1);
 assert.equal(st6.effectiveVisual.style, 'hk_cinema');

 const timelineOut = compileTimelinePrompt(demo, 'timeline', 'zh');
 assert.match(timelineOut, /00:03\.5 -> 00:04\.0/); // Exact J-Cut boundary slice!
 assert.match(timelineOut, /人声避让压低/);

 const enOut = compileTimelinePrompt(demo, 'storyboard', 'en');
 assert.match(enOut, /\[Cast Continuity\]/);
 assert.match(enOut, /T1 Dialogue/);
});

test('CSV table compiler properly escapes commas, quotes and newlines', () => {
 const p = createBlankProject();
 addClip(p, 'video', { title: 'Cut "A", Scene 1', prompt: 'He says, "Wait"\nCamera pans left', duration: 4 });
 const csv = compileTimelinePrompt(p, 'table', 'en');
 assert.match(csv, /"V1-1 Cut ""A"", Scene 1"/);
 assert.match(csv, /"He says, ""Wait""\nCamera pans left"/);
});

test('validateTimeline flags missing prompt, fast dialogue and orphan dialogue', () => {
 const p = createBlankProject();
 assert.equal(validateTimeline(p)[0].severity, 'info');

 addClip(p, 'video', { title: '空词镜头', prompt: '', duration: 12 });
 addClip(p, 'dialogue', { speakerName: '旁白', text: '这是一段非常非常长而且明显超过一秒钟能说完很多字的台词内容测试语速告警', duration: 1 });
 moveClip(p, 'dialogue', p.tracks.dialogue[0].id, 15); // past V1 end

 const issues = validateTimeline(p);
 assert.ok(issues.some((x) => x.message.includes('尚未填写主体动作描述')));
 assert.ok(issues.some((x) => x.message.includes('拆成多个景别')));
 assert.ok(issues.some((x) => x.message.includes('语速可能偏赶')));
 assert.ok(issues.some((x) => x.message.includes('没有对应的 V1 视频镜头')));
});

test('convertV1ToV2 and parseAnyProjectImport migrate Jingxu 1.0 JSON and strip poison keys', () => {
 const v1 = {
  version: 1,
  title: '1.0 老巷纪录片',
  format: '2.39:1',
  resolution: '4K',
  fps: 24,
  bgm: 'warm_piano',
  characters: [{ id: 'c1', name: '陈师傅', appearance: '花白短发，蓝色工装' }],
  scenes: [{ id: 's1', name: '修表铺', description: '狭窄老街木柜台' }],
  shots: [
   { id: 'sh1', title: '开锁开店', duration: 5, characterIds: ['c1'], sceneId: 's1', prompt: '陈师傅推开木门窗', dialogue: '早啊。', sfx: '老木门吱呀声' },
   { id: 'sh2', title: '修表特写', duration: 4, characterIds: ['c1'], sceneId: 's1', prompt: '镊子夹起微小齿轮' }
  ]
 };

 const bomJson = '\uFEFF' + JSON.stringify(v1).replace('{', '{"__proto__":{"polluted":true},');
 const imported = parseAnyProjectImport(bomJson);

 assert.equal(imported.version, 2);
 assert.equal(imported.tracks.video.length, 2);
 assert.equal(imported.tracks.video[0].start, 0);
 assert.equal(imported.tracks.video[1].start, 5);
 assert.equal(imported.tracks.dialogue.length, 1);
 assert.equal(imported.tracks.audio.length, 1);
 assert.equal(imported.tracks.bgm.length, 1);
 assert.equal(imported.tracks.bgm[0].duration, 9);
 assert.equal(({}).polluted, undefined);

 // Duplicate helper works cleanly
 const d = duplicateClip(imported, 'video', imported.tracks.video[0].id);
 assert.equal(imported.tracks.video.length, 3);
 assert.match(d.clip.title, /\(副本\)/);
});

test('timecode and aspectRatioParts formatting helpers handle custom inputs safely', () => {
 assert.equal(fmtTimecode(65.4), '01:05.4');
 assert.equal(fmtFramesTimecode(4.5, 24), '00:04:12');
 assert.deepEqual(aspectRatioParts('custom', '2.35:1').w, 2.35);
 assert.deepEqual(aspectRatioParts('custom', 'bad').label, '16:9');
});

test('NLE_SQUARE_TEMPLATES and visual swatch square cards render cleanly', () => {
 assert.ok(NLE_SQUARE_TEMPLATES.length >= 4);
 for (const tpl of NLE_SQUARE_TEMPLATES) {
  const proj = tpl.seed ? parseAnyProjectImport({ version: 2, ...tpl.seed }, { rekey: true }) : createDemoProject();
  assert.ok(proj.tracks.video.length >= 2);
  assert.ok(projectDuration(proj) > 0);
 }
 for (const gk of ['look', 'color', 'medium', 'texture', 'framing', 'move', 'angle', 'transition', 'lightSource', 'bgm']) {
  const firstOpt = GROUPS[gk].options[0];
  const html = renderOptionSwatch(gk, firstOpt);
  assert.match(html, /swatch-visual/);
 }
});

test('Lucide linear SVG icon pack covers all UI references and replaces emoji glyphs', () => {
 const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
 const indexHtml = fs.readFileSync(path.join(rootDir, 'dist', 'index.html'), 'utf8');
 const iconsSvg = fs.readFileSync(path.join(rootDir, 'dist', 'icons.svg'), 'utf8');
 const appJs = fs.readFileSync(path.join(rootDir, 'dist', 'nle-app.mjs'), 'utf8');
 const modelJs = fs.readFileSync(path.join(rootDir, 'dist', 'nle-model.mjs'), 'utf8');
 const aiBriefJs = fs.readFileSync(path.join(rootDir, 'dist', 'nle-ai-brief.mjs'), 'utf8');
 const aiJs = fs.readFileSync(path.join(rootDir, 'dist', 'nle-ai.mjs'), 'utf8');
 const museJs = fs.readFileSync(path.join(rootDir, 'dist', 'nle-muse.mjs'), 'utf8');
 const bridgeJs = fs.readFileSync(path.join(rootDir, 'muse-bridge.mjs'), 'utf8');

 assert.ok(ICON_IDS.has('video-studio'));

 for (const id of ICON_IDS) {
  assert.ok(indexHtml.includes(`id="i-${id}"`), `Missing symbol i-${id} in index.html`);
  assert.ok(iconsSvg.includes(`id="i-${id}"`), `Missing symbol i-${id} in icons.svg`);
  assert.match(uiIcon(id), new RegExp(`<use href="#i-${id}"/>`));
 }

 for (const [, id] of appJs.matchAll(/uiIcon\(\s*'([a-z-]+)'/g)) {
  assert.ok(ICON_IDS.has(id), `Unknown uiIcon('${id}') referenced in nle-app.mjs`);
 }

 const emojiRe = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u23E9-\u23FF]/gu;
 assert.deepEqual(appJs.match(emojiRe), null);
 assert.deepEqual(modelJs.match(emojiRe), null);
 assert.deepEqual(indexHtml.match(emojiRe), null);
 assert.deepEqual(aiBriefJs.match(emojiRe), null);
 assert.deepEqual(aiJs.match(emojiRe), null);
 assert.deepEqual(museJs.match(emojiRe), null);
 assert.deepEqual(bridgeJs.match(emojiRe), null);
});

test('advancePlayhead progresses continuously at 60Hz without zero-quantization stalling', () => {
 let t = 0;
 let ended = false;
 for (let i = 0; i < 60; i++) {
  const step = advancePlayhead(t, 0.016, 12);
  t = step.time;
  ended = step.ended;
 }
 assert.ok(t > 0.9 && t < 1.1, `Expected ~0.96s after 60 frames, got ${t}`);
 assert.equal(ended, false);

 const tail = advancePlayhead(11.98, 0.05, 12);
 assert.equal(tail.time, 12);
 assert.equal(tail.ended, true);
});

test('custom aspect ratio, resolution labels, and custom negative keywords localize and format cleanly', () => {
 const p = createBlankProject({ format: 'custom', resolution: 'custom', customAspect: '', customResolution: '' });
 assert.equal(displayAspectLabel(p, 'zh'), '自定义比例');
 assert.equal(displayResolutionLabel(p, 'zh'), '自定义像素');
 assert.ok(!displayResolutionLabel(p, 'zh').includes('Custom'));

 p.customAspect = '21:9';
 p.customResolution = '2560x1080';
 assert.equal(displayAspectLabel(p, 'zh'), '21:9');
 assert.equal(displayResolutionLabel(p, 'zh'), '2560x1080');
 assert.deepEqual(parseCustomResolution('2560x1080'), { w: 2560, h: 1080, label: '2560x1080', valid: true });
 assert.deepEqual(parseCustomNegativeTags('面部变形, 多余手指；文字乱码, 面部变形'), ['面部变形', '多余手指', '文字乱码']);
});

test('non-primary addClip avoids silent stacking while explicit atStart preserves exact audio timing', () => {
 const p = createBlankProject();
 const first = addClip(p, 'dialogue', { speakerName: '林晚', text: '雨好像要停了。', duration: 3 });
 const second = addClip(p, 'dialogue', { speakerName: '陈默', text: '快看天边。', duration: 2.5 });
 assert.equal(first.clip.start, 0);
 assert.equal(second.clip.start, 3);
 assert.equal(second.shifted, true);

 // Explicit audio timing like 0-5s rain & 12-20s footsteps
 const rain = addClip(p, 'audio', { kind: 'ambience', cue: '细雨打在伞面', duration: 5, fadeIn: 0.4 }, { atStart: 0 });
 const steps = addClip(p, 'audio', { kind: 'sfx', cue: '由远及近脚步声', duration: 8, fadeOut: 0.5 }, { atStart: 12 });
 assert.equal(rain.clip.start, 0);
 assert.equal(steps.clip.start, 12);
});

test('short film workflow: transitions (cut=0s & transitionOut), props, sunrise light, audio start & subtitle styling export once', () => {
 const p = createBlankProject({
  title: '雨停之前',
  format: '9:16',
  resolution: '1080P',
  fps: 24,
  negativePrompts: ['identity', 'face_deform', 'skin', 'hands', 'warp'],
  customNegative: '过曝路灯'
 });
 p.characters.push({ id: 'c-chen', name: '陈默', face: '方脸', eyes: '单眼皮', lockIdentity: true });
 p.scenes.push({ id: 's-roof', name: '天台', description: '城市旧楼天台', time: 'sunrise', lightSource: 'morning_sun' });
 p.scenes.push({ id: 's-unused', name: '天桥', description: '备用过街天桥' });

 const s1 = addClip(p, 'video', { title: '分镜 01', duration: 5, sceneId: 's-roof', characterIds: ['c-chen'], props: '热豆浆纸杯、透明雨伞', prompt: '陈默递出豆浆' });
 const s2 = addClip(p, 'video', { title: '分镜 02', duration: 5, transitionIn: 'cut', transitionOut: 'fade_out', transitionOutDur: 0.8, prompt: '两人望向日出晨光' });
 assert.equal(s1.clip.transitionDur, 0);
 assert.equal(s2.clip.transitionDur, 0);
 assert.equal(s2.clip.transitionOutDur, 0.8);

 addClip(p, 'dialogue', { start: 3, duration: 4, speakerName: '林晚', text: '“你一直都在等吗？”', subtitlePos: 'top', subtitleStyle: '电影白字细黑边' });
 addClip(p, 'audio', { start: 0, duration: 5, kind: 'ambience', cue: '细密晨雨声', fadeIn: 0.5 });
 addClip(p, 'audio', { start: 12, duration: 3, kind: 'sfx', cue: '天台远处车流声', spatial: '远处画外' });
 addClip(p, 'bgm', { start: 2, duration: 13, style: 'solo_piano', mood: '克制希望' });

 const out = compileTimelinePrompt(p, 'storyboard', 'zh');
 assert.match(out, /关键道具：热豆浆纸杯、透明雨伞/);
 assert.match(out, /入画转场：硬切 \(Hard Cut\).*\(0s\)/);
 assert.match(out, /出画转场：淡出（Fade Out）.*\(0\.8s\)/);
 assert.match(out, /独奏钢琴旋律/);
 assert.match(out, /面部五官扭曲变形/);
 assert.match(out, /过曝路灯/);
 assert.match(out, /00:12\.0-00:15\.0.*天台远处车流声/);
 // Ensure dialogue crossing Shot 1 -> Shot 2 only appears ONCE in storyboard export
 assert.equal(out.match(/“你一直都在等吗？”/g)?.length, 1);

 const issues = validateTimeline(p);
 assert.ok(issues.some((i) => i.message.includes('天桥') && i.message.includes('尚未绑定')));
 assert.ok(GROUPS.negative.options.some((o) => o.id === 'face_deform'));
 assert.ok(GROUPS.time.options.some((o) => o.id === 'sunrise'));
 assert.ok(GROUPS.lightSource.options.some((o) => o.id === 'morning_sun'));

 const labels = CHARACTER_FIELDS.map(([, label]) => label);
 assert.equal(new Set(labels).size, labels.length);
});

test('import error messages use clear Chinese diagnostics and blank templates roundtrip cleanly', () => {
 assert.throws(() => parseAnyProjectImport('   '), /导入内容为空/);
 assert.throws(() => parseAnyProjectImport('not json'), /JSON 格式解析失败/);
 assert.throws(() => parseAnyProjectImport('{"hello":1}'), /未能识别的工程格式/);

 const tplV1 = createBlankTemplateJson('v1');
 const p1 = parseAnyProjectImport(tplV1);
 assert.equal(p1.tracks.video.length, 1);

 const tplV2 = createBlankTemplateJson('v2');
 const p2 = parseAnyProjectImport(tplV2);
 assert.equal(hasExportableClips(p2), false);
});

test('extra tracks, track lock/mute/hide, cloneProject, and batch edit operations work cleanly', () => {
 const p = createBlankProject({ title: '测试工程' });
 const { track: v2 } = addExtraTrack(p, 'video');
 assert.equal(v2.code, 'V2');
 const a1 = addClip(p, 'video', { title: 'A', duration: 3 }).clip;
 const a2 = addClip(p, 'video', { title: 'B', duration: 4 }).clip;
 const pip = addClip(p, v2.key, { title: '画中画', duration: 3 }, { atStart: 1 }).clip;
 assert.equal(hasProjectContent(p), true);

 // Lock V2 and verify batchDelete skips locked track while deleting unlocked items
 p.trackMeta[v2.key] = { locked: true };
 batchUpdateClipDuration(p, [{ track: 'video', id: a1.id }, { track: v2.key, id: pip.id }], 6);
 assert.equal(p.tracks.video[0].duration, 6);
 assert.equal(p.tracks[v2.key][0].duration, 3);

 const delRes = deleteClips(p, [{ track: 'video', id: a2.id }, { track: v2.key, id: pip.id }]);
 assert.equal(delRes.deletedCount, 1);
 assert.equal(p.tracks[v2.key].length, 1);

 const cloned = cloneProject(p);
 assert.notEqual(cloned.id, p.id);
 assert.match(cloned.title, /副本/);

 assert.equal(removeExtraTrack(p, 'video').ok, false);
 assert.equal(removeExtraTrack(p, v2.key).ok, true);
});

test('AI pre-selection brief helpers, key normalization, and Hydrogen defaults behave safely', () => {
 assert.equal(DEFAULT_AI_MODEL, 'gemini-4-hydrogen');
 assert.equal(DEFAULT_THINKING_LEVEL, 'high');
 assert.ok(AI_STORY_TEMPLATES.length >= 4);

 assert.equal(normalizeGoogleKey('Bearer "AIzaSyExampleKey123456"'), 'AIzaSyExampleKey123456');
 assert.throws(() => normalizeGoogleKey('   '), /Google API Key/);
 assert.equal(normalizeGoogleModel('models/gemini-4-hydrogen'), 'gemini-4-hydrogen');
 assert.equal(normalizeGoogleModel(''), 'gemini-4-hydrogen');

 const brief = normalizeAIBrief({
  idea: '雨夜重逢',
  visualPreset: 'hk_neon',
  color: 'hk_emerald',
  bgmMode: 'exact',
  bgmStyle: 'solo_piano',
  customShotTiming: true,
  shotCount: 3,
  timingMode: 'fixed',
  fixedDuration: 5,
  faceTier: 'hk_retro_star',
  skinRender: 'natural_pores',
  negativePrompts: ['identity', 'face_deform', 'not_valid_id']
 });
 assert.deepEqual(brief.negativePrompts, ['identity', 'face_deform']);
 const vis = resolveVisualOverrides(brief);
 assert.equal(vis.look, 'hk_cinema');
 assert.equal(vis.color, 'hk_emerald');
 const badges = briefPreselectionSummary(brief);
 assert.ok(badges.some((b) => b.includes('3镜')));
 const schema = nlePlanSchema();
 assert.ok(schema.properties.shots && schema.properties.audioClips && schema.properties.bgmClips && schema.properties.adjustClips);
});

test('generateNleAIPlan sends gemini-4-hydrogen with thinkingLevel high over SSE and enforces pre-selections', async () => {
 let capturedUrl = '';
 let capturedHeaders = null;
 let capturedBody = null;

 const rawPlanObj = {
  title: '雨夜便利店重逢',
  logline: '暴雨夜两人再次在便利店廊檐相遇',
  format: '9:16',
  resolution: '1080P',
  fps: 24,
  chainLastFrame: true,
  negativePrompts: ['warp'],
  customNegative: '路灯过曝',
  characters: [{
   ref: 'c1', name: '林夏', role: '主角', age: '26', gender: '女', height: '165cm', build: '纤细',
   occupation: '插画师', appearance: '拎透明雨伞', skin: '自然肤色', face: '鹅蛋脸', eyes: '深棕',
   brows: '平直细眉', nose: '秀气', lips: '自然唇形', hair: '齐肩短发', hairColor: '黑', makeup: '淡妆',
   outfit: '米灰风衣', accessories: '透明雨伞', habits: '捏伞柄', posture: '肩微收', voice: '轻柔', language: '普通话', lockIdentity: true
  }],
  scenes: [{
   ref: 's1', name: '巷口便利店', location: '便利店外廊檐', description: '潮湿水洼倒映霓虹',
   foreground: '玻璃雨滴', background: '绿红霓虹招牌', dynamics: '雨滴斜落', sound: '雨声与冰箱嗡鸣',
   time: 'night', weather: 'rain', lightSource: 'neon', lightDirection: 'side', lightQuality: 'soft'
  }],
  shots: [
   {
    title: '廊檐躲雨', duration: 8, action: '林夏收伞抖落雨水', props: '透明雨伞',
    startState: '站在雨幕中', endState: '走入廊檐甩伞', framing: 'mediumFull', angle: 'eye', composition: 'thirds',
    move: 'push', moveDistance: 'subtle', speed: 'slow', stability: 'dolly', zoom: 'none', lens: '35', focus: 'subject',
    style: 'cinema', color: 'warm', medium: 'digital', texture: [], lightSource: 'neon', lightDirection: 'side',
    lightQuality: 'soft', weather: 'rain', time: 'night', emotion: 'hesitate', micro: 'breath',
    characterRefs: ['c1'], sceneRef: 's1', characterActions: '甩掉伞上水珠', transitionIn: 'cut', transitionDur: 0.9,
    transitionOut: '', transitionOutDur: 0, refNote: ''
   },
   {
    title: '回头认出旧友', duration: 6, action: '她听见脚步回头望去', props: '热豆浆纸杯',
    startState: '', endState: '目光微亮定格', framing: 'close', angle: 'eye', composition: 'center',
    move: 'stationary', moveDistance: 'none', speed: 'even', stability: 'tripod', zoom: 'none', lens: '50', focus: 'eyes',
    style: '', color: '', medium: '', texture: [], lightSource: 'neon', lightDirection: 'side',
    lightQuality: 'soft', weather: 'rain', time: 'night', emotion: 'surprise', micro: 'gaze',
    characterRefs: ['c1'], sceneRef: 's1', characterActions: '停下回头', transitionIn: 'cut', transitionDur: 0.4,
    transitionOut: 'fade_out', transitionOutDur: 0.8, refNote: ''
   }
  ],
  dialogueClips: [
   { start: 6.2, duration: 2.5, speakerRef: 'c1', speakerName: '林夏', language: '普通话', delivery: '轻声停顿', subtitlePos: 'bottom', subtitleStyle: '简约白字', text: '你怎么会在这里？' }
  ],
  audioClips: [
   { start: 0, duration: 5, kind: 'ambience', cue: '暴雨夜持续击打伞面声', intensity: '中低铺底', spatial: '环绕前景', fadeIn: 0.4, fadeOut: 0.4 },
   { start: 5.5, duration: 1.8, kind: 'sfx', cue: '右侧积水里两声清脆皮鞋踩水声', intensity: '先声夺人', spatial: '画外右侧由远及近', fadeIn: 0.1, fadeOut: 0.2 }
  ],
  bgmClips: [
   { start: 1, duration: 9, style: 'suspense_strings', mood: '情绪克制', duckUnderDialogue: true, fadeIn: 0.6, fadeOut: 1.0, customNote: '' }
  ],
  adjustClips: [
   { start: 0, duration: 10, label: '全片港风定调', lookOverride: '', colorOverride: '', lightOverride: '', cameraModifier: '轻微慢快门微拖影', slowMo: '', negativeOverride: '' }
  ]
 };

 const ssePayload = [
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: '先推演五轨时间轴...' }] } }] })}\n\n`,
  `data: ${JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(rawPlanObj) }] } }] })}\n\n`
 ].join('');

 const mockFetch = async (url, init) => {
  capturedUrl = url;
  capturedHeaders = init.headers;
  capturedBody = JSON.parse(init.body);
  return new Response(ssePayload, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
 };

 const out = await generateNleAIPlan({
  brief: {
   idea: '雨夜重逢',
   visualPreset: 'hk_neon',
   customShotTiming: true,
   shotCountMode: 'exact',
   shotCount: 2,
   timingMode: 'fixed',
   fixedDuration: 5,
   chainLastFrame: true,
   bgmMode: 'exact',
   bgmStyle: 'solo_piano',
   faceTier: 'hk_retro_star',
   skinRender: 'natural_pores',
   negativePrompts: ['face_deform']
  },
  connection: { apiKey: 'AIzaSyMockBrowserKey999', transport: 'browser' }
 }, { fetcher: mockFetch });

 assert.match(capturedUrl, /models\/gemini-4-hydrogen:streamGenerateContent\?alt=sse/);
 assert.equal(capturedHeaders['x-goog-api-key'], 'AIzaSyMockBrowserKey999');
 assert.equal(capturedBody.generationConfig.thinkingConfig.thinkingLevel, 'high');
 assert.equal(capturedBody.generationConfig.thinkingConfig.includeThoughts, true);

 // Verify pre-selection enforcement
 assert.equal(out.plan.shots.length, 2);
 assert.equal(out.plan.shots[0].duration, 5);
 assert.equal(out.plan.shots[1].duration, 5);
 assert.equal(out.plan.shots[0].transitionDur, 0);
 assert.equal(out.plan.shots[1].transitionIn, 'continuous');
 assert.match(out.plan.shots[1].startState, /走入廊檐甩伞/);
 assert.equal(out.plan.shots[0].style, 'hk_cinema');
 assert.equal(out.plan.bgmClips[0].style, 'solo_piano');
 assert.ok(out.plan.negativePrompts.includes('face_deform'));
 assert.ok(out.plan.negativePrompts.includes('skin'));

 // Verify applyNleAIPlan builds a clean 5-track project + merge preserves locked characters
 const created = applyNleAIPlan(null, out.plan, { mode: 'new' });
 assert.equal(created.project.tracks.video.length, 2);
 assert.equal(created.project.tracks.dialogue.length, 1);
 assert.equal(created.project.tracks.audio.length, 2);
 assert.equal(created.project.tracks.bgm.length, 1);
 assert.equal(created.project.tracks.adjust.length, 1);
 assert.ok(created.project.tracks.audio[1].start > 0);
 assert.equal(created.project.tracks.bgm[0].style, 'solo_piano');

 // Test locked character preservation when filling into existing timeline
 created.project.characters[0].lockIdentity = true;
 created.project.characters[0].outfit = '手动锁定风衣样式';
 const fillRes = applyNleAIPlan(created.project, out.plan, { mode: 'fill', reuseExisting: true });
 assert.equal(fillRes.project.characters[0].outfit, '手动锁定风衣样式');
 assert.equal(fillRes.project.tracks.video.length, 4);
});

test('testGoogleConnection and worker /api/ai routes proxy cleanly without leaking keys', async () => {
 const okFetch = async (url, init) => {
  assert.match(url, /models\/gemini-4-hydrogen$/);
  assert.equal(init.headers['x-goog-api-key'], 'AIzaSyCheck123');
  return new Response(JSON.stringify({ name: 'models/gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen' }), {
   status: 200,
   headers: { 'content-type': 'application/json' }
  });
 };
 const verified = await testGoogleConnection({ apiKey: 'AIzaSyCheck123', model: 'gemini-4-hydrogen' }, { fetcher: okFetch });
 assert.equal(verified.verified, true);
 assert.equal(verified.model, 'gemini-4-hydrogen');

 const healthRes = await handleApiRoute(new Request('http://127.0.0.1:4174/api/health'), {});
 const healthJson = await healthRes.json();
 assert.equal(healthJson.ok, true);
 assert.equal(healthJson.defaultModel, 'gemini-4-hydrogen');
 assert.equal(healthJson.thinkingLevel, 'high');

 const cfgRes = await handleApiRoute(new Request('http://127.0.0.1:4174/api/config'), { GEMINI_API_KEY: 'AIzaSySecretEnvKey' });
 const cfgTxt = await cfgRes.text();
 assert.equal(cfgTxt.includes('AIzaSySecretEnvKey'), false);
 assert.equal(JSON.parse(cfgTxt).ai.ready, true);
});

test('Muse helpers format sizing, duration clamping, FormData fields, and task state safely', async () => {
 assert.ok(MUSE_CHANNELS.length >= 3);
 assert.ok(MUSE_VIDEO_MODELS.some(([id]) => id === 'muse-video-协议'));

 assert.equal(computeVideoSize('16:9', '720p'), '1280x720');
 assert.equal(computeVideoSize('9:16', '720p'), '720x1280');
 assert.equal(computeVideoSize('1:1', '1080p'), '1088x1088');
 assert.equal(clampMuseSeconds(1, 'muse-video'), 3);
 assert.equal(clampMuseSeconds(25, 'muse-video-协议'), 10);
 assert.equal(clampMuseSeconds(5, 'doubao-video'), 10);

 const norm = normalizeMuseConfig({ channel: 'protocol', baseUrl: 'http://127.0.0.1:18611/', accountLabel: '  主号  ' });
 assert.equal(norm.channel, 'protocol');
 assert.equal(norm.baseUrl, 'http://127.0.0.1:18611');
 assert.equal(norm.accountLabel, '主号');
 assert.equal(norm.useLocalKey, true);

 assert.equal(isPlayableVideoUrl('javascript:alert(1)'), false);
 assert.equal(isPlayableVideoUrl('/api/muse/media?endpoint=x&path=%2Fv1%2Fmedia%2Fa.mp4'), true);
 assert.equal(isPlayableVideoUrl('https://cdn.example.com/out.mp4'), true);

 await assert.rejects(() => buildMuseVideoFormData({ prompt: '   ' }), /请先填写视频生成提示词/);

 const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const framesForm = await buildMuseVideoFormData({
  model: 'muse-video-协议',
  prompt: '霓虹雨夜慢推镜头',
  seconds: 12,
  ratio: '9:16',
  resolution: '720p',
  mode: 'frames',
  firstFrame: tinyPng,
  lastFrame: tinyPng
 });
 assert.equal(framesForm.seconds, 10);
 assert.equal(framesForm.size, '720x1280');
 assert.equal(framesForm.imageCount, 2);
 assert.ok(framesForm.form.get('first_frame'));
 assert.ok(framesForm.form.get('last_frame'));

 const refForm = await buildMuseVideoFormData({
  model: 'muse-video',
  prompt: '咖啡店走廊长镜头',
  mode: 'reference',
  refImages: [tinyPng]
 });
 assert.equal(refForm.form.getAll('image[]').length, 1);

 const parsedProxy = parseMuseTaskState(
  { code: 0, data: { id: 'vid_99', status: 'completed', video_url: '/v1/media/demo.mp4' } },
  { endpoint: 'http://127.0.0.1:18611/v1', useProxy: true }
 );
 assert.equal(parsedProxy.id, 'vid_99');
 assert.equal(parsedProxy.status, 'completed');
 assert.equal(
  parsedProxy.playableUrl,
  '/api/muse/media?endpoint=http%3A%2F%2F127.0.0.1%3A18611%2Fv1&path=%2Fv1%2Fmedia%2Fdemo.mp4'
 );

 const parsedFallback = parseMuseTaskState(
  { id: 'vid_100', status: 'completed' },
  { endpoint: 'http://127.0.0.1:18610/v1', useProxy: true }
 );
 assert.equal(parsedFallback.playableUrl, '/api/muse/videos/vid_100/content?endpoint=http%3A%2F%2F127.0.0.1%3A18610%2Fv1');
});

test('Muse client direct/remote workflow & loopback-from-HTTPS guard work cleanly', async () => {
 const prevLoc = globalThis.location;
 try {
  globalThis.location = { hostname: 'soulmove.github.io' };
  await assert.rejects(
   () => probeMuseService({ channel: 'protocol', baseUrl: 'http://127.0.0.1:18611/v1' }, '', { staticHost: true }),
   /GitHub Pages HTTPS/
  );
 } finally {
  if (prevLoc === undefined) delete globalThis.location;
  else globalThis.location = prevLoc;
 }

 const calls = [];
 const mockFetch = async (url, init = {}) => {
  calls.push({ url, method: init.method || 'GET', headers: init.headers });
  if (url.endsWith('/models')) {
   return new Response(JSON.stringify({ data: [{ id: 'muse-video-协议' }, { id: 'muse-video' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
   });
  }
  if (url.endsWith('/videos')) {
   return new Response(JSON.stringify({ id: 'task_abc', status: 'queued' }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
   });
  }
  if (url.endsWith('/videos/task_abc')) {
   return new Response(JSON.stringify({ id: 'task_abc', status: 'completed', video_url: 'https://cdn.example.com/ok.mp4' }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
   });
  }
  if (url.endsWith('/tasks/cancel') || url.endsWith('/videos/task_abc/recover')) {
   return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
   });
  }
  return new Response('{}', { status: 404 });
 };

 const remoteCfg = { channel: 'custom', baseUrl: 'https://muse-gw.example.com/v1', model: 'muse-video-协议', transport: 'direct' };
 const probe = await probeMuseService(remoteCfg, 'sk-remote-999', { fetcher: mockFetch, staticHost: true });
 assert.equal(probe.reachable, true);
 assert.deepEqual(probe.models, ['muse-video-协议', 'muse-video']);

 const task = await submitMuseVideoTask(remoteCfg, 'sk-remote-999', { prompt: '清晨街道逆光跑步' }, { fetcher: mockFetch, staticHost: true });
 assert.equal(task.id, 'task_abc');
 assert.equal(calls.find((c) => c.url.endsWith('/videos')).headers.Authorization, 'Bearer sk-remote-999');

 const poll = await pollMuseVideoTask(remoteCfg, 'sk-remote-999', 'task_abc', { fetcher: mockFetch, staticHost: true });
 assert.equal(poll.status, 'completed');
 assert.equal(poll.playableUrl, 'https://cdn.example.com/ok.mp4');

 assert.equal(await cancelMuseVideoTask(remoteCfg, 'sk-remote-999', { taskId: 'task_abc', cancelKey: 'ck_1' }, { fetcher: mockFetch, staticHost: true }), true);
 assert.equal(await recoverMuseVideoTask(remoteCfg, 'sk-remote-999', 'task_abc', { fetcher: mockFetch, staticHost: true }), true);
});

test('muse-bridge handles /api/muse/probe and /api/muse/videos without exposing local poolKey', async () => {
 const secretKey = 'LOCAL_SECRET_POOL_KEY_DO_NOT_LEAK';
 const installReader = async () => ({
  found: true,
  version: '0.23.2',
  dataDir: 'E:\\MuseCanvasData',
  ports: { web: 3000, pool: 18610, protocol: 18611 },
  poolKey: secretKey
 });

 const upstreamCalls = [];
 const mockFetcher = async (url, init = {}) => {
  upstreamCalls.push({ url, headers: init.headers });
  if (url === 'http://127.0.0.1:18611/health') {
   return new Response(JSON.stringify({ ok: true, accounts: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'http://127.0.0.1:18611/v1/models') {
   return new Response(JSON.stringify({ data: [{ id: 'muse-video-协议' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'http://127.0.0.1:18610/admin/status') {
   return new Response(JSON.stringify({ accounts: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'http://127.0.0.1:18611/v1/videos') {
   return new Response(JSON.stringify({ id: 'task_local_1', debug_token: secretKey }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 404 });
 };

 const probeReq = new Request('http://127.0.0.1:4174/api/muse/probe', { method: 'POST' });
 const probeRes = await handleLocalMuseRoute(probeReq, new URL(probeReq.url), {
  fetcher: mockFetcher,
  bodyBuffer: Buffer.from(JSON.stringify({ channel: 'protocol', useLocalKey: true })),
  installReader
 });
 const probeText = await probeRes.text();
 assert.equal(probeRes.status, 200);
 assert.equal(probeText.includes(secretKey), false);
 const probeJson = JSON.parse(probeText);
 assert.equal(probeJson.hasLocalPoolKey, true);
 assert.equal(probeJson.reachable, true);
 assert.equal(probeJson.accountsKnown, true);
 assert.equal(probeJson.accountCount, 0);
 assert.deepEqual(probeJson.models, ['muse-video-协议']);

 const vidReq = new Request('http://127.0.0.1:4174/api/muse/videos', {
  method: 'POST',
  headers: { 'x-muse-channel': 'protocol', 'x-muse-use-local-key': '1', 'content-type': 'multipart/form-data; boundary=x' }
 });
 const vidRes = await handleLocalMuseRoute(vidReq, new URL(vidReq.url), {
  fetcher: mockFetcher,
  bodyBuffer: Buffer.from('--x--'),
  installReader
 });
 const vidText = await vidRes.text();
 assert.equal(vidRes.status, 200);
 assert.equal(vidText.includes(secretKey), false);
 assert.equal(upstreamCalls.find((c) => c.url.endsWith('/v1/videos')).headers.Authorization, `Bearer ${secretKey}`);
 assert.equal(upstreamCalls.find((c) => c.url.endsWith('/v1/videos')).headers['x-mc-platform'], 'win32-x64');

 const badMediaReq = new Request('http://127.0.0.1:4174/api/muse/media?path=%2Fv1%2F..%2Fsecret');
 const badMediaRes = await handleLocalMuseRoute(badMediaReq, new URL(badMediaReq.url), { fetcher: mockFetcher, installReader });
 assert.equal(badMediaRes.status, 400);
});
