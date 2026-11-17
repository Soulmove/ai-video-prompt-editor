import {
 TRACKS,
 NLE_FORMATS,
 NLE_RESOLUTIONS,
 NLE_FPS,
 NLE_OUTPUT_MODES,
 CLIP_PRESETS,
 LANGUAGE_OPTIONS,
 TRANSITION_CATEGORIES,
 FACE_PRESETS,
 CHARACTER_FIELDS,
 SCENE_FIELDS,
 SOURCES,
 NLE_SQUARE_TEMPLATES
} from './nle-catalog.mjs';

import {
 uid,
 clone,
 roundT,
 fmtTimecode,
 fmtFramesTimecode,
 aspectRatioParts,
 parseCustomResolution,
 displayAspectLabel,
 displayResolutionLabel,
 parseCustomNegativeTags,
 getAllTracks,
 trackKind,
 addExtraTrack,
 removeExtraTrack,
 isTrackLocked,
 isTrackHidden,
 isTrackMuted,
 advancePlayhead,
 groupOptions,
 groupItem,
 groupLabel,
 createBlankProject,
 createDemoProject,
 cloneProject,
 hasProjectContent,
 hasExportableClips,
 countProjectClips,
 createBlankTemplateJson,
 parseAnyProjectImport,
 projectDuration,
 addClip,
 addPresetClip,
 splitAtPlayhead,
 moveClip,
 trimClip,
 deleteClip,
 deleteClips,
 batchUpdateClipDuration,
 duplicateClip,
 normalizeAllTracks,
 stateAtTime,
 validateTimeline,
 compileTimelinePrompt
} from './nle-model.mjs';

import {
 saveProject,
 loadProject,
 listProjects,
 listTrashedProjects,
 softDeleteProject,
 restoreProject,
 deleteProject,
 emptyTrash,
 clearProjects,
 readPrefs,
 savePrefs,
 lastProject,
 clearLastProject
} from './nle-storage.mjs';

import { renderOptionSwatch } from './nle-swatches.mjs';
import { uiIcon } from './nle-icons.mjs';
import {
 AI_STORY_TEMPLATES,
 AI_VISUAL_PRESETS,
 AI_TEXTURE_PRESETS,
 AI_CAMERA_PREFS,
 AI_TRANSITION_PREFS,
 AI_DIALOGUE_MODES,
 AI_CAST_NATIONALITIES,
 AI_CAST_FACE_TIERS,
 AI_CAST_SKIN_RENDERS,
 AI_BGM_MODES,
 DEFAULT_AI_SCOPES,
 normalizeAIBrief,
 briefPreselectionSummary
} from './nle-ai-brief.mjs';
import {
 DEFAULT_AI_MODEL,
 DEFAULT_THINKING_LEVEL,
 THINKING_LEVELS,
 testGoogleConnection,
 generateNleAIPlan,
 applyNleAIPlan
} from './nle-ai.mjs';
import {
 MUSE_CHANNELS,
 MUSE_VIDEO_MODELS,
 MUSE_RATIOS,
 MUSE_RESOLUTIONS,
 MUSE_MODES,
 normalizeMuseConfig,
 computeVideoSize,
 clampMuseSeconds,
 probeMuseService,
 submitMuseVideoTask,
 pollMuseVideoTask,
 cancelMuseVideoTask,
 recoverMuseVideoTask,
 isPlayableVideoUrl,
 fetchMuseAccounts,
 startMuseLoginWindow,
 pollMuseLoginWindow,
 importMuseAccountCookies,
 runMuseAccountAction,
 checkMuseProtocolNetwork,
 fetchMuseRecords,
 formatMuseExpiry
} from './nle-muse.mjs';

const MAX_HISTORY = 60;

const RESOURCE_TABS = [
 { id: 'media', icon: 'media', label: '素材' },
 { id: 'ai', icon: 'ai-spark', label: 'AI辅助' },
 { id: 'style', icon: 'style-effects', label: '风格特效' },
 { id: 'camera', icon: 'camera-move', label: '运镜' },
 { id: 'transitions', icon: 'transition', label: '转场' },
 { id: 'audio', icon: 'audio', label: '音频' },
 { id: 'dialogue', icon: 'dialogue-text', label: '文本对白' },
 { id: 'adjust', icon: 'adjustment', label: '调节层' },
 { id: 'entities', icon: 'characters-scene', label: '角色场景' }
];

const TRACK_ICON_MAP = {
 adjust: 'adjust-track',
 video: 'storyboard-track',
 dialogue: 'subtitle-track',
 audio: 'sfx-track',
 bgm: 'music-track'
};

const appState = {
 screen: 'home',         // 'home' | 'editor'
 homeTab: 'home',        // 'home' | 'ai' | 'square' | 'cloud'
 drafts: [],             // Cached active IndexedDB drafts
 trashedDrafts: [],      // Soft-deleted recoverable drafts
 showTrash: false,
 draftFilter: '',

 project: createBlankProject(),
 history: [],
 future: [],
 pendingEditSnapshot: null,
 multiSelected: [],      // Array<{ track, id }>

 resTab: 'style',
 resSubCat: 'look',
 resSearch: '',
 inspSubTab: 'content',  // 'content' | 'link'
 trackMenuOpen: false,

 aiConn: {
  apiKey: '',
  showKey: false,
  model: DEFAULT_AI_MODEL,
  thinkingLevel: DEFAULT_THINKING_LEVEL,
  transport: 'browser',
  verified: false,
  testing: false,
  statusMsg: '',
  statusError: false,
  serverHasKey: false,
  staticHost: false
 },
 aiBrief: normalizeAIBrief({}),
 aiScopes: { ...DEFAULT_AI_SCOPES },
 aiApplyMode: 'fill',    // 'fill' | 'new'
 aiAutoApply: true,
 aiFlow: {
  busy: false,
  error: '',
  startedAt: 0,
  thoughtChars: 0,
  answerChars: 0,
  controller: null,
  timer: 0,
  result: null
 },
 muse: {
  config: normalizeMuseConfig({ channel: 'protocol' }),
  apiKey: '',
  showKey: false,
  probing: false,
  reachable: false,
  staticHost: typeof location !== 'undefined' && !['127.0.0.1', 'localhost'].includes(location.hostname),
  models: [],
  accountCount: null,
  accountsKnown: false,
  accountSummary: [],
  hasLocalInstall: false,
  poolAdminUrl: 'http://127.0.0.1:18610/admin',
  statusMsg: '',
  statusError: false,

  accounts: [],
  accountStats: null,
  accountsLoading: false,
  accountsError: '',
  netCheck: null,
  netCheckLoading: false,
  loginLabelInput: '',
  loginWindowBusy: false,
  loginStatusMsg: '',
  loginStatusTone: 'info',
  cookieLabelInput: '',
  cookieInput: '',
  cookieBoxOpen: false,
  cookieImporting: false,
  cookieStatusMsg: '',
  cookieStatusError: false,
  accBusyId: '',

  sourceDraftId: 'current',
  sourceShotIdx: -1,
  prompt: '',
  mode: 'text',
  seconds: 5,
  ratio: '16:9',
  resolution: '720p',
  generateAudio: true,
  watermark: false,
  firstFrame: '',
  lastFrame: '',
  refImages: [],

  submitting: false,
  jobs: [],
  activeJobId: '',
  manualUrlInput: '',
  manualTitleInput: ''
 },

 playing: false,
 rafId: 0,
 lastRafTs: 0,
 lastStageKey: '',
 lastStageDrawTs: 0,
 modal: null,            // null | { type: 'compile'|'import'|'char'|'scene'|'confirm'|'rename'|'help'|'ai-guide', ... }
 toastMsg: '',
 toastTimer: 0,
 dragState: null
};

const rootEl = document.getElementById('app');
let saveTimer = 0;

function esc(v) {
 return String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
}

function showToast(msg) {
 appState.toastMsg = msg;
 clearTimeout(appState.toastTimer);
 const existing = document.getElementById('nleToast');
 if (existing) existing.textContent = msg;
 else {
  const el = document.createElement('div');
  el.id = 'nleToast';
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
 }
 appState.toastTimer = setTimeout(() => {
  appState.toastMsg = '';
  document.getElementById('nleToast')?.remove();
 }, 2800);
}

async function refreshDraftsCache() {
 try {
  appState.drafts = await listProjects();
  appState.trashedDrafts = await listTrashedProjects();
 } catch {
  appState.drafts = [];
  appState.trashedDrafts = [];
 }
}

function pushUndo(snapshot = null, label = '编辑操作') {
 const snapObj = snapshot?.project ? snapshot.project : (snapshot || clone(appState.project));
 appState.history.push({
  label: snapshot?.label || label,
  ts: Date.now(),
  project: snapObj
 });
 if (appState.history.length > MAX_HISTORY) appState.history.shift();
 appState.future = [];
}

function sanitizeSavedMuseJobs(jobs) {
 if (!Array.isArray(jobs)) return [];
 return jobs.slice(0, 20).map((j) => ({
  id: String(j?.id || ''),
  cancelKey: String(j?.cancelKey || ''),
  model: String(j?.model || 'muse-video'),
  endpoint: String(j?.endpoint || ''),
  useProxy: Boolean(j?.useProxy),
  prompt: String(j?.prompt || '').slice(0, 500),
  size: String(j?.size || '1280x720'),
  seconds: Number(j?.seconds || 5),
  status: String(j?.status || 'pending'),
  notice: String(j?.notice || ''),
  error: String(j?.error || ''),
  videoUrl: isPlayableVideoUrl(j?.videoUrl) ? j.videoUrl : '',
  createdAt: Number(j?.createdAt || Date.now())
 })).filter((j) => j.id);
}

function persistAppPrefs() {
 savePrefs({
  zoom: appState.project.zoom,
  outputMode: appState.project.outputMode,
  outputLang: appState.project.outputLang,
  aiModel: appState.aiConn.model,
  aiThinkingLevel: appState.aiConn.thinkingLevel,
  aiTransport: appState.aiConn.transport,
  aiBrief: appState.aiBrief,
  museConfig: normalizeMuseConfig(appState.muse.config),
  museJobs: sanitizeSavedMuseJobs(appState.muse.jobs)
 });
}

function scheduleSave() {
 clearTimeout(saveTimer);
 saveTimer = setTimeout(async () => {
  try {
   appState.project.updatedAt = Date.now();
   await saveProject(appState.project);
   lastProject(appState.project.id);
   persistAppPrefs();
   await refreshDraftsCache();
  } catch (err) {
   console.warn('Auto-save skipped:', err);
  }
 }, 160);
}

function undo() {
 if (!appState.history.length) return;
 stopPlayback();
 const entry = appState.history.pop();
 const prevProj = entry?.project || entry;
 appState.future.push({ label: entry?.label || '重做步骤', ts: Date.now(), project: clone(appState.project) });
 appState.project = prevProj;
 appState.multiSelected = [];
 scheduleSave();
 render();
 showToast(`已撤销${entry?.label ? `：${entry.label}` : ''}`);
}

function redo() {
 if (!appState.future.length) return;
 stopPlayback();
 const entry = appState.future.pop();
 const nextProj = entry?.project || entry;
 appState.history.push({ label: entry?.label || '历史操作', ts: Date.now(), project: clone(appState.project) });
 appState.project = nextProj;
 appState.multiSelected = [];
 scheduleSave();
 render();
 showToast(`已重做${entry?.label ? `：${entry.label}` : ''}`);
}

function stopPlayback() {
 const wasPlaying = appState.playing;
 appState.playing = false;
 if (appState.rafId) {
  cancelAnimationFrame(appState.rafId);
  appState.rafId = 0;
 }
 if (wasPlaying) {
  appState.project.playhead = roundT(appState.project.playhead || 0);
  updatePlayheadVisuals(true);
 }
 const btn = document.getElementById('playPauseBtn');
 if (btn) btn.innerHTML = `${uiIcon('play')}<span>播放</span>`;
}

function togglePlayback() {
 const total = projectDuration(appState.project);
 if (total <= 0) {
  showToast('当前为 00:00 空白时间轴，请先从左侧添置分镜或风格方块');
  return;
 }
 if (appState.playing) {
  stopPlayback();
  return;
 }
 if (appState.project.playhead >= total - 0.05) {
  appState.project.playhead = 0;
 }
 appState.playing = true;
 appState.lastRafTs = performance.now();
 appState.lastStageKey = '';
 appState.lastStageDrawTs = 0;
 const btn = document.getElementById('playPauseBtn');
 if (btn) btn.innerHTML = `${uiIcon('pause')}<span>暂停</span>`;

 const tick = (now) => {
  if (!appState.playing) return;
  const dt = Math.min(0.1, Math.max(0.001, (now - appState.lastRafTs) / 1000));
  appState.lastRafTs = now;
  const dur = projectDuration(appState.project);
  const step = advancePlayhead(appState.project.playhead, dt, dur);
  appState.project.playhead = step.time;
  if (step.ended) {
   updatePlayheadVisuals(true);
   stopPlayback();
   return;
  }
  updatePlayheadVisuals(false, now);
  appState.rafId = requestAnimationFrame(tick);
 };
 appState.rafId = requestAnimationFrame(tick);
}

function selectedClipObj() {
 const sel = appState.project.selected;
 if (!sel?.track || !sel?.id) return null;
 return (appState.project.tracks?.[sel.track] || []).find((c) => c.id === sel.id) || null;
}

function ensureActiveVideoClip(defaultTitle = '新分镜') {
 let clip = selectedClipObj();
 if (clip && trackKind(appState.project.selected?.track) === 'video') return clip;
 if (appState.project.tracks.video.length > 0) {
  const atPlay = stateAtTime(appState.project, appState.project.playhead).video || appState.project.tracks.video[0];
  appState.project.selected = { track: 'video', id: atPlay.id };
  return atPlay;
 }
 const res = addClip(appState.project, 'video', { title: defaultTitle });
 return res.clip;
}

function renderSelectOptions(groupKey, selectedVal, emptyLabel = '— 默认 —') {
 return `<option value="">${esc(emptyLabel)}</option>` +
  groupOptions(groupKey).map((o) => `<option value="${esc(o.id)}"${o.id === selectedVal ? ' selected' : ''}>${esc(o.label || o.zh || o.id)}</option>`).join('');
}

function clipTitleLabel(track, clip) {
 const kind = trackKind(track);
 if (kind === 'video') return clip.title || '新分镜';
 if (kind === 'dialogue') return `${clip.speakerName || '角色'}: ${clip.text || '对白'}`;
 if (kind === 'audio') return `${clip.kind === 'ambience' ? '环境' : '音效'}: ${clip.cue || '待填'}`;
 if (kind === 'bgm') return `配乐: ${groupLabel('bgm', clip.style) || clip.mood || 'BGM'}`;
 return clip.label || '调节层';
}

function clipSubLabel(track, clip) {
 const kind = trackKind(track);
 const span = `${fmtTimecode(clip.start)} · ${clip.duration}s`;
 if (kind === 'video') {
  return [span, groupLabel('framing', clip.framing), groupLabel('move', clip.move)].filter(Boolean).join(' · ');
 }
 return span;
}

/* =========================================================
   SCREEN 1: JIANYING-STYLE HOME PAGE (Fig 3)
========================================================= */
function formatDateShort(ts) {
 if (!ts) return '刚刚';
 const d = new Date(ts);
 return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderDraftCard(item) {
 const dur = projectDuration(item);
 const vCount = item.tracks?.video?.length || 0;
 const firstShot = item.tracks?.video?.[0];
 const previewImg = firstShot?.startRefImage || firstShot?.refImage;
 const previewText = firstShot?.prompt || firstShot?.title || '00:00 空白工程，等待开始剪辑';

 return `
  <div class="draft-card" data-open-draft="${esc(item.id)}">
   <div class="draft-thumb" style="${previewImg ? '' : 'background:linear-gradient(155deg,#171a21,#0a0a0c);'}">
    ${previewImg ? `<img src="${esc(previewImg)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.45;"/>` : ''}
    <div class="draft-thumb-top" style="position:relative;z-index:1;">
     <span class="draft-aspect-pill">${esc(displayAspectLabel(item))}</span>
     <span style="color:var(--jy-teal);font-weight:700;">V1:${vCount}</span>
    </div>
    <div class="draft-thumb-mid" style="position:relative;z-index:1;">${esc(previewText)}</div>
    <div class="draft-thumb-bot" style="position:relative;z-index:1;">
     <span>${vCount ? '多轨草稿' : '空白草稿'}</span>
     <span>${esc(fmtTimecode(dur))}</span>
    </div>
   </div>
   <div class="draft-meta">
    <div style="min-width:0;flex:1 1 auto;">
     <div class="draft-name" title="${esc(item.title)}">${esc(item.title || '未命名草稿')}</div>
     <div class="draft-sub">${esc(formatDateShort(item.updatedAt))} · ${dur}s</div>
    </div>
    <div class="draft-card-btns">
     <button class="btn btn-sm" data-rename-draft="${esc(item.id)}" title="重命名草稿">${uiIcon('text')}</button>
     <button class="btn btn-sm" data-clone-draft="${esc(item.id)}" title="复制草稿副本">${uiIcon('layers')}</button>
     <button class="btn btn-sm" data-export-draft="${esc(item.id)}" title="导出 JSON">${uiIcon('export')}</button>
     <button class="btn btn-sm btn-danger" data-del-draft="${esc(item.id)}" title="移入回收站">${uiIcon('delete')}</button>
    </div>
   </div>
  </div>`;
}

function renderTrashSection() {
 const trashed = appState.trashedDrafts || [];
 if (!trashed.length) return '';
 return `
  <section class="trash-section">
   <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
    <button class="btn btn-sm" data-action="toggle-trash" style="gap:6px;">
     ${uiIcon('delete')}
     <span>回收站 (${trashed.length})</span>
     ${uiIcon('chevron-down')}
    </button>
    ${appState.showTrash ? `<button class="btn btn-sm btn-danger" data-action="confirm-empty-trash">清空回收站</button>` : `<span style="font-size:11.5px;color:var(--text-dim);">误删的草稿可在此一键还原</span>`}
   </div>
   ${appState.showTrash ? `
    <div class="history-list" style="margin-top:10px;max-height:260px;">
     ${trashed.map((t) => `
      <div class="history-item">
       <div style="min-width:0;flex:1 1 auto;">
        <div style="color:var(--text-main);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.title || '未命名草稿')}</div>
        <div style="font-size:10.5px;color:var(--text-dim);">删除于 ${esc(formatDateShort(t.deletedAt))} · ${projectDuration(t)}s</div>
       </div>
       <div style="display:flex;gap:5px;flex:0 0 auto;">
        <button class="btn btn-sm" data-restore-trash="${esc(t.id)}">${uiIcon('undo')}<span>还原</span></button>
        <button class="btn btn-sm btn-danger" data-purge-trash="${esc(t.id)}">彻底删除</button>
       </div>
      </div>`).join('')}
    </div>` : ''}
  </section>`;
}

/* =========================================================
   BUILT-IN AI DIRECTOR STUDIO (HOME & EDITOR SHARED)
========================================================= */
function isAIApiConfigured() {
 return Boolean(appState.aiConn.apiKey?.trim()) || (appState.aiConn.transport === 'server' && appState.aiConn.serverHasKey);
}

function aiConnBadgeText() {
 const c = appState.aiConn;
 const modelTag = c.model === DEFAULT_AI_MODEL ? 'Hydrogen' : c.model;
 const levelTag = String(c.thinkingLevel || DEFAULT_THINKING_LEVEL).toUpperCase();
 if (c.testing) return `正在验证 ${modelTag}…`;
 if (c.verified) return `已验证 · ${modelTag} (${levelTag})`;
 if (c.apiKey?.trim()) return `已填 Key · ${modelTag} (${levelTag})`;
 if (c.transport === 'server' && c.serverHasKey) return `服务端已配 Key · ${modelTag}`;
 return `待填 API · ${modelTag} (${levelTag})`;
}

async function probeServerConfigIfLocal(force = false) {
 const isLocal = typeof location !== 'undefined' && (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
 if (!isLocal && !force) return;
 try {
  const res = await fetch('./api/config', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('application/json')) {
   appState.aiConn.staticHost = true;
   appState.aiConn.serverHasKey = false;
   return;
  }
  const data = await res.json();
  appState.aiConn.staticHost = false;
  appState.aiConn.serverHasKey = Boolean(data?.ai?.ready);
 } catch {
  appState.aiConn.staticHost = true;
  appState.aiConn.serverHasKey = false;
 }
}

function aiWaitText() {
 const f = appState.aiFlow;
 const sec = f.startedAt ? Math.max(0, Math.floor((Date.now() - f.startedAt) / 1000)) : 0;
 const m = String(Math.floor(sec / 60)).padStart(2, '0');
 const s = String(sec % 60).padStart(2, '0');
 const modelName = appState.aiConn.model || DEFAULT_AI_MODEL;
 const lvl = String(appState.aiConn.thinkingLevel || DEFAULT_THINKING_LEVEL).toUpperCase();
 const streamTxt = f.thoughtChars || f.answerChars
  ? ` · 已收到思考 ${f.thoughtChars} 字 / 方案 ${f.answerChars} 字`
  : '';
 return `正在通过 ${modelName}（Thinking: ${lvl}）深度推演五轨时间轴… 已等待 ${m}:${s}${streamTxt}`;
}

function syncAIProgressDom() {
 const el = document.getElementById('aiWaitStatus');
 if (el && appState.aiFlow.busy) {
  el.textContent = aiWaitText();
 }
}

function renderAIApiPanel(compact = false) {
 const c = appState.aiConn;
 const ready = isAIApiConfigured();
 return `
  <section class="ai-card ${compact ? 'compact' : ''}">
   <div class="ai-card-head">
    <div class="ai-card-title">${uiIcon('key')}<span>Google Gemini API 接入配置</span></div>
    <span class="ai-pill ${c.verified ? 'ok' : ready ? 'warm' : 'idle'}">${esc(aiConnBadgeText())}</span>
   </div>
   <div class="ai-help-note">默认调用 Google 官方 <code>${esc(DEFAULT_AI_MODEL)}</code> 模型并将推理档位设为 <code>high</code>；密钥仅暂存于当前页面内存，绝不写入草稿或 JSON 导出文件。</div>
   <div class="field-grid ${compact ? 'ai-grid-1' : ''}">
    <div class="field">
     <label for="aiModelInput">Google 模型 ID</label>
     <input id="aiModelInput" class="input" data-ai-conn="model" value="${esc(c.model)}" placeholder="${esc(DEFAULT_AI_MODEL)}" autocomplete="off" spellcheck="false" />
    </div>
    <div class="field">
     <label for="aiThinkingSelect">思考深度 (Thinking Level)</label>
     <select id="aiThinkingSelect" class="select" data-ai-conn="thinkingLevel">
      ${THINKING_LEVELS.map(([id, label]) => `<option value="${esc(id)}"${id === c.thinkingLevel ? ' selected' : ''}>${esc(label)}</option>`).join('')}
     </select>
    </div>
    <div class="field ${compact ? '' : 'full'}">
     <label for="aiTransportSelect">连接方式</label>
     <select id="aiTransportSelect" class="select" data-ai-conn="transport">
      <option value="browser"${c.transport !== 'server' ? ' selected' : ''}>浏览器直连（推荐 · GitHub Pages 纯静态与本地均可用）</option>
      <option value="server"${c.transport === 'server' ? ' selected' : ''}>本地服务器 / Worker 转发 (/api/ai/*)</option>
     </select>
    </div>
    <div class="field full">
     <label for="aiApiKeyInput">Google API Key（如 AI Studio 密钥）</label>
     <div class="ai-key-row">
      <input id="aiApiKeyInput" class="input" type="${c.showKey ? 'text' : 'password'}" data-ai-conn="apiKey" value="${esc(c.apiKey)}" placeholder="粘贴你的 Google AI Studio API Key…" autocomplete="off" spellcheck="false" />
      <button type="button" class="btn btn-sm" data-action="ai-toggle-key-vis" title="${c.showKey ? '隐藏密钥' : '显示密钥'}">${uiIcon(c.showKey ? 'eye-off' : 'eye')}</button>
     </div>
    </div>
   </div>
   <div class="ai-btn-row">
    <button type="button" class="btn btn-sm btn-jy" data-action="ai-test-conn"${c.testing ? ' disabled' : ''}>${uiIcon('check')}<span>${c.testing ? '正在验证权限…' : '测试并验证连接'}</span></button>
    ${c.apiKey ? `<button type="button" class="btn btn-sm btn-danger" data-action="ai-disconnect">断开并清除 Key</button>` : ''}
    <button type="button" class="btn btn-sm" data-action="ai-open-guide">接入说明</button>
   </div>
   ${c.statusMsg ? `<div id="aiConnFeedback" class="modal-alert ${c.statusError ? 'error' : 'info'}" style="margin-top:8px;margin-bottom:0;">${esc(c.statusMsg)}</div>` : ''}
  </section>`;
}

function renderAIPreselectPanel(compact = false) {
 const b = appState.aiBrief;
 const cols = compact ? 'ai-grid-1' : '';
 return `
  <section class="ai-card ${compact ? 'compact' : ''}">
   <div class="ai-card-head">
    <div class="ai-card-title">${uiIcon('adjustment')}<span>提前预选条件（AI 将严格按以下选择生成）</span></div>
    <span class="ai-pill idle">${briefPreselectionSummary(b).length} 项预设生效</span>
   </div>

   <div class="ai-sub-block">
    <div class="ai-sub-label">01 · 快捷题材预选（点击一键套用题材与参考风格）</div>
    <div class="ai-tpl-grid">
     ${AI_STORY_TEMPLATES.map((t) => `
      <button type="button" class="ai-tpl-chip" data-ai-tpl="${esc(t.id)}" title="${esc(t.idea)}">
       <strong>${esc(t.label)}</strong>
       <span>${esc(t.badge)}</span>
      </button>`).join('')}
    </div>
   </div>

   <div class="ai-sub-block">
    <div class="ai-sub-label">02 · 画面规格与美学质感</div>
    <div class="field-grid ${cols}">
     <div class="field">
      <label>画幅比例</label>
      <select class="select" data-ai-brief="format">
       <option value="match_project"${b.format === 'match_project' ? ' selected' : ''}>沿用当前工程画幅 (${esc(displayAspectLabel(appState.project))})</option>
       ${NLE_FORMATS.filter(([id]) => id !== 'custom').map(([id, lb]) => `<option value="${esc(id)}"${id === b.format ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
     <div class="field">
      <label>目标分辨率</label>
      <select class="select" data-ai-brief="resolution">
       <option value="match_project"${b.resolution === 'match_project' ? ' selected' : ''}>沿用当前分辨率 (${esc(displayResolutionLabel(appState.project))})</option>
       ${NLE_RESOLUTIONS.filter(([id]) => id !== 'custom').map(([id, lb]) => `<option value="${esc(id)}"${id === b.resolution ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
     <div class="field">
      <label>视觉美学 Preset</label>
      <select class="select" data-ai-brief="visualPreset">
       ${AI_VISUAL_PRESETS.map(([id, lb]) => `<option value="${esc(id)}"${id === b.visualPreset ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
     <div class="field">
      <label>拍摄媒介与胶片质感</label>
      <select class="select" data-ai-brief="texturePreset">
       ${AI_TEXTURE_PRESETS.map(([id, lb]) => `<option value="${esc(id)}"${id === b.texturePreset ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
     <div class="field full">
      <label>全局色彩影调覆盖</label>
      <select class="select" data-ai-brief="color">
       <option value="">跟随视觉预设 / AI 自动搭配</option>
       ${groupOptions('color').map((o) => `<option value="${esc(o.id)}"${o.id === b.color ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select>
     </div>
    </div>
   </div>

   <div class="ai-sub-block">
    <div class="ai-sub-label">03 · 运镜、转场、镜数与轨道开关</div>
    <div class="field-grid ${cols}">
     <div class="field">
      <label>摄影运镜偏好</label>
      <select class="select" data-ai-brief="cameraPref">
       ${AI_CAMERA_PREFS.map(([id, lb]) => `<option value="${esc(id)}"${id === b.cameraPref ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
     <div class="field">
      <label>剪辑转场风格</label>
      <select class="select" data-ai-brief="transitionStyle">
       ${AI_TRANSITION_PREFS.map(([id, lb]) => `<option value="${esc(id)}"${id === b.transitionStyle ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
    </div>
    <div class="ai-check-pills">
     <label class="ai-check-pill ${b.customShotTiming ? 'on' : ''}"><input type="checkbox" data-ai-brief-bool="customShotTiming"${b.customShotTiming ? ' checked' : ''} /><span>自定分镜数与时长</span></label>
     <label class="ai-check-pill ${b.chainLastFrame ? 'on' : ''}"><input type="checkbox" data-ai-brief-bool="chainLastFrame"${b.chainLastFrame ? ' checked' : ''} /><span>尾帧承接下一镜首帧</span></label>
     <label class="ai-check-pill ${b.includeAdjustLayer ? 'on' : ''}"><input type="checkbox" data-ai-brief-bool="includeAdjustLayer"${b.includeAdjustLayer ? ' checked' : ''} /><span>生成 E1 调节层</span></label>
     <label class="ai-check-pill ${b.generateSfx ? 'on' : ''}"><input type="checkbox" data-ai-brief-bool="generateSfx"${b.generateSfx ? ' checked' : ''} /><span>生成 A1 独立音效</span></label>
     <label class="ai-check-pill ${b.reuseCurrentAssets ? 'on' : ''}"><input type="checkbox" data-ai-brief-bool="reuseCurrentAssets"${b.reuseCurrentAssets ? ' checked' : ''} /><span>优先复用当前角色与场景</span></label>
    </div>
    ${b.customShotTiming ? `
     <div class="field-grid ${cols}" style="margin-top:8px;padding:8px;background:#111114;border:1px solid var(--border);border-radius:6px;">
      <div class="field">
       <label>分镜约束</label>
       <select class="select" data-ai-brief="shotCountMode">
        <option value="exact"${b.shotCountMode === 'exact' ? ' selected' : ''}>精确生成 N 镜</option>
        <option value="max"${b.shotCountMode === 'max' ? ' selected' : ''}>控制在 N 镜内</option>
       </select>
      </div>
      <div class="field">
       <label>分镜数量</label>
       <input type="number" min="1" max="80" step="1" class="input" data-ai-brief-num="shotCount" value="${b.shotCount}" />
      </div>
      <div class="field">
       <label>时长模式</label>
       <select class="select" data-ai-brief="timingMode">
        <option value="auto"${b.timingMode === 'auto' ? ' selected' : ''}>指定全片总时长</option>
        <option value="fixed"${b.timingMode === 'fixed' ? ' selected' : ''}>每镜固定时长</option>
       </select>
      </div>
      <div class="field">
       <label>${b.timingMode === 'fixed' ? '每镜秒数 (s)' : '目标总时长 (s)'}</label>
       <input type="number" min="${b.timingMode === 'fixed' ? '0.5' : '2'}" step="${b.timingMode === 'fixed' ? '0.5' : '1'}" class="input" data-ai-brief-num="${b.timingMode === 'fixed' ? 'fixedDuration' : 'duration'}" value="${b.timingMode === 'fixed' ? b.fixedDuration : b.duration}" />
      </div>
     </div>` : ''}
   </div>

   <div class="ai-sub-block">
    <div class="ai-sub-label">04 · 人物预选、对白 T1 与配乐 A2</div>
    <div class="field-grid ${cols}">
     <div class="field">
      <label>人物面孔地域</label>
      <select class="select" data-ai-brief="nationality">
       ${AI_CAST_NATIONALITIES.map(([id, lb]) => `<option value="${esc(id)}"${id === b.nationality ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
     <div class="field">
      <label>颜值 / 角色视觉定位</label>
      <select class="select" data-ai-brief="faceTier">
       ${AI_CAST_FACE_TIERS.map(([id, lb]) => `<option value="${esc(id)}"${id === b.faceTier ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
     <div class="field">
      <label>皮肤纹理与磨皮控制</label>
      <select class="select" data-ai-brief="skinRender">
       ${AI_CAST_SKIN_RENDERS.map(([id, lb]) => `<option value="${esc(id)}"${id === b.skinRender ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
     <div class="field">
      <label>对白安排 (T1 轨)</label>
      <select class="select" data-ai-brief="dialogueMode">
       ${AI_DIALOGUE_MODES.map(([id, lb]) => `<option value="${esc(id)}"${id === b.dialogueMode ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
     <div class="field">
      <label>A2 配乐策略</label>
      <select class="select" data-ai-brief="bgmMode">
       ${AI_BGM_MODES.map(([id, lb]) => `<option value="${esc(id)}"${id === b.bgmMode ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
      </select>
     </div>
     <div class="field">
      <label>预选配乐流派</label>
      <select class="select" data-ai-brief="bgmStyle"${b.bgmMode === 'none' ? ' disabled' : ''}>
       <option value="">由 AI 按情绪自动挑曲</option>
       ${groupOptions('bgm').filter((o) => o.id !== 'none').map((o) => `<option value="${esc(o.id)}"${o.id === b.bgmStyle ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select>
     </div>
     <div class="field full">
      <label>对白语言与人物穿搭要求（选填）</label>
      <input class="input" data-ai-brief="castNotes" value="${esc(b.castNotes)}" placeholder="例如：女主穿米色防雨风衣拎透明雨伞；配乐前期留白纯钢琴…" />
     </div>
    </div>
   </div>

   <div class="ai-sub-block">
    <div class="ai-sub-label">05 · 全局负向词预选 (${b.negativePrompts.length} 项选中)</div>
    <div class="chip-grid" style="margin-bottom:6px;">
     ${groupOptions('negative').slice(0, 14).map((o) => {
      const on = b.negativePrompts.includes(o.id);
      return `<button type="button" class="chip-btn ${on ? 'neg-on' : ''}" data-ai-neg="${esc(o.id)}">${esc(o.label)}</button>`;
     }).join('')}
    </div>
    <div class="field">
     <input class="input" data-ai-brief="customNegative" value="${esc(b.customNegative)}" placeholder="附加自定义负向约束（逗号分隔，如：多余手掌、画面撕裂）" />
    </div>
   </div>
  </section>`;
}

function renderAIResultPreview(place = 'editor') {
 const res = appState.aiFlow.result;
 if (!res?.plan) return '';
 const plan = res.plan;
 const totalDur = roundT((plan.shots || []).reduce((a, s) => a + (Number(s.duration) || 0), 0));
 return `
  <section class="ai-card ai-result-card">
   <div class="ai-card-head">
    <div class="ai-card-title">${uiIcon('check')}<span>方案已就绪：${esc(plan.title)}</span></div>
    <span class="ai-pill ok">${esc(res.model)} · ${esc(String(res.thinkingLevel || 'high').toUpperCase())}</span>
   </div>
   <div class="ai-result-stats">
    <span>角色 ${plan.characters.length}</span>
    <span>场景 ${plan.scenes.length}</span>
    <span>V1 分镜 ${plan.shots.length} 镜</span>
    <span>T1 对白 ${plan.dialogueClips.length} 条</span>
    <span>A1 音效 ${plan.audioClips.length} 条</span>
    <span>A2 配乐 ${plan.bgmClips.length} 段</span>
    <span>总时长 ${totalDur}s</span>
   </div>
   ${plan.logline ? `<div style="font-size:11.5px;color:var(--text-muted);line-height:1.5;margin:6px 0;">${esc(plan.logline)}</div>` : ''}
   <div class="ai-shot-mini-list">
    ${plan.shots.map((s, i) => `
     <div class="ai-shot-mini-row">
      <span class="ai-shot-idx">${String(i + 1).padStart(2, '0')}</span>
      <div style="min-width:0;flex:1 1 auto;">
       <div style="font-weight:600;font-size:11.5px;">${esc(s.title)} · ${s.duration}s</div>
       <div style="font-size:11px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.action)}</div>
      </div>
     </div>`).join('')}
   </div>
   <div class="ai-btn-row" style="margin-top:10px;">
    ${place === 'home' ? `
     <button type="button" class="btn btn-compile-hero" style="flex:1;" data-action="ai-apply-plan" data-target="new">${uiIcon('storyboard-track')}<span>一键创建五轨草稿并进入剪辑台</span></button>` : `
     <button type="button" class="btn btn-jy" style="flex:1;" data-action="ai-apply-plan" data-target="fill">${uiIcon('plus')}<span>填入当前时间轴 (可撤销)</span></button>
     <button type="button" class="btn btn-sm" data-action="ai-apply-plan" data-target="new">新建草稿打开</button>`}
   </div>
  </section>`;
}

function renderAIGeneratePanel(place = 'editor') {
 const b = appState.aiBrief;
 const f = appState.aiFlow;
 const badges = briefPreselectionSummary(b);
 const ready = isAIApiConfigured();
 return `
  <section class="ai-card ${place === 'editor' ? 'compact' : ''}">
   <div class="ai-card-head">
    <div class="ai-card-title">${uiIcon('ai-spark')}<span>AI 辅助创作五轨方案</span></div>
    <button type="button" class="btn btn-sm" data-action="ai-go-api-tab">${uiIcon('key')}<span>${ready ? aiConnBadgeText() : '填写 Google API Key'}</span></button>
   </div>

   <div class="field" style="margin-bottom:8px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
     <label for="aiIdeaInput" style="margin:0;">一句话故事创意 / 分镜需求</label>
     <button type="button" class="btn btn-sm" data-action="ai-clear-idea">清空</button>
    </div>
    <textarea id="aiIdeaInput" class="textarea" rows="${place === 'editor' ? '4' : '3'}" data-ai-brief="idea" placeholder="描述你想拍的画面、人物情绪、核心冲突或台词（也可以先在预设选好风格/镜数/配乐，再写一句话即可）…">${esc(b.idea)}</textarea>
   </div>

   <div class="ai-sub-label" style="margin-bottom:4px;">快速填入题材（可选）</div>
   <div class="ai-quick-tpl-row">
    ${AI_STORY_TEMPLATES.map((t) => `<button type="button" class="chip-btn" data-ai-tpl="${esc(t.id)}">${esc(t.label)}</button>`).join('')}
   </div>

   <div class="ai-summary-strip">
    <span style="font-size:11px;color:var(--text-dim);">当前生效预选：</span>
    ${badges.map((tag) => `<span class="ai-summary-chip">${esc(tag)}</span>`).join('')}
    ${place === 'editor' ? `<button type="button" class="ai-link-btn" data-action="ai-go-preselect-tab">修改预选条件 →</button>` : ''}
   </div>

   ${place === 'editor' ? `
    <div class="ai-apply-box">
     <div class="ai-sub-label" style="margin-bottom:5px;">写入作用域与方式</div>
     <div class="ai-check-pills">
      ${Object.entries({ characters: '角色', scenes: '场景', video: 'V1分镜', dialogue: 'T1对白', audio: 'A1音效', bgm: 'A2配乐', adjust: 'E1调节', negative: '负向词', specs: '规格' }).map(([k, lb]) => `
       <label class="ai-check-pill ${appState.aiScopes[k] ? 'on' : ''}"><input type="checkbox" data-ai-scope="${esc(k)}"${appState.aiScopes[k] ? ' checked' : ''} /><span>${lb}</span></label>`).join('')}
     </div>
     <div class="ai-apply-mode-row">
      <select class="select" id="aiApplyModeSelect" data-ai-apply-mode="1" style="flex:1;">
       <option value="fill"${appState.aiApplyMode === 'fill' ? ' selected' : ''}>补充追加至当前时间轴（可 Ctrl+Z 撤销）</option>
       <option value="new"${appState.aiApplyMode === 'new' ? ' selected' : ''}>生成后新建独立 2.0 草稿</option>
      </select>
      <label class="ai-check-pill ${appState.aiAutoApply ? 'on' : ''}"><input type="checkbox" data-ai-auto-apply="1"${appState.aiAutoApply ? ' checked' : ''} /><span>完成即自动填入</span></label>
     </div>
    </div>` : `
    <div class="ai-apply-box">
     <label class="ai-check-pill ${appState.aiAutoApply ? 'on' : ''}"><input type="checkbox" data-ai-auto-apply="1"${appState.aiAutoApply ? ' checked' : ''} /><span>生成完成后自动创建草稿并进入 2.0 五轨剪辑台</span></label>
    </div>`}

   <div class="ai-btn-row" style="margin-top:10px;">
    <button type="button" class="btn btn-compile-hero" style="flex:1;justify-content:center;" data-action="ai-generate"${f.busy ? ' disabled' : ''}>
     ${uiIcon('ai-spark')}
     <span>${f.busy ? 'Hydrogen 深度思考生成中…' : `生成五轨方案 (${esc(appState.aiConn.model === DEFAULT_AI_MODEL ? 'Hydrogen' : appState.aiConn.model)} · ${esc(String(appState.aiConn.thinkingLevel || 'high').toUpperCase())})`}</span>
    </button>
    ${f.busy ? `<button type="button" class="btn btn-danger" data-action="ai-cancel">取消等待</button>` : ''}
   </div>

   ${f.busy ? `<div id="aiWaitStatus" class="modal-alert info" style="margin-top:8px;margin-bottom:0;">${esc(aiWaitText())}</div>` : ''}
   ${f.error ? `<div class="modal-alert error" style="margin-top:8px;margin-bottom:0;">${esc(f.error)}</div>` : ''}
  </section>
  ${renderAIResultPreview(place)}`;
}

function renderHomeAIStudio() {
 return `
  <div class="home-ai-header">
   <div>
    <div style="display:inline-flex;align-items:center;gap:8px;font-size:16px;font-weight:800;">
     ${uiIcon('ai-spark', 'title-svg')}
     <span>镜序 2.0 · 内置 AI 辅助多轨导演台</span>
     <span class="ai-pill ${appState.aiConn.verified ? 'ok' : isAIApiConfigured() ? 'warm' : 'idle'}">${esc(aiConnBadgeText())}</span>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">支持连接你自己的 Google API（默认 <code>gemini-4-hydrogen</code> · <code>thinkingLevel: high</code>），提前预选画风、分镜节奏、人物肤质与配乐，一键生成完整 5 轨可剪辑草稿。</div>
   </div>
   <button type="button" class="btn btn-sm" data-home-tab="home">${uiIcon('home')}<span>返回首页草稿</span></button>
  </div>
  <div class="home-ai-layout">
   <div class="home-ai-col">
    ${renderAIApiPanel(false)}
    ${renderAIGeneratePanel('home')}
   </div>
   <div class="home-ai-col">
    ${renderAIPreselectPanel(false)}
   </div>
  </div>`;
}

async function handleTestAIConnection() {
 if (appState.aiConn.testing) return;
 if (!appState.aiConn.apiKey?.trim() && !(appState.aiConn.transport === 'server' && appState.aiConn.serverHasKey)) {
  appState.aiConn.statusMsg = '请先粘贴你的 Google API Key 再点击测试连接。';
  appState.aiConn.statusError = true;
  render(true);
  document.getElementById('aiApiKeyInput')?.focus();
  return;
 }
 appState.aiConn.testing = true;
 appState.aiConn.statusMsg = `正在验证模型 ${appState.aiConn.model || DEFAULT_AI_MODEL} 的访问权限…`;
 appState.aiConn.statusError = false;
 render(true);
 try {
  const res = await testGoogleConnection({
   apiKey: appState.aiConn.apiKey,
   model: appState.aiConn.model,
   transport: appState.aiConn.transport
  });
  appState.aiConn.verified = Boolean(res.verified);
  appState.aiConn.model = res.model || appState.aiConn.model;
  appState.aiConn.statusMsg = `连接成功：已确认模型 ${appState.aiConn.model}（思考档位：${String(appState.aiConn.thinkingLevel).toUpperCase()}）可用，现在可以开始 AI 辅助生成。`;
  appState.aiConn.statusError = false;
  persistAppPrefs();
  showToast('Google API 连接验证通过');
 } catch (err) {
  appState.aiConn.verified = false;
  appState.aiConn.statusMsg = err.message || '连接验证未通过，请检查 Key 与网络设置。';
  appState.aiConn.statusError = true;
 } finally {
  appState.aiConn.testing = false;
  render(true);
 }
}

async function handleApplyAIPlan(targetMode = null) {
 const res = appState.aiFlow.result;
 if (!res?.plan) { showToast('尚未生成可应用的 AI 方案'); return; }
 const effectiveMode = targetMode || (appState.screen === 'home' ? 'new' : appState.aiApplyMode);
 stopPlayback();
 const contextProj = appState.screen === 'editor' ? appState.project : null;
 if (effectiveMode === 'fill' && appState.screen === 'editor') {
  pushUndo(null, 'AI 辅助填入五轨内容');
 }
 const applied = applyNleAIPlan(contextProj, res.plan, {
  mode: effectiveMode,
  scopes: appState.aiScopes,
  reuseExisting: appState.aiBrief.reuseCurrentAssets
 });
 appState.project = applied.project;
 if (effectiveMode === 'new') {
  appState.history = [];
  appState.future = [];
 }
 appState.multiSelected = [];
 appState.screen = 'editor';
 await saveProject(appState.project);
 lastProject(appState.project.id);
 await refreshDraftsCache();
 render();
 const st = applied.stats;
 showToast(`已写入五轨时间轴：V1 +${st.shotsAdded} 镜 · T1 +${st.dialogueAdded} · A1 +${st.audioAdded} · A2 +${st.bgmAdded}`);
}

async function handleRunAIGenerate() {
 if (appState.aiFlow.busy) return;
 if (!isAIApiConfigured()) {
  appState.aiConn.statusMsg = '请先在这里粘贴你自己的 Google API Key（仅存页面内存，支持浏览器直连）。';
  appState.aiConn.statusError = true;
  if (appState.screen === 'editor') appState.resSubCat = 'api';
  render(true);
  document.getElementById('aiApiKeyInput')?.focus();
  showToast('请先填写 Google API Key');
  return;
 }
 if (String(appState.aiBrief.idea || '').trim().length < 2) {
  showToast('请先输入创作想法或点选上方快速题材');
  document.getElementById('aiIdeaInput')?.focus();
  return;
 }

 const controller = new AbortController();
 clearInterval(appState.aiFlow.timer);
 appState.aiFlow.busy = true;
 appState.aiFlow.error = '';
 appState.aiFlow.startedAt = Date.now();
 appState.aiFlow.thoughtChars = 0;
 appState.aiFlow.answerChars = 0;
 appState.aiFlow.controller = controller;
 appState.aiFlow.timer = setInterval(syncAIProgressDom, 1000);
 render();

 try {
  const projCtx = appState.screen === 'editor' ? {
   format: displayAspectLabel(appState.project),
   resolution: displayResolutionLabel(appState.project),
   fps: appState.project.fps,
   characters: (appState.project.characters || []).slice(0, 8),
   scenes: (appState.project.scenes || []).slice(0, 8)
  } : {};

  const out = await generateNleAIPlan({
   brief: appState.aiBrief,
   projectContext: projCtx,
   connection: appState.aiConn,
   onProgress: ({ thoughtChars, answerChars }) => {
    appState.aiFlow.thoughtChars = thoughtChars;
    appState.aiFlow.answerChars = answerChars;
    syncAIProgressDom();
   }
  }, { signal: controller.signal });

  appState.aiFlow.result = out;
  appState.aiConn.verified = true;
  clearInterval(appState.aiFlow.timer);
  appState.aiFlow.busy = false;
  appState.aiFlow.controller = null;

  if (appState.aiAutoApply) {
   await handleApplyAIPlan(appState.screen === 'home' ? 'new' : appState.aiApplyMode);
  } else {
   render();
   showToast(`AI 方案已生成（V1 共 ${out.plan.shots.length} 镜），可预览后点击写入时间轴`);
  }
 } catch (err) {
  appState.aiFlow.error = err.message || 'AI 生成未能完成，请重试。';
  clearInterval(appState.aiFlow.timer);
  appState.aiFlow.busy = false;
  appState.aiFlow.controller = null;
  render();
  showToast(appState.aiFlow.error);
 }
}

/* =========================================================
   BUILT-IN MUSE VIDEO GENERATION STUDIO (HOME)
========================================================= */
function museConnBadgeText() {
 const m = appState.muse;
 if (m.probing) return '正在探测服务与模型…';
 if (m.reachable && m.accountsKnown && m.accountCount > 0) {
  return `服务在线 · 已登录 ${m.accountCount} 个账号`;
 }
 if (m.reachable && m.accountsKnown && m.accountCount === 0) {
  return '服务在线 · 账号池未登录 (0)';
 }
 if (m.reachable) return `服务已连通 (${m.models.length} 模型)`;
 return m.config.channel === 'custom' ? '待填自定义接口' : '待启动 / 待探测本机 Muse';
}

function museAvailableDrafts() {
 const list = [];
 if (appState.project && hasProjectContent(appState.project)) {
  list.push({ id: 'current', label: `当前工作台工程 · ${appState.project.title || '未命名'}`, proj: appState.project });
 }
 for (const d of appState.drafts || []) {
  if (list.some((x) => x.proj.id === d.id)) continue;
  list.push({ id: d.id, label: `${d.title || '未命名草稿'} (${projectDuration(d)}s)`, proj: d });
 }
 return list;
}

function importPromptFromMuseSource() {
 const m = appState.muse;
 const sources = museAvailableDrafts();
 const picked = sources.find((x) => x.id === m.sourceDraftId) || sources[0];
 if (!picked?.proj) {
  showToast('当前尚无包含片段的草稿，可先创建分镜或直接手写视频提示词');
  return;
 }
 const proj = picked.proj;
 const vClips = proj.tracks?.video || [];
 if (m.sourceShotIdx >= 0 && vClips[m.sourceShotIdx]) {
  const shot = vClips[m.sourceShotIdx];
  const savedSel = proj.selected;
  proj.selected = { track: 'video', id: shot.id };
  m.prompt = compileTimelinePrompt(proj, 'selected', 'zh');
  proj.selected = savedSel;
  if (shot.startRefImage || shot.refImage) {
   m.firstFrame = shot.startRefImage || shot.refImage;
   if (shot.endRefImage) m.lastFrame = shot.endRefImage;
   m.mode = 'frames';
  }
  const fmt = proj.format;
  if (['16:9', '9:16', '1:1', '4:3', '3:4'].includes(fmt)) m.ratio = fmt;
  if (fmt === '2.39:1') m.ratio = '21:9';
  m.seconds = clampMuseSeconds(shot.duration, m.config.model);
  showToast(`已导入第 ${m.sourceShotIdx + 1} 镜「${shot.title}」提示词${m.firstFrame ? '及参考图' : ''}`);
 } else {
  m.prompt = compileTimelinePrompt(proj, 'concise', 'zh');
  const fmt = proj.format;
  if (['16:9', '9:16', '1:1', '4:3', '3:4'].includes(fmt)) m.ratio = fmt;
  if (fmt === '2.39:1') m.ratio = '21:9';
  showToast(`已导入工程「${proj.title}」全片精简提示词`);
 }
 render();
}

async function refreshMuseAccountPool(silent = false) {
 const m = appState.muse;
 if (m.staticHost) return;
 m.accountsLoading = true;
 if (!silent) m.accountsError = '';
 render(true);
 try {
  const res = await fetchMuseAccounts(m.config, m.apiKey, { staticHost: m.staticHost });
  m.accounts = Array.isArray(res.accounts) ? res.accounts : [];
  m.accountStats = res.stats || null;
  m.accountsError = '';
  m.accountsKnown = true;
  m.accountCount = m.accounts.length;
  m.accountSummary = m.accounts.map((a) => ({
   label: a.label,
   status: a.enabled === false ? '已禁用' : a.ok === true ? '可用' : a.ok === false ? '异常' : '未检测',
   enabled: a.enabled !== false
  }));
  m.reachable = true;
 } catch (err) {
  m.accountsError = err.message || '读取本机账号列表失败。';
 } finally {
  m.accountsLoading = false;
  render(true);
 }
}

async function refreshMuseProtocolNet(force = false) {
 const m = appState.muse;
 if (m.staticHost || m.netCheckLoading) return;
 m.netCheckLoading = true;
 render(true);
 try {
  const res = await checkMuseProtocolNetwork(m.config, m.apiKey, force, { staticHost: m.staticHost });
  m.netCheck = res;
 } catch (err) {
  m.netCheck = { ok: false, message: err.message || '网络自检未完成。' };
 } finally {
  m.netCheckLoading = false;
  render(true);
 }
}

async function handleMuseOpenLoginWindow(accountId = '') {
 const m = appState.muse;
 if (m.loginWindowBusy) return;
 m.loginWindowBusy = true;
 m.loginStatusTone = 'info';
 m.loginStatusMsg = accountId
  ? '正在弹出隔离 Chrome 登录窗口以重新登录该 Muse 账号（请留意桌面与任务栏）…'
  : '正在启动隔离 Chrome 登录窗口（请留意桌面弹窗或任务栏图标，若 15 秒未见弹窗可改用下方 Cookie 导入）…';
 render(true);
 try {
  const sess = await startMuseLoginWindow(m.config, m.apiKey, {
   label: accountId ? '' : m.loginLabelInput,
   accountId
  }, { staticHost: m.staticHost });
  const who = accountId ? `「${sess.label || accountId}」` : (m.loginLabelInput ? `「${m.loginLabelInput}」` : 'Muse');
  m.loginStatusTone = 'warn';
  m.loginStatusMsg = `已弹出隔离登录窗口！请在弹窗里登录你的 ${who} 账号；登录完成后不要手动关窗，约 10–60 秒自动写入账号池后关窗。`;
  render(true);

  let misses = 0;
  while (true) {
   await new Promise((r) => setTimeout(r, 2500));
   let cur;
   try {
    cur = await pollMuseLoginWindow(m.config, m.apiKey, sess.id, { staticHost: m.staticHost });
    misses = 0;
   } catch (err) {
    if (/没有这个登录窗口/.test(err.message)) {
     m.loginStatusTone = 'error';
     m.loginStatusMsg = '本机流量池已重启，当前登录会话中断，请关闭弹窗后重试或改用 Cookie 导入。';
     break;
    }
    if (++misses <= 12) {
     m.loginStatusMsg = '正在等待本机螺旋池响应（请暂时保持登录弹窗开启）…';
     render(true);
     continue;
    }
    throw err;
   }
   if (cur.status === 'waiting') {
    if (cur.phase === 'importing') {
     m.loginStatusTone = 'ok';
     m.loginStatusMsg = '已检测到登录成功，正在自动采集凭证并同步至新/老接口（请勿关闭窗口）…';
     render(true);
    }
    continue;
   }
   if (cur.status === 'done') {
    m.loginStatusTone = 'ok';
    m.loginStatusMsg = `${cur.relogin ? '已重新登录' : '已成功添加'}账号「${cur.label || 'Muse'}」并自动加入本机账号池。`;
    if (!cur.relogin) m.loginLabelInput = '';
    showToast(m.loginStatusMsg);
    await refreshMuseAccountPool(true);
   } else {
    m.loginStatusTone = 'error';
    m.loginStatusMsg = cur.error || '未能成功导入该账号，请重试或改用下方 Cookie 粘贴方式。';
   }
   break;
  }
 } catch (err) {
  m.loginStatusTone = 'error';
  m.loginStatusMsg = err.message || '打开登录窗口失败，可先检查 18610 服务或改用下方 Cookie 导入。';
 } finally {
  m.loginWindowBusy = false;
  render(true);
 }
}

async function handleMuseImportCookie() {
 const m = appState.muse;
 if (m.cookieImporting) return;
 m.cookieBoxOpen = true;
 if (!String(m.cookieInput || '').trim()) {
  m.cookieStatusError = true;
  m.cookieStatusMsg = '请先粘贴从浏览器复制的 muse.ai Cookie 字符串（需含 hatch_sess 与 hatch_vml）。';
  render(true);
  showToast('请先粘贴 Cookie 字符串');
  return;
 }
 m.cookieImporting = true;
 m.cookieStatusError = false;
 m.cookieStatusMsg = '正在导入 Cookie 到本机账号池…';
 render(true);
 try {
  const res = await importMuseAccountCookies(m.config, m.apiKey, {
   label: m.cookieLabelInput,
   cookieHeader: m.cookieInput
  }, { staticHost: m.staticHost });
  m.cookieInput = '';
  m.cookieLabelInput = '';
  m.cookieStatusError = Boolean(res.warning);
  m.cookieStatusMsg = res.warning || `成功导入 ${res.count || 1} 个 Muse 账号！建议对账号点一下「同步新接口」和「校验测试」。`;
  showToast(res.warning || `成功导入 ${res.count || 1} 个账号`);
  await refreshMuseAccountPool(true);
 } catch (err) {
  m.cookieStatusError = true;
  m.cookieStatusMsg = err.message || '导入失败，请确认粘贴的是请求标头 cookie: 后的完整内容。';
 } finally {
  m.cookieImporting = false;
  render(true);
 }
}

async function handleMuseSingleAccAction(accountId, act, payload = undefined) {
 const m = appState.muse;
 if (m.accBusyId) return;
 m.accBusyId = accountId;
 render(true);
 try {
  const r = await runMuseAccountAction(m.config, m.apiKey, accountId, act, payload, { staticHost: m.staticHost });
  if (act === 'test') {
   const qt = r.quota ? `，周已用 ${r.quota.weekly_used_pct ?? '?'}%` : '';
   showToast(`${r.ok ? '账号可用' : '校验未通过'}：${r.message || ''}${qt}`);
  } else if (act === 'keepalive') {
   showToast(r.ok ? '会话保活成功，有效期已刷新' : `保活失败：${r.error || '未知错误'}`);
  } else if (act === 'quota') {
   showToast(r.found ? `当前套餐 ${r.plan || 'Muse'} · 周用量已用 ${r.weekly_used_pct ?? '?'}%` : '暂未读到额度详情');
  } else if (act === 'sync-protocol') {
   showToast(r.ok ? '已同步登录会话到 18611 新接口' : `同步未完成：${r.error || r.reason || '请先确认账号已登录'}`);
  } else if (act === 'update') {
   showToast(payload?.enabled === false ? '已禁用该账号' : '已更新账号设置');
  } else if (act === 'delete') {
   showToast('已从本机账号池删除该账号');
  }
  await refreshMuseAccountPool(true);
 } catch (err) {
  showToast(err.message || '账号操作失败');
 } finally {
  m.accBusyId = '';
  render(true);
 }
}

async function handleProbeMuseService() {
 const m = appState.muse;
 if (m.probing) return;
 m.probing = true;
 m.statusMsg = '正在检查本机 Muse 端口、模型列表与账号状态（仅只读探测，不消耗额度）…';
 m.statusError = false;
 render(true);
 try {
  const res = await probeMuseService(m.config, m.apiKey, { staticHost: m.staticHost });
  m.reachable = Boolean(res.reachable);
  m.models = Array.isArray(res.models) ? res.models : [];
  m.accountCount = res.accountCount ?? null;
  m.accountsKnown = Boolean(res.accountsKnown);
  m.accountSummary = Array.isArray(res.accountSummary) ? res.accountSummary : [];
  m.hasLocalInstall = Boolean(res.hasLocalInstall);
  if (res.poolAdminUrl) m.poolAdminUrl = res.poolAdminUrl;
  m.statusMsg = res.note || '已读取 Muse 服务状态。';
  m.statusError = !res.reachable;
  if (!m.staticHost && m.reachable) {
   refreshMuseAccountPool(true);
   refreshMuseProtocolNet(false);
  }
  persistAppPrefs();
 } catch (err) {
  m.reachable = false;
  m.statusMsg = err.message || '探测 Muse 服务失败。';
  m.statusError = true;
 } finally {
  m.probing = false;
  render(true);
 }
}

function mergeServerMuseRecords(serverRecords) {
 const m = appState.muse;
 let changed = false;
 for (const rec of serverRecords || []) {
  if (!rec?.id) continue;
  const existing = m.jobs.find((j) => j.id === rec.id);
  if (existing) {
   if (rec.status === 'completed' && existing.status !== 'completed') {
    existing.status = 'completed';
    if (rec.videoUrl) existing.videoUrl = rec.videoUrl;
    if (rec.notice) existing.notice = rec.notice;
    existing.error = '';
    changed = true;
   } else if (rec.videoUrl && !existing.videoUrl) {
    existing.videoUrl = rec.videoUrl;
    changed = true;
   }
  } else {
   m.jobs.push({
    id: rec.id,
    cancelKey: '',
    model: rec.model || 'muse-video-协议',
    endpoint: rec.endpoint || '',
    useProxy: true,
    prompt: rec.prompt || '本机已生成 Muse 视频',
    size: 'MP4',
    seconds: Math.max(0, Math.round(Number(rec.elapsedSec || 0))),
    status: rec.status || 'completed',
    notice: rec.notice || '已从本机 Muse 记录自动同步成片',
    error: rec.error || '',
    videoUrl: isPlayableVideoUrl(rec.videoUrl) ? rec.videoUrl : '',
    createdAt: rec.ts ? (Date.parse(rec.ts.replace(' ', 'T')) || Date.now()) : Date.now()
   });
   changed = true;
  }
 }
 m.jobs = m.jobs.slice(0, 30);
 const curActive = m.jobs.find((j) => j.id === m.activeJobId);
 if (!curActive?.videoUrl) {
  const firstDone = m.jobs.find((j) => j.status === 'completed' && isPlayableVideoUrl(j.videoUrl));
  if (firstDone && firstDone.id !== m.activeJobId) {
   m.activeJobId = firstDone.id;
   changed = true;
  }
 }
 if (changed) persistAppPrefs();
 return changed;
}

async function refreshMuseServerRecords(silent = false) {
 const m = appState.muse;
 if (m.staticHost) return;
 try {
  const res = await fetchMuseRecords(m.config, m.apiKey, { staticHost: m.staticHost });
  const list = Array.isArray(res?.records) ? res.records : [];
  const changed = mergeServerMuseRecords(list);
  if (changed) render(true);
  if (!silent) {
   const doneCount = list.filter((x) => x.status === 'completed' && x.videoUrl).length;
   showToast(doneCount ? `已从本机 Muse 同步 ${doneCount} 条已生成视频` : '本机暂无新的已完成视频记录');
  }
 } catch (err) {
  if (!silent) showToast(err.message || '同步本机 Muse 生成记录失败');
 }
}

const musePollTimers = new Map();

function scheduleMusePoll(jobId) {
 if (musePollTimers.has(jobId)) return;
 const timer = setInterval(async () => {
  const job = appState.muse.jobs.find((j) => j.id === jobId);
  if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) {
   clearInterval(timer);
   musePollTimers.delete(jobId);
   return;
  }
  try {
   const pollCfg = job.endpoint
    ? { ...appState.muse.config, baseUrl: job.endpoint, channel: job.endpoint.includes(':18610') ? 'pool' : job.endpoint.includes(':18611') ? 'protocol' : appState.muse.config.channel }
    : appState.muse.config;
   const state = await pollMuseVideoTask(
    pollCfg,
    appState.muse.apiKey,
    job.id,
    { staticHost: appState.muse.staticHost, useProxy: job.useProxy }
   );
   const prevStatus = job.status;
   job.status = state.status || 'pending';
   if (state.notice) {
    job.notice = state.notice;
   } else if (job.status === 'processing' || job.status === 'pending' || job.status === 'queued') {
    const waited = Math.max(0, Math.round((Date.now() - Number(job.createdAt || Date.now())) / 1000));
    job.notice = `Muse 正在生成视频中（已等待 ${waited}s，通常需 60–180s；若网页端已出片可点右上「同步本机已出成片」）…`;
   }
   if (state.error) job.error = state.error;
   if (state.playableUrl) job.videoUrl = state.playableUrl;
   if (['completed', 'failed', 'cancelled'].includes(job.status)) {
    clearInterval(timer);
    musePollTimers.delete(jobId);
    if (job.status === 'completed') {
     appState.muse.activeJobId = job.id;
     showToast('Muse 视频生成完成，可在右侧直接播放与下载');
    } else if (job.status === 'failed') {
     showToast(`Muse 任务失败：${job.error || '请查看原因'}`);
    }
   }
   if (prevStatus !== job.status || job.status === 'processing' || job.status === 'completed') {
    persistAppPrefs();
   }
   render(true);
  } catch (err) {
   job.notice = `轮询等待中：${err.message}`;
   render(true);
  }
 }, 3000);
 musePollTimers.set(jobId, timer);
}

async function handleSubmitMuseVideo() {
 const m = appState.muse;
 if (m.submitting) return;
 if (!String(m.prompt || '').trim()) {
  showToast('请先输入视频生成提示词，或从现有草稿导入');
  document.getElementById('musePromptInput')?.focus();
  return;
 }
 if (m.mode === 'frames' && !m.firstFrame && !m.lastFrame) {
  showToast('首尾帧模式请至少上传一张首帧图片');
  return;
 }
 if (m.mode === 'reference' && !m.refImages.length) {
  showToast('参考图模式请至少选择一张参考图片');
  return;
 }

 m.submitting = true;
 m.statusError = false;
 render(true);
 try {
  const created = await submitMuseVideoTask(m.config, m.apiKey, {
   prompt: m.prompt,
   seconds: m.seconds,
   ratio: m.ratio,
   resolution: m.resolution,
   generateAudio: m.generateAudio,
   watermark: m.watermark,
   mode: m.mode,
   firstFrame: m.firstFrame,
   lastFrame: m.lastFrame,
   refImages: m.refImages
  }, { staticHost: m.staticHost });

  const job = {
   id: created.id,
   cancelKey: created.cancelKey,
   model: created.model,
   endpoint: created.endpoint,
   useProxy: created.useProxy,
   prompt: m.prompt.trim(),
   size: created.size,
   seconds: created.seconds,
   status: 'pending',
   notice: '已提交至 Muse，正在排队 / 生成中（一般需 1–3 分钟）…',
   error: '',
   videoUrl: '',
   createdAt: Date.now()
  };
  m.jobs.unshift(job);
  m.activeJobId = job.id;
  persistAppPrefs();
  scheduleMusePoll(job.id);
  showToast(`已提交视频任务 ${job.id}`);
 } catch (err) {
  m.statusMsg = err.message || '提交视频生成任务失败。';
  m.statusError = true;
  showToast(m.statusMsg);
 } finally {
  m.submitting = false;
  render(true);
 }
}

function renderMuseAccountCard(m, adminHref) {
 const st = m.accountStats || {};
 const net = m.netCheck;
 const netTone = !net ? 'idle' : net.ok ? 'ok' : 'err';
 const netText = m.netCheckLoading
  ? '正在检测 muse.ai 与 hatch.metaaivm.com 连通性…'
  : !net
   ? '尚未执行新接口网络连通性检测'
   : net.ok
    ? `新接口网络正常：可连通 muse.ai 与 hatch.metaaivm.com（经 ${esc(net.route || '直连')}）`
    : `新接口网络异常：${esc(net.message || '无法连接 muse.ai，请确认本机代理已开启')}`;

 if (m.staticHost) {
  return `
   <section class="ai-card muse-acc-section">
    <div class="ai-card-head">
     <div class="ai-card-title">${uiIcon('character-ref')}<span>本机 Muse 账号配置与账号池（内置管理）</span></div>
     <span class="ai-pill idle">需本地工作台</span>
    </div>
    <div class="modal-alert info" style="margin-bottom:0;">
     内置 Muse 账号添加与 Cookie 管理需要读取本机 <code>E:\\MuseCanvasData</code> 螺旋池进程（18610）。请双击运行项目根目录 <b>启动镜序2.0与Muse.bat</b> 打开 <code>http://127.0.0.1:4174/</code>，即可直接在镜序页面内弹窗或粘贴 Cookie 添加账号。
    </div>
   </section>`;
 }

 return `
  <section class="ai-card muse-acc-section">
   <div class="ai-card-head">
    <div class="ai-card-title">${uiIcon('character-ref')}<span>本机 Muse 账号配置与账号池（内置管理）</span></div>
    <div style="display:flex;gap:6px;align-items:center;">
     <span class="ai-pill ${m.accounts.length ? 'ok' : 'idle'}">已配置 ${m.accounts.length} · 可用 ${st.healthy ?? 0}</span>
     <button type="button" class="btn btn-sm" data-action="muse-refresh-accounts"${m.accountsLoading ? ' disabled' : ''}>${uiIcon('redo')}<span>${m.accountsLoading ? '刷新中…' : '刷新列表'}</span></button>
    </div>
   </div>

   <div class="muse-net-strip ${netTone}">
    <span style="flex:1;min-width:180px;">${netText}</span>
    <button type="button" class="btn btn-sm" data-action="muse-netcheck"${m.netCheckLoading ? ' disabled' : ''}>${uiIcon('check')}<span>${m.netCheckLoading ? '检测中…' : '重新检测网络'}</span></button>
   </div>

   <div class="muse-add-box">
    <div style="font-size:12px;font-weight:700;color:var(--text-main);">方式 A（推荐）：在镜序内一键弹出独立登录窗口</div>
    <div style="font-size:11.5px;color:var(--text-muted);line-height:1.55;">
     原理：本地螺旋池开启一个全新干净的 Chrome 窗口供你正常登录 <code>muse.ai</code>，登录成功后自动抓取 <code>hatch_sess</code> 与 <code>hatch_vml</code> 会话凭证存入 <code>E:\\MuseCanvasData\\pool\\data\\accounts.json</code> 并自动关窗，无需把账号密码给第三方。
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px;">
     <input id="museLoginLabelInput" class="input" style="flex:1;min-width:140px;" data-muse-acc-input="loginLabelInput" value="${esc(m.loginLabelInput)}" placeholder="账号备注名称（选填，如 小号1）" />
     <button type="button" class="btn btn-sm muse-btn-green" data-action="muse-open-login-window"${m.loginWindowBusy ? ' disabled' : ''}>
      ${uiIcon('plus')}
      <span>${m.loginWindowBusy ? '等待弹窗完成登录…' : '添加 Muse 账号（弹出登录窗口）'}</span>
     </button>
    </div>
    ${m.loginStatusMsg ? `<div class="modal-alert ${m.loginStatusTone === 'error' ? 'error' : m.loginStatusTone === 'warn' ? 'warn' : 'info'}" style="margin:6px 0 0;">${esc(m.loginStatusMsg)}</div>` : ''}
   </div>

   <details class="muse-cookie-details"${m.cookieBoxOpen ? ' open' : ''}>
    <summary data-action="muse-toggle-cookie-box">方式 B（弹窗慢或未弹出时的快捷兜底）：在自己浏览器登录 muse.ai 后粘贴 Cookie 导入</summary>
    <div style="padding-top:10px;display:flex;flex-direction:column;gap:8px;">
     <div class="ai-help-note">
      <b>取 Cookie 步骤（10 秒完成，避免弹窗等待）：</b><br/>
      1. 在你平常能上网的浏览器打开并登录 <code>https://muse.ai/</code>；<br/>
      2. 按 <code>F12</code> 打开开发者工具 → 切到 <b>网络 (Network)</b> → 按 <code>F5</code> 刷新；<br/>
      3. 点击列表任意一条 <code>muse.ai</code> 请求 → 右侧 <b>标头 (Headers) → 请求标头 (Request Headers)</b>；<br/>
      4. 找到 <code>cookie:</code> 一行，复制冒号后面的整串内容（必须包含 <code>hatch_sess=</code> 和 <code>hatch_vml=</code>，支持多行批量：<code>标签 | cookie串</code>）。
     </div>
     <div class="field-grid">
      <div class="field" style="grid-column:1 / -1;">
       <label>账号标签（单条导入选填，批量每行用「标签 | cookie」格式）</label>
       <input id="museCookieLabelInput" class="input" data-muse-acc-input="cookieLabelInput" value="${esc(m.cookieLabelInput)}" placeholder="如：muse-主号" />
      </div>
      <div class="field" style="grid-column:1 / -1;">
       <label>Cookie 字符串</label>
       <textarea id="museCookieTextarea" class="textarea" rows="3" data-muse-acc-input="cookieInput" placeholder="粘贴 hatch_sess=...; hatch_vml=...（不会写入工程存档或导出文件）">${esc(m.cookieInput)}</textarea>
      </div>
     </div>
     <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <button type="button" class="btn btn-sm btn-jy" data-action="muse-import-cookie"${m.cookieImporting ? ' disabled' : ''}>${uiIcon('import')}<span>${m.cookieImporting ? '正在导入…' : '导入 Cookie 到本机账号池'}</span></button>
      <a class="btn btn-sm" href="${esc(adminHref)}" target="_blank" rel="noopener noreferrer">${uiIcon('link')}<span>备选：打开原螺旋池网页端</span></a>
     </div>
     ${m.cookieStatusMsg ? `<div class="modal-alert ${m.cookieStatusError ? 'error' : 'info'}" style="margin-bottom:0;">${esc(m.cookieStatusMsg)}</div>` : ''}
    </div>
   </details>

   ${m.accountsError ? `<div class="modal-alert error" style="margin-bottom:0;">${esc(m.accountsError)}</div>` : ''}

   <div class="muse-acc-list">
    ${m.accounts.length ? m.accounts.map((acc) => {
     const busy = m.accBusyId === acc.id;
     const exp = formatMuseExpiry(acc.expires_at, acc.expires_estimated);
     const statusPillCls = !acc.enabled ? 'idle' : acc.ok === true ? 'ok' : acc.ok === false ? 'err' : 'warm';
     const statusLabel = !acc.enabled ? '已禁用' : acc.ok === true ? '可用' : acc.ok === false ? '异常' : '未检测';
     const whoName = acc.identity?.name || acc.identity?.email || '已采集本地会话';
     const quotaTxt = acc.quota?.found
      ? `${acc.quota.plan || 'Muse'} · 周已用 ${acc.quota.weekly_used_pct ?? '?'}%`
      : '未查额度';
     return `
      <div class="muse-acc-item ${!acc.enabled ? 'disabled' : ''}">
       <div class="ai-card-head" style="gap:8px;flex-wrap:wrap;">
        <div style="min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
         <strong style="font-size:12.5px;color:var(--text-main);">${esc(acc.label)}</strong>
         <span style="font-size:11px;color:var(--text-muted);">${esc(whoName)}</span>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
         ${acc.old_ok !== null ? `<span class="ai-pill ${acc.old_ok ? 'ok' : 'err'}">老接口 ${acc.old_ok ? '通' : '断'}</span>` : ''}
         ${acc.new_ok !== null ? `<span class="ai-pill ${acc.new_ok ? 'ok' : 'warm'}" title="${esc(acc.proto_reason || '')}">新接口 ${acc.new_ok ? '通' : '待同步'}</span>` : ''}
         <span class="ai-pill ${statusPillCls}">${statusLabel}</span>
        </div>
       </div>
       <div class="muse-acc-meta">
        <span title="${esc(exp.title)}">有效期：<b class="muse-tone-${exp.level}">${esc(exp.text)}</b></span>
        <span>Cookie：${acc.cookie_count || 0} 条</span>
        <span>调用：${acc.use_count || 0} 次</span>
        <span>额度：${esc(quotaTxt)}</span>
       </div>
       ${!acc.essential_ok ? '<div style="font-size:11px;color:#fda4af;margin-top:4px;">缺少核心 Cookie（hatch_sess / hatch_vml），请点重新登录或更新 Cookie。</div>' : ''}
       ${acc.last_fail_error ? `<div style="font-size:11px;color:#fda4af;margin-top:4px;">最近失败：${esc(acc.last_fail_error)}</div>` : ''}
       <div class="ai-btn-row" style="margin-top:7px;">
        <button type="button" class="btn btn-sm" data-muse-acc-id="${esc(acc.id)}" data-muse-acc-act="test"${busy ? ' disabled' : ''}>校验测试</button>
        <button type="button" class="btn btn-sm" data-muse-acc-id="${esc(acc.id)}" data-muse-acc-act="sync-protocol"${busy ? ' disabled' : ''}>同步新接口</button>
        <button type="button" class="btn btn-sm" data-muse-acc-id="${esc(acc.id)}" data-muse-acc-act="quota"${busy ? ' disabled' : ''}>查额度</button>
        <button type="button" class="btn btn-sm" data-muse-acc-id="${esc(acc.id)}" data-muse-acc-act="keepalive"${busy ? ' disabled' : ''}>会话保活</button>
        <button type="button" class="btn btn-sm" data-muse-acc-id="${esc(acc.id)}" data-muse-acc-act="relogin"${busy || m.loginWindowBusy ? ' disabled' : ''}>重新登录</button>
        <button type="button" class="btn btn-sm" data-muse-acc-id="${esc(acc.id)}" data-muse-acc-act="toggle" data-muse-acc-next="${acc.enabled ? '0' : '1'}"${busy ? ' disabled' : ''}>${acc.enabled ? '禁用' : '启用'}</button>
        <button type="button" class="btn btn-sm btn-danger" data-muse-acc-id="${esc(acc.id)}" data-muse-acc-act="delete" data-muse-acc-label="${esc(acc.label)}"${busy ? ' disabled' : ''}>删除</button>
       </div>
      </div>`;
    }).join('') : `
     <div style="padding:14px;border:1px dashed var(--border);border-radius:8px;text-align:center;font-size:12px;color:var(--text-muted);background:#101014;">
      当前本机账号池共有 <b>0</b> 个账号。请直接在上方点绿色按钮弹窗登录，或展开「方式 B」粘贴 Cookie 添加你的 Muse 账号。
     </div>`}
   </div>
  </section>`;
}

function renderHomeMuseVideoStudio() {
 const m = appState.muse;
 const cfg = m.config;
 const sources = museAvailableDrafts();
 const pickedSource = sources.find((x) => x.id === m.sourceDraftId) || sources[0];
 const pickedShots = pickedSource?.proj?.tracks?.video || [];
 const allModels = [...new Set([...MUSE_VIDEO_MODELS.map(([id]) => id), ...(m.models || [])])];
 const calcSize = computeVideoSize(m.ratio, m.resolution);
 const activeJob = m.jobs.find((j) => j.id === m.activeJobId) || m.jobs[0] || null;
 const adminHref = isPlayableVideoUrl(m.poolAdminUrl) ? m.poolAdminUrl : 'http://127.0.0.1:18610/admin';

 return `
  <div class="home-ai-header">
   <div>
    <div style="display:inline-flex;align-items:center;gap:8px;font-size:16px;font-weight:800;">
     ${uiIcon('video-studio', 'title-svg')}
     <span>镜序 2.0 · AI 生成视频（内置 Muse 视频引擎）</span>
     <span class="ai-pill ${m.reachable ? (m.accountCount > 0 ? 'ok' : 'warm') : 'idle'}">${esc(museConnBadgeText())}</span>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">参考 MuseCanvas 架构接入本机螺旋池（18610）/ 新接口直连（18611）与自定义兼容网关；支持从 2.0 草稿或分镜一键导入提示词与首尾帧出片。</div>
   </div>
   <div style="display:flex;gap:7px;flex-wrap:wrap;">
    <button type="button" class="btn btn-sm" data-action="muse-open-guide">${uiIcon('script-text')}<span>安装与登录教程</span></button>
    <button type="button" class="btn btn-sm" data-home-tab="home">${uiIcon('home')}<span>返回首页草稿</span></button>
   </div>
  </div>

  <div class="home-ai-layout">
   <div class="home-ai-col">
    <section class="ai-card">
     <div class="ai-card-head">
      <div class="ai-card-title">${uiIcon('key')}<span>Muse 服务通道与账号 / API 预留配置</span></div>
      <span class="ai-pill ${m.reachable ? 'ok' : 'idle'}">${m.reachable ? '端口可达' : '未验证'}</span>
     </div>
     <div class="field-grid">
      <div class="field full">
       <label for="museChannelSelect">接入通道（对应 MuseCanvas 老接口 / 新接口 / 自定义 API）</label>
       <select id="museChannelSelect" class="select" data-muse-cfg="channel">
        ${MUSE_CHANNELS.map((ch) => `<option value="${esc(ch.id)}"${ch.id === cfg.channel ? ' selected' : ''}>${esc(ch.label)}</option>`).join('')}
       </select>
      </div>
      <div class="field">
       <label for="museBaseUrlInput">接口地址 (Base URL)</label>
       <input id="museBaseUrlInput" class="input" data-muse-cfg="baseUrl" value="${esc(cfg.baseUrl)}" placeholder="http://127.0.0.1:18611/v1" autocomplete="off" spellcheck="false" />
      </div>
      <div class="field">
       <label for="museModelInput">视频生成模型</label>
       <input id="museModelInput" class="input" list="museModelList" data-muse-cfg="model" value="${esc(cfg.model)}" placeholder="muse-video" autocomplete="off" spellcheck="false" />
       <datalist id="museModelList">
        ${allModels.map((id) => `<option value="${esc(id)}"></option>`).join('')}
       </datalist>
      </div>
      <div class="field">
       <label for="museAccountLabelInput">预留 Muse 账号标识 / 备注</label>
       <input id="museAccountLabelInput" class="input" data-muse-cfg="accountLabel" value="${esc(cfg.accountLabel)}" placeholder="如：个人 Muse 主号（账号需在本机池自行登录）" />
      </div>
      <div class="field">
       <label for="museApiKeyInput">API Key / 螺旋池密钥（选填）</label>
       <div class="ai-key-row">
        <input id="museApiKeyInput" class="input" type="${m.showKey ? 'text' : 'password'}" data-muse-api-key="1" value="${esc(m.apiKey)}" placeholder="${cfg.useLocalKey && !m.staticHost ? '留空自动读本机密钥' : '粘贴 API Key / Pool Key'}" autocomplete="off" spellcheck="false" />
        <button type="button" class="btn btn-sm" data-action="muse-toggle-key-vis">${uiIcon(m.showKey ? 'eye-off' : 'eye')}</button>
       </div>
      </div>
     </div>
     <div class="ai-check-pills" style="margin-top:2px;">
      <label class="ai-check-pill ${cfg.useLocalKey ? 'on' : ''}"><input type="checkbox" data-muse-bool="useLocalKey"${cfg.useLocalKey ? ' checked' : ''} /><span>本地模式优先读取 E:\\MuseCanvasData\\install.json 密钥（不下发前端）</span></label>
     </div>
     <div class="ai-btn-row">
      <button type="button" class="btn btn-sm btn-jy" data-action="muse-probe"${m.probing ? ' disabled' : ''}>${uiIcon('check')}<span>${m.probing ? '正在探测服务…' : '检测连接、模型与账号数'}</span></button>
     </div>
     ${m.accountsKnown ? `
      <div class="ai-summary-strip">
       <span><b>账号池实况：</b>${m.accountCount > 0 ? `已登录 ${m.accountCount} 个账号` : '当前为 0 个已登录账号（可在下方直接添加你的 Muse 账号）'}</span>
       ${m.accountSummary.map((a) => `<span class="ai-summary-chip">${esc(a.label)} · ${esc(a.status)}</span>`).join('')}
      </div>` : ''}
     ${m.statusMsg ? `<div class="modal-alert ${m.statusError ? 'error' : 'info'}" style="margin-bottom:0;">${esc(m.statusMsg)}</div>` : ''}
    </section>

    ${renderMuseAccountCard(m, adminHref)}

    <section class="ai-card">
     <div class="ai-card-head">
      <div class="ai-card-title">${uiIcon('storyboard-track')}<span>视频提示词、草稿导入与生成参数</span></div>
      <span class="ai-pill idle">目标像素 ${esc(calcSize)} · ${clampMuseSeconds(m.seconds, cfg.model)}s</span>
     </div>

     <div class="ai-sub-block" style="border-top:none;padding-top:0;">
      <div class="ai-sub-label">从镜序 2.0 草稿带入分镜提示词（可选）</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
       <select class="select" style="flex:1;min-width:140px;" data-muse-src="draft">
        ${sources.length ? sources.map((s) => `<option value="${esc(s.id)}"${s.id === m.sourceDraftId ? ' selected' : ''}>${esc(s.label)}</option>`).join('') : '<option value="">当前无已保存片段草稿</option>'}
       </select>
       <select class="select" style="flex:1;min-width:120px;" data-muse-src="shot"${pickedShots.length ? '' : ' disabled'}>
        <option value="-1"${m.sourceShotIdx < 0 ? ' selected' : ''}>整部草稿精简编导提示词</option>
        ${pickedShots.map((sh, i) => `<option value="${i}"${i === m.sourceShotIdx ? ' selected' : ''}>第 ${i + 1} 镜 · ${esc(sh.title)} (${sh.duration}s)</option>`).join('')}
       </select>
       <button type="button" class="btn btn-sm" data-action="muse-load-draft"${sources.length ? '' : ' disabled'}>一键导入提示词</button>
      </div>
     </div>

     <div class="field">
      <label for="musePromptInput">视频生成提示词</label>
      <textarea id="musePromptInput" class="textarea" rows="4" data-muse-field="prompt" placeholder="描述主体动作、镜头运镜、光影氛围与台词声音；或点击上方一键从 2.0 分镜草稿带入…">${esc(m.prompt)}</textarea>
     </div>

     <div class="field-grid">
      <div class="field">
       <label>生成方式</label>
       <select class="select" data-muse-field="mode">
        ${MUSE_MODES.map(([id, lb]) => `<option value="${esc(id)}"${id === m.mode ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
       </select>
      </div>
      <div class="field">
       <label>画幅比例</label>
       <select class="select" data-muse-field="ratio">
        ${MUSE_RATIOS.map(([id, lb]) => `<option value="${esc(id)}"${id === m.ratio ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
       </select>
      </div>
      <div class="field">
       <label>输出分辨率</label>
       <select class="select" data-muse-field="resolution">
        ${MUSE_RESOLUTIONS.map(([id, lb]) => `<option value="${esc(id)}"${id === m.resolution ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
       </select>
      </div>
      <div class="field">
       <label>单段时长 (Muse 建议 5–10 秒)</label>
       <input type="number" min="3" max="30" step="1" class="input" data-muse-num="seconds" value="${m.seconds}" />
      </div>
     </div>

     ${m.mode === 'frames' ? `
      <div class="field-grid" style="padding:8px;background:#111115;border:1px solid var(--border);border-radius:6px;">
       <div class="field">
        <label>首帧图片 (first_frame)</label>
        <input id="museFirstFrameInput" type="file" accept="image/*" class="input" />
        ${m.firstFrame ? `<div class="ref-thumb-row"><img class="ref-thumb-img" src="${esc(m.firstFrame)}" alt="首帧" /><button type="button" class="btn btn-sm btn-danger" data-action="muse-clear-first">移除</button></div>` : ''}
       </div>
       <div class="field">
        <label>尾帧图片 (last_frame · 选填)</label>
        <input id="museLastFrameInput" type="file" accept="image/*" class="input" />
        ${m.lastFrame ? `<div class="ref-thumb-row"><img class="ref-thumb-img" src="${esc(m.lastFrame)}" alt="尾帧" /><button type="button" class="btn btn-sm btn-danger" data-action="muse-clear-last">移除</button></div>` : ''}
       </div>
      </div>` : m.mode === 'reference' ? `
      <div class="field" style="padding:8px;background:#111115;border:1px solid var(--border);border-radius:6px;">
       <label>参考图片 (image[] 可多选)</label>
       <input id="museRefImagesInput" type="file" accept="image/*" multiple class="input" />
       ${m.refImages.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">${m.refImages.map((u, idx) => `<img class="ref-thumb-img" src="${esc(u)}" alt="参考${idx + 1}" />`).join('')}<button type="button" class="btn btn-sm btn-danger" data-action="muse-clear-refs">清空参考图</button></div>` : ''}
      </div>` : ''}

     <div class="ai-check-pills">
      <label class="ai-check-pill ${m.generateAudio ? 'on' : ''}"><input type="checkbox" data-muse-opt-bool="generateAudio"${m.generateAudio ? ' checked' : ''} /><span>同时生成原声音频 (generate_audio)</span></label>
      <label class="ai-check-pill ${m.watermark ? 'on' : ''}"><input type="checkbox" data-muse-opt-bool="watermark"${m.watermark ? ' checked' : ''} /><span>保留平台水印 (watermark)</span></label>
     </div>

     <div class="ai-btn-row" style="margin-top:6px;">
      <button type="button" class="btn btn-compile-hero" style="flex:1;justify-content:center;" data-action="muse-submit"${m.submitting ? ' disabled' : ''}>
       ${uiIcon('video-studio')}
       <span>${m.submitting ? '正在提交任务至 Muse…' : `提交 Muse 生成视频 (${esc(cfg.model)} · ${esc(calcSize)})`}</span>
      </button>
     </div>
    </section>
   </div>

   <div class="home-ai-col">
    <section class="ai-card">
     <div class="ai-card-head">
      <div class="ai-card-title">${uiIcon('play')}<span>视频成片预览与下载</span></div>
      <div style="display:flex;gap:6px;align-items:center;">
       <span class="ai-pill idle">任务列表 (${m.jobs.length})</span>
       ${!m.staticHost ? `<button type="button" class="btn btn-sm" data-action="muse-refresh-records">${uiIcon('redo')}<span>同步本机已出成片</span></button>` : ''}
      </div>
     </div>
     ${activeJob && activeJob.videoUrl && isPlayableVideoUrl(activeJob.videoUrl) ? `
      <div class="muse-player-wrap">
       <video controls playsinline preload="metadata" src="${esc(activeJob.videoUrl)}" class="muse-video-player"></video>
       <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">
        <span style="font-size:11.5px;color:var(--text-muted);">${esc(activeJob.model)} · ${esc(activeJob.size)} · ${activeJob.seconds}s</span>
        <a class="btn btn-sm btn-jy" href="${esc(activeJob.videoUrl)}" download="muse_${esc(activeJob.id)}.mp4">${uiIcon('export')}<span>下载 .mp4 成片</span></a>
       </div>
      </div>` : `
      <div class="muse-player-empty">
       ${uiIcon('video-studio', 'title-svg')}
       <div style="font-weight:700;font-size:13px;margin-top:6px;">生成的 MP4 成片将在此直接预览</div>
       <div style="font-size:11.5px;color:var(--text-dim);margin-top:4px;max-width:340px;">先在左侧检测 Muse 服务并确认账号池已完成登录，点击「提交 Muse 生成视频」后系统将自动轮询进度。</div>
      </div>`}

     ${m.jobs.length ? `
      <div class="muse-job-list">
       ${m.jobs.map((job) => {
        const badgeCls = job.status === 'completed' ? 'ok' : job.status === 'failed' || job.status === 'cancelled' ? 'err' : 'warm';
        const statusTxt = job.status === 'completed' ? '已成片' : job.status === 'failed' ? '失败' : job.status === 'cancelled' ? '已取消' : '生成中…';
        return `
         <div class="muse-job-card ${job.id === m.activeJobId ? 'active' : ''}">
          <div class="ai-card-head">
           <strong style="font-size:12px;">${esc(job.model)} · ${esc(job.size)} · ${job.seconds}s</strong>
           <span class="ai-pill ${badgeCls}">${statusTxt}</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin:4px 0;word-break:break-all;">任务 ID：${esc(job.id)}</div>
          <div style="font-size:11.5px;color:var(--text-main);">${esc(job.prompt.slice(0, 140))}${job.prompt.length > 140 ? '…' : ''}</div>
          ${job.error ? `<div style="font-size:11px;color:#fda4af;margin-top:4px;">失败原因：${esc(job.error)}</div>` : job.notice ? `<div style="font-size:11px;color:var(--text-dim);margin-top:4px;">${esc(job.notice)}</div>` : ''}
          <div class="ai-btn-row" style="margin-top:7px;">
           ${job.videoUrl ? `<button type="button" class="btn btn-sm btn-jy" data-muse-select-job="${esc(job.id)}">在播放器预览</button>` : ''}
           ${!['completed', 'cancelled'].includes(job.status) ? `<button type="button" class="btn btn-sm" data-muse-recover-job="${esc(job.id)}">回原对话取回</button>` : ''}
           ${!['completed', 'failed', 'cancelled'].includes(job.status) ? `<button type="button" class="btn btn-sm btn-danger" data-muse-cancel-job="${esc(job.id)}">停止任务</button>` : ''}
           <button type="button" class="btn btn-sm" data-muse-del-job="${esc(job.id)}">移除</button>
          </div>
         </div>`;
       }).join('')}
      </div>` : ''}

     <div class="ai-sub-block" style="margin-top:8px;">
      <div class="ai-sub-label">手动导入成片视频链接预览（可选）</div>
      <div style="display:flex;gap:6px;">
       <input id="museManualUrlInput" class="input" data-muse-manual-url="1" value="${esc(m.manualUrlInput)}" placeholder="粘贴 http(s)://...mp4 或 /api/muse/... 视频地址直接预览" />
       <button type="button" class="btn btn-sm" data-action="muse-add-manual-video">加载预览</button>
      </div>
     </div>
    </section>
   </div>
  </div>`;
}

function renderHomeScreen() {
 const q = appState.draftFilter.trim().toLowerCase();
 const visibleDrafts = (appState.drafts || []).filter((d) => !q || String(d.title || '').toLowerCase().includes(q));

 let mainHtml = '';
 if (appState.homeTab === 'home') {
  mainHtml = `
   <div class="home-hero-create" data-action="new-blank-enter" role="button" tabindex="0">
    <div class="hero-create-btn">
     <span class="hero-plus-circle">${uiIcon('plus', 'hero-plus-svg')}</span>
     <span>开始创作</span>
    </div>
   </div>

   <section class="drafts-section">
    <div class="drafts-toolbar">
     <div class="drafts-title">本地草稿 <span style="color:var(--text-dim);font-weight:500;font-size:12px;">(${visibleDrafts.length})</span></div>
     <div class="drafts-actions">
      <div class="search-field-wrap" style="width:182px;">
       ${uiIcon('search', 'search-svg')}
       <input id="draftSearchInput" class="input" placeholder="搜索本地草稿…" value="${esc(appState.draftFilter)}" />
      </div>
      <button class="btn btn-sm" data-action="open-import">${uiIcon('import')}<span>导入 1.0 / 2.0 工程</span></button>
      <button class="btn btn-sm" data-action="load-demo-enter">${uiIcon('sample-draft')}<span>体验雨夜 5 轨示范</span></button>
     </div>
    </div>

    ${visibleDrafts.length ? `
     <div class="drafts-grid">
      ${visibleDrafts.map(renderDraftCard).join('')}
     </div>` : `
     <div style="padding:36px 20px;border:1px dashed var(--border);border-radius:10px;text-align:center;color:var(--text-muted);background:#141416;">
      <div style="font-size:14px;font-weight:600;color:var(--text-main);margin-bottom:6px;">本地草稿箱暂无工程</div>
      <div style="font-size:12px;margin-bottom:14px;">点击上方「+ 开始创作」直接进入 00:00 空白多轨剪辑台，或从广场选用多轨模板 / 导入 1.0 工程。</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
       <button class="btn btn-jy" data-action="new-blank-enter">${uiIcon('plus')}<span>立即从 00:00 开始创作</span></button>
       <button class="btn" data-action="load-demo-enter">${uiIcon('sample-draft')}<span>加载 5 轨示例预览</span></button>
      </div>
     </div>`}
    ${renderTrashSection()}
   </section>`;
 } else if (appState.homeTab === 'ai') {
  mainHtml = renderHomeAIStudio();
 } else if (appState.homeTab === 'video') {
  mainHtml = renderHomeMuseVideoStudio();
 } else if (appState.homeTab === 'square') {
  mainHtml = `
   <div style="display:flex;justify-content:space-between;align-items:center;">
    <div>
     <div style="display:inline-flex;align-items:center;gap:7px;font-size:16px;font-weight:800;">${uiIcon('template', 'title-svg')}<span>剪辑广场 · 多轨模板库</span></div>
     <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">点击任意模板即刻复制到本地草稿并进入五轨工作台（100% 本地开箱即用，无需 AI）</div>
    </div>
   </div>
   <div class="square-grid">
    ${NLE_SQUARE_TEMPLATES.map((t) => `
     <div class="tpl-card">
      <div class="tpl-cover" style="background:${t.swatch};">
       <div style="display:flex;justify-content:space-between;font-size:11px;">
        <span class="draft-aspect-pill">${esc(t.aspect)}</span>
        <span style="background:rgba(0,0,0,0.45);padding:2px 6px;border-radius:4px;color:#fff;">${t.duration}s</span>
       </div>
       <div style="font-weight:800;font-size:14px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.8);">${esc(t.title)}</div>
      </div>
      <div class="tpl-body">
       <div style="font-size:11px;color:var(--jy-teal);font-weight:700;">${esc(t.badge)}</div>
       <div style="font-size:12px;color:var(--text-muted);flex:1 1 auto;">${esc(t.desc)}</div>
       <button class="btn btn-jy" data-use-template="${esc(t.id)}">${uiIcon('plus')}<span>使用模板开始剪辑</span></button>
      </div>
     </div>`).join('')}
   </div>`;
 } else {
  mainHtml = `
   <div>
    <div style="display:inline-flex;align-items:center;gap:7px;font-size:16px;font-weight:800;">${uiIcon('layers', 'title-svg')}<span>我的云空间（本地免登录 IndexedDB 档案库）</span></div>
    <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">当前版本专注于纯本地隐私安全：不设账号登录系统，所有草稿安全保存在浏览器 IndexedDB 与可导出的 JSON 文件中。</div>
   </div>
   <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">
    <div class="entity-item" style="padding:16px;">
     <div style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-bottom:6px;">${uiIcon('save', 'card-title-svg')}<span>本地持久化草稿 (${appState.drafts.length} 个)</span></div>
     <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">每次添加镜头、调节滑块与编辑文字均会在 160ms 内自动保存，刷新浏览器不丢失。</div>
     <button class="btn btn-sm btn-danger" data-action="confirm-clear-all">${uiIcon('delete')}<span>清空本地历史草稿</span></button>
    </div>
    <div class="entity-item" style="padding:16px;">
     <div style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-bottom:6px;">${uiIcon('import', 'card-title-svg')}<span>导入 1.0 / 2.0 工程档案</span></div>
     <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">支持拖入或粘贴镜序 1.0 (.jingxu.json) 与镜序 2.0 (.jingxu2.json)，自动转为五轨草稿。</div>
     <button class="btn btn-sm btn-jy" data-action="open-import">${uiIcon('import')}<span>导入工程文件</span></button>
    </div>
   </div>
   ${appState.drafts.length ? `
    <div style="font-size:13.5px;font-weight:700;margin-top:4px;">所有已保存工程 (${appState.drafts.length})</div>
    <div class="drafts-grid">${appState.drafts.map(renderDraftCard).join('')}</div>` : ''}
   ${renderTrashSection()}`;
 }

 return `
  <div class="jy-home">
   <aside class="home-sidebar">
    <div>
     <div class="home-brand">
      <div class="home-brand-icon">${uiIcon('storyboard-track', 'brand-svg')}</div>
      <div>镜序 <span style="color:var(--jy-teal);">2.0</span></div>
     </div>
     <nav class="home-nav">
      <button class="home-nav-btn ${appState.homeTab === 'home' ? 'active' : ''}" data-home-tab="home">${uiIcon('home')}<span>首页</span></button>
      <button class="home-nav-btn ${appState.homeTab === 'ai' ? 'active' : ''}" data-home-tab="ai">${uiIcon('ai-spark')}<span>AI 辅助生成</span>${isAIApiConfigured() ? '<span class="nav-dot-on" title="API 已配置"></span>' : ''}</button>
      <button class="home-nav-btn ${appState.homeTab === 'video' ? 'active' : ''}" data-home-tab="video">${uiIcon('video-studio')}<span>AI 生成视频</span>${appState.muse.reachable ? '<span class="nav-dot-on" title="Muse 服务在线"></span>' : ''}</button>
      <button class="home-nav-btn ${appState.homeTab === 'square' ? 'active' : ''}" data-home-tab="square">${uiIcon('gallery')}<span>广场</span></button>
      <button class="home-nav-btn ${appState.homeTab === 'cloud' ? 'active' : ''}" data-home-tab="cloud">${uiIcon('layers')}<span>我的云空间</span></button>
     </nav>
    </div>
    <div class="home-sidebar-foot">
     <div><span class="status-dot"></span><b>0 AI 依赖 · 内置 AI 与 Muse 视频</b></div>
     <div>免登录 · 数据本地自动存储</div>
    </div>
   </aside>
   <main class="home-main">${mainHtml}</main>
  </div>`;
}

/* =========================================================
   SCREEN 2: JIANYING-STYLE RESOURCE VISUAL GRID (Fig 1)
========================================================= */
function renderSwatchGrid(groupKey, activeId, mode, subHint) {
 const q = appState.resSearch.trim().toLowerCase();
 let opts = groupOptions(groupKey);
 if (groupKey === 'transition' && appState.resSubCat !== 'all' && TRANSITION_CATEGORIES.some((c) => c.id === appState.resSubCat)) {
  opts = opts.filter((o) => o.cat === appState.resSubCat);
 }
 if (q) {
  opts = opts.filter((o) => `${o.label} ${o.zh || ''} ${o.en || ''} ${o.id}`.toLowerCase().includes(q));
 }

 if (!opts.length) {
  return `<div style="color:var(--text-dim);padding:20px;text-align:center;">未找到匹配的方块条目</div>`;
 }

 return `
  ${subHint ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">${esc(subHint)}</div>` : ''}
  <div class="swatch-grid">
   ${opts.map((opt) => {
    const isActive = Array.isArray(activeId) ? activeId.includes(opt.id) : activeId === opt.id;
    return `
     <button class="swatch-card ${isActive ? 'active' : ''}" data-apply-group="${esc(groupKey)}" data-apply-id="${esc(opt.id)}" data-apply-mode="${esc(mode)}" title="${esc(opt.zh || opt.label)}">
      <div class="swatch-box">
       ${renderOptionSwatch(groupKey, opt)}
       <span class="swatch-apply-tag">${uiIcon(isActive ? 'check' : 'plus')}</span>
      </div>
      <div class="swatch-title">${esc(opt.label)}</div>
     </button>`;
   }).join('')}
  </div>`;
}

function renderResourceDock() {
 const p = appState.project;
 const selClip = selectedClipObj();
 const activeV = selClip && p.selected?.track === 'video'
  ? selClip
  : stateAtTime(p, p.playhead).video || p.tracks.video[0] || null;

 const tab = appState.resTab;
 let cats = [];
 let contentHtml = '';

 if (tab === 'media') {
  cats = [{ id: 'presets', label: '分镜积木' }, { id: 'import', label: '导入迁移' }];
  if (!cats.some((c) => c.id === appState.resSubCat)) appState.resSubCat = 'presets';
  contentHtml = appState.resSubCat === 'import' ? `
   <div style="padding:8px 0;">
    <div style="font-weight:700;margin-bottom:6px;">导入本地工程 (1.0 / 2.0)</div>
    <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px;">将旧版 1.0 (.jingxu.json) 或 2.0 工程直接导入为五轨时间轴。</p>
    <button class="btn btn-jy" data-action="open-import">选择 / 粘贴 JSON 工程</button>
   </div>` : `
   ${CLIP_PRESETS.filter((x) => !appState.resSearch || x.label.includes(appState.resSearch)).map((item) => `
    <div class="preset-card" data-preset-id="${esc(item.id)}">
     <div>
      <div class="preset-label">${esc(item.label)}</div>
      <div class="preset-sub">${esc(item.category)} · ${item.duration}s</div>
     </div>
     <span class="track-badge ${esc(item.track)}">${item.track === 'video' ? 'V1' : item.track === 'dialogue' ? 'T1' : item.track === 'audio' ? 'A1' : item.track === 'bgm' ? 'A2' : 'E1'} +</span>
    </div>`).join('')}`;
 } else if (tab === 'ai') {
  cats = [
   { id: 'compose', label: 'AI 生成' },
   { id: 'preselect', label: '提前预选' },
   { id: 'api', label: 'API 配置' }
  ];
  if (!cats.some((c) => c.id === appState.resSubCat)) appState.resSubCat = 'compose';
  contentHtml = appState.resSubCat === 'api'
   ? renderAIApiPanel(true)
   : appState.resSubCat === 'preselect'
    ? renderAIPreselectPanel(true)
    : renderAIGeneratePanel('editor');
 } else if (tab === 'style') {
  cats = [
   { id: 'look', label: '视觉美学' },
   { id: 'color', label: '色彩影调' },
   { id: 'medium', label: '拍摄媒介' },
   { id: 'texture', label: '影像质感' }
  ];
  if (!cats.some((c) => c.id === appState.resSubCat)) appState.resSubCat = 'look';
  const curVal = appState.resSubCat === 'look' ? activeV?.style
   : appState.resSubCat === 'color' ? activeV?.color
   : appState.resSubCat === 'medium' ? activeV?.medium
   : activeV?.texture || [];
  contentHtml = renderSwatchGrid(
   appState.resSubCat,
   curVal,
   appState.resSubCat === 'texture' ? 'toggle-tex' : 'set-v1',
   '点击方框即可直接赋予当前 V1 分镜（若时间轴为空将自动新建首镜）'
  );
 } else if (tab === 'camera') {
  cats = [
   { id: 'framing', label: '景别构图' },
   { id: 'move', label: '摄影运镜' },
   { id: 'angle', label: '机位角度' }
  ];
  if (!cats.some((c) => c.id === appState.resSubCat)) appState.resSubCat = 'framing';
  const curVal = activeV?.[appState.resSubCat] || '';
  contentHtml = renderSwatchGrid(appState.resSubCat, curVal, 'set-v1', '可视化方框图解：点击立即应用到选中 V1 镜头');
 } else if (tab === 'transitions') {
  cats = [{ id: 'all', label: '全部转场' }, ...TRANSITION_CATEGORIES.map((c) => ({ id: c.id, label: c.short }))];
  if (!cats.some((c) => c.id === appState.resSubCat)) appState.resSubCat = 'all';
  contentHtml = renderSwatchGrid('transition', activeV?.transitionIn || '', 'set-trans', '点击方框设定选中 V1 镜头的入画转场方式');
 } else if (tab === 'audio') {
  cats = [{ id: 'bgm', label: '配乐流派' }, { id: 'sfx', label: '音效积木' }];
  if (!cats.some((c) => c.id === appState.resSubCat)) appState.resSubCat = 'bgm';
  contentHtml = appState.resSubCat === 'sfx' ? `
   <div style="display:flex;flex-direction:column;gap:8px;">
    <button class="btn btn-jy" data-action="quick-add-audio">${uiIcon('plus')}<span>在播放头插入自定义音效 (A1)</span></button>
    ${CLIP_PRESETS.filter((x) => x.track === 'audio' || x.track === 'bgm').map((item) => `
     <div class="preset-card" data-preset-id="${esc(item.id)}">
      <div><div class="preset-label">${esc(item.label)}</div><div class="preset-sub">${item.duration}s</div></div>
      <span class="track-badge ${esc(item.track)}">+ 插入</span>
     </div>`).join('')}
   </div>` : renderSwatchGrid('bgm', '', 'add-bgm', '点击方框直接在当前播放头添置一条 A2 配乐轨道');
 } else if (tab === 'dialogue') {
  cats = [{ id: 't1', label: 'T1 对白轨' }];
  appState.resSubCat = 't1';
  contentHtml = `
   <div style="display:flex;flex-direction:column;gap:8px;">
    <button class="btn btn-jy" data-action="quick-add-dialogue">${uiIcon('plus')}<span>在红线位置新建对白字幕 (T1)</span></button>
    <div style="font-size:11.5px;color:var(--text-muted);line-height:1.6;">可将 T1 片段向左拖跨过上一个镜头尾部，轻松完成电影感 <b>J-Cut（未见其人先闻其声）</b>；或向右拖出完成 <b>L-Cut</b>。</div>
   </div>`;
 } else if (tab === 'adjust') {
  cats = [{ id: 'e1', label: 'E1 调节层' }, { id: 'lightSource', label: '主光源布光' }];
  if (!cats.some((c) => c.id === appState.resSubCat)) appState.resSubCat = 'e1';
  contentHtml = appState.resSubCat === 'e1' ? `
   <div style="display:flex;flex-direction:column;gap:8px;">
    <button class="btn btn-jy" data-action="quick-add-adjust">${uiIcon('plus')}<span>插入空白 E1 调节层</span></button>
    ${CLIP_PRESETS.filter((x) => x.track === 'adjust').map((item) => `
     <div class="preset-card" data-preset-id="${esc(item.id)}">
      <div><div class="preset-label">${esc(item.label)}</div><div class="preset-sub">跨镜覆写色调/光影/运镜 (${item.duration}s)</div></div>
      <span class="track-badge adjust">E1 +</span>
     </div>`).join('')}
   </div>` : renderSwatchGrid('lightSource', activeV?.lightSource || '', 'set-v1', '点击光源方块设定当前 V1 镜头主光方向');
 } else {
  cats = [{ id: 'cast', label: `角色 (${p.characters.length})` }, { id: 'scene', label: `场景 (${p.scenes.length})` }];
  if (!cats.some((c) => c.id === appState.resSubCat)) appState.resSubCat = 'cast';
  contentHtml = appState.resSubCat === 'cast' ? `
   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="font-size:11.5px;color:var(--text-muted);">固定人物跨镜锁定</span>
    <button class="btn btn-sm btn-jy" data-action="add-char">${uiIcon('plus')}<span>新增角色</span></button>
   </div>
   ${p.characters.map((c) => `
    <div class="entity-item">
     <div class="entity-head">
      <span style="display:inline-flex;align-items:center;">${esc(c.name)}${c.lockIdentity ? uiIcon('lock', 'inline-lock-svg') : ''}</span>
      <div style="display:flex;gap:4px;">
       <button class="btn btn-sm" data-edit-char="${esc(c.id)}">编辑</button>
       <button class="btn btn-sm" data-bind-char="${esc(c.id)}">入镜</button>
       <button class="btn btn-sm btn-danger" data-del-char="${esc(c.id)}">删</button>
      </div>
     </div>
     <div class="entity-desc">${esc([c.role, c.appearance].filter(Boolean).join(' · '))}</div>
    </div>`).join('') || '<div style="color:var(--text-dim);">暂无角色</div>'}` : `
   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="font-size:11.5px;color:var(--text-muted);">空间光影场景锚点</span>
    <button class="btn btn-sm btn-jy" data-action="add-scene">${uiIcon('plus')}<span>新增场景</span></button>
   </div>
   ${p.scenes.map((s) => `
    <div class="entity-item">
     <div class="entity-head">
      <span>${esc(s.name)}</span>
      <div style="display:flex;gap:4px;">
       <button class="btn btn-sm" data-edit-scene="${esc(s.id)}">编辑</button>
       <button class="btn btn-sm" data-bind-scene="${esc(s.id)}">绑定</button>
       <button class="btn btn-sm btn-danger" data-del-scene="${esc(s.id)}">删</button>
      </div>
     </div>
     <div class="entity-desc">${esc(s.description || s.location || '')}</div>
    </div>`).join('') || '<div style="color:var(--text-dim);">暂无场景</div>'}`;
 }

 return `
  <aside class="res-pane">
   <div class="res-icon-bar">
    ${RESOURCE_TABS.map((t) => `
     <button class="res-icon-btn ${tab === t.id ? 'active' : ''}" data-res-tab="${esc(t.id)}">
      <span class="res-glyph">${uiIcon(t.icon)}</span>
      <span>${esc(t.label)}</span>
     </button>`).join('')}
   </div>
   <div class="res-body">
    <div class="res-cats">
     ${cats.map((c) => `<button class="res-cat-btn ${appState.resSubCat === c.id ? 'active' : ''}" data-res-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('')}
    </div>
    <div class="res-content">
     ${tab === 'ai' ? `
      <div class="res-ai-status-bar">
       <span>${uiIcon('ai-spark', 'inline-lock-svg')} 模型：<b>${esc(appState.aiConn.model === DEFAULT_AI_MODEL ? 'Hydrogen' : appState.aiConn.model)}</b> · <b>${esc(String(appState.aiConn.thinkingLevel || 'high').toUpperCase())}</b></span>
       <button type="button" class="ai-link-btn" data-action="ai-go-api-tab">${isAIApiConfigured() ? 'API 已配置' : '配置 API Key'}</button>
      </div>` : `
      <div class="res-search-row">
       <div class="search-field-wrap">
        ${uiIcon('search', 'search-svg')}
        <input id="resSearchInput" class="input" placeholder="搜索当前分类…" value="${esc(appState.resSearch)}" />
       </div>
      </div>`}
     <div class="res-scroll">${contentHtml}</div>
    </div>
   </div>
  </aside>`;
}

/* =========================================================
   CENTER PROGRAM MONITOR
========================================================= */
function renderProgramMonitorInner() {
 const p = appState.project;
 const total = projectDuration(p);
 const st = stateAtTime(p, p.playhead);

 if (total <= 0) {
  return `
   <div class="blank-slate">
    <div class="blank-tc">00:00:00</div>
    <div style="font-weight:700;font-size:13.5px;margin-bottom:4px;">空白时间轴 · 从 00:00 纯手动剪辑</div>
    <div class="blank-sub">直接点击左侧任意「风格方块 / 运镜 / 分镜积木」，立即将首镜放到时间轴上。</div>
    <div class="blank-actions">
     <button class="btn btn-sm btn-jy" data-action="quick-add-video">${uiIcon('plus')}<span>新建空白分镜</span></button>
     <button class="btn btn-sm" data-action="quick-add-dialogue">${uiIcon('dialogue-text')}<span>添对白 T1</span></button>
     <button class="btn btn-sm" data-action="open-import">${uiIcon('import')}<span>导入工程</span></button>
    </div>
   </div>`;
 }

 const v = st.effectiveVisual;
 if (!v) {
  return `
   <div class="stage-visual">
    <div class="stage-top-row">
     <div class="stage-badges"><span class="stage-chip">GAP / 黑场 (${fmtTimecode(st.time)})</span></div>
    </div>
    <div class="stage-mid-vf">
     <div class="vf-framing-tag">BLACK GAP</div>
     <div class="vf-title" style="color:var(--text-muted);">当前位置无 V1 镜头</div>
    </div>
    <div class="stage-bottom-row">
     ${st.dialogues.map((d) => `<div class="subtitle-box"><span class="subtitle-speaker">${esc(d.speakerName)}:</span>${esc(d.text || '…')}</div>`).join('')}
    </div>
   </div>`;
 }

 const bgStyle = v.style === 'hk_cinema'
  ? 'radial-gradient(circle at 25% 25%, rgba(16,185,129,0.22), rgba(244,63,94,0.12) 60%, #090c14)'
  : 'radial-gradient(circle at 50% 35%, rgba(0,196,204,0.14), #090a0d)';

 const heroRef = v.startRefImage || v.refImage;
 return `
  <div class="stage-visual" style="background:${bgStyle};">
   ${heroRef ? `<img class="stage-ref-img" src="${esc(heroRef)}" alt="ref" />` : ''}
   <div class="stage-scrim"></div>
   <div class="stage-top-row">
    <div class="stage-badges">
     <span class="stage-chip">V1 · ${esc(v.title || '分镜')}</span>
     ${(st.pipVideos || []).map((pv) => `<span class="stage-chip">${esc(pv._trackCode || 'V2')} · ${esc(pv.title || '画中画')}</span>`).join('')}
     ${st.adjusts.map((a) => `<span class="stage-chip adj">${uiIcon('adjustment', 'chip-svg')}<span>${esc(a.label)}</span></span>`).join('')}
     ${st.transitionActive ? `<span class="stage-chip trans">${uiIcon('transition', 'chip-svg')}<span>${esc(groupLabel('transition', st.transitionActive.type))}</span></span>` : ''}
    </div>
    <div class="stage-badges">
     ${st.audios.map((a) => `<span class="stage-chip sfx">${uiIcon('volume', 'chip-svg')}<span>${esc(a.cue)}</span></span>`).join('')}
     ${st.bgms.map((b) => `<span class="stage-chip bgm">${uiIcon('music-track', 'chip-svg')}<span>${esc(groupLabel('bgm', b.style) || 'BGM')}${b.isDucking ? ' [避让]' : ''}</span></span>`).join('')}
    </div>
   </div>
   <div class="stage-mid-vf">
    <div class="vf-framing-tag">${esc([groupLabel('framing', v.framing), groupLabel('move', v.move), groupLabel('look', v.style)].filter(Boolean).join(' · '))}</div>
    <div class="vf-title" title="${esc(v.title)}">${esc(v.title || '未命名镜头')}</div>
    <div class="vf-prompt" title="${esc(v.prompt || '')}">${esc(v.prompt || '在右侧「片段属性」填写动作画面描述，或在左侧点选风格方框')}</div>
   </div>
   <div class="stage-bottom-row">
    ${st.dialogues.map((d) => `<div class="subtitle-box"><span class="subtitle-speaker">${esc(d.speakerName || '角色')}:</span>${esc(d.text || '…')}</div>`).join('')}
   </div>
  </div>`;
}

function stageSignature(st) {
 return [
  st.video?.id || 'gap',
  (st.pipVideos || []).map((x) => x.id).join(','),
  (st.adjusts || []).map((x) => x.id).join(','),
  (st.dialogues || []).map((x) => x.id).join(','),
  (st.audios || []).map((x) => x.id).join(','),
  (st.bgms || []).map((x) => `${x.id}:${x.isDucking}`).join(','),
  st.transitionActive?.type || 'none'
 ].join('|');
}

function updatePlayheadVisuals(forceStage = true, nowTs = 0) {
 const p = appState.project;
 const total = projectDuration(p);
 const needle = document.getElementById('playheadNeedle');
 if (needle) needle.style.left = `${Math.round(p.playhead * p.zoom)}px`;
 const tc = document.getElementById('monitorTimecode');
 if (tc) tc.innerHTML = `${esc(fmtFramesTimecode(p.playhead, p.fps))} <span class="timecode-total">/ ${esc(fmtFramesTimecode(total, p.fps))}</span>`;
 const scrub = document.getElementById('monitorScrubber');
 if (scrub) {
  scrub.max = String(Math.max(1, total));
  scrub.value = String(Math.min(Math.max(0, p.playhead), Math.max(1, total)));
 }
 const stage = document.getElementById('monitorStage');
 if (stage) {
  const sig = stageSignature(stateAtTime(p, p.playhead));
  const shouldRefresh = forceStage || sig !== appState.lastStageKey || (nowTs - appState.lastStageDrawTs > 140);
  if (shouldRefresh) {
   appState.lastStageKey = sig;
   appState.lastStageDrawTs = nowTs || performance.now();
   stage.innerHTML = renderProgramMonitorInner();
  }
 }
 if (appState.playing) {
  const vp = document.getElementById('tlViewport');
  if (vp) {
   const needleX = Math.round(p.playhead * p.zoom);
   if (needleX > vp.scrollLeft + vp.clientWidth - 48) {
    vp.scrollLeft = Math.max(0, needleX - Math.round(vp.clientWidth * 0.25));
   } else if (needleX < vp.scrollLeft) {
    vp.scrollLeft = Math.max(0, needleX - 24);
   }
  }
 }
}

function syncMonitorHeaderAndStageDims() {
 const p = appState.project;
 const ratio = aspectRatioParts(p.format, p.customAspect);
 const hdrMeta = document.getElementById('monitorHeaderSpec');
 if (hdrMeta) hdrMeta.textContent = `播放器 · ${displayAspectLabel(p)} · ${displayResolutionLabel(p)}`;
 const stage = document.getElementById('monitorStage');
 if (stage) {
  stage.style.aspectRatio = `${ratio.w} / ${ratio.h}`;
  stage.style.width = ratio.ratio >= 1 ? 'min(100%, 560px)' : 'auto';
  stage.style.height = ratio.ratio < 1 ? 'min(100%, 260px)' : 'auto';
 }
}

function updateCompiledAndLiveViews() {
 const p = appState.project;
 const compileBox = document.getElementById('compileOutputBox');
 if (compileBox) compileBox.value = compileTimelinePrompt(p);
 const inspTitle = document.getElementById('inspProjTitleVal');
 if (inspTitle) inspTitle.textContent = p.title || '未命名草稿';
 const modalTitle = document.getElementById('compileModalProjTitle');
 if (modalTitle) modalTitle.textContent = p.title || '未命名草稿';
 syncMonitorHeaderAndStageDims();
 const stage = document.getElementById('monitorStage');
 if (stage) stage.innerHTML = renderProgramMonitorInner();
 const sel = p.selected;
 if (sel?.id) {
  const clip = selectedClipObj();
  const titleNode = document.querySelector(`[data-clip-title="${sel.id}"]`);
  if (titleNode && clip) titleNode.textContent = clipTitleLabel(sel.track, clip);
  const subNode = document.querySelector(`[data-clip-sub="${sel.id}"]`);
  if (subNode && clip) subNode.textContent = clipSubLabel(sel.track, clip);
 }
}

/* =========================================================
   RIGHT PARAMETER INSPECTOR (Fig 2 Draft Params / Clip)
========================================================= */
function renderRightInspector() {
 const p = appState.project;
 const sel = p.selected;
 const clip = selectedClipObj();

 if (appState.multiSelected.length > 1) {
  return `
   <aside class="insp-pane">
    <div class="insp-head">
     <span>${uiIcon('layers', 'hdr-svg')}<span>批量编辑 · 已选 ${appState.multiSelected.length} 段</span></span>
     <button class="btn btn-sm" data-action="clear-multi-select">退出多选</button>
    </div>
    <div class="insp-scroll">
     <div class="modal-alert warn">已按住 Ctrl / Shift 多选 <b>${appState.multiSelected.length}</b> 个时间轴片段。未锁定轨道将统一下发操作。</div>
     <div class="field">
      <label>批量设定统一时长 (s)</label>
      <div class="neg-custom-row">
       <input id="batchDurInput" class="input" type="number" step="0.5" min="0.5" value="4" />
       <button class="btn btn-sm btn-jy" data-action="apply-batch-dur">应用时长</button>
      </div>
     </div>
     <div class="field" style="margin-top:8px;">
      <button class="btn btn-danger" style="width:100%;" data-action="apply-batch-delete">${uiIcon('delete')}<span>批量删除这 ${appState.multiSelected.length} 个片段</span></button>
     </div>
     <div class="field" style="margin-top:12px;">
      <label>当前选中列表</label>
      <div class="history-list">
       ${appState.multiSelected.map((it) => {
        const obj = (p.tracks?.[it.track] || []).find((c) => c.id === it.id);
        if (!obj) return '';
        return `<div class="history-item"><span>${esc(it.track.toUpperCase())} · ${esc(clipTitleLabel(it.track, obj))}</span><span>${obj.duration}s</span></div>`;
       }).join('')}
      </div>
     </div>
    </div>
    <div class="insp-foot">
     <button class="btn btn-compile-hero" style="width:100%;" data-action="open-compile-modal">${uiIcon('compile-prompt')}<span>2.0 提示词编译导出</span></button>
    </div>
   </aside>`;
 }

 if (!sel || !clip) {
  const negOpts = groupOptions('negative');
  const customNegList = parseCustomNegativeTags(p.customNegative);
  const totalNegCount = (p.negativePrompts || []).length + customNegList.length;
  const issues = validateTimeline(p);
  const aspRaw = String(p.customAspect || '21:9').split(/[:xX/×]/);
  const aspW = aspRaw[0] || '21';
  const aspH = aspRaw[1] || '9';
  const resParsed = parseCustomResolution(p.customResolution || '2560x1080');

  return `
   <aside class="insp-pane">
    <div class="insp-head">
     <span>${uiIcon('file-settings', 'hdr-svg')}<span>草稿参数</span></span>
     <span style="font-size:11px;color:var(--text-dim);font-weight:500;">全局设置</span>
    </div>
    <div class="insp-scroll">
     <div class="kv-row"><span class="kv-key">草稿名称</span><span id="inspProjTitleVal" class="kv-val" title="${esc(p.title)}">${esc(p.title)}</span></div>
     <div class="kv-row"><span class="kv-key">存储模式</span><span class="kv-val" style="color:var(--jy-teal);">本地 IndexedDB (已开启)</span></div>
     <div class="kv-row"><span class="kv-key">时间轴长度</span><span class="kv-val">${projectDuration(p)}s · ${countProjectClips(p)} 片段</span></div>
     <div class="kv-row">
      <span class="kv-key">画幅比例</span>
      <select class="select" style="width:130px;" data-proj-field="format">
       ${NLE_FORMATS.map(([id, label]) => `<option value="${esc(id)}"${id === p.format ? ' selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
     </div>
     ${p.format === 'custom' ? `
      <div class="dim-pair">
       <div class="dim-input-wrap"><span>自定义宽比</span><input class="input" type="number" step="0.01" min="0.1" max="99" data-custom-aspect="w" value="${esc(aspW)}" /></div>
       <span class="dim-sep">:</span>
       <div class="dim-input-wrap"><span>高比</span><input class="input" type="number" step="0.01" min="0.1" max="99" data-custom-aspect="h" value="${esc(aspH)}" /></div>
      </div>` : ''}
     <div class="kv-row">
      <span class="kv-key">分辨率</span>
      <select class="select" style="width:130px;" data-proj-field="resolution">
       ${NLE_RESOLUTIONS.map(([id, label]) => `<option value="${esc(id)}"${id === p.resolution ? ' selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
     </div>
     ${p.resolution === 'custom' ? `
      <div class="dim-pair">
       <div class="dim-input-wrap"><span>宽度 (px)</span><input class="input" type="number" step="2" min="64" max="16384" data-custom-res="w" value="${esc(resParsed.w)}" /></div>
       <span class="dim-sep">×</span>
       <div class="dim-input-wrap"><span>高度 (px)</span><input class="input" type="number" step="2" min="64" max="16384" data-custom-res="h" value="${esc(resParsed.h)}" /></div>
      </div>` : ''}
     <div class="kv-row">
      <span class="kv-key">帧率</span>
      <select class="select" style="width:130px;" data-proj-num="fps">
       ${NLE_FPS.map((f) => `<option value="${f}"${Number(p.fps) === f ? ' selected' : ''}>${f}.00 帧/秒</option>`).join('')}
      </select>
     </div>
     <div class="field" style="margin-top:10px;">
      <label>全局负向避坑词 (${totalNegCount})</label>
      <div style="font-size:10.5px;color:var(--text-dim);margin:-2px 0 6px;">默认已勾选防漂移/防闪烁/去水印，可自由点击下方词条增减或自定义补充</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
       ${negOpts.map((n) => `<button class="pill-btn ${p.negativePrompts.includes(n.id) ? 'neg-on' : ''}" data-toggle-neg="${esc(n.id)}" title="${esc(n.zh || n.label)}">${esc(n.label)}</button>`).join('')}
       ${customNegList.map((tag) => `<button class="pill-btn neg-on" data-remove-custom-neg="${esc(tag)}" title="点击移除自定义避坑词">${esc(tag)} <span class="tag-remove">×</span></button>`).join('')}
      </div>
      <div class="neg-custom-row">
       <input id="customNegInput" class="input" placeholder="输入自定义负向词（回车或点添加）" />
       <button class="btn btn-sm" data-action="add-custom-neg">+ 添加</button>
      </div>
     </div>
     <div class="field" style="margin-top:10px;">
      <label>镜头体检 (${issues.length})</label>
      ${issues.slice(0, 4).map((it) => `<div class="issue-card ${esc(it.severity)}" data-jump-clip="${esc(it.clipId || '')}" data-jump-track="${esc(it.track || '')}">${esc(it.message)}</div>`).join('')}
     </div>
    </div>
    <div class="insp-foot">
     <button class="btn btn-compile-hero" style="width:100%;" data-action="open-compile-modal">${uiIcon('compile-prompt')}<span>2.0 提示词编译导出</span></button>
    </div>
   </aside>`;
 }

 const selKind = trackKind(sel.track);
 const sameTrackList = p.tracks?.[sel.track] || [];
 const selIdx = sameTrackList.findIndex((c) => c.id === sel.id);
 let formHtml = '';
 if (selKind === 'video') {
  formHtml = `
   <div class="sub-pill-tabs">
    <button class="pill-btn ${appState.inspSubTab === 'content' ? 'active' : ''}" data-insp-sub="content">${uiIcon('script-text', 'pill-svg')}<span>画面与运镜</span></button>
    <button class="pill-btn ${appState.inspSubTab === 'link' ? 'active' : ''}" data-insp-sub="link">${uiIcon('character-ref', 'pill-svg')}<span>角色首尾帧/转场</span></button>
   </div>
   ${appState.inspSubTab === 'content' ? `
    <div class="field-grid">
     <div class="field"><label>分镜标题</label><input class="input" data-clip-field="title" value="${esc(clip.title)}" /></div>
     <div class="field"><label>时长 (s)</label><input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" /></div>
    </div>
    <div class="field"><label>画面主体与动作 (Prompt)</label><textarea class="textarea" rows="3" data-clip-field="prompt" placeholder="描述画面核心动作，风格/运镜可在左侧方框一点直选…">${esc(clip.prompt)}</textarea></div>
    <div class="field"><label>关键道具 / 手持物件</label><input class="input" data-clip-field="props" value="${esc(clip.props || '')}" placeholder="如：热豆浆纸杯、透明雨伞、旧信纸" /></div>
    <div class="field"><label>起幅状态</label><input class="input" data-clip-field="startState" value="${esc(clip.startState)}" placeholder="0% 首帧画面姿态" /></div>
    <div class="field"><label>落幅状态</label><input class="input" data-clip-field="endState" value="${esc(clip.endState)}" placeholder="100% 尾帧落点" /></div>
    <div class="field-grid">
     <div class="field"><label>景别</label><select class="select" data-clip-field="framing">${renderSelectOptions('framing', clip.framing)}</select></div>
     <div class="field"><label>运镜方式</label><select class="select" data-clip-field="move">${renderSelectOptions('move', clip.move)}</select></div>
     <div class="field"><label>运镜速度</label><select class="select" data-clip-field="speed">${renderSelectOptions('speed', clip.speed)}</select></div>
     <div class="field"><label>稳定方式</label><select class="select" data-clip-field="stability">${renderSelectOptions('stability', clip.stability)}</select></div>
     <div class="field"><label>焦段镜头</label><select class="select" data-clip-field="lens">${renderSelectOptions('lens', clip.lens)}</select></div>
     <div class="field"><label>运镜幅度描述</label><input class="input" data-clip-field="moveDistance" value="${esc(clip.moveDistance)}" placeholder="如：慢推半米 / 小幅" /></div>
     <div class="field"><label>美学风格</label><select class="select" data-clip-field="style">${renderSelectOptions('look', clip.style)}</select></div>
     <div class="field"><label>色彩影调</label><select class="select" data-clip-field="color">${renderSelectOptions('color', clip.color)}</select></div>
     <div class="field"><label>主光源</label><select class="select" data-clip-field="lightSource">${renderSelectOptions('lightSource', clip.lightSource)}</select></div>
     <div class="field"><label>时段 / 天光</label><select class="select" data-clip-field="time">${renderSelectOptions('time', clip.time)}</select></div>
     <div class="field"><label>天气氛围</label><select class="select" data-clip-field="weather">${renderSelectOptions('weather', clip.weather)}</select></div>
    </div>
   ` : `
    <div class="field">
     <label>绑定场景锚点</label>
     <select class="select" data-clip-field="sceneId">
      <option value="">— 无 —</option>
      ${p.scenes.map((s) => `<option value="${esc(s.id)}"${s.id === clip.sceneId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
     </select>
    </div>
    <div class="field">
     <label>出镜角色</label>
     <div style="display:flex;flex-wrap:wrap;gap:5px;">
      ${p.characters.map((c) => `<button class="pill-btn ${(clip.characterIds || []).includes(c.id) ? 'active' : ''}" data-toggle-clip-char="${esc(c.id)}">${esc(c.name)}</button>`).join('') || '<span style="color:var(--text-dim);font-size:11px;">在左侧「角色场景」中添加角色</span>'}
     </div>
    </div>
    <div class="field-grid">
     <div class="field">
      <label>入画转场方式</label>
      <select class="select" data-clip-field="transitionIn">${renderSelectOptions('transition', clip.transitionIn, '硬切（Cut）')}</select>
     </div>
     <div class="field">
      <label>入画重叠时长 (s)</label>
      <input class="input" type="number" step="0.1" min="0" max="2" data-clip-num="transitionDur" value="${esc(clip.transitionDur)}" title="硬切为 0s，叠化/淡入可设 0.2~2.0s" />
     </div>
     <div class="field">
      <label>出画转场 / 结尾收束</label>
      <select class="select" data-clip-field="transitionOut">${renderSelectOptions('transition', clip.transitionOut || '', '— 无 / 顺接下镜 —')}</select>
     </div>
     <div class="field">
      <label>出画时长 (s)</label>
      <input class="input" type="number" step="0.1" min="0" max="2" data-clip-num="transitionOutDur" value="${esc(clip.transitionOutDur || 0)}" title="片段结尾淡出或黑屏收缩时长(秒)" />
     </div>
    </div>
    <div class="field">
     <label>首帧参考图 (0% Start Frame · 云端 URL 或本地上传)</label>
     <input class="input" data-clip-field="startRefImage" value="${esc(clip.startRefImage || clip.refImage || '')}" placeholder="粘贴云端参考图 URL 或从下方上传本地首帧图" style="margin-bottom:4px;" />
     <input type="file" id="refImgInput" accept="image/*" style="font-size:11px;" />
     ${(clip.startRefImage || clip.refImage) ? `
      <div class="ref-thumb-row">
       <img class="ref-thumb-img" src="${esc(clip.startRefImage || clip.refImage)}" alt="首帧" />
       <span style="font-size:11px;color:var(--text-muted);flex:1 1 auto;">首帧图已绑定</span>
       <button class="btn btn-sm btn-danger" data-action="clear-ref-img">移除</button>
      </div>` : ''}
    </div>
    <div class="field">
     <label>尾帧参考图 (100% End Frame · 云端 URL 或本地上传)</label>
     <input class="input" data-clip-field="endRefImage" value="${esc(clip.endRefImage || '')}" placeholder="粘贴云端参考图 URL 或从下方上传本地尾帧图" style="margin-bottom:4px;" />
     <input type="file" id="endRefImgInput" accept="image/*" style="font-size:11px;" />
     ${clip.endRefImage ? `
      <div class="ref-thumb-row">
       <img class="ref-thumb-img" src="${esc(clip.endRefImage)}" alt="尾帧" />
       <span style="font-size:11px;color:var(--text-muted);flex:1 1 auto;">尾帧图已绑定</span>
       <button class="btn btn-sm btn-danger" data-action="clear-end-ref-img">移除</button>
      </div>` : ''}
    </div>
   `}`;
 } else if (selKind === 'dialogue') {
  formHtml = `
   <div class="field-grid">
    <div class="field"><label>说话人</label><input class="input" data-clip-field="speakerName" value="${esc(clip.speakerName)}" /></div>
    <div class="field"><label>语种</label><select class="select" data-clip-field="language">${LANGUAGE_OPTIONS.map((l) => `<option value="${esc(l)}"${l === clip.language ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label>入点 (s)</label><input class="input" type="number" step="0.1" min="0" data-clip-num="start" value="${esc(clip.start)}" /></div>
    <div class="field"><label>时长 (s)</label><input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" /></div>
    <div class="field">
     <label>字幕画面位置</label>
     <select class="select" data-clip-field="subtitlePos">
      <option value="bottom"${clip.subtitlePos === 'bottom' || !clip.subtitlePos ? ' selected' : ''}>底部居中</option>
      <option value="top"${clip.subtitlePos === 'top' ? ' selected' : ''}>顶部悬浮</option>
      <option value="center"${clip.subtitlePos === 'center' ? ' selected' : ''}>画面中央重点</option>
      <option value="off"${clip.subtitlePos === 'off' ? ' selected' : ''}>仅配音（不渲染字幕）</option>
     </select>
    </div>
    <div class="field"><label>字幕字体 / 样式</label><input class="input" data-clip-field="subtitleStyle" value="${esc(clip.subtitleStyle || '')}" placeholder="如：电影黑体白字 / 仿手写体" /></div>
   </div>
   <div class="field"><label>语气与停顿节奏</label><input class="input" data-clip-field="delivery" value="${esc(clip.delivery)}" /></div>
   <div class="field"><label>台词内容</label><textarea class="textarea" rows="3" data-clip-field="text">${esc(clip.text)}</textarea></div>`;
 } else if (selKind === 'audio') {
  formHtml = `
   <div class="field-grid">
    <div class="field"><label>分类</label><select class="select" data-clip-field="kind"><option value="sfx"${clip.kind === 'sfx' ? ' selected' : ''}>音效 SFX</option><option value="ambience"${clip.kind === 'ambience' ? ' selected' : ''}>环境声场</option></select></div>
    <div class="field"><label>入点 (s)</label><input class="input" type="number" step="0.1" min="0" data-clip-num="start" value="${esc(clip.start)}" /></div>
    <div class="field"><label>时长 (s)</label><input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" /></div>
    <div class="field"><label>淡入 (s)</label><input class="input" type="number" step="0.1" min="0" max="10" data-clip-num="fadeIn" value="${esc(clip.fadeIn || 0)}" /></div>
    <div class="field"><label>淡出 (s)</label><input class="input" type="number" step="0.1" min="0" max="10" data-clip-num="fadeOut" value="${esc(clip.fadeOut || 0)}" /></div>
    <div class="field"><label>空间与方位</label><input class="input" data-clip-field="spatial" value="${esc(clip.spatial || '')}" placeholder="如：画外由远及近 / 屋外窗边" /></div>
   </div>
   <div class="field"><label>声音描述</label><textarea class="textarea" rows="3" data-clip-field="cue" placeholder="如：细密雨点打在透明雨伞上 / 街头由远及近脚步声">${esc(clip.cue)}</textarea></div>
   <div class="field"><label>音量与强弱</label><input class="input" data-clip-field="intensity" value="${esc(clip.intensity)}" placeholder="如：柔和铺底 / 清晰突出" /></div>`;
 } else if (selKind === 'bgm') {
  formHtml = `
   <div class="field"><label>配乐流派</label><select class="select" data-clip-field="style">${renderSelectOptions('bgm', clip.style)}</select></div>
   <div class="field-grid">
    <div class="field"><label>入点 (s)</label><input class="input" type="number" step="0.1" min="0" data-clip-num="start" value="${esc(clip.start)}" /></div>
    <div class="field"><label>时长 (s)</label><input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" /></div>
    <div class="field"><label>淡入 (s)</label><input class="input" type="number" step="0.1" min="0" max="10" data-clip-num="fadeIn" value="${esc(clip.fadeIn ?? 0.5)}" /></div>
    <div class="field"><label>淡出 (s)</label><input class="input" type="number" step="0.1" min="0" max="10" data-clip-num="fadeOut" value="${esc(clip.fadeOut ?? 0.8)}" /></div>
   </div>
   <div class="field"><label>情绪走势</label><textarea class="textarea" rows="2" data-clip-field="mood">${esc(clip.mood)}</textarea></div>
   <div class="field"><label>乐器 / 卡点补充备注</label><input class="input" data-clip-field="customNote" value="${esc(clip.customNote || '')}" placeholder="如：高潮处停止鼓点仅留单音钢琴" /></div>
   <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;cursor:pointer;"><input type="checkbox" data-clip-bool="duckUnderDialogue"${clip.duckUnderDialogue ? ' checked' : ''} /> 对白出现时自动避让压低</label>`;
 } else {
  formHtml = `
   <div class="field"><label>调节层名称</label><input class="input" data-clip-field="label" value="${esc(clip.label)}" /></div>
   <div class="field-grid">
    <div class="field"><label>入点 (s)</label><input class="input" type="number" step="0.1" min="0" data-clip-num="start" value="${esc(clip.start)}" /></div>
    <div class="field"><label>时长 (s)</label><input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" /></div>
    <div class="field"><label>美学覆写</label><select class="select" data-clip-field="lookOverride">${renderSelectOptions('look', clip.lookOverride)}</select></div>
    <div class="field"><label>色彩覆写</label><select class="select" data-clip-field="colorOverride">${renderSelectOptions('color', clip.colorOverride)}</select></div>
   </div>
   <div class="field"><label>跨镜修饰指令</label><textarea class="textarea" rows="2" data-clip-field="cameraModifier">${esc(clip.cameraModifier)}</textarea></div>`;
 }

 return `
  <aside class="insp-pane">
   <div class="insp-head">
    <span>${uiIcon('clip-settings', 'hdr-svg')}<span>片段 · ${esc(sel.track.toUpperCase())}${sameTrackList.length ? ` (${selIdx + 1}/${sameTrackList.length})` : ''}</span></span>
    <div style="display:flex;gap:4px;align-items:center;">
     ${sameTrackList.length > 1 ? `<button class="btn btn-sm" data-action="prev-shot" title="切换到上一片段" style="padding:3px 6px;">&lt;</button><button class="btn btn-sm" data-action="next-shot" title="切换到下一片段" style="padding:3px 6px;">&gt;</button>` : ''}
     <button class="btn btn-sm" data-action="deselect-clip" title="返回查看草稿全局参数">草稿参数</button>
    </div>
   </div>
   <div class="insp-scroll">${formHtml}</div>
   <div class="insp-foot">
    <button class="btn btn-compile-hero" style="width:100%;" data-action="open-compile-modal">${uiIcon('compile-prompt')}<span>2.0 提示词编译导出</span></button>
   </div>
  </aside>`;
}

/* =========================================================
   LOWER 5-TRACK TIMELINE
========================================================= */
function renderTimelineBody() {
 const p = appState.project;
 const total = projectDuration(p);
 const viewSecs = Math.max(20, Math.ceil(total + 8));
 const widthPx = Math.max(960, Math.round(viewSecs * p.zoom));
 const majorStep = p.zoom >= 90 ? 1 : p.zoom >= 50 ? 2 : 5;
 const allTracks = getAllTracks(p);

 let rulerHtml = '';
 for (let s = 0; s <= viewSecs; s += 0.5) {
  const x = Math.round(s * p.zoom);
  const isMajor = Math.abs(s % majorStep) < 0.01;
  rulerHtml += `<div class="ruler-tick ${isMajor ? 'major' : 'minor'}" style="left:${x}px;"></div>`;
  if (isMajor) rulerHtml += `<div class="ruler-label" style="left:${x}px;">${esc(fmtTimecode(s))}</div>`;
 }

 const lanesHtml = allTracks.map((tr) => {
  const kind = tr.kind || trackKind(tr.key);
  const clips = p.tracks?.[tr.key] || [];
  const locked = isTrackLocked(p, tr.key);
  const hidden = isTrackHidden(p, tr.key);
  const muted = isTrackMuted(p, tr.key);

  let rowEnds = [0, 0];
  let hasOverlap = false;
  if (tr.key !== 'video') {
   for (let i = 1; i < clips.length; i++) {
    if (clips[i].start < roundT(clips[i - 1].start + clips[i - 1].duration) - 0.05) {
     hasOverlap = true;
     break;
    }
   }
  }
  let clipsHtml = clips.map((c) => {
   const left = Math.round(c.start * p.zoom);
   const width = Math.max(22, Math.round(c.duration * p.zoom));
   const isSel = p.selected?.track === tr.key && p.selected?.id === c.id;
   const isMulti = appState.multiSelected.some((m) => m.track === tr.key && m.id === c.id);
   let subClass = '';
   if (hasOverlap) {
    const laneIdx = c.start >= rowEnds[0] - 0.01 ? 0 : 1;
    rowEnds[laneIdx] = roundT(c.start + c.duration);
    subClass = ` subrow-${laneIdx}`;
   }
   return `
    <div class="tl-clip ${esc(kind)}${subClass}${isSel ? ' selected' : ''}${isMulti && !isSel ? ' multi-selected' : ''}" data-clip-id="${esc(c.id)}" data-clip-track="${esc(tr.key)}" style="left:${left}px;width:${width}px;" title="${esc(clipTitleLabel(tr.key, c))} (${esc(clipSubLabel(tr.key, c))})">
     <div class="clip-handle-l"></div>
     <div class="clip-content">
      <div class="clip-title" data-clip-title="${esc(c.id)}">${esc(clipTitleLabel(tr.key, c))}</div>
      <div class="clip-sub" data-clip-sub="${esc(c.id)}">${esc(clipSubLabel(tr.key, c))}</div>
     </div>
     <div class="clip-handle-r"></div>
    </div>`;
  }).join('');

  if (tr.key === 'video' && clips.length > 1) {
   for (let i = 1; i < clips.length; i++) {
    const prev = clips[i - 1];
    const curr = clips[i];
    if (Math.abs(curr.start - roundT(prev.start + prev.duration)) < 0.25) {
     const hasFx = curr.transitionIn && curr.transitionIn !== 'cut' && curr.transitionIn !== 'direct_cut';
     clipsHtml += `<button class="trans-capsule${hasFx ? ' has-fx' : ''}" style="left:${Math.round(curr.start * p.zoom)}px;" data-jump-trans="${esc(curr.id)}" title="点击切到转场面板编辑">${uiIcon('transition')}</button>`;
    }
   }
  }

  if (!clips.length && total === 0 && tr.key === 'video') {
   clipsHtml += `<div class="tl-empty-drop">${uiIcon('storyboard-track', 'drop-svg')}<span>00:00 空白起剪：点击左上方「风格特效 / 运镜方框」或工具栏「+ 分镜」，开始你的创作吧~</span></div>`;
  }

  const laneStateCls = `${locked ? ' is-locked' : ''}${hidden ? ' is-hidden' : ''}${muted ? ' is-muted' : ''}`;
  return `<div class="tl-lane ${tr.key === 'video' ? 'video-row' : ''}${laneStateCls}" data-lane-track="${esc(tr.key)}">${clipsHtml}</div>`;
 }).join('');

 return `
  <div class="tl-headers">
   <div class="tl-corner"><span>轨道 (${allTracks.length})</span><span>${p.fps}fps</span></div>
   ${allTracks.map((tr) => {
    const kind = tr.kind || trackKind(tr.key);
    const locked = isTrackLocked(p, tr.key);
    const hidden = isTrackHidden(p, tr.key);
    const muted = isTrackMuted(p, tr.key);
    const canHide = kind === 'video' || kind === 'adjust' || kind === 'dialogue';
    const canMute = kind === 'dialogue' || kind === 'audio' || kind === 'bgm';
    return `
     <div class="tl-track-header ${tr.key === 'video' ? 'video-row' : ''}" title="${esc(tr.label)}">
      <div class="tl-th-info">
       ${uiIcon(TRACK_ICON_MAP[kind] || 'layers', 'track-ico')}
       <span class="track-badge ${esc(kind)}">${esc(tr.code)}</span>
       <span class="tl-th-name">${esc(tr.label)}</span>
      </div>
      <div class="th-actions">
       ${canHide ? `<button class="th-btn ${hidden ? 'on' : ''}" data-track-toggle="hidden" data-track-key="${esc(tr.key)}" title="${hidden ? '显示该轨' : '隐藏该轨'}">${uiIcon(hidden ? 'eye-off' : 'eye')}</button>` : ''}
       ${canMute ? `<button class="th-btn ${muted ? 'on' : ''}" data-track-toggle="muted" data-track-key="${esc(tr.key)}" title="${muted ? '取消静音' : '静音该轨'}">${uiIcon(muted ? 'volume-mute' : 'headphones')}</button>` : ''}
       <button class="th-btn ${locked ? 'on' : ''}" data-track-toggle="locked" data-track-key="${esc(tr.key)}" title="${locked ? '解锁轨道' : '锁定轨道'}">${uiIcon(locked ? 'lock' : 'unlock')}</button>
       <button class="th-btn add-mini" data-add-on-track="${esc(tr.key)}" title="在此轨插入片段">${uiIcon('plus')}</button>
       ${tr.isCustom ? `<button class="th-btn" data-remove-track="${esc(tr.key)}" title="删除此新建轨道">${uiIcon('close')}</button>` : ''}
      </div>
     </div>`;
   }).join('')}
  </div>
  <div id="tlViewport" class="tl-viewport">
   <div id="tlCanvas" class="tl-canvas" style="width:${widthPx}px;">
    <div id="tlRuler" class="tl-ruler">${rulerHtml}</div>
    ${lanesHtml}
    <div id="playheadNeedle" class="playhead-line" style="left:${Math.round(p.playhead * p.zoom)}px;">
     <div id="playheadCap" class="playhead-cap"></div>
    </div>
   </div>
  </div>`;
}

function renderEditorScreen() {
 const p = appState.project;
 const total = projectDuration(p);
 const ratio = aspectRatioParts(p.format, p.customAspect);
 const clip = selectedClipObj();
 const allTracks = getAllTracks(p);
 const trackSummary = allTracks.map((tr) => `${tr.code}:${(p.tracks?.[tr.key] || []).length}`).join(' ');

 return `
  <header class="jy-topbar">
   <div class="topbar-left">
    <button class="btn btn-sm" data-action="go-home">${uiIcon('home')}<span>首页</span></button>
    <button class="btn btn-sm" data-action="open-import" data-import-tab="v2">${uiIcon('import')}<span>导入 (1.0/2.0)</span></button>
    <button class="btn btn-sm" data-action="load-demo">${uiIcon('sample-draft')}<span>示例草稿</span></button>
    <button class="btn btn-sm" data-action="new-blank-stay">${uiIcon('new-blank')}<span>新建空白</span></button>
    <button class="btn btn-sm" data-action="clone-current-draft" title="将当前草稿复制为副本">${uiIcon('layers')}<span>复制草稿</span></button>
   </div>
   <div class="topbar-center">
    <input class="title-input-center" data-proj-field="title" value="${esc(p.title)}" title="点击编辑草稿名称（实时同步）" />
   </div>
   <div class="topbar-right">
    <span class="no-ai-tag">${uiIcon('check', 'tag-svg')}<span>0 AI 依赖</span></span>
    <button class="btn btn-compile-hero" data-action="open-compile-modal">${uiIcon('compile-prompt')}<span>2.0 提示词编译导出</span></button>
   </div>
  </header>

  <main class="nle-studio">
   ${renderResourceDock()}
   <section class="monitor-pane">
    <div class="monitor-header">
     <span style="display:inline-flex;align-items:center;gap:5px;">${uiIcon('aspect-ratio', 'hdr-svg')}<span id="monitorHeaderSpec">播放器 · ${esc(displayAspectLabel(p))} · ${esc(displayResolutionLabel(p))}</span></span>
     <span>${esc(trackSummary)}</span>
    </div>
    <div class="monitor-bay">
     <div id="monitorStage" class="monitor-stage" style="aspect-ratio:${ratio.w} / ${ratio.h};width:${ratio.ratio >= 1 ? 'min(100%, 560px)' : 'auto'};height:${ratio.ratio < 1 ? 'min(100%, 260px)' : 'auto'};max-height:100%;">
      ${renderProgramMonitorInner()}
     </div>
    </div>
    <div class="monitor-transport">
     <div style="display:flex;gap:4px;align-items:center;">
      <button class="btn btn-sm" data-action="seek-start" title="回到片头">${uiIcon('skip-back')}</button>
      <button id="playPauseBtn" class="btn btn-sm btn-jy" data-action="toggle-play" style="min-width:68px;">${appState.playing ? `${uiIcon('pause')}<span>暂停</span>` : `${uiIcon('play')}<span>播放</span>`}</button>
      <button class="btn btn-sm" data-action="seek-end" title="跳到片尾">${uiIcon('skip-forward')}</button>
     </div>
     <input id="monitorScrubber" class="scrub-slider" type="range" min="0" max="${Math.max(1, total)}" step="0.1" value="${Math.min(p.playhead, Math.max(1, total))}" />
     <div id="monitorTimecode" class="timecode-readout">${esc(fmtFramesTimecode(p.playhead, p.fps))} <span class="timecode-total">/ ${esc(fmtFramesTimecode(total, p.fps))}</span></div>
    </div>
   </section>
   ${renderRightInspector()}
  </main>

  <section class="timeline-dock">
   <div class="tl-toolbar">
    <div class="tl-tool-group">
     <button class="btn btn-sm" data-add-on-track="adjust" title="在 E1 插入调节层片段">${uiIcon('plus')}<span>调节 E1</span></button>
     <button class="btn btn-sm" data-add-on-track="video" title="在 V1 添加分镜片段">${uiIcon('plus')}<span>分镜 V1</span></button>
     <button class="btn btn-sm" data-add-on-track="dialogue" title="在 T1 插入对白片段">${uiIcon('plus')}<span>对白 T1</span></button>
     <button class="btn btn-sm" data-add-on-track="audio" title="在 A1 插入音效片段">${uiIcon('plus')}<span>音效 A1</span></button>
     <button class="btn btn-sm" data-add-on-track="bgm" title="在 A2 插入配乐片段">${uiIcon('plus')}<span>配乐 A2</span></button>
     <div class="tl-dropdown-wrap">
      <button class="btn btn-sm" data-action="toggle-track-menu" title="在时间轴新增更多独立轨道">${uiIcon('layers')}<span>+ 新建轨道</span>${uiIcon('chevron-down')}</button>
      ${appState.trackMenuOpen ? `
       <div class="tl-popover">
        <button class="tl-popover-item" data-new-track-kind="adjust"><span>新增调节层轨</span><span class="track-badge adjust">E+</span></button>
        <button class="tl-popover-item" data-new-track-kind="video"><span>新增画中画 / 辅视频轨</span><span class="track-badge video">V+</span></button>
        <button class="tl-popover-item" data-new-track-kind="dialogue"><span>新增对白 / 字幕轨</span><span class="track-badge dialogue">T+</span></button>
        <button class="tl-popover-item" data-new-track-kind="audio"><span>新增音效 / 环境轨</span><span class="track-badge audio">A+</span></button>
        <button class="tl-popover-item" data-new-track-kind="bgm"><span>新增配乐轨</span><span class="track-badge bgm">A+</span></button>
       </div>` : ''}
     </div>
     <div class="tl-sep"></div>
     <button class="btn btn-sm" data-action="undo"${appState.history.length ? '' : ' disabled'} title="撤销 (Ctrl+Z)">${uiIcon('undo')}</button>
     <button class="btn btn-sm" data-action="redo"${appState.future.length ? '' : ' disabled'} title="重做 (Ctrl+Y / Ctrl+Shift+Z)">${uiIcon('redo')}</button>
     <button class="btn btn-sm" data-action="split-playhead" title="在播放头红线分割片段 (B/S)">${uiIcon('split')}<span>分割</span></button>
     <button class="btn btn-sm" data-action="dup-selected"${clip ? '' : ' disabled'} title="复制选中">${uiIcon('layers')}</button>
     <button class="btn btn-sm btn-danger" data-action="del-selected"${(clip || appState.multiSelected.length) ? '' : ' disabled'} title="删除选中 (Del)">${uiIcon('delete')}</button>
     ${appState.multiSelected.length > 1 ? `<span class="batch-bar">多选 ${appState.multiSelected.length} 段</span>` : ''}
    </div>
    <div class="tl-tool-group">
     <button class="btn btn-sm" data-action="open-help-modal" title="查看全部快捷键与撤销历史记录">${uiIcon('timer')}<span>历史 (${appState.history.length}) · 快捷键</span></button>
     <button class="btn btn-sm btn-jy" data-action="open-compile-modal">${uiIcon('compile-prompt')}<span>2.0 编译提示词</span></button>
     <div class="tl-sep"></div>
     <button class="btn btn-sm ${p.snap ? 'btn-active' : ''}" data-action="toggle-snap" aria-pressed="${p.snap ? 'true' : 'false'}" title="开关时间轴边缘自动磁吸对齐"><span class="toggle-dot"></span>${uiIcon('magnet')}<span>磁吸 ${p.snap ? '开' : '关'}</span></button>
     <button class="btn btn-sm ${p.ripple ? 'btn-active' : ''}" data-action="toggle-ripple" aria-pressed="${p.ripple ? 'true' : 'false'}" title="开关 V1 主轨联动（紧贴无黑场 vs 自由保留空档）"><span class="toggle-dot"></span>${uiIcon('link')}<span>联动 ${p.ripple ? '开' : '关'}</span></button>
     <input id="zoomSlider" type="range" min="36" max="150" step="4" value="${p.zoom}" style="width:76px;accent-color:var(--jy-teal);" title="缩放时间轴" />
    </div>
   </div>
   <div class="tl-body">${renderTimelineBody()}</div>
  </section>`;
}

/* =========================================================
   MODALS: 2.0 COMPILE EXPORT / IMPORT / CAST / SCENE
========================================================= */
function renderModal() {
 const m = appState.modal;
 if (!m) return '';

 if (m.type === 'compile') {
  const p = appState.project;
  const compiled = compileTimelinePrompt(p);
  const canExport = hasExportableClips(p);
  const trackCounts = getAllTracks(p).map((tr) => `${tr.code}:${(p.tracks?.[tr.key] || []).length}`).join(' / ');
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box wide">
     <div class="modal-head">
      <span>${uiIcon('compile-prompt', 'modal-title-svg')}<span>镜序 2.0 多轨提示词编译导出 (<span id="compileModalProjTitle">${esc(p.title)}</span>)</span></span>
      <button class="btn btn-sm" data-close-modal="1" title="关闭">${uiIcon('close')}</button>
     </div>
     <div class="modal-body">
      ${!canExport ? `<div class="modal-alert warn">当前时间轴为空（0 个片段）：请至少在轨道中添加一个分镜、对白或音频片段，再进行提示词复制或导出。</div>` : ''}
      <div class="compile-modal-grid">
       <div style="display:flex;flex-direction:column;gap:10px;border-right:1px solid var(--border);padding-right:14px;">
        <div class="field">
         <label>编译格式</label>
         <select class="select" data-proj-field="outputMode">
          ${NLE_OUTPUT_MODES.map(([id, label]) => `<option value="${esc(id)}"${id === p.outputMode ? ' selected' : ''}>${esc(label)}</option>`).join('')}
         </select>
        </div>
        <div class="field">
         <label>提示词语言</label>
         <select class="select" data-proj-field="outputLang">
          <option value="zh"${p.outputLang === 'zh' ? ' selected' : ''}>中文电影编导提示词</option>
          <option value="en"${p.outputLang === 'en' ? ' selected' : ''}>English Director Prompt</option>
         </select>
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);line-height:1.6;padding:8px;background:#121215;border-radius:6px;border:1px solid var(--border);">
         <div><b>规格：</b>${esc(displayAspectLabel(p))} · ${esc(displayResolutionLabel(p))} · ${p.fps}fps</div>
         <div><b>总时长：</b>${projectDuration(p)}s</div>
         <div><b>轨道：</b>${esc(trackCounts)}</div>
         <div><b>说明：</b>已自动融合调节层覆写、对白去重与人声避让标识。</div>
        </div>
        <button class="btn btn-jy" style="padding:8px 12px;" data-action="copy-prompt"${canExport ? '' : ' disabled'}>${uiIcon('layers')}<span>一键复制完整提示词</span></button>
        <div style="display:flex;gap:6px;">
         <button class="btn btn-sm" style="flex:1;" data-action="download-txt"${canExport ? '' : ' disabled'}>${uiIcon('export')}<span>下载 .txt</span></button>
         <button class="btn btn-sm" style="flex:1;" data-action="download-csv"${canExport ? '' : ' disabled'}>${uiIcon('export')}<span>导出 .csv</span></button>
        </div>
        <button class="btn btn-sm" data-action="export-json">${uiIcon('save')}<span>导出工程备份 .jingxu2.json</span></button>
       </div>
       <div>
        <textarea id="compileOutputBox" class="compile-box" readonly>${esc(compiled)}</textarea>
       </div>
      </div>
     </div>
    </div>
   </div>`;
 }

 if (m.type === 'import') {
  const tab = m.tab === 'v1' ? 'v1' : 'v2';
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box">
     <div class="modal-head">
      <span>${uiIcon('import', 'modal-title-svg')}<span>导入工程 (${tab === 'v1' ? '镜序 1.0 .jingxu.json' : '镜序 2.0 .jingxu2.json'})</span></span>
      <button class="btn btn-sm" data-close-modal="1" title="关闭">${uiIcon('close')}</button>
     </div>
     <div class="modal-body">
      <div class="modal-tabs">
       <button class="modal-tab-btn ${tab === 'v2' ? 'active' : ''}" data-import-tab-switch="v2">镜序 2.0 多轨 (.jingxu2.json)</button>
       <button class="modal-tab-btn ${tab === 'v1' ? 'active' : ''}" data-import-tab-switch="v1">镜序 1.0 分镜迁移 (.jingxu.json)</button>
      </div>
      ${m.error ? `<div class="modal-alert error">${esc(m.error)}</div>` : ''}
      <label class="drop-zone" for="importFileInput">
       <div>点击选择或将 <code>${tab === 'v1' ? '.jingxu.json / .json' : '.jingxu2.json / .json'}</code> 文件拖到这里</div>
       <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">${tab === 'v1' ? '1.0 分镜会自动将口播台词、音效与配乐拆解进入 2.0 多轨时间轴（支持自动兼容识别）' : '支持 2.0 完整多轨工程还原，并兼容直接导入 1.0 JSON 文件'}</div>
       <input id="importFileInput" type="file" accept=".json,.jingxu.json,.jingxu2.json,application/json" style="display:none;" />
      </label>
      <div class="field">
       <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <label style="margin:0;">或直接粘贴 ${tab === 'v1' ? '1.0' : '2.0'} JSON 内容</label>
        <button class="btn btn-sm" data-action="download-import-tpl">${uiIcon('export')}<span>下载空白 ${tab === 'v1' ? '1.0' : '2.0'} 模板</span></button>
       </div>
       <textarea id="importPasteBox" class="textarea" rows="7" placeholder="粘贴 ${tab === 'v1' ? '.jingxu.json' : '.jingxu2.json'} 全文…">${esc(m.text || '')}</textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
       <button class="btn" data-close-modal="1">取消</button>
       <button class="btn btn-jy" data-action="confirm-import-paste">确认导入并打开剪辑</button>
      </div>
     </div>
    </div>
   </div>`;
 }

 if (m.type === 'char') {
  const c = m.draft;
  const charPlaceholders = {
   name: '如：林晚 / 陈默',
   age: '如：24 岁',
   gender: '如：女性 / 男性',
   height: '如：165cm',
   build: '如：偏瘦清秀 / 宽肩匀称',
   occupation: '如：便利店夜班员工 / 外卖骑手',
   appearance: '整体第一眼气质印象',
   skin: '如：自然暖白肤色，眼下微青',
   face: '如：柔和鹅蛋脸 / 清晰方脸下颌线',
   eyes: '如：双眸温和 / 单眼皮深棕虹膜',
   brows: '如：细长自然弯眉 / 平直浓眉',
   nose: '如：小巧鼻梁 / 挺拔高鼻梁',
   lips: '如：自然唇形 / 偏薄克制唇峰',
   hair: '如：齐肩微湿短发 / 利落碎发',
   hairColor: '如：深黑自然发色',
   makeup: '如：素颜淡淡疲惫感',
   outfit: '如：米白防雨风衣 / 深蓝旧冲锋衣',
   accessories: '如：透明雨伞、旧帆布包',
   habits: '如：微低头揉指节',
   voice: '如：温柔略哑 / 沉稳低声',
   language: '如：普通话 / 粤语',
   variant: '如：雨夜湿发日常版'
  };
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box">
     <div class="modal-head"><span>${uiIcon('character-ref', 'modal-title-svg')}<span>${m.isNew ? '新增角色定妆卡' : '编辑角色定妆卡'}</span></span><button class="btn btn-sm" data-close-modal="1" title="关闭">${uiIcon('close')}</button></div>
     <div class="modal-body">
      <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
       <span style="font-size:11px;color:var(--text-muted);">五官预设：</span>
       ${(FACE_PRESETS || []).map((fp, i) => `<button class="pill-btn" data-apply-face="${i}">${esc(fp.name)}</button>`).join('')}
      </div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:7px 10px;background:#121215;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;">
       <div style="display:flex;align-items:center;gap:6px;flex:1 1 180px;">
        <label for="charField_role" style="font-size:11px;color:var(--text-muted);white-space:nowrap;">角色定位</label>
        <input id="charField_role" class="input" data-char-draft="role" value="${esc(c.role || '')}" placeholder="如：女主 / 男主 / 配角" />
       </div>
       <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--jy-teal);font-weight:600;cursor:pointer;">
        <input type="checkbox" data-char-lock="1"${c.lockIdentity ? ' checked' : ''} /> 锁定跨镜头外貌身份一致
       </label>
      </div>
      <div class="field" style="margin-bottom:10px;">
       <label for="charField_refImage">人物三视图 / 云端或本地参考图锁定</label>
       <input id="charField_refImage" class="input" data-char-draft="refImage" value="${esc(c.refImage || '')}" placeholder="粘贴云端三视图 URL 或从下方上传本地定妆图…" style="margin-bottom:4px;" />
       <input type="file" id="charRefImgInput" accept="image/*" style="font-size:11px;" />
       ${c.refImage ? `
        <div class="ref-thumb-row">
         <img class="ref-thumb-img" src="${esc(c.refImage)}" alt="角色参考图" />
         <span style="font-size:11px;color:var(--text-muted);flex:1 1 auto;">已绑定角色定妆参考图（导出提示词自动引用）</span>
         <button class="btn btn-sm btn-danger" data-action="clear-char-ref-img">移除</button>
        </div>` : ''}
      </div>
      <div class="field-grid">
       ${CHARACTER_FIELDS.map(([key, label]) => `<div class="field"><label for="charField_${esc(key)}">${esc(label)}</label><input id="charField_${esc(key)}" class="input" data-char-draft="${esc(key)}" value="${esc(c[key] || '')}" placeholder="${esc(charPlaceholders[key] || '')}" /></div>`).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
       <button class="btn" data-close-modal="1">取消</button>
       <button class="btn btn-jy" data-action="save-char-draft">保存角色</button>
      </div>
     </div>
    </div>
   </div>`;
 }

 if (m.type === 'confirm') {
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box" style="width:min(440px,94vw);">
     <div class="modal-head"><span>${esc(m.title || '确认操作')}</span><button class="btn btn-sm" data-close-modal="1">${uiIcon('close')}</button></div>
     <div class="modal-body">
      <div style="font-size:13px;line-height:1.6;color:var(--text-main);margin-bottom:16px;">${esc(m.message || '')}</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
       <button class="btn" data-close-modal="1">取消</button>
       <button class="btn ${m.danger ? 'btn-danger' : 'btn-jy'}" data-action="confirm-modal-ok">${esc(m.confirmLabel || '确定')}</button>
      </div>
     </div>
    </div>
   </div>`;
 }

 if (m.type === 'rename') {
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box" style="width:min(440px,94vw);">
     <div class="modal-head"><span>${uiIcon('text', 'modal-title-svg')}<span>重命名草稿</span></span><button class="btn btn-sm" data-close-modal="1">${uiIcon('close')}</button></div>
     <div class="modal-body">
      <div class="field" style="margin-bottom:14px;">
       <label>新草稿名称</label>
       <input id="renameDraftInput" class="input" value="${esc(m.title || '')}" />
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
       <button class="btn" data-close-modal="1">取消</button>
       <button class="btn btn-jy" data-action="confirm-rename-draft">保存名称</button>
      </div>
     </div>
    </div>
   </div>`;
 }

 if (m.type === 'help') {
  const rows = [...(appState.history || [])].reverse();
  const shortcuts = [
   ['撤销上一步', 'Ctrl + Z'],
   ['重做下一步', 'Ctrl + Y / Ctrl+Shift+Z'],
   ['播放 / 暂停预览', 'Space 空格'],
   ['在播放头分割片段', 'B 或 S'],
   ['删除当前选中片段', 'Delete / Backspace'],
   ['微调 / 快进播放头', '← / →（+Shift 加速）'],
   ['批量多选片段', 'Ctrl / Shift + 单击片段']
  ];
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box">
     <div class="modal-head"><span>${uiIcon('timer', 'modal-title-svg')}<span>快捷键说明与操作撤销历史</span></span><button class="btn btn-sm" data-close-modal="1">${uiIcon('close')}</button></div>
     <div class="modal-body">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--jy-teal);">常用剪辑快捷键</div>
      <div class="shortcut-grid">
       ${shortcuts.map(([name, kbd]) => `<div class="shortcut-row"><span>${esc(name)}</span><span class="kbd-badge">${esc(kbd)}</span></div>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
       <span style="font-size:12px;font-weight:700;color:var(--jy-teal);">本次会话历史记录 (${rows.length} 条可撤销)</span>
       <div style="display:flex;gap:6px;">
        <button class="btn btn-sm" data-action="undo"${appState.history.length ? '' : ' disabled'}>${uiIcon('undo')}<span>撤销一步</span></button>
        <button class="btn btn-sm" data-action="redo"${appState.future.length ? '' : ' disabled'}>${uiIcon('redo')}<span>重做</span></button>
       </div>
      </div>
      <div class="history-list">
       ${rows.length ? rows.map((h, i) => `
        <div class="history-item">
         <span>#${rows.length - i} · ${esc(h.label || '编辑操作')}</span>
         <span>${esc(formatDateShort(h.ts))}</span>
        </div>`).join('') : '<div style="font-size:12px;color:var(--text-dim);padding:10px;">当前会话暂无修改记录。</div>'}
      </div>
     </div>
    </div>
   </div>`;
 }

 if (m.type === 'scene') {
  const s = m.draft;
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box">
     <div class="modal-head"><span>${uiIcon('gallery', 'modal-title-svg')}<span>编辑场景空间锚点</span></span><button class="btn btn-sm" data-close-modal="1" title="关闭">${uiIcon('close')}</button></div>
     <div class="modal-body">
      <div class="field-grid">
       ${SCENE_FIELDS.map(([key, label]) => `<div class="field ${key === 'description' ? 'full' : ''}"><label>${esc(label)}</label><input class="input" data-scene-draft="${esc(key)}" value="${esc(s[key] || '')}" /></div>`).join('')}
       <div class="field"><label>天气</label><select class="select" data-scene-draft="weather">${renderSelectOptions('weather', s.weather)}</select></div>
       <div class="field"><label>时段</label><select class="select" data-scene-draft="time">${renderSelectOptions('time', s.time)}</select></div>
       <div class="field"><label>光源</label><select class="select" data-scene-draft="lightSource">${renderSelectOptions('lightSource', s.lightSource)}</select></div>
       <div class="field"><label>光向</label><select class="select" data-scene-draft="lightDirection">${renderSelectOptions('lightDirection', s.lightDirection)}</select></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
       <button class="btn" data-close-modal="1">取消</button>
       <button class="btn btn-jy" data-action="save-scene-draft">保存场景</button>
      </div>
     </div>
    </div>
   </div>`;
 }

 if (m.type === 'ai-guide') {
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box">
     <div class="modal-head"><span>${uiIcon('ai-spark', 'modal-title-svg')}<span>内置 Google Hydrogen AI 接入说明</span></span><button class="btn btn-sm" data-close-modal="1">${uiIcon('close')}</button></div>
     <div class="modal-body" style="font-size:12.5px;line-height:1.65;color:var(--text-main);">
      <div class="modal-alert info">本工作台坚持 <b>0 AI 强制依赖</b>（随时可用左侧方块纯手动从 00:00 剪辑），同时在首页与工作台左侧内置可选 AI 导演助手。</div>
      <ul style="padding-left:18px;margin:8px 0 12px;color:var(--text-muted);display:flex;flex-direction:column;gap:6px;">
       <li><b>默认模型与推理深度：</b>默认调用 Google <code>gemini-4-hydrogen</code> 并开启 <code>thinkingLevel: "high"</code> 高强度深度思考推理，严格统筹角色外貌、首尾承接与五轨时间对齐。</li>
       <li><b>浏览器直连模式：</b>适用于 GitHub Pages 纯静态网页及本地预览。在页面填写你在 Google AI Studio 获取的 API Key 后直接请求官方接口，消耗你自己的额度。</li>
       <li><b>密钥隐私保障：</b>你的 API Key <b>仅暂存于当前标签页内存</b>，绝不会写入草稿工程、IndexedDB 或导出的 <code>.jingxu2.json</code> 文件；刷新页面后需重新粘贴。</li>
       <li><b>提前预选生成：</b>支持先选好画面美学、色彩影调、运镜偏好、分镜数、人物颜值与肤质档位、A2 配乐流派及负向词，AI 将严格按所选生成 <code>V1/T1/A1/A2/E1</code> 五轨内容。</li>
      </ul>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;">
       <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" class="btn btn-sm">前往 Google AI Studio 获取密钥</a>
       <button class="btn btn-jy" data-close-modal="1">知道了</button>
      </div>
     </div>
    </div>
   </div>`;
 }

 if (m.type === 'muse-guide') {
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box">
     <div class="modal-head"><span>${uiIcon('video-studio', 'modal-title-svg')}<span>Muse 视频引擎接入与使用教程</span></span><button class="btn btn-sm" data-close-modal="1">${uiIcon('close')}</button></div>
     <div class="modal-body" style="font-size:12.5px;line-height:1.65;color:var(--text-main);">
      <div class="modal-alert info">镜序 2.0 内置接入 <code>MuseCanvas (0.23.2)</code> 双引擎：直接在本页面内即可完成账号配置、模型连接、分镜提示词导入与成片播放。</div>
      <ol style="padding-left:18px;margin:8px 0 12px;color:var(--text-muted);display:flex;flex-direction:column;gap:6px;">
       <li><b>原理解析 · Cookie 会话账号池：</b>本机并不保存或上传你的明文密码，而是由本地螺旋池（<code>18610</code>）读取 <code>muse.ai</code> 的 <code>hatch_sess</code>（约 30 天）和 <code>hatch_vml</code>（约 2 天）凭证存入 <code>E:\\MuseCanvasData\\pool\\data\\accounts.json</code>，新接口（<code>18611</code>）与老接口（<code>18610</code>）共用同一份本地账号池。</li>
       <li><b>第一步 · 启动本地镜序与 Muse 引擎：</b>双击项目目录 <code>启动镜序2.0与Muse.bat</code> 打开 <code>http://127.0.0.1:4174/</code>（绕开 3000 端口，不与桌面软件冲突）。</li>
       <li><b>第二步 · 直接在镜序内添加账号（二选一）：</b>① 点绿色按钮「添加 Muse 账号（弹出登录窗口）」，在弹出的干净 Chrome 窗口里正常登录 <code>muse.ai</code> 后等待自动抓包关窗（注意窗口可能闪在任务栏里）；② 或在自己浏览器登录 <code>muse.ai</code> 后按 <code>F12 → Network → Headers → cookie:</code> 复制整串粘贴到「方式 B」一秒导入。</li>
       <li><b>第三步 · 校验并导入分镜生成：</b>在账号列表点「校验测试 / 同步新接口」确认绿标可用后，从下方导入任意 2.0 草稿或单镜提示词即可生成并下载 MP4。</li>
      </ol>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
       <button class="btn btn-jy" data-close-modal="1">我已了解</button>
      </div>
     </div>
    </div>
   </div>`;
 }

 return '';
}

function focusDescriptor(el) {
 if (!el || el === document.body || !rootEl.contains(el)) return null;
 if (el.id) return { sel: `#${el.id}` };
 if (el.dataset?.clipNum) return { sel: `[data-clip-num="${el.dataset.clipNum}"]` };
 if (el.dataset?.clipField) return { sel: `[data-clip-field="${el.dataset.clipField}"]` };
 if (el.dataset?.projField) return { sel: `[data-proj-field="${el.dataset.projField}"]` };
 if (el.dataset?.customAspect) return { sel: `[data-custom-aspect="${el.dataset.customAspect}"]` };
 if (el.dataset?.customRes) return { sel: `[data-custom-res="${el.dataset.customRes}"]` };
 if (el.dataset?.aiConn) return { sel: `[data-ai-conn="${el.dataset.aiConn}"]` };
 if (el.dataset?.aiBrief) return { sel: `[data-ai-brief="${el.dataset.aiBrief}"]` };
 if (el.dataset?.aiBriefNum) return { sel: `[data-ai-brief-num="${el.dataset.aiBriefNum}"]` };
 if (el.dataset?.museCfg) return { sel: `[data-muse-cfg="${el.dataset.museCfg}"]` };
 if (el.dataset?.museField) return { sel: `[data-muse-field="${el.dataset.museField}"]` };
 if (el.dataset?.museNum) return { sel: `[data-muse-num="${el.dataset.museNum}"]` };
 if (el.dataset?.museAccInput) return { sel: `[data-muse-acc-input="${el.dataset.museAccInput}"]` };
 return null;
}

function render(preserveOtherFocus = false) {
 const tlViewport = document.getElementById('tlViewport');
 const prevScrollLeft = tlViewport ? tlViewport.scrollLeft : 0;
 const activeDesc = preserveOtherFocus ? focusDescriptor(document.activeElement) : null;

 rootEl.innerHTML = (appState.screen === 'home' ? renderHomeScreen() : renderEditorScreen()) + renderModal();

 const newVp = document.getElementById('tlViewport');
 if (newVp && prevScrollLeft > 0) newVp.scrollLeft = prevScrollLeft;
 bindTransientInputs();
 if (activeDesc) {
  const targetFocus = rootEl.querySelector(activeDesc.sel);
  if (targetFocus && document.activeElement !== targetFocus) {
   targetFocus.focus();
  }
 }
}

function bindTransientInputs() {
 const scrub = document.getElementById('monitorScrubber');
 if (scrub) {
  scrub.addEventListener('input', (e) => {
   stopPlayback();
   appState.project.playhead = roundT(Number(e.target.value) || 0);
   updatePlayheadVisuals();
  });
 }

 const zoom = document.getElementById('zoomSlider');
 if (zoom) {
  zoom.addEventListener('input', (e) => {
   appState.project.zoom = Number(e.target.value) || 72;
   scheduleSave();
   render();
  });
 }

 const resSearch = document.getElementById('resSearchInput');
 if (resSearch) {
  resSearch.addEventListener('input', (e) => {
   appState.resSearch = e.target.value;
   render();
   const next = document.getElementById('resSearchInput');
   if (next) {
    next.focus();
    const len = next.value.length;
    next.setSelectionRange(len, len);
   }
  });
 }

 const draftSearch = document.getElementById('draftSearchInput');
 if (draftSearch) {
  draftSearch.addEventListener('input', (e) => {
   appState.draftFilter = e.target.value;
   render();
   const next = document.getElementById('draftSearchInput');
   if (next) {
    next.focus();
    const len = next.value.length;
    next.setSelectionRange(len, len);
   }
  });
 }

 const refInput = document.getElementById('refImgInput');
 if (refInput) {
  refInput.addEventListener('change', async (e) => {
   const file = e.target.files?.[0];
   const clip = selectedClipObj();
   if (!file || !clip || trackKind(appState.project.selected?.track) !== 'video') return;
   const dataUrl = await compressImageToDataUrl(file, 640);
   pushUndo(null, '设置首帧参考图');
   clip.startRefImage = dataUrl;
   clip.refImage = dataUrl;
   scheduleSave();
   render();
   showToast('已更新分镜首帧参考图');
  });
 }

 const endRefInput = document.getElementById('endRefImgInput');
 if (endRefInput) {
  endRefInput.addEventListener('change', async (e) => {
   const file = e.target.files?.[0];
   const clip = selectedClipObj();
   if (!file || !clip || trackKind(appState.project.selected?.track) !== 'video') return;
   const dataUrl = await compressImageToDataUrl(file, 640);
   pushUndo(null, '设置尾帧参考图');
   clip.endRefImage = dataUrl;
   scheduleSave();
   render();
   showToast('已更新分镜尾帧参考图');
  });
 }

 const charRefInput = document.getElementById('charRefImgInput');
 if (charRefInput) {
  charRefInput.addEventListener('change', async (e) => {
   const file = e.target.files?.[0];
   if (!file || appState.modal?.type !== 'char') return;
   const dataUrl = await compressImageToDataUrl(file, 640);
   appState.modal.draft.refImage = dataUrl;
   render();
   showToast('已载入角色定妆参考图');
  });
 }

 const customNegInput = document.getElementById('customNegInput');
 if (customNegInput) {
  customNegInput.addEventListener('keydown', (e) => {
   if (e.key === 'Enter') {
    e.preventDefault();
    commitCustomNegativeInput();
   }
  });
 }

 const renameInput = document.getElementById('renameDraftInput');
 if (renameInput) {
  renameInput.addEventListener('keydown', (e) => {
   if (e.key === 'Enter') {
    e.preventDefault();
    rootEl.querySelector('[data-action="confirm-rename-draft"]')?.click();
   }
  });
 }

 const importFile = document.getElementById('importFileInput');
 if (importFile) {
  importFile.addEventListener('change', async (e) => {
   const file = e.target.files?.[0];
   if (!file) return;
   try {
    const raw = await file.text();
    if (!raw.trim()) throw new Error(`所选文件「${file.name}」内容为空。`);
    await loadImportedText(raw);
   } catch (err) {
    if (appState.modal?.type === 'import') {
     appState.modal.error = err.message;
     render();
    }
    showToast(`导入失败：${err.message}`);
   }
  });
 }

 const museFirstInput = document.getElementById('museFirstFrameInput');
 if (museFirstInput) {
  museFirstInput.addEventListener('change', async (e) => {
   const file = e.target.files?.[0];
   if (!file) return;
   appState.muse.firstFrame = await compressImageToDataUrl(file, 960);
   render(true);
   showToast('已载入首帧参考图');
  });
 }

 const museLastInput = document.getElementById('museLastFrameInput');
 if (museLastInput) {
  museLastInput.addEventListener('change', async (e) => {
   const file = e.target.files?.[0];
   if (!file) return;
   appState.muse.lastFrame = await compressImageToDataUrl(file, 960);
   render(true);
   showToast('已载入尾帧参考图');
  });
 }

 const museRefsInput = document.getElementById('museRefImagesInput');
 if (museRefsInput) {
  museRefsInput.addEventListener('change', async (e) => {
   const files = Array.from(e.target.files || []).slice(0, 6);
   if (!files.length) return;
   const imgs = [];
   for (const f of files) imgs.push(await compressImageToDataUrl(f, 960));
   appState.muse.refImages = [...appState.muse.refImages, ...imgs].slice(0, 8);
   render(true);
   showToast(`已载入 ${imgs.length} 张参考图片`);
  });
 }
}

function commitCustomNegativeInput() {
 const input = document.getElementById('customNegInput');
 const raw = (input?.value || '').trim();
 if (!raw) { showToast('请先输入自定义负向关键词'); return; }
 const cur = parseCustomNegativeTags(appState.project.customNegative);
 const added = parseCustomNegativeTags(raw).filter((t) => !cur.includes(t));
 if (!added.length) { showToast('该负向关键词已存在'); if (input) input.value = ''; return; }
 pushUndo(null, `添加负向词 ${added[0]}`);
 appState.project.customNegative = [...cur, ...added].join(', ');
 scheduleSave();
 render();
 showToast(`已添加自定义负向词：${added.join('、')}`);
}

function compressImageToDataUrl(file, maxW = 640) {
 return new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('读取图片失败'));
  reader.onload = () => {
   const img = new Image();
   img.onerror = () => reject(new Error('无效图片'));
   img.onload = () => {
    const scale = img.width > maxW ? maxW / img.width : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/jpeg', 0.82));
   };
   img.src = reader.result;
  };
  reader.readAsDataURL(file);
 });
}

async function loadImportedText(rawText) {
 const nextProj = parseAnyProjectImport(rawText, { rekey: true });
 if (appState.screen === 'editor' && hasProjectContent(appState.project)) {
  try { await saveProject(appState.project); } catch {}
 }
 pushUndo(null, '导入工程');
 appState.project = nextProj;
 appState.multiSelected = [];
 appState.modal = null;
 appState.screen = 'editor';
 await saveProject(nextProj);
 lastProject(nextProj.id);
 await refreshDraftsCache();
 render();
 showToast(`导入成功：已载入 ${nextProj.tracks.video.length} 个分镜`);
}

function downloadBlob(filename, content, mime = 'text/plain;charset=utf-8') {
 const blob = new Blob([content], { type: mime });
 const a = document.createElement('a');
 a.href = URL.createObjectURL(blob);
 a.download = filename;
 document.body.appendChild(a);
 a.click();
 setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

/* =========================================================
   DELEGATED EVENTS
========================================================= */
rootEl.addEventListener('focusin', (e) => {
 if (e.target.closest('[data-ai-conn],[data-ai-brief],[data-ai-brief-num],[data-ai-brief-bool],[data-ai-scope],[data-ai-apply-mode],[data-ai-auto-apply],[data-muse-cfg],[data-muse-api-key],[data-muse-bool],[data-muse-src],[data-muse-field],[data-muse-num],[data-muse-opt-bool],[data-muse-manual-url],[data-muse-acc-input]')) return;
 if (e.target.closest('input, textarea, select') && !appState.pendingEditSnapshot) {
  appState.pendingEditSnapshot = { label: '参数编辑', project: clone(appState.project) };
 }
});

rootEl.addEventListener('input', (e) => {
 const el = e.target;
 if (el.dataset.museApiKey) {
  appState.muse.apiKey = el.value;
  return;
 }
 if (el.dataset.museManualUrl) {
  appState.muse.manualUrlInput = el.value;
  return;
 }
 if (el.dataset.museAccInput) {
  appState.muse[el.dataset.museAccInput] = el.value;
  return;
 }
 if (el.dataset.museCfg && el.tagName !== 'SELECT') {
  appState.muse.config[el.dataset.museCfg] = el.value;
  return;
 }
 if (el.dataset.museField && el.tagName !== 'SELECT') {
  appState.muse[el.dataset.museField] = el.value;
  return;
 }
 if (el.dataset.museNum) {
  const num = Number(el.value);
  if (Number.isFinite(num)) appState.muse[el.dataset.museNum] = num;
  return;
 }

 const aiConnField = el.dataset.aiConn;
 if (aiConnField) {
  if (aiConnField === 'apiKey') {
   appState.aiConn.apiKey = el.value;
   appState.aiConn.verified = false;
  } else if (aiConnField === 'model') {
   appState.aiConn.model = el.value;
   appState.aiConn.verified = false;
  }
  return;
 }
 const aiBriefField = el.dataset.aiBrief;
 if (aiBriefField && el.tagName !== 'SELECT') {
  appState.aiBrief[aiBriefField] = el.value;
  persistAppPrefs();
  return;
 }
 if (el.dataset.aiBriefNum) {
  const num = Number(el.value);
  if (Number.isFinite(num)) {
   appState.aiBrief[el.dataset.aiBriefNum] = num;
   persistAppPrefs();
  }
  return;
 }

 const clipField = el.dataset.clipField;
 const projField = el.dataset.projField;
 const charDraft = el.dataset.charDraft;
 const sceneDraft = el.dataset.sceneDraft;

 if (charDraft && appState.modal?.type === 'char') { appState.modal.draft[charDraft] = el.value; return; }
 if (sceneDraft && appState.modal?.type === 'scene') { appState.modal.draft[sceneDraft] = el.value; return; }

 if (el.dataset.customAspect) {
  const parts = String(appState.project.customAspect || '21:9').split(/[:xX/×]/);
  let w = parts[0] || '21';
  let h = parts[1] || '9';
  if (el.dataset.customAspect === 'w') w = el.value || '16';
  else h = el.value || '9';
  appState.project.customAspect = `${w}:${h}`;
  scheduleSave();
  updateCompiledAndLiveViews();
  return;
 }

 if (el.dataset.customRes) {
  const cur = parseCustomResolution(appState.project.customResolution || '2560x1080');
  const w = el.dataset.customRes === 'w' ? Math.max(64, Number(el.value) || cur.w) : cur.w;
  const h = el.dataset.customRes === 'h' ? Math.max(64, Number(el.value) || cur.h) : cur.h;
  appState.project.customResolution = `${w}x${h}`;
  scheduleSave();
  updateCompiledAndLiveViews();
  return;
 }

 const clip = selectedClipObj();
 if (clipField && clip && el.tagName !== 'SELECT') {
  clip[clipField] = el.value;
  if (clipField === 'startRefImage') clip.refImage = el.value;
  scheduleSave();
  updateCompiledAndLiveViews();
  return;
 }
 if (projField && el.tagName !== 'SELECT') {
  appState.project[projField] = el.value;
  scheduleSave();
  updateCompiledAndLiveViews();
 }
});

rootEl.addEventListener('change', async (e) => {
 const el = e.target;
 if (el.dataset.museCfg) {
  const k = el.dataset.museCfg;
  if (k === 'channel') {
   const meta = MUSE_CHANNELS.find((c) => c.id === el.value) || MUSE_CHANNELS[0];
   appState.muse.config = normalizeMuseConfig({
    ...appState.muse.config,
    channel: meta.id,
    baseUrl: meta.baseUrl || (meta.id === 'custom' ? appState.muse.config.baseUrl : ''),
    model: meta.defaultModel
   });
   appState.muse.reachable = false;
  } else {
   appState.muse.config = normalizeMuseConfig({ ...appState.muse.config, [k]: el.value });
  }
  persistAppPrefs();
  render(true);
  return;
 }
 if (el.dataset.museBool) {
  appState.muse.config = normalizeMuseConfig({ ...appState.muse.config, [el.dataset.museBool]: Boolean(el.checked) });
  persistAppPrefs();
  render(true);
  return;
 }
 if (el.dataset.museSrc) {
  if (el.dataset.museSrc === 'draft') {
   appState.muse.sourceDraftId = el.value;
   appState.muse.sourceShotIdx = -1;
  } else {
   appState.muse.sourceShotIdx = Number(el.value);
  }
  render(true);
  return;
 }
 if (el.dataset.museField) {
  appState.muse[el.dataset.museField] = el.value;
  if (el.tagName === 'SELECT') render(true);
  return;
 }
 if (el.dataset.museNum) {
  appState.muse[el.dataset.museNum] = clampMuseSeconds(el.value, appState.muse.config.model);
  render(true);
  return;
 }
 if (el.dataset.museOptBool) {
  appState.muse[el.dataset.museOptBool] = Boolean(el.checked);
  render(true);
  return;
 }

 if (el.dataset.aiConn) {
  const k = el.dataset.aiConn;
  if (k === 'apiKey') {
   appState.aiConn.apiKey = el.value.trim();
   appState.aiConn.verified = false;
  } else if (k === 'model') {
   appState.aiConn.model = el.value.trim() || DEFAULT_AI_MODEL;
   appState.aiConn.verified = false;
  } else if (k === 'thinkingLevel') {
   appState.aiConn.thinkingLevel = el.value || DEFAULT_THINKING_LEVEL;
  } else if (k === 'transport') {
   appState.aiConn.transport = el.value === 'server' ? 'server' : 'browser';
   if (appState.aiConn.transport === 'server') {
    await probeServerConfigIfLocal(true);
    if (appState.aiConn.staticHost) {
     appState.aiConn.statusMsg = '当前页面运行于纯静态托管（无后端 /api 接口），建议切回「浏览器直连」。';
     appState.aiConn.statusError = true;
    }
   }
  }
  persistAppPrefs();
  render(true);
  return;
 }
 if (el.dataset.aiBrief) {
  appState.aiBrief[el.dataset.aiBrief] = el.value;
  appState.aiBrief = normalizeAIBrief(appState.aiBrief);
  persistAppPrefs();
  if (el.tagName === 'SELECT') render(true);
  return;
 }
 if (el.dataset.aiBriefNum) {
  const num = Number(el.value);
  if (Number.isFinite(num)) appState.aiBrief[el.dataset.aiBriefNum] = num;
  appState.aiBrief = normalizeAIBrief(appState.aiBrief);
  persistAppPrefs();
  render(true);
  return;
 }
 if (el.dataset.aiBriefBool) {
  appState.aiBrief[el.dataset.aiBriefBool] = Boolean(el.checked);
  appState.aiBrief = normalizeAIBrief(appState.aiBrief);
  persistAppPrefs();
  render(true);
  return;
 }
 if (el.dataset.aiScope) {
  appState.aiScopes[el.dataset.aiScope] = Boolean(el.checked);
  render(true);
  return;
 }
 if (el.dataset.aiApplyMode) {
  appState.aiApplyMode = el.value === 'new' ? 'new' : 'fill';
  render(true);
  return;
 }
 if (el.dataset.aiAutoApply) {
  appState.aiAutoApply = Boolean(el.checked);
  render(true);
  return;
 }

 const clip = selectedClipObj();
 const clipField = el.dataset.clipField;
 const clipNum = el.dataset.clipNum;
 const clipBool = el.dataset.clipBool;
 const projField = el.dataset.projField;
 const projNum = el.dataset.projNum;
 const charLock = el.dataset.charLock;
 const sceneDraft = el.dataset.sceneDraft;

 if (charLock && appState.modal?.type === 'char') { appState.modal.draft.lockIdentity = Boolean(el.checked); return; }
 if (sceneDraft && appState.modal?.type === 'scene') { appState.modal.draft[sceneDraft] = el.value; return; }

 if (el.dataset.customAspect || el.dataset.customRes) {
  if (appState.pendingEditSnapshot) {
   pushUndo(appState.pendingEditSnapshot, '修改自定义画幅参数');
   appState.pendingEditSnapshot = null;
  }
  scheduleSave();
  render();
  return;
 }

 if (appState.pendingEditSnapshot) {
  pushUndo(appState.pendingEditSnapshot, '调整参数');
  appState.pendingEditSnapshot = null;
 }

 if (clipField && clip) {
  clip[clipField] = el.value;
  if (clipField === 'startRefImage') clip.refImage = el.value;
  if (clipField === 'transitionIn') {
   clip.transitionDur = Number(groupItem('transition', el.value)?.dur ?? 0);
  }
  if (clipField === 'transitionOut') {
   clip.transitionOutDur = el.value ? Number(groupItem('transition', el.value)?.dur ?? 0.6) : 0;
  }
  scheduleSave();
  if (el.tagName !== 'SELECT') {
   updateCompiledAndLiveViews();
  } else {
   render(true);
  }
  return;
 }
 if (clipNum && clip) {
  const track = appState.project.selected.track;
  const val = Number(el.value);
  if (Number.isFinite(val)) {
   if (clipNum === 'transitionDur') clip.transitionDur = roundT(Math.max(0, Math.min(2, val)));
   else if (clipNum === 'transitionOutDur') clip.transitionOutDur = roundT(Math.max(0, Math.min(2, val)));
   else if (clipNum === 'fadeIn' || clipNum === 'fadeOut') clip[clipNum] = roundT(Math.max(0, Math.min(10, val)));
   else if (clipNum === 'start') moveClip(appState.project, track, clip.id, Math.max(0, val));
   else if (clipNum === 'duration') trimClip(appState.project, track, clip.id, 'right', roundT(clip.start + Math.max(0.5, val)));
  }
  scheduleSave();
  render(true);
  return;
 }
 if (clipBool && clip) {
  clip[clipBool] = Boolean(el.checked);
  scheduleSave();
  render(true);
  return;
 }
 if (projField) {
  appState.project[projField] = el.value;
  if (projField === 'format' && el.value === 'custom' && !appState.project.customAspect) {
   appState.project.customAspect = '21:9';
  }
  if (projField === 'resolution' && el.value === 'custom' && !appState.project.customResolution) {
   appState.project.customResolution = '2560x1080';
  }
  scheduleSave();
  if (el.tagName !== 'SELECT') {
   updateCompiledAndLiveViews();
  } else {
   render(true);
  }
  return;
 }
 if (projNum) {
  appState.project[projNum] = Number(el.value) || 24;
  scheduleSave();
  render();
 }
});

rootEl.addEventListener('click', async (e) => {
 const target = e.target;

 if (appState.trackMenuOpen && !target.closest('.tl-dropdown-wrap') && !target.closest('[data-action="toggle-track-menu"]')) {
  appState.trackMenuOpen = false;
  if (!target.closest('button, input, select, [data-open-draft], [data-preset-id], [data-apply-group]')) {
   render();
   return;
  }
 }

 if (target.closest('[data-close-modal]')) {
  if (target.dataset.closeModal || target.closest('button[data-close-modal]') || target.classList.contains('modal-backdrop')) {
   appState.modal = null;
   render();
   return;
  }
 }

 // Home Sidebar Tabs
 const homeTabBtn = target.closest('[data-home-tab]');
 if (homeTabBtn) {
  appState.homeTab = homeTabBtn.dataset.homeTab;
  appState.showTrash = false;
  await refreshDraftsCache();
  render();
  if (appState.homeTab === 'video' && !appState.muse.staticHost && !appState.muse.accountsLoading) {
   refreshMuseAccountPool(true);
   refreshMuseServerRecords(true);
   if (!appState.muse.netCheck) refreshMuseProtocolNet(false);
  }
  return;
 }

 // Rename / Clone / Soft-Delete / Export Draft Cards from Home & Cloud
 const renameDraftBtn = target.closest('[data-rename-draft]');
 if (renameDraftBtn) {
  e.stopPropagation();
  const item = await loadProject(renameDraftBtn.dataset.renameDraft);
  if (item) {
   appState.modal = { type: 'rename', draftId: item.id, title: item.title || '' };
   render();
   requestAnimationFrame(() => document.getElementById('renameDraftInput')?.select());
  }
  return;
 }

 const cloneDraftBtn = target.closest('[data-clone-draft]');
 if (cloneDraftBtn) {
  e.stopPropagation();
  const item = await loadProject(cloneDraftBtn.dataset.cloneDraft);
  if (item) {
   const cloned = cloneProject(item);
   await saveProject(cloned);
   await refreshDraftsCache();
   render();
   showToast(`已创建草稿副本「${cloned.title}」`);
  }
  return;
 }

 const delDraftBtn = target.closest('[data-del-draft]');
 if (delDraftBtn) {
  e.stopPropagation();
  const item = await loadProject(delDraftBtn.dataset.delDraft);
  const title = item?.title || '未命名草稿';
  appState.modal = {
   type: 'confirm',
   title: '移入回收站确认',
   message: `确定将草稿「${title}」移入本地回收站吗？（可在下方回收站中随时还原，不会立即永久丢失）`,
   confirmLabel: '移入回收站',
   danger: true,
   confirmKind: 'soft-delete-draft',
   draftId: delDraftBtn.dataset.delDraft
  };
  render();
  return;
 }

 const restoreTrashBtn = target.closest('[data-restore-trash]');
 if (restoreTrashBtn) {
  e.stopPropagation();
  await restoreProject(restoreTrashBtn.dataset.restoreTrash);
  await refreshDraftsCache();
  render();
  showToast('已从回收站还原草稿');
  return;
 }

 const purgeTrashBtn = target.closest('[data-purge-trash]');
 if (purgeTrashBtn) {
  e.stopPropagation();
  appState.modal = {
   type: 'confirm',
   title: '彻底删除草稿',
   message: '彻底清除后该草稿将无法从 IndexedDB 恢复，确定永久删除吗？',
   confirmLabel: '彻底删除',
   danger: true,
   confirmKind: 'purge-trash',
   draftId: purgeTrashBtn.dataset.purgeTrash
  };
  render();
  return;
 }

 const expDraftBtn = target.closest('[data-export-draft]');
 if (expDraftBtn) {
  e.stopPropagation();
  const item = await loadProject(expDraftBtn.dataset.exportDraft);
  if (item) {
   downloadBlob(`${(item.title || 'draft').replace(/[\\/:*?"<>|\s]+/g, '_')}.jingxu2.json`, JSON.stringify(item, null, 2), 'application/json;charset=utf-8');
  }
  return;
 }

 const openDraftCard = target.closest('[data-open-draft]');
 if (openDraftCard) {
  const loaded = await loadProject(openDraftCard.dataset.openDraft);
  if (loaded) {
   stopPlayback();
   appState.project = parseAnyProjectImport(loaded, { rekey: false });
   lastProject(appState.project.id);
   appState.history = [];
   appState.future = [];
   appState.multiSelected = [];
   appState.screen = 'editor';
   render();
  }
  return;
 }

 // Use Template from Square
 const tplBtn = target.closest('[data-use-template]');
 if (tplBtn) {
  const tpl = NLE_SQUARE_TEMPLATES.find((x) => x.id === tplBtn.dataset.useTemplate);
  if (tpl) {
   const next = tpl.seed ? parseAnyProjectImport({ version: 2, ...tpl.seed }, { rekey: true }) : createDemoProject();
   appState.project = next;
   appState.history = [];
   appState.future = [];
   appState.multiSelected = [];
   appState.screen = 'editor';
   await saveProject(next);
   lastProject(next.id);
   await refreshDraftsCache();
   render();
   showToast(`已套用模板「${tpl.title}」`);
  }
  return;
 }

 // Import Modal Tabs
 const importTabBtn = target.closest('[data-import-tab-switch]');
 if (importTabBtn && appState.modal?.type === 'import') {
  appState.modal.tab = importTabBtn.dataset.importTabSwitch === 'v1' ? 'v1' : 'v2';
  appState.modal.error = '';
  appState.modal.text = document.getElementById('importPasteBox')?.value || appState.modal.text || '';
  render();
  return;
 }

 // Editor Resource Tabs & Categories
 const resTabBtn = target.closest('[data-res-tab]');
 if (resTabBtn) {
  appState.resTab = resTabBtn.dataset.resTab;
  appState.resSearch = '';
  render();
  return;
 }

 const resCatBtn = target.closest('[data-res-cat]');
 if (resCatBtn) {
  appState.resSubCat = resCatBtn.dataset.resCat;
  render();
  return;
 }

 // Create / Remove / Toggle Tracks
 const newTrackBtn = target.closest('[data-new-track-kind]');
 if (newTrackBtn) {
  const kind = newTrackBtn.dataset.newTrackKind;
  stopPlayback();
  pushUndo(null, '新建时间轴轨道');
  const { track } = addExtraTrack(appState.project, kind);
  appState.trackMenuOpen = false;
  scheduleSave();
  render();
  showToast(`已新建独立轨道 ${track.code}（${track.label}）`);
  return;
 }

 const removeTrackBtn = target.closest('[data-remove-track]');
 if (removeTrackBtn) {
  const key = removeTrackBtn.dataset.removeTrack;
  stopPlayback();
  pushUndo(null, '移除扩展轨道');
  const { ok } = removeExtraTrack(appState.project, key);
  if (ok) {
   appState.multiSelected = appState.multiSelected.filter((m) => m.track !== key);
   scheduleSave();
   render();
   showToast('已删除该扩展轨道');
  } else {
   appState.history.pop();
  }
  return;
 }

 const trackToggleBtn = target.closest('[data-track-toggle]');
 if (trackToggleBtn) {
  const field = trackToggleBtn.dataset.trackToggle;
  const trKey = trackToggleBtn.dataset.trackKey;
  pushUndo(null, '切换轨道状态');
  if (!appState.project.trackMeta) appState.project.trackMeta = {};
  if (!appState.project.trackMeta[trKey]) appState.project.trackMeta[trKey] = {};
  const nextVal = !appState.project.trackMeta[trKey][field];
  appState.project.trackMeta[trKey][field] = nextVal;
  scheduleSave();
  render();
  const names = { locked: nextVal ? '轨道已锁定' : '轨道已解锁', hidden: nextVal ? '轨道已隐藏' : '轨道已恢复显示', muted: nextVal ? '轨道已静音' : '轨道已取消静音' };
  showToast(names[field] || '已切换轨道状态');
  return;
 }

 // Click Square Swatch Box (方框选择!)
 const swatchBtn = target.closest('[data-apply-group]');
 if (swatchBtn) {
  stopPlayback();
  const group = swatchBtn.dataset.applyGroup;
  const id = swatchBtn.dataset.applyId;
  const mode = swatchBtn.dataset.applyMode;

  if (mode === 'add-bgm') {
   if (isTrackLocked(appState.project, 'bgm')) { showToast('A2 配乐轨已锁定，请先点击轨道头锁图标解锁'); return; }
   pushUndo(null, `添置配乐：${groupLabel('bgm', id)}`);
   const { clip, shifted } = addClip(appState.project, 'bgm', { style: id, mood: `搭配${groupLabel('bgm', id)}` });
   appState.project.playhead = roundT(clip.start);
   scheduleSave();
   render();
   showToast(shifted ? `当前位置已有配乐，已顺延至 ${fmtTimecode(clip.start)} 插入「${groupLabel('bgm', id)}」` : `已添置 A2 配乐：${groupLabel('bgm', id)}`);
   return;
  }

  const targetVideoTrack = (appState.project.selected?.track && trackKind(appState.project.selected.track) === 'video')
   ? appState.project.selected.track
   : 'video';
  if (isTrackLocked(appState.project, targetVideoTrack)) {
   showToast('当前视频轨已锁定，请先解锁后再套用方框属性');
   return;
  }
  pushUndo(null, `套用${groupLabel(group, id)}`);
  const vClip = ensureActiveVideoClip(groupLabel(group, id) || '新分镜');
  if (mode === 'set-trans') {
   vClip.transitionIn = id;
   vClip.transitionDur = Number(groupItem('transition', id)?.dur ?? 0);
   showToast(`入画转场已设为：${groupLabel('transition', id)} (${vClip.transitionDur}s)`);
  } else if (mode === 'toggle-tex') {
   vClip.texture = vClip.texture || [];
   vClip.texture = vClip.texture.includes(id) ? vClip.texture.filter((x) => x !== id) : [...vClip.texture, id];
   showToast(`质感：${groupLabel('texture', id)}`);
  } else {
   const fieldMap = { look: 'style', color: 'color', medium: 'medium', framing: 'framing', move: 'move', angle: 'angle', lightSource: 'lightSource' };
   vClip[fieldMap[group] || group] = id;
   showToast(`已应用至「${vClip.title}」：${groupLabel(group, id)}`);
  }
  scheduleSave();
  render();
  return;
 }

 // Click Preset Card
 const presetCard = target.closest('[data-preset-id]');
 if (presetCard) {
  const preset = CLIP_PRESETS.find((x) => x.id === presetCard.dataset.presetId);
  if (preset && isTrackLocked(appState.project, preset.track)) {
   showToast(`${preset.track.toUpperCase()} 轨道已锁定，请先解锁再插入`);
   return;
  }
  stopPlayback();
  pushUndo(null, `插入积木「${preset?.label || ''}」`);
  const { clip, shifted } = addPresetClip(appState.project, presetCard.dataset.presetId);
  appState.project.playhead = roundT(clip.start);
  scheduleSave();
  render();
  const title = clipTitleLabel(appState.project.selected.track, clip);
  showToast(shifted ? `当前播放头已有片段，已自动顺延至 ${fmtTimecode(clip.start)} 插入「${title}」` : `已插入「${title}」`);
  return;
 }

 const trackAddBtn = target.closest('[data-add-on-track]');
 if (trackAddBtn) {
  const track = trackAddBtn.dataset.addOnTrack;
  if (isTrackLocked(appState.project, track)) { showToast('该轨道已锁定，请先点击轨道头锁图标解锁'); return; }
  stopPlayback();
  pushUndo(null, `添加 ${track.toUpperCase()} 片段`);
  const kind = trackKind(track);
  const spec = kind === 'video' ? { title: `分镜 ${String((appState.project.tracks[track]?.length || 0) + 1).padStart(2, '0')}` } : {};
  const { clip, shifted } = addClip(appState.project, track, spec);
  appState.project.playhead = roundT(clip.start);
  scheduleSave();
  render();
  if (shifted) showToast(`播放头位置已有片段，已自动顺延至 ${fmtTimecode(clip.start)} 排列`);
  return;
 }

 const jumpTransBtn = target.closest('[data-jump-trans]');
 if (jumpTransBtn) {
  appState.project.selected = { track: 'video', id: jumpTransBtn.dataset.jumpTrans };
  appState.multiSelected = [];
  appState.resTab = 'transitions';
  appState.resSubCat = 'all';
  const targetV = (appState.project.tracks.video || []).find((c) => c.id === jumpTransBtn.dataset.jumpTrans);
  render();
  showToast(`已选中「${targetV?.title || '分镜'}」并打开转场面板，请在左侧方框选择入画转场`);
  return;
 }

 const inspSubBtn = target.closest('[data-insp-sub]');
 if (inspSubBtn) {
  appState.inspSubTab = inspSubBtn.dataset.inspSub;
  render();
  return;
 }

 const clipCharBtn = target.closest('[data-toggle-clip-char]');
 if (clipCharBtn) {
  const clip = selectedClipObj();
  if (clip && Array.isArray(clip.characterIds)) {
   pushUndo(null, '切换入镜角色');
   const cid = clipCharBtn.dataset.toggleClipChar;
   clip.characterIds = clip.characterIds.includes(cid) ? clip.characterIds.filter((x) => x !== cid) : [...clip.characterIds, cid];
   scheduleSave();
   render();
  }
  return;
 }

 const negBtn = target.closest('[data-toggle-neg]');
 if (negBtn) {
  pushUndo(null, '切换负向避坑词');
  const nid = negBtn.dataset.toggleNeg;
  const arr = appState.project.negativePrompts || [];
  appState.project.negativePrompts = arr.includes(nid) ? arr.filter((x) => x !== nid) : [...arr, nid];
  scheduleSave();
  render();
  return;
 }

 const removeCustomNegBtn = target.closest('[data-remove-custom-neg]');
 if (removeCustomNegBtn) {
  const tag = removeCustomNegBtn.dataset.removeCustomNeg;
  pushUndo(null, `移除负向词 ${tag}`);
  const remain = parseCustomNegativeTags(appState.project.customNegative).filter((x) => x !== tag);
  appState.project.customNegative = remain.join(', ');
  scheduleSave();
  render();
  showToast(`已移除自定义负向词：${tag}`);
  return;
 }

 const jumpIssue = target.closest('[data-jump-clip]');
 if (jumpIssue) {
  const cid = jumpIssue.dataset.jumpClip;
  const tr = jumpIssue.dataset.jumpTrack;
  if (cid && tr) {
   const targetClip = (appState.project.tracks[tr] || []).find((c) => c.id === cid);
   if (targetClip) {
    appState.project.selected = { track: tr, id: cid };
    appState.multiSelected = [];
    appState.project.playhead = targetClip.start;
    render();
   }
  }
  return;
 }

 // Cast & Scene entity actions
 const editCharBtn = target.closest('[data-edit-char]');
 if (editCharBtn) {
  const found = appState.project.characters.find((c) => c.id === editCharBtn.dataset.editChar);
  if (found) { appState.modal = { type: 'char', draft: clone(found), isNew: false }; render(); }
  return;
 }
 const bindCharBtn = target.closest('[data-bind-char]');
 if (bindCharBtn) {
  const v = ensureActiveVideoClip();
  pushUndo(null, '绑定入镜角色');
  if (!v.characterIds.includes(bindCharBtn.dataset.bindChar)) v.characterIds.push(bindCharBtn.dataset.bindChar);
  scheduleSave();
  render();
  showToast(`已绑定角色至「${v.title}」`);
  return;
 }
 const delCharBtn = target.closest('[data-del-char]');
 if (delCharBtn) {
  pushUndo(null, '删除角色');
  appState.project.characters = appState.project.characters.filter((c) => c.id !== delCharBtn.dataset.delChar);
  scheduleSave();
  render();
  return;
 }
 const faceBtn = target.closest('[data-apply-face]');
 if (faceBtn && appState.modal?.type === 'char') {
  const fp = FACE_PRESETS[Number(faceBtn.dataset.applyFace)];
  if (fp) { for (const k of ['face', 'eyes', 'brows', 'nose', 'lips', 'skin']) if (fp[k]) appState.modal.draft[k] = fp[k]; render(); }
  return;
 }
 const editSceneBtn = target.closest('[data-edit-scene]');
 if (editSceneBtn) {
  const found = appState.project.scenes.find((s) => s.id === editSceneBtn.dataset.editScene);
  if (found) { appState.modal = { type: 'scene', draft: clone(found), isNew: false }; render(); }
  return;
 }
 const bindSceneBtn = target.closest('[data-bind-scene]');
 if (bindSceneBtn) {
  const v = ensureActiveVideoClip();
  pushUndo(null, '绑定分镜场景');
  v.sceneId = bindSceneBtn.dataset.bindScene;
  scheduleSave();
  render();
  showToast(`已绑定场景至「${v.title}」`);
  return;
 }
 const delSceneBtn = target.closest('[data-del-scene]');
 if (delSceneBtn) {
  pushUndo(null, '删除场景');
  appState.project.scenes = appState.project.scenes.filter((s) => s.id !== delSceneBtn.dataset.delScene);
  scheduleSave();
  render();
  return;
 }

 const aiTplBtn = target.closest('[data-ai-tpl]');
 if (aiTplBtn) {
  const tpl = AI_STORY_TEMPLATES.find((x) => x.id === aiTplBtn.dataset.aiTpl);
  if (tpl) {
   appState.aiBrief = normalizeAIBrief({ ...appState.aiBrief, ...tpl.brief, idea: tpl.idea });
   persistAppPrefs();
   render(true);
   showToast(`已套用题材预选「${tpl.label}」`);
  }
  return;
 }

 const aiNegBtn = target.closest('[data-ai-neg]');
 if (aiNegBtn) {
  const id = aiNegBtn.dataset.aiNeg;
  const set = new Set(appState.aiBrief.negativePrompts || []);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  appState.aiBrief = normalizeAIBrief({ ...appState.aiBrief, negativePrompts: [...set] });
  persistAppPrefs();
  render(true);
  return;
 }

 const museAccActBtn = target.closest('[data-muse-acc-act]');
 if (museAccActBtn) {
  const accId = museAccActBtn.dataset.museAccId;
  const act = museAccActBtn.dataset.museAccAct;
  if (act === 'relogin') {
   await handleMuseOpenLoginWindow(accId);
  } else if (act === 'toggle') {
   const nextEnabled = museAccActBtn.dataset.museAccNext === '1';
   await handleMuseSingleAccAction(accId, 'update', { enabled: nextEnabled });
  } else if (act === 'delete') {
   const accLabel = museAccActBtn.dataset.museAccLabel || accId;
   appState.modal = {
    type: 'confirm',
    title: '删除 Muse 账号确认',
    message: `确定从本机账号池删除「${accLabel}」吗？删除后需重新登录或导入 Cookie 才能使用。`,
    confirmLabel: '确认删除账号',
    danger: true,
    confirmKind: 'muse-del-account',
    accountId: accId
   };
   render();
  } else {
   await handleMuseSingleAccAction(accId, act);
  }
  return;
 }

 const museSelectJob = target.closest('[data-muse-select-job]');
 if (museSelectJob) {
  appState.muse.activeJobId = museSelectJob.dataset.museSelectJob;
  render();
  return;
 }

 const museCancelJob = target.closest('[data-muse-cancel-job]');
 if (museCancelJob) {
  const jid = museCancelJob.dataset.museCancelJob;
  const job = appState.muse.jobs.find((j) => j.id === jid);
  if (job) {
   await cancelMuseVideoTask(appState.muse.config, appState.muse.apiKey, { cancelKey: job.cancelKey, taskId: job.id }, { staticHost: appState.muse.staticHost });
   job.status = 'cancelled';
   job.notice = '已请求停止该任务；若通道为新接口，Muse 原对话可能仍在后台完成。';
   const tm = musePollTimers.get(jid);
   if (tm) { clearInterval(tm); musePollTimers.delete(jid); }
   render();
   showToast('已停止等待该视频任务');
  }
  return;
 }

 const museRecoverJob = target.closest('[data-muse-recover-job]');
 if (museRecoverJob) {
  const jid = museRecoverJob.dataset.museRecoverJob;
  const job = appState.muse.jobs.find((j) => j.id === jid);
  if (job) {
   const isProto = String(job.endpoint || '').includes(':18611') || (!job.endpoint && appState.muse.config.channel === 'protocol');
   if (isProto) {
    try {
     const state = await pollMuseVideoTask({ ...appState.muse.config, baseUrl: job.endpoint || appState.muse.config.baseUrl }, appState.muse.apiKey, job.id, { staticHost: appState.muse.staticHost, useProxy: job.useProxy });
     if (state.playableUrl) job.videoUrl = state.playableUrl;
     job.status = state.status || job.status;
    } catch {}
    await refreshMuseServerRecords(true);
    persistAppPrefs();
    render();
    showToast(job.status === 'completed' ? '已刷新并取回成片视频' : '已同步本机成片记录；若提交过两次，已完成成片会自动出现在列表中');
   } else {
    const ok = await recoverMuseVideoTask(appState.muse.config, appState.muse.apiKey, job.id, { staticHost: appState.muse.staticHost });
    if (ok) {
     job.status = 'pending';
     job.notice = '已发起从原对话取回成片请求，继续轮询结果…';
     persistAppPrefs();
     scheduleMusePoll(job.id);
     render();
     showToast('已请求取回原对话成品');
    } else {
     await refreshMuseServerRecords(true);
     showToast('当前通道暂未返回可取回的成品');
    }
   }
  }
  return;
 }

 const museDelJob = target.closest('[data-muse-del-job]');
 if (museDelJob) {
  const jid = museDelJob.dataset.museDelJob;
  const tm = musePollTimers.get(jid);
  if (tm) { clearInterval(tm); musePollTimers.delete(jid); }
  appState.muse.jobs = appState.muse.jobs.filter((j) => j.id !== jid);
  if (appState.muse.activeJobId === jid) appState.muse.activeJobId = appState.muse.jobs[0]?.id || '';
  persistAppPrefs();
  render();
  return;
 }

 const actBtn = target.closest('[data-action]');
 if (!actBtn) return;
 const action = actBtn.dataset.action;

 if (action === 'toggle-track-menu') {
  appState.trackMenuOpen = !appState.trackMenuOpen;
  render();
  return;
 }

 if (action === 'toggle-trash') {
  appState.showTrash = !appState.showTrash;
  render();
  return;
 }

 if (action === 'confirm-empty-trash') {
  appState.modal = {
   type: 'confirm',
   title: '清空回收站确认',
   message: `确定永久清空回收站中的全部 ${(appState.trashedDrafts || []).length} 份草稿吗？清除后无法找回。`,
   confirmLabel: '确认清空回收站',
   danger: true,
   confirmKind: 'empty-trash'
  };
  render();
  return;
 }

 if (action === 'confirm-clear-all') {
  appState.modal = {
   type: 'confirm',
   title: '清空本地全部草稿确认',
   message: '确定清空本地 IndexedDB 中储存的全部工程草稿（含回收站）吗？此操作无法撤销，建议先导出备份。',
   confirmLabel: '确认清空全部',
   danger: true,
   confirmKind: 'clear-all-drafts'
  };
  render();
  return;
 }

 if (action === 'confirm-rename-draft' && appState.modal?.type === 'rename') {
  const newName = (document.getElementById('renameDraftInput')?.value || '').trim();
  if (!newName) { showToast('草稿名称不能为空'); return; }
  const item = await loadProject(appState.modal.draftId);
  if (item) {
   item.title = newName;
   item.updatedAt = Date.now();
   await saveProject(item);
   if (appState.project?.id === item.id) appState.project.title = newName;
  }
  appState.modal = null;
  await refreshDraftsCache();
  render();
  showToast(`已重命名为「${newName}」`);
  return;
 }

 if (action === 'confirm-modal-ok' && appState.modal?.type === 'confirm') {
  const m = appState.modal;
  appState.modal = null;
  if (m.confirmKind === 'soft-delete-draft' && m.draftId) {
   await softDeleteProject(m.draftId);
   await refreshDraftsCache();
   appState.showTrash = true;
   render();
   showToast('已移入本地回收站，可随时还原');
   return;
  }
  if (m.confirmKind === 'purge-trash' && m.draftId) {
   await deleteProject(m.draftId);
   await refreshDraftsCache();
   render();
   showToast('已彻底删除该草稿');
   return;
  }
  if (m.confirmKind === 'empty-trash') {
   await emptyTrash();
   await refreshDraftsCache();
   render();
   showToast('回收站已清空');
   return;
  }
  if (m.confirmKind === 'clear-all-drafts') {
   await clearProjects();
   clearLastProject();
   await refreshDraftsCache();
   render();
   showToast('已清空全部本地草稿');
   return;
  }
  if (m.confirmKind === 'new-blank') {
   stopPlayback();
   try { await saveProject(appState.project); } catch {}
   appState.project = createBlankProject({ title: `${new Date().getMonth() + 1}月${new Date().getDate()}日 · 空白草稿` });
   appState.history = [];
   appState.future = [];
   appState.multiSelected = [];
   appState.screen = 'editor';
   await saveProject(appState.project);
   lastProject(appState.project.id);
   await refreshDraftsCache();
   render();
   showToast('已自动保存原草稿，并打开新的空白工程');
   return;
  }
  if (m.confirmKind === 'load-demo') {
   stopPlayback();
   try { await saveProject(appState.project); } catch {}
   appState.project = createDemoProject();
   appState.history = [];
   appState.future = [];
   appState.multiSelected = [];
   appState.screen = 'editor';
   await saveProject(appState.project);
   lastProject(appState.project.id);
   await refreshDraftsCache();
   render();
   showToast('已自动保存原草稿，并载入《雨夜巷口》5 轨示范草稿');
   return;
  }
  if (m.confirmKind === 'muse-del-account' && m.accountId) {
   await handleMuseSingleAccAction(m.accountId, 'delete');
   return;
  }
  render();
  return;
 }

 if (action === 'new-blank-enter' || action === 'new-blank-stay') {
  if (action === 'new-blank-stay' && appState.screen === 'editor' && hasProjectContent(appState.project)) {
   appState.modal = {
    type: 'confirm',
    title: '新建空白草稿确认',
    message: '当前草稿已有编辑内容。切换前系统会先自动保存当前草稿到「本地草稿箱」（回首页即可重新打开），确定切换为空白工程吗？',
    confirmLabel: '自动保存并新建空白',
    confirmKind: 'new-blank'
   };
   render();
   return;
  }
  stopPlayback();
  appState.project = createBlankProject({ title: `${new Date().getMonth() + 1}月${new Date().getDate()}日 · 空白草稿` });
  appState.history = [];
  appState.future = [];
  appState.multiSelected = [];
  appState.screen = 'editor';
  await saveProject(appState.project);
  lastProject(appState.project.id);
  await refreshDraftsCache();
  render();
  return;
 }

 if (action === 'load-demo-enter' || action === 'load-demo') {
  if (action === 'load-demo' && appState.screen === 'editor' && hasProjectContent(appState.project)) {
   appState.modal = {
    type: 'confirm',
    title: '载入示例草稿确认',
    message: '当前草稿已有编辑内容。载入示例前系统会先自动保存当前草稿到本地草稿箱（可从首页随时找回），确定切换到《雨夜巷口》示范工程吗？',
    confirmLabel: '自动保存并载入示例',
    confirmKind: 'load-demo'
   };
   render();
   return;
  }
  stopPlayback();
  appState.project = createDemoProject();
  appState.history = [];
  appState.future = [];
  appState.multiSelected = [];
  appState.screen = 'editor';
  await saveProject(appState.project);
  lastProject(appState.project.id);
  await refreshDraftsCache();
  render();
  showToast('已载入《雨夜巷口》5 轨示范草稿');
  return;
 }

 if (action === 'clone-current-draft') {
  stopPlayback();
  try { await saveProject(appState.project); } catch {}
  const copy = cloneProject(appState.project);
  appState.project = copy;
  appState.history = [];
  appState.future = [];
  appState.multiSelected = [];
  await saveProject(copy);
  lastProject(copy.id);
  await refreshDraftsCache();
  render();
  showToast(`已复制当前草稿为副本「${copy.title}」`);
  return;
 }

 if (action === 'go-home') {
  stopPlayback();
  try { await saveProject(appState.project); } catch {}
  await refreshDraftsCache();
  appState.screen = 'home';
  render();
  return;
 }

 if (action === 'open-compile-modal') {
  appState.modal = { type: 'compile' };
  render();
  return;
 }

 if (action === 'open-help-modal') {
  appState.modal = { type: 'help' };
  render();
  return;
 }

 // Built-in AI Studio Actions
 if (action === 'ai-toggle-key-vis') {
  appState.aiConn.showKey = !appState.aiConn.showKey;
  render(true);
  return;
 }

 if (action === 'ai-test-conn') {
  await handleTestAIConnection();
  return;
 }

 if (action === 'ai-disconnect') {
  appState.aiConn.apiKey = '';
  appState.aiConn.verified = false;
  appState.aiConn.statusMsg = '已断开并清除页面内存中的 API Key。';
  appState.aiConn.statusError = false;
  render(true);
  showToast('已清除页面内存中的 Google API Key');
  return;
 }

 if (action === 'ai-open-guide') {
  appState.modal = { type: 'ai-guide' };
  render();
  return;
 }

 if (action === 'ai-clear-idea') {
  appState.aiBrief.idea = '';
  persistAppPrefs();
  render();
  document.getElementById('aiIdeaInput')?.focus();
  return;
 }

 if (action === 'ai-go-api-tab') {
  if (appState.screen === 'editor') {
   appState.resTab = 'ai';
   appState.resSubCat = 'api';
   render();
  } else {
   appState.homeTab = 'ai';
   render();
  }
  requestAnimationFrame(() => document.getElementById('aiApiKeyInput')?.focus());
  return;
 }

 if (action === 'ai-go-preselect-tab') {
  if (appState.screen === 'editor') {
   appState.resTab = 'ai';
   appState.resSubCat = 'preselect';
   render();
  }
  return;
 }

 if (action === 'ai-generate') {
  await handleRunAIGenerate();
  return;
 }

 if (action === 'ai-cancel') {
  if (appState.aiFlow.busy && appState.aiFlow.controller) {
   appState.aiFlow.controller.abort(new Error('USER_CANCELLED'));
  }
  return;
 }

 if (action === 'ai-apply-plan') {
  const tgt = actBtn.dataset.target || null;
  await handleApplyAIPlan(tgt);
  return;
 }

 // Built-in Muse Video Studio Actions
 if (action === 'muse-toggle-key-vis') {
  appState.muse.showKey = !appState.muse.showKey;
  render(true);
  return;
 }

 if (action === 'muse-probe') {
  await handleProbeMuseService();
  return;
 }

 if (action === 'muse-refresh-accounts') {
  await refreshMuseAccountPool(false);
  return;
 }

 if (action === 'muse-refresh-records') {
  await refreshMuseServerRecords(false);
  return;
 }

 if (action === 'muse-netcheck') {
  await refreshMuseProtocolNet(true);
  return;
 }

 if (action === 'muse-open-login-window') {
  await handleMuseOpenLoginWindow('');
  return;
 }

 if (action === 'muse-import-cookie') {
  await handleMuseImportCookie();
  return;
 }

 if (action === 'muse-toggle-cookie-box') {
  e.preventDefault();
  appState.muse.cookieBoxOpen = !appState.muse.cookieBoxOpen;
  render(true);
  return;
 }

 if (action === 'muse-open-guide') {
  appState.modal = { type: 'muse-guide' };
  render();
  return;
 }

 if (action === 'muse-load-draft') {
  importPromptFromMuseSource();
  return;
 }

 if (action === 'muse-clear-first') {
  appState.muse.firstFrame = '';
  render(true);
  return;
 }

 if (action === 'muse-clear-last') {
  appState.muse.lastFrame = '';
  render(true);
  return;
 }

 if (action === 'muse-clear-refs') {
  appState.muse.refImages = [];
  render(true);
  return;
 }

 if (action === 'muse-submit') {
  await handleSubmitMuseVideo();
  return;
 }

 if (action === 'muse-add-manual-video') {
  const rawUrl = String(appState.muse.manualUrlInput || '').trim();
  if (!isPlayableVideoUrl(rawUrl)) {
   showToast('请输入有效的 http(s)://... 或本地 /api/muse/... 视频地址');
   return;
  }
  const jid = uid('manual_vid');
  appState.muse.jobs.unshift({
   id: jid,
   cancelKey: '',
   model: 'manual-import',
   endpoint: '',
   useProxy: false,
   prompt: '手动导入预览视频',
   size: '外部视频',
   seconds: 0,
   status: 'completed',
   notice: '已手动载入本地播放预览',
   error: '',
   videoUrl: rawUrl,
   createdAt: Date.now()
  });
  appState.muse.activeJobId = jid;
  appState.muse.manualUrlInput = '';
  render();
  showToast('已载入视频链接到预览播放器');
  return;
 }

 if (action === 'deselect-clip') {
  appState.project.selected = null;
  appState.multiSelected = [];
  render();
  return;
 }

 if (action === 'clear-multi-select') {
  appState.multiSelected = [];
  render();
  return;
 }

 if (action === 'apply-batch-dur') {
  if (!appState.multiSelected.length) return;
  const val = Number(document.getElementById('batchDurInput')?.value);
  if (!Number.isFinite(val) || val < 0.5) { showToast('请输入大于等于 0.5 的有效秒数'); return; }
  stopPlayback();
  pushUndo(null, '批量修改时长');
  const res = batchUpdateClipDuration(appState.project, appState.multiSelected, val);
  scheduleSave();
  render();
  showToast(`已将 ${res.updatedCount} 个未锁定片段统一设为 ${res.duration}s`);
  return;
 }

 if (action === 'apply-batch-delete') {
  if (!appState.multiSelected.length) return;
  stopPlayback();
  pushUndo(null, '批量删除片段');
  const res = deleteClips(appState.project, appState.multiSelected);
  appState.multiSelected = [];
  scheduleSave();
  render();
  showToast(`已批量删除 ${res.deletedCount} 个片段`);
  return;
 }

 if (action === 'toggle-play') { togglePlayback(); return; }
 if (action === 'seek-start') { stopPlayback(); appState.project.playhead = 0; updatePlayheadVisuals(); return; }
 if (action === 'seek-end') { stopPlayback(); appState.project.playhead = projectDuration(appState.project); updatePlayheadVisuals(); return; }
 if (action === 'undo') { undo(); return; }
 if (action === 'redo') { redo(); return; }
 if (action === 'open-import') {
  const reqTab = actBtn.dataset.importTab === 'v1' ? 'v1' : 'v2';
  appState.modal = { type: 'import', tab: reqTab, error: '', text: '' };
  render();
  return;
 }

 if (action === 'download-import-tpl' && appState.modal?.type === 'import') {
  const tab = appState.modal.tab === 'v1' ? 'v1' : 'v2';
  const ext = tab === 'v1' ? 'blank_v1_template.jingxu.json' : 'blank_v2_template.jingxu2.json';
  downloadBlob(ext, createBlankTemplateJson(tab), 'application/json;charset=utf-8');
  showToast(`已下载 ${tab === 'v1' ? '1.0' : '2.0'} 标准空白模板`);
  return;
 }

 if (action === 'confirm-import-paste') {
  const box = document.getElementById('importPasteBox');
  const raw = box?.value || '';
  try {
   await loadImportedText(raw);
  } catch (err) {
   if (appState.modal?.type === 'import') {
    appState.modal.text = raw;
    appState.modal.error = err.message;
    render();
   }
   showToast(`导入失败：${err.message}`);
  }
  return;
 }

 if (action === 'export-json') {
  const slug = (appState.project.title || 'jingxu-nle').replace(/[\\/:*?"<>|\s]+/g, '_');
  downloadBlob(`${slug}.jingxu2.json`, JSON.stringify(appState.project, null, 2), 'application/json;charset=utf-8');
  showToast('已导出 2.0 多轨 JSON');
  return;
 }

 if (action === 'add-custom-neg') {
  commitCustomNegativeInput();
  return;
 }

 if (action === 'quick-add-video' || action === 'quick-add-dialogue' || action === 'quick-add-audio' || action === 'quick-add-bgm' || action === 'quick-add-adjust') {
  const tr = { 'quick-add-video': 'video', 'quick-add-dialogue': 'dialogue', 'quick-add-audio': 'audio', 'quick-add-bgm': 'bgm', 'quick-add-adjust': 'adjust' }[action];
  if (isTrackLocked(appState.project, tr)) { showToast('该轨道已锁定，请先点击轨道头锁图标解锁'); return; }
  stopPlayback();
  pushUndo(null, `新建 ${tr.toUpperCase()} 片段`);
  const spec = tr === 'video' ? { title: `分镜 ${String(appState.project.tracks.video.length + 1).padStart(2, '0')}` } : {};
  const { clip, shifted } = addClip(appState.project, tr, spec);
  appState.project.playhead = roundT(clip.start);
  scheduleSave();
  render();
  if (shifted) showToast(`当前播放头已有片段，已自动顺延至 ${fmtTimecode(clip.start)} 插入`);
  return;
 }

 if (action === 'split-playhead') {
  const selTrack = appState.project.selected?.track;
  if (selTrack && isTrackLocked(appState.project, selTrack)) { showToast('当前轨道已锁定，无法分割'); return; }
  stopPlayback();
  pushUndo(null, '分割片段');
  const res = splitAtPlayhead(appState.project);
  if (!res.ok) { appState.history.pop(); showToast(res.reason || '当前无法分割'); return; }
  scheduleSave();
  render();
  showToast('已在播放头位置分割');
  return;
 }

 if (action === 'dup-selected') {
  const sel = appState.project.selected;
  if (!sel) return;
  if (isTrackLocked(appState.project, sel.track)) { showToast('当前轨道已锁定，请先解锁再复制'); return; }
  stopPlayback();
  pushUndo(null, '复制片段');
  duplicateClip(appState.project, sel.track, sel.id);
  scheduleSave();
  render();
  return;
 }

 if (action === 'del-selected') {
  if (appState.multiSelected.length > 1) {
   stopPlayback();
   pushUndo(null, '批量删除片段');
   const res = deleteClips(appState.project, appState.multiSelected);
   appState.multiSelected = [];
   scheduleSave();
   render();
   showToast(`已删除 ${res.deletedCount} 个片段`);
   return;
  }
  const sel = appState.project.selected;
  if (!sel) return;
  if (isTrackLocked(appState.project, sel.track)) { showToast('当前轨道已锁定，请先解锁后再删除'); return; }
  stopPlayback();
  pushUndo(null, '删除片段');
  deleteClip(appState.project, sel.track, sel.id);
  appState.multiSelected = [];
  scheduleSave();
  render();
  return;
 }

 if (action === 'toggle-snap') {
  appState.project.snap = !appState.project.snap;
  scheduleSave();
  render();
  showToast(appState.project.snap ? '磁吸对齐已开启：拖动片段自动吸附到红线与相邻边界' : '磁吸对齐已关闭：可自由精调至 0.1 秒');
  return;
 }

 if (action === 'toggle-ripple') {
  appState.project.ripple = !appState.project.ripple;
  if (appState.project.ripple) {
   pushUndo(null, '开启 V1 主轨联动');
   normalizeAllTracks(appState.project);
  }
  scheduleSave();
  render();
  showToast(appState.project.ripple ? 'V1 主轨联动已开启：删除或移动自动紧贴无黑场' : 'V1 主轨联动已关闭：允许拖开间隙与黑场留白');
  return;
 }

 if (action === 'clear-ref-img') {
  const clip = selectedClipObj();
  if (clip) {
   pushUndo(null, '移除首帧参考图');
   clip.startRefImage = '';
   clip.refImage = '';
   scheduleSave();
   render();
  }
  return;
 }

 if (action === 'clear-end-ref-img') {
  const clip = selectedClipObj();
  if (clip) {
   pushUndo(null, '移除尾帧参考图');
   clip.endRefImage = '';
   scheduleSave();
   render();
  }
  return;
 }

 if (action === 'clear-char-ref-img' && appState.modal?.type === 'char') {
  appState.modal.draft.refImage = '';
  render();
  return;
 }

 if (action === 'add-char') {
  appState.modal = { type: 'char', isNew: true, draft: { id: uid('char'), name: `角色 ${appState.project.characters.length + 1}`, role: '主角', lockIdentity: true } };
  render();
  return;
 }
 if (action === 'save-char-draft' && appState.modal?.type === 'char') {
  pushUndo(null, '保存角色定妆卡');
  const d = appState.modal.draft;
  if (appState.modal.isNew) appState.project.characters.push(d);
  else { const idx = appState.project.characters.findIndex((x) => x.id === d.id); if (idx >= 0) appState.project.characters[idx] = d; }
  appState.modal = null;
  scheduleSave();
  render();
  return;
 }
 if (action === 'add-scene') {
  appState.modal = { type: 'scene', isNew: true, draft: { id: uid('scene'), name: `场景 ${appState.project.scenes.length + 1}` } };
  render();
  return;
 }
 if (action === 'save-scene-draft' && appState.modal?.type === 'scene') {
  pushUndo(null, '保存场景空间锚点');
  const d = appState.modal.draft;
  if (appState.modal.isNew) appState.project.scenes.push(d);
  else { const idx = appState.project.scenes.findIndex((x) => x.id === d.id); if (idx >= 0) appState.project.scenes[idx] = d; }
  appState.modal = null;
  scheduleSave();
  render();
  return;
 }

 if (action === 'copy-prompt') {
  if (!hasExportableClips(appState.project)) { showToast('当前时间轴为空，请先添置至少一个片段后再复制导出'); return; }
  const txt = compileTimelinePrompt(appState.project);
  try {
   await navigator.clipboard.writeText(txt);
   showToast('已复制完整 2.0 多轨提示词到剪贴板');
  } catch {
   const box = document.getElementById('compileOutputBox');
   if (box) { box.select(); document.execCommand('copy'); showToast('已选中并复制提示词'); }
  }
  return;
 }
 if (action === 'prev-shot' || action === 'next-shot') {
  const sel = appState.project.selected;
  if (!sel?.track) return;
  const list = appState.project.tracks?.[sel.track] || [];
  if (list.length < 2) return;
  const idx = list.findIndex((c) => c.id === sel.id);
  const delta = action === 'prev-shot' ? -1 : 1;
  const nextIdx = (idx + delta + list.length) % list.length;
  const nextClip = list[nextIdx];
  appState.project.selected = { track: sel.track, id: nextClip.id };
  appState.project.playhead = roundT(nextClip.start);
  appState.multiSelected = [];
  render();
  const vp = document.getElementById('tlViewport');
  if (vp) {
   const leftX = Math.round(nextClip.start * appState.project.zoom);
   const rightX = Math.round((nextClip.start + nextClip.duration) * appState.project.zoom);
   if (leftX < vp.scrollLeft + 24 || rightX > vp.scrollLeft + vp.clientWidth - 24) {
    vp.scrollLeft = Math.max(0, leftX - 48);
   }
  }
  return;
 }

 if (action === 'download-txt') {
  if (!hasExportableClips(appState.project)) { showToast('当前时间轴为空，无法导出空提示词文本'); return; }
  downloadBlob(`${appState.project.title || 'prompt'}.txt`, compileTimelinePrompt(appState.project));
  showToast('已下载提示词 .txt 文件');
  return;
 }
 if (action === 'download-csv') {
  if (!hasExportableClips(appState.project)) { showToast('当前时间轴为空，无法导出空分镜表'); return; }
  downloadBlob(`${appState.project.title || 'storyboard'}.csv`, '\uFEFF' + compileTimelinePrompt(appState.project, 'table'), 'text/csv;charset=utf-8');
  showToast('已下载分镜表 .csv 文件');
 }
});

/* =========================================================
   POINTER DRAG (PLAYHEAD + CLIP MOVE + EDGE TRIM)
========================================================= */
function findSnapMatch(rawTime, excludeId) {
 const p = appState.project;
 if (!p.snap) return { time: roundT(rawTime), snapped: false };
 const threshold = Math.max(0.18, 12 / p.zoom);
 const targets = [0, p.playhead];
 for (const tr of getAllTracks(p)) {
  for (const c of p.tracks?.[tr.key] || []) {
   if (c.id === excludeId) continue;
   targets.push(c.start, roundT(c.start + c.duration));
  }
 }
 let best = roundT(rawTime);
 let minDist = threshold;
 let snapped = false;
 for (const tg of targets) {
  const d = Math.abs(rawTime - tg);
  if (d < minDist) { minDist = d; best = roundT(tg); snapped = true; }
 }
 return { time: best, snapped };
}

function showSnapGuide(timeSec) {
 const canvas = document.getElementById('tlCanvas');
 if (!canvas) return;
 const leftPx = Math.round(timeSec * appState.project.zoom);
 let guide = document.getElementById('snapGuideLine');
 if (!guide) {
  guide = document.createElement('div');
  guide.id = 'snapGuideLine';
  guide.className = 'snap-guide';
  canvas.appendChild(guide);
 }
 guide.style.left = `${leftPx}px`;

 let badge = document.getElementById('snapGuideBadge');
 if (!badge) {
  badge = document.createElement('div');
  badge.id = 'snapGuideBadge';
  badge.className = 'snap-guide-badge';
  canvas.appendChild(badge);
 }
 badge.textContent = `${fmtTimecode(timeSec)} · 磁吸对齐`;
 badge.style.left = `${leftPx}px`;
}

function hideSnapGuide() {
 document.getElementById('snapGuideLine')?.remove();
 document.getElementById('snapGuideBadge')?.remove();
}

document.addEventListener('pointerdown', (e) => {
 if (appState.screen !== 'editor') return;
 const capOrRuler = e.target.closest('#playheadCap, #tlRuler');
 if (capOrRuler) {
  e.preventDefault();
  stopPlayback();
  const vp = document.getElementById('tlViewport');
  if (!vp) return;
  const toTime = (clientX) => roundT(Math.max(0, clientX - vp.getBoundingClientRect().left + vp.scrollLeft) / appState.project.zoom);
  appState.project.playhead = toTime(e.clientX);
  updatePlayheadVisuals();
  appState.dragState = { kind: 'scrub', toTime };
  return;
 }

 const clipEl = e.target.closest('.tl-clip');
 if (clipEl) {
  e.preventDefault();
  stopPlayback();
  const clipId = clipEl.dataset.clipId;
  const track = clipEl.dataset.clipTrack;
  const clip = (appState.project.tracks?.[track] || []).find((c) => c.id === clipId);
  if (!clip) return;
  const mode = e.target.closest('.clip-handle-l') ? 'trim-l' : e.target.closest('.clip-handle-r') ? 'trim-r' : 'move';
  appState.dragState = {
   kind: 'clip',
   mode,
   track,
   clipId,
   el: clipEl,
   locked: isTrackLocked(appState.project, track),
   warnedLocked: false,
   ctrlOrShift: Boolean(e.ctrlKey || e.metaKey || e.shiftKey),
   startX: e.clientX,
   origStart: clip.start,
   origDur: clip.duration,
   moved: false,
   previewTime: clip.start,
   snapshot: { label: mode === 'move' ? '移动片段位置' : '裁切片段时长', project: clone(appState.project) }
  };
 }
});

document.addEventListener('pointermove', (e) => {
 const d = appState.dragState;
 if (!d) return;
 if (d.kind === 'scrub') {
  appState.project.playhead = d.toTime(e.clientX);
  updatePlayheadVisuals();
  return;
 }
 if (d.kind === 'clip') {
  const dx = e.clientX - d.startX;
  if (Math.abs(dx) > 3) d.moved = true;
  if (!d.moved) return;
  if (d.locked) {
   if (!d.warnedLocked) {
    d.warnedLocked = true;
    showToast('该轨道已锁定，请先点击轨道头锁图标解锁后再拖动');
   }
   return;
  }
  const dt = dx / appState.project.zoom;
  if (d.mode === 'move') {
   const rawStart = Math.max(0, d.origStart + dt);
   const match = findSnapMatch(rawStart, d.clipId);
   d.previewStart = match.time;
   d.el.style.left = `${Math.round(match.time * appState.project.zoom)}px`;
   if (match.snapped) showSnapGuide(match.time);
   else hideSnapGuide();
  } else if (d.mode === 'trim-l') {
   const oldEnd = roundT(d.origStart + d.origDur);
   const rawStart = Math.max(0, Math.min(oldEnd - 0.5, d.origStart + dt));
   const match = findSnapMatch(rawStart, d.clipId);
   const nextStart = Math.min(oldEnd - 0.5, Math.max(0, match.time));
   d.previewTime = nextStart;
   d.el.style.left = `${Math.round(nextStart * appState.project.zoom)}px`;
   d.el.style.width = `${Math.max(22, Math.round((oldEnd - nextStart) * appState.project.zoom))}px`;
   if (match.snapped) showSnapGuide(nextStart);
   else hideSnapGuide();
  } else {
   const rawEnd = Math.max(d.origStart + 0.5, d.origStart + d.origDur + dt);
   const match = findSnapMatch(rawEnd, d.clipId);
   const nextEnd = Math.max(d.origStart + 0.5, match.time);
   d.previewTime = nextEnd;
   d.el.style.width = `${Math.max(22, Math.round((nextEnd - d.origStart) * appState.project.zoom))}px`;
   if (match.snapped) showSnapGuide(nextEnd);
   else hideSnapGuide();
  }
 }
});

document.addEventListener('pointerup', () => {
 const d = appState.dragState;
 if (!d) return;
 appState.dragState = null;
 hideSnapGuide();
 if (d.kind === 'clip') {
  if (!d.moved || d.locked) {
   if (d.ctrlOrShift) {
    const prevSel = appState.project.selected;
    if (prevSel && !appState.multiSelected.some((m) => m.track === prevSel.track && m.id === prevSel.id)) {
     appState.multiSelected.push({ track: prevSel.track, id: prevSel.id });
    }
    const idx = appState.multiSelected.findIndex((m) => m.track === d.track && m.id === d.clipId);
    if (idx >= 0) appState.multiSelected.splice(idx, 1);
    else appState.multiSelected.push({ track: d.track, id: d.clipId });
    appState.project.selected = { track: d.track, id: d.clipId };
   } else {
    appState.multiSelected = [];
    appState.project.selected = { track: d.track, id: d.clipId };
   }
   scheduleSave();
   render();
   return;
  }
  pushUndo(d.snapshot);
  appState.multiSelected = [];
  appState.project.selected = { track: d.track, id: d.clipId };
  if (d.mode === 'move') moveClip(appState.project, d.track, d.clipId, d.previewStart ?? d.origStart);
  else if (d.mode === 'trim-l') trimClip(appState.project, d.track, d.clipId, 'left', d.previewTime);
  else trimClip(appState.project, d.track, d.clipId, 'right', d.previewTime);
  scheduleSave();
  render();
 }
});

document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', async (e) => {
 const file = e.dataTransfer?.files?.[0];
 if (!file || !/\.(json|jingxu\.json|jingxu2\.json)$/i.test(file.name)) return;
 e.preventDefault();
 try {
  const raw = await file.text();
  if (!raw.trim()) throw new Error(`拖入的文件「${file.name}」内容为空。`);
  await loadImportedText(raw);
 } catch (err) {
  showToast(`拖入失败：${err.message}`);
 }
});

document.addEventListener('keydown', (e) => {
 if (appState.screen !== 'editor') {
  if (e.key === 'Escape' && appState.modal) { appState.modal = null; render(); }
  return;
 }
 const ae = document.activeElement;
 const tag = ae?.tagName;
 const isTextEntry = tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'file'].includes(ae?.type)) || ae?.isContentEditable;

 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { if (isTextEntry) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { if (isTextEntry) return; e.preventDefault(); redo(); return; }
 if (e.key === 'Escape' && appState.modal) { appState.modal = null; render(); return; }
 if (isTextEntry || tag === 'SELECT' || appState.modal) return;

 if (e.code === 'Space') { e.preventDefault(); togglePlayback(); return; }
 if (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 's') {
  e.preventDefault();
  const selTrack = appState.project.selected?.track;
  if (selTrack && isTrackLocked(appState.project, selTrack)) { showToast('当前轨道已锁定，无法分割'); return; }
  stopPlayback();
  pushUndo(null, '快捷键分割');
  const res = splitAtPlayhead(appState.project);
  if (!res.ok) { appState.history.pop(); showToast(res.reason); }
  else { scheduleSave(); render(); showToast('已分割'); }
  return;
 }
 if (e.key === 'Delete' || e.key === 'Backspace') {
  if (appState.multiSelected.length > 1) {
   e.preventDefault();
   stopPlayback();
   pushUndo(null, '快捷键批量删除');
   const res = deleteClips(appState.project, appState.multiSelected);
   appState.multiSelected = [];
   scheduleSave();
   render();
   showToast(`已删除 ${res.deletedCount} 个片段`);
   return;
  }
  const sel = appState.project.selected;
  if (sel) {
   e.preventDefault();
   if (isTrackLocked(appState.project, sel.track)) { showToast('当前轨道已锁定，请先解锁再删除'); return; }
   stopPlayback();
   pushUndo(null, '快捷键删除');
   deleteClip(appState.project, sel.track, sel.id);
   appState.multiSelected = [];
   scheduleSave();
   render();
  }
  return;
 }
 if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
  e.preventDefault();
  stopPlayback();
  const step = e.shiftKey ? 1.0 : 0.2;
  appState.project.playhead = roundT(Math.max(0, Math.min(projectDuration(appState.project), appState.project.playhead + (e.key === 'ArrowRight' ? step : -step))));
  updatePlayheadVisuals();
 }
});

async function boot() {
 const prefs = readPrefs();
 if (prefs) {
  if (prefs.zoom) appState.project.zoom = prefs.zoom;
  if (prefs.outputMode) appState.project.outputMode = prefs.outputMode;
  if (prefs.outputLang) appState.project.outputLang = prefs.outputLang;
  if (prefs.aiModel) appState.aiConn.model = String(prefs.aiModel);
  if (prefs.aiThinkingLevel) appState.aiConn.thinkingLevel = String(prefs.aiThinkingLevel);
  if (prefs.aiTransport) appState.aiConn.transport = prefs.aiTransport === 'server' ? 'server' : 'browser';
  if (prefs.aiBrief) appState.aiBrief = normalizeAIBrief(prefs.aiBrief);
  if (prefs.museConfig) appState.muse.config = normalizeMuseConfig(prefs.museConfig);
  if (Array.isArray(prefs.museJobs)) {
   appState.muse.jobs = sanitizeSavedMuseJobs(prefs.museJobs);
   const firstDone = appState.muse.jobs.find((j) => j.status === 'completed' && j.videoUrl) || appState.muse.jobs[0];
   if (firstDone) appState.muse.activeJobId = firstDone.id;
   for (const j of appState.muse.jobs) {
    if (!['completed', 'failed', 'cancelled'].includes(j.status)) scheduleMusePoll(j.id);
   }
  }
 }
 await refreshDraftsCache();
 probeServerConfigIfLocal(false);
 appState.screen = 'home';
 appState.homeTab = 'home';
 render();
}

boot();
