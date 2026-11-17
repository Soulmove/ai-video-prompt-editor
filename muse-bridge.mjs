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
  label: String(a?.name || a?.email || a?.account || a?.id || `账号 ${idx + 1}`).slice(0, 60),
  status: String(a?.status || (a?.logged_in ? '已登录' : '待验证')),
  enabled: a?.enabled !== false
 }));
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

  // Probe target health & models non-destructively (zero generation calls)
  const healthUrl = target.channel === 'pool' ? `${target.originRoot}/healthz` : `${target.originRoot}/health`;
  try {
   const hRes = await fetcher(healthUrl, { signal: AbortSignal.timeout(4000) });
   if (hRes.ok) {
    out.reachable = true;
    const hJson = await hRes.json().catch(() => null);
    if (Array.isArray(hJson?.accounts)) {
     out.accountsKnown = true;
     out.accountCount = hJson.accounts.length;
     out.accountSummary = sanitizeAccountList(hJson.accounts);
    }
   }
  } catch {}

  try {
   const mRes = await fetcher(`${target.v1Base}/models`, { headers: authHeaders, signal: AbortSignal.timeout(5000) });
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
  } catch {}

  // Check read-only spiral pool account summary if on localhost
  if (target.isLoopback && localInstall.poolKey) {
   const poolPort = localInstall.ports?.pool || 18610;
   try {
    const pRes = await fetcher(`http://127.0.0.1:${poolPort}/admin/status`, {
     headers: { Authorization: `Bearer ${localInstall.poolKey}` },
     signal: AbortSignal.timeout(3000)
    });
    if (pRes.ok) {
     const pJson = await pRes.json().catch(() => null);
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
   } catch {}
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
 if (contentMatch && request.method === 'GET') {
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
   return new Response(up.body, { status: up.status, headers: hdrs });
  } catch (err) {
   return jsonRes(502, { code: 'MEDIA_STREAM_ERR', message: scrubSecret(err.message, target.token, 500) });
  }
 }

 if (url.pathname === '/api/muse/media' && request.method === 'GET') {
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
   return new Response(up.body, { status: up.status, headers: hdrs });
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
