/**
 * Deterministic visual square swatches (方框可视化选择卡片) replacing GIF previews
 * for Jianying-style style, color, camera, transition, audio, and adjustment grids.
 */

const LOOK_VISUALS = {
 reality_raw: { bg: 'linear-gradient(145deg,#1e242b,#38424d)', tag: '实拍', accent: '#cbd5e1', badge: 'RAW' },
 cinema: { bg: 'linear-gradient(145deg,#141e2e,#2c3e55)', tag: '院线', accent: '#60a5fa', badge: '2.39' },
 hk_cinema: { bg: 'linear-gradient(145deg,#073b3a,#5b162a 65%,#132a2c)', tag: '港风', accent: '#34d399', badge: 'HK90' },
 leica: { bg: 'linear-gradient(145deg,#1c1917,#44403c)', tag: '徕卡', accent: '#f59e0b', badge: 'M11' },
 handheld_cinema: { bg: 'linear-gradient(145deg,#181e24,#2f3942)', tag: '手持', accent: '#38bdf8', badge: 'REC' },
 imax: { bg: 'linear-gradient(145deg,#091e3a,#1b4965)', tag: 'IMAX', accent: '#7dd3fc', badge: '70mm' },
 anamorphic: { bg: 'linear-gradient(145deg,#0c1824,#1d3557)', tag: '变形', accent: '#93c5fd', badge: 'FLR' },
 tv_drama: { bg: 'linear-gradient(145deg,#242429,#3f3f46)', tag: '剧集', accent: '#e4e4e7', badge: 'TV' },
 short_drama: { bg: 'linear-gradient(145deg,#2a1f3d,#5b21b6)', tag: '短剧', accent: '#c4b5fd', badge: '9:16' },
 noir: { bg: 'linear-gradient(145deg,#09090b,#27272a 55%,#09090b)', tag: '黑色', accent: '#e2e8f0', badge: 'NOIR' },
 phone: { bg: 'linear-gradient(145deg,#1b222c,#2e3b4e)', tag: '手机', accent: '#34d399', badge: 'HDR' },
 selfie: { bg: 'linear-gradient(145deg,#2d1f2b,#4a2c40)', tag: '自拍', accent: '#f9a8d4', badge: 'VLOG' },
 documentary: { bg: 'linear-gradient(145deg,#1c211e,#333c36)', tag: '纪录片', accent: '#a7f3d0', badge: 'DOC' },
 commercial: { bg: 'linear-gradient(145deg,#1c2432,#364966)', tag: 'TVC', accent: '#67e8f9', badge: 'AD' },
 ccd: { bg: 'linear-gradient(145deg,#1d2d2a,#38574f)', tag: 'CCD', accent: '#fde68a', badge: '2003' },
 actioncam: { bg: 'linear-gradient(145deg,#152736,#1e4d6b)', tag: '运动', accent: '#38bdf8', badge: 'FOV' },
 cctv: { bg: 'linear-gradient(145deg,#091914,#123524)', tag: '监控', accent: '#4ade80', badge: 'CAM1' }
};

const COLOR_PALETTES = {
 natural: ['#d4d4d8', '#94a3b8', '#475569'],
 hk_emerald: ['#10b981', '#0f766e', '#be123c'],
 warm: ['#fbbf24', '#d97706', '#78350f'],
 cool: ['#38bdf8', '#0284c7', '#1e3a5f'],
 muted: ['#9ca3af', '#6b7280', '#374151'],
 tealorange: ['#06b6d4', '#0e7490', '#ea580c'],
 fuji_fresh: ['#6ee7b7', '#93c5fd', '#f1f5f9'],
 warm_vintage: ['#fcd34d', '#b45309', '#451a03'],
 cinematic_amber: ['#f59e0b', '#92400e', '#1c1917'],
 noir_contrast: ['#f8fafc', '#475569', '#09090b'],
 pastel_soft: ['#fbcfe8', '#ddd6fe', '#bae6fd'],
 high_saturation: ['#f43f5e', '#eab308', '#3b82f6'],
 bw: ['#f4f4f5', '#71717a', '#18181b'],
 bw_silver: ['#ffffff', '#9ca3af', '#09090b']
};

function framingBoxRect(id) {
 const scales = {
  extremeWide: { w: 40, h: 24, dot: 3 },
  wide: { w: 36, h: 22, dot: 5 },
  full: { w: 30, h: 22, dot: 8 },
  mediumFull: { w: 26, h: 19, dot: 10 },
  medium: { w: 22, h: 17, dot: 12 },
  mediumClose: { w: 18, h: 14, dot: 14 },
  close: { w: 14, h: 11, dot: 16 },
  extremeClose: { w: 11, h: 8, dot: 18 },
  detail: { w: 12, h: 12, dot: 20 }
 };
 const s = scales[id] || { w: 24, h: 16, dot: 10 };
 const x = (48 - s.w) / 2;
 const y = (36 - s.h) / 2;
 return `
  <svg viewBox="0 0 48 36" width="46" height="34" aria-hidden="true">
   <rect x="2" y="2" width="44" height="32" rx="3" fill="none" stroke="#3f3f46" stroke-dasharray="2 2"/>
   <rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" rx="2" fill="rgba(0,196,204,0.16)" stroke="#00c4cc" stroke-width="1.6"/>
   <circle cx="24" cy="18" r="${Math.min(7, s.dot / 3 + 1.5)}" fill="#e4e4e7"/>
  </svg>`;
}

function moveArrowSvg(id) {
 const glyphs = {
  stationary: `<circle cx="24" cy="18" r="5" fill="#00c4cc"/><line x1="15" y1="18" x2="33" y2="18" stroke="#52525b"/>`,
  fixed: `<rect x="16" y="11" width="16" height="14" rx="2" fill="none" stroke="#00c4cc" stroke-width="1.8"/><path d="M21 15l6 6M27 15l-6 6" stroke="#f87171" stroke-width="1.4"/>`,
  push: `<rect x="17" y="12" width="14" height="12" rx="2" fill="none" stroke="#00c4cc" stroke-width="1.6"/><path d="M5 18h10m-3-3l3 3-3 3M43 18H33m3-3l-3 3 3 3" stroke="#e4e4e7" stroke-width="1.6" fill="none"/>`,
  pull: `<rect x="17" y="12" width="14" height="12" rx="2" fill="none" stroke="#00c4cc" stroke-width="1.6"/><path d="M15 18H5m3-3l-3 3 3 3M33 18h10m-3-3l3 3-3 3" stroke="#e4e4e7" stroke-width="1.6" fill="none"/>`,
  track: `<path d="M7 18h34m-5-4l5 4-5 4" stroke="#00c4cc" stroke-width="2" fill="none"/>`,
  follow: `<circle cx="15" cy="18" r="4" fill="#fbbf24"/><path d="M21 18h18m-4-4l4 4-4 4" stroke="#00c4cc" stroke-width="1.8" fill="none"/>`,
  orbit: `<circle cx="24" cy="18" r="3.5" fill="#e4e4e7"/><path d="M10 18a14 9 0 1 1 25 5" fill="none" stroke="#00c4cc" stroke-width="1.8"/><path d="M32 21l3 3 4-2" fill="none" stroke="#00c4cc" stroke-width="1.6"/>`,
  rise: `<path d="M24 30V7m-5 5l5-5 5 5" stroke="#00c4cc" stroke-width="2" fill="none"/>`,
  descend: `<path d="M24 6v23m-5-5l5 5 5-5" stroke="#00c4cc" stroke-width="2" fill="none"/>`,
  pan: `<path d="M9 14c8-5 22-5 30 0m-4-4l4 4-5 2" stroke="#00c4cc" stroke-width="1.8" fill="none"/>`,
  tilt: `<path d="M18 28c-4-7-4-14 0-20m-4 4l4-4 3 4" stroke="#00c4cc" stroke-width="1.8" fill="none"/>`,
  whip: `<path d="M6 18h36M10 13h28M12 23h24" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>`,
  fpv: `<path d="M6 26L20 12l9 7 13-11" stroke="#00c4cc" stroke-width="2" fill="none"/><circle cx="42" cy="8" r="2.5" fill="#fb7185"/>`,
  dollyzoom: `<rect x="13" y="9" width="22" height="18" rx="2" fill="none" stroke="#fbbf24" stroke-width="1.5"/><rect x="19" y="13" width="10" height="10" rx="1" fill="none" stroke="#00c4cc" stroke-width="1.6"/>`
 };
 return `<svg viewBox="0 0 48 36" width="46" height="34" aria-hidden="true">${glyphs[id] || glyphs.push}</svg>`;
}

function transitionVisualSvg(cat, id) {
 const isAudio = cat === 'audio' || id.includes('cut') && (id === 'j_cut' || id === 'l_cut');
 if (isAudio) {
  const jLead = id === 'j_cut';
  return `
   <svg viewBox="0 0 48 36" width="46" height="34" aria-hidden="true">
    <rect x="4" y="6" width="19" height="10" rx="2" fill="#2563eb" opacity=".7"/>
    <rect x="25" y="6" width="19" height="10" rx="2" fill="#00c4cc" opacity=".75"/>
    <rect x="${jLead ? 14 : 4}" y="20" width="${jLead ? 30 : 30}" height="9" rx="2" fill="#f59e0b" opacity=".85"/>
    <line x1="24" y1="3" x2="24" y2="33" stroke="#fff" stroke-width="1.4"/>
   </svg>`;
 }
 const fxColor = cat === 'camera' ? '#38bdf8' : cat === 'vfx' ? '#c084fc' : cat === 'narrative' ? '#fbbf24' : cat === 'rhythmic' ? '#fb7185' : '#00c4cc';
 return `
  <svg viewBox="0 0 48 36" width="46" height="34" aria-hidden="true">
   <rect x="4" y="8" width="18" height="20" rx="2" fill="#27272a" stroke="#52525b"/>
   <rect x="26" y="8" width="18" height="20" rx="2" fill="#18282b" stroke="${fxColor}"/>
   <polygon points="24,11 30,18 24,25 18,18" fill="${fxColor}" opacity="0.9"/>
  </svg>`;
}

/**
 * Render the square box preview HTML for any option inside visual picker grids.
 */
export function renderOptionSwatch(groupKey, opt) {
 if (groupKey === 'look') {
  const v = LOOK_VISUALS[opt.id] || { bg: 'linear-gradient(145deg,#1d2026,#2d333d)', tag: opt.label.slice(0, 2), accent: '#00c4cc', badge: 'FX' };
  return `
   <div class="swatch-visual" style="background:${v.bg};">
    <span class="swatch-corner" style="color:${v.accent};border-color:${v.accent}55;">${v.badge}</span>
    <span class="swatch-center-txt">${v.tag}</span>
   </div>`;
 }
 if (groupKey === 'color') {
  const pal = COLOR_PALETTES[opt.id] || ['#a1a1aa', '#52525b', '#18181b'];
  return `
   <div class="swatch-visual swatch-palette">
    <div style="background:${pal[0]};flex:1;"></div>
    <div style="background:${pal[1]};flex:1;"></div>
    <div style="background:${pal[2]};flex:1;"></div>
    <span class="swatch-center-overlay">${opt.label.slice(0, 4)}</span>
   </div>`;
 }
 if (groupKey === 'medium') {
  const isFilm = /mm|film|kodak|fuji|super8|polaroid/i.test(opt.id);
  return `
   <div class="swatch-visual" style="background:${isFilm ? 'linear-gradient(145deg,#261c15,#3d2a1c)' : 'linear-gradient(145deg,#161f29,#243447)'};">
    <span class="swatch-corner">${isFilm ? 'FILM' : 'DIGI'}</span>
    <span class="swatch-center-txt" style="font-size:12px;">${opt.label.slice(0, 5)}</span>
   </div>`;
 }
 if (groupKey === 'texture') {
  return `
   <div class="swatch-visual" style="background:radial-gradient(circle at 30% 30%, rgba(0,196,204,0.22), #18181b 75%);">
    <span class="swatch-corner">TEX</span>
    <span class="swatch-center-txt" style="font-size:11.5px;">${opt.label.slice(0, 5)}</span>
   </div>`;
 }
 if (groupKey === 'framing') {
  return `<div class="swatch-visual swatch-diagram">${framingBoxRect(opt.id)}</div>`;
 }
 if (groupKey === 'move') {
  return `<div class="swatch-visual swatch-diagram">${moveArrowSvg(opt.id)}</div>`;
 }
 if (groupKey === 'angle') {
  return `
   <div class="swatch-visual swatch-diagram">
    <span class="swatch-corner">ANGLE</span>
    <span class="swatch-center-txt" style="font-size:12px;">${opt.label.slice(0, 4)}</span>
   </div>`;
 }
 if (groupKey === 'transition') {
  return `<div class="swatch-visual swatch-diagram">${transitionVisualSvg(opt.cat || 'basic', opt.id)}</div>`;
 }
 if (groupKey === 'lightSource') {
  const glow = opt.id === 'neon' ? '#00c4cc' : opt.id === 'candle' || opt.id === 'sunset' ? '#f59e0b' : opt.id === 'moon' ? '#93c5fd' : '#e4e4e7';
  return `
   <div class="swatch-visual" style="background:radial-gradient(circle at 50% 28%, ${glow}44, #141418 76%);">
    <span class="swatch-corner">LIGHT</span>
    <span class="swatch-center-txt" style="font-size:12px;">${opt.label.slice(0, 4)}</span>
   </div>`;
 }
 if (groupKey === 'bgm') {
  return `
   <div class="swatch-visual" style="background:linear-gradient(155deg,#1d1629,#141419);">
    <svg viewBox="0 0 48 28" width="44" height="24" aria-hidden="true">
     <rect x="4" y="11" width="3" height="8" rx="1" fill="#a78bfa"/>
     <rect x="10" y="6" width="3" height="17" rx="1" fill="#00c4cc"/>
     <rect x="16" y="3" width="3" height="22" rx="1" fill="#a78bfa"/>
     <rect x="22" y="8" width="3" height="13" rx="1" fill="#c4b5fd"/>
     <rect x="28" y="5" width="3" height="18" rx="1" fill="#00c4cc"/>
     <rect x="34" y="9" width="3" height="11" rx="1" fill="#a78bfa"/>
     <rect x="40" y="12" width="3" height="6" rx="1" fill="#c4b5fd"/>
    </svg>
   </div>`;
 }
 return `<div class="swatch-visual"><span class="swatch-center-txt">${opt.label.slice(0, 4)}</span></div>`;
}
