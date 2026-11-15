import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4174);

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
  if (url.pathname === '/api/health') {
   res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
   res.end(JSON.stringify({ ok: true, app: 'ai-video-prompt-editor', version: '2.0.0', mode: 'manual-first-nle' }));
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
