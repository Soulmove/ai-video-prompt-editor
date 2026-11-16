import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiRoute } from './worker/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4174);
const MAX_API_BYTES = 2 * 1024 * 1024;

const MIME_TYPES = {
 '.html': 'text/html; charset=utf-8',
 '.mjs': 'application/javascript; charset=utf-8',
 '.js': 'application/javascript; charset=utf-8',
 '.css': 'text/css; charset=utf-8',
 '.svg': 'image/svg+xml',
 '.json': 'application/json; charset=utf-8',
 '.png': 'image/png',
 '.jpg': 'image/jpeg',
 '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
 try {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (url.pathname.startsWith('/api/')) {
   let size = 0;
   const chunks = [];
   for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_API_BYTES) {
     res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
     res.end(JSON.stringify({ code: 'PAYLOAD_TOO_LARGE', message: '请求体积超出限制。' }));
     return;
    }
    chunks.push(chunk);
   }
   const headers = new Headers();
   for (const [key, val] of Object.entries(req.headers)) {
    if (val !== undefined) headers.set(key, Array.isArray(val) ? val.join(',') : val);
   }
   const webReq = new Request(url.toString(), {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)
   });
   const apiRes = await handleApiRoute(webReq, {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-4-hydrogen'
   });
   if (!apiRes) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: 'NOT_FOUND', message: 'API route not found.' }));
    return;
   }
   const outHeaders = {};
   apiRes.headers.forEach((v, k) => { outHeaders[k] = v; });
   res.writeHead(apiRes.status, outHeaders);
   if (apiRes.body && (outHeaders['content-type'] || '').includes('text/event-stream')) {
    const reader = apiRes.body.getReader();
    try {
     while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
     }
    } finally {
     reader.releaseLock();
     res.end();
    }
    return;
   }
   res.end(Buffer.from(await apiRes.arrayBuffer()));
   return;
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const normalized = path.posix.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  let target = path.join(DIST_DIR, normalized);

  if (!target.startsWith(DIST_DIR)) {
   res.writeHead(403);
   res.end('Forbidden');
   return;
  }

  let stat;
  try {
   stat = await fs.stat(target);
  } catch {
   stat = null;
  }

  if (!stat || !stat.isFile()) {
   target = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(target).toLowerCase();
  const data = await fs.readFile(target);
  res.writeHead(200, {
   'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
   'Cache-Control': 'no-cache'
  });
  res.end(data);
 } catch (err) {
  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Server error: ${err.message}`);
 }
});

server.listen(PORT, HOST, () => {
 console.log(`Jingxu 2.0 NLE Prompt Editor listening on http://${HOST}:${PORT}`);
});
