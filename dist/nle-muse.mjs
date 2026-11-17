export const MUSE_CHANNELS = [
 {
  id: 'protocol',
  label: 'Muse 新接口直连（18611 · 免开浏览器，推荐）',
  baseUrl: 'http://127.0.0.1:18611/v1',
  defaultModel: 'muse-video-协议',
  port: 18611,
  healthPath: '/health'
 },
 {
  id: 'pool',
  label: 'Muse 老接口 · 螺旋池（18610 · 浏览器账号池）',
  baseUrl: 'http://127.0.0.1:18610/v1',
  defaultModel: 'muse-video',
  port: 18610,
  healthPath: '/healthz',
  adminUrl: 'http://127.0.0.1:18610/admin'
 },
 {
  id: 'custom',
  label: '自定义 / 云端兼容接口（预留第三方 API 或远程网关）',
  baseUrl: '',
  defaultModel: 'muse-video',
  port: 0
 }
];

export const MUSE_VIDEO_MODELS = [
 ['muse-video', 'muse-video · Muse 文/图生视频（老接口螺旋池）'],
 ['muse-video-协议', 'muse-video-协议 · Muse 直连协议（新接口）'],
 ['doubao-video', 'doubao-video · 豆包视频（固定 10 秒 720p 无参考图）']
];

export const MUSE_RATIOS = [
 ['16:9', '16:9 横屏电影'],
 ['9:16', '9:16 竖屏短剧'],
 ['1:1', '1:1 方形画幅'],
 ['4:3', '4:3 复古横版'],
 ['3:4', '3:4 经典竖版'],
 ['21:9', '21:9 超宽银幕']
];

export const MUSE_RESOLUTIONS = [
 ['720p', '720P 标准高清（推荐）'],
 ['1080p', '1080P 全高清'],
 ['480p', '480P 快速预览']
];

export const MUSE_MODES = [
 ['text', '文生视频（纯提示词驱动）'],
 ['frames', '首尾帧生视频（first_frame / last_frame）'],
 ['reference', '参考图生视频（image[] 多图参考）']
];

export class MuseServiceError extends Error {
 constructor(status, code, message) {
  super(message);
  this.status = status;
  this.code = code;
 }
}

/**
 * Strip trailing slashes and normalize base URL for `/v1/*` Muse endpoints.
 */
export function normalizeMuseBaseUrl(raw = '') {
 const clean = String(raw || '').trim().replace(/\/+$/, '');
 if (!clean) return '';
 try {
  const u = new URL(clean);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  return u.toString().replace(/\/+$/, '');
 } catch {
  return '';
 }
}

/**
 * Append `/v1` suffix if caller omitted version segment.
 */
export function resolveV1Base(baseUrl = '') {
 const norm = normalizeMuseBaseUrl(baseUrl);
 if (!norm) return '';
 return /\/v\d+$/i.test(norm) ? norm : `${norm}/v1`;
}

export function isLoopbackUrl(rawUrl = '') {
 const clean = normalizeMuseBaseUrl(rawUrl);
 if (!clean) return false;
 try {
  const h = new URL(clean).hostname.toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
 } catch {
  return false;
 }
}

/**
 * Sanitize and normalize user-saved Muse connection settings (never persists secret apiKey into exports).
 */
export function normalizeMuseConfig(raw = {}) {
 const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
 const channelMeta = MUSE_CHANNELS.find((c) => c.id === src.channel) || MUSE_CHANNELS[1];
 const baseUrl = channelMeta.id === 'custom'
  ? normalizeMuseBaseUrl(src.baseUrl || '')
  : normalizeMuseBaseUrl(src.baseUrl || channelMeta.baseUrl);
 const model = String(src.model || channelMeta.defaultModel || 'muse-video').trim().slice(0, 120) || 'muse-video';
 return {
  channel: channelMeta.id,
  baseUrl,
  model,
  accountLabel: String(src.accountLabel || '').trim().slice(0, 120),
  useLocalKey: src.useLocalKey !== false,
  transport: src.transport === 'direct' ? 'direct' : 'auto'
 };
}

/**
 * Compute pixel WxH rounded to multiples of 16 matching MuseCanvas conventions.
 */
export function computeVideoSize(ratio = '16:9', resolution = '720p') {
 const shortNum = resolution === '480p' ? 480 : resolution === '1080p' ? 1080 : 720;
 const m = String(ratio || '16:9').match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
 const rw = m ? Math.max(1, Number(m[1])) : 16;
 const rh = m ? Math.max(1, Number(m[2])) : 9;
 const round16 = (v) => Math.max(256, Math.round(v / 16) * 16);
 if (rw >= rh) {
  return `${round16((shortNum * rw) / rh)}x${round16(shortNum)}`;
 }
 return `${round16(shortNum)}x${round16((shortNum * rh) / rw)}`;
}

/**
 * Enforce Muse / Doubao duration bounds matching MusePool and MuseProtocol limits.
 */
export function clampMuseSeconds(seconds, model = 'muse-video') {
 const low = String(model || '').toLowerCase();
 if (low.includes('doubao')) return 10;
 const n = Math.floor(Number(seconds) || 6);
 if (low.includes('muse')) return Math.max(3, Math.min(10, n));
 return Math.max(3, Math.min(30, n));
}

export function isMuseEngineModel(model = '') {
 return /^(muse|doubao)(?:[-_]|$)/i.test(String(model || '').trim());
}

/**
 * Validate playable video URL (rejects dangerous protocols like javascript:).
 */
export function isPlayableVideoUrl(value = '') {
 if (typeof value !== 'string') return false;
 const trimmed = value.trim();
 if (!trimmed || trimmed.length > 8192) return false;
 if (trimmed.startsWith('/api/muse/')) return true;
 if (trimmed.startsWith('blob:')) return true;
 try {
  const u = new URL(trimmed);
  return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password;
 } catch {
  return false;
 }
}

/**
 * Decode an image data URL or fetch URL into a Blob cleanly across Browser & Node 20+.
 */
export async function imageSrcToBlob(src) {
 const raw = String(src || '').trim();
 if (!raw) return null;
 if (raw.startsWith('data:')) {
  const match = raw.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
  if (!match) return null;
  const mime = match[1] || 'image/png';
  const b64 = match[2] || '';
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return new Blob([bytes], { type: mime });
 }
 const res = await globalThis.fetch(raw);
 if (!res.ok) throw new MuseServiceError(res.status, 'IMG_LOAD_FAILED', '无法读取参考图文件。');
 return await res.blob();
}

/**
 * Build multipart FormData matching MusePool / MuseProtocol `/v1/videos` contract.
 */
export async function buildMuseVideoFormData({
 model = 'muse-video',
 prompt = '',
 seconds = 8,
 ratio = '16:9',
 resolution = '720p',
 generateAudio = true,
 watermark = false,
 mode = 'text',
 firstFrame = '',
 lastFrame = '',
 refImages = []
} = {}) {
 const cleanPrompt = String(prompt || '').trim();
 if (!cleanPrompt) {
  throw new MuseServiceError(400, 'PROMPT_EMPTY', '请先填写视频生成提示词，或从草稿导入提示词。');
 }
 const sec = clampMuseSeconds(seconds, model);
 const size = computeVideoSize(ratio, resolution);
 const images = mode === 'frames'
  ? [firstFrame, lastFrame].filter(Boolean)
  : mode === 'reference'
   ? (Array.isArray(refImages) ? refImages.filter(Boolean) : [])
   : [];

 const effectiveMode = mode === 'frames' && images.length > 2 ? 'reference' : (mode === 'frames' ? 'frames' : 'reference');
 const form = new FormData();
 form.append('model', String(model || 'muse-video').trim());
 form.append('prompt', cleanPrompt);
 form.append('seconds', String(sec));
 form.append('size', size);
 if (ratio && ratio !== 'auto') form.append('ratio', ratio);
 form.append('resolution_name', resolution === '1080p' ? '1080p' : resolution === '480p' ? '480p' : '720p');
 form.append('generate_audio', String(generateAudio !== false));
 form.append('watermark', String(Boolean(watermark)));
 form.append('mode', effectiveMode);

 if (effectiveMode === 'frames' && images.length) {
  const b0 = await imageSrcToBlob(images[0]);
  if (b0) {
   form.append('first_frame', b0, 'first.png');
   form.append('images', b0, 'first.png');
  }
  if (images[1]) {
   const b1 = await imageSrcToBlob(images[1]);
   if (b1) {
    form.append('last_frame', b1, 'last.png');
    form.append('images', b1, 'last.png');
   }
  }
 } else if (images.length) {
  for (let i = 0; i < images.length; i++) {
   const b = await imageSrcToBlob(images[i]);
   if (b) {
    form.append('image[]', b, `ref_${i + 1}.png`);
    form.append('images', b, `ref_${i + 1}.png`);
   }
  }
 }
 return { form, seconds: sec, size, imageCount: images.length };
}

/**
 * Unwrap optional MuseCanvas `{ code, data, msg }` envelope cleanly.
 */
export function unwrapMuseEnvelope(raw, fallbackMsg = 'Muse 返回内容异常。') {
 if (!raw || typeof raw !== 'object') throw new MuseServiceError(502, 'INVALID_RESPONSE', fallbackMsg);
 if ('code' in raw && raw.code !== undefined && raw.code !== 0 && raw.code !== '0') {
  throw new MuseServiceError(502, 'MUSE_API_ERROR', String(raw.msg || raw.message || fallbackMsg));
 }
 return 'code' in raw && raw.data !== undefined ? raw.data : raw;
}

/**
 * Parse task status / result URL from `/v1/videos/{id}` payload.
 */
export function parseMuseTaskState(raw, { endpoint = '', useProxy = false } = {}) {
 const data = unwrapMuseEnvelope(raw, '未能读取 Muse 视频任务状态。');
 const id = String(data.id || data.task_id || '');
 const status = String(data.status || 'pending').toLowerCase();
 const notice = String(data.notice || data.progress_message || '');
 const errMsg = typeof data.error === 'string' ? data.error : String(data.error?.message || data.message || '');
 const rawVideoUrl = [
  data.video_url,
  data.result_url,
  data.url,
  data.content?.video_url,
  data.content?.url
 ].find((u) => typeof u === 'string' && u.trim()) || '';

 let playableUrl = rawVideoUrl;
 if (rawVideoUrl && rawVideoUrl.startsWith('/') && !rawVideoUrl.startsWith('/api/muse/')) {
  if (useProxy && endpoint) {
   playableUrl = `/api/muse/media?endpoint=${encodeURIComponent(endpoint)}&path=${encodeURIComponent(rawVideoUrl)}`;
  } else if (endpoint) {
   const root = normalizeMuseBaseUrl(endpoint).replace(/\/(v1|v1beta)$/i, '');
   playableUrl = `${root}${rawVideoUrl}`;
  }
 }
 if (status === 'completed' && !playableUrl && id && useProxy && endpoint) {
  playableUrl = `/api/muse/videos/${encodeURIComponent(id)}/content?endpoint=${encodeURIComponent(endpoint)}`;
 }
 return {
  id,
  status,
  notice,
  error: errMsg,
  cancelKey: typeof data.cancel_key === 'string' ? data.cancel_key : '',
  playableUrl: isPlayableVideoUrl(playableUrl) ? playableUrl : ''
 };
}

function shouldUseLocalProxy(config, runtime = {}) {
 if (config.transport === 'direct') return false;
 if (runtime.staticHost) return false;
 return typeof globalThis.location !== 'undefined' &&
  (globalThis.location.hostname === '127.0.0.1' || globalThis.location.hostname === 'localhost');
}

function museProxyHeaders(config, apiKey = '', extra = {}) {
 const hdr = {
  'x-muse-channel': config.channel || 'protocol',
  'x-muse-base-url': config.baseUrl || '',
  'x-muse-use-local-key': config.useLocalKey ? '1' : '0',
  ...extra
 };
 if (apiKey && apiKey.trim()) hdr['x-muse-api-key'] = apiKey.trim();
 return hdr;
}

/**
 * Probe Muse service health, model list, and local logged-in account count without triggering any generation.
 */
export async function probeMuseService(rawConfig, apiKey = '', { fetcher = globalThis.fetch, signal, staticHost = false } = {}) {
 const cfg = normalizeMuseConfig(rawConfig);
 const useProxy = shouldUseLocalProxy(cfg, { staticHost });

 if (useProxy) {
  let res;
  try {
   res = await fetcher('./api/muse/probe', {
    method: 'POST',
    headers: {
     'Content-Type': 'application/json',
     ...museProxyHeaders(cfg, apiKey)
    },
    body: JSON.stringify({ channel: cfg.channel, baseUrl: cfg.baseUrl, useLocalKey: cfg.useLocalKey }),
    signal: signal || AbortSignal.timeout(8000)
   });
  } catch {
   throw new MuseServiceError(502, 'LOCAL_SERVER_OFFLINE', '无法连接镜序本地后端，请确认通过 node server.mjs 打开工作台。');
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
   throw new MuseServiceError(res.status || 404, 'NO_LOCAL_BACKEND', '当前为纯静态托管页面（无本地后端代理），请连接支持 CORS 的兼容网关或本地运行镜序 2.0。');
  }
  const data = await res.json();
  if (!res.ok) throw new MuseServiceError(res.status, data.code || 'PROBE_FAILED', data.message || '探测本机 Muse 服务失败。');
  return { ...data, viaProxy: true };
 }

 // Direct browser mode (for HTTPS remote compatible endpoint when not on local Node server)
 const v1 = resolveV1Base(cfg.baseUrl);
 if (!v1) {
  throw new MuseServiceError(400, 'ENDPOINT_REQUIRED', '当前为纯静态页面，请先填写支持浏览器直连的 Base URL + API Key，或在本地运行镜序 2.0 连接本机 Muse (18610/18611)。');
 }
 if (isLoopbackUrl(v1) && typeof globalThis.location !== 'undefined' && !['127.0.0.1', 'localhost'].includes(globalThis.location.hostname)) {
  throw new MuseServiceError(400, 'LOOPBACK_FROM_HTTPS', '你当前打开的是 GitHub Pages HTTPS 网页，受浏览器安全与 CORS 限制，无法直接访问本机 127.0.0.1:18610/18611；请在本地双击「启动镜序2.0与Muse.bat」通过 http://127.0.0.1:4174 使用本机 Muse。');
 }

 const headers = {};
 if (apiKey && apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
 let res;
 try {
  res = await fetcher(`${v1}/models`, { headers, signal: signal || AbortSignal.timeout(8000) });
 } catch {
  throw new MuseServiceError(502, 'MUSE_NETWORK_ERR', `无法访问 ${v1}/models，请确认接口地址正确且已允许跨域请求 (CORS)。`);
 }
 if (!res.ok) {
  throw new MuseServiceError(res.status, 'MUSE_AUTH_OR_HTTP', `接口返回 HTTP ${res.status}，请核对地址与 API Key。`);
 }
 const payload = await res.json().catch(() => ({}));
 const models = Array.isArray(payload?.data) ? payload.data.map((m) => m.id).filter(Boolean) : [];
 return {
  reachable: true,
  viaProxy: false,
  baseUrl: cfg.baseUrl,
  models,
  hasLocalInstall: false,
  accountCount: null,
  accountsKnown: false,
  note: '远程接口已响应 /v1/models（真实生成是否可用请以账号有效性与实际提交为准）。'
 };
}

/**
 * Submit a Muse `/v1/videos` creation task.
 */
export async function submitMuseVideoTask(rawConfig, apiKey = '', params = {}, { fetcher = globalThis.fetch, signal, staticHost = false } = {}) {
 const cfg = normalizeMuseConfig(rawConfig);
 const useProxy = shouldUseLocalProxy(cfg, { staticHost });
 const { form, seconds, size } = await buildMuseVideoFormData({ model: cfg.model, ...params });
 const cancelKey = (globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random().toString(16).slice(2)}`).replace(/-/g, '').padEnd(32, '0');
 const extraHeaders = isMuseEngineModel(cfg.model) ? { 'X-Task-Cancel-Key': cancelKey } : {};

 let res;
 if (useProxy) {
  res = await fetcher('./api/muse/videos', {
   method: 'POST',
   headers: museProxyHeaders(cfg, apiKey, extraHeaders),
   body: form,
   signal: signal || AbortSignal.timeout(60000)
  });
 } else {
  const v1 = resolveV1Base(cfg.baseUrl);
  if (!v1) throw new MuseServiceError(400, 'ENDPOINT_REQUIRED', '请先填写有效的视频生成服务接口地址。');
  const hdrs = { ...extraHeaders };
  if (apiKey && apiKey.trim()) hdrs.Authorization = `Bearer ${apiKey.trim()}`;
  res = await fetcher(`${v1}/videos`, {
   method: 'POST',
   headers: hdrs,
   body: form,
   signal: signal || AbortSignal.timeout(60000)
  });
 }

 const data = await res.json().catch(() => null);
 if (!res.ok) {
  throw new MuseServiceError(res.status, data?.code || 'SUBMIT_FAILED', data?.message || data?.error?.message || data?.msg || `提交视频任务失败（HTTP ${res.status}）`);
 }
 const unwrapped = unwrapMuseEnvelope(data, '未返回有效的视频任务编号。');
 if (!unwrapped?.id) {
  throw new MuseServiceError(502, 'NO_TASK_ID', '服务端未返回任务 id，请确认账号已登录且服务运行正常。');
 }
 return {
  id: String(unwrapped.id),
  cancelKey: unwrapped.cancel_key || cancelKey,
  model: cfg.model,
  endpoint: cfg.baseUrl,
  seconds,
  size,
  useProxy
 };
}

/**
 * Poll a running Muse video task for status & playable URL.
 */
export async function pollMuseVideoTask(rawConfig, apiKey = '', taskId, { fetcher = globalThis.fetch, signal, staticHost = false, useProxy } = {}) {
 const cfg = normalizeMuseConfig(rawConfig);
 const proxy = useProxy ?? shouldUseLocalProxy(cfg, { staticHost });

 let res;
 if (proxy) {
  res = await fetcher(`./api/muse/videos/${encodeURIComponent(taskId)}?endpoint=${encodeURIComponent(cfg.baseUrl)}`, {
   method: 'GET',
   headers: museProxyHeaders(cfg, apiKey),
   signal: signal || AbortSignal.timeout(20000)
  });
 } else {
  const v1 = resolveV1Base(cfg.baseUrl);
  const hdrs = apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {};
  res = await fetcher(`${v1}/videos/${encodeURIComponent(taskId)}`, {
   method: 'GET',
   headers: hdrs,
   signal: signal || AbortSignal.timeout(20000)
  });
 }
 const data = await res.json().catch(() => null);
 if (!res.ok) {
  throw new MuseServiceError(res.status, data?.code || 'POLL_FAILED', data?.message || data?.error?.message || `查询任务进度失败（HTTP ${res.status}）`);
 }
 return parseMuseTaskState(data, { endpoint: cfg.baseUrl, useProxy: proxy });
}

/**
 * Attempt to cancel a running Muse task cleanly.
 */
export async function cancelMuseVideoTask(rawConfig, apiKey = '', { cancelKey = '', taskId = '' } = {}, { fetcher = globalThis.fetch, staticHost = false } = {}) {
 const cfg = normalizeMuseConfig(rawConfig);
 const useProxy = shouldUseLocalProxy(cfg, { staticHost });
 try {
  if (useProxy) {
   await fetcher('./api/muse/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...museProxyHeaders(cfg, apiKey) },
    body: JSON.stringify({ cancel_key: cancelKey, task_id: taskId }),
    signal: AbortSignal.timeout(6000)
   });
   return true;
  }
  const v1 = resolveV1Base(cfg.baseUrl);
  if (!v1) return false;
  const hdrs = { 'Content-Type': 'application/json' };
  if (apiKey?.trim()) hdrs.Authorization = `Bearer ${apiKey.trim()}`;
  await fetcher(`${v1}/tasks/cancel`, {
   method: 'POST',
   headers: hdrs,
   body: JSON.stringify({ cancel_key: cancelKey, task_id: taskId }),
   signal: AbortSignal.timeout(6000)
  });
  return true;
 } catch {
  return false;
 }
}

/**
 * Recover video output from an existing Muse task without regenerating quota.
 */
export async function recoverMuseVideoTask(rawConfig, apiKey = '', taskId, { fetcher = globalThis.fetch, staticHost = false } = {}) {
 const cfg = normalizeMuseConfig(rawConfig);
 const useProxy = shouldUseLocalProxy(cfg, { staticHost });
 const url = useProxy
  ? `./api/muse/recover/${encodeURIComponent(taskId)}?endpoint=${encodeURIComponent(cfg.baseUrl)}`
  : `${resolveV1Base(cfg.baseUrl)}/videos/${encodeURIComponent(taskId)}/recover`;
 const headers = useProxy
  ? { 'Content-Type': 'application/json', ...museProxyHeaders(cfg, apiKey) }
  : { 'Content-Type': 'application/json', ...(apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}) };
 const res = await fetcher(url, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(30000) });
 return res.ok;
}

async function callLocalMuseAdminJson(rawConfig, apiKey, path, { method = 'GET', body = undefined, timeoutMs = 15000, fetcher = globalThis.fetch, staticHost = false } = {}) {
 const cfg = normalizeMuseConfig(rawConfig);
 if (staticHost || !shouldUseLocalProxy(cfg, { staticHost })) {
  throw new MuseServiceError(400, 'LOCAL_BACKEND_REQUIRED', '内置 Muse 账号添加与管理仅可在本地工作台使用（请运行「启动镜序2.0与Muse.bat」打开 http://127.0.0.1:4174/）。');
 }
 const headers = museProxyHeaders(cfg, apiKey);
 if (body !== undefined) headers['Content-Type'] = 'application/json';
 let res;
 try {
  res = await fetcher(path, {
   method,
   headers,
   body: body !== undefined ? JSON.stringify(body) : undefined,
   signal: AbortSignal.timeout(timeoutMs)
  });
 } catch (err) {
  throw new MuseServiceError(502, 'LOCAL_SERVER_OFFLINE', `无法连接镜序本地账号桥接服务（${err?.message || '网络异常'}）。`);
 }
 const ct = res.headers.get('content-type') || '';
 if (!ct.includes('application/json')) {
  throw new MuseServiceError(res.status || 404, 'NO_LOCAL_BACKEND', '未检测到本地 Muse 代理接口，请通过 node server.mjs 打开工作台。');
 }
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
  throw new MuseServiceError(res.status, data?.code || 'MUSE_ADMIN_ERR', data?.message || data?.error || data?.detail || `操作失败（HTTP ${res.status}）`);
 }
 return data;
}

/**
 * List local Muse pool accounts with per-interface status and scrubbed credentials.
 */
export async function fetchMuseAccounts(rawConfig, apiKey = '', opts = {}) {
 return await callLocalMuseAdminJson(rawConfig, apiKey, './api/muse/accounts', { method: 'GET', timeoutMs: 10000, ...opts });
}

/**
 * Trigger isolated Chrome login window in local MusePool for zero-copy sign-in.
 */
export async function startMuseLoginWindow(rawConfig, apiKey = '', { label = '', accountId = '' } = {}, opts = {}) {
 const body = accountId ? { account_id: String(accountId).trim() } : { label: String(label || '').trim() };
 return await callLocalMuseAdminJson(rawConfig, apiKey, './api/muse/accounts/login-window', { method: 'POST', body, timeoutMs: 65000, ...opts });
}

/**
 * Poll open MusePool browser login session until cookies are captured or failed.
 */
export async function pollMuseLoginWindow(rawConfig, apiKey = '', sessionId, opts = {}) {
 return await callLocalMuseAdminJson(rawConfig, apiKey, `./api/muse/accounts/login-window/${encodeURIComponent(sessionId)}`, { method: 'GET', timeoutMs: 12000, ...opts });
}

/**
 * Import single or batch muse.ai Cookie header strings into local MusePool.
 */
export async function importMuseAccountCookies(rawConfig, apiKey = '', { label = '', cookieHeader = '', batch = '' } = {}, opts = {}) {
 const raw = String(cookieHeader || batch || '').trim();
 if (!raw) {
  throw new MuseServiceError(400, 'COOKIE_EMPTY', '请先粘贴 muse.ai 的 Cookie 字符串（至少包含 hatch_sess 与 hatch_vml）。');
 }
 return await callLocalMuseAdminJson(rawConfig, apiKey, './api/muse/accounts/import', {
  method: 'POST',
  body: { label: String(label || '').trim(), cookie_header: raw },
  timeoutMs: 25000,
  ...opts
 });
}

/**
 * Execute single-account maintenance actions (`test`, `keepalive`, `quota`, `sync-protocol`, `update`, `delete`).
 */
export async function runMuseAccountAction(rawConfig, apiKey = '', accountId, action, body = undefined, opts = {}) {
 const id = encodeURIComponent(String(accountId || '').trim());
 if (!id) throw new MuseServiceError(400, 'INVALID_ACCOUNT_ID', '无效的 Muse 账号 ID。');
 if (action === 'update') {
  return await callLocalMuseAdminJson(rawConfig, apiKey, `./api/muse/accounts/${id}`, { method: 'PATCH', body: body || {}, timeoutMs: 15000, ...opts });
 }
 if (action === 'delete') {
  return await callLocalMuseAdminJson(rawConfig, apiKey, `./api/muse/accounts/${id}`, { method: 'DELETE', timeoutMs: 15000, ...opts });
 }
 const allowed = new Set(['test', 'keepalive', 'quota', 'sync-protocol', 'cookies']);
 if (!allowed.has(action)) throw new MuseServiceError(400, 'INVALID_ACTION', '不支持的账号操作。');
 return await callLocalMuseAdminJson(rawConfig, apiKey, `./api/muse/accounts/${id}/${action}`, {
  method: 'POST',
  body,
  timeoutMs: 45000,
  ...opts
 });
}

/**
 * Check MuseProtocol (`18611`) network connectivity to `muse.ai` and `hatch.metaaivm.com`.
 */
export async function checkMuseProtocolNetwork(rawConfig, apiKey = '', force = false, opts = {}) {
 return await callLocalMuseAdminJson(rawConfig, apiKey, `./api/muse/netcheck${force ? '?force=1' : ''}`, {
  method: 'GET',
  timeoutMs: force ? 35000 : 12000,
  ...opts
 });
}

/**
 * Format `hatch_vml` cookie expiration timestamp into Chinese status label and tone level.
 */
export function formatMuseExpiry(expiresAt, expiresEstimated = false, nowSec = Math.floor(Date.now() / 1000)) {
 const ts = Number(expiresAt);
 if (!Number.isFinite(ts) || ts <= 0) return { text: '未记录', level: 'idle', title: '尚未采集到到期时间' };
 const left = ts - nowSec;
 const suffix = expiresEstimated ? '（按约 2 天推算）' : '（实测到期）';
 if (left <= 0) return { text: '已过期，需重新登录', level: 'err', title: `会话已过期${suffix}` };
 const days = left / 86400;
 const label = days >= 1
  ? `剩 ${days >= 10 ? Math.round(days) : days.toFixed(1)} 天`
  : `剩 ${Math.max(1, Math.floor(left / 3600))} 小时`;
 const level = days < 1 ? 'err' : days < 3 ? 'warn' : 'ok';
 return { text: label, level, title: `muse.ai hatch_vml 剩余有效期${suffix}` };
}
