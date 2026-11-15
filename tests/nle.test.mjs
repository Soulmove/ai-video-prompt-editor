import test from 'node:test';
import assert from 'node:assert/strict';

import { NLE_SQUARE_TEMPLATES, GROUPS } from '../dist/nle-catalog.mjs';
import { renderOptionSwatch } from '../dist/nle-swatches.mjs';

import {
 createBlankProject,
 createDemoProject,
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
