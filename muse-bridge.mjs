import fs from 'node:fs/promises';
import path from 'node:path';

function jsonRes(status, data) {
 return new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
 });
}

function scrubSecret(text = '', secret = '', maxLen = 0) {
 let out = String(text || '');
 if (secret) out = out.split(secret).join('[已隐藏]');
 out = out.replace(/Bearer\s+[A-Za-z0-9_.+/=:-]+/gi, 'Bearer [已隐藏]');
 return maxLen > 0 ? out.slice(0, maxLen) : out;
}

function isLoopbackUrl(rawUrl = '') {
 try {
  const u = new URL(rawUrl);
  const h = u.hostname.toLowerCase();
  return (u.protocol === 'http:' || u.protocol === 'https:') && (h === '127.0.0.1' || h === 'localhost' || h === '[::1]');
 } catch {
  return false;
 }
}

function resolveV1Base(baseUrl = '') {
 const clean = String(baseUrl || '').trim().replace(/\/+$/, '');
 if (!clean) return '';
 try {
  const u = new URL(clean);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
 } catch {
  return '';
 }
 return /\/v\d+$/i.test(clean) ? clean : `${clean}/v1`;
}

/**
 * Safely locate MuseCanvas local install.json without ever sending raw poolKey to the browser.
 */
export async function readLocalMuseInstallInfo({ dataDirOverride = '' } = {}) {
 const candidates = [];
 if (dataDirOverride) candidates.push(dataDirOverride);
 if (process.env.MUSECANVAS_DATA_DIR) candidates.push(process.env.MUSECANVAS_DATA_DIR);
 for (const instFile of ['E:\\MuseCanvas\\instance.json', 'D:\\MuseCanvas\\instance.json', 'C:\\MuseCanvas\\instance.json']) {
  try {
   const inst = JSON.parse(await fs.readFile(instFile, 'utf8'));
   if (inst?.dataDirectory) candidates.push(String(inst.dataDirectory));
  } catch {}
 }
 candidates.push('E:\\MuseCanvasData', 'D:\\MuseCanvasData');

 for (const dir of [...new Set(candidates)]) {
  const cfgPath = path.join(dir, 'install.json');
  try {
   const cfg = JSON.parse(await fs.readFile(cfgPath, 'utf8'));
   if (cfg && typeof cfg === 'object') {
    return {
     found: true,
     version: String(cfg.version || ''),
     dataDir: String(cfg.dataDir || dir),
     ports: cfg.ports || { web: 3000, pool: 18610, protocol: 18611 },
     poolKey: typeof cfg.poolKey === 'string' ? cfg.poolKey : ''
    };
   }
  } catch {}
 }
 return { found: false, version: '', dataDir: '', ports: null, poolKey: '' };
}

function resolveAuthAndTarget(headers, bodyEndpoint = '', localInstall = null) {
 const rawChannel = String(headers.get('x-muse-channel') || 'protocol');
 const rawBase = bodyEndpoint || String(headers.get('x-muse-base-url') || '');
 const defaultPort = rawChannel === 'pool' ? (localInstall?.ports?.pool || 18610) : (localInstall?.ports?.protocol || 18611);
 const fallbackBase = rawChannel === 'custom' ? '' : `http://127.0.0.1:${defaultPort}/v1`;
 const v1Base = resolveV1Base(rawBase || fallbackBase);
 if (!v1Base) {
  throw new Error('请填写有效的 Muse 服务接口 URL（例如 http://127.0.0.1:18611/v1 或 http://127.0.0.1:18610/v1）。');
 }
 const userKey = String(headers.get('x-muse-api-key') || '').trim();
 const allowLocalKey = headers.get('x-muse-use-local-key') !== '0';
 let token = userKey;
 if (!token && allowLocalKey && isLoopbackUrl(v1Base) && localInstall?.poolKey) {
  token = localInstall.poolKey;
 }
 return { channel: rawChannel, v1Base, originRoot: v1Base.replace(/\/v\d+$/i, ''), token, isLoopback: isLoopbackUrl(v1Base) };
}

function sanitizeAccountList(rawAccounts) {
 if (!Array.isArray(rawAccounts)) return [];
 return rawAccounts.slice(0, 20).map((a, idx) => ({
  label: String(a?.label || a?.name || a?.email || a?.account || a?.id || `账号 ${idx + 1}`).slice(0, 60),
  status: String(a?.status || (a?.ok === true ? '可用' : a?.ok === false ? '异常' : '待验证')),
  enabled: a?.enabled !== false
 }));
}

function scrubAccountRecord(raw = {}, token = '', protoById = null) {
 const a = raw && typeof raw === 'object' ? raw : {};
 const id = String(a.id || '');
 const proto = protoById && id ? protoById[id] : null;
 return {
  id,
  label: String(a.label || a.name || id || '未命名账号').slice(0, 80),
  enabled: a.enabled !== false,
  ok: typeof a.ok === 'boolean' ? a.ok : null,
  essential_ok: a.essential_ok !== false,
  expires_at: Number.isFinite(Number(a.expires_at)) ? Number(a.expires_at) : null,
  expires_estimated: Boolean(a.expires_estimated),
  cookie_count: Number.isFinite(Number(a.cookie_count)) ? Number(a.cookie_count) : 0,
  use_count: Number.isFinite(Number(a.use_count)) ? Number(a.use_count) : 0,
  last_used: a.last_used || null,
  note: scrubSecret(String(a.note || ''), token, 200),
  duplicate_labels: Array.isArray(a.duplicate_labels) ? a.duplicate_labels.map((s) => String(s)) : [],
  identity_mismatch: Boolean(a.identity_mismatch),
  identity: a.identity && typeof a.identity === 'object' ? {
   name: String(a.identity.name || ''),
   email: String(a.identity.email || ''),
   avatar_url: /^https?:\/\//i.test(String(a.identity.avatar_url || '')) ? String(a.identity.avatar_url) : '',
   vm_id: String(a.identity.vm_id || ''),
   name_source: String(a.identity.name_source || '')
  } : null,
  quota: a.quota && typeof a.quota === 'object' ? {
   found: Boolean(a.quota.found),
   plan: String(a.quota.plan || ''),
   weekly_used_pct: a.quota.weekly_used_pct ?? null,
   extra_left: a.quota.extra_left ?? null,
   checked_at: a.quota.checked_at ?? null
  } : null,
  today: a.today && typeof a.today === 'object' ? a.today : {},
  last_fail_error: a.usage?.last_fail_error ? scrubSecret(String(a.usage.last_fail_error), token, 220) : '',
  old_ok: proto ? Boolean(proto.old_ok) : null,
  new_ok: proto ? Boolean(proto.new_ok) : null,
  proto_reason: proto?.reason ? scrubSecret(String(proto.reason), token, 180) : ''
 };
}

function resolveLocalPoolContext(headers, localInstall = null) {
 const poolPort = Number(localInstall?.ports?.pool || 18610);
 const protocolPort = Number(localInstall?.ports?.protocol || 18611);
 const rawBase = String(headers.get('x-muse-base-url') || '').trim();
 const userKey = String(headers.get('x-muse-api-key') || '').trim();
 const allowLocalKey = headers.get('x-muse-use-local-key') !== '0';

 let poolRoot = `http://127.0.0.1:${poolPort}`;
 if (rawBase && isLoopbackUrl(rawBase)) {
  const cleanRoot = resolveV1Base(rawBase).replace(/\/v\d+$/i, '');
  if (cleanRoot && new URL(cleanRoot).port === String(poolPort)) {
   poolRoot = cleanRoot;
  }
 }
 const protocolRoot = `http://127.0.0.1:${protocolPort}`;
 const token = userKey || (allowLocalKey ? String(localInstall?.poolKey || '') : '');
 return { poolRoot, protocolRoot, token, hasToken: Boolean(token) };
}

async function forwardPoolAdminJson({ targetUrl, method = 'GET', token = '', jsonBody = undefined, timeoutMs = 15000, fetcher = globalThis.fetch }) {
 const headers = {};
 if (token) headers.Authorization = `Bearer ${token}`;
 if (jsonBody !== undefined) headers['Content-Type'] = 'application/json';
 try {
  const up = await fetcher(targetUrl, {
   method,
   headers,
   body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
   signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await up.text();
  const scrubbed = scrubSecret(text, token);
  let parsed = null;
  try {
   parsed = scrubbed ? JSON.parse(scrubbed) : {};
  } catch {
   parsed = { message: scrubbed || `HTTP ${up.status}` };
  }
  if (!up.ok && (up.status === 401 || up.status === 403)) {
   return jsonRes(400, {
    code: 'MUSE_POOL_AUTH_FAILED',
    message: '无法通过本机螺旋池密钥鉴权，请检查 E:\\MuseCanvasData\\install.json 或开启自动密钥选项。'
   });
  }
  return jsonRes(up.status, parsed);
 } catch (err) {
  return jsonRes(502, {
   code: 'MUSE_POOL_UNREACHABLE',
   message: `连接本机 Muse 账号服务失败（${scrubSecret(err.message, token, 220)}）。请确认已启动本地 Muse 引擎（18610 / 18611）。`
  });
 }
}

export async function handleLocalMuseRoute(request, url, { fetcher = globalThis.fetch, bodyBuffer = null, installReader = readLocalMuseInstallInfo } = {}) {
 if (!url.pathname.startsWith('/api/muse/')) return null;

 const localInstall = await installReader();

 if (url.pathname === '/api/muse/probe' && request.method === 'POST') {
  let body = {};
  try {
   body = bodyBuffer?.length ? JSON.parse(bodyBuffer.toString('utf8')) : {};
  } catch {
   body = {};
  }

  let target;
  try {
   const h = new Headers(request.headers);
   if (body.channel) h.set('x-muse-channel', String(body.channel));
   if (body.baseUrl !== undefined) h.set('x-muse-base-url', String(body.baseUrl));
   if (body.useLocalKey !== undefined) h.set('x-muse-use-local-key', body.useLocalKey ? '1' : '0');
   target = resolveAuthAndTarget(h, body.baseUrl, localInstall);
  } catch (err) {
   return jsonRes(400, { code: 'INVALID_MUSE_CONFIG', message: err.message });
  }

  const out = {
   reachable: false,
   channel: target.channel,
   baseUrl: target.v1Base,
   hasLocalInstall: localInstall.found,
   installVersion: localInstall.version,
   dataDir: localInstall.dataDir,
   hasLocalPoolKey: Boolean(localInstall.poolKey),
   poolAdminUrl: `http://127.0.0.1:${localInstall.ports?.pool || 18610}/admin`,
   models: [],
   accountCount: null,
   accountsKnown: false,
   accountSummary: [],
   note: ''
  };

  const authHeaders = {};
  if (target.token) authHeaders.Authorization = `Bearer ${target.token}`;
  if (target.isLoopback) authHeaders['x-mc-platform'] = 'win32-x64';

  // Probe target health, models & pool status in parallel (zero generation calls)
  const healthUrl = target.channel === 'pool' ? `${target.originRoot}/healthz` : `${target.originRoot}/health`;
  const poolPort = localInstall.ports?.pool || 18610;
  const [healthRes, modelsRes, poolRes] = await Promise.allSettled([
   fetcher(healthUrl, { signal: AbortSignal.timeout(4000) }),
   fetcher(`${target.v1Base}/models`, { headers: authHeaders, signal: AbortSignal.timeout(5000) }),
   target.isLoopback && localInstall.poolKey
    ? fetcher(`http://127.0.0.1:${poolPort}/admin/status`, {
       headers: { Authorization: `Bearer ${localInstall.poolKey}` },
       signal: AbortSignal.timeout(4000)
      })
    : Promise.resolve(null)
  ]);

  if (healthRes.status === 'fulfilled' && healthRes.value?.ok) {
   out.reachable = true;
   const hJson = await healthRes.value.json().catch(() => null);
   if (Array.isArray(hJson?.accounts)) {
    out.accountsKnown = true;
    out.accountCount = hJson.accounts.length;
    out.accountSummary = sanitizeAccountList(hJson.accounts);
   }
  }

  if (modelsRes.status === 'fulfilled' && modelsRes.value) {
   const mRes = modelsRes.value;
   if (mRes.ok) {
    out.reachable = true;
    const mJson = await mRes.json().catch(() => ({}));
    if (Array.isArray(mJson?.data)) {
     out.models = mJson.data.map((m) => m.id).filter(Boolean);
    }
   } else if (mRes.status === 401 || mRes.status === 403) {
    return jsonRes(400, {
     code: 'MUSE_AUTH_FAILED',
     message: 'Muse 服务在线，但授权密钥校验未通过，请核对 Pool Key / API Key。'
    });
   }
  }

  if (poolRes.status === 'fulfilled' && poolRes.value?.ok) {
   const pJson = await poolRes.value.json().catch(() => null);
   if (pJson && typeof pJson === 'object') {
    const accs = pJson.accounts || pJson.pool?.accounts;
    if (Array.isArray(accs)) {
     out.accountsKnown = true;
     out.accountCount = accs.length;
     out.accountSummary = sanitizeAccountList(accs);
    } else if (typeof pJson.account_count === 'number') {
     out.accountsKnown = true;
     out.accountCount = pJson.account_count;
    }
   }
  }

  if (!out.reachable) {
   out.note = localInstall.found
    ? `未检测到运行中的本机 Muse 服务（${target.v1Base}）。请先双击「启动镜序2.0与Muse.bat」或桌面的 MuseCanvas。`
    : `未检测到 ${target.v1Base} 响应，请确认服务已启动或接口地址填写正确。`;
  } else if (out.accountsKnown && out.accountCount === 0) {
   out.note = 'Muse 服务已启动且模型列表可读，但当前账号池为 0 个已登录账号——请先点下方按钮打开螺旋池完成本人 Muse 账号登录，再提交生成。';
  } else {
   out.note = `Muse 服务在线（发现 ${out.models.length} 个可用模型）。注意：真实视频生成是否消耗/成功需以你本人登录账号的实际提交结果为准。`;
  }

  return jsonRes(200, out);
 }

 if (url.pathname.startsWith('/api/muse/accounts') || url.pathname === '/api/muse/netcheck' || url.pathname === '/api/muse/records') {
  const ctx = resolveLocalPoolContext(request.headers, localInstall);
  if (url.pathname === '/api/muse/records' && request.method === 'GET') {
   const authHdr = ctx.token ? { Authorization: `Bearer ${ctx.token}` } : {};
   const protoEndpoint = `${ctx.protocolRoot}/v1`;
   const poolEndpoint = `${ctx.poolRoot}/v1`;
   const [protoRes, poolTasksRes] = await Promise.allSettled([
    fetcher(`${ctx.protocolRoot}/api/records`, { headers: authHdr, signal: AbortSignal.timeout(6000) }),
    fetcher(`${ctx.poolRoot}/admin/tasks`, { headers: authHdr, signal: AbortSignal.timeout(6000) })
   ]);
   const merged = [];
   const seenIds = new Set();

   if (protoRes.status === 'fulfilled' && protoRes.value?.ok) {
    const pj = await protoRes.value.json().catch(() => null);
    for (const r of Array.isArray(pj?.records) ? pj.records : []) {
     const file = String(r?.file || '');
     const id = String(r?.task || r?.id || '');
     const isVid = file.endsWith('.mp4') || file.endsWith('.webm') || String(r?.kind || '').includes('text') || String(r?.kind || '').includes('video') || !file.endsWith('.png');
     if (!id || !isVid || seenIds.has(id)) continue;
     seenIds.add(id);
     const done = r?.status === 'succeeded' || r?.status === 'completed';
     const videoUrl = done && file
      ? `/api/muse/media?endpoint=${encodeURIComponent(protoEndpoint)}&path=${encodeURIComponent(`/v1/media/${file}`)}`
      : '';
     merged.push({
      id,
      source: 'protocol',
      endpoint: protoEndpoint,
      useProxy: true,
      model: 'muse-video-协议',
      prompt: String(r?.prompt || ''),
      ts: String(r?.ts || ''),
      elapsedSec: Number(r?.elapsed_s || 0),
      status: done ? 'completed' : r?.status === 'failed' ? 'failed' : 'processing',
      notice: done ? `已完成并保存到本机 (${Math.round(Number(r?.elapsed_s || 0))}s)` : String(r?.error || ''),
      error: r?.status === 'failed' ? String(r?.error || '生成失败') : '',
      videoUrl
     });
    }
   }

   if (poolTasksRes.status === 'fulfilled' && poolTasksRes.value?.ok) {
    const tj = await poolTasksRes.value.json().catch(() => null);
    for (const t of Array.isArray(tj?.tasks) ? tj.tasks : []) {
     const id = String(t?.id || t?.task_id || '');
     if (!id || seenIds.has(id)) continue;
     const isVid = String(t?.kind || t?.type || '').includes('video') || String(t?.model || '').includes('video');
     if (!isVid) continue;
     seenIds.add(id);
     const done = t?.status === 'succeeded' || t?.status === 'completed';
     const rawUrl = String(t?.video_url || t?.result_url || t?.url || '');
     let videoUrl = '';
     if (done) {
      if (rawUrl.startsWith('/v1/')) {
       videoUrl = `/api/muse/media?endpoint=${encodeURIComponent(poolEndpoint)}&path=${encodeURIComponent(rawUrl)}`;
      } else {
       videoUrl = `/api/muse/videos/${encodeURIComponent(id)}/content?endpoint=${encodeURIComponent(poolEndpoint)}`;
      }
     }
     merged.push({
      id,
      source: 'pool',
      endpoint: poolEndpoint,
      useProxy: true,
      model: String(t?.model || 'muse-video'),
      prompt: String(t?.prompt || ''),
      ts: String(t?.created_at || t?.ts || ''),
      elapsedSec: Number(t?.elapsed || 0),
      status: done ? 'completed' : t?.status === 'failed' ? 'failed' : 'processing',
      notice: done ? '已完成并保存到本机螺旋池' : '',
      error: t?.error ? String(t.error) : '',
      videoUrl
     });
    }
   }

   merged.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
   return jsonRes(200, { records: merged });
  }
  if (url.pathname === '/api/muse/netcheck' && request.method === 'GET') {
   try {
    const up = await fetcher(`${ctx.protocolRoot}/api/netcheck${url.search || ''}`, {
     method: 'GET',
     signal: AbortSignal.timeout(35000)
    });
    const text = await up.text();
    const cleaned = scrubSecret(text, ctx.token);
    return new Response(cleaned || '{}', {
     status: up.status,
     headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
   } catch (err) {
    return jsonRes(502, {
     ok: false,
     message: `无法连接新接口网检服务 (${ctx.protocolRoot})：${scrubSecret(err.message, ctx.token, 180)}`
    });
   }
  }

  let parsedBody = {};
  if (bodyBuffer?.length) {
   try { parsedBody = JSON.parse(bodyBuffer.toString('utf8')); } catch { parsedBody = {}; }
  }

  if (url.pathname === '/api/muse/accounts' && request.method === 'GET') {
   const authHdr = ctx.token ? { Authorization: `Bearer ${ctx.token}` } : {};
   let accRes;
   try {
    accRes = await fetcher(`${ctx.poolRoot}/admin/accounts`, { headers: authHdr, signal: AbortSignal.timeout(8000) });
   } catch (err) {
    return jsonRes(502, { code: 'MUSE_POOL_OFFLINE', message: `未连接到本机 Muse 螺旋池 (${ctx.poolRoot})：${scrubSecret(err.message, ctx.token, 180)}` });
   }
   if (accRes.status === 401 || accRes.status === 403) {
    return jsonRes(400, { code: 'MUSE_POOL_AUTH_FAILED', message: '本机螺旋池鉴权未通过，请勾选自动使用 install.json 密钥或填正确 Pool Key。' });
   }
   const accJson = await accRes.json().catch(() => ({}));
   let protoConfigured = false;
   const protoById = {};
   try {
    const pRes = await fetcher(`${ctx.poolRoot}/admin/protocol/status`, { headers: authHdr, signal: AbortSignal.timeout(5000) });
    if (pRes.ok) {
     const pJson = await pRes.json().catch(() => null);
     protoConfigured = Boolean(pJson?.configured);
     for (const item of pJson?.accounts || []) {
      if (item?.id) protoById[String(item.id)] = item;
     }
    }
   } catch {}
   const rawList = Array.isArray(accJson?.accounts) ? accJson.accounts : [];
   return jsonRes(200, {
    accounts: rawList.map((a) => scrubAccountRecord(a, ctx.token, protoById)),
    stats: accJson?.stats || {},
    protocolConfigured: protoConfigured,
    hasLocalPoolKey: Boolean(localInstall.poolKey)
   });
  }

  if (url.pathname === '/api/muse/accounts/import' && request.method === 'POST') {
   const label = String(parsedBody.label || '').trim().slice(0, 80);
   const rawCookie = String(parsedBody.cookie_header || parsedBody.batch || '').trim();
   if (!rawCookie) {
    return jsonRes(400, { code: 'COOKIE_EMPTY', message: '请先粘贴从 muse.ai 浏览器请求标头中复制的 Cookie 字符串。' });
   }
   const lines = rawCookie.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
   const payload = lines.length > 1 ? { batch: lines.join('\n') } : { label, cookie_header: rawCookie };
   return await forwardPoolAdminJson({
    targetUrl: `${ctx.poolRoot}/admin/accounts`,
    method: 'POST',
    token: ctx.token,
    jsonBody: payload,
    timeoutMs: 25000,
    fetcher
   });
  }

  if (url.pathname === '/api/muse/accounts/login-window' && request.method === 'POST') {
   const payload = parsedBody.account_id
    ? { account_id: String(parsedBody.account_id).trim() }
    : { label: String(parsedBody.label || '').trim().slice(0, 80) };
   return await forwardPoolAdminJson({
    targetUrl: `${ctx.poolRoot}/admin/login-window`,
    method: 'POST',
    token: ctx.token,
    jsonBody: payload,
    timeoutMs: 65000,
    fetcher
   });
  }

  const loginSessMatch = url.pathname.match(/^\/api\/muse\/accounts\/login-window\/([^/]+)$/);
  if (loginSessMatch && request.method === 'GET') {
   return await forwardPoolAdminJson({
    targetUrl: `${ctx.poolRoot}/admin/login-window/${loginSessMatch[1]}`,
    method: 'GET',
    token: ctx.token,
    timeoutMs: 12000,
    fetcher
   });
  }

  const accActionMatch = url.pathname.match(/^\/api\/muse\/accounts\/([^/]+)\/(test|keepalive|quota|sync-protocol|cookies)$/);
  if (accActionMatch && request.method === 'POST') {
   const [, accId, act] = accActionMatch;
   if (act === 'sync-protocol') {
    return await forwardPoolAdminJson({
     targetUrl: `${ctx.poolRoot}/admin/protocol/sync`,
     method: 'POST',
     token: ctx.token,
     jsonBody: { account_id: decodeURIComponent(accId) },
     timeoutMs: 25000,
     fetcher
    });
   }
   const extraBody = act === 'cookies' ? { cookie_header: String(parsedBody.cookie_header || '').trim() } : undefined;
   if (act === 'cookies' && !extraBody.cookie_header) {
    return jsonRes(400, { code: 'COOKIE_EMPTY', message: '请提供有效的 Cookie 字符串。' });
   }
   return await forwardPoolAdminJson({
    targetUrl: `${ctx.poolRoot}/admin/accounts/${accId}/${act}`,
    method: 'POST',
    token: ctx.token,
    jsonBody: extraBody,
    timeoutMs: 45000,
    fetcher
   });
  }

  const accItemMatch = url.pathname.match(/^\/api\/muse\/accounts\/([^/]+)$/);
  if (accItemMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
   const accId = accItemMatch[1];
   return await forwardPoolAdminJson({
    targetUrl: `${ctx.poolRoot}/admin/accounts/${accId}`,
    method: request.method,
    token: ctx.token,
    jsonBody: request.method === 'PATCH' ? parsedBody : undefined,
    timeoutMs: 15000,
    fetcher
   });
  }

  return jsonRes(404, { code: 'MUSE_ACCOUNT_ROUTE_NOT_FOUND', message: 'Unknown Muse account management endpoint.' });
 }

 let target;
 try {
  const endpointParam = url.searchParams.get('endpoint') || '';
  target = resolveAuthAndTarget(request.headers, endpointParam, localInstall);
 } catch (err) {
  return jsonRes(400, { code: 'INVALID_MUSE_TARGET', message: err.message });
 }

 const outboundHeaders = {};
 if (target.token) outboundHeaders.Authorization = `Bearer ${target.token}`;
 if (target.isLoopback) outboundHeaders['x-mc-platform'] = 'win32-x64';
 const cancelHdr = request.headers.get('x-task-cancel-key');
 if (cancelHdr) outboundHeaders['X-Task-Cancel-Key'] = cancelHdr;

 if (url.pathname === '/api/muse/videos' && request.method === 'POST') {
  const incomingCt = request.headers.get('content-type');
  if (incomingCt) outboundHeaders['Content-Type'] = incomingCt;
  try {
   const up = await fetcher(`${target.v1Base}/videos`, {
    method: 'POST',
    headers: outboundHeaders,
    body: bodyBuffer || Buffer.alloc(0),
    signal: AbortSignal.timeout(120000)
   });
   const text = await up.text();
   return new Response(scrubSecret(text, target.token), {
    status: up.status,
    headers: { 'Content-Type': up.headers.get('content-type') || 'application/json; charset=utf-8' }
   });
  } catch (err) {
   return jsonRes(502, { code: 'MUSE_UPSTREAM_DOWN', message: `连接 Muse 视频接口失败：${scrubSecret(err.message, target.token)}` });
  }
 }

 const vidStatusMatch = url.pathname.match(/^\/api\/muse\/videos\/([^/]+)$/);
 if (vidStatusMatch && request.method === 'GET') {
  try {
   const up = await fetcher(`${target.v1Base}/videos/${vidStatusMatch[1]}`, {
    method: 'GET',
    headers: outboundHeaders,
    signal: AbortSignal.timeout(30000)
   });
   const text = await up.text();
   return new Response(scrubSecret(text, target.token), {
    status: up.status,
    headers: { 'Content-Type': up.headers.get('content-type') || 'application/json; charset=utf-8' }
   });
  } catch (err) {
   return jsonRes(502, { code: 'MUSE_POLL_ERR', message: `轮询 Muse 视频状态失败：${scrubSecret(err.message, target.token)}` });
  }
 }

 const contentMatch = url.pathname.match(/^\/api\/muse\/videos\/([^/]+)\/content$/);
 if (contentMatch && (request.method === 'GET' || request.method === 'HEAD')) {
  try {
   const rangeHdr = request.headers.get('range');
   const hdrsReq = { ...outboundHeaders };
   if (rangeHdr) hdrsReq.Range = rangeHdr;
   const up = await fetcher(`${target.v1Base}/videos/${contentMatch[1]}/content`, {
    method: 'GET',
    headers: hdrsReq,
    signal: AbortSignal.timeout(120000)
   });
   if (!up.ok) {
    return jsonRes(up.status, { code: 'MEDIA_ERR', message: `获取生成视频失败（HTTP ${up.status}）` });
   }
   const hdrs = {
    'Content-Type': up.headers.get('content-type') || 'video/mp4',
    'Cache-Control': 'no-store'
   };
   for (const k of ['content-length', 'content-range', 'accept-ranges']) {
    const v = up.headers.get(k);
    if (v) hdrs[k] = v;
   }
   return new Response(request.method === 'HEAD' ? null : up.body, { status: up.status, headers: hdrs });
  } catch (err) {
   return jsonRes(502, { code: 'MEDIA_STREAM_ERR', message: scrubSecret(err.message, target.token, 500) });
  }
 }

 if (url.pathname === '/api/muse/media' && (request.method === 'GET' || request.method === 'HEAD')) {
  const relPath = String(url.searchParams.get('path') || '');
  if (!relPath.startsWith('/v1/') || relPath.includes('..')) {
   return jsonRes(400, { code: 'INVALID_MEDIA_PATH', message: '非法的本地媒体路径。' });
  }
  try {
   const rangeHdr = request.headers.get('range');
   const hdrsReq = { ...outboundHeaders };
   if (rangeHdr) hdrsReq.Range = rangeHdr;
   const up = await fetcher(`${target.originRoot}${relPath}`, {
    method: 'GET',
    headers: hdrsReq,
    signal: AbortSignal.timeout(120000)
   });
   if (!up.ok) {
    return jsonRes(up.status, { code: 'MEDIA_NOT_READY', message: `媒体读取返回 HTTP ${up.status}` });
   }
   const hdrs = {
    'Content-Type': up.headers.get('content-type') || 'video/mp4',
    'Cache-Control': 'no-store'
   };
   for (const k of ['content-length', 'content-range', 'accept-ranges']) {
    const v = up.headers.get(k);
    if (v) hdrs[k] = v;
   }
   return new Response(request.method === 'HEAD' ? null : up.body, { status: up.status, headers: hdrs });
  } catch (err) {
   return jsonRes(502, { code: 'MEDIA_PROXY_ERR', message: scrubSecret(err.message, target.token, 500) });
  }
 }

 if (url.pathname === '/api/muse/cancel' && request.method === 'POST') {
  try {
   const up = await fetcher(`${target.v1Base}/tasks/cancel`, {
    method: 'POST',
    headers: { ...outboundHeaders, 'Content-Type': 'application/json' },
    body: bodyBuffer || Buffer.from('{}'),
    signal: AbortSignal.timeout(8000)
   });
   const text = await up.text();
   return new Response(text || '{}', { status: up.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  } catch {
   return jsonRes(502, { ok: false, message: '无法通知 Muse 服务取消任务。' });
  }
 }

 const recMatch = url.pathname.match(/^\/api\/muse\/recover\/([^/]+)$/);
 if (recMatch && request.method === 'POST') {
  try {
   const up = await fetcher(`${target.v1Base}/videos/${recMatch[1]}/recover`, {
    method: 'POST',
    headers: { ...outboundHeaders, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(30000)
   });
   const text = await up.text();
   return new Response(text || '{}', { status: up.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  } catch {
   return jsonRes(502, { ok: false, message: '取回任务状态失败。' });
  }
 }

 return jsonRes(404, { code: 'MUSE_ROUTE_NOT_FOUND', message: 'Unknown Muse proxy endpoint.' });
}
