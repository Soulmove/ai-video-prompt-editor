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
 groupOptions,
 groupLabel,
 createBlankProject,
 createDemoProject,
 parseAnyProjectImport,
 projectDuration,
 addClip,
 addPresetClip,
 splitAtPlayhead,
 moveClip,
 trimClip,
 deleteClip,
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
 deleteProject,
 clearProjects,
 readPrefs,
 savePrefs,
 lastProject,
 clearLastProject
} from './nle-storage.mjs';

import { renderOptionSwatch } from './nle-swatches.mjs';
import { uiIcon } from './nle-icons.mjs';

const MAX_HISTORY = 60;

const RESOURCE_TABS = [
 { id: 'media', icon: 'media', label: '素材' },
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
 homeTab: 'home',        // 'home' | 'square' | 'cloud'
 drafts: [],             // Cached IndexedDB drafts for Home preview grid
 draftFilter: '',

 project: createBlankProject(),
 history: [],
 future: [],
 pendingEditSnapshot: null,

 resTab: 'style',        // Active top resource bar tab (defaults to visual Style grid showcase or media)
 resSubCat: 'look',      // Sub-category inside left sidebar of resource dock
 resSearch: '',
 inspSubTab: 'content',  // 'content' | 'link' inside clip inspector
 menuOpen: false,

 playing: false,
 rafId: 0,
 lastRafTs: 0,
 modal: null,            // null | { type: 'compile'|'import'|'char'|'scene', ... }
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
 }, 2600);
}

async function refreshDraftsCache() {
 try {
  appState.drafts = await listProjects();
 } catch {
  appState.drafts = [];
 }
}

function pushUndo(snapshot = null) {
 appState.history.push(snapshot || clone(appState.project));
 if (appState.history.length > MAX_HISTORY) appState.history.shift();
 appState.future = [];
}

function scheduleSave() {
 clearTimeout(saveTimer);
 saveTimer = setTimeout(async () => {
  try {
   appState.project.updatedAt = Date.now();
   await saveProject(appState.project);
   lastProject(appState.project.id);
   savePrefs({
    zoom: appState.project.zoom,
    outputMode: appState.project.outputMode,
    outputLang: appState.project.outputLang
   });
   await refreshDraftsCache();
  } catch (err) {
   console.warn('Auto-save skipped:', err);
  }
 }, 160);
}

function undo() {
 if (!appState.history.length) return;
 stopPlayback();
 appState.future.push(clone(appState.project));
 appState.project = appState.history.pop();
 scheduleSave();
 render();
 showToast('已撤销');
}

function redo() {
 if (!appState.future.length) return;
 stopPlayback();
 appState.history.push(clone(appState.project));
 appState.project = appState.future.pop();
 scheduleSave();
 render();
 showToast('已重做');
}

function stopPlayback() {
 appState.playing = false;
 if (appState.rafId) {
  cancelAnimationFrame(appState.rafId);
  appState.rafId = 0;
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
 const btn = document.getElementById('playPauseBtn');
 if (btn) btn.innerHTML = `${uiIcon('pause')}<span>暂停</span>`;

 const tick = (now) => {
  if (!appState.playing) return;
  const dt = Math.min(0.1, Math.max(0, (now - appState.lastRafTs) / 1000));
  appState.lastRafTs = now;
  const dur = projectDuration(appState.project);
  const next = appState.project.playhead + dt;
  if (next >= dur) {
   appState.project.playhead = roundT(dur);
   updatePlayheadVisuals();
   stopPlayback();
   return;
  }
  appState.project.playhead = roundT(next);
  updatePlayheadVisuals();
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
 if (clip && appState.project.selected?.track === 'video') return clip;
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
 if (track === 'video') return clip.title || '新分镜';
 if (track === 'dialogue') return `${clip.speakerName || '角色'}: ${clip.text || '对白'}`;
 if (track === 'audio') return `${clip.kind === 'ambience' ? '环境' : '音效'}: ${clip.cue || '待填'}`;
 if (track === 'bgm') return `配乐: ${groupLabel('bgm', clip.style) || clip.mood || 'BGM'}`;
 return clip.label || '调节层';
}

function clipSubLabel(track, clip) {
 const span = `${fmtTimecode(clip.start)} · ${clip.duration}s`;
 if (track === 'video') {
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
 const previewImg = firstShot?.refImage;
 const previewText = firstShot?.prompt || firstShot?.title || '00:00 空白工程，等待开始剪辑';

 return `
  <div class="draft-card" data-open-draft="${esc(item.id)}">
   <div class="draft-thumb" style="${previewImg ? '' : 'background:linear-gradient(155deg,#171a21,#0a0a0c);'}">
    ${previewImg ? `<img src="${esc(previewImg)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.45;"/>` : ''}
    <div class="draft-thumb-top" style="position:relative;z-index:1;">
     <span class="draft-aspect-pill">${esc(item.format || '16:9')}</span>
     <span style="color:var(--jy-teal);font-weight:700;">V1:${vCount}</span>
    </div>
    <div class="draft-thumb-mid" style="position:relative;z-index:1;">${esc(previewText)}</div>
    <div class="draft-thumb-bot" style="position:relative;z-index:1;">
     <span>${vCount ? '多轨草稿' : '空白草稿'}</span>
     <span>${esc(fmtTimecode(dur))}</span>
    </div>
   </div>
   <div class="draft-meta">
    <div style="min-width:0;">
     <div class="draft-name" title="${esc(item.title)}">${esc(item.title || '未命名草稿')}</div>
     <div class="draft-sub">${esc(formatDateShort(item.updatedAt))} · ${dur}s</div>
    </div>
    <div class="draft-card-btns">
     <button class="btn btn-sm" data-export-draft="${esc(item.id)}" title="导出 JSON">${uiIcon('export')}</button>
     <button class="btn btn-sm btn-danger" data-del-draft="${esc(item.id)}" title="删除草稿">${uiIcon('delete')}</button>
    </div>
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
   </section>`;
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
     <button class="btn btn-sm btn-danger" data-action="clear-all-projects">${uiIcon('delete')}<span>清空本地历史草稿</span></button>
    </div>
    <div class="entity-item" style="padding:16px;">
     <div style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-bottom:6px;">${uiIcon('import', 'card-title-svg')}<span>导入 1.0 / 2.0 工程档案</span></div>
     <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">支持拖入或粘贴镜序 1.0 (.jingxu.json) 与镜序 2.0 (.jingxu2.json)，自动转为五轨草稿。</div>
     <button class="btn btn-sm btn-jy" data-action="open-import">${uiIcon('import')}<span>导入工程文件</span></button>
    </div>
   </div>
   ${appState.drafts.length ? `
    <div style="font-size:13.5px;font-weight:700;margin-top:4px;">所有已保存工程 (${appState.drafts.length})</div>
    <div class="drafts-grid">${appState.drafts.map(renderDraftCard).join('')}</div>` : ''}`;
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
      <button class="home-nav-btn ${appState.homeTab === 'square' ? 'active' : ''}" data-home-tab="square">${uiIcon('gallery')}<span>广场</span></button>
      <button class="home-nav-btn ${appState.homeTab === 'cloud' ? 'active' : ''}" data-home-tab="cloud">${uiIcon('layers')}<span>我的云空间</span></button>
     </nav>
    </div>
    <div class="home-sidebar-foot">
     <div><span class="status-dot"></span><b>0 AI 依赖 · 纯手动剪辑</b></div>
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
     <div class="res-search-row">
      <div class="search-field-wrap">
       ${uiIcon('search', 'search-svg')}
       <input id="resSearchInput" class="input" placeholder="搜索当前分类…" value="${esc(appState.resSearch)}" />
      </div>
     </div>
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

 return `
  <div class="stage-visual" style="background:${bgStyle};">
   ${v.refImage ? `<img class="stage-ref-img" src="${esc(v.refImage)}" alt="ref" />` : ''}
   <div class="stage-scrim"></div>
   <div class="stage-top-row">
    <div class="stage-badges">
     <span class="stage-chip">V1 · ${esc(v.title || '分镜')}</span>
     ${st.adjusts.map((a) => `<span class="stage-chip adj">${uiIcon('adjustment', 'chip-svg')}<span>${esc(a.label)}</span></span>`).join('')}
     ${st.transitionActive ? `<span class="stage-chip trans">${uiIcon('transition', 'chip-svg')}<span>${esc(groupLabel('transition', st.transitionActive.type))}</span></span>` : ''}
    </div>
    <div class="stage-badges">
     ${st.audios.map((a) => `<span class="stage-chip sfx">${uiIcon('volume', 'chip-svg')}<span>${esc(a.cue.slice(0, 14))}</span></span>`).join('')}
     ${st.bgms.map((b) => `<span class="stage-chip bgm">${uiIcon('music-track', 'chip-svg')}<span>${esc(groupLabel('bgm', b.style) || 'BGM')}${b.isDucking ? ' [避让]' : ''}</span></span>`).join('')}
    </div>
   </div>
   <div class="stage-mid-vf">
    <div class="vf-framing-tag">${esc([groupLabel('framing', v.framing), groupLabel('move', v.move), groupLabel('look', v.style)].filter(Boolean).join(' · '))}</div>
    <div class="vf-title">${esc(v.title || '未命名镜头')}</div>
    <div class="vf-prompt">${esc(v.prompt || '在右侧「片段属性」填写动作画面描述，或在左侧点选风格方框')}</div>
   </div>
   <div class="stage-bottom-row">
    ${st.dialogues.map((d) => `<div class="subtitle-box"><span class="subtitle-speaker">${esc(d.speakerName || '角色')}:</span>${esc(d.text || '…')}</div>`).join('')}
   </div>
  </div>`;
}

function updatePlayheadVisuals() {
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
 if (stage) stage.innerHTML = renderProgramMonitorInner();
}

function updateCompiledAndLiveViews() {
 const compileBox = document.getElementById('compileOutputBox');
 if (compileBox) compileBox.value = compileTimelinePrompt(appState.project);
 const stage = document.getElementById('monitorStage');
 if (stage) stage.innerHTML = renderProgramMonitorInner();
 const sel = appState.project.selected;
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

 if (!sel || !clip) {
  const negOpts = groupOptions('negative');
  const issues = validateTimeline(p);
  return `
   <aside class="insp-pane">
    <div class="insp-head">
     <span>${uiIcon('file-settings', 'hdr-svg')}<span>草稿参数</span></span>
     <span style="font-size:11px;color:var(--text-dim);font-weight:500;">全局设置</span>
    </div>
    <div class="insp-scroll">
     <div class="kv-row"><span class="kv-key">草稿名称</span><span class="kv-val">${esc(p.title)}</span></div>
     <div class="kv-row"><span class="kv-key">存储模式</span><span class="kv-val" style="color:var(--jy-teal);">本地 IndexedDB (已开启)</span></div>
     <div class="kv-row"><span class="kv-key">时间轴长度</span><span class="kv-val">${projectDuration(p)}s · ${p.tracks.video.length} 分镜</span></div>
     <div class="kv-row">
      <span class="kv-key">画幅比例</span>
      <select class="select" style="width:130px;" data-proj-field="format">
       ${NLE_FORMATS.map(([id, label]) => `<option value="${esc(id)}"${id === p.format ? ' selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
     </div>
     <div class="kv-row">
      <span class="kv-key">分辨率</span>
      <select class="select" style="width:130px;" data-proj-field="resolution">
       ${NLE_RESOLUTIONS.map(([id, label]) => `<option value="${esc(id)}"${id === p.resolution ? ' selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
     </div>
     <div class="kv-row">
      <span class="kv-key">帧率</span>
      <select class="select" style="width:130px;" data-proj-num="fps">
       ${NLE_FPS.map((f) => `<option value="${f}"${Number(p.fps) === f ? ' selected' : ''}>${f}.00 帧/秒</option>`).join('')}
      </select>
     </div>
     <div class="field" style="margin-top:10px;">
      <label>全局负向避坑词 (${p.negativePrompts.length})</label>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
       ${negOpts.slice(0, 12).map((n) => `<button class="pill-btn ${p.negativePrompts.includes(n.id) ? 'neg-on' : ''}" data-toggle-neg="${esc(n.id)}">${esc(n.label)}</button>`).join('')}
      </div>
     </div>
     <div class="field">
      <label>镜头体检 (${issues.length})</label>
      ${issues.slice(0, 3).map((it) => `<div class="issue-card ${esc(it.severity)}" data-jump-clip="${esc(it.clipId || '')}" data-jump-track="${esc(it.track || '')}">${esc(it.message)}</div>`).join('')}
     </div>
    </div>
    <div class="insp-foot">
     <button class="btn btn-compile-hero" style="width:100%;" data-action="open-compile-modal">${uiIcon('compile-prompt')}<span>2.0 提示词编译导出</span></button>
    </div>
   </aside>`;
 }

 let formHtml = '';
 if (sel.track === 'video') {
  formHtml = `
   <div class="sub-pill-tabs">
    <button class="pill-btn ${appState.inspSubTab === 'content' ? 'active' : ''}" data-insp-sub="content">${uiIcon('script-text', 'pill-svg')}<span>画面与文案</span></button>
    <button class="pill-btn ${appState.inspSubTab === 'link' ? 'active' : ''}" data-insp-sub="link">${uiIcon('character-ref', 'pill-svg')}<span>人物场景/参考</span></button>
   </div>
   ${appState.inspSubTab === 'content' ? `
    <div class="field-grid">
     <div class="field"><label>分镜标题</label><input class="input" data-clip-field="title" value="${esc(clip.title)}" /></div>
     <div class="field"><label>时长 (s)</label><input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" /></div>
    </div>
    <div class="field"><label>画面主体与动作 (Prompt)</label><textarea class="textarea" rows="3" data-clip-field="prompt" placeholder="描述画面核心动作，风格/运镜可在左侧方框一点直选…">${esc(clip.prompt)}</textarea></div>
    <div class="field"><label>起幅状态</label><input class="input" data-clip-field="startState" value="${esc(clip.startState)}" placeholder="0% 首帧画面姿态" /></div>
    <div class="field"><label>落幅状态</label><input class="input" data-clip-field="endState" value="${esc(clip.endState)}" placeholder="100% 尾帧落点" /></div>
    <div class="field-grid">
     <div class="field"><label>景别 (也可点左方框)</label><select class="select" data-clip-field="framing">${renderSelectOptions('framing', clip.framing)}</select></div>
     <div class="field"><label>运镜 (也可点左方框)</label><select class="select" data-clip-field="move">${renderSelectOptions('move', clip.move)}</select></div>
     <div class="field"><label>美学风格</label><select class="select" data-clip-field="style">${renderSelectOptions('look', clip.style)}</select></div>
     <div class="field"><label>色彩影调</label><select class="select" data-clip-field="color">${renderSelectOptions('color', clip.color)}</select></div>
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
    <div class="field">
     <label>入画转场 (${esc(groupLabel('transition', clip.transitionIn) || '硬切')})</label>
     <input class="input" type="number" step="0.1" min="0" max="2" data-clip-num="transitionDur" value="${esc(clip.transitionDur)}" title="转场重叠时长(秒)" />
    </div>
    <div class="field">
     <label>本地视觉参考图</label>
     <input type="file" id="refImgInput" accept="image/*" style="font-size:11px;" />
     ${clip.refImage ? `<button class="btn btn-sm btn-danger" style="margin-top:4px;" data-action="clear-ref-img">移除参考图</button>` : ''}
    </div>
   `}`;
 } else if (sel.track === 'dialogue') {
  formHtml = `
   <div class="field-grid">
    <div class="field"><label>说话人</label><input class="input" data-clip-field="speakerName" value="${esc(clip.speakerName)}" /></div>
    <div class="field"><label>语种</label><select class="select" data-clip-field="language">${LANGUAGE_OPTIONS.map((l) => `<option value="${esc(l)}"${l === clip.language ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label>入点 (s)</label><input class="input" type="number" step="0.1" min="0" data-clip-num="start" value="${esc(clip.start)}" /></div>
    <div class="field"><label>时长 (s)</label><input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" /></div>
   </div>
   <div class="field"><label>语气与停顿节奏</label><input class="input" data-clip-field="delivery" value="${esc(clip.delivery)}" /></div>
   <div class="field"><label>台词内容</label><textarea class="textarea" rows="3" data-clip-field="text">${esc(clip.text)}</textarea></div>`;
 } else if (sel.track === 'audio') {
  formHtml = `
   <div class="field-grid">
    <div class="field"><label>分类</label><select class="select" data-clip-field="kind"><option value="sfx"${clip.kind === 'sfx' ? ' selected' : ''}>音效 SFX</option><option value="ambience"${clip.kind === 'ambience' ? ' selected' : ''}>环境声场</option></select></div>
    <div class="field"><label>时长 (s)</label><input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" /></div>
   </div>
   <div class="field"><label>声音描述</label><textarea class="textarea" rows="3" data-clip-field="cue">${esc(clip.cue)}</textarea></div>
   <div class="field"><label>空间与强弱</label><input class="input" data-clip-field="intensity" value="${esc(clip.intensity)}" /></div>`;
 } else if (sel.track === 'bgm') {
  formHtml = `
   <div class="field"><label>配乐流派</label><select class="select" data-clip-field="style">${renderSelectOptions('bgm', clip.style)}</select></div>
   <div class="field-grid">
    <div class="field"><label>入点 (s)</label><input class="input" type="number" step="0.1" min="0" data-clip-num="start" value="${esc(clip.start)}" /></div>
    <div class="field"><label>时长 (s)</label><input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" /></div>
   </div>
   <div class="field"><label>情绪走势</label><textarea class="textarea" rows="2" data-clip-field="mood">${esc(clip.mood)}</textarea></div>
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
    <span>${uiIcon('clip-settings', 'hdr-svg')}<span>片段参数 · ${esc(sel.track.toUpperCase())}</span></span>
    <button class="btn btn-sm" data-action="deselect-clip" title="返回查看草稿全局参数">草稿参数</button>
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

 let rulerHtml = '';
 for (let s = 0; s <= viewSecs; s += 0.5) {
  const x = Math.round(s * p.zoom);
  const isMajor = Math.abs(s % majorStep) < 0.01;
  rulerHtml += `<div class="ruler-tick ${isMajor ? 'major' : 'minor'}" style="left:${x}px;"></div>`;
  if (isMajor) rulerHtml += `<div class="ruler-label" style="left:${x}px;">${esc(fmtTimecode(s))}</div>`;
 }

 const lanesHtml = TRACKS.map((tr) => {
  const clips = p.tracks[tr.key] || [];
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
   let subClass = '';
   if (hasOverlap) {
    const laneIdx = c.start >= rowEnds[0] - 0.01 ? 0 : 1;
    rowEnds[laneIdx] = roundT(c.start + c.duration);
    subClass = ` subrow-${laneIdx}`;
   }
   return `
    <div class="tl-clip ${esc(tr.key)}${subClass}${isSel ? ' selected' : ''}" data-clip-id="${esc(c.id)}" data-clip-track="${esc(tr.key)}" style="left:${left}px;width:${width}px;">
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
   clipsHtml += `<div class="tl-empty-drop">${uiIcon('storyboard-track', 'drop-svg')}<span>00:00 空白起剪：点击左上方「风格特效 / 运镜方框」或工具栏「+ 分镜 V1」，开始你的创作吧~</span></div>`;
  }

  return `<div class="tl-lane ${tr.key === 'video' ? 'video-row' : ''}" data-lane-track="${esc(tr.key)}">${clipsHtml}</div>`;
 }).join('');

 return `
  <div class="tl-headers">
   <div class="tl-corner"><span>轨道</span><span>${p.fps}fps</span></div>
   ${TRACKS.map((tr) => `
    <div class="tl-track-header ${tr.key === 'video' ? 'video-row' : ''}">
     <div class="tl-th-info">
      ${uiIcon(TRACK_ICON_MAP[tr.key] || 'layers', 'track-ico')}
      <span class="track-badge ${esc(tr.key)}">${esc(tr.code)}</span>
      <span class="tl-th-name">${esc(tr.label)}</span>
     </div>
     <button class="btn btn-sm" style="padding:2px 5px;" data-add-on-track="${esc(tr.key)}" title="添加${esc(tr.label)}">${uiIcon('plus')}</button>
    </div>`).join('')}
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

 return `
  <header class="jy-topbar">
   <div class="topbar-left">
    <button class="btn btn-sm" data-action="go-home">${uiIcon('home')}<span>首页</span></button>
    <button class="btn btn-sm" data-action="open-import">${uiIcon('import')}<span>导入 (1.0/2.0)</span></button>
    <button class="btn btn-sm" data-action="load-demo">${uiIcon('sample-draft')}<span>示例草稿</span></button>
    <button class="btn btn-sm" data-action="new-blank-stay">${uiIcon('new-blank')}<span>新建空白</span></button>
   </div>
   <div class="topbar-center">
    <input class="title-input-center" data-proj-field="title" value="${esc(p.title)}" title="点击编辑草稿名称" />
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
     <span>${uiIcon('aspect-ratio', 'hdr-svg')}<span>播放器 · ${esc(ratio.label)} · ${esc(p.resolution)}</span></span>
     <span>V1:${p.tracks.video.length} T1:${p.tracks.dialogue.length} A1:${p.tracks.audio.length} A2:${p.tracks.bgm.length} E1:${p.tracks.adjust.length}</span>
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
     <button class="btn btn-sm" data-add-on-track="video">${uiIcon('plus')}<span>分镜 V1</span></button>
     <button class="btn btn-sm" data-add-on-track="dialogue">${uiIcon('plus')}<span>对白 T1</span></button>
     <button class="btn btn-sm" data-add-on-track="audio">${uiIcon('plus')}<span>音效 A1</span></button>
     <button class="btn btn-sm" data-add-on-track="bgm">${uiIcon('plus')}<span>配乐 A2</span></button>
     <button class="btn btn-sm" data-add-on-track="adjust">${uiIcon('plus')}<span>调节 E1</span></button>
     <div class="tl-sep"></div>
     <button class="btn btn-sm" data-action="undo"${appState.history.length ? '' : ' disabled'} title="撤销 (Ctrl+Z)">${uiIcon('undo')}</button>
     <button class="btn btn-sm" data-action="redo"${appState.future.length ? '' : ' disabled'} title="重做 (Ctrl+Y)">${uiIcon('redo')}</button>
     <button class="btn btn-sm" data-action="split-playhead" title="在播放头红线分割片段 (B/S)">${uiIcon('split')}<span>分割</span></button>
     <button class="btn btn-sm" data-action="dup-selected"${clip ? '' : ' disabled'} title="复制选中">${uiIcon('layers')}</button>
     <button class="btn btn-sm btn-danger" data-action="del-selected"${clip ? '' : ' disabled'} title="删除选中 (Del)">${uiIcon('delete')}</button>
    </div>
    <div class="tl-tool-group">
     <button class="btn btn-sm btn-jy" data-action="open-compile-modal">${uiIcon('compile-prompt')}<span>2.0 编译提示词</span></button>
     <div class="tl-sep"></div>
     <button class="btn btn-sm ${p.snap ? 'btn-active' : ''}" data-action="toggle-snap">${uiIcon('magnet')}<span>磁吸</span></button>
     <button class="btn btn-sm ${p.ripple ? 'btn-active' : ''}" data-action="toggle-ripple">${uiIcon('link')}<span>联动</span></button>
     <input id="zoomSlider" type="range" min="36" max="150" step="4" value="${p.zoom}" style="width:80px;accent-color:var(--jy-teal);" title="缩放时间轴" />
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
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box wide">
     <div class="modal-head">
      <span>${uiIcon('compile-prompt', 'modal-title-svg')}<span>镜序 2.0 多轨提示词编译导出 (${esc(p.title)})</span></span>
      <button class="btn btn-sm" data-close-modal="1" title="关闭">${uiIcon('close')}</button>
     </div>
     <div class="modal-body">
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
         <div><b>总时长：</b>${projectDuration(p)}s</div>
         <div><b>轨道数量：</b>V1:${p.tracks.video.length} / T1:${p.tracks.dialogue.length} / A1:${p.tracks.audio.length} / A2:${p.tracks.bgm.length} / E1:${p.tracks.adjust.length}</div>
         <div><b>说明：</b>已自动融合调节层覆写与跨镜 J-Cut / 人声避让标识。</div>
        </div>
        <button class="btn btn-jy" style="padding:8px 12px;" data-action="copy-prompt">${uiIcon('layers')}<span>一键复制完整提示词</span></button>
        <div style="display:flex;gap:6px;">
         <button class="btn btn-sm" style="flex:1;" data-action="download-txt">${uiIcon('export')}<span>下载 .txt</span></button>
         <button class="btn btn-sm" style="flex:1;" data-action="download-csv">${uiIcon('export')}<span>导出 .csv</span></button>
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
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box">
     <div class="modal-head">
      <span>${uiIcon('import', 'modal-title-svg')}<span>导入工程 (兼容 2.0 多轨 JSON & 1.0 .jingxu.json)</span></span>
      <button class="btn btn-sm" data-close-modal="1" title="关闭">${uiIcon('close')}</button>
     </div>
     <div class="modal-body">
      <label class="drop-zone" for="importFileInput">
       <div>点击选择或将 <code>.json / .jingxu.json</code> 文件拖到这里</div>
       <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">1.0 分镜会自动将口播台词、音效与配乐拆解进入 2.0 多轨时间轴</div>
       <input id="importFileInput" type="file" accept=".json,.jingxu.json,application/json" style="display:none;" />
      </label>
      <div class="field">
       <label>或直接粘贴 JSON 内容</label>
       <textarea id="importPasteBox" class="textarea" rows="7" placeholder="粘贴 .jingxu2.json 或 .jingxu.json 全文…"></textarea>
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
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box">
     <div class="modal-head"><span>${uiIcon('character-ref', 'modal-title-svg')}<span>编辑角色定妆卡</span></span><button class="btn btn-sm" data-close-modal="1" title="关闭">${uiIcon('close')}</button></div>
     <div class="modal-body">
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;">
       <span style="font-size:11px;color:var(--text-muted);">五官预设：</span>
       ${(FACE_PRESETS || []).map((fp, i) => `<button class="pill-btn" data-apply-face="${i}">${esc(fp.name)}</button>`).join('')}
      </div>
      <div class="field-grid">
       <div class="field"><label>定位</label><input class="input" data-char-draft="role" value="${esc(c.role || '')}" /></div>
       <div class="field"><label style="display:flex;align-items:center;gap:6px;margin-top:16px;"><input type="checkbox" data-char-lock="1"${c.lockIdentity ? ' checked' : ''} /> 锁定跨镜头一致</label></div>
       ${CHARACTER_FIELDS.map(([key, label]) => `<div class="field"><label>${esc(label)}</label><input class="input" data-char-draft="${esc(key)}" value="${esc(c[key] || '')}" /></div>`).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
       <button class="btn" data-close-modal="1">取消</button>
       <button class="btn btn-jy" data-action="save-char-draft">保存角色</button>
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

 return '';
}

function render() {
 const tlViewport = document.getElementById('tlViewport');
 const prevScrollLeft = tlViewport ? tlViewport.scrollLeft : 0;

 rootEl.innerHTML = (appState.screen === 'home' ? renderHomeScreen() : renderEditorScreen()) + renderModal();

 const newVp = document.getElementById('tlViewport');
 if (newVp && prevScrollLeft > 0) newVp.scrollLeft = prevScrollLeft;
 bindTransientInputs();
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
   if (!file || !clip || appState.project.selected?.track !== 'video') return;
   const dataUrl = await compressImageToDataUrl(file, 640);
   pushUndo();
   clip.refImage = dataUrl;
   scheduleSave();
   render();
   showToast('已更新镜头参考图');
  });
 }

 const importFile = document.getElementById('importFileInput');
 if (importFile) {
  importFile.addEventListener('change', async (e) => {
   const file = e.target.files?.[0];
   if (!file) return;
   try {
    loadImportedText(await file.text());
   } catch (err) {
    showToast(`导入失败：${err.message}`);
   }
  });
 }
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
 pushUndo();
 appState.project = nextProj;
 appState.modal = null;
 appState.screen = 'editor';
 await saveProject(nextProj);
 lastProject(nextProj.id);
 await refreshDraftsCache();
 render();
 showToast(`导入成功：${nextProj.tracks.video.length} 个分镜`);
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
 if (e.target.closest('input, textarea, select') && !appState.pendingEditSnapshot) {
  appState.pendingEditSnapshot = clone(appState.project);
 }
});

rootEl.addEventListener('input', (e) => {
 const el = e.target;
 const clipField = el.dataset.clipField;
 const projField = el.dataset.projField;
 const charDraft = el.dataset.charDraft;
 const sceneDraft = el.dataset.sceneDraft;

 if (charDraft && appState.modal?.type === 'char') { appState.modal.draft[charDraft] = el.value; return; }
 if (sceneDraft && appState.modal?.type === 'scene') { appState.modal.draft[sceneDraft] = el.value; return; }

 const clip = selectedClipObj();
 if (clipField && clip && el.tagName !== 'SELECT') {
  clip[clipField] = el.value;
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

rootEl.addEventListener('change', (e) => {
 const el = e.target;
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

 if (appState.pendingEditSnapshot) {
  pushUndo(appState.pendingEditSnapshot);
  appState.pendingEditSnapshot = null;
 }

 if (clipField && clip) {
  clip[clipField] = el.value;
  scheduleSave();
  render();
  return;
 }
 if (clipNum && clip) {
  const track = appState.project.selected.track;
  const val = Number(el.value);
  if (Number.isFinite(val)) {
   if (clipNum === 'transitionDur') clip.transitionDur = roundT(Math.max(0, Math.min(2, val)));
   else if (clipNum === 'start') moveClip(appState.project, track, clip.id, Math.max(0, val));
   else if (clipNum === 'duration') trimClip(appState.project, track, clip.id, 'right', roundT(clip.start + Math.max(0.5, val)));
  }
  scheduleSave();
  render();
  return;
 }
 if (clipBool && clip) {
  clip[clipBool] = Boolean(el.checked);
  scheduleSave();
  render();
  return;
 }
 if (projField) {
  appState.project[projField] = el.value;
  scheduleSave();
  render();
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

 if (target.dataset.closeModal) {
  appState.modal = null;
  render();
  return;
 }

 // Home Sidebar Tabs
 const homeTabBtn = target.closest('[data-home-tab]');
 if (homeTabBtn) {
  appState.homeTab = homeTabBtn.dataset.homeTab;
  await refreshDraftsCache();
  render();
  return;
 }

 // Open/Delete/Export Draft Cards from Home
 const delDraftBtn = target.closest('[data-del-draft]');
 if (delDraftBtn) {
  e.stopPropagation();
  await deleteProject(delDraftBtn.dataset.delDraft);
  await refreshDraftsCache();
  render();
  showToast('已移除该草稿');
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
   appState.screen = 'editor';
   await saveProject(next);
   lastProject(next.id);
   await refreshDraftsCache();
   render();
   showToast(`已套用模板「${tpl.title}」`);
  }
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

 // Click Square Swatch Box (方框选择!)
 const swatchBtn = target.closest('[data-apply-group]');
 if (swatchBtn) {
  stopPlayback();
  const group = swatchBtn.dataset.applyGroup;
  const id = swatchBtn.dataset.applyId;
  const mode = swatchBtn.dataset.applyMode;
  pushUndo();

  if (mode === 'add-bgm') {
   addClip(appState.project, 'bgm', { style: id, mood: `搭配${groupLabel('bgm', id)}` });
   showToast(`已添置 A2 配乐：${groupLabel('bgm', id)}`);
  } else {
   const vClip = ensureActiveVideoClip(groupLabel(group, id) || '新分镜');
   if (mode === 'set-trans') {
    vClip.transitionIn = id;
    if (!vClip.transitionDur && id !== 'cut' && id !== 'direct_cut') vClip.transitionDur = 0.4;
    showToast(`转场已应用：${groupLabel('transition', id)}`);
   } else if (mode === 'toggle-tex') {
    vClip.texture = vClip.texture || [];
    vClip.texture = vClip.texture.includes(id) ? vClip.texture.filter((x) => x !== id) : [...vClip.texture, id];
    showToast(`质感：${groupLabel('texture', id)}`);
   } else {
    const fieldMap = { look: 'style', color: 'color', medium: 'medium', framing: 'framing', move: 'move', angle: 'angle', lightSource: 'lightSource' };
    vClip[fieldMap[group] || group] = id;
    showToast(`已应用至「${vClip.title}」：${groupLabel(group, id)}`);
   }
  }
  scheduleSave();
  render();
  return;
 }

 // Click Preset Card
 const presetCard = target.closest('[data-preset-id]');
 if (presetCard) {
  stopPlayback();
  pushUndo();
  const { clip } = addPresetClip(appState.project, presetCard.dataset.presetId);
  appState.project.playhead = roundT(clip.start);
  scheduleSave();
  render();
  showToast(`已插入「${clipTitleLabel(appState.project.selected.track, clip)}」`);
  return;
 }

 const trackAddBtn = target.closest('[data-add-on-track]');
 if (trackAddBtn) {
  stopPlayback();
  const track = trackAddBtn.dataset.addOnTrack;
  pushUndo();
  const spec = track === 'video' ? { title: `分镜 ${String(appState.project.tracks.video.length + 1).padStart(2, '0')}` } : {};
  const { clip } = addClip(appState.project, track, spec);
  appState.project.playhead = roundT(clip.start);
  scheduleSave();
  render();
  return;
 }

 const jumpTransBtn = target.closest('[data-jump-trans]');
 if (jumpTransBtn) {
  appState.project.selected = { track: 'video', id: jumpTransBtn.dataset.jumpTrans };
  appState.resTab = 'transitions';
  appState.resSubCat = 'all';
  render();
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
   pushUndo();
   const cid = clipCharBtn.dataset.toggleClipChar;
   clip.characterIds = clip.characterIds.includes(cid) ? clip.characterIds.filter((x) => x !== cid) : [...clip.characterIds, cid];
   scheduleSave();
   render();
  }
  return;
 }

 const negBtn = target.closest('[data-toggle-neg]');
 if (negBtn) {
  pushUndo();
  const nid = negBtn.dataset.toggleNeg;
  const arr = appState.project.negativePrompts || [];
  appState.project.negativePrompts = arr.includes(nid) ? arr.filter((x) => x !== nid) : [...arr, nid];
  scheduleSave();
  render();
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
  pushUndo();
  if (!v.characterIds.includes(bindCharBtn.dataset.bindChar)) v.characterIds.push(bindCharBtn.dataset.bindChar);
  scheduleSave();
  render();
  showToast(`已绑定角色至「${v.title}」`);
  return;
 }
 const delCharBtn = target.closest('[data-del-char]');
 if (delCharBtn) {
  pushUndo();
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
  pushUndo();
  v.sceneId = bindSceneBtn.dataset.bindScene;
  scheduleSave();
  render();
  showToast(`已绑定场景至「${v.title}」`);
  return;
 }
 const delSceneBtn = target.closest('[data-del-scene]');
 if (delSceneBtn) {
  pushUndo();
  appState.project.scenes = appState.project.scenes.filter((s) => s.id !== delSceneBtn.dataset.delScene);
  scheduleSave();
  render();
  return;
 }

 const actBtn = target.closest('[data-action]');
 if (!actBtn) return;
 const action = actBtn.dataset.action;

 if (action === 'new-blank-enter' || action === 'new-blank-stay') {
  stopPlayback();
  appState.project = createBlankProject({ title: `${new Date().getMonth() + 1}月${new Date().getDate()}日 · 空白草稿` });
  appState.history = [];
  appState.future = [];
  appState.screen = 'editor';
  await saveProject(appState.project);
  lastProject(appState.project.id);
  await refreshDraftsCache();
  render();
  return;
 }

 if (action === 'load-demo-enter' || action === 'load-demo') {
  stopPlayback();
  appState.project = createDemoProject();
  appState.history = [];
  appState.future = [];
  appState.screen = 'editor';
  await saveProject(appState.project);
  lastProject(appState.project.id);
  await refreshDraftsCache();
  render();
  showToast('已载入《雨夜巷口》5 轨示范草稿');
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

 if (action === 'deselect-clip') {
  appState.project.selected = null;
  render();
  return;
 }

 if (action === 'toggle-play') { togglePlayback(); return; }
 if (action === 'seek-start') { stopPlayback(); appState.project.playhead = 0; updatePlayheadVisuals(); return; }
 if (action === 'seek-end') { stopPlayback(); appState.project.playhead = projectDuration(appState.project); updatePlayheadVisuals(); return; }
 if (action === 'undo') { undo(); return; }
 if (action === 'redo') { redo(); return; }
 if (action === 'open-import') { appState.modal = { type: 'import' }; render(); return; }

 if (action === 'confirm-import-paste') {
  const box = document.getElementById('importPasteBox');
  try { await loadImportedText(box?.value || ''); } catch (err) { showToast(`导入失败：${err.message}`); }
  return;
 }

 if (action === 'export-json') {
  const slug = (appState.project.title || 'jingxu-nle').replace(/[\\/:*?"<>|\s]+/g, '_');
  downloadBlob(`${slug}.jingxu2.json`, JSON.stringify(appState.project, null, 2), 'application/json;charset=utf-8');
  showToast('已导出 2.0 多轨 JSON');
  return;
 }

 if (action === 'clear-all-projects') {
  await clearProjects();
  clearLastProject();
  await refreshDraftsCache();
  render();
  showToast('已清空全部本地草稿');
  return;
 }

 if (action === 'quick-add-video' || action === 'quick-add-dialogue' || action === 'quick-add-audio' || action === 'quick-add-bgm' || action === 'quick-add-adjust') {
  const tr = { 'quick-add-video': 'video', 'quick-add-dialogue': 'dialogue', 'quick-add-audio': 'audio', 'quick-add-bgm': 'bgm', 'quick-add-adjust': 'adjust' }[action];
  stopPlayback();
  pushUndo();
  const spec = tr === 'video' ? { title: `分镜 ${String(appState.project.tracks.video.length + 1).padStart(2, '0')}` } : {};
  const { clip } = addClip(appState.project, tr, spec);
  appState.project.playhead = roundT(clip.start);
  scheduleSave();
  render();
  return;
 }

 if (action === 'split-playhead') {
  stopPlayback();
  pushUndo();
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
  stopPlayback();
  pushUndo();
  duplicateClip(appState.project, sel.track, sel.id);
  scheduleSave();
  render();
  return;
 }

 if (action === 'del-selected') {
  const sel = appState.project.selected;
  if (!sel) return;
  stopPlayback();
  pushUndo();
  deleteClip(appState.project, sel.track, sel.id);
  scheduleSave();
  render();
  return;
 }

 if (action === 'toggle-snap') { appState.project.snap = !appState.project.snap; scheduleSave(); render(); return; }
 if (action === 'toggle-ripple') {
  appState.project.ripple = !appState.project.ripple;
  if (appState.project.ripple) { pushUndo(); normalizeAllTracks(appState.project); }
  scheduleSave();
  render();
  return;
 }

 if (action === 'clear-ref-img') {
  const clip = selectedClipObj();
  if (clip) { pushUndo(); clip.refImage = ''; scheduleSave(); render(); }
  return;
 }

 if (action === 'add-char') {
  appState.modal = { type: 'char', isNew: true, draft: { id: uid('char'), name: `角色 ${appState.project.characters.length + 1}`, role: '主角', lockIdentity: true } };
  render();
  return;
 }
 if (action === 'save-char-draft' && appState.modal?.type === 'char') {
  pushUndo();
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
  pushUndo();
  const d = appState.modal.draft;
  if (appState.modal.isNew) appState.project.scenes.push(d);
  else { const idx = appState.project.scenes.findIndex((x) => x.id === d.id); if (idx >= 0) appState.project.scenes[idx] = d; }
  appState.modal = null;
  scheduleSave();
  render();
  return;
 }

 if (action === 'copy-prompt') {
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
 if (action === 'download-txt') { downloadBlob(`${appState.project.title || 'prompt'}.txt`, compileTimelinePrompt(appState.project)); return; }
 if (action === 'download-csv') { downloadBlob(`${appState.project.title || 'storyboard'}.csv`, '\uFEFF' + compileTimelinePrompt(appState.project, 'table'), 'text/csv;charset=utf-8'); }
});

/* =========================================================
   POINTER DRAG (PLAYHEAD + CLIP MOVE + EDGE TRIM)
========================================================= */
function snapTimeCandidate(rawTime, excludeId) {
 const p = appState.project;
 if (!p.snap) return roundT(rawTime);
 const threshold = Math.max(0.15, 10 / p.zoom);
 const targets = [0, p.playhead];
 for (const k of ['adjust', 'video', 'dialogue', 'audio', 'bgm']) {
  for (const c of p.tracks[k] || []) {
   if (c.id === excludeId) continue;
   targets.push(c.start, roundT(c.start + c.duration));
  }
 }
 let best = roundT(rawTime);
 let minDist = threshold;
 for (const tg of targets) {
  const d = Math.abs(rawTime - tg);
  if (d < minDist) { minDist = d; best = roundT(tg); }
 }
 return best;
}

function showSnapGuide(timeSec) {
 const canvas = document.getElementById('tlCanvas');
 if (!canvas) return;
 let guide = document.getElementById('snapGuideLine');
 if (!guide) {
  guide = document.createElement('div');
  guide.id = 'snapGuideLine';
  guide.className = 'snap-guide';
  canvas.appendChild(guide);
 }
 guide.style.left = `${Math.round(timeSec * appState.project.zoom)}px`;
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
  const clip = (appState.project.tracks[track] || []).find((c) => c.id === clipId);
  if (!clip) return;
  const mode = e.target.closest('.clip-handle-l') ? 'trim-l' : e.target.closest('.clip-handle-r') ? 'trim-r' : 'move';
  appState.dragState = {
   kind: 'clip',
   mode,
   track,
   clipId,
   el: clipEl,
   startX: e.clientX,
   origStart: clip.start,
   origDur: clip.duration,
   moved: false,
   previewTime: clip.start,
   snapshot: clone(appState.project)
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
  const dt = dx / appState.project.zoom;
  if (d.mode === 'move') {
   const nextStart = Math.max(0, snapTimeCandidate(d.origStart + dt, d.clipId));
   d.previewStart = nextStart;
   d.el.style.left = `${Math.round(nextStart * appState.project.zoom)}px`;
   if (Math.abs(nextStart - roundT(Math.max(0, d.origStart + dt))) > 0.01) showSnapGuide(nextStart);
   else document.getElementById('snapGuideLine')?.remove();
  } else if (d.mode === 'trim-l') {
   const oldEnd = roundT(d.origStart + d.origDur);
   const nextStart = Math.min(oldEnd - 0.5, Math.max(0, snapTimeCandidate(Math.max(0, Math.min(oldEnd - 0.5, d.origStart + dt)), d.clipId)));
   d.previewTime = nextStart;
   d.el.style.left = `${Math.round(nextStart * appState.project.zoom)}px`;
   d.el.style.width = `${Math.max(22, Math.round((oldEnd - nextStart) * appState.project.zoom))}px`;
  } else {
   const nextEnd = Math.max(d.origStart + 0.5, snapTimeCandidate(Math.max(d.origStart + 0.5, d.origStart + d.origDur + dt), d.clipId));
   d.previewTime = nextEnd;
   d.el.style.width = `${Math.max(22, Math.round((nextEnd - d.origStart) * appState.project.zoom))}px`;
  }
 }
});

document.addEventListener('pointerup', () => {
 const d = appState.dragState;
 if (!d) return;
 appState.dragState = null;
 document.getElementById('snapGuideLine')?.remove();
 if (d.kind === 'clip') {
  if (!d.moved) {
   appState.project.selected = { track: d.track, id: d.clipId };
   scheduleSave();
   render();
   return;
  }
  pushUndo(d.snapshot);
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
 if (!file || !/\.(json|jingxu\.json)$/i.test(file.name)) return;
 e.preventDefault();
 try { await loadImportedText(await file.text()); } catch (err) { showToast(`拖入失败：${err.message}`); }
});

document.addEventListener('keydown', (e) => {
 if (appState.screen !== 'editor') {
  if (e.key === 'Escape' && appState.modal) { appState.modal = null; render(); }
  return;
 }
 const tag = document.activeElement?.tagName;
 const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { if (typing) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { if (typing) return; e.preventDefault(); redo(); return; }
 if (e.key === 'Escape' && appState.modal) { appState.modal = null; render(); return; }
 if (typing) return;

 if (e.code === 'Space') { e.preventDefault(); togglePlayback(); return; }
 if (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 's') {
  e.preventDefault();
  stopPlayback();
  pushUndo();
  const res = splitAtPlayhead(appState.project);
  if (!res.ok) { appState.history.pop(); showToast(res.reason); }
  else { scheduleSave(); render(); showToast('已分割'); }
  return;
 }
 if (e.key === 'Delete' || e.key === 'Backspace') {
  const sel = appState.project.selected;
  if (sel) { e.preventDefault(); stopPlayback(); pushUndo(); deleteClip(appState.project, sel.track, sel.id); scheduleSave(); render(); }
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
 }
 await refreshDraftsCache();
 appState.screen = 'home';
 appState.homeTab = 'home';
 render();
}

boot();
