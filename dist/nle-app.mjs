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
 SOURCES
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
 clearLastProject,
 projectWasDeleted
} from './nle-storage.mjs';

const MAX_HISTORY = 60;

const appState = {
 project: createBlankProject(),
 history: [],
 future: [],
 pendingEditSnapshot: null,
 leftTab: 'presets',      // 'presets' | 'cast' | 'scenes' | 'credits'
 rightTab: 'inspector',   // 'inspector' | 'project' | 'compile'
 videoSubTab: 'content',  // 'content' | 'camera' | 'style' | 'link'
 playing: false,
 rafId: 0,
 lastRafTs: 0,
 modal: null,             // null | { type: 'import'|'projects'|'transition'|'char'|'scene', ... }
 transFilterCat: 'all',
 transSearch: '',
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

function pushUndo(snapshot = null) {
 const snap = snapshot || clone(appState.project);
 appState.history.push(snap);
 if (appState.history.length > MAX_HISTORY) appState.history.shift();
 appState.future = [];
}

function scheduleSave() {
 clearTimeout(saveTimer);
 saveTimer = setTimeout(async () => {
  try {
   await saveProject(appState.project);
   lastProject(appState.project.id);
   savePrefs({
    zoom: appState.project.zoom,
    outputMode: appState.project.outputMode,
    outputLang: appState.project.outputLang
   });
  } catch (err) {
   console.warn('Auto-save skipped:', err);
  }
 }, 180);
}

function undo() {
 if (!appState.history.length) return;
 stopPlayback();
 appState.future.push(clone(appState.project));
 appState.project = appState.history.pop();
 scheduleSave();
 render();
 showToast('已撤销上一步操作');
}

function redo() {
 if (!appState.future.length) return;
 stopPlayback();
 appState.history.push(clone(appState.project));
 appState.project = appState.future.pop();
 scheduleSave();
 render();
 showToast('已重做操作');
}

function stopPlayback() {
 appState.playing = false;
 if (appState.rafId) {
  cancelAnimationFrame(appState.rafId);
  appState.rafId = 0;
 }
 const btn = document.getElementById('playPauseBtn');
 if (btn) btn.textContent = '▶ 播放';
}

function togglePlayback() {
 const total = projectDuration(appState.project);
 if (total <= 0) {
  showToast('时间轴当前为空（00:00），请先添加一个分镜片段再播放');
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
 if (btn) btn.textContent = '⏸ 暂停';

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

function renderSelectOptions(groupKey, selectedVal, emptyLabel = '— 默认 / 未指定 —') {
 const opts = groupOptions(groupKey);
 return `<option value="">${esc(emptyLabel)}</option>` +
  opts.map((o) => `<option value="${esc(o.id)}"${o.id === selectedVal ? ' selected' : ''}>${esc(o.label || o.zh || o.id)}</option>`).join('');
}

function renderProgramMonitorInner() {
 const p = appState.project;
 const total = projectDuration(p);
 const st = stateAtTime(p, p.playhead);

 if (total <= 0) {
  return `
   <div class="blank-slate">
    <div class="blank-tc">00:00:00</div>
    <div style="font-weight:700;font-size:14px;margin-bottom:5px;">空白多轨时间轴 · 从零纯手动自由剪辑</div>
    <div class="blank-sub">无需任何 AI API 或密钥。像使用剪映一样先添镜头、拖时间条、按口型摆对白、再对齐音效与调节层。</div>
    <div class="blank-actions">
     <button class="btn btn-primary" data-action="quick-add-video">+ 新建空白分镜 (V1)</button>
     <button class="btn btn-accent-amber" data-action="quick-add-dialogue">+ 添加对白字幕 (T1)</button>
     <button class="btn" data-action="open-import">导入 1.0 / 2.0 工程</button>
     <button class="btn" data-action="load-demo">载入雨夜 5 轨示范</button>
    </div>
   </div>`;
 }

 const v = st.effectiveVisual;
 if (!v) {
  return `
   <div class="stage-visual">
    <div class="stage-top-row">
     <div class="stage-badges">
      <span class="stage-chip">黑场 / 空隙 (${fmtTimecode(st.time)})</span>
      ${st.bgms.map((b) => `<span class="stage-chip bgm">🎵 ${esc(groupLabel('bgm', b.style) || 'BGM')}${b.isDucking ? ' [Duck]' : ''}</span>`).join('')}
      ${st.audios.map((a) => `<span class="stage-chip sfx">🔊 ${esc(a.cue || '音效')}</span>`).join('')}
     </div>
    </div>
    <div class="stage-mid-vf">
     <div class="vf-framing-tag">GAP / SLUG</div>
     <div class="vf-title" style="color:var(--text-muted)">当前时间点无 V1 画面片段</div>
    </div>
    <div class="stage-bottom-row">
     ${st.dialogues.map((d) => `<div class="subtitle-box"><span class="subtitle-speaker">${esc(d.speakerName)}:</span>${esc(d.text || '…')}</div>`).join('')}
    </div>
   </div>`;
 }

 const framingTxt = groupLabel('framing', v.framing) || '镜头';
 const moveTxt = groupLabel('move', v.move);
 const lookTxt = groupLabel('look', v.style);
 const tintMap = {
  hk_cinema: 'radial-gradient(circle at 25% 25%, rgba(16,185,129,0.22), rgba(244,63,94,0.12) 60%, rgba(9,12,20,0.9))',
  noir: 'radial-gradient(circle at 75% 20%, rgba(56,189,248,0.2), rgba(15,23,42,0.92))',
  warm_vintage: 'radial-gradient(circle at 40% 35%, rgba(245,158,11,0.22), rgba(18,13,10,0.92))'
 };
 const bgStyle = tintMap[v.style] || 'radial-gradient(circle at 50% 35%, rgba(56,189,248,0.16), rgba(9,12,20,0.94))';

 return `
  <div class="stage-visual" style="background:${bgStyle};">
   ${v.refImage ? `<img class="stage-ref-img" src="${esc(v.refImage)}" alt="shot reference" />` : ''}
   <div class="stage-scrim"></div>
   <div class="stage-top-row">
    <div class="stage-badges">
     <span class="stage-chip">V1 · ${esc(v.title || '分镜')}</span>
     ${st.adjusts.map((a) => `<span class="stage-chip adj">✨ ${esc(a.label || '调节层')}</span>`).join('')}
     ${st.transitionActive ? `<span class="stage-chip trans">⇄ ${esc(groupLabel('transition', st.transitionActive.type))} (${Math.round(st.transitionActive.progress * 100)}%)</span>` : ''}
    </div>
    <div class="stage-badges">
     ${st.audios.map((a) => `<span class="stage-chip sfx">🔊 ${esc(a.kind === 'ambience' ? '环境' : '音效')}: ${esc((a.cue || '').slice(0, 14))}</span>`).join('')}
     ${st.bgms.map((b) => `<span class="stage-chip bgm">🎵 ${esc(groupLabel('bgm', b.style) || '配乐')}${b.isDucking ? ' [人声避让]' : ''}</span>`).join('')}
    </div>
   </div>
   <div class="stage-mid-vf">
    <div class="vf-framing-tag">${esc([framingTxt, moveTxt, lookTxt].filter(Boolean).join(' · '))}</div>
    <div class="vf-title">${esc(v.title || '未命名镜头')}</div>
    <div class="vf-prompt">${esc(v.prompt || '（双击左侧或右侧属性栏填写该镜头画面动作描述）')}</div>
   </div>
   <div class="stage-bottom-row">
    ${st.dialogues.map((d) => `<div class="subtitle-box"><span class="subtitle-speaker">${esc(d.speakerName || '对白')}:</span>${esc(d.text || '（此处填台词）')}</div>`).join('')}
   </div>
  </div>`;
}

function updatePlayheadVisuals() {
 const p = appState.project;
 const total = projectDuration(p);
 const needle = document.getElementById('playheadNeedle');
 if (needle) {
  needle.style.left = `${Math.round(p.playhead * p.zoom)}px`;
 }
 const tc = document.getElementById('monitorTimecode');
 if (tc) {
  tc.innerHTML = `${esc(fmtFramesTimecode(p.playhead, p.fps))} <span class="timecode-total">/ ${esc(fmtFramesTimecode(total, p.fps))} (${p.playhead.toFixed(1)}s)</span>`;
 }
 const scrub = document.getElementById('monitorScrubber');
 if (scrub) {
  scrub.max = String(Math.max(1, total));
  scrub.value = String(Math.min(Math.max(0, p.playhead), Math.max(1, total)));
 }
 const stage = document.getElementById('monitorStage');
 if (stage) {
  stage.innerHTML = renderProgramMonitorInner();
 }
}

function updateCompiledAndLiveViews() {
 const compiledBox = document.getElementById('compiledPromptBox');
 if (compiledBox) {
  compiledBox.value = compileTimelinePrompt(appState.project);
 }
 const stage = document.getElementById('monitorStage');
 if (stage) {
  stage.innerHTML = renderProgramMonitorInner();
 }
 const sel = appState.project.selected;
 if (sel?.id) {
  const clip = selectedClipObj();
  const titleNode = document.querySelector(`[data-clip-title="${sel.id}"]`);
  if (titleNode && clip) {
   titleNode.textContent = clipTitleLabel(sel.track, clip);
  }
  const subNode = document.querySelector(`[data-clip-sub="${sel.id}"]`);
  if (subNode && clip) {
   subNode.textContent = clipSubLabel(sel.track, clip);
  }
 }
}

function clipTitleLabel(track, clip) {
 if (track === 'video') return clip.title || '新分镜';
 if (track === 'dialogue') return `${clip.speakerName || '角色'}: ${clip.text || '对白'}`;
 if (track === 'audio') return `${clip.kind === 'ambience' ? '环境' : '音效'}: ${clip.cue || '待填声音描述'}`;
 if (track === 'bgm') return `配乐: ${groupLabel('bgm', clip.style) || clip.mood || 'BGM'}`;
 return clip.label || '调节层';
}

function clipSubLabel(track, clip) {
 const span = `${fmtTimecode(clip.start)} · ${clip.duration}s`;
 if (track === 'video') {
  const f = groupLabel('framing', clip.framing);
  const m = groupLabel('move', clip.move);
  return [span, f, m].filter(Boolean).join(' · ');
 }
 return span;
}

function renderLeftBin() {
 const p = appState.project;
 if (appState.leftTab === 'presets') {
  const groups = new Map();
  for (const preset of CLIP_PRESETS) {
   if (!groups.has(preset.category)) groups.set(preset.category, []);
   groups.get(preset.category).push(preset);
  }
  let html = '';
  for (const [cat, items] of groups.entries()) {
   html += `<div class="preset-cat-title">${esc(cat)}</div>`;
   for (const item of items) {
    html += `
     <div class="preset-card" data-preset-id="${esc(item.id)}" title="点击直接插到当前时间轴">
      <div class="preset-meta">
       <div class="preset-label">${esc(item.label)}</div>
       <div class="preset-sub">${item.track === 'video' ? '追加或插到 V1 轨道' : '放置到红线播放头时间点'}</div>
      </div>
      <span class="track-badge ${esc(item.track)}">${esc(item.track === 'video' ? 'V1' : item.track === 'dialogue' ? 'T1' : item.track === 'audio' ? 'A1' : item.track === 'bgm' ? 'A2' : 'E1')}</span>
     </div>`;
   }
  }
  return html;
 }

 if (appState.leftTab === 'cast') {
  return `
   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="font-size:12px;color:var(--text-muted)">角色身份定妆卡 (${p.characters.length})</span>
    <button class="btn btn-sm btn-primary" data-action="add-char">+ 新增角色</button>
   </div>
   ${p.characters.length ? p.characters.map((c) => `
    <div class="entity-item">
     <div class="entity-head">
      <span>${esc(c.name || '未命名角色')} ${c.lockIdentity ? '🔒' : ''}</span>
      <div style="display:flex;gap:4px;">
       <button class="btn btn-sm" data-edit-char="${esc(c.id)}">编辑</button>
       <button class="btn btn-sm btn-accent-cyan" data-bind-char="${esc(c.id)}" title="绑定到当前选中的 V1 分镜">入镜</button>
       <button class="btn btn-sm btn-danger" data-del-char="${esc(c.id)}">删</button>
      </div>
     </div>
     <div class="entity-desc">${esc([c.role, c.appearance, c.outfit].filter(Boolean).join(' · ') || '点击编辑补充外貌、服装与声线特征')}</div>
    </div>`).join('') : '<div style="color:var(--text-dim);font-size:12px;padding:12px 0;">暂无固定角色，可点右上「+ 新增角色」锁定跨镜头一致性。</div>'}`;
 }

 if (appState.leftTab === 'scenes') {
  return `
   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="font-size:12px;color:var(--text-muted)">场景空间锚点 (${p.scenes.length})</span>
    <button class="btn btn-sm btn-primary" data-action="add-scene">+ 新增场景</button>
   </div>
   ${p.scenes.length ? p.scenes.map((s) => `
    <div class="entity-item">
     <div class="entity-head">
      <span>${esc(s.name || '未命名场景')}</span>
      <div style="display:flex;gap:4px;">
       <button class="btn btn-sm" data-edit-scene="${esc(s.id)}">编辑</button>
       <button class="btn btn-sm btn-accent-cyan" data-bind-scene="${esc(s.id)}" title="设为当前 V1 镜头所属场景">绑定</button>
       <button class="btn btn-sm btn-danger" data-del-scene="${esc(s.id)}">删</button>
      </div>
     </div>
     <div class="entity-desc">${esc(s.description || s.location || '点击编辑场景空间与光影氛围')}</div>
    </div>`).join('') : '<div style="color:var(--text-dim);font-size:12px;padding:12px 0;">暂无场景锚点，可新增环境设定复用给多个分镜。</div>'}`;
 }

 return `
  <div class="preset-cat-title">剪映式快捷键指南</div>
  <div class="entity-item" style="font-size:11.5px;line-height:1.7;">
   <div><b>Space</b>：播放 / 暂停监视器</div>
   <div><b>B</b> 或 <b>S</b>：在红色播放头位置分割片段</div>
   <div><b>← / →</b>：微调播放头 ±0.2s（配 Shift ±1s）</div>
   <div><b>Delete</b>：删除当前选中片段（联动自动合拢）</div>
   <div><b>Ctrl + Z / Y</b>：撤销 / 重做（最多 60 步）</div>
   <div><b>拖拽左右边缘</b>：裁剪任意轨道片段时长（≥0.5s）</div>
  </div>
  <div class="preset-cat-title">开源词典与致谢</div>
  ${SOURCES.map(([name, role, url, lic]) => `
   <div class="entity-item" style="font-size:11.5px;">
    <div style="font-weight:700;">${esc(name)} <span style="color:var(--text-dim)">(${esc(lic)})</span></div>
    <div style="color:var(--text-muted);margin-top:2px;">${esc(role)}</div>
   </div>`).join('')}`;
}

function renderClipInspector() {
 const p = appState.project;
 const sel = p.selected;
 const clip = selectedClipObj();

 if (!sel || !clip) {
  return `
   <div style="padding:14px 4px;color:var(--text-muted);font-size:12.5px;line-height:1.65;">
    <div style="font-weight:700;color:var(--text-main);margin-bottom:8px;">当前未选中任何时间轴片段</div>
    <p style="margin:0 0 10px;">在下方多轨时间轴中<b>单击任意片段</b>即可在此精细调整文字、景别运镜、对白时间窗、音效强弱或调节层覆写。</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
     <button class="btn btn-sm btn-accent-cyan" data-action="quick-add-video">+ 添加分镜 V1</button>
     <button class="btn btn-sm btn-accent-amber" data-action="quick-add-dialogue">+ 添加对白 T1</button>
     <button class="btn btn-sm btn-accent-emerald" data-action="quick-add-audio">+ 添加音效 A1</button>
     <button class="btn btn-sm btn-accent-violet" data-action="quick-add-bgm">+ 添加配乐 A2</button>
     <button class="btn btn-sm btn-accent-rose" data-action="quick-add-adjust">+ 添加调节层 E1</button>
    </div>
   </div>`;
 }

 if (sel.track === 'video') {
  const sub = appState.videoSubTab;
  const subTabs = `
   <div class="sub-pill-tabs">
    <button class="pill-btn ${sub === 'content' ? 'active' : ''}" data-vsub="content">分镜文案</button>
    <button class="pill-btn ${sub === 'camera' ? 'active' : ''}" data-vsub="camera">景别运镜</button>
    <button class="pill-btn ${sub === 'style' ? 'active' : ''}" data-vsub="style">影调光影</button>
    <button class="pill-btn ${sub === 'link' ? 'active' : ''}" data-vsub="link">关联与转场</button>
   </div>`;

  let body = '';
  if (sub === 'content') {
   body = `
    <div class="field-grid">
     <div class="field">
      <label>片段标题</label>
      <input class="input" data-clip-field="title" value="${esc(clip.title)}" />
     </div>
     <div class="field">
      <label>时长 (秒 ≥0.5s)</label>
      <input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" />
     </div>
    </div>
    <div class="field">
     <label>核心画面与动作描述 (Prompt)</label>
     <textarea class="textarea" rows="3" data-clip-field="prompt" placeholder="描述谁在什么空间做什么关键动作…">${esc(clip.prompt)}</textarea>
    </div>
    <div class="field-grid">
     <div class="field">
      <label>起幅首帧状态</label>
      <textarea class="textarea" rows="2" data-clip-field="startState" placeholder="0% 时刻画面姿态">${esc(clip.startState)}</textarea>
     </div>
     <div class="field">
      <label>落幅尾帧状态</label>
      <textarea class="textarea" rows="2" data-clip-field="endState" placeholder="100% 结束去向">${esc(clip.endState)}</textarea>
     </div>
    </div>
    <div class="field">
     <label>角色细节交互补充</label>
     <input class="input" data-clip-field="characterActions" value="${esc(clip.characterActions)}" placeholder="如：右手拎伞微微抖落水滴" />
    </div>
    <div class="field">
     <label>本地视觉参考图（纯浏览器本地处理）</label>
     <div style="display:flex;gap:6px;align-items:center;">
      <input type="file" id="refImgInput" accept="image/*" style="font-size:11px;max-width:220px;" />
      ${clip.refImage ? `<button class="btn btn-sm btn-danger" data-action="clear-ref-img">移除图片</button>` : ''}
     </div>
    </div>`;
  } else if (sub === 'camera') {
   body = `
    <div class="field-grid">
     <div class="field"><label>景别</label><select class="select" data-clip-field="framing">${renderSelectOptions('framing', clip.framing)}</select></div>
     <div class="field"><label>机位角度</label><select class="select" data-clip-field="angle">${renderSelectOptions('angle', clip.angle)}</select></div>
     <div class="field"><label>构图法</label><select class="select" data-clip-field="composition">${renderSelectOptions('composition', clip.composition)}</select></div>
     <div class="field"><label>运镜方式</label><select class="select" data-clip-field="move">${renderSelectOptions('move', clip.move)}</select></div>
     <div class="field"><label>运镜速度</label><select class="select" data-clip-field="speed">${renderSelectOptions('speed', clip.speed)}</select></div>
     <div class="field"><label>支撑稳定</label><select class="select" data-clip-field="stability">${renderSelectOptions('stability', clip.stability)}</select></div>
     <div class="field"><label>光学焦段</label><select class="select" data-clip-field="lens">${renderSelectOptions('lens', clip.lens)}</select></div>
     <div class="field"><label>对焦景深</label><select class="select" data-clip-field="focus">${renderSelectOptions('focus', clip.focus)}</select></div>
     <div class="field"><label>旋转滚轴</label><select class="select" data-clip-field="rotation">${renderSelectOptions('rotation', clip.rotation)}</select></div>
     <div class="field"><label>变焦节奏</label><select class="select" data-clip-field="zoom">${renderSelectOptions('zoom', clip.zoom)}</select></div>
     <div class="field"><label>情绪基调</label><select class="select" data-clip-field="emotion">${renderSelectOptions('emotion', clip.emotion)}</select></div>
     <div class="field"><label>微表情动作</label><select class="select" data-clip-field="micro">${renderSelectOptions('micro', clip.micro)}</select></div>
    </div>`;
  } else if (sub === 'style') {
   const texOpts = groupOptions('texture');
   body = `
    <div class="field-grid">
     <div class="field"><label>视觉美学</label><select class="select" data-clip-field="style">${renderSelectOptions('look', clip.style)}</select></div>
     <div class="field"><label>拍摄媒介</label><select class="select" data-clip-field="medium">${renderSelectOptions('medium', clip.medium)}</select></div>
     <div class="field"><label>题材类型</label><select class="select" data-clip-field="genre">${renderSelectOptions('genre', clip.genre)}</select></div>
     <div class="field"><label>色彩影调</label><select class="select" data-clip-field="color">${renderSelectOptions('color', clip.color)}</select></div>
     <div class="field"><label>主光源类型</label><select class="select" data-clip-field="lightSource">${renderSelectOptions('lightSource', clip.lightSource)}</select></div>
     <div class="field"><label>布光方向</label><select class="select" data-clip-field="lightDirection">${renderSelectOptions('lightDirection', clip.lightDirection)}</select></div>
     <div class="field"><label>光质反差</label><select class="select" data-clip-field="lightQuality">${renderSelectOptions('lightQuality', clip.lightQuality)}</select></div>
     <div class="field"><label>气象时段</label><select class="select" data-clip-field="weather">${renderSelectOptions('weather', clip.weather)}</select></div>
     <div class="field full"><label>时间时段</label><select class="select" data-clip-field="time">${renderSelectOptions('time', clip.time)}</select></div>
    </div>
    <div class="field">
     <label>质感与材质标签 (多选)</label>
     <div style="display:flex;flex-wrap:wrap;gap:5px;">
      ${texOpts.map((t) => {
       const on = (clip.texture || []).includes(t.id);
       return `<button class="pill-btn ${on ? 'active' : ''}" data-toggle-tex="${esc(t.id)}">${esc(t.label)}</button>`;
      }).join('')}
     </div>
    </div>`;
  } else {
   body = `
    <div class="field">
     <label>绑定场景锚点</label>
     <select class="select" data-clip-field="sceneId">
      <option value="">— 不绑定预设场景 —</option>
      ${p.scenes.map((s) => `<option value="${esc(s.id)}"${s.id === clip.sceneId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
     </select>
    </div>
    <div class="field">
     <label>出镜固定角色 (多选)</label>
     <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${p.characters.length ? p.characters.map((c) => {
       const on = (clip.characterIds || []).includes(c.id);
       return `<button class="pill-btn ${on ? 'active' : ''}" data-toggle-clip-char="${esc(c.id)}">${esc(c.name)}</button>`;
      }).join('') : '<span style="color:var(--text-dim);font-size:11.5px;">先在左侧「角色定妆」中新建角色即可勾选。</span>'}
     </div>
    </div>
    <div class="field">
     <label>入画转场 (${esc(groupLabel('transition', clip.transitionIn) || '硬切')})</label>
     <div style="display:flex;gap:6px;">
      <button class="btn btn-sm btn-primary" data-open-trans="${esc(clip.id)}">⇄ 浏览 110 种专业转场</button>
      <input class="input" type="number" step="0.1" min="0" max="2" style="width:76px;" data-clip-num="transitionDur" value="${esc(clip.transitionDur)}" title="转场时长 (秒)" />
     </div>
    </div>`;
  }
  return subTabs + body;
 }

 if (sel.track === 'dialogue') {
  return `
   <div style="font-weight:700;color:var(--c-dialogue);margin-bottom:8px;">T1 对白 / 字幕片段 (${fmtTimecode(clip.start)} · ${clip.duration}s)</div>
   <div class="field-grid">
    <div class="field">
     <label>说话人名称</label>
     <input class="input" data-clip-field="speakerName" value="${esc(clip.speakerName)}" />
    </div>
    <div class="field">
     <label>对白语种</label>
     <select class="select" data-clip-field="language">
      ${LANGUAGE_OPTIONS.map((l) => `<option value="${esc(l)}"${l === clip.language ? ' selected' : ''}>${esc(l)}</option>`).join('')}
     </select>
    </div>
    <div class="field">
     <label>入点时间 (秒 · 可跨镜 J-Cut)</label>
     <input class="input" type="number" step="0.1" min="0" data-clip-num="start" value="${esc(clip.start)}" />
    </div>
    <div class="field">
     <label>持续时长 (秒)</label>
     <input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" />
    </div>
   </div>
   <div class="field">
    <label>语气 / 口型与停顿指令</label>
    <input class="input" data-clip-field="delivery" value="${esc(clip.delivery)}" placeholder="如：气声低语、说完停顿半秒" />
   </div>
   <div class="field">
    <label>台词原文</label>
    <textarea class="textarea" rows="3" data-clip-field="text" placeholder="输入台词内容，支持先声夺人跨镜覆盖…">${esc(clip.text)}</textarea>
   </div>`;
 }

 if (sel.track === 'audio') {
  return `
   <div style="font-weight:700;color:var(--c-audio);margin-bottom:8px;">A1 音效 / 环境声 (${fmtTimecode(clip.start)} · ${clip.duration}s)</div>
   <div class="field-grid">
    <div class="field">
     <label>声音分类</label>
     <select class="select" data-clip-field="kind">
      <option value="sfx"${clip.kind === 'sfx' ? ' selected' : ''}>动作触发音效 (SFX)</option>
      <option value="ambience"${clip.kind === 'ambience' ? ' selected' : ''}>持续环境声场 (Ambience)</option>
     </select>
    </div>
    <div class="field">
     <label>响度与空间距离</label>
     <input class="input" data-clip-field="intensity" value="${esc(clip.intensity)}" />
    </div>
    <div class="field">
     <label>触发时刻 (秒)</label>
     <input class="input" type="number" step="0.1" min="0" data-clip-num="start" value="${esc(clip.start)}" />
    </div>
    <div class="field">
     <label>时长 (秒)</label>
     <input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" />
    </div>
   </div>
   <div class="field">
    <label>具体声音描述</label>
    <textarea class="textarea" rows="3" data-clip-field="cue" placeholder="如：清脆皮鞋踩过浅水洼声、远方闷雷声…">${esc(clip.cue)}</textarea>
   </div>`;
 }

 if (sel.track === 'bgm') {
  return `
   <div style="font-weight:700;color:var(--c-bgm);margin-bottom:8px;">A2 配乐 BGM (${fmtTimecode(clip.start)} · ${clip.duration}s)</div>
   <div class="field">
    <label>音乐流派 / 乐器编配</label>
    <select class="select" data-clip-field="style">${renderSelectOptions('bgm', clip.style)}</select>
   </div>
   <div class="field-grid">
    <div class="field">
     <label>入点 (秒)</label>
     <input class="input" type="number" step="0.1" min="0" data-clip-num="start" value="${esc(clip.start)}" />
    </div>
    <div class="field">
     <label>时长 (秒)</label>
     <input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" />
    </div>
   </div>
   <div class="field">
    <label>情绪曲线与落点描述</label>
    <textarea class="textarea" rows="2" data-clip-field="mood" placeholder="如：前期低音弦乐铺垫，最后 2 秒骤停">${esc(clip.mood)}</textarea>
   </div>
   <div class="field">
    <label style="display:flex;align-items:center;gap:7px;cursor:pointer;color:var(--text-main);">
     <input type="checkbox" data-clip-bool="duckUnderDialogue"${clip.duckUnderDialogue ? ' checked' : ''} />
     人声对白出现时自动压低背景配乐（Audio Ducking）
    </label>
   </div>`;
 }

 return `
  <div style="font-weight:700;color:var(--c-adjust);margin-bottom:8px;">E1 调节层覆写 (${fmtTimecode(clip.start)} · ${clip.duration}s)</div>
  <div class="field">
   <label>调节层名称</label>
   <input class="input" data-clip-field="label" value="${esc(clip.label)}" />
  </div>
  <div class="field-grid">
   <div class="field">
    <label>起效时间 (秒)</label>
    <input class="input" type="number" step="0.1" min="0" data-clip-num="start" value="${esc(clip.start)}" />
   </div>
   <div class="field">
    <label>持续范围 (秒)</label>
    <input class="input" type="number" step="0.1" min="0.5" data-clip-num="duration" value="${esc(clip.duration)}" />
   </div>
   <div class="field"><label>覆写视觉美学</label><select class="select" data-clip-field="lookOverride">${renderSelectOptions('look', clip.lookOverride, '— 不覆写 —')}</select></div>
   <div class="field"><label>覆写色彩影调</label><select class="select" data-clip-field="colorOverride">${renderSelectOptions('color', clip.colorOverride, '— 不覆写 —')}</select></div>
   <div class="field full"><label>覆写主光源</label><select class="select" data-clip-field="lightOverride">${renderSelectOptions('lightSource', clip.lightOverride, '— 不覆写 —')}</select></div>
  </div>
  <div class="field">
   <label>跨镜运镜 / 光效补充指令</label>
   <textarea class="textarea" rows="2" data-clip-field="cameraModifier" placeholder="同时生效于其下方的所有 V1 镜头">${esc(clip.cameraModifier)}</textarea>
  </div>`;
}

function renderRightPane() {
 const p = appState.project;
 if (appState.rightTab === 'inspector') {
  return renderClipInspector();
 }
 if (appState.rightTab === 'project') {
  const negOpts = groupOptions('negative');
  const issues = validateTimeline(p);
  return `
   <div class="field-grid">
    <div class="field">
     <label>工程画幅</label>
     <select class="select" data-proj-field="format">
      ${NLE_FORMATS.map(([id, label]) => `<option value="${esc(id)}"${id === p.format ? ' selected' : ''}>${esc(label)}</option>`).join('')}
     </select>
    </div>
    <div class="field">
     <label>目标分辨率</label>
     <select class="select" data-proj-field="resolution">
      ${NLE_RESOLUTIONS.map(([id, label]) => `<option value="${esc(id)}"${id === p.resolution ? ' selected' : ''}>${esc(label)}</option>`).join('')}
     </select>
    </div>
    <div class="field">
     <label>时间轴帧率</label>
     <select class="select" data-proj-num="fps">
      ${NLE_FPS.map((f) => `<option value="${f}"${Number(p.fps) === f ? ' selected' : ''}>${f} fps</option>`).join('')}
     </select>
    </div>
    <div class="field">
     <label>输出语言</label>
     <select class="select" data-proj-field="outputLang">
      <option value="zh"${p.outputLang === 'zh' ? ' selected' : ''}>中文电影编导词</option>
      <option value="en"${p.outputLang === 'en' ? ' selected' : ''}>English Prompt</option>
     </select>
    </div>
   </div>
   <div class="field">
    <label>全局负向避坑词 (${p.negativePrompts.length} 已选)</label>
    <div style="display:flex;flex-wrap:wrap;gap:5px;">
     ${negOpts.map((n) => {
      const on = (p.negativePrompts || []).includes(n.id);
      return `<button class="pill-btn ${on ? 'neg-on' : ''}" data-toggle-neg="${esc(n.id)}" title="${esc(n.zh || '')}">${esc(n.label)}</button>`;
     }).join('')}
    </div>
   </div>
   <div class="field">
    <label>自定义负向词（逗号分隔）</label>
    <input class="input" data-proj-field="customNegative" value="${esc(p.customNegative)}" placeholder="如：禁止文字漂浮、禁止多指" />
   </div>
   <div class="field">
    <label>本地结构化体检 (${issues.length})</label>
    ${issues.map((it) => `
     <div class="issue-card ${esc(it.severity)}" data-jump-clip="${esc(it.clipId || '')}" data-jump-track="${esc(it.track || '')}">
      ${it.severity === 'warn' ? '⚠ ' : 'ℹ '}${esc(it.message)}
     </div>`).join('')}
   </div>`;
 }

 // Compile Tab
 const compiled = compileTimelinePrompt(p);
 return `
  <div class="field-grid">
   <div class="field">
    <label>编译格式</label>
    <select class="select" data-proj-field="outputMode">
     ${NLE_OUTPUT_MODES.map(([id, label]) => `<option value="${esc(id)}"${id === p.outputMode ? ' selected' : ''}>${esc(label)}</option>`).join('')}
    </select>
   </div>
   <div class="field">
    <label>输出语言</label>
    <select class="select" data-proj-field="outputLang">
     <option value="zh"${p.outputLang === 'zh' ? ' selected' : ''}>中文 Prompt</option>
     <option value="en"${p.outputLang === 'en' ? ' selected' : ''}>English Prompt</option>
    </select>
   </div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
   <button class="btn btn-sm btn-primary" data-action="copy-prompt">📋 复制提示词</button>
   <button class="btn btn-sm" data-action="download-txt">下载 .txt</button>
   <button class="btn btn-sm" data-action="download-csv">导出分镜表 .csv</button>
  </div>
  <textarea id="compiledPromptBox" class="compiled-box" readonly>${esc(compiled)}</textarea>`;
}

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
  if (isMajor) {
   rulerHtml += `<div class="ruler-label" style="left:${x}px;">${esc(fmtTimecode(s))}</div>`;
  }
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
     <div class="clip-handle-l" title="左边缘拖拽裁剪"></div>
     <div class="clip-content">
      <div class="clip-title" data-clip-title="${esc(c.id)}">${esc(clipTitleLabel(tr.key, c))}</div>
      <div class="clip-sub" data-clip-sub="${esc(c.id)}">${esc(clipSubLabel(tr.key, c))}</div>
     </div>
     <div class="clip-handle-r" title="右边缘拖拽裁剪"></div>
    </div>`;
  }).join('');

  if (tr.key === 'video' && clips.length > 1) {
   for (let i = 1; i < clips.length; i++) {
    const prev = clips[i - 1];
    const curr = clips[i];
    const seamTime = roundT(prev.start + prev.duration);
    if (Math.abs(curr.start - seamTime) < 0.25) {
     const hasFx = curr.transitionIn && curr.transitionIn !== 'cut' && curr.transitionIn !== 'direct_cut';
     clipsHtml += `<button class="trans-capsule${hasFx ? ' has-fx' : ''}" style="left:${Math.round(curr.start * p.zoom)}px;" data-open-trans="${esc(curr.id)}" title="点击设置切点转场：${esc(groupLabel('transition', curr.transitionIn) || '硬切')}">⇄</button>`;
    }
   }
  }

  if (!clips.length && total === 0 && tr.key === 'video') {
   clipsHtml += `<div class="tl-empty-hint">00:00 空白起剪：点上方「+ 分镜 (V1)」或左侧预设积木即可落轨…</div>`;
  }

  return `<div class="tl-lane ${tr.key === 'video' ? 'video-row' : ''}" data-lane-track="${esc(tr.key)}">${clipsHtml}</div>`;
 }).join('');

 return `
  <div class="tl-headers">
   <div class="tl-corner"><span>轨道</span><span>${p.fps}fps</span></div>
   ${TRACKS.map((tr) => `
    <div class="tl-track-header ${tr.key === 'video' ? 'video-row' : ''}">
     <div class="tl-th-info">
      <span class="track-badge ${esc(tr.key)}">${esc(tr.code)}</span>
      <span class="tl-th-name" title="${esc(tr.desc)}">${esc(tr.label)}</span>
     </div>
     <button class="btn btn-sm" style="padding:2px 6px;" data-add-on-track="${esc(tr.key)}" title="在 ${esc(tr.code)} 轨道新增片段">+</button>
    </div>`).join('')}
  </div>
  <div id="tlViewport" class="tl-viewport">
   <div id="tlCanvas" class="tl-canvas" style="width:${widthPx}px;">
    <div id="tlRuler" class="tl-ruler" title="点击或拖动标尺移动红色播放头">${rulerHtml}</div>
    ${lanesHtml}
    <div id="playheadNeedle" class="playhead-line" style="left:${Math.round(p.playhead * p.zoom)}px;">
     <div id="playheadCap" class="playhead-cap" title="拖动红线播放头"></div>
    </div>
   </div>
  </div>`;
}

function renderModal() {
 const m = appState.modal;
 if (!m) return '';

 if (m.type === 'import') {
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box">
     <div class="modal-head">
      <span>导入工程 (兼容 2.0 多轨 JSON & 1.0 .jingxu.json)</span>
      <button class="btn btn-sm" data-close-modal="1">✕</button>
     </div>
     <div class="modal-body">
      <label class="drop-zone" for="importFileInput">
       <div>点击选择或将 <code>.json / .jingxu.json</code> 文件拖到这里</div>
       <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">镜序 1.0 工程会自动拆解分镜、对白至 T1 轨、音效至 A1 轨、BGM 至 A2 轨</div>
       <input id="importFileInput" type="file" accept=".json,.jingxu.json,application/json" style="display:none;" />
      </label>
      <div class="field">
       <label>或直接粘贴 JSON 内容</label>
       <textarea id="importPasteBox" class="textarea" rows="8" placeholder='粘贴 2.0 或 1.0 导出的 JSON 工程全文…'></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
       <button class="btn" data-close-modal="1">取消</button>
       <button class="btn btn-primary" data-action="confirm-import-paste">导入到工作台</button>
      </div>
     </div>
    </div>
   </div>`;
 }

 if (m.type === 'projects') {
  const list = m.items || [];
  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box">
     <div class="modal-head">
      <span>本地工程管理器 (IndexedDB 自动保存 · ${list.length})</span>
      <button class="btn btn-sm" data-close-modal="1">✕</button>
     </div>
     <div class="modal-body">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
       <button class="btn btn-sm btn-primary" data-action="new-blank">+ 从 00:00 新建空白工程</button>
       ${list.length ? `<button class="btn btn-sm btn-danger" data-action="clear-all-projects">清空全部历史</button>` : ''}
      </div>
      ${list.length ? list.map((item) => `
       <div class="entity-item" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div>
         <div style="font-weight:700;">${esc(item.title || '未命名工程')} ${item.id === appState.project.id ? '<span style="color:#38bdf8;font-size:11px;">(当前)</span>' : ''}</div>
         <div style="font-size:11px;color:var(--text-muted);">${item.tracks?.video?.length || 0} 个 V1 分镜 · 总长 ${projectDuration(item)}s</div>
        </div>
        <div style="display:flex;gap:5px;">
         <button class="btn btn-sm btn-primary" data-open-proj="${esc(item.id)}">打开</button>
         <button class="btn btn-sm btn-danger" data-del-proj="${esc(item.id)}">删除</button>
        </div>
       </div>`).join('') : '<div style="color:var(--text-dim);">当前还没有保存在本地的历史工程。</div>'}
     </div>
    </div>
   </div>`;
 }

 if (m.type === 'transition') {
  const targetClip = (appState.project.tracks.video || []).find((c) => c.id === m.clipId);
  const all = groupOptions('transition');
  const q = appState.transSearch.trim().toLowerCase();
  const filtered = all.filter((opt) => {
   if (appState.transFilterCat !== 'all' && opt.cat !== appState.transFilterCat) return false;
   if (q && !`${opt.label} ${opt.zh} ${opt.en} ${opt.id}`.toLowerCase().includes(q)) return false;
   return true;
  });

  return `
   <div class="modal-backdrop" data-close-modal="1">
    <div class="modal-box" style="width:min(760px, 95vw);">
     <div class="modal-head">
      <span>⇄ 选择镜头入画转场 (${filtered.length} / ${all.length} 种)</span>
      <button class="btn btn-sm" data-close-modal="1">✕</button>
     </div>
     <div class="modal-body">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
       <input id="transSearchInput" class="input" style="max-width:220px;" placeholder="搜索如 推镜 / J-Cut / 溶解…" value="${esc(appState.transSearch)}" />
       <button class="pill-btn ${appState.transFilterCat === 'all' ? 'active' : ''}" data-trans-cat="all">全部 (${all.length})</button>
       ${TRANSITION_CATEGORIES.map((c) => `<button class="pill-btn ${appState.transFilterCat === c.id ? 'active' : ''}" data-trans-cat="${esc(c.id)}">${esc(c.short)}</button>`).join('')}
      </div>
      <div class="trans-grid">
       ${filtered.map((opt) => `
        <button class="trans-opt ${targetClip?.transitionIn === opt.id ? 'selected' : ''}" data-pick-trans="${esc(opt.id)}" data-pick-for="${esc(m.clipId)}">
         <div class="trans-opt-title">${esc(opt.label)}</div>
         <div class="trans-opt-desc">${esc(opt.zh || opt.en)}</div>
        </button>`).join('')}
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
     <div class="modal-head">
      <span>编辑角色定妆卡</span>
      <button class="btn btn-sm" data-close-modal="1">✕</button>
     </div>
     <div class="modal-body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
       <span style="font-size:11.5px;color:var(--text-muted);">快速套用自然五官预设：</span>
       ${(FACE_PRESETS || []).map((fp, i) => `<button class="pill-btn" data-apply-face="${i}">${esc(fp.name)}</button>`).join('')}
      </div>
      <div class="field-grid">
       <div class="field"><label>定位角色</label><input class="input" data-char-draft="role" value="${esc(c.role || '')}" placeholder="主角 / 路人 / 反派" /></div>
       <div class="field"><label style="display:flex;align-items:center;gap:6px;margin-top:18px;cursor:pointer;"><input type="checkbox" data-char-lock="1"${c.lockIdentity ? ' checked' : ''} /> 锁定跨镜头身份一致</label></div>
       ${CHARACTER_FIELDS.map(([key, label]) => `
        <div class="field">
         <label>${esc(label)}</label>
         <input class="input" data-char-draft="${esc(key)}" value="${esc(c[key] || '')}" />
        </div>`).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
       <button class="btn" data-close-modal="1">取消</button>
       <button class="btn btn-primary" data-action="save-char-draft">保存角色</button>
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
     <div class="modal-head">
      <span>编辑场景空间锚点</span>
      <button class="btn btn-sm" data-close-modal="1">✕</button>
     </div>
     <div class="modal-body">
      <div class="field-grid">
       ${SCENE_FIELDS.map(([key, label]) => `
        <div class="field ${key === 'description' ? 'full' : ''}">
         <label>${esc(label)}</label>
         <input class="input" data-scene-draft="${esc(key)}" value="${esc(s[key] || '')}" />
        </div>`).join('')}
       <div class="field"><label>天气</label><select class="select" data-scene-draft="weather">${renderSelectOptions('weather', s.weather)}</select></div>
       <div class="field"><label>时段</label><select class="select" data-scene-draft="time">${renderSelectOptions('time', s.time)}</select></div>
       <div class="field"><label>主光源</label><select class="select" data-scene-draft="lightSource">${renderSelectOptions('lightSource', s.lightSource)}</select></div>
       <div class="field"><label>光向</label><select class="select" data-scene-draft="lightDirection">${renderSelectOptions('lightDirection', s.lightDirection)}</select></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
       <button class="btn" data-close-modal="1">取消</button>
       <button class="btn btn-primary" data-action="save-scene-draft">保存场景</button>
      </div>
     </div>
    </div>
   </div>`;
 }

 return '';
}

function render() {
 const p = appState.project;
 const total = projectDuration(p);
 const ratio = aspectRatioParts(p.format, p.customAspect);
 const clip = selectedClipObj();

 const tlViewport = document.getElementById('tlViewport');
 const prevScrollLeft = tlViewport ? tlViewport.scrollLeft : 0;

 rootEl.innerHTML = `
  <header class="nle-topbar">
   <div class="topbar-left">
    <div class="brand-pill"><span class="brand-dot"></span>镜序 2.0 · NLE 剪辑台</div>
    <span class="no-ai-tag">0 AI 依赖</span>
    <input class="title-input" data-proj-field="title" value="${esc(p.title)}" title="点击修改工程名称" />
   </div>
   <div class="topbar-mid">
    <button class="btn btn-sm" data-action="open-projects">📁 工程</button>
    <button class="btn btn-sm btn-primary" data-action="new-blank">+ 00:00 空白起剪</button>
    <button class="btn btn-sm" data-action="load-demo">示例工程</button>
    <button class="btn btn-sm" data-action="open-import">导入 (1.0/2.0)</button>
    <button class="btn btn-sm" data-action="export-json">导出 JSON</button>
   </div>
   <div class="topbar-right">
    <button class="btn btn-sm" data-action="undo"${appState.history.length ? '' : ' disabled'} title="撤销 (Ctrl+Z)">↶ 撤销</button>
    <button class="btn btn-sm" data-action="redo"${appState.future.length ? '' : ' disabled'} title="重做 (Ctrl+Y)">↷ 重做</button>
    <select class="spec-select" data-proj-field="format" title="工程画幅比例">
     ${NLE_FORMATS.map(([id, label]) => `<option value="${esc(id)}"${id === p.format ? ' selected' : ''}>${esc(id === 'custom' ? '自定义比例' : id)}</option>`).join('')}
    </select>
    <select class="spec-select" data-proj-num="fps" title="时间轴帧率">
     ${NLE_FPS.map((f) => `<option value="${f}"${Number(p.fps) === f ? ' selected' : ''}>${f}fps</option>`).join('')}
    </select>
   </div>
  </header>

  <main class="nle-studio">
   <aside class="studio-pane">
    <div class="pane-tabs">
     <button class="tab-btn ${appState.leftTab === 'presets' ? 'active' : ''}" data-left-tab="presets">积木库</button>
     <button class="tab-btn ${appState.leftTab === 'cast' ? 'active' : ''}" data-left-tab="cast">角色 (${p.characters.length})</button>
     <button class="tab-btn ${appState.leftTab === 'scenes' ? 'active' : ''}" data-left-tab="scenes">场景 (${p.scenes.length})</button>
     <button class="tab-btn ${appState.leftTab === 'credits' ? 'active' : ''}" data-left-tab="credits">快捷键</button>
    </div>
    <div class="pane-scroll">${renderLeftBin()}</div>
   </aside>

   <section class="monitor-pane">
    <div class="monitor-header">
     <span>节目监视器 · ${esc(ratio.label)} · ${esc(p.resolution)}</span>
     <span>轨道镜头 V1:${p.tracks.video.length} · T1:${p.tracks.dialogue.length} · A1:${p.tracks.audio.length} · A2:${p.tracks.bgm.length} · E1:${p.tracks.adjust.length}</span>
    </div>
    <div class="monitor-bay">
     <div id="monitorStage" class="monitor-stage" style="aspect-ratio:${ratio.w} / ${ratio.h};width:${ratio.ratio >= 1 ? 'min(100%, 620px)' : 'auto'};height:${ratio.ratio < 1 ? 'min(100%, 280px)' : 'auto'};max-height:100%;">
      ${renderProgramMonitorInner()}
     </div>
    </div>
    <div class="monitor-transport">
     <div class="transport-btns">
      <button class="btn btn-sm" data-action="seek-start" title="跳到开头 00:00">⏮</button>
      <button id="playPauseBtn" class="btn btn-sm btn-primary play-btn" data-action="toggle-play" title="播放/暂停 (Space)">${appState.playing ? '⏸ 暂停' : '▶ 播放'}</button>
      <button class="btn btn-sm" data-action="seek-end" title="跳到末尾">⏭</button>
     </div>
     <input id="monitorScrubber" class="scrub-slider" type="range" min="0" max="${Math.max(1, total)}" step="0.1" value="${Math.min(p.playhead, Math.max(1, total))}" />
     <div id="monitorTimecode" class="timecode-readout">${esc(fmtFramesTimecode(p.playhead, p.fps))} <span class="timecode-total">/ ${esc(fmtFramesTimecode(total, p.fps))} (${p.playhead.toFixed(1)}s)</span></div>
    </div>
   </section>

   <aside class="studio-pane">
    <div class="pane-tabs">
     <button class="tab-btn ${appState.rightTab === 'inspector' ? 'active' : ''}" data-right-tab="inspector">片段属性</button>
     <button class="tab-btn ${appState.rightTab === 'project' ? 'active' : ''}" data-right-tab="project">工程与避坑</button>
     <button class="tab-btn ${appState.rightTab === 'compile' ? 'active' : ''}" data-right-tab="compile">提示词编译</button>
    </div>
    <div class="pane-scroll">${renderRightPane()}</div>
   </aside>
  </main>

  <section class="timeline-dock">
   <div class="tl-toolbar">
    <div class="tl-tool-group">
     <button class="btn btn-sm btn-accent-cyan" data-add-on-track="video">+ 分镜 V1</button>
     <button class="btn btn-sm btn-accent-amber" data-add-on-track="dialogue">+ 对白 T1</button>
     <button class="btn btn-sm btn-accent-emerald" data-add-on-track="audio">+ 音效 A1</button>
     <button class="btn btn-sm btn-accent-violet" data-add-on-track="bgm">+ 配乐 A2</button>
     <button class="btn btn-sm btn-accent-rose" data-add-on-track="adjust">+ 调节 E1</button>
     <div class="tl-sep"></div>
     <button class="btn btn-sm" data-action="split-playhead" title="按红色播放头位置裁剪拆分当前片段 (快捷键 B 或 S)">✂️ 分割 (B/S)</button>
     <button class="btn btn-sm" data-action="dup-selected"${clip ? '' : ' disabled'}>📋 复制</button>
     <button class="btn btn-sm btn-danger" data-action="del-selected"${clip ? '' : ' disabled'} title="删除选中片段 (Delete)">🗑 删除</button>
    </div>
    <div class="tl-tool-group">
     <button class="btn btn-sm ${p.snap ? 'btn-active' : ''}" data-action="toggle-snap" title="拖拽片段时磁吸到红线与相邻剪辑切点">🧲 磁吸</button>
     <button class="btn btn-sm ${p.ripple ? 'btn-active' : ''}" data-action="toggle-ripple" title="V1 主分镜轨自动前后紧贴消除黑场空隙">🔗 主轨联动</button>
     <div class="tl-sep"></div>
     <span style="font-size:11px;color:var(--text-muted);">缩放</span>
     <input id="zoomSlider" type="range" min="36" max="150" step="4" value="${p.zoom}" style="width:92px;accent-color:#38bdf8;" />
    </div>
   </div>
   <div class="tl-body">${renderTimelineBody()}</div>
  </section>

  ${renderModal()}
 `;

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
   showToast('已载入本地参考图至节目监视器');
  });
 }

 const importFile = document.getElementById('importFileInput');
 if (importFile) {
  importFile.addEventListener('change', async (e) => {
   const file = e.target.files?.[0];
   if (!file) return;
   try {
    const text = await file.text();
    loadImportedText(text);
   } catch (err) {
    showToast(`导入失败：${err.message}`);
   }
  });
 }

 const transSearch = document.getElementById('transSearchInput');
 if (transSearch) {
  transSearch.focus();
  const len = transSearch.value.length;
  transSearch.setSelectionRange(len, len);
  transSearch.addEventListener('input', (e) => {
   appState.transSearch = e.target.value;
   render();
  });
 }
}

function compressImageToDataUrl(file, maxW = 640) {
 return new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('读取图片失败'));
  reader.onload = () => {
   const img = new Image();
   img.onerror = () => reject(new Error('无效图片格式'));
   img.onload = () => {
    const scale = img.width > maxW ? maxW / img.width : 1;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    resolve(canvas.toDataURL('image/jpeg', 0.82));
   };
   img.src = reader.result;
  };
  reader.readAsDataURL(file);
 });
}

function loadImportedText(rawText) {
 const nextProj = parseAnyProjectImport(rawText, { rekey: true });
 pushUndo();
 appState.project = nextProj;
 appState.modal = null;
 scheduleSave();
 render();
 showToast(`导入成功：${nextProj.tracks.video.length} 个分镜，总长 ${projectDuration(nextProj)}s`);
}

function downloadBlob(filename, content, mime = 'text/plain;charset=utf-8') {
 const blob = new Blob([content], { type: mime });
 const a = document.createElement('a');
 a.href = URL.createObjectURL(blob);
 a.download = filename;
 document.body.appendChild(a);
 a.click();
 setTimeout(() => {
  URL.revokeObjectURL(a.href);
  a.remove();
 }, 800);
}

// Track-safe delegated event handlers (persisted once on root / document)
rootEl.addEventListener('focusin', (e) => {
 if (e.target.closest('input, textarea, select') && !appState.pendingEditSnapshot) {
  appState.pendingEditSnapshot = clone(appState.project);
 }
});

rootEl.addEventListener('input', (e) => {
 const el = e.target;
 const clipField = el.dataset.clipField;
 const clipNum = el.dataset.clipNum;
 const projField = el.dataset.projField;
 const charDraft = el.dataset.charDraft;
 const sceneDraft = el.dataset.sceneDraft;

 if (charDraft && appState.modal?.type === 'char') {
  appState.modal.draft[charDraft] = el.value;
  return;
 }
 if (sceneDraft && appState.modal?.type === 'scene') {
  appState.modal.draft[sceneDraft] = el.value;
  return;
 }

 const clip = selectedClipObj();
 if (clipField && clip && el.tagName !== 'SELECT') {
  clip[clipField] = el.value;
  scheduleSave();
  updateCompiledAndLiveViews();
  return;
 }
 if (clipNum && clip) {
  return; // commit numeric timeline lengths on 'change' so typing '10.5' isn't clamped halfway
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

 if (charLock && appState.modal?.type === 'char') {
  appState.modal.draft.lockIdentity = Boolean(el.checked);
  return;
 }
 if (sceneDraft && appState.modal?.type === 'scene') {
  appState.modal.draft[sceneDraft] = el.value;
  return;
 }

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
   if (clipNum === 'transitionDur') {
    clip.transitionDur = roundT(Math.max(0, Math.min(2, val)));
   } else if (clipNum === 'start') {
    moveClip(appState.project, track, clip.id, Math.max(0, val));
   } else if (clipNum === 'duration') {
    trimClip(appState.project, track, clip.id, 'right', roundT(clip.start + Math.max(0.5, val)));
   }
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

 // Modal backdrop close
 if (target.dataset.closeModal) {
  appState.modal = null;
  render();
  return;
 }

 const leftTabBtn = target.closest('[data-left-tab]');
 if (leftTabBtn) {
  appState.leftTab = leftTabBtn.dataset.leftTab;
  render();
  return;
 }

 const rightTabBtn = target.closest('[data-right-tab]');
 if (rightTabBtn) {
  appState.rightTab = rightTabBtn.dataset.rightTab;
  render();
  return;
 }

 const vSubBtn = target.closest('[data-vsub]');
 if (vSubBtn) {
  appState.videoSubTab = vSubBtn.dataset.vsub;
  render();
  return;
 }

 const presetCard = target.closest('[data-preset-id]');
 if (presetCard) {
  stopPlayback();
  pushUndo();
  const { clip } = addPresetClip(appState.project, presetCard.dataset.presetId);
  appState.rightTab = 'inspector';
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
  appState.rightTab = 'inspector';
  appState.project.playhead = roundT(clip.start);
  scheduleSave();
  render();
  return;
 }

 const transOpenBtn = target.closest('[data-open-trans]');
 if (transOpenBtn) {
  appState.modal = { type: 'transition', clipId: transOpenBtn.dataset.openTrans };
  appState.transSearch = '';
  render();
  return;
 }

 const transCatBtn = target.closest('[data-trans-cat]');
 if (transCatBtn) {
  appState.transFilterCat = transCatBtn.dataset.transCat;
  render();
  return;
 }

 const pickTransBtn = target.closest('[data-pick-trans]');
 if (pickTransBtn) {
  const clip = (appState.project.tracks.video || []).find((c) => c.id === pickTransBtn.dataset.pickFor);
  if (clip) {
   pushUndo();
   clip.transitionIn = pickTransBtn.dataset.pickTrans;
   if (!clip.transitionDur && clip.transitionIn !== 'cut' && clip.transitionIn !== 'direct_cut') {
    clip.transitionDur = 0.5;
   }
   scheduleSave();
   showToast(`转场已设为：${groupLabel('transition', clip.transitionIn)}`);
  }
  appState.modal = null;
  render();
  return;
 }

 const texBtn = target.closest('[data-toggle-tex]');
 if (texBtn) {
  const clip = selectedClipObj();
  if (clip && Array.isArray(clip.texture)) {
   pushUndo();
   const id = texBtn.dataset.toggleTex;
   clip.texture = clip.texture.includes(id) ? clip.texture.filter((x) => x !== id) : [...clip.texture, id];
   scheduleSave();
   render();
  }
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
    appState.rightTab = 'inspector';
    render();
   }
  }
  return;
 }

 // Cast & Scene entity actions
 const editCharBtn = target.closest('[data-edit-char]');
 if (editCharBtn) {
  const found = appState.project.characters.find((c) => c.id === editCharBtn.dataset.editChar);
  if (found) {
   appState.modal = { type: 'char', draft: clone(found), isNew: false };
   render();
  }
  return;
 }

 const bindCharBtn = target.closest('[data-bind-char]');
 if (bindCharBtn) {
  const clip = selectedClipObj();
  if (clip && appState.project.selected?.track === 'video') {
   pushUndo();
   const cid = bindCharBtn.dataset.bindChar;
   if (!clip.characterIds.includes(cid)) clip.characterIds.push(cid);
   scheduleSave();
   render();
   showToast(`已将角色绑定至「${clip.title}」`);
  } else {
   showToast('请先在下方 V1 分镜轨选中一个镜头片段');
  }
  return;
 }

 const delCharBtn = target.closest('[data-del-char]');
 if (delCharBtn) {
  pushUndo();
  const cid = delCharBtn.dataset.delChar;
  appState.project.characters = appState.project.characters.filter((c) => c.id !== cid);
  scheduleSave();
  render();
  return;
 }

 const faceBtn = target.closest('[data-apply-face]');
 if (faceBtn && appState.modal?.type === 'char') {
  const fp = FACE_PRESETS[Number(faceBtn.dataset.applyFace)];
  if (fp) {
   for (const k of ['face', 'eyes', 'brows', 'nose', 'lips', 'skin']) {
    if (fp[k]) appState.modal.draft[k] = fp[k];
   }
   render();
  }
  return;
 }

 const editSceneBtn = target.closest('[data-edit-scene]');
 if (editSceneBtn) {
  const found = appState.project.scenes.find((s) => s.id === editSceneBtn.dataset.editScene);
  if (found) {
   appState.modal = { type: 'scene', draft: clone(found), isNew: false };
   render();
  }
  return;
 }

 const bindSceneBtn = target.closest('[data-bind-scene]');
 if (bindSceneBtn) {
  const clip = selectedClipObj();
  if (clip && appState.project.selected?.track === 'video') {
   pushUndo();
   clip.sceneId = bindSceneBtn.dataset.bindScene;
   scheduleSave();
   render();
   showToast(`已为「${clip.title}」绑定场景锚点`);
  } else {
   showToast('请先在下方 V1 分镜轨选中一个镜头片段');
  }
  return;
 }

 const delSceneBtn = target.closest('[data-del-scene]');
 if (delSceneBtn) {
  pushUndo();
  const sid = delSceneBtn.dataset.delScene;
  appState.project.scenes = appState.project.scenes.filter((s) => s.id !== sid);
  scheduleSave();
  render();
  return;
 }

 const openProjBtn = target.closest('[data-open-proj]');
 if (openProjBtn) {
  const loaded = await loadProject(openProjBtn.dataset.openProj);
  if (loaded) {
   stopPlayback();
   appState.project = parseAnyProjectImport(loaded, { rekey: false });
   lastProject(appState.project.id);
   appState.history = [];
   appState.future = [];
   appState.modal = null;
   render();
   showToast(`已打开工程：${appState.project.title}`);
  }
  return;
 }

 const delProjBtn = target.closest('[data-del-proj]');
 if (delProjBtn) {
  await deleteProject(delProjBtn.dataset.delProj);
  const items = await listProjects();
  appState.modal = { type: 'projects', items };
  render();
  return;
 }

 const actBtn = target.closest('[data-action]');
 if (!actBtn) return;
 const action = actBtn.dataset.action;

 if (action === 'toggle-play') { togglePlayback(); return; }
 if (action === 'seek-start') { stopPlayback(); appState.project.playhead = 0; updatePlayheadVisuals(); return; }
 if (action === 'seek-end') { stopPlayback(); appState.project.playhead = projectDuration(appState.project); updatePlayheadVisuals(); return; }
 if (action === 'undo') { undo(); return; }
 if (action === 'redo') { redo(); return; }

 if (action === 'new-blank') {
  stopPlayback();
  pushUndo();
  appState.project = createBlankProject();
  appState.modal = null;
  lastProject(appState.project.id);
  scheduleSave();
  render();
  showToast('已创建 00:00 空白工程，自由从 0 开始剪辑');
  return;
 }

 if (action === 'load-demo') {
  stopPlayback();
  pushUndo();
  appState.project = createDemoProject();
  appState.modal = null;
  appState.rightTab = 'inspector';
  scheduleSave();
  render();
  showToast('已载入《雨夜巷口》5 轨示范工程，可点击播放或拖动片段');
  return;
 }

 if (action === 'open-import') {
  appState.modal = { type: 'import' };
  render();
  return;
 }

 if (action === 'confirm-import-paste') {
  const box = document.getElementById('importPasteBox');
  try {
   loadImportedText(box?.value || '');
  } catch (err) {
   showToast(`导入失败：${err.message}`);
  }
  return;
 }

 if (action === 'export-json') {
  const slug = (appState.project.title || 'jingxu-nle').replace(/[\\/:*?"<>|\s]+/g, '_');
  downloadBlob(`${slug}.jingxu2.json`, JSON.stringify(appState.project, null, 2), 'application/json;charset=utf-8');
  showToast('已导出镜序 2.0 多轨工程 (.jingxu2.json)');
  return;
 }

 if (action === 'open-projects') {
  const items = await listProjects();
  appState.modal = { type: 'projects', items };
  render();
  return;
 }

 if (action === 'clear-all-projects') {
  await clearProjects();
  clearLastProject();
  appState.project = createBlankProject();
  appState.modal = { type: 'projects', items: [] };
  render();
  showToast('已清空本地存储历史');
  return;
 }

 if (action === 'quick-add-video' || action === 'quick-add-dialogue' || action === 'quick-add-audio' || action === 'quick-add-bgm' || action === 'quick-add-adjust') {
  const map = {
   'quick-add-video': 'video',
   'quick-add-dialogue': 'dialogue',
   'quick-add-audio': 'audio',
   'quick-add-bgm': 'bgm',
   'quick-add-adjust': 'adjust'
  };
  const tr = map[action];
  stopPlayback();
  pushUndo();
  const spec = tr === 'video' ? { title: `分镜 ${String(appState.project.tracks.video.length + 1).padStart(2, '0')}` } : {};
  const { clip } = addClip(appState.project, tr, spec);
  appState.rightTab = 'inspector';
  appState.project.playhead = roundT(clip.start);
  scheduleSave();
  render();
  return;
 }

 if (action === 'split-playhead') {
  stopPlayback();
  pushUndo();
  const res = splitAtPlayhead(appState.project);
  if (!res.ok) {
   appState.history.pop();
   showToast(res.reason || '当前无法分割');
   return;
  }
  scheduleSave();
  render();
  showToast('✂️ 已按红线位置一刀两段！');
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
  showToast('已复制选中片段');
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
  showToast('已删除选中片段');
  return;
 }

 if (action === 'toggle-snap') {
  appState.project.snap = !appState.project.snap;
  scheduleSave();
  render();
  return;
 }

 if (action === 'toggle-ripple') {
  appState.project.ripple = !appState.project.ripple;
  if (appState.project.ripple) {
   pushUndo();
   normalizeAllTracks(appState.project);
  }
  scheduleSave();
  render();
  return;
 }

 if (action === 'clear-ref-img') {
  const clip = selectedClipObj();
  if (clip) {
   pushUndo();
   clip.refImage = '';
   scheduleSave();
   render();
  }
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
  else {
   const idx = appState.project.characters.findIndex((x) => x.id === d.id);
   if (idx >= 0) appState.project.characters[idx] = d;
  }
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
  else {
   const idx = appState.project.scenes.findIndex((x) => x.id === d.id);
   if (idx >= 0) appState.project.scenes[idx] = d;
  }
  appState.modal = null;
  scheduleSave();
  render();
  return;
 }

 if (action === 'copy-prompt') {
  const txt = compileTimelinePrompt(appState.project);
  try {
   await navigator.clipboard.writeText(txt);
   showToast('完整多轨提示词已复制到剪贴板');
  } catch {
   const box = document.getElementById('compiledPromptBox');
   if (box) {
    box.select();
    document.execCommand('copy');
    showToast('已选中并复制提示词');
   }
  }
  return;
 }

 if (action === 'download-txt') {
  const txt = compileTimelinePrompt(appState.project);
  downloadBlob(`${appState.project.title || 'prompt'}.txt`, txt);
  return;
 }

 if (action === 'download-csv') {
  const csv = '\uFEFF' + compileTimelinePrompt(appState.project, 'table');
  downloadBlob(`${appState.project.title || 'storyboard'}.csv`, csv, 'text/csv;charset=utf-8');
 }
});

// Pointer drag system for Timeline Ruler, Playhead Cap, Clip Move, and Edge Trim
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
  if (d < minDist) {
   minDist = d;
   best = roundT(tg);
  }
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

function hideSnapGuide() {
 document.getElementById('snapGuideLine')?.remove();
}

document.addEventListener('pointerdown', (e) => {
 const capOrRuler = e.target.closest('#playheadCap, #tlRuler');
 if (capOrRuler) {
  e.preventDefault();
  stopPlayback();
  const vp = document.getElementById('tlViewport');
  if (!vp) return;
  const toTime = (clientX) => {
   const rect = vp.getBoundingClientRect();
   const px = Math.max(0, clientX - rect.left + vp.scrollLeft);
   return roundT(px / appState.project.zoom);
  };
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

  const isLeftTrim = Boolean(e.target.closest('.clip-handle-l'));
  const isRightTrim = Boolean(e.target.closest('.clip-handle-r'));
  const mode = isLeftTrim ? 'trim-l' : isRightTrim ? 'trim-r' : 'move';

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
   else hideSnapGuide();
  } else if (d.mode === 'trim-l') {
   const oldEnd = roundT(d.origStart + d.origDur);
   const rawStart = Math.max(0, Math.min(oldEnd - 0.5, d.origStart + dt));
   const nextStart = Math.min(oldEnd - 0.5, Math.max(0, snapTimeCandidate(rawStart, d.clipId)));
   const nextDur = roundT(oldEnd - nextStart);
   d.previewTime = nextStart;
   d.el.style.left = `${Math.round(nextStart * appState.project.zoom)}px`;
   d.el.style.width = `${Math.max(22, Math.round(nextDur * appState.project.zoom))}px`;
  } else if (d.mode === 'trim-r') {
   const rawEnd = Math.max(d.origStart + 0.5, d.origStart + d.origDur + dt);
   const nextEnd = Math.max(d.origStart + 0.5, snapTimeCandidate(rawEnd, d.clipId));
   const nextDur = roundT(nextEnd - d.origStart);
   d.previewTime = nextEnd;
   d.el.style.width = `${Math.max(22, Math.round(nextDur * appState.project.zoom))}px`;
  }
 }
});

document.addEventListener('pointerup', () => {
 const d = appState.dragState;
 if (!d) return;
 appState.dragState = null;
 hideSnapGuide();

 if (d.kind === 'clip') {
  if (!d.moved) {
   appState.project.selected = { track: d.track, id: d.clipId };
   appState.rightTab = 'inspector';
   scheduleSave();
   render();
   return;
  }
  pushUndo(d.snapshot);
  appState.project.selected = { track: d.track, id: d.clipId };
  if (d.mode === 'move') {
   moveClip(appState.project, d.track, d.clipId, d.previewStart ?? d.origStart);
  } else if (d.mode === 'trim-l') {
   trimClip(appState.project, d.track, d.clipId, 'left', d.previewTime);
  } else if (d.mode === 'trim-r') {
   trimClip(appState.project, d.track, d.clipId, 'right', d.previewTime);
  }
  scheduleSave();
  render();
 }
});

// Drag & Drop JSON file onto window
document.addEventListener('dragover', (e) => {
 if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
});

document.addEventListener('drop', async (e) => {
 const file = e.dataTransfer?.files?.[0];
 if (!file) return;
 if (!/\.(json|jingxu\.json)$/i.test(file.name)) return;
 e.preventDefault();
 try {
  const txt = await file.text();
  loadImportedText(txt);
 } catch (err) {
  showToast(`拖入导入失败：${err.message}`);
 }
});

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
 const activeTag = document.activeElement?.tagName;
 const typing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
  if (typing) return;
  e.preventDefault();
  if (e.shiftKey) redo();
  else undo();
  return;
 }
 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
  if (typing) return;
  e.preventDefault();
  redo();
  return;
 }

 if (e.key === 'Escape' && appState.modal) {
  appState.modal = null;
  render();
  return;
 }

 if (typing) return;

 if (e.code === 'Space') {
  e.preventDefault();
  togglePlayback();
  return;
 }

 if (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 's') {
  e.preventDefault();
  stopPlayback();
  pushUndo();
  const res = splitAtPlayhead(appState.project);
  if (!res.ok) {
   appState.history.pop();
   showToast(res.reason);
  } else {
   scheduleSave();
   render();
   showToast('✂️ 已按播放头分割片段');
  }
  return;
 }

 if (e.key === 'Delete' || e.key === 'Backspace') {
  const sel = appState.project.selected;
  if (sel) {
   e.preventDefault();
   stopPlayback();
   pushUndo();
   deleteClip(appState.project, sel.track, sel.id);
   scheduleSave();
   render();
  }
  return;
 }

 if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
  e.preventDefault();
  stopPlayback();
  const step = e.shiftKey ? 1.0 : 0.2;
  const dir = e.key === 'ArrowRight' ? 1 : -1;
  const max = projectDuration(appState.project);
  appState.project.playhead = roundT(Math.max(0, Math.min(max, appState.project.playhead + dir * step)));
  updatePlayheadVisuals();
 }
});

// Boot sequence
async function boot() {
 const prefs = readPrefs();
 try {
  const lastId = lastProject();
  if (lastId) {
   const loaded = await loadProject(lastId);
   if (loaded && !projectWasDeleted(loaded)) {
    appState.project = parseAnyProjectImport(loaded, { rekey: false });
    render();
    return;
   }
  }
 } catch (err) {
  console.warn('Could not restore last project, starting fresh at 00:00:', err);
 }

 appState.project = createBlankProject({
  zoom: prefs?.zoom || 72,
  outputMode: prefs?.outputMode || 'storyboard',
  outputLang: prefs?.outputLang || 'zh'
 });
 render();
}

boot();
