import { GROUPS } from './nle-catalog.mjs';

export const AI_STORY_TEMPLATES = [
 {
  id: 'rain_mystery',
  label: '雨夜悬疑追查',
  badge: '9:16 竖屏 · 港风霓虹',
  idea: '深夜暴雨巷口，撑透明雨伞的女孩林夏听见身后水洼响起两声脚步，在便利店暖光与霓虹水面倒影间发现一张无署名纸条。',
  brief: {
   format: '9:16',
   visualPreset: 'hk_neon',
   texturePreset: 'hk_film',
   color: 'hk_emerald',
   cameraPref: 'steady_push',
   transitionStyle: 'audio',
   dialogueMode: 'sparse',
   bgmMode: 'guided',
   bgmStyle: 'suspense_strings',
   generateSfx: true,
   chainLastFrame: true
  }
 },
 {
  id: 'hk_reunion',
  label: '90年代茶餐厅重逢',
  badge: '16:9 电影 · 35mm胶片',
  idea: '90年代香港老茶餐厅傍晚，多年未见的男女主角隔着吊扇与磨砂玻璃重逢，桌上一杯凉掉的冻柠茶与旧呼机见证未曾说出口的告别。',
  brief: {
   format: '16:9',
   visualPreset: 'hk_retro',
   texturePreset: 'film',
   color: 'hk_emerald',
   cameraPref: 'wong_slow',
   transitionStyle: 'hk_rhythmic',
   dialogueMode: 'inner_monologue',
   nationality: '中国香港',
   faceTier: 'hk_retro_star',
   bgmMode: 'guided',
   bgmStyle: 'hk_cantopop',
   generateSfx: true
  }
 },
 {
  id: 'morning_healing',
  label: '晨光街角咖啡治愈',
  badge: '16:9 · 日系晨光 + 纯钢琴',
  idea: '日出后金色晨光斜照进安静街角咖啡馆，青年手握热豆浆纸杯望向窗外梧桐树影，收到一条改变决定的人生短信，从迟疑到微笑释怀。',
  brief: {
   format: '16:9',
   visualPreset: 'japanese_film',
   texturePreset: 'fuji_airy',
   color: 'fuji_fresh',
   cameraPref: 'steady_push',
   transitionStyle: 'emotional_fade',
   dialogueMode: 'sparse',
   bgmMode: 'exact',
   bgmStyle: 'solo_piano',
   bgmMood: '前期安静留白，日出后独奏钢琴温柔切入',
   generateSfx: true
  }
 },
 {
  id: 'urban_shortdrama',
  label: '都市微短剧爽点交锋',
  badge: '9:16 竖屏 · 紧凑对白',
  idea: '写字楼暴雨夜玻璃幕墙会议室内，原本被压榨辞退的实习生拿出原始备份证据卡片反杀上司，三句话完成立场反转。',
  brief: {
   format: '9:16',
   visualPreset: 'short_drama',
   texturePreset: 'short_drama_sharp',
   color: 'natural',
   cameraPref: 'dynamic_dolly',
   transitionStyle: 'narrative',
   dialogueMode: 'rich',
   faceTier: 'idol',
   bgmMode: 'guided',
   bgmStyle: 'electronic_ambient',
   generateSfx: true
  }
 },
 {
  id: 'wuxia_bridge',
  label: '晨雾古桥江湖对峙',
  badge: '2.39:1 宽银幕 · 武侠实景',
  idea: '破晓薄雾笼罩江南石桥，黑衣剑客停步桥心按住剑柄，听见背后瓦片轻响与衣袂破风声，回头瞬间落叶飘过剑鞘。',
  brief: {
   format: '2.39:1',
   visualPreset: 'wuxia_real',
   texturePreset: 'anamorphic_wide',
   color: 'muted',
   cameraPref: 'dynamic_dolly',
   transitionStyle: 'camera',
   dialogueMode: 'sparse',
   bgmMode: 'guided',
   bgmStyle: 'folk_erhu_guqin',
   generateSfx: true
  }
 },
 {
  id: 'commerce_showcase',
  label: '产品质感商业短片',
  badge: '9:16 · 广告特写实拍',
  idea: '清晨靠窗胡桃木桌面，一只磨砂玻璃手冲咖啡壶在柔和逆光中倾倒出琥珀色液体，升腾热气与木纹肌理特写收束。',
  brief: {
   format: '9:16',
   visualPreset: 'cinema_drama',
   texturePreset: 'commercial',
   color: 'cinematic_amber',
   cameraPref: 'steady_push',
   transitionStyle: 'basic',
   dialogueMode: 'silent',
   bgmMode: 'guided',
   bgmStyle: 'retro_lofi',
   generateSfx: true
  }
 }
];

export const AI_VISUAL_PRESETS = [
 ['auto', 'AI 自由搭配（按剧情智能定调）', '', {}],
 ['real', '现实实拍（生活原片质感）', '真实街头与室内自然可用光，零摆拍生活肌理', { look: 'reality_raw', medium: 'raw_4k', genre: 'real_life', color: 'natural', texture: ['skin', 'natural_fabric'] }],
 ['hk_neon', '港风霓虹抒情（王家卫质感）', '霓虹倒影、潮湿石板路、暗部墨绿与情绪化慢快门拖影', { look: 'hk_cinema', medium: '35mm', genre: 'hk_neon_wong', color: 'hk_emerald', texture: ['grain', 'halation', 'motion_blur_shutter'] }],
 ['hk_retro', '90年代复古港片', '茶餐厅与老骑楼霓虹招牌、温暖钨丝灯与复古胶片密度', { look: 'hk_cinema', medium: '35mm', genre: 'hk_retro_90s', color: 'hk_emerald', texture: ['grain', 'halation', 'wet_reflection'] }],
 ['hk_crime', '香港硬派警匪江湖', '天台冷风、幽暗深巷、凌厉明暗对比与紧迫跟拍', { look: 'handheld_cinema', medium: '35mm', genre: 'hk_crime', color: 'muted', texture: ['grain', 'clean'] }],
 ['cinema_drama', '现代院线剧情片电影感', '讲究空间纵深、有动机实景光影层次与沉稳构图', { look: 'cinema', medium: 'digital', genre: 'urban', color: 'muted', texture: ['soft', 'skin'] }],
 ['short_drama', '竖屏精品微短剧', '面部轮廓清楚、情绪近景冲击力强与明快现代商业打光', { look: 'short_drama', medium: 'digital', genre: 'urban', color: 'natural', texture: ['clean', 'soft'] }],
 ['documentary', '观察式街头纪实片', '手持呼吸感与真实粗糙自然光影，不被打扰的在场感', { look: 'documentary', medium: 'digital', genre: 'real_life', color: 'natural', texture: ['skin', 'natural_fabric'] }],
 ['japanese_film', '日系空气感胶片电影', '清透高调自然光、柔软窗户留白与克制生活诗意', { look: 'leica', medium: '16mm', genre: 'japanese', color: 'fuji_fresh', texture: ['grain', 'soft'] }],
 ['korean_romance', '韩系浪漫都市柔光', '柔和漫射光影、清透温润肤色与细腻都市空间层次', { look: 'cinema', medium: 'digital', genre: 'korean', color: 'warm', texture: ['soft', 'mist_bloom'] }],
 ['chinese_modern', '新中式 / 东方留白美学', '东方建筑青瓦竹木质感、留白构图与温润光影', { look: 'cinema', medium: 'digital', genre: 'chinese_modern', color: 'warm_vintage', texture: ['soft', 'mist_bloom'] }],
 ['period_republic', '民国 / 年代怀旧胶片', '青砖旧巷、棉麻长衫旗袍纹理与克制复古胶片色调', { look: 'cinema', medium: '35mm', genre: 'period_republic', color: 'warm_vintage', texture: ['grain', 'natural_fabric'] }],
 ['american_noir', '美式黑色电影悬疑', '冷暖高反差、阴雨街道与百叶窗条纹硬光压迫感', { look: 'noir', medium: '35mm', genre: 'american_noir', color: 'noir_contrast', texture: ['grain', 'wet_reflection'] }],
 ['wuxia_real', '写实古装武侠实景', '做旧布料、冷冽金属兵器、山林晨雾与硬派质感', { look: 'cinema', medium: '35mm', genre: 'wuxia', color: 'muted', texture: ['grain', 'natural_fabric'] }],
 ['scifi_real', '硬核近未来写实科幻', '去奇幻化工业金属装置、实用冷光源与物理可信度', { look: 'imax', medium: 'raw_4k', genre: 'scifi_real', color: 'tealorange', texture: ['clean', 'wet_reflection'] }],
 ['cyberpunk', '赛博朋克未来雨夜', '潮湿柏油路霓虹反光、高对比双色霓虹看板夜景', { look: 'anamorphic', medium: 'digital', genre: 'cyber', color: 'tealorange', texture: ['halation', 'wet_reflection'] }],
 ['ccd_y2k', '千禧复古 CCD / DV 生活', '2000年代卡片机直闪怀旧溢色与真实生活聚会抓拍', { look: 'ccd', medium: 'ccd_digital', genre: 'real_life', color: 'warm_vintage', texture: ['diffusion', 'halation'] }]
];

export const AI_TEXTURE_PRESETS = [
 ['auto', 'AI 自动搭配影像媒介与质感', {}],
 ['raw_reality', '现实原片 · 零磨皮自然毛孔肌理', { look: 'reality_raw', medium: 'raw_4k', texture: ['skin', 'natural_fabric'] }],
 ['cinema', '院线数字电影 · 柔和高光过渡', { look: 'cinema', medium: 'digital', texture: ['soft'] }],
 ['hk_film', '90年代港片 35mm · 湿润霓虹光晕', { look: 'hk_cinema', medium: '35mm', texture: ['grain', 'halation', 'wet_reflection'] }],
 ['imax_epic', 'IMAX 70mm 大画幅极致解析', { look: 'imax', medium: 'imax_70mm', texture: ['clean', 'soft'] }],
 ['kodak_cinema', '柯达 5219 电影底片 · 饱满密度', { look: 'cinema', medium: 'kodak_film', texture: ['grain', 'soft', 'skin'] }],
 ['fuji_airy', '富士胶片 · 日系清透青绿阴影', { look: 'leica', medium: 'fuji_film', texture: ['grain', 'soft'] }],
 ['film', '35mm 经典胶片 · 细腻颗粒光晕', { medium: '35mm', texture: ['grain', 'halation'] }],
 ['film16', '16mm 独立电影 · 颗粒与空气呼吸感', { look: 'handheld_cinema', medium: '16mm', texture: ['grain', 'vignette_lens'] }],
 ['anamorphic_wide', '变形宽银幕 · 横向眩光与椭圆焦外', { look: 'anamorphic', medium: '35mm', texture: ['anamorphic_flare', 'soft'] }],
 ['black_mist', '黑柔镜 · 光晕弥散空气感', { look: 'cinema', medium: 'digital', texture: ['mist_bloom', 'soft'] }],
 ['short_drama_sharp', '竖屏商业微短剧 · 清透高锐度', { look: 'short_drama', medium: 'digital', texture: ['clean', 'soft'] }],
 ['noir_shadow', '黑色电影 · 硬调高反差暗部', { look: 'noir', medium: '35mm', texture: ['grain', 'clean'] }],
 ['commercial', '商业广告 · 精致可控材质反射', { look: 'commercial', medium: 'digital', texture: ['clean', 'soft'] }],
 ['phone', '手机原相机 · 日常生活直出', { look: 'phone', medium: 'digital', texture: ['clean', 'skin'] }]
];

export const AI_CAMERA_PREFS = [
 ['auto', 'AI 智能调度景别与物理运镜（按情绪起伏搭配）'],
 ['steady_push', '克制稳重：三脚架固定 + 关键时刻缓慢 Dolly 推进'],
 ['dynamic_dolly', '电影推进与跟拍：滑轨平移、环绕揭示与中近景拉近'],
 ['handheld_grit', '近距离纪实手持：微弱呼吸晃动与街头贴身跟拍'],
 ['wong_slow', '王家卫式广角贴身 + 固定框中框凝视']
];

export const AI_TRANSITION_PREFS = [
 ['auto', 'AI 智能调配（同场硬切 0s + 跨场景匹配/声画转场）'],
 ['basic', '克制叙事：硬切 (0s) 与关键跨场叠化 / 结尾淡出'],
 ['audio', '声音先行：J-Cut / L-Cut 与声桥提前切入'],
 ['hk_rhythmic', '港片节奏：动作匹配 + 甩镜 / 闪黑节奏切换'],
 ['camera', '物理运镜无缝转场：甩镜 / 推拉 / 前景遮挡穿越'],
 ['emotional_fade', '抒情氛围过渡：慢节奏叠化 + 渐黑淡入淡出留白'],
 ['narrative', '戏剧冲突：视线匹配 + 正反打 + 反应切镜']
];

export const AI_DIALOGUE_MODES = [
 ['natural', '自然对白（按剧情约半数镜头包含口语台词，生成 T1 轨）'],
 ['rich', '密集对白交锋（台词推动冲突与反转）'],
 ['sparse', '少量关键台词（克制留白，关键句落 T1 轨）'],
 ['inner_monologue', '内心独白 VO + 少量现场对白'],
 ['narration', '全片旁白叙事 VO + 环境画外音'],
 ['silent', '无对白默片（清空 T1 对白，仅保留画面、音效与配乐）']
];

export const AI_CAST_NATIONALITIES = [
 ['', 'AI 按剧情自动设定'],
 ['中国', '中国（东亚真实面孔）'],
 ['中国香港', '中国香港（港风东亚面孔）'],
 ['日本', '日本（东亚面孔）'],
 ['韩国', '韩国（东亚面孔）'],
 ['欧美', '欧美面孔'],
 ['混血', '跨族裔混血面孔']
];

export const AI_CAST_FACE_TIERS = [
 ['', 'AI 自动适配'],
 ['ordinary', '普通人真实长相（接地气 · 生活自然感）'],
 ['ordinary_worker', '市井街头质感（真实生活气息与年龄感）'],
 ['star', '电影主角高颜值（骨相立体上镜）'],
 ['hk_retro_star', '90年代港星电影脸（浓眉英气 / 明艳故事感）'],
 ['idol', '现代短剧精致颜值（五官立体干净）'],
 ['character_actor', '硬朗实力派质感脸（强辨识度与自然纹理）'],
 ['youth_campus', '青春校园少年/少女脸（干净青涩）'],
 ['fashion_model', '清冷高级感文艺面孔（清晰骨相线条）'],
 ['silver_elder', '自然沧桑长辈面孔（岁月真实痕迹）'],
 ['anime2d', '日系/国漫二维动画角色（非真人）'],
 ['cg3d', '3D CG 立体数字角色']
];

export const AI_CAST_SKIN_RENDERS = [
 ['', 'AI 按画风自动匹配'],
 ['natural_pores', '真实肤质 · 保留毛孔细纹 · 禁止塑料磨皮'],
 ['light_makeup', '自然清透生活妆 · 保留肌理'],
 ['sweat_rain_grit', '真实雨水/汗水微湿反光肌（强临场感）'],
 ['aged_weathered', '岁月风霜真实肌理（法令纹/晒斑细节）'],
 ['film_halation_skin', '胶片柔光通透肤质（温润高光过渡）'],
 ['soft_beauty', '影视柔光微匀肤（保留自然眼神光）'],
 ['cel_shaded', '二次元动画平涂光影（非真人皮肤）']
];

export const AI_BGM_MODES = [
 ['auto', 'AI 自动搭配（根据剧情设计 A2 配乐）'],
 ['guided', '按下方预选流派展开细节与人声避让'],
 ['exact', '严格锁定下方选中的曲风流派（不擅自更改）'],
 ['none', '无背景音乐（仅保留 A1 音效、环境音与 T1 对白）']
];

export const DEFAULT_AI_BRIEF = {
 idea: '',
 format: 'match_project',
 resolution: 'match_project',
 fps: 'match_project',
 visualPreset: 'auto',
 texturePreset: 'auto',
 color: '',
 cameraPref: 'auto',
 transitionStyle: 'auto',
 customShotTiming: false,
 shotCountMode: 'exact',
 shotCount: 5,
 timingMode: 'auto',
 fixedDuration: 5,
 duration: 25,
 chainLastFrame: true,
 includeAdjustLayer: true,
 generateSfx: true,
 dialogueMode: 'natural',
 language: '普通话',
 nationality: '',
 faceTier: '',
 skinRender: '',
 castNotes: '',
 reuseCurrentAssets: true,
 bgmMode: 'auto',
 bgmStyle: '',
 bgmMood: '',
 negativePrompts: ['identity', 'face_deform', 'hands', 'flicker', 'watermark'],
 customNegative: '',
 extraNotes: ''
};

export const DEFAULT_AI_SCOPES = {
 specs: true,
 characters: true,
 scenes: true,
 video: true,
 dialogue: true,
 audio: true,
 bgm: true,
 adjust: true,
 negative: true
};

/**
 * Resolve combined visual vocabulary overrides from brief pre-selections.
 */
export function resolveVisualOverrides(brief = {}) {
 const visual = AI_VISUAL_PRESETS.find((x) => x[0] === brief.visualPreset);
 const texture = AI_TEXTURE_PRESETS.find((x) => x[0] === brief.texturePreset);
 const merged = { ...(visual?.[3] || {}), ...(texture?.[2] || {}) };
 if (brief.color && GROUPS.color.options.some((o) => o.id === brief.color)) {
  merged.color = brief.color;
 }
 if (Array.isArray(merged.texture)) {
  merged.texture = [...new Set(merged.texture)];
 }
 if (visual?.[2]) {
  merged.customNote = visual[2];
 }
 return merged;
}

/**
 * Safely normalize user AI brief inputs while preserving valid pre-selections.
 */
export function normalizeAIBrief(raw = {}) {
 const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
 const pickId = (val, rows, fallback) => (rows.some((r) => r[0] === val) ? val : fallback);
 const negSet = new Set(GROUPS.negative.options.map((o) => o.id));
 const shotCount = Math.max(1, Math.min(80, Math.round(Number(src.shotCount) || 5)));
 const fixedDuration = Math.max(0.5, Math.min(60, Math.round((Number(src.fixedDuration) || 5) * 10) / 10));
 const duration = Math.max(Math.round(shotCount * 0.5), Math.min(900, Math.round((Number(src.duration) || 25) * 10) / 10));

 return {
  idea: String(src.idea ?? '').slice(0, 20000),
  format: String(src.format || 'match_project'),
  resolution: String(src.resolution || 'match_project'),
  fps: String(src.fps || 'match_project'),
  visualPreset: pickId(src.visualPreset, AI_VISUAL_PRESETS, 'auto'),
  texturePreset: pickId(src.texturePreset, AI_TEXTURE_PRESETS, 'auto'),
  color: src.color && GROUPS.color.options.some((o) => o.id === src.color) ? src.color : '',
  cameraPref: pickId(src.cameraPref, AI_CAMERA_PREFS, 'auto'),
  transitionStyle: pickId(src.transitionStyle, AI_TRANSITION_PREFS, 'auto'),
  customShotTiming: Boolean(src.customShotTiming),
  shotCountMode: src.shotCountMode === 'max' ? 'max' : 'exact',
  shotCount,
  timingMode: src.timingMode === 'fixed' ? 'fixed' : 'auto',
  fixedDuration,
  duration,
  chainLastFrame: src.chainLastFrame !== false,
  includeAdjustLayer: src.includeAdjustLayer !== false,
  generateSfx: src.generateSfx !== false,
  dialogueMode: pickId(src.dialogueMode, AI_DIALOGUE_MODES, 'natural'),
  language: String(src.language || '普通话').slice(0, 60),
  nationality: String(src.nationality || '').slice(0, 60),
  faceTier: pickId(src.faceTier, AI_CAST_FACE_TIERS, ''),
  skinRender: pickId(src.skinRender, AI_CAST_SKIN_RENDERS, ''),
  castNotes: String(src.castNotes || '').slice(0, 1000),
  reuseCurrentAssets: src.reuseCurrentAssets !== false,
  bgmMode: pickId(src.bgmMode, AI_BGM_MODES, 'auto'),
  bgmStyle: src.bgmStyle && GROUPS.bgm.options.some((o) => o.id === src.bgmStyle) ? src.bgmStyle : '',
  bgmMood: String(src.bgmMood || '').slice(0, 300),
  negativePrompts: Array.isArray(src.negativePrompts)
   ? [...new Set(src.negativePrompts.filter((id) => negSet.has(id)))]
   : [...DEFAULT_AI_BRIEF.negativePrompts],
  customNegative: String(src.customNegative || '').slice(0, 1000),
  extraNotes: String(src.extraNotes || '').slice(0, 4000)
 };
}

/**
 * Summarize currently chosen pre-selection pills for compact UI display.
 */
export function briefPreselectionSummary(brief = {}) {
 const b = normalizeAIBrief(brief);
 const badges = [];
 const vis = AI_VISUAL_PRESETS.find((x) => x[0] === b.visualPreset);
 if (b.visualPreset !== 'auto' && vis) badges.push(vis[1].split('（')[0].trim());
 if (b.color) {
  const c = GROUPS.color.options.find((o) => o.id === b.color);
  if (c) badges.push(c.label.split('（')[0].trim());
 }
 if (b.customShotTiming) {
  const durTxt = b.timingMode === 'fixed'
   ? `每镜${b.fixedDuration}s`
   : `约${b.duration}s`;
  badges.push(`${b.shotCountMode === 'max' ? '≤' : ''}${b.shotCount}镜 · ${durTxt}`);
 } else {
  badges.push('镜数由AI安排');
 }
 const dlg = AI_DIALOGUE_MODES.find((x) => x[0] === b.dialogueMode);
 if (dlg) badges.push(dlg[1].split('（')[0].trim());
 if (b.bgmMode === 'none') badges.push('无配乐');
 else if (b.bgmStyle) {
  const bgm = GROUPS.bgm.options.find((o) => o.id === b.bgmStyle);
  if (bgm) badges.push(`配乐:${bgm.label.split(' ')[0]}`);
 }
 if (b.faceTier) {
  const ft = AI_CAST_FACE_TIERS.find((x) => x[0] === b.faceTier);
  if (ft) badges.push(ft[1].split('（')[0].trim());
 }
 if (b.chainLastFrame) badges.push('尾帧接首帧');
 if (b.generateSfx) badges.push('A1独立音效');
 if (b.includeAdjustLayer) badges.push('E1调节层');
 return badges;
}
