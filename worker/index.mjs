export default {
 async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') {
   return Response.json({
    ok: true,
    app: 'ai-video-prompt-editor',
    version: '2.0.0',
    mode: 'manual-first-nle'
   });
  }
  if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
   return env.ASSETS.fetch(request);
  }
  return new Response('Static assets binding missing.', { status: 500 });
 }
};
