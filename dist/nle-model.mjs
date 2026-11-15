import {
 GROUPS,
 CHARACTER_FIELDS,
 SCENE_FIELDS,
 CLIP_PRESETS,
 NLE_DEMO_SEED,
 TRACKS,
 TRACK_MAP,
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
 * Advance continuous playback playhead without sub-frame quantization stalling.
 */
export function advancePlayhead(current, dt, totalDuration) {
 const cur = Math.max(0, Number(current || 0));
 const step = Math.max(0, Number(dt || 0));
 const dur = Math.max(0, Number(totalDuration || 0));
 if (dur <= 0) return { time: 0, ended: true };
 const next = cur + step;
 if (next >= dur) return { time: roundT(dur), ended: true };
 return { time: next, ended: false };
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
 * Parse custom pixel resolution such as "2560x1080".
 */
export function parseCustomResolution(raw = '') {
 const match = String(raw || '').trim().match(/^(\d{2,5})\s*[xX×*,\s]\s*(\d{2,5})$/);
 if (match) {
  const w = Math.max(64, Math.min(16384, Number(match[1])));
  const h = Math.max(64, Math.min(16384, Number(match[2])));
  return { w, h, label: `${w}x${h}`, valid: true };
 }
 return { w: 1920, h: 1080, label: '', valid: false };
}

/**
 * Localized aspect ratio display string (never falls back to "Custom" in Chinese mode).
 */
export function displayAspectLabel(project, lang = 'zh') {
 if (project?.format === 'custom') {
  const raw = String(project.customAspect || '').trim();
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*[:xX/×]\s*(\d+(?:\.\d+)?)$/);
  if (match && Number(match[1]) > 0 && Number(match[2]) > 0) {
   return `${match[1]}:${match[2]}`;
  }
  return lang === 'en' ? 'Custom Ratio' : '自定义比例';
 }
 return aspectRatioParts(project?.format || '16:9', project?.customAspect).label;
}

/**
 * Localized resolution display string.
 */
export function displayResolutionLabel(project, lang = 'zh') {
 if (project?.resolution === 'custom') {
  const parsed = parseCustomResolution(project?.customResolution);
  if (parsed.valid) return parsed.label;
  return lang === 'en' ? 'Custom Pixels' : '自定义像素';
 }
 return String(project?.resolution || '4K');
}

/**
 * Parse custom negative prompt tags separated by commas, Chinese commas, or newlines.
 */
export function parseCustomNegativeTags(raw = '') {
 const seen = new Set();
 const out = [];
 for (const part of String(raw || '').split(/[,，;；、\n\r]+/)) {
  const clean = part.trim();
  if (clean && !seen.has(clean)) {
   seen.add(clean);
   out.push(clean);
  }
 }
 return out;
}

/**
 * Map base or custom track key (`video_2`, `audio_2`, etc.) back to its track kind.
 */
export function trackKind(trackKey) {
 if (TRACK_MAP[trackKey]) return trackKey;
 const base = String(trackKey || '').split('_')[0];
 if (TRACK_MAP[base]) return base;
 return 'adjust';
}

/**
 * Return ordered track descriptors combining the 5 core tracks and any extra custom tracks.
 */
export function getAllTracks(project) {
 const extras = Array.isArray(project?.extraTracks) ? project.extraTracks : [];
 const ordered = [];
 for (const base of TRACKS) {
  ordered.push({ ...base, isCustom: false });
  for (const ex of extras) {
   if (ex && ex.kind === base.key) {
    ordered.push({ ...ex, isCustom: true });
   }
  }
 }
 return ordered;
}

/**
 * Append a new custom extra track (`adjust`, `video`, `dialogue`, `audio`, `bgm`).
 */
export function addExtraTrack(project, kind = 'video') {
 const base = TRACK_MAP[kind] || TRACK_MAP.video;
 if (!project.tracks) project.tracks = {};
 if (!Array.isArray(project.extraTracks)) project.extraTracks = [];
 const sameKindCount = 1 + project.extraTracks.filter((x) => x.kind === base.key).length;
 let n = sameKindCount + 1;
 while (project.tracks[`${base.key}_${n}`]) n += 1;
 const key = `${base.key}_${n}`;
 const audioCount = 2 + project.extraTracks.filter((x) => x.kind === 'audio' || x.kind === 'bgm').length;
 const code = base.key === 'audio' || base.key === 'bgm'
  ? `A${audioCount + 1}`
  : `${base.code[0]}${n}`;
 const labelPrefix = base.key === 'video' ? '画中画 / 辅视频' : base.label.replace(/轨$/, '');
 const track = {
  key,
  kind: base.key,
  code,
  label: `${labelPrefix} ${code}`,
  short: base.short,
  desc: base.desc,
  accent: base.accent,
  defaultDuration: base.defaultDuration,
  isCustom: true
 };
 project.extraTracks.push(track);
 project.tracks[key] = [];
 project.updatedAt = Date.now();
 return { project, track };
}

/**
 * Remove a custom extra track (the 5 core tracks cannot be removed).
 */
export function removeExtraTrack(project, trackKey) {
 if (TRACK_MAP[trackKey] || !Array.isArray(project?.extraTracks)) return { project, ok: false };
 const idx = project.extraTracks.findIndex((x) => x.key === trackKey);
 if (idx < 0) return { project, ok: false };
 project.extraTracks.splice(idx, 1);
 if (project.tracks) delete project.tracks[trackKey];
 if (project.trackMeta) delete project.trackMeta[trackKey];
 if (project.selected?.track === trackKey) project.selected = null;
 project.updatedAt = Date.now();
 return { project, ok: true };
}

export function isTrackLocked(project, trackKey) {
 return Boolean(project?.trackMeta?.[trackKey]?.locked);
}

export function isTrackHidden(project, trackKey) {
 return Boolean(project?.trackMeta?.[trackKey]?.hidden);
}

export function isTrackMuted(project, trackKey) {
 return Boolean(project?.trackMeta?.[trackKey]?.muted);
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
 const kind = trackKind(track);
 const start = roundT(Math.max(0, Number(o.start ?? 0)));
 const defaultDur = kind === 'dialogue' ? 2.5 : kind === 'audio' ? 2 : kind === 'bgm' ? 8 : 4;
 const duration = roundT(Math.max(MIN_DURATION, Number(o.duration ?? defaultDur)));
 const prefix = kind === 'video' ? 'v' : kind === 'dialogue' ? 't' : kind === 'audio' ? 'a' : kind === 'bgm' ? 'b' : 'e';
 const id = typeof o.id === 'string' && o.id ? o.id : uid(prefix);

 if (kind === 'video') {
  const transIn = String(o.transitionIn ?? 'cut');
  const transInMeta = groupItem('transition', transIn);
  const defaultTransDur = transInMeta ? Number(transInMeta.dur || 0) : 0;
  const transOut = String(o.transitionOut ?? '');
  const transOutMeta = transOut ? groupItem('transition', transOut) : null;
  const defaultOutDur = transOutMeta ? Number(transOutMeta.dur || 0) : 0;
  return {
   id,
   start,
   duration,
   title: String(o.title ?? '新分镜'),
   prompt: String(o.prompt ?? ''),
   props: String(o.props ?? ''),
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
   transitionIn: transIn,
   transitionDur: roundT(Math.max(0, Math.min(2, Number(o.transitionDur ?? defaultTransDur)))),
   transitionOut: transOut,
   transitionOutDur: roundT(Math.max(0, Math.min(2, Number(o.transitionOutDur ?? defaultOutDur)))),
   speedRate: Number(o.speedRate ?? 1) || 1,
   refImage: String(o.refImage ?? o.startRefImage ?? ''),
   startRefImage: String(o.startRefImage ?? o.refImage ?? ''),
   endRefImage: String(o.endRefImage ?? ''),
   refNote: String(o.refNote ?? '')
  };
 }

 if (kind === 'dialogue') {
  return {
   id,
   start,
   duration,
   speakerId: String(o.speakerId ?? ''),
   speakerName: String(o.speakerName ?? '主角'),
   language: String(o.language ?? '普通话'),
   delivery: String(o.delivery ?? ''),
   subtitlePos: String(o.subtitlePos ?? 'bottom'),
   subtitleStyle: String(o.subtitleStyle ?? ''),
   text: String(o.text ?? '')
  };
 }

 if (kind === 'audio') {
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

 if (kind === 'bgm') {
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
  extraTracks: Array.isArray(opts.extraTracks) ? clone(opts.extraTracks) : [],
  trackMeta: opts.trackMeta && typeof opts.trackMeta === 'object' ? clone(opts.trackMeta) : {},
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
 for (const tr of getAllTracks(project)) {
  if (tr.key === 'video') continue;
  const list = project?.tracks?.[tr.key];
  if (!Array.isArray(list)) continue;
  for (const clip of list) {
   clip.start = roundT(Math.max(0, Number(clip.start || 0)));
   clip.duration = roundT(Math.max(MIN_DURATION, Number(clip.duration || tr.defaultDuration || 2)));
  }
  list.sort((a, b) => a.start - b.start);
 }
 return project;
}

/**
 * Total timeline duration across all core and custom tracks (0 when timeline is blank).
 */
export function projectDuration(project) {
 if (!project?.tracks) return 0;
 let maxEnd = 0;
 for (const tr of getAllTracks(project)) {
  for (const clip of project.tracks[tr.key] || []) {
   const end = roundT((clip.start || 0) + (clip.duration || 0));
   if (end > maxEnd) maxEnd = end;
  }
 }
 return roundT(maxEnd);
}

/**
 * Return true if the project has any clips, cast/scenes, or custom notes/tags.
 */
export function hasProjectContent(project) {
 if (!project) return false;
 if (hasExportableClips(project)) return true;
 if ((project.characters || []).length > 0 || (project.scenes || []).length > 0) return true;
 if (String(project.notes || '').trim() || String(project.customNegative || '').trim()) return true;
 return false;
}

/**
 * Return total clip count across all tracks.
 */
export function countProjectClips(project) {
 if (!project?.tracks) return 0;
 let n = 0;
 for (const tr of getAllTracks(project)) {
  n += (project.tracks[tr.key] || []).length;
 }
 return n;
}

/**
 * Return true when at least one clip exists on the timeline.
 */
export function hasExportableClips(project) {
 return countProjectClips(project) > 0;
}

/**
 * Deep clone an entire project as a brand-new draft with a fresh ID and title suffix.
 */
export function cloneProject(project, suffix = ' (副本)') {
 const copy = clone(project);
 const now = Date.now();
 copy.id = uid('proj');
 delete copy.deletedAt;
 copy.title = `${String(copy.title || '未命名草稿').replace(/\s*\(副本\d*\)$/, '')}${suffix}`;
 copy.createdAt = now;
 copy.updatedAt = now;
 return copy;
}

/**
 * Find next non-overlapping slot starting at/after `desiredStart` on a non-primary track.
 */
function findSequentialNonOverlappingStart(list, desiredStart, duration) {
 let candidate = roundT(Math.max(0, desiredStart));
 const sorted = [...(list || [])].sort((a, b) => a.start - b.start);
 for (const existing of sorted) {
  const exEnd = roundT(existing.start + existing.duration);
  if (exEnd <= candidate + 0.01) continue;
  const candEnd = roundT(candidate + duration);
  // Collides with existing clip starting right at desired point or overlapping
  if (Math.abs(existing.start - candidate) < 0.05 || (existing.start < candEnd - 0.01 && candidate < exEnd - 0.01)) {
   candidate = exEnd;
  }
 }
 return roundT(candidate);
}

/**
 * Add a clip onto any track (`video`, `dialogue`, `audio`, `bgm`, `adjust`, or extra custom tracks).
 */
export function addClip(project, track, spec = {}, options = {}) {
 if (!project?.tracks) project.tracks = {};
 if (!Array.isArray(project.tracks[track])) {
  const isCustom = (project.extraTracks || []).some((t) => t.key === track);
  if (isCustom) project.tracks[track] = [];
  else throw new Error(`Unsupported track: ${track}`);
 }
 const hasExplicitStart = options.atStart !== undefined || (spec && spec.start !== undefined && spec.start !== null);
 let desiredStart = options.atStart ?? spec?.start;
 if (desiredStart === undefined || desiredStart === null) {
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
 const initialDesired = desiredStart;
 const clip = defaultClipData(track, { ...clone(spec), start: desiredStart });

 if (track !== 'video' && !hasExplicitStart && !options.allowStack && project.tracks[track].length) {
  const nextPos = findSequentialNonOverlappingStart(project.tracks[track], desiredStart, clip.duration);
  clip.start = nextPos;
 }

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
 return { project, clip, shifted: track !== 'video' && Math.abs(clip.start - initialDesired) > 0.05 };
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
 const kind = trackKind(track);
 const rightCopy = clone(orig);
 rightCopy.id = uid(kind === 'video' ? 'v' : kind === 'dialogue' ? 't' : kind === 'audio' ? 'a' : kind === 'bgm' ? 'b' : 'e');
 rightCopy.start = cut;
 rightCopy.duration = rightDur;

 if (kind === 'video') {
  const baseTitle = (orig.title || '分镜').replace(/\s*\(续\d*\)$/, '');
  rightCopy.title = `${baseTitle} (续)`;
  rightCopy.transitionIn = 'cut';
  rightCopy.transitionDur = 0;
  orig.transitionOut = '';
  orig.transitionOutDur = 0;
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
  if (isTrackLocked(project, project.selected.track)) {
   return { project, ok: false, reason: '所在轨道已锁定，请先解锁再分割' };
  }
  const target = (project.tracks[project.selected.track] || []).find((c) => c.id === project.selected.id);
  if (target && t > target.start && t < roundT(target.start + target.duration)) {
   return splitClipAt(project, project.selected.track, target.id, t);
  }
 }
 for (const tr of getAllTracks(project)) {
  if (isTrackLocked(project, tr.key)) continue;
  const hit = (project.tracks[tr.key] || []).find((c) => t > c.start && t < roundT(c.start + c.duration));
  if (hit) {
   return splitClipAt(project, tr.key, hit.id, t);
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

 const kind = trackKind(track);
 const copy = clone(orig);
 copy.id = uid(kind === 'video' ? 'v' : kind === 'dialogue' ? 't' : kind === 'audio' ? 'a' : kind === 'bgm' ? 'b' : 'e');
 copy.start = roundT(orig.start + orig.duration);
 if (kind === 'video') {
  copy.title = `${orig.title || '分镜'} (副本)`;
  copy.transitionIn = 'cut';
  if (track === 'video') {
   for (const item of list) {
    if (item.start >= copy.start) {
     item.start = roundT(item.start + copy.duration);
    }
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
 * Batch delete multiple `{ track, id }` items cleanly (skipping locked tracks).
 */
export function deleteClips(project, items = []) {
 let deletedCount = 0;
 for (const item of items) {
  if (!item?.track || !item?.id || isTrackLocked(project, item.track)) continue;
  const list = project?.tracks?.[item.track];
  if (!Array.isArray(list)) continue;
  const idx = list.findIndex((c) => c.id === item.id);
  if (idx >= 0) {
   list.splice(idx, 1);
   deletedCount += 1;
  }
 }
 if (deletedCount > 0) {
  normalizeAllTracks(project);
  if (project.selected && !((project.tracks?.[project.selected.track] || []).some((c) => c.id === project.selected.id))) {
   const firstV = project.tracks?.video?.[0];
   project.selected = firstV ? { track: 'video', id: firstV.id } : null;
  }
  project.updatedAt = Date.now();
 }
 return { project, deletedCount };
}

/**
 * Batch update duration across selected `{ track, id }` items (respecting MIN_DURATION and ripple).
 */
export function batchUpdateClipDuration(project, items = [], newDuration) {
 const dur = roundT(Math.max(MIN_DURATION, Number(newDuration) || 2));
 let updatedCount = 0;
 for (const item of items) {
  if (!item?.track || !item?.id || isTrackLocked(project, item.track)) continue;
  const clip = (project?.tracks?.[item.track] || []).find((c) => c.id === item.id);
  if (clip) {
   clip.duration = dur;
   updatedCount += 1;
  }
 }
 if (updatedCount > 0) {
  normalizeAllTracks(project);
  project.updatedAt = Date.now();
 }
 return { project, updatedCount, duration: dur };
}

function gatherClipsByKind(project, kind, { skipHidden = false, skipMuted = false, includePrimaryVideo = true } = {}) {
 const list = [];
 for (const tr of getAllTracks(project)) {
  if (tr.kind !== kind && trackKind(tr.key) !== kind) continue;
  if (!includePrimaryVideo && tr.key === 'video') continue;
  if (skipHidden && isTrackHidden(project, tr.key)) continue;
  if (skipMuted && isTrackMuted(project, tr.key)) continue;
  for (const clip of project?.tracks?.[tr.key] || []) {
   list.push({ ...clip, _trackCode: tr.code, _trackKey: tr.key });
  }
 }
 return list.sort((a, b) => a.start - b.start);
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

 const vHidden = isTrackHidden(project, 'video');
 const videos = project?.tracks?.video || [];
 const videoIdx = vHidden ? -1 : videos.findIndex(isActive);
 const video = videoIdx >= 0 ? videos[videoIdx] : null;
 const prevVideo = videoIdx > 0 ? videos[videoIdx - 1] : null;
 const pipVideos = gatherClipsByKind(project, 'video', { skipHidden: true, includePrimaryVideo: false }).filter(isActive);

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

 const dialogues = gatherClipsByKind(project, 'dialogue', { skipHidden: true, skipMuted: true }).filter(isActive);
 const audios = gatherClipsByKind(project, 'audio', { skipMuted: true }).filter(isActive);
 const bgms = gatherClipsByKind(project, 'bgm', { skipMuted: true }).filter(isActive).map((b) => ({
  ...b,
  isDucking: Boolean(b.duckUnderDialogue && dialogues.length > 0)
 }));
 const adjusts = gatherClipsByKind(project, 'adjust', { skipHidden: true }).filter(isActive);

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
  pipVideos,
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
    message: `V1「${v.title}」时长 ${v.duration}s 较长，可用「分割」拆成多个景别节奏更稳。`
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

 const allVids = gatherClipsByKind(project, 'video', { includePrimaryVideo: true });
 const boundScenes = new Set(allVids.map((v) => v.sceneId).filter(Boolean));
 for (const sc of project?.scenes || []) {
  if (!boundScenes.has(sc.id)) {
   issues.push({
    severity: 'info',
    track: 'video',
    clipId: videos[0]?.id || null,
    message: `场景「${sc.name || '未命名场景'}」尚未绑定到任何 V1 分镜，建议在分镜参数中绑定场景锚点。`
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

export function createBlankTemplateJson(kind = 'v2') {
 if (kind === 'v1') {
  return JSON.stringify({
   version: 1,
   title: '镜序 1.0 空白分镜导入模板',
   format: '16:9',
   resolution: '4K',
   fps: 24,
   bgm: 'warm_piano',
   characters: [
    { id: 'c1', name: '主角', role: '主角', lockIdentity: true, appearance: '青年，深色风衣' }
   ],
   scenes: [
    { id: 's1', name: '主场景', description: '城市街头黄昏光影' }
   ],
   shots: [
    {
     id: 'sh1',
     title: '分镜 01（示例可修改）',
     duration: 4,
     framing: 'wide',
     move: 'push',
     style: 'cinema_realism',
     characterIds: ['c1'],
     sceneId: 's1',
     prompt: '在此填写画面主体动作描述',
     dialogue: '',
     sfx: ''
    }
   ]
  }, null, 2);
 }
 return JSON.stringify(createBlankProject({ title: '镜序 2.0 空白工程模板' }), null, 2);
}

/**
 * Parse either a Jingxu 2.0 multi-track JSON or a Jingxu 1.0 `.jingxu.json` export.
 */
export function parseAnyProjectImport(textOrObj, { rekey = true } = {}) {
 let parsed = textOrObj;
 if (typeof textOrObj === 'string') {
  const clean = textOrObj.replace(/^\uFEFF/, '').trim();
  if (!clean) throw new Error('导入内容为空：请先粘贴 JSON 文本或选择本地 .jingxu.json / .jingxu2.json 文件。');
  try {
   parsed = JSON.parse(clean);
  } catch {
   throw new Error('JSON 格式解析失败：请确认粘贴的是完整的 .json 工程文件（检查大括号与引号是否完整，切勿传入纯文本）。');
  }
 }
 if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
  throw new Error('工程结构无效：文件根节点必须是 JSON 对象（{ ... }）。');
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
   extraTracks: Array.isArray(safe.extraTracks) ? safe.extraTracks : [],
   trackMeta: safe.trackMeta && typeof safe.trackMeta === 'object' ? safe.trackMeta : {},
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

  const extraKeys = (proj.extraTracks || []).map((t) => t.key);
  for (const track of ['video', 'dialogue', 'audio', 'bgm', 'adjust', ...extraKeys]) {
   if (!Array.isArray(proj.tracks[track])) proj.tracks[track] = [];
   for (const item of Array.isArray(safe.tracks[track]) ? safe.tracks[track] : []) {
    const nextItem = clone(item);
    if (rekey) delete nextItem.id;
    const kind = trackKind(track);
    if (kind === 'video') {
     if (nextItem.sceneId && sceneMap.has(nextItem.sceneId)) nextItem.sceneId = sceneMap.get(nextItem.sceneId);
     if (Array.isArray(nextItem.characterIds)) {
      nextItem.characterIds = nextItem.characterIds.map((id) => charMap.get(id) || id);
     }
    }
    if (kind === 'dialogue' && nextItem.speakerId && charMap.has(nextItem.speakerId)) {
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

 throw new Error('未能识别的工程格式：请确认导入的是镜序 2.0 (.jingxu2.json) 多轨工程或 1.0 (.jingxu.json) 分镜工程。');
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
  if (c.refImage) {
   parts.push(`${lang === 'en' ? 'RefSheet' : '三视图/参考图'}:${c.refImage.startsWith('data:') ? '[已挂载本地定妆图]' : c.refImage}`);
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

function formatVideoDescriptor(clip, adjusts, project, lang, shotIndex = -1) {
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
  eff.moveDistance ? (lang === 'en' ? `Move distance: ${eff.moveDistance}` : `运镜幅度：${eff.moveDistance}`) : '',
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
 if (eff.props) segments.push((lang === 'en' ? `Props: ` : `关键道具：`) + eff.props);
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

 if (eff.transitionIn && (eff.transitionIn !== 'cut' || shotIndex > 0)) {
  const durTag = eff.transitionDur > 0 ? ` (${eff.transitionDur}s)` : (eff.transitionIn === 'cut' || eff.transitionIn === 'direct_cut' ? ' (0s)' : '');
  segments.push((lang === 'en' ? `In Transition: ` : `入画转场：`) + `${groupText('transition', eff.transitionIn, lang)}${durTag}`);
 }
 if (eff.transitionOut && eff.transitionOut !== 'none') {
  const outDurTag = eff.transitionOutDur > 0 ? ` (${eff.transitionOutDur}s)` : '';
  segments.push((lang === 'en' ? `Out Transition: ` : `出画转场：`) + `${groupText('transition', eff.transitionOut, lang)}${outDurTag}`);
 }
 const startRef = eff.startRefImage || eff.refImage || '';
 if (startRef) {
  segments.push((lang === 'en' ? 'Start Frame Ref: ' : '首帧参考：') + (startRef.startsWith('data:') ? '[已挂载本地首帧参考图]' : startRef));
 }
 if (eff.endRefImage) {
  segments.push((lang === 'en' ? 'End Frame Ref: ' : '尾帧参考：') + (eff.endRefImage.startsWith('data:') ? '[已挂载本地尾帧参考图]' : eff.endRefImage));
 }

 return segments.join(sep);
}

function dedupeByKey(list, keyFn) {
 const seen = new Set();
 const out = [];
 for (const item of list || []) {
  const k = keyFn(item);
  if (seen.has(k)) continue;
  seen.add(k);
  out.push(item);
 }
 return out;
}

const SUBTITLE_POS_ZH = { bottom: '底部字幕', top: '顶部字幕', center: '画面居中', off: '仅配音无字幕' };

function formatAudioSummary(dialogues, audios, bgms, lang, seenCrossShot = null) {
 const lines = [];
 const uniqDlg = dedupeByKey(dialogues, (d) => `${roundT(d.start)}|${roundT(d.duration)}|${String(d.speakerName || '').trim()}|${String(d.text || '').trim()}`);
 for (const d of uniqDlg) {
  const code = d._trackCode || 'T1';
  if (seenCrossShot && seenCrossShot.has(d.id)) {
   continue;
  }
  if (seenCrossShot) seenCrossShot.add(d.id);
  const who = d.speakerName || (lang === 'en' ? 'Speaker' : '角色');
  const tag = d.delivery ? ` [${d.delivery}]` : '';
  const lyr = d.language ? ` (${d.language})` : '';
  const subMeta = [d.subtitlePos && d.subtitlePos !== 'bottom' ? (SUBTITLE_POS_ZH[d.subtitlePos] || d.subtitlePos) : '', d.subtitleStyle].filter(Boolean).join(' · ');
  const subTag = subMeta ? ` {${subMeta}}` : '';
  lines.push(lang === 'en'
   ? `  ${code} Dialogue [${fmtTimecode(d.start)}-${fmtTimecode(roundT(d.start + d.duration))}] ${who}${lyr}${tag}${subTag}: ${d.text || '(silent)'}`
   : `  ${code} 对白 [${fmtTimecode(d.start)}-${fmtTimecode(roundT(d.start + d.duration))}] ${who}${lyr}${tag}${subTag}：${d.text || '（留白）'}`);
 }
 const uniqAud = dedupeByKey(audios, (a) => `${roundT(a.start)}|${roundT(a.duration)}|${a.kind}|${String(a.cue || '').trim()}`);
 for (const a of uniqAud) {
  const code = a._trackCode || 'A1';
  if (seenCrossShot && seenCrossShot.has(a.id)) continue;
  if (seenCrossShot) seenCrossShot.add(a.id);
  const fades = [a.fadeIn > 0 ? `淡入${a.fadeIn}s` : '', a.fadeOut > 0 ? `淡出${a.fadeOut}s` : '', a.spatial || ''].filter(Boolean).join('/');
  const metaStr = [a.intensity, fades].filter(Boolean).join(' · ');
  lines.push(lang === 'en'
   ? `  ${code} ${a.kind === 'ambience' ? 'Ambience' : 'SFX'} [${fmtTimecode(a.start)}-${fmtTimecode(roundT(a.start + a.duration))}]: ${a.cue}${metaStr ? ` (${metaStr})` : ''}`
   : `  ${code} ${a.kind === 'ambience' ? '环境音' : '音效'} [${fmtTimecode(a.start)}-${fmtTimecode(roundT(a.start + a.duration))}]：${a.cue}${metaStr ? `（${metaStr}）` : ''}`);
 }
 const uniqBgm = dedupeByKey(bgms, (b) => `${roundT(b.start)}|${roundT(b.duration)}|${b.style}|${String(b.mood || '').trim()}`);
 for (const b of uniqBgm) {
  const code = b._trackCode || 'A2';
  if (seenCrossShot && seenCrossShot.has(b.id)) continue;
  if (seenCrossShot) seenCrossShot.add(b.id);
  const duck = b.duckUnderDialogue && uniqDlg.length ? (lang === 'en' ? ' [Auto-Duck under Dialogue]' : ' [人声避让压低]') : '';
  const styleText = groupText('bgm', b.style, lang);
  const fades = [b.fadeIn > 0 ? `淡入${b.fadeIn}s` : '', b.fadeOut > 0 ? `淡出${b.fadeOut}s` : ''].filter(Boolean).join('/');
  lines.push(lang === 'en'
   ? `  ${code} BGM [${fmtTimecode(b.start)}-${fmtTimecode(roundT(b.start + b.duration))}]${duck}: ${[styleText, b.mood, b.customNote, fades].filter(Boolean).join(' · ')}`
   : `  ${code} 配乐 [${fmtTimecode(b.start)}-${fmtTimecode(roundT(b.start + b.duration))}]${duck}：${[styleText, b.mood, b.customNote, fades].filter(Boolean).join(' · ')}`);
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
 const videos = isTrackHidden(project, 'video') ? [] : (project?.tracks?.video || []);

 if (!hasExportableClips(project)) {
  return l === 'en'
   ? '[00:00 Empty Timeline] Add clips on V1 / T1 / A1 / A2 / E1 to compile a multi-track prompt.'
   : '【00:00 空白时间轴】请在下方轨道至少添加一个 V1 分镜 / T1 对白 / A1 音效 / A2 配乐 / E1 调节层片段，此处将实时编译时间轴提示词。';
 }

 const aspect = displayAspectLabel(project, l);
 const res = displayResolutionLabel(project, l);
 const negAdjust = gatherClipsByKind(project, 'adjust', { skipHidden: true }).map((a) => a.negativeOverride).filter(Boolean);
 const negCustom = parseCustomNegativeTags(project.customNegative);
 const negs = [
  ...(project.negativePrompts || []).map((id) => groupText('negative', id, l)).filter(Boolean),
  ...negAdjust,
  ...negCustom
 ].filter(Boolean).join(l === 'en' ? ', ' : '、');

 const allAdjust = gatherClipsByKind(project, 'adjust', { skipHidden: true });
 const allDlg = gatherClipsByKind(project, 'dialogue', { skipHidden: true, skipMuted: true });
 const allAud = gatherClipsByKind(project, 'audio', { skipMuted: true });
 const allBgm = gatherClipsByKind(project, 'bgm', { skipMuted: true });
 const pipVideos = gatherClipsByKind(project, 'video', { skipHidden: true, includePrimaryVideo: false });

 if (m === 'table') {
  const header = ['Track/Shot', 'Start', 'End', 'Duration(s)', 'Camera & Look', 'Visual / Cue', 'Adjustments & Transitions', 'Dialogue'];
  const rows = [header.map(csvEscape).join(',')];
  videos.forEach((v, idx) => {
   const end = roundT(v.start + v.duration);
   const overlaps = (arr) => (arr || []).filter((x) => x.start < end && roundT(x.start + x.duration) > v.start);
   const adj = overlaps(allAdjust);
   const dlg = dedupeByKey(overlaps(allDlg), (d) => `${roundT(d.start)}|${d.speakerName}|${d.text}`);
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
  const kind = trackKind(track);
  if (clip) {
   const end = roundT(clip.start + clip.duration);
   if (kind === 'video') {
    const adj = allAdjust.filter((x) => x.start < end && roundT(x.start + x.duration) > clip.start);
    const dlg = allDlg.filter((x) => x.start < end && roundT(x.start + x.duration) > clip.start);
    const aud = allAud.filter((x) => x.start < end && roundT(x.start + x.duration) > clip.start);
    const bgm = allBgm.filter((x) => x.start < end && roundT(x.start + x.duration) > clip.start);
    return [
     `[${fmtTimecode(clip.start)} - ${fmtTimecode(end)} · ${clip.duration}s] ${clip.title}`,
     formatVideoDescriptor(clip, adj, project, l),
     ...formatAudioSummary(dlg, aud, bgm, l)
    ].filter(Boolean).join('\n');
   }
   if (kind === 'dialogue') {
    return `[T1 ${fmtTimecode(clip.start)}-${fmtTimecode(end)}] ${clip.speakerName} (${clip.language}${clip.delivery ? `, ${clip.delivery}` : ''}): ${clip.text}`;
   }
   if (kind === 'audio') {
    return `[A1 ${clip.kind.toUpperCase()} ${fmtTimecode(clip.start)}-${fmtTimecode(end)}] ${clip.cue} (${clip.intensity})`;
   }
   if (kind === 'bgm') {
    return `[A2 BGM ${fmtTimecode(clip.start)}-${fmtTimecode(end)}] ${groupText('bgm', clip.style, l)} ${clip.mood}${clip.duckUnderDialogue ? ' [Ducking]' : ''}`;
   }
   if (kind === 'adjust') {
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
  const seenDlg = new Set();
  const seq = videos.map((v, idx) => {
   const end = roundT(v.start + v.duration);
   const adj = allAdjust.filter((x) => x.start < end && roundT(x.start + x.duration) > v.start);
   const dlg = dedupeByKey(allDlg.filter((x) => x.start < end && roundT(x.start + x.duration) > v.start), (d) => `${roundT(d.start)}|${d.speakerName}|${d.text}`)
    .filter((d) => { if (seenDlg.has(d.id)) return false; seenDlg.add(d.id); return true; });
   const voiceBit = dlg.map((d) => `${d.speakerName}:"${d.text}"`).join(' ');
   return `(${idx + 1}: ${fmtTimecode(v.start)}-${fmtTimecode(end)}) ${formatVideoDescriptor(v, adj, project, l, idx)}${voiceBit ? ` | ${voiceBit}` : ''}`;
  });
  sections.push(seq.join('\n'));
  if (negs) sections.push((l === 'en' ? 'Negative: ' : '负向约束：') + negs);
  return sections.join('\n\n');
 }

 if (m === 'timeline') {
  const pts = new Set([0]);
  for (const tr of getAllTracks(project)) {
   for (const c of project.tracks[tr.key] || []) {
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
   for (const pv of st.pipVideos || []) {
    bodyLines.push(`  ${pv._trackCode} Overlay: ${formatVideoDescriptor(pv, st.adjusts, project, l)}`);
   }
   bodyLines.push(...formatAudioSummary(st.dialogues, st.audios, st.bgms, l));
   slices.push([headLine, ...bodyLines].join('\n'));
  }
  sections.push((l === 'en' ? '[Exact Multi-Track Slices]\n' : '【精确时间切片编排（自动切分 J-Cut / L-Cut）】\n') + slices.join('\n\n'));
  if (negs) sections.push((l === 'en' ? '[Negative Constraints]\n' : '【全局负向避坑】\n') + negs);
  return sections.join('\n\n');
 }

 // Default mode: 'storyboard' — ordered by V1 clips with deduplicated multi-track annotations
 const seenCrossShot = new Set();
 const shotBlocks = videos.map((v, idx) => {
  const end = roundT(v.start + v.duration);
  const overlaps = (arr) => (arr || []).filter((x) => x.start < end && roundT(x.start + x.duration) > v.start);
  const adj = overlaps(allAdjust);
  const dlg = overlaps(allDlg);
  const aud = overlaps(allAud);
  const bgm = overlaps(allBgm);
  const pips = overlaps(pipVideos).map((pv) => `  ${pv._trackCode || 'V2'} 画中画：${formatVideoDescriptor(pv, adj, project, l)}`);
  const lines = [
   `[${String(idx + 1).padStart(2, '0')} · ${fmtTimecode(v.start)} - ${fmtTimecode(end)} · ${v.duration}s] ${v.title || 'Shot'}`,
   `  ${formatVideoDescriptor(v, adj, project, l, idx)}`,
   ...pips,
   ...formatAudioSummary(dlg, aud, bgm, l, seenCrossShot)
  ];
  return lines.join('\n');
 });

 if (shotBlocks.length) {
  sections.push((l === 'en' ? '[V1 Storyboard & Track Sync]\n' : '【V1 分镜序列与多轨同步】\n') + shotBlocks.join('\n\n'));
  const tailDlg = allDlg.filter((d) => !seenCrossShot.has(d.id));
  const tailAud = allAud.filter((a) => !seenCrossShot.has(a.id));
  const tailBgm = allBgm.filter((b) => !seenCrossShot.has(b.id));
  const tailLines = formatAudioSummary(tailDlg, tailAud, tailBgm, l, seenCrossShot);
  if (tailLines.length) {
   sections.push((l === 'en' ? '[Extended / Gap Audio & Dialogue]\n' : '【独立 / 延伸音轨片段】\n') + tailLines.join('\n'));
  }
 } else {
  // Audio/dialogue/adjust/pip-only timeline without V1 shots
  const orphanLines = [];
  for (const pv of pipVideos) {
   orphanLines.push(`[${pv._trackCode || 'V2'} ${fmtTimecode(pv.start)}-${fmtTimecode(roundT(pv.start + pv.duration))}] ${formatVideoDescriptor(pv, allAdjust, project, l)}`);
  }
  orphanLines.push(...formatAudioSummary(allDlg, allAud, allBgm, l, seenCrossShot));
  if (orphanLines.length) {
   sections.push((l === 'en' ? '[Multi-Track Sequence]\n' : '【多轨独立片段（尚无 V1 主视频）】\n') + orphanLines.join('\n'));
  }
 }

 if (negs) {
  sections.push((l === 'en' ? '[Negative Constraints]\n' : '【负向避坑约束】\n') + negs);
 }

 return sections.join('\n\n');
}
