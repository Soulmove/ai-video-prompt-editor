export {
 GROUPS,
 TRANSITION_CATEGORIES,
 FACE_PRESETS,
 PURPOSES,
 ACTIONS,
 SOURCES,
 CHARACTER_FIELDS,
 SCENE_FIELDS
} from './vocab.mjs';

export const VERSION = 2;

export const TRACKS = [
 {key:'adjust',code:'E1',label:'调节层轨',short:'Look / Cam',desc:'跨镜头统一覆写色调、光影或推拉运镜修饰',accent:'rose',defaultDuration:4},
 {key:'video',code:'V1',label:'主视频 / 分镜轨',short:'Video Shots',desc:'按时间排列镜头片段，支持拖动、分割、裁剪与转场胶囊',accent:'cyan',defaultDuration:4},
 {key:'dialogue',code:'T1',label:'对白 / 字幕轨',short:'Dialogue',desc:'独立对齐口型时间窗，支持跨镜 J-Cut / L-Cut 对白覆盖',accent:'amber',defaultDuration:2.5},
 {key:'audio',code:'A1',label:'音效 / 环境轨',short:'SFX & Foley',desc:'脚步声、雨声、关门声等精确秒级触发音效片段',accent:'emerald',defaultDuration:2},
 {key:'bgm',code:'A2',label:'配乐 / BGM轨',short:'BGM Track',desc:'铺底配乐氛围段，可自动声明对白压低避让（Ducking）',accent:'violet',defaultDuration:8}
];

export const TRACK_MAP = Object.fromEntries(TRACKS.map(t=>[t.key,t]));

export const NLE_FORMATS = [
 ['16:9','16:9 横屏电影'],
 ['9:16','9:16 竖屏短剧'],
 ['2.39:1','2.39:1 宽银幕'],
 ['1:1','1:1 方形画幅'],
 ['4:3','4:3 复古胶片'],
 ['3:4','3:4 竖版摄影'],
 ['custom','自定义比例']
];

export const NLE_RESOLUTIONS = [
 ['1080P','1080P 全高清'],
 ['2K','2K 高清'],
 ['4K','4K 超高清'],
 ['720P','720P 标准'],
 ['8K','8K 极清'],
 ['custom','自定义像素']
];

export const NLE_FPS = [24, 25, 30, 48, 50, 60, 12];

export const NLE_OUTPUT_MODES = [
 ['storyboard','按分镜汇总（自动融合各轨叠加内容）'],
 ['timeline','按时间轴逐段编排（精确切出跨轨边界）'],
 ['selected','仅导出当前选中片段'],
 ['concise','精简连贯提示词'],
 ['table','分镜剪辑表 (CSV / 表格)']
];

export const CLIP_PRESETS = [
 {
  id:'blank-establishing',
  category:'基础空白块',
  label:'空白分镜片段 (4s)',
  track:'video',
  duration:4,
  data:{title:'新分镜',prompt:'',framing:'wide',angle:'eye',move:'stationary',speed:'even',stability:'tripod'}
 },
 {
  id:'push-close',
  category:'运镜积木',
  label:'缓慢推近特写 (4s)',
  track:'video',
  duration:4,
  data:{title:'推近情绪特写',prompt:'缓慢推向人物面部，捕捉视线细微变化',framing:'mediumClose',angle:'eye',move:'push',speed:'slow',stability:'dolly',lens:'50'}
 },
 {
  id:'orbit-reveal',
  category:'运镜积木',
  label:'180° 环绕揭示 (5s)',
  track:'video',
  duration:5,
  data:{title:'弧线环绕揭示',prompt:'摄影机平稳绕行主体揭示背后空间线索',framing:'medium',angle:'eye',move:'orbit',speed:'even',stability:'gimbal',lens:'35'}
 },
 {
  id:'handheld-follow',
  category:'写实风格块',
  label:'手持街头跟拍 (4s)',
  track:'video',
  duration:4,
  data:{title:'街头跟拍',prompt:'保持自然呼吸感紧跟人物穿过人群与街巷',framing:'mediumFull',angle:'eye',move:'follow',speed:'even',stability:'handheld',look:'handheld_cinema',medium:'35mm',texture:['skin','natural_fabric']}
 },
 {
  id:'dialogue-line',
  category:'对白 / 音效积木',
  label:'对白字幕片段 (2.5s)',
  track:'dialogue',
  duration:2.5,
  data:{speakerName:'主角',language:'普通话',delivery:'克制低声、略有停顿',text:''}
 },
 {
  id:'sfx-rain',
  category:'对白 / 音效积木',
  label:'环境音 / 动作音效 (3s)',
  track:'audio',
  duration:3,
  data:{kind:'sfx',cue:'清晰脚步声、衣物摩擦声与远处环境微响',intensity:'自然贴合画面'}
 },
 {
  id:'bgm-piano',
  category:'配乐与调节层',
  label:'情绪配乐段 (8s · 带人声避让)',
  track:'bgm',
  duration:8,
  data:{style:'warm_piano',mood:'前期克制留白，后半段略微推高',duckUnderDialogue:true,fadeIn:0.5,fadeOut:0.8,customNote:''}
 },
 {
  id:'adj-hk-neon',
  category:'配乐与调节层',
  label:'调节层 · 港风霓虹胶片',
  track:'adjust',
  duration:5,
  data:{label:'调节：90s港风霓虹光晕',lookOverride:'hk_cinema',colorOverride:'hk_emerald',lightOverride:'neon',cameraModifier:'慢快门轻微霓虹拖影与高光晕染',slowMo:'',negativeOverride:''}
 },
 {
  id:'adj-noir',
  category:'配乐与调节层',
  label:'调节层 · 悬疑冷调压暗',
  track:'adjust',
  duration:4,
  data:{label:'调节：悬疑冷蓝高反差',lookOverride:'noir',colorOverride:'noir_contrast',lightOverride:'back',cameraModifier:'压暗背景无关光源，突出轮廓侧逆光',slowMo:'',negativeOverride:'flicker'}
 }
];

export const LANGUAGE_OPTIONS = ['普通话','粤语','英语','日语','韩语','无对白 / 默片'];

export const NLE_DEMO_SEED = {
 title:'雨夜巷口 · 多轨示例工程',
 format:'16:9',
 resolution:'4K',
 fps:24,
 notes:'演示如何通过 V1 分镜轨、T1 跨镜 J-Cut 对白轨、A1 音效轨、A2 配乐轨与 E1 调节层协同编排提示词；可随时清空或改写。',
 characters:[
  {id:'char-lin',name:'林夏',role:'主角',appearance:'青年女性，齐肩深黑发，米灰长风衣，自然肤色保留毛孔纹理',outfit:'米灰防雨风衣，深色长裤，肩挎黑色旧帆布包',voice:'微哑克制的女声，语速偏慢',lockIdentity:true}
 ],
 scenes:[
  {id:'scene-alley',name:'雨夜旧巷口',location:'老街骑楼下狭窄潮湿石板巷，远处便利店暖黄招牌倒映积水',weather:'rain',time:'night',lightSource:'neon',lightDirection:'back',lightQuality:'mixed'}
 ],
 tracks:{
  video:[
   {id:'v-1',start:0,duration:4,title:'01 巷口撑伞停步',prompt:'林夏独自停在积水巷口边缘，微垂右手拎着透明雨伞，目光警惕地扫向深巷暗处',startState:'站在亮灯屋檐下，右手指紧握伞柄',endState:'伞檐微抬，露出侧脸轮廓与雨水反光',framing:'wide',angle:'eye',move:'push',speed:'slow',stability:'dolly',lens:'35',style:'hk_cinema',medium:'35mm',color:'hk_emerald',texture:['wet_reflection','grain','skin'],lightSource:'neon',lightDirection:'back',lightQuality:'mixed',sceneId:'scene-alley',characterIds:['char-lin'],transitionIn:'fade_in',transitionDur:0.5},
   {id:'v-2',start:4,duration:4.5,title:'02 回头听见脚步',prompt:'听到身后积水踩踏声，林夏肩头微顿并缓慢向右后方回头半步，眼神锁定画外走廊阴影',startState:'身体朝向深巷，右手指依然扣住伞柄',endState:'半侧身定格回头，右手从口袋抽出一张折叠字条',framing:'mediumClose',angle:'shoulder',move:'fixed',speed:'even',stability:'tripod',lens:'50',style:'hk_cinema',medium:'35mm',color:'hk_emerald',texture:['wet_reflection','grain','skin'],lightSource:'neon',lightDirection:'side',lightQuality:'soft',sceneId:'scene-alley',characterIds:['char-lin'],transitionIn:'j_cut',transitionDur:0.5},
   {id:'v-3',start:8.5,duration:3.5,title:'03 字条特写定格',prompt:'折叠潮湿字条在暖暗逆光下展露一半折痕，雨滴顺着伞沿坠落在鞋尖旁水洼',startState:'右手捏住折叠字条一角',endState:'字条停在画面中心前景，背景虚化成模糊霓虹光斑',framing:'detail',angle:'eye',move:'stationary',speed:'slow',stability:'tripod',lens:'85',style:'hk_cinema',medium:'35mm',color:'hk_emerald',texture:['halation','wet_reflection'],lightSource:'lamp',lightDirection:'back',lightQuality:'soft',sceneId:'scene-alley',characterIds:['char-lin'],transitionIn:'match_action',transitionDur:0.2}
  ],
  dialogue:[
   {id:'t-1',start:3.5,duration:3.5,speakerId:'char-lin',speakerName:'林夏',language:'普通话',delivery:'压低气声、半信半疑，切镜前声音先行（J-Cut）',text:'“这么晚了……是谁还在这里等？”'}
  ],
  audio:[
   {id:'a-1',start:0,duration:6,kind:'ambience',cue:'持续细密夜雨敲打伞面与檐角排水管水声',intensity:'稳态环境铺底'},
   {id:'a-2',start:3.5,duration:2,kind:'sfx',cue:'画外由远及近的两声清脆皮鞋踩过水洼声',intensity:'先声夺人引导回头'}
  ],
  bgm:[
   {id:'b-1',start:1,duration:11,style:'suspense_strings',mood:'极简低频大提琴脉动渐入，台词时自动让出频段',duckUnderDialogue:true,fadeIn:0.8,fadeOut:1.0,customNote:'高潮停在最后雨滴落下的一瞬'}
  ],
  adjust:[
   {id:'e-1',start:4,duration:8,label:'中后段：增强胶片光晕与慢快门微拖影',lookOverride:'hk_cinema',colorOverride:'hk_emerald',lightOverride:'neon',cameraModifier:'强化高光霓虹微晕，暗部保留冷青细节，禁止画面闪烁',slowMo:'',negativeOverride:'flicker,warp'}
  ]
 },
 negativePrompts:['identity','wardrobe','flicker','watermark','no_cut']
};
