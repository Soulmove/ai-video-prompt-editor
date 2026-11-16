const DEFAULT_MODEL = 'gemini-4-hydrogen';

function jsonRes(status, data) {
 return Response.json(data, { status });
}

function scrubSecret(text = '', key = '') {
 let s = String(text || '');
 if (key) s = s.split(key).join('[已隐藏]');
 return s.replace(/(?:AIza|AQ\.)[A-Za-z0-9_.+/=:-]+/g, '[已隐藏]').slice(0, 500);
}

function cleanModelId(raw, fallback = DEFAULT_MODEL) {
 const model = String(raw || fallback || DEFAULT_MODEL).trim().replace(/^models\//, '');
 if (!/^[a-z0-9][a-z0-9.-]{1,100}$/i.test(model)) {
  throw new Error(`请填写有效的 Google 模型 ID，例如 ${DEFAULT_MODEL}。`);
 }
 return model;
}

function cleanKey(raw, envKey = '') {
 const candidate = typeof raw === 'string' && raw.trim() ? raw.trim() : String(envKey || '').trim();
 if (!candidate) throw new Error('请填写 Google API Key（或在服务端配置 GEMINI_API_KEY）。');
 const stripped = candidate.replace(/^(?:x-goog-api-key\s*:\s*|Bearer\s+)/i, '').trim();
 if (stripped.length < 8 || stripped.length > 8192 || /\s/.test(stripped)) {
  throw new Error('Google API Key 格式不正确，请检查是否包含多余空格或换行。');
 }
 return stripped;
}

async function googleErrorResponse(res, key) {
 let diagnostic = '';
 let reasons = [];
 try {
  const data = await res.json();
  diagnostic = typeof data?.error?.message === 'string' ? data.error.message : '';
  reasons = (data?.error?.details || []).map((x) => x.reason).filter(Boolean);
 } catch {}
 const code = res.status;
 if (reasons.includes('API_KEY_INVALID') || code === 401) {
  return jsonRes(400, { code: 'PERSONAL_KEY_REJECTED', message: 'Google 未接受此 API Key，请核对密钥是否正确或已过期。' });
 }
 if (code === 403) {
  return jsonRes(400, { code: 'PROVIDER_PERMISSION', message: 'Google 拒绝访问：请检查密钥权限与计费状态。' });
 }
 if (code === 404) {
  return jsonRes(400, { code: 'MODEL_NOT_FOUND', message: 'Google 未找到该模型或当前项目尚未获得访问权限。' });
 }
 if (code === 429) {
  return jsonRes(429, { code: 'PROVIDER_QUOTA', message: 'Google API 配额或请求速率受限，请稍后重试。' });
 }
 return jsonRes(code >= 400 && code < 500 ? 400 : 502, {
  code: 'PROVIDER_ERROR',
  message: `Google 服务未完成请求（HTTP ${code}）${diagnostic ? `：${scrubSecret(diagnostic, key)}` : ''}`
 });
}

export async function handleApiRoute(request, env = {}) {
 const url = new URL(request.url);
 const defaultModel = cleanModelId(env.GEMINI_MODEL || DEFAULT_MODEL, DEFAULT_MODEL);

 if (url.pathname === '/api/health') {
  return jsonRes(200, {
   ok: true,
   app: 'ai-video-prompt-editor',
   version: '2.0.0',
   mode: 'manual-first-nle',
   defaultModel,
   thinkingLevel: 'high'
  });
 }

 if (url.pathname === '/api/config' && request.method === 'GET') {
  return jsonRes(200, {
   ai: {
    ready: Boolean(env.GEMINI_API_KEY),
    provider: 'google',
    model: defaultModel,
    thinkingLevel: 'high',
    reason: env.GEMINI_API_KEY ? '服务端已配置 Google API Key，亦可填入个人 Key 覆盖' : '可在前端填写个人 Google API Key（支持浏览器直连或本地服务端转发）'
   }
  });
 }

 if (url.pathname === '/api/ai/connection' && request.method === 'POST') {
  let body = {};
  try {
   body = await request.json();
  } catch {
   body = {};
  }
  let key;
  let model;
  try {
   key = cleanKey(request.headers.get('x-jingxu-api-key'), env.GEMINI_API_KEY);
   model = cleanModelId(body.model || body.connection?.model || defaultModel, defaultModel);
  } catch (err) {
   return jsonRes(400, { code: 'INVALID_PARAMS', message: err.message });
  }
  try {
   const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
    method: 'GET',
    headers: { 'x-goog-api-key': key },
    redirect: 'manual'
   });
   if (!upstream.ok) return await googleErrorResponse(upstream, key);
   const info = await upstream.json();
   return jsonRes(200, {
    verified: true,
    provider: 'google',
    model,
    displayName: info?.displayName || model
   });
  } catch {
   return jsonRes(502, { code: 'UPSTREAM_NETWORK', message: '服务端暂无法连接 Google Gemini API，请检查网络代理配置。' });
  }
 }

 if (url.pathname === '/api/ai/plan' && request.method === 'POST') {
  let body;
  try {
   body = await request.json();
  } catch {
   return jsonRes(400, { code: 'INVALID_BODY', message: '请求体必须为合法 JSON。' });
  }
  let key;
  let model;
  try {
   key = cleanKey(request.headers.get('x-jingxu-api-key'), env.GEMINI_API_KEY);
   model = cleanModelId(body?.model || defaultModel, defaultModel);
  } catch (err) {
   return jsonRes(400, { code: 'INVALID_PARAMS', message: err.message });
  }

  const reqPayload = body?.requestBody && typeof body.requestBody === 'object' ? body.requestBody : null;
  if (!reqPayload) {
   return jsonRes(400, { code: 'MISSING_PAYLOAD', message: '缺少生成请求参数 requestBody。' });
  }
  reqPayload.generationConfig = reqPayload.generationConfig || {};
  reqPayload.generationConfig.thinkingConfig = {
   thinkingLevel: reqPayload.generationConfig.thinkingConfig?.thinkingLevel || 'high',
   includeThoughts: true
  };

  try {
   const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: {
     'Content-Type': 'application/json',
     'x-goog-api-key': key
    },
    body: JSON.stringify(reqPayload),
    redirect: 'manual'
   });
   if (!upstream.ok) return await googleErrorResponse(upstream, key);
   return new Response(upstream.body, {
    status: 200,
    headers: {
     'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
     'Cache-Control': 'no-cache'
    }
   });
  } catch {
   return jsonRes(502, { code: 'UPSTREAM_NETWORK', message: '服务端转发 Google Gemini 生成请求时网络连接中断。' });
  }
 }

 return null;
}

export default {
 async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
   const apiRes = await handleApiRoute(request, env);
   if (apiRes) return apiRes;
   return jsonRes(404, { code: 'NOT_FOUND', message: 'API route not found.' });
  }
  if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
   return env.ASSETS.fetch(request);
  }
  return new Response('Static assets binding missing.', { status: 500 });
 }
};
