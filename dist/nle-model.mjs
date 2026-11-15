import {
 GROUPS,
 CHARACTER_FIELDS,
 SCENE_FIELDS,
 CLIP_PRESETS,
 NLE_DEMO_SEED,
 VERSION
} from './nle-catalog.mjs';

const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MIN_DURATION = 0.5;

let _seq = 0;

/**
 * Generate a compact unique identifier with an optional prefix.
 */
export function uid(prefix = 'id') {
 _seq = (_seq + 1) % 100000;
 const rand = typeof globalThis.crypto?.randomUUID === 'function'
  ? globalThis.crypto.randomUUID().slice(0, 8)
  : `${Date.now().toString(36)}_${_seq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
 return `${prefix}_${rand}`;
}

/**
 * Deep clone plain JSON-compatible data.
 */
export function clone(v) {
 if (typeof globalThis.structuredClone === 'function') {
  return globalThis.structuredClone(v);
 }
 return JSON.parse(JSON.stringify(v));
}

/**
 * Round time values to 0.1s precision to prevent floating-point drift.
 */
export function roundT(v) {
 const n = Number(v);
 if (!Number.isFinite(n)) return 0;
 return Math.round(n * 10) / 10;
}

/**
 * Format seconds as MM:SS.d (e.g. 00:04.5).
 */
export function fmtTimecode(sec) {
 const safe = Math.max(0, roundT(sec));
 const mins = Math.floor(safe / 60);
 const rem = safe - mins * 60;
 const whole = Math.floor(rem);
 const tenths = Math.round((rem - whole) * 10) % 10;
 return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${tenths}`;
}

/**
 * Format seconds as NLE frame timecode MM:SS:FF (e.g. 00:04:12 at 24fps).
 */
export function fmtFramesTimecode(sec, fps = 24) {
 const rate = Math.max(1, Number(fps) || 24);
 const safe = Math.max(0, Number(sec) || 0);
 const totalFrames = Math.round(safe * rate);
 const mins = Math.floor(totalFrames / (60 * rate));
 const remFrames = totalFrames % (60 * rate);
 const secs = Math.floor(remFrames / rate);
 const frames = remFrames % rate;
 return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

/**
 * Parse aspect format string into numeric ratio parts for stage preview.
 */
export function aspectRatioParts(format, customAspect = '') {
 const raw = format === 'custom' ? String(customAspect || '16:9') : String(format || '16:9');
 const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*[:xX/×]\s*(\d+(?:\.\d+)?)$/);
 if (match) {
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (w > 0 && h > 0) return { w, h, ratio: w / h, label: `${match[1]}:${match[2]}` };
 }
 return { w: 16, h: 9, ratio: 16 / 9, label: '16:9' };
}

/**
 * Return the option array for any vocabulary group key.
 */
export function groupOptions(groupKey) {
 const group = GROUPS?.[groupKey];
 if (!group) return [];
 if (Array.isArray(group)) return group;
 if (Array.isArray(group.options)) return group.options;
 if (Array.isArray(group.items)) return group.items;
 return [];
}

/**
 * Look up an option item in GROUPS by group key and option id.
 */
export function groupItem(groupKey, id) {
 if (!id) return null;
 return groupOptions(groupKey).find((item) => item && item.id === id) || null;
}

/**
 * Return compact UI display label for a vocabulary id.
 */
export function groupLabel(groupKey, id) {
 if (!id) return '';
 const item = groupItem(groupKey, id);
 if (!item) return String(id);
 return item.label || item.zh || item.en || String(id);
}

/**
 * Return localized prompt description (zh or en) for a vocabulary id.
 */
export function groupText(groupKey, id, lang = 'zh') {
 if (!id) return '';
 const item = groupItem(groupKey, id);
 if (!item) return String(id);
 if (lang === 'en') return item.en || item.zh || item.label || String(id);
 return item.zh || item.label || item.en || String(id);
}

/**
 * Build default clip object for any of the 5 NLE tracks.
 */
export function defaultClipData(track, overrides = {}) {
 const o = overrides && typeof overrides === 'object' ? overrides : {};
 const start = roundT(Math.max(0, Number(o.start ?? 0)));
 const defaultDur = track === 'dialogue' ? 2.5 : track === 'audio' ? 2 : track === 'bgm' ? 8 : 4;
 const duration = roundT(Math.max(MIN_DURATION, Number(o.duration ?? defaultDur)));
 const prefix = track === 'video' ? 'v' : track === 'dialogue' ? 't' : track === 'audio' ? 'a' : track === 'bgm' ? 'b' : 'e';
 const id = typeof o.id === 'string' && o.id ? o.id : uid(prefix);

 if (track === 'video') {
  return {
   id,
   start,
   duration,
   title: String(o.title ?? '新分镜'),
   prompt: String(o.prompt ?? ''),
   startState: String(o.startState ?? ''),
   endState: String(o.endState ?? ''),
   framing: String(o.framing ?? 'wide'),
   angle: String(o.angle ?? 'eye'),
   composition: String(o.composition ?? ''),
   move: String(o.move ?? 'stationary'),
   speed: String(o.speed ?? 'even'),
   moveDistance: String(o.moveDistance ?? ''),
   stability: String(o.stability ?? 'tripod'),
   rotation: String(o.rotation ?? ''),
   zoom: String(o.zoom ?? ''),
   lens: String(o.lens ?? ''),
   focus: String(o.focus ?? ''),
   style: String(o.style ?? o.look ?? ''),
   medium: String(o.medium ?? ''),
   genre: String(o.genre ?? ''),
   color: String(o.color ?? ''),
   texture: Array.isArray(o.texture) ? [...o.texture] : [],
   lightSource: String(o.lightSource ?? ''),
   lightDirection: String(o.lightDirection ?? ''),
   lightQuality: String(o.lightQuality ?? ''),
   weather: String(o.weather ?? ''),
   time: String(o.time ?? ''),
   emotion: String(o.emotion ?? ''),
   micro: String(o.micro ?? ''),
   sceneId: String(o.sceneId ?? ''),
   characterIds: Array.isArray(o.characterIds) ? [...o.characterIds] : [],
   characterActions: String(o.characterActions ?? ''),
   transitionIn: String(o.transitionIn ?? 'cut'),
   transitionDur: roundT(Math.max(0, Math.min(2, Number(o.transitionDur ?? 0.4)))),
   speedRate: Number(o.speedRate ?? 1) || 1,
   refImage: String(o.refImage ?? ''),
   refNote: String(o.refNote ?? '')
  };
 }

 if (track === 'dialogue') {
  return {
   id,
   start,
   duration,
   speakerId: String(o.speakerId ?? ''),
   speakerName: String(o.speakerName ?? '主角'),
   language: String(o.language ?? '普通话'),
   delivery: String(o.delivery ?? ''),
   text: String(o.text ?? '')
  };
 }

 if (track === 'audio') {
  return {
   id,
   start,
   duration,
   kind: o.kind === 'ambience' ? 'ambience' : 'sfx',
   cue: String(o.cue ?? ''),
   intensity: String(o.intensity ?? '自然贴合画面'),
   spatial: String(o.spatial ?? ''),
   fadeIn: roundT(Math.max(0, Number(o.fadeIn ?? 0))),
   fadeOut: roundT(Math.max(0, Number(o.fadeOut ?? 0)))
  };
 }

 if (track === 'bgm') {
  return {
   id,
   start,
   duration,
   style: String(o.style ?? ''),
   mood: String(o.mood ?? ''),
   duckUnderDialogue: o.duckUnderDialogue !== false,
   fadeIn: roundT(Math.max(0, Number(o.fadeIn ?? 0.5))),
   fadeOut: roundT(Math.max(0, Number(o.fadeOut ?? 0.8))),
   customNote: String(o.customNote ?? '')
  };
 }

 return {
  id,
  start,
  duration,
  label: String(o.label ?? '调节层'),
  lookOverride: String(o.lookOverride ?? o.style ?? ''),
  colorOverride: String(o.colorOverride ?? ''),
  lightOverride: String(o.lightOverride ?? ''),
  cameraModifier: String(o.cameraModifier ?? ''),
  slowMo: String(o.slowMo ?? ''),
  negativeOverride: String(o.negativeOverride ?? '')
 };
}

/**
 * Create a strictly empty 00:00 project — zero AI dependency, ready for manual editing.
 */
export function createBlankProject(opts = {}) {
 const now = Date.now();
 return {
  id: typeof opts.id === 'string' && opts.id ? opts.id : uid('proj'),
  version: VERSION,
  title: String(opts.title || '未命名工程 · 00:00 空白起剪'),
  format: String(opts.format || '16:9'),
  customAspect: String(opts.customAspect || ''),
  resolution: String(opts.resolution || '4K'),
  customResolution: String(opts.customResolution || ''),
  fps: Number(opts.fps || 24) || 24,
  notes: String(opts.notes || ''),
  characters: [],
  scenes: [],
  tracks: {
   adjust: [],
   video: [],
   dialogue: [],
   audio: [],
   bgm: []
  },
  negativePrompts: Array.isArray(opts.negativePrompts) ? [...opts.negativePrompts] : ['identity', 'flicker', 'watermark'],
  customNegative: String(opts.customNegative || ''),
  playhead: 0,
  zoom: Number(opts.zoom || 72) || 72,
  snap: opts.snap !== false,
  ripple: opts.ripple !== false,
  outputMode: String(opts.outputMode || 'storyboard'),
  outputLang: opts.outputLang === 'en' ? 'en' : 'zh',
  selected: null,
  createdAt: Number(opts.createdAt || now),
  updatedAt: Number(opts.updatedAt || now)
 };
}

/**
 * Create an optional populated multi-track demo project from NLE_DEMO_SEED.
 */
export function createDemoProject() {
 const seed = clone(NLE_DEMO_SEED);
 const proj = createBlankProject({
  title: seed.title,
  format: seed.format,
  resolution: seed.resolution,
  fps: seed.fps,
  notes: seed.notes,
  negativePrompts: seed.negativePrompts
 });
 proj.characters = (seed.characters || []).map((c) => ({ ...clone(c) }));
 proj.scenes = (seed.scenes || []).map((s) => ({ ...clone(s) }));
 for (const key of ['video', 'dialogue', 'audio', 'bgm', 'adjust']) {
  proj.tracks[key] = (seed.tracks?.[key] || []).map((c) => defaultClipData(key, c));
 }
 normalizeAllTracks(proj);
 proj.selected = proj.tracks.video[0] ? { track: 'video', id: proj.tracks.video[0].id } : null;
 return proj;
}

/**
 * Recursively strip prototype-pollution keys from parsed JSON.
 */
export function sanitizeImportedObject(val) {
 if (Array.isArray(val)) return val.map(sanitizeImportedObject);
 if (!val || typeof val !== 'object') return val;
 const out = {};
 for (const [k, v] of Object.entries(val)) {
  if (POISON_KEYS.has(k)) continue;
  out[k] = sanitizeImportedObject(v);
 }
 return out;
}

/**
 * Normalize V1 video tracks cleanly: pack back-to-back if ripple=true, else avoid overlap.
 */
export function normalizeVideoTrack(project) {
 const list = project?.tracks?.video;
 if (!Array.isArray(list)) return project;
 for (const clip of list) {
  clip.start = roundT(Math.max(0, Number(clip.start || 0)));
  clip.duration = roundT(Math.max(MIN_DURATION, Number(clip.duration || 4)));
 }
 list.sort((a, b) => a.start - b.start);
 if (project.ripple) {
  let cursor = 0;
  for (const clip of list) {
   clip.start = roundT(cursor);
   cursor = roundT(cursor + clip.duration);
  }
 } else {
  let prevEnd = 0;
  for (const clip of list) {
   if (clip.start < prevEnd) {
    clip.start = roundT(prevEnd);
   }
   prevEnd = roundT(clip.start + clip.duration);
  }
 }
 return project;
}

/**
 * Normalize non-video multi-track items (preserve J-cut / L-cut start positions).
 */
export function normalizeAllTracks(project) {
 normalizeVideoTrack(project);
 for (const track of ['adjust', 'dialogue', 'audio', 'bgm']) {
  const list = project?.tracks?.[track];
  if (!Array.isArray(list)) continue;
  for (const clip of list) {
   clip.start = roundT(Math.max(0, Number(clip.start || 0)));
   clip.duration = roundT(Math.max(MIN_DURATION, Number(clip.duration || 2)));
  }
  list.sort((a, b) => a.start - b.start);
 }
 return project;
}

/**
 * Total timeline duration across all 5 tracks (0 when timeline is blank).
 */
export function projectDuration(project) {
 if (!project?.tracks) return 0;
 let maxEnd = 0;
 for (const key of ['adjust', 'video', 'dialogue', 'audio', 'bgm']) {
  for (const clip of project.tracks[key] || []) {
   const end = roundT((clip.start || 0) + (clip.duration || 0));
   if (end > maxEnd) maxEnd = end;
  }
 }
 return roundT(maxEnd);
}

/**
 * Add a clip onto any track (`video`, `dialogue`, `audio`, `bgm`, `adjust`).
 */
export function addClip(project, track, spec = {}, options = {}) {
 if (!project?.tracks || !Array.isArray(project.tracks[track])) {
  throw new Error(`Unsupported track: ${track}`);
 }
 let desiredStart = options.atStart;
 if (desiredStart === undefined) {
  if (track === 'video') {
   if (options.atPlayhead) {
    desiredStart = roundT(Math.max(0, project.playhead || 0));
   } else {
    const vids = project.tracks.video;
    desiredStart = vids.length ? roundT(vids[vids.length - 1].start + vids[vids.length - 1].duration) : 0;
   }
  } else {
   desiredStart = roundT(Math.max(0, project.playhead || 0));
  }
 }
 desiredStart = roundT(Math.max(0, Number(desiredStart) || 0));
 const clip = defaultClipData(track, { ...clone(spec), start: desiredStart });

 if (track === 'video' && options.atPlayhead && project.tracks.video.length) {
  // Make room on V1 when inserting mid-timeline at playhead
  for (const existing of project.tracks.video) {
   if (existing.start >= desiredStart) {
    existing.start = roundT(existing.start + clip.duration);
   }
  }
 }

 project.tracks[track].push(clip);
 normalizeAllTracks(project);
 project.selected = { track, id: clip.id };
 project.updatedAt = Date.now();
 return { project, clip };
}

/**
 * Add a clip directly from a CLIP_PRESETS id or preset object.
 */
export function addPresetClip(project, presetIdOrObj, options = {}) {
 const preset = typeof presetIdOrObj === 'string'
  ? CLIP_PRESETS.find((p) => p.id === presetIdOrObj)
  : presetIdOrObj;
 if (!preset) throw new Error(`Preset not found: ${presetIdOrObj}`);
 return addClip(project, preset.track, { ...clone(preset.data), duration: preset.duration }, options);
}

/**
 * Split any track clip at `splitTime`, enforcing >= 0.5s minimum on both sides.
 */
export function splitClipAt(project, track, clipId, splitTime) {
 const list = project?.tracks?.[track];
 if (!Array.isArray(list)) return { project, ok: false, reason: '轨道不存在' };
 const idx = list.findIndex((c) => c.id === clipId);
 if (idx < 0) return { project, ok: false, reason: '未找到选中片段' };

 const orig = list[idx];
 const cut = roundT(splitTime);
 const origEnd = roundT(orig.start + orig.duration);
 const leftDur = roundT(cut - orig.start);
 const rightDur = roundT(origEnd - cut);

 if (leftDur < MIN_DURATION || rightDur < MIN_DURATION) {
  return { project, ok: false, reason: '播放头距离片段边缘太近，分割后每段至少需保留 0.5s' };
 }

 orig.duration = leftDur;
 const rightCopy = clone(orig);
 rightCopy.id = uid(track === 'video' ? 'v' : track === 'dialogue' ? 't' : track === 'audio' ? 'a' : track === 'bgm' ? 'b' : 'e');
 rightCopy.start = cut;
 rightCopy.duration = rightDur;

 if (track === 'video') {
  const baseTitle = (orig.title || '分镜').replace(/\s*\(续\d*\)$/, '');
  rightCopy.title = `${baseTitle} (续)`;
  rightCopy.transitionIn = 'cut';
 }

 list.splice(idx + 1, 0, rightCopy);
 normalizeAllTracks(project);
 project.selected = { track, id: rightCopy.id };
 project.updatedAt = Date.now();
 return { project, ok: true, left: orig, right: rightCopy };
}

/**
 * Split whichever clip is under playhead across selected track (or priority track order).
 */
export function splitAtPlayhead(project) {
 const t = roundT(project.playhead || 0);
 if (project.selected?.track && project.selected?.id) {
  const target = (project.tracks[project.selected.track] || []).find((c) => c.id === project.selected.id);
  if (target && t > target.start && t < roundT(target.start + target.duration)) {
   return splitClipAt(project, project.selected.track, target.id, t);
  }
 }
 for (const track of ['video', 'dialogue', 'audio', 'bgm', 'adjust']) {
  const hit = (project.tracks[track] || []).find((c) => t > c.start && t < roundT(c.start + c.duration));
  if (hit) {
   return splitClipAt(project, track, hit.id, t);
  }
 }
 return { project, ok: false, reason: '当前播放头位置没有可分割的片段（请先把红线移到片段中间）' };
}

/**
 * Move a clip to `newStart` (or reorder on V1 when ripple=true).
 */
export function moveClip(project, track, clipId, newStart, targetIndex = null) {
 const list = project?.tracks?.[track];
 if (!Array.isArray(list)) return project;
 const idx = list.findIndex((c) => c.id === clipId);
 if (idx < 0) return project;

 const clamped = roundT(Math.max(0, Number(newStart) || 0));
 const clip = list[idx];

 if (track === 'video' && project.ripple) {
  const others = list.filter((c) => c.id !== clipId);
  let insertAt = targetIndex;
  if (insertAt === null || insertAt === undefined) {
   insertAt = 0;
   for (let i = 0; i < others.length; i++) {
    const mid = others[i].start + others[i].duration / 2;
    if (clamped >= mid) insertAt = i + 1;
   }
  }
  insertAt = Math.max(0, Math.min(others.length, insertAt));
  others.splice(insertAt, 0, clip);
  let cursor = 0;
  for (const item of others) {
   item.start = roundT(cursor);
   cursor = roundT(cursor + item.duration);
  }
  project.tracks.video = others;
 } else {
  clip.start = clamped;
  normalizeAllTracks(project);
 }

 project.updatedAt = Date.now();
 return project;
}

/**
 * Trim left or right edge of a clip (`edge: 'left' | 'right'`), enforcing >= 0.5s.
 */
export function trimClip(project, track, clipId, edge, newTime) {
 const list = project?.tracks?.[track];
 if (!Array.isArray(list)) return project;
 const idx = list.findIndex((c) => c.id === clipId);
 if (idx < 0) return project;

 const clip = list[idx];
 const oldStart = clip.start;
 const oldEnd = roundT(clip.start + clip.duration);
 const target = roundT(Math.max(0, Number(newTime) || 0));

 if (edge === 'left') {
  let minStart = 0;
  if (track === 'video' && !project.ripple && idx > 0) {
   minStart = roundT(list[idx - 1].start + list[idx - 1].duration);
  }
  const maxStart = roundT(oldEnd - MIN_DURATION);
  const clampedStart = roundT(Math.max(minStart, Math.min(maxStart, target)));
  clip.start = clampedStart;
  clip.duration = roundT(Math.max(MIN_DURATION, oldEnd - clampedStart));
 } else {
  let maxEnd = Infinity;
  if (track === 'video' && !project.ripple && idx < list.length - 1) {
   maxEnd = list[idx + 1].start;
  }
  const minEnd = roundT(oldStart + MIN_DURATION);
  const clampedEnd = roundT(Math.max(minEnd, Math.min(maxEnd, target)));
  clip.duration = roundT(Math.max(MIN_DURATION, clampedEnd - oldStart));
 }

 if (track === 'video' && project.ripple) {
  normalizeVideoTrack(project);
 } else {
  normalizeAllTracks(project);
 }
 project.updatedAt = Date.now();
 return project;
}

/**
 * Delete a clip by track & id; ripples remaining V1 shots when ripple=true.
 */
export function deleteClip(project, track, clipId) {
 const list = project?.tracks?.[track];
 if (!Array.isArray(list)) return project;
 const idx = list.findIndex((c) => c.id === clipId);
 if (idx < 0) return project;

 list.splice(idx, 1);
 normalizeAllTracks(project);

 if (project.selected?.track === track && project.selected?.id === clipId) {
  const fallback = list[idx] || list[idx - 1] || project.tracks.video[0] || null;
  if (fallback) {
   const fallbackTrack = list.includes(fallback) ? track : 'video';
   project.selected = { track: fallbackTrack, id: fallback.id };
  } else {
   project.selected = null;
  }
 }
 project.updatedAt = Date.now();
 return project;
}

/**
 * Duplicate a clip right after itself and select the copy.
 */
export function duplicateClip(project, track, clipId) {
 const list = project?.tracks?.[track];
 if (!Array.isArray(list)) return { project, clip: null };
 const orig = list.find((c) => c.id === clipId);
 if (!orig) return { project, clip: null };

 const copy = clone(orig);
 copy.id = uid(track === 'video' ? 'v' : track === 'dialogue' ? 't' : track === 'audio' ? 'a' : track === 'bgm' ? 'b' : 'e');
 copy.start = roundT(orig.start + orig.duration);
 if (track === 'video') {
  copy.title = `${orig.title || '分镜'} (副本)`;
  copy.transitionIn = 'cut';
  for (const item of list) {
   if (item.start >= copy.start) {
    item.start = roundT(item.start + copy.duration);
   }
  }
 }
 list.push(copy);
 normalizeAllTracks(project);
 project.selected = { track, id: copy.id };
 project.updatedAt = Date.now();
 return { project, clip: copy };
}

/**
 * Return exact multi-track state at timeline time `t`.
 */
export function stateAtTime(project, t) {
 const totalDuration = projectDuration(project);
 const clamped = totalDuration <= 0 ? 0 : roundT(Math.max(0, Math.min(totalDuration, Number(t) || 0)));
 const isActive = (clip) => {
  const end = roundT(clip.start + clip.duration);
  if (clamped >= clip.start && clamped < end) return true;
  return totalDuration > 0 && clamped === totalDuration && end === totalDuration;
 };

 const videos = project?.tracks?.video || [];
 const videoIdx = videos.findIndex(isActive);
 const video = videoIdx >= 0 ? videos[videoIdx] : null;
 const prevVideo = videoIdx > 0 ? videos[videoIdx - 1] : null;

 let transitionActive = null;
 if (video && video.transitionIn && video.transitionIn !== 'cut' && video.transitionDur > 0) {
  const into = roundT(clamped - video.start);
  if (into >= 0 && into < video.transitionDur) {
   transitionActive = {
    type: video.transitionIn,
    duration: video.transitionDur,
    progress: Math.min(1, Math.max(0, into / video.transitionDur))
   };
  }
 }

 const dialogues = (project?.tracks?.dialogue || []).filter(isActive);
 const audios = (project?.tracks?.audio || []).filter(isActive);
 const bgms = (project?.tracks?.bgm || []).filter(isActive).map((b) => ({
  ...b,
  isDucking: Boolean(b.duckUnderDialogue && dialogues.length > 0)
 }));
 const adjusts = (project?.tracks?.adjust || []).filter(isActive);

 let effectiveVisual = video ? clone(video) : null;
 if (effectiveVisual && adjusts.length) {
  for (const adj of adjusts) {
   if (adj.lookOverride) effectiveVisual.style = adj.lookOverride;
   if (adj.colorOverride) effectiveVisual.color = adj.colorOverride;
   if (adj.lightOverride) effectiveVisual.lightSource = adj.lightOverride;
   if (adj.cameraModifier) {
    effectiveVisual.moveNote = effectiveVisual.moveNote
     ? `${effectiveVisual.moveNote}；${adj.cameraModifier}`
     : adj.cameraModifier;
   }
   if (adj.slowMo) effectiveVisual.slowMo = adj.slowMo;
  }
 }

 return {
  time: clamped,
  totalDuration,
  video,
  prevVideo,
  transitionActive,
  dialogues,
  audios,
  bgms,
  adjusts,
  effectiveVisual
 };
}

/**
 * Run non-AI structural timeline inspection checks.
 */
export function validateTimeline(project) {
 const issues = [];
 const videos = project?.tracks?.video || [];
 const dialogues = project?.tracks?.dialogue || [];

 if (!videos.length) {
  issues.push({
   severity: 'info',
   track: 'video',
   clipId: null,
   message: 'V1 主分镜轨当前为空（00:00 空白工程）——点击下方「+ 新分镜」即可从 0 开始剪辑。'
  });
  return issues;
 }

 for (let i = 0; i < videos.length; i++) {
  const v = videos[i];
  if (!String(v.prompt || '').trim()) {
   issues.push({
    severity: 'warn',
    track: 'video',
    clipId: v.id,
    message: `V1「${v.title || `#${i + 1}`}」尚未填写主体动作描述。`
   });
  }
  if (v.duration > 10) {
   issues.push({
    severity: 'info',
    track: 'video',
    clipId: v.id,
    message: `V1「${v.title}」时长 ${v.duration}s 较长，可用「✂️ 分割」拆成多个景别节奏更稳。`
   });
  }
  if (i > 0) {
   const prevEnd = roundT(videos[i - 1].start + videos[i - 1].duration);
   const gap = roundT(v.start - prevEnd);
   if (gap > 0.1) {
    issues.push({
     severity: 'info',
     track: 'video',
     clipId: v.id,
     message: `V1 在 ${fmtTimecode(prevEnd)}~${fmtTimecode(v.start)} 存在 ${gap}s 黑场空隙（关闭联动时允许留白）。`
    });
   }
  }
 }

 for (const d of dialogues) {
  const cleanLen = String(d.text || '').replace(/[“”"'，。！？、…\s]/g, '').length;
  if (cleanLen > 0 && cleanLen / 4.2 > d.duration + 0.6) {
   issues.push({
    severity: 'warn',
    track: 'dialogue',
    clipId: d.id,
    message: `T1 对白（${d.speakerName || '角色'} ${d.duration}s）约 ${cleanLen} 字，语速可能偏赶，建议右拉延长时间条。`
   });
  }
  const hasVideoUnder = videos.some((v) => v.start < roundT(d.start + d.duration) && roundT(v.start + v.duration) > d.start);
  if (!hasVideoUnder) {
   issues.push({
    severity: 'warn',
    track: 'dialogue',
    clipId: d.id,
    message: `T1 对白（${fmtTimecode(d.start)}）下方没有对应的 V1 视频镜头覆盖。`
   });
  }
 }

 return issues;
}

/**
 * Convert a Jingxu 1.0 `.jingxu.json` project snapshot cleanly into a 5-track V2 project.
 */
export function convertV1ToV2(v1Raw) {
 const v1 = sanitizeImportedObject(v1Raw || {});
 const proj = createBlankProject({
  title: v1.title ? `${v1.title} (2.0 多轨版)` : '从 1.0 导入的工程',
  format: v1.format || '16:9',
  customAspect: v1.customAspect || '',
  resolution: v1.resolution || '4K',
  customResolution: v1.customResolution || '',
  fps: Number(v1.fps || 24) || 24,
  notes: v1.notes || v1.styleNotes || '',
  negativePrompts: Array.isArray(v1.negativePrompts) ? v1.negativePrompts : Array.isArray(v1.negatives) ? v1.negatives : ['identity', 'flicker', 'watermark'],
  customNegative: v1.customNegative || '',
  outputLang: v1.outputLang === 'en' ? 'en' : 'zh'
 });

 const charMap = new Map();
 for (const c of Array.isArray(v1.characters) ? v1.characters : []) {
  const newId = uid('char');
  if (c.id) charMap.set(c.id, newId);
  proj.characters.push({ ...clone(c), id: newId });
 }

 const sceneMap = new Map();
 for (const s of Array.isArray(v1.scenes) ? v1.scenes : []) {
  const newId = uid('scene');
  if (s.id) sceneMap.set(s.id, newId);
  proj.scenes.push({ ...clone(s), id: newId });
 }

 const sourceShots = Array.isArray(v1.shots) ? v1.shots : Array.isArray(v1.storyboard) ? v1.storyboard : [];
 let cursor = 0;

 sourceShots.forEach((sh, index) => {
  const dur = roundT(Math.max(MIN_DURATION, Number(sh.duration || sh.sec || 4) || 4));
  const charIds = Array.isArray(sh.characterIds)
   ? sh.characterIds.map((id) => charMap.get(id) || id)
   : sh.characterId && charMap.has(sh.characterId)
    ? [charMap.get(sh.characterId)]
    : [];

  const vClip = defaultClipData('video', {
   start: cursor,
   duration: dur,
   title: sh.title || sh.name || `分镜 ${String(index + 1).padStart(2, '0')}`,
   prompt: sh.prompt || sh.action || sh.visual || '',
   startState: sh.startState || sh.firstFrame || '',
   endState: sh.endState || sh.lastFrame || '',
   framing: sh.framing || 'wide',
   angle: sh.angle || 'eye',
   composition: sh.composition || '',
   move: sh.move || 'stationary',
   speed: sh.speed || 'even',
   moveDistance: sh.moveDistance || '',
   stability: sh.stability || 'tripod',
   rotation: sh.rotation || '',
   zoom: sh.zoom || '',
   lens: sh.lens || '',
   focus: sh.focus || '',
   style: sh.style || sh.look || v1.look || '',
   medium: sh.medium || v1.medium || '',
   genre: sh.genre || v1.genre || '',
   color: sh.color || v1.color || '',
   texture: Array.isArray(sh.texture) ? sh.texture : Array.isArray(v1.texture) ? v1.texture : [],
   lightSource: sh.lightSource || '',
   lightDirection: sh.lightDirection || '',
   lightQuality: sh.lightQuality || '',
   weather: sh.weather || '',
   time: sh.time || '',
   emotion: sh.emotion || '',
   micro: sh.micro || '',
   sceneId: sh.sceneId ? (sceneMap.get(sh.sceneId) || '') : '',
   characterIds: charIds,
   characterActions: sh.characterActions || '',
   transitionIn: sh.transitionIn || (index === 0 ? 'fade_in' : 'cut'),
   transitionDur: Number(sh.transitionDur ?? 0.4) || 0.4,
   refImage: sh.refImage || '',
   refNote: sh.refNote || ''
  });
  proj.tracks.video.push(vClip);

  const lineText = String(sh.dialogue || sh.spokenLines || sh.speech || sh.lines || '').trim();
  if (lineText) {
   const firstChar = proj.characters.find((c) => charIds.includes(c.id));
   proj.tracks.dialogue.push(defaultClipData('dialogue', {
    start: cursor,
    duration: roundT(Math.max(MIN_DURATION, Math.min(dur, Math.max(1.5, dur - 0.2)))),
    speakerId: firstChar?.id || '',
    speakerName: firstChar?.name || sh.speaker || '角色',
    language: sh.dialogueLang || v1.dialogueLang || '普通话',
    delivery: sh.delivery || '',
    text: lineText
   }));
  }

  const sfxText = String(sh.sfx || sh.soundEffects || sh.audioCue || '').trim();
  if (sfxText) {
   proj.tracks.audio.push(defaultClipData('audio', {
    start: cursor,
    duration: roundT(Math.max(MIN_DURATION, Math.min(dur, 3))),
    kind: 'sfx',
    cue: sfxText
   }));
  }

  cursor = roundT(cursor + dur);
 });

 if ((v1.bgm || v1.bgmCustom) && cursor > 0) {
  proj.tracks.bgm.push(defaultClipData('bgm', {
   start: 0,
   duration: cursor,
   style: v1.bgm || '',
   mood: v1.bgmCustom || '贴合 1.0 原工程配乐基调',
   duckUnderDialogue: true
  }));
 }

 normalizeAllTracks(proj);
 proj.selected = proj.tracks.video[0] ? { track: 'video', id: proj.tracks.video[0].id } : null;
 return proj;
}

/**
 * Parse either a Jingxu 2.0 multi-track JSON or a Jingxu 1.0 `.jingxu.json` export.
 */
export function parseAnyProjectImport(textOrObj, { rekey = true } = {}) {
 let parsed = textOrObj;
 if (typeof textOrObj === 'string') {
  const clean = textOrObj.replace(/^\uFEFF/, '').trim();
  if (!clean) throw new Error('导入内容为空，请粘贴或选择有效的 JSON 工程文件。');
  parsed = JSON.parse(clean);
 }
 if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
  throw new Error('无效的工程结构：根节点必须是 JSON 对象。');
 }

 const safe = sanitizeImportedObject(parsed);

 // Detect 2.0 multi-track structure
 if (safe.tracks && typeof safe.tracks === 'object' && Array.isArray(safe.tracks.video)) {
  const proj = createBlankProject({
   id: rekey ? uid('proj') : (safe.id || uid('proj')),
   title: safe.title || '导入的 2.0 工程',
   format: safe.format || '16:9',
   customAspect: safe.customAspect || '',
   resolution: safe.resolution || '4K',
   customResolution: safe.customResolution || '',
   fps: safe.fps || 24,
   notes: safe.notes || '',
   negativePrompts: Array.isArray(safe.negativePrompts) ? safe.negativePrompts : ['identity', 'flicker', 'watermark'],
   customNegative: safe.customNegative || '',
   zoom: safe.zoom || 72,
   snap: safe.snap !== false,
   ripple: safe.ripple !== false,
   outputMode: safe.outputMode || 'storyboard',
   outputLang: safe.outputLang === 'en' ? 'en' : 'zh'
  });

  const charMap = new Map();
  for (const c of Array.isArray(safe.characters) ? safe.characters : []) {
   const nextId = rekey ? uid('char') : (c.id || uid('char'));
   if (c.id) charMap.set(c.id, nextId);
   proj.characters.push({ ...clone(c), id: nextId });
  }

  const sceneMap = new Map();
  for (const s of Array.isArray(safe.scenes) ? safe.scenes : []) {
   const nextId = rekey ? uid('scene') : (s.id || uid('scene'));
   if (s.id) sceneMap.set(s.id, nextId);
   proj.scenes.push({ ...clone(s), id: nextId });
  }

  for (const track of ['video', 'dialogue', 'audio', 'bgm', 'adjust']) {
   for (const item of Array.isArray(safe.tracks[track]) ? safe.tracks[track] : []) {
    const nextItem = clone(item);
    if (rekey) delete nextItem.id;
    if (track === 'video') {
     if (nextItem.sceneId && sceneMap.has(nextItem.sceneId)) nextItem.sceneId = sceneMap.get(nextItem.sceneId);
     if (Array.isArray(nextItem.characterIds)) {
      nextItem.characterIds = nextItem.characterIds.map((id) => charMap.get(id) || id);
     }
    }
    if (track === 'dialogue' && nextItem.speakerId && charMap.has(nextItem.speakerId)) {
     nextItem.speakerId = charMap.get(nextItem.speakerId);
    }
    proj.tracks[track].push(defaultClipData(track, nextItem));
   }
  }

  normalizeAllTracks(proj);
  proj.selected = proj.tracks.video[0] ? { track: 'video', id: proj.tracks.video[0].id } : null;
  return proj;
 }

 // Detect 1.0 `.jingxu.json` structure
 if (Array.isArray(safe.shots) || Array.isArray(safe.storyboard) || safe.version === 1) {
  return convertV1ToV2(safe);
 }

 throw new Error('无法识别的工程格式：请导入镜序 2.0 工程 JSON 或镜序 1.0 (.jingxu.json) 文件。');
}

function buildCastLines(project, lang) {
 if (!project.characters?.length) return '';
 const lines = project.characters.map((c) => {
  const parts = [];
  if (c.role) parts.push(`${lang === 'en' ? 'Role' : '定位'}:${c.role}`);
  for (const field of CHARACTER_FIELDS) {
   const key = Array.isArray(field) ? field[0] : field.key;
   const labelZh = Array.isArray(field) ? field[1] : field.label;
   const val = c[key];
   if (!val || key === 'name') continue;
   const label = lang === 'en' ? key : labelZh;
   parts.push(`${label}:${val}`);
  }
  return `- ${c.name || (lang === 'en' ? 'Character' : '角色')}${c.lockIdentity ? (lang === 'en' ? ' [ID LOCK]' : ' [身份锁定]') : ''}: ${parts.join(' | ')}`;
 });
 return (lang === 'en' ? '[Cast Continuity]\n' : '【角色定妆锁定】\n') + lines.join('\n');
}

function buildSceneLines(project, lang) {
 if (!project.scenes?.length) return '';
 const groupMap = { weather: 'weather', time: 'time', lightSource: 'lightSource', lightDirection: 'lightDirection', lightQuality: 'lightQuality' };
 const lines = project.scenes.map((s) => {
  const parts = [];
  if (s.location) parts.push(`${lang === 'en' ? 'location' : '地点与景致'}:${s.location}`);
  for (const field of SCENE_FIELDS) {
   const key = Array.isArray(field) ? field[0] : field.key;
   const labelZh = Array.isArray(field) ? field[1] : field.label;
   const raw = s[key];
   if (!raw || key === 'name') continue;
   const label = lang === 'en' ? key : labelZh;
   parts.push(`${label}:${raw}`);
  }
  for (const [k, gk] of Object.entries(groupMap)) {
   if (s[k]) parts.push(groupText(gk, s[k], lang));
  }
  return `- ${s.name || (lang === 'en' ? 'Scene' : '场景')}: ${parts.join(' | ')}`;
 });
 return (lang === 'en' ? '[Scene Anchors]\n' : '【场景空间锚点】\n') + lines.join('\n');
}

function formatVideoDescriptor(clip, adjusts, project, lang) {
 const sep = lang === 'en' ? ', ' : '；';
 const eff = clone(clip);
 for (const adj of adjusts) {
  if (adj.lookOverride) eff.style = adj.lookOverride;
  if (adj.colorOverride) eff.color = adj.colorOverride;
  if (adj.lightOverride) eff.lightSource = adj.lightOverride;
 }

 const camParts = [
  groupText('framing', eff.framing, lang),
  groupText('angle', eff.angle, lang),
  groupText('composition', eff.composition, lang),
  groupText('move', eff.move, lang),
  eff.move && eff.move !== 'stationary' && eff.move !== 'fixed' ? groupText('speed', eff.speed, lang) : '',
  groupText('stability', eff.stability, lang),
  groupText('lens', eff.lens, lang),
  groupText('focus', eff.focus, lang)
 ].filter(Boolean);

 const styleParts = [
  groupText('look', eff.style, lang),
  groupText('medium', eff.medium, lang),
  groupText('genre', eff.genre, lang),
  groupText('color', eff.color, lang),
  ...(eff.texture || []).map((t) => groupText('texture', t, lang)),
  groupText('lightSource', eff.lightSource, lang),
  groupText('lightDirection', eff.lightDirection, lang),
  groupText('lightQuality', eff.lightQuality, lang),
  groupText('weather', eff.weather, lang),
  groupText('time', eff.time, lang)
 ].filter(Boolean);

 const scene = project.scenes?.find((s) => s.id === eff.sceneId);
 const chars = (project.characters || []).filter((c) => (eff.characterIds || []).includes(c.id));

 const segments = [];
 if (scene) segments.push((lang === 'en' ? `Scene: ` : `场景：`) + scene.name + (scene.location ? ` (${scene.location})` : ''));
 if (chars.length) segments.push((lang === 'en' ? `Subjects: ` : `出镜角色：`) + chars.map((c) => c.name).join('、'));
 if (eff.prompt) segments.push(eff.prompt);
 if (eff.characterActions) segments.push((lang === 'en' ? `Action: ` : `动作细节：`) + eff.characterActions);
 if (eff.startState) segments.push((lang === 'en' ? `Start frame: ` : `起幅状态：`) + eff.startState);
 if (eff.endState) segments.push((lang === 'en' ? `End frame: ` : `落幅状态：`) + eff.endState);
 if (camParts.length) segments.push((lang === 'en' ? `Camera: ` : `景别运镜：`) + camParts.join(lang === 'en' ? ' / ' : ' · '));
 if (styleParts.length) segments.push((lang === 'en' ? `Look & Light: ` : `画风影调：`) + styleParts.join(lang === 'en' ? ' / ' : ' · '));
 if (eff.emotion || eff.micro) {
  segments.push((lang === 'en' ? `Expression: ` : `微表情：`) + [groupText('emotion', eff.emotion, lang), groupText('micro', eff.micro, lang)].filter(Boolean).join(' + '));
 }

 const adjNotes = adjusts.map((a) => [a.cameraModifier, a.slowMo].filter(Boolean).join(sep)).filter(Boolean);
 if (adjNotes.length) segments.push((lang === 'en' ? `Adjustment Layer: ` : `调节层覆写：`) + adjNotes.join(sep));

 if (eff.transitionIn && eff.transitionIn !== 'cut') {
  segments.push((lang === 'en' ? `In Transition: ` : `入画转场：`) + `${groupText('transition', eff.transitionIn, lang)} (${eff.transitionDur}s)`);
 }

 return segments.join(sep);
}

function formatAudioSummary(dialogues, audios, bgms, lang) {
 const lines = [];
 for (const d of dialogues) {
  const who = d.speakerName || (lang === 'en' ? 'Speaker' : '角色');
  const tag = d.delivery ? ` [${d.delivery}]` : '';
  const lyr = d.language ? ` (${d.language})` : '';
  lines.push(lang === 'en'
   ? `  T1 Dialogue [${fmtTimecode(d.start)}-${fmtTimecode(roundT(d.start + d.duration))}] ${who}${lyr}${tag}: ${d.text || '(silent)'}`
   : `  T1 对白 [${fmtTimecode(d.start)}-${fmtTimecode(roundT(d.start + d.duration))}] ${who}${lyr}${tag}：${d.text || '（留白）'}`);
 }
 for (const a of audios) {
  lines.push(lang === 'en'
   ? `  A1 ${a.kind === 'ambience' ? 'Ambience' : 'SFX'} [${fmtTimecode(a.start)}-${fmtTimecode(roundT(a.start + a.duration))}]: ${a.cue}${a.intensity ? ` (${a.intensity})` : ''}`
   : `  A1 ${a.kind === 'ambience' ? '环境音' : '音效'} [${fmtTimecode(a.start)}-${fmtTimecode(roundT(a.start + a.duration))}]：${a.cue}${a.intensity ? `（${a.intensity}）` : ''}`);
 }
 for (const b of bgms) {
  const duck = b.duckUnderDialogue && dialogues.length ? (lang === 'en' ? ' [Auto-Duck under Dialogue]' : ' [人声避让压低]') : '';
  const styleText = groupText('bgm', b.style, lang);
  lines.push(lang === 'en'
   ? `  A2 BGM [${fmtTimecode(b.start)}-${fmtTimecode(roundT(b.start + b.duration))}]${duck}: ${[styleText, b.mood, b.customNote].filter(Boolean).join(' · ')}`
   : `  A2 配乐 [${fmtTimecode(b.start)}-${fmtTimecode(roundT(b.start + b.duration))}]${duck}：${[styleText, b.mood, b.customNote].filter(Boolean).join(' · ')}`);
 }
 return lines;
}

function csvEscape(v) {
 const s = String(v ?? '');
 if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
 return s;
}

/**
 * Compile the multi-track NLE timeline into a structured video-generation prompt.
 */
export function compileTimelinePrompt(project, mode = null, lang = null) {
 const m = mode || project?.outputMode || 'storyboard';
 const l = lang || project?.outputLang || 'zh';
 const total = projectDuration(project);
 const videos = project?.tracks?.video || [];

 if (!videos.length && !(project?.tracks?.dialogue?.length || project?.tracks?.audio?.length || project?.tracks?.bgm?.length)) {
  return l === 'en'
   ? '[00:00 Empty Timeline] Add clips on V1 / T1 / A1 / A2 / E1 to compile a multi-track prompt.'
   : '【00:00 空白时间轴】请在下方轨道添加 V1 分镜 / T1 对白 / A1 音效 / A2 配乐 / E1 调节层片段，此处将实时编译时间轴提示词。';
 }

 const aspect = aspectRatioParts(project.format, project.customAspect).label;
 const res = project.resolution === 'custom' ? (project.customResolution || 'Custom') : project.resolution;
 const negs = [
  ...(project.negativePrompts || []).map((id) => groupText('negative', id, l)).filter(Boolean),
  ...(project.tracks?.adjust || []).map((a) => a.negativeOverride).filter(Boolean),
  project.customNegative || ''
 ].filter(Boolean).join(l === 'en' ? ', ' : '、');

 if (m === 'table') {
  const header = ['Track/Shot', 'Start', 'End', 'Duration(s)', 'Camera & Look', 'Visual / Cue', 'Adjustments & Transitions', 'Dialogue'];
  const rows = [header.map(csvEscape).join(',')];
  videos.forEach((v, idx) => {
   const end = roundT(v.start + v.duration);
   const overlaps = (arr) => (arr || []).filter((x) => x.start < end && roundT(x.start + x.duration) > v.start);
   const adj = overlaps(project.tracks.adjust);
   const dlg = overlaps(project.tracks.dialogue);
   rows.push([
    `V1-${idx + 1} ${v.title || ''}`.trim(),
    fmtTimecode(v.start),
    fmtTimecode(end),
    v.duration,
    [groupText('framing', v.framing, l), groupText('move', v.move, l), groupText('look', v.style, l)].filter(Boolean).join(' / '),
    v.prompt || '',
    [...adj.map((a) => a.label), v.transitionIn && v.transitionIn !== 'cut' ? groupText('transition', v.transitionIn, l) : ''].filter(Boolean).join(' | '),
    dlg.map((d) => `${d.speakerName}: ${d.text}`).join(' / ')
   ].map(csvEscape).join(','));
  });
  return rows.join('\n');
 }

 if (m === 'selected' && project.selected) {
  const { track, id } = project.selected;
  const clip = (project.tracks?.[track] || []).find((c) => c.id === id);
  if (clip) {
   const end = roundT(clip.start + clip.duration);
   if (track === 'video') {
    const adj = (project.tracks.adjust || []).filter((x) => x.start < end && roundT(x.start + x.duration) > clip.start);
    const dlg = (project.tracks.dialogue || []).filter((x) => x.start < end && roundT(x.start + x.duration) > clip.start);
    const aud = (project.tracks.audio || []).filter((x) => x.start < end && roundT(x.start + x.duration) > clip.start);
    const bgm = (project.tracks.bgm || []).filter((x) => x.start < end && roundT(x.start + x.duration) > clip.start);
    return [
     `[${fmtTimecode(clip.start)} - ${fmtTimecode(end)} · ${clip.duration}s] ${clip.title}`,
     formatVideoDescriptor(clip, adj, project, l),
     ...formatAudioSummary(dlg, aud, bgm, l)
    ].filter(Boolean).join('\n');
   }
   if (track === 'dialogue') {
    return `[T1 ${fmtTimecode(clip.start)}-${fmtTimecode(end)}] ${clip.speakerName} (${clip.language}${clip.delivery ? `, ${clip.delivery}` : ''}): ${clip.text}`;
   }
   if (track === 'audio') {
    return `[A1 ${clip.kind.toUpperCase()} ${fmtTimecode(clip.start)}-${fmtTimecode(end)}] ${clip.cue} (${clip.intensity})`;
   }
   if (track === 'bgm') {
    return `[A2 BGM ${fmtTimecode(clip.start)}-${fmtTimecode(end)}] ${groupText('bgm', clip.style, l)} ${clip.mood}${clip.duckUnderDialogue ? ' [Ducking]' : ''}`;
   }
   if (track === 'adjust') {
    return `[E1 ADJUST ${fmtTimecode(clip.start)}-${fmtTimecode(end)}] ${clip.label} | ${[groupText('look', clip.lookOverride, l), groupText('color', clip.colorOverride, l), groupText('lightSource', clip.lightOverride, l), clip.cameraModifier].filter(Boolean).join(' / ')}`;
   }
  }
 }

 const head = l === 'en'
  ? `[Jingxu NLE 2.0 Master Prompt] ${project.title} | ${aspect} · ${res} · ${project.fps}fps | Total ${total}s`
  : `【镜序 2.0 多轨时间轴提示词】${project.title} | 画幅 ${aspect} · ${res} · ${project.fps}fps | 总时长 ${total}s`;

 const sections = [head];
 const cast = buildCastLines(project, l);
 const sceneLines = buildSceneLines(project, l);
 if (cast) sections.push(cast);
 if (sceneLines) sections.push(sceneLines);

 if (m === 'concise') {
  const seq = videos.map((v, idx) => {
   const end = roundT(v.start + v.duration);
   const adj = (project.tracks.adjust || []).filter((x) => x.start < end && roundT(x.start + x.duration) > v.start);
   const dlg = (project.tracks.dialogue || []).filter((x) => x.start < end && roundT(x.start + x.duration) > v.start);
   const voiceBit = dlg.map((d) => `${d.speakerName}:"${d.text}"`).join(' ');
   return `(${idx + 1}: ${fmtTimecode(v.start)}-${fmtTimecode(end)}) ${formatVideoDescriptor(v, adj, project, l)}${voiceBit ? ` | ${voiceBit}` : ''}`;
  });
  sections.push(seq.join('\n'));
  if (negs) sections.push((l === 'en' ? 'Negative: ' : '负向约束：') + negs);
  return sections.join('\n\n');
 }

 if (m === 'timeline') {
  // Slice timeline along ALL clip boundaries across all 5 tracks to capture exact J-cut/L-cut slices!
  const pts = new Set([0]);
  for (const k of ['adjust', 'video', 'dialogue', 'audio', 'bgm']) {
   for (const c of project.tracks[k] || []) {
    pts.add(roundT(c.start));
    pts.add(roundT(c.start + c.duration));
   }
  }
  const sorted = [...pts].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const slices = [];
  for (let i = 0; i < sorted.length - 1; i++) {
   const a = sorted[i];
   const b = sorted[i + 1];
   const dur = roundT(b - a);
   if (dur < 0.05) continue;
   const mid = roundT((a + b) / 2);
   const st = stateAtTime(project, mid);
   const headLine = `[${fmtTimecode(a)} -> ${fmtTimecode(b)} | ${dur}s]${st.video ? ` V1:${st.video.title}` : ' (Black / Gap)'}`;
   const bodyLines = [];
   if (st.video) bodyLines.push(`  Visual: ${formatVideoDescriptor(st.video, st.adjusts, project, l)}`);
   bodyLines.push(...formatAudioSummary(st.dialogues, st.audios, st.bgms, l));
   slices.push([headLine, ...bodyLines].join('\n'));
  }
  sections.push((l === 'en' ? '[Exact Multi-Track Slices]\n' : '【精确时间切片编排（自动切分 J-Cut / L-Cut）】\n') + slices.join('\n\n'));
  if (negs) sections.push((l === 'en' ? '[Negative Constraints]\n' : '【全局负向避坑】\n') + negs);
  return sections.join('\n\n');
 }

 // Default mode: 'storyboard' — ordered by V1 clips with synced overlapping T1/A1/A2/E1 annotations
 const shotBlocks = videos.map((v, idx) => {
  const end = roundT(v.start + v.duration);
  const overlaps = (arr) => (arr || []).filter((x) => x.start < end && roundT(x.start + x.duration) > v.start);
  const adj = overlaps(project.tracks.adjust);
  const dlg = overlaps(project.tracks.dialogue);
  const aud = overlaps(project.tracks.audio);
  const bgm = overlaps(project.tracks.bgm);
  const lines = [
   `[${String(idx + 1).padStart(2, '0')} · ${fmtTimecode(v.start)} - ${fmtTimecode(end)} · ${v.duration}s] ${v.title || 'Shot'}`,
   `  ${formatVideoDescriptor(v, adj, project, l)}`,
   ...formatAudioSummary(dlg, aud, bgm, l)
  ];
  return lines.join('\n');
 });

 if (shotBlocks.length) {
  sections.push((l === 'en' ? '[V1 Storyboard & Track Sync]\n' : '【V1 分镜序列与多轨同步】\n') + shotBlocks.join('\n\n'));
 }

 if (negs) {
  sections.push((l === 'en' ? '[Negative Constraints]\n' : '【负向避坑约束】\n') + negs);
 }

 return sections.join('\n\n');
}
